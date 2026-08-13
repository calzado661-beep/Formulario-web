import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyScoringRules, calculatePoints } from "./src/lib/scoring.js";
import {
  gmailConfiguration,
  localDateTimeParts,
  normalizeRecipients,
  normalizeReportSubject,
  normalizeReportTime,
  readActiveAttendanceWorkers,
  readAttendanceReportConfig,
  readAttendanceReportConfigs,
  readAttendanceReportHistory,
  REPORT_TIME_ZONE,
  sendAttendanceReport
} from "./services/attendance_report.mjs";
import {
  readActiveActivityWorkers,
  readActivityCompliance,
  readActivityReportConfig,
  readActivityReportConfigs,
  readActivityReportHistory,
  sendActivityReport
} from "./services/activity_report.mjs";

const moduleUrl = import.meta.url;
const modulePath = moduleUrl ? fileURLToPath(moduleUrl) : "";
const __dirname = modulePath ? path.dirname(modulePath) : process.cwd();

function readEnv() {
  const envPath = path.join(__dirname, ".env");
  const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const env = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const name = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[name] = value;
  }

  return { ...process.env, ...env };
}

const env = readEnv();
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const sessionSecret = env.API_SESSION_SECRET || env.SUPABASE_SECRET_KEY;
const port = Number(env.API_PORT || 5180);
const distDir = path.join(__dirname, "dist");
const MAX_SCORE_QUANTITY = 99_999_999.99;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env para el backend local.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function sendJson(response, status, payload) {
  response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type"
    });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Solicitud demasiado grande."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function issueSessionToken(user) {
  if (!sessionSecret) return null;
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, rol: normalizeRole(user.rol), exp: Date.now() + 8 * 60 * 60 * 1000 })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(request) {
  if (!sessionSecret) return null;
  const authorization = String(request.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp) > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function requireAdministrator(request, response) {
  if (!env.SUPABASE_SECRET_KEY) {
    sendJson(response, 503, { error: "El backend necesita SUPABASE_SECRET_KEY para administrar usuarios." });
    return false;
  }
  const session = readSession(request);
  if (!session || normalizeRole(session.rol) !== "administrador") {
    sendJson(response, 401, { error: "La sesion de administrador no es valida. Cierra sesion e ingresa nuevamente." });
    return false;
  }
  return true;
}

function requireSessionRole(request, response, allowedRoles) {
  const session = readSession(request);
  if (!session || !allowedRoles.includes(normalizeRole(session.rol))) {
    sendJson(response, 403, { error: "Tu sesión no tiene permiso para realizar esta operación." });
    return null;
  }
  return session;
}

async function handleLogin(request, response) {
  try {
    const rawBody = await readBody(request);
    const body = JSON.parse(rawBody || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      sendJson(response, 400, { error: "Completa usuario y contrasena." });
      return;
    }

    const result = await supabase
      .from("usuarios")
      .select("id,nombre,email,rol,activo,created_at,fecha_cumpleanos,sueldo")
      .eq("email", email)
      .eq("password_hash", password)
      .limit(1);

    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    if (!result.data?.length) {
      sendJson(response, 401, { error: "Credenciales invalidas o usuario no existe." });
      return;
    }

    const user = result.data[0];
    if (!isActive(user.activo)) {
      sendJson(response, 423, {
        code: "ACCOUNT_BLOCKED",
        error: "Cuenta bloqueada. Tu usuario está inactivo y no puede ingresar. Contacta al administrador."
      });
      return;
    }
    sendJson(response, 200, { user, sessionToken: issueSessionToken(user) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo iniciar sesion." });
  }
}

function normalizeRole(role) {
  const value = String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return value === "trabajador" ? "operante" : value;
}

function normalizeTaskName(value) {
  return normalizeRole(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isEtiquetadoTask(task) {
  return normalizeTaskName(taskTitle(task)) === "etiquetado";
}

function isGuideBreakdownTask(task) {
  return new Set([
    "revision de guia devolucion",
    "revision de guia despacho",
    "embalado y rotulado de guia"
  ]).has(normalizeTaskName(taskTitle(task)));
}

function isActive(value) {
  return !["false", "0", "no"].includes(String(value ?? true).trim().toLowerCase());
}

function taskTitle(task) {
  return String(task?.nombre || task?.titulo || "");
}

function taskUsesStore(task) {
  const title = normalizeRole(taskTitle(task));
  const storeTaskNames = [
    "pedido mayorista",
    "visita de tienda",
    "picking",
    "apoyo tienda",
    "apoyo a tienda"
  ];
  return title.startsWith("revision de guia") ||
    storeTaskNames.some((taskName) => title === taskName || title.startsWith(`${taskName} `));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function isPrimaryKeySequenceConflict(error) {
  return error?.code === "23505" && /Key \(id\)|_pkey/i.test(`${error?.details || ""} ${error?.message || ""}`);
}

function missingSchemaColumn(error) {
  return /Could not find the '([^']+)' column/i.exec(String(error?.message || ""))?.[1] || null;
}

async function nextTableId(tableName) {
  const result = await supabase.from(tableName).select("id").order("id", { ascending: false }).limit(1);
  if (result.error) throw result.error;
  return Number(result.data?.[0]?.id || 0) + 1;
}

async function insertCompatibleActivityRow(payload) {
  const candidate = { ...payload };
  let needsExplicitId = false;
  let result;
  for (let attempt = 0; attempt <= Object.keys(payload).length + 1; attempt += 1) {
    const row = needsExplicitId
      ? { ...candidate, id: await nextTableId("registros_tareas") }
      : candidate;
    result = await supabase.from("registros_tareas").insert(row).select("*").single();
    if (!result.error) return result;
    if (!needsExplicitId && isPrimaryKeySequenceConflict(result.error)) {
      needsExplicitId = true;
      continue;
    }
    const missingColumn = missingSchemaColumn(result.error);
    if (!missingColumn || !(missingColumn in candidate)) return result;
    delete candidate[missingColumn];
  }
  return result;
}

let taskTableName;

async function getTaskTableName() {
  if (taskTableName) return taskTableName;
  for (const candidate of ["tarea", "tareas"]) {
    const result = await supabase.from(candidate).select("id").limit(1);
    if (!result.error) {
      taskTableName = candidate;
      return candidate;
    }
  }
  throw new Error("No se encontro la tabla public.tarea ni public.tareas.");
}

function normalizeActivityLog(row) {
  const normalized = { ...row };
  if ("usuario_id" in normalized && !("trabajador_id" in normalized)) {
    normalized.trabajador_id = normalized.usuario_id;
  }
  if ("observacion" in normalized && !("detalle" in normalized)) {
    normalized.detalle = normalized.observacion;
  }
  if ("dato_extra" in normalized && normalized.dato_extra !== null && String(normalized.dato_extra).trim() !== "") {
    const parsed = Number(normalized.dato_extra);
    if (Number.isNaN(parsed)) normalized.lote = normalized.lote || normalized.dato_extra;
    else if (normalized.tiempo_minutos === null || normalized.tiempo_minutos === undefined) normalized.tiempo_minutos = parsed;
  }
  if ("tarea" in normalized && !("actividad_nombre" in normalized)) {
    normalized.actividad_nombre = normalized.tarea;
  }
  return normalized;
}

function taskPayloadForDb(body, tableName) {
  const taskName = body.nombre ?? body.titulo;
  const unit = body.unidad_medida ?? body.unidad_base;
  const automaticFields = {
    requiere_marca: normalizeTaskName(taskName) === "etiquetado",
    requiere_lote: normalizeTaskName(taskName) === "etiquetado",
    requiere_numero_guia: isGuideBreakdownTask({ nombre: taskName })
  };
  const payload = tableName === "tarea"
    ? {
        nombre: taskName,
        activo: body.activo,
        unidad_medida: unit,
        tipo_tarea: body.tipo_tarea,
        requiere_marca: automaticFields.requiere_marca,
        requiere_tiempo: body.requiere_tiempo,
        requiere_lote: automaticFields.requiere_lote,
        requiere_numero_guia: automaticFields.requiere_numero_guia
      }
    : {
        nombre: taskName,
        tipo_medicion: body.tipo_medicion,
        activo: body.activo,
        requiere_dato_extra: body.requiere_dato_extra,
        nombre_dato_extra: body.nombre_dato_extra,
        puntaje_fijo: body.puntaje_fijo,
        puntos_turno_simple: body.puntos_turno_simple ?? body.puntaje_turno_simple,
        puntos_turno_completo: body.puntos_turno_completo ?? body.puntaje_turno_completo,
        tipo_tarea: body.tipo_tarea,
        requiere_marca: automaticFields.requiere_marca
      };

  if (payload.activo === undefined && body.estado !== undefined) {
    payload.activo = !["inactivo", "cerrado", "false", "0", "no"].includes(
      String(body.estado).trim().toLowerCase()
    );
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  );
}

async function selectUsers() {
  const [usersResult, movementsResult] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id,nombre,email,rol,activo,created_at,fecha_cumpleanos,sueldo")
      .order("id", { ascending: true }),
    supabase
      .from("movimientos_personal")
      .select("id,usuario_id,tipo_movimiento,fecha_movimiento,motivo,created_at")
      .order("fecha_movimiento", { ascending: true })
      .order("id", { ascending: true })
  ]);
  if (usersResult.error) throw usersResult.error;
  if (movementsResult.error) throw movementsResult.error;

  const movementByUser = new Map();
  for (const movement of movementsResult.data || []) {
    const userId = Number(movement.usuario_id);
    const summary = movementByUser.get(userId) || { ingreso: null, salida: null };
    const type = normalizeRole(movement.tipo_movimiento);
    if (type === "ingreso") summary.ingreso = movement;
    if (type === "salida") summary.salida = movement;
    movementByUser.set(userId, summary);
  }

  return (usersResult.data || []).map((user) => {
    const summary = movementByUser.get(Number(user.id)) || {};
    const ingreso = summary.ingreso?.fecha_movimiento || null;
    const salida = summary.salida?.fecha_movimiento || null;
    const salidaValida = Boolean(ingreso && salida && salida >= ingreso);
    return {
      ...user,
      fecha_ingreso: ingreso,
      fecha_salida: salidaValida ? salida : null,
      motivo_salida: salidaValida ? (summary.salida?.motivo || null) : null
    };
  });
}

function validateEmploymentDates(body) {
  const hasFields = body.fecha_ingreso !== undefined || body.fecha_salida !== undefined;
  if (!hasFields) return null;
  const ingreso = String(body.fecha_ingreso || "").trim();
  const salida = String(body.fecha_salida || "").trim();
  const motivo = String(body.motivo_salida || "").trim();
  if (salida && !ingreso) throw new Error("La fecha de ingreso es obligatoria si registras una salida.");
  if (ingreso && !/^\d{4}-\d{2}-\d{2}$/.test(ingreso)) throw new Error("La fecha de ingreso no es valida.");
  if (salida && !/^\d{4}-\d{2}-\d{2}$/.test(salida)) throw new Error("La fecha de salida no es valida.");
  if (ingreso && salida && salida < ingreso) throw new Error("La fecha de salida no puede ser anterior a la fecha de ingreso.");
  if (salida && !motivo) throw new Error("El motivo de salida es obligatorio si registras una fecha de salida.");
  if (motivo.length > 500) throw new Error("El motivo de salida no puede superar 500 caracteres.");
  return { ingreso, salida, motivo: salida ? motivo : "" };
}

async function insertPersonnelMovement(payload) {
  let result = await supabase.from("movimientos_personal").insert(payload).select("*").single();
  if (isPrimaryKeySequenceConflict(result.error)) {
    result = await supabase
      .from("movimientos_personal")
      .insert({ ...payload, id: await nextTableId("movimientos_personal") })
      .select("*")
      .single();
  }
  if (result.error) throw result.error;
  return result.data;
}

async function saveEmploymentDates(userId, dates) {
  if (!dates || !dates.ingreso) return;
  const currentResult = await supabase
    .from("movimientos_personal")
    .select("id,tipo_movimiento,fecha_movimiento")
    .eq("usuario_id", userId)
    .order("fecha_movimiento", { ascending: false })
    .order("id", { ascending: false });
  if (currentResult.error) throw currentResult.error;

  const movements = currentResult.data || [];
  const latestIngreso = movements.find((item) => normalizeRole(item.tipo_movimiento) === "ingreso");
  const latestSalida = movements.find((item) => normalizeRole(item.tipo_movimiento) === "salida");
  const wasClosed = Boolean(
    latestIngreso && latestSalida && latestSalida.fecha_movimiento >= latestIngreso.fecha_movimiento
  );

  let ingresoMovement;
  if (latestIngreso && wasClosed && dates.ingreso > latestSalida.fecha_movimiento) {
    ingresoMovement = await insertPersonnelMovement({
      usuario_id: userId,
      tipo_movimiento: "Ingreso",
      fecha_movimiento: dates.ingreso
    });
  } else if (latestIngreso) {
    const updated = await supabase
      .from("movimientos_personal")
      .update({ fecha_movimiento: dates.ingreso })
      .eq("id", latestIngreso.id)
      .select("*")
      .single();
    if (updated.error) throw updated.error;
    ingresoMovement = updated.data;
  } else {
    ingresoMovement = await insertPersonnelMovement({
      usuario_id: userId,
      tipo_movimiento: "Ingreso",
      fecha_movimiento: dates.ingreso
    });
  }

  if (dates.salida) {
    const exitBelongsToCurrentPeriod = latestSalida && latestSalida.fecha_movimiento >= ingresoMovement.fecha_movimiento;
    if (exitBelongsToCurrentPeriod) {
      const updated = await supabase
        .from("movimientos_personal")
        .update({ fecha_movimiento: dates.salida, motivo: dates.motivo || null })
        .eq("id", latestSalida.id);
      if (updated.error) throw updated.error;
    } else {
      await insertPersonnelMovement({
        usuario_id: userId,
        tipo_movimiento: "Salida",
        fecha_movimiento: dates.salida,
        motivo: dates.motivo || null
      });
    }
  } else if (
    latestSalida &&
    latestIngreso &&
    Number(ingresoMovement.id) === Number(latestIngreso.id) &&
    latestSalida.fecha_movimiento >= latestIngreso.fecha_movimiento
  ) {
    const removed = await supabase.from("movimientos_personal").delete().eq("id", latestSalida.id);
    if (removed.error) throw removed.error;
  }
}

function userPayloadForDb(body, { creating = false } = {}) {
  let sueldo;
  if (body.sueldo !== undefined) {
    sueldo = Number(body.sueldo);
    if (!Number.isFinite(sueldo) || sueldo < 0 || sueldo > 9999999999.99) {
      throw new Error("El sueldo debe ser un monto valido mayor o igual a cero.");
    }
    sueldo = Math.round((sueldo + Number.EPSILON) * 100) / 100;
  }

  const payload = {
    nombre: body.nombre === undefined ? undefined : String(body.nombre).trim(),
    email: body.email === undefined ? undefined : String(body.email).trim().toLowerCase(),
    rol: body.rol === undefined ? undefined : normalizeRole(body.rol),
    activo: body.activo,
    fecha_cumpleanos:
      body.fecha_cumpleanos === undefined ? undefined : body.fecha_cumpleanos || null,
    sueldo,
    password_hash: body.password_hash === undefined ? undefined : String(body.password_hash)
  };

  if (creating && (!payload.nombre || !payload.email || !payload.password_hash)) {
    throw new Error("Nombre, usuario y contrasena son obligatorios.");
  }

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function userMutationError(response, error, fallback) {
  if (error?.code === "23505") {
    sendJson(response, 409, { error: "Ya existe una cuenta con ese usuario o correo." });
    return;
  }
  if (error?.code === "23514") {
    sendJson(response, 400, { error: "El rol seleccionado no esta permitido por la base de datos." });
    return;
  }
  sendJson(response, 500, { error: error?.message || fallback });
}

async function handleCreateUser(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = userPayloadForDb(body, { creating: true });
    let result = await supabase.from("usuarios").insert(payload).select("*").single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from("usuarios")
        .insert({ ...payload, id: await nextTableId("usuarios") })
        .select("*")
        .single();
    }
    if (result.error) {
      userMutationError(response, result.error, "No se pudo crear el usuario.");
      return;
    }
    const { password_hash: _passwordHash, password: _password, ...user } = result.data;
    sendJson(response, 201, { user });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 400;
    sendJson(response, status, { error: error.message || "No se pudo crear el usuario." });
  }
}

async function handleUpdateUser(request, response, userId) {
  try {
    if (!requireAdministrator(request, response)) return;
    if (!Number.isInteger(userId) || userId <= 0) {
      sendJson(response, 400, { error: "Usuario invalido." });
      return;
    }
    const body = JSON.parse((await readBody(request)) || "{}");
    const employmentDates = validateEmploymentDates(body);
    const payload = userPayloadForDb(body);
    if (employmentDates?.ingreso) payload.activo = !employmentDates.salida;
    if (!Object.keys(payload).length) {
      sendJson(response, 400, { error: "No hay cambios para guardar." });
      return;
    }
    const result = await supabase.from("usuarios").update(payload).eq("id", userId).select("*").maybeSingle();
    if (result.error) {
      userMutationError(response, result.error, "No se pudo actualizar el usuario.");
      return;
    }
    if (!result.data) {
      sendJson(response, 404, { error: "Usuario no encontrado." });
      return;
    }
    await saveEmploymentDates(userId, employmentDates);
    const { password_hash: _passwordHash, password: _password, ...user } = result.data;
    const refreshedUsers = await selectUsers();
    sendJson(response, 200, { user: refreshedUsers.find((item) => Number(item.id) === userId) || user });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "No se pudo actualizar el usuario." });
  }
}

async function handleDeleteUser(_request, response, userId) {
  try {
    if (!requireAdministrator(_request, response)) return;
    if (!Number.isInteger(userId) || userId <= 0) {
      sendJson(response, 400, { error: "Usuario invalido." });
      return;
    }
    const session = readSession(_request);
    if (Number(session?.id) === userId) {
      sendJson(response, 400, { error: "No puedes eliminar tu propia cuenta de administrador." });
      return;
    }
    const result = await supabase.from("usuarios").delete().eq("id", userId).select("id").maybeSingle();
    if (result.error) {
      if (result.error.code === "23503") {
        const archived = await supabase.from("usuarios").update({ activo: false }).eq("id", userId).select("id").maybeSingle();
        if (archived.error) {
          userMutationError(response, archived.error, "No se pudo desactivar el usuario.");
          return;
        }
        sendJson(response, 200, { deleted: false, archived: true });
        return;
      }
      userMutationError(response, result.error, "No se pudo eliminar el usuario.");
      return;
    }
    if (!result.data) {
      sendJson(response, 404, { error: "Usuario no encontrado." });
      return;
    }
    sendJson(response, 200, { deleted: true, archived: false });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo eliminar el usuario." });
  }
}

const trainingStates = new Set(["pendiente", "en_curso", "finalizado"]);

function normalizeTrainingState(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return trainingStates.has(normalized) ? normalized : "";
}

function trainingStateFromProgress(progress) {
  return normalizeTrainingState(progress?.estado) || (progress?.completado ? "finalizado" : "pendiente");
}

async function selectUserTrainingProfile(userId) {
  const [userResult, coursesResult, progressResult] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id,nombre,email,rol,activo,fecha_cumpleanos,created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("capacitaciones")
      .select("id,id_curso,orden,nombre_curso,competencias,nro_horas,inversion_curso,activo")
      .eq("activo", true)
      .order("orden", { ascending: true }),
    supabase
      .from("usuario_capacitaciones")
      .select("capacitacion_id,curso_id,estado,completado,completado_en,completado_por")
      .eq("usuario_id", userId)
  ]);

  if (userResult.error) throw userResult.error;
  if (!userResult.data) throw new Error("Usuario no encontrado.");
  if (coursesResult.error || progressResult.error) {
    const missingState = [coursesResult.error, progressResult.error]
      .filter(Boolean)
      .some((error) => /\bestado\b/i.test(error.message || ""));
    if (missingState) throw new Error("Falta aplicar la migracion sql/016_estado_capacitaciones.sql en Supabase.");
    const missingNumericId = [coursesResult.error, progressResult.error]
      .filter(Boolean)
      .some((error) => /capacitacion_id/i.test(error.message || ""));
    if (missingNumericId) throw new Error("Falta aplicar la migracion sql/015_usuario_capacitacion_id.sql en Supabase.");
    const migrationMissing = [coursesResult.error, progressResult.error]
      .filter(Boolean)
      .some((error) => /capacitaciones|schema cache|does not exist/i.test(error.message || ""));
    if (migrationMissing) throw new Error("Falta aplicar la migracion sql/012_capacitaciones_trabajadores.sql en Supabase.");
    throw coursesResult.error || progressResult.error;
  }

  const courses = coursesResult.data || [];
  const progressByCourse = new Map((progressResult.data || []).map((item) => [item.curso_id, item]));
  const trainings = courses.map((course) => {
    const progress = progressByCourse.get(course.id_curso);
    const estado = trainingStateFromProgress(progress);
    const completed = estado === "finalizado";
    const earlierFinalized = courses
      .filter((candidate) => Number(candidate.orden) < Number(course.orden))
      .every((candidate) => trainingStateFromProgress(progressByCourse.get(candidate.id_curso)) === "finalizado");
    const laterStarted = courses
      .filter((candidate) => Number(candidate.orden) > Number(course.orden))
      .some((candidate) => trainingStateFromProgress(progressByCourse.get(candidate.id_curso)) !== "pendiente");

    return {
      ...course,
      capacitacion_id: Number(course.id),
      estado,
      completado: completed,
      completado_en: progress?.completado_en || null,
      completado_por: progress?.completado_por || null,
      disponible: earlierFinalized,
      puede_cambiar_estado: !laterStarted,
      puede_desmarcar: completed && !laterStarted
    };
  });
  const completedCount = trainings.filter((course) => course.completado).length;
  const inProgressCount = trainings.filter((course) => course.estado === "en_curso").length;

  return {
    user: userResult.data,
    trainings,
    summary: {
      completed: completedCount,
      in_progress: inProgressCount,
      pending: trainings.length - completedCount - inProgressCount,
      total: trainings.length,
      percent: trainings.length ? Math.round((completedCount / trainings.length) * 100) : 0,
      next_course_id: trainings.find((course) => !course.completado && course.disponible)?.id_curso || null
    }
  };
}

async function handleReadUserTrainingProfile(request, response, userId) {
  try {
    if (!requireAdministrator(request, response)) return;
    if (!Number.isInteger(userId) || userId <= 0) {
      sendJson(response, 400, { error: "Usuario invalido." });
      return;
    }
    sendJson(response, 200, await selectUserTrainingProfile(userId));
  } catch (error) {
    sendJson(response, /no encontrado/i.test(error.message || "") ? 404 : 500, {
      error: error.message || "No se pudo cargar el perfil de capacitaciones."
    });
  }
}

async function handleUpdateUserTraining(request, response, userId, courseId) {
  try {
    const session = requireSessionRole(request, response, ["administrador"]);
    if (!session) return;
    if (!Number.isInteger(userId) || userId <= 0 || !courseId) {
      sendJson(response, 400, { error: "Usuario o curso invalido." });
      return;
    }
    const body = JSON.parse((await readBody(request)) || "{}");
    const requestedState = normalizeTrainingState(body.estado) ||
      (typeof body.completado === "boolean" ? (body.completado ? "finalizado" : "pendiente") : "");
    if (!requestedState) {
      sendJson(response, 400, { error: "El estado debe ser pendiente, en_curso o finalizado." });
      return;
    }

    const [userResult, courseResult, coursesResult, progressResult] = await Promise.all([
      supabase.from("usuarios").select("id").eq("id", userId).maybeSingle(),
      supabase.from("capacitaciones").select("id,id_curso,orden").eq("id_curso", courseId).eq("activo", true).maybeSingle(),
      supabase.from("capacitaciones").select("id,id_curso,orden").eq("activo", true).order("orden", { ascending: true }),
      supabase.from("usuario_capacitaciones").select("capacitacion_id,curso_id,estado,completado").eq("usuario_id", userId)
    ]);
    const firstError = [userResult.error, courseResult.error, coursesResult.error, progressResult.error].find(Boolean);
    if (firstError) throw firstError;
    if (!userResult.data) {
      sendJson(response, 404, { error: "Usuario no encontrado." });
      return;
    }
    if (!courseResult.data) {
      sendJson(response, 404, { error: "Capacitacion no encontrada." });
      return;
    }

    const stateByCourse = new Map(
      (progressResult.data || []).map((item) => [item.curso_id, trainingStateFromProgress(item)])
    );
    const finalizedIds = new Set(
      [...stateByCourse].filter(([, state]) => state === "finalizado").map(([id]) => id)
    );
    const startedIds = new Set(
      [...stateByCourse].filter(([, state]) => state !== "pendiente").map(([id]) => id)
    );
    const currentOrder = Number(courseResult.data.orden);
    const currentState = stateByCourse.get(courseId) || "pendiente";
    const stateRank = { pendiente: 0, en_curso: 1, finalizado: 2 };
    if (requestedState !== "pendiente") {
      const missingPrevious = (coursesResult.data || []).find(
        (course) => Number(course.orden) < currentOrder && !finalizedIds.has(course.id_curso)
      );
      if (missingPrevious) {
        sendJson(response, 409, { error: `Debes finalizar ${missingPrevious.id_curso} antes de cambiar el estado de ${courseId}.` });
        return;
      }
    }
    if (stateRank[requestedState] < stateRank[currentState]) {
      const startedLater = (coursesResult.data || []).find(
        (course) => Number(course.orden) > currentOrder && startedIds.has(course.id_curso)
      );
      if (startedLater) {
        sendJson(response, 409, { error: `No puedes retroceder ${courseId} mientras ${startedLater.id_curso} siga en curso o finalizada.` });
        return;
      }
    }

    const completed = requestedState === "finalizado";
    const progressPayload = {
      usuario_id: userId,
      capacitacion_id: Number(courseResult.data.id),
      curso_id: courseId,
      estado: requestedState,
      completado: completed,
      completado_en: completed ? new Date().toISOString() : null,
      completado_por: completed ? Number(session.id) : null
    };
    const result = await supabase
      .from("usuario_capacitaciones")
      .upsert(progressPayload, { onConflict: "usuario_id,curso_id" });
    if (result.error) throw result.error;

    sendJson(response, 200, await selectUserTrainingProfile(userId));
  } catch (error) {
    const rawMessage = error.message || "No se pudo actualizar la capacitacion.";
    const message = /\bestado\b/i.test(rawMessage)
      ? "Falta aplicar la migracion sql/016_estado_capacitaciones.sql en Supabase."
      : /capacitacion_id/i.test(rawMessage)
        ? "Falta aplicar la migracion sql/015_usuario_capacitacion_id.sql en Supabase."
        : rawMessage;
    sendJson(response, /debes (?:completar|finalizar)|no puedes (?:desmarcar|retroceder)/i.test(message) ? 409 : 500, { error: message });
  }
}

async function selectTasks() {
  const tableName = await getTaskTableName();
  const result = await supabase.from(tableName).select("*").order("id", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function selectBrands() {
  const result = await supabase.from("marcas").select("id,nombre").order("nombre", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

function isMissingDashboardResource(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error?.code || ""))
    || /could not find (?:the table|the .* column)|does not exist/i.test(String(error?.message || ""));
}

async function selectAllDashboardRows(tableName, { optional = false } = {}) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from(tableName)
      .select("*")
      .range(from, from + pageSize - 1);
    if (result.error) {
      if (optional && isMissingDashboardResource(result.error)) return [];
      throw result.error;
    }
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function dashboardDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? match[0] : null;
}

function dashboardPayrollByRole(users, years) {
  const result = {};
  for (const year of years) {
    result[year] = Array.from({ length: 12 }, () => ({}));
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-31`;
      for (const user of users) {
        const salary = Number(user.sueldo || 0);
        const joined = dashboardDate(user.fecha_ingreso) || dashboardDate(user.created_at);
        const left = dashboardDate(user.fecha_salida);
        if (!salary || (joined && joined > monthEnd) || (left && left < monthStart)) continue;
        const role = normalizeRole(user.rol) || "otros";
        result[year][monthIndex][role] = (result[year][monthIndex][role] || 0) + salary;
      }
    }
  }
  return result;
}

async function handleReadFootwearDashboard(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const taskTable = await getTaskTableName();
    const [
      users,
      tasks,
      brands,
      workerRecords,
      leaderRecords,
      attendances,
      incidents,
      warnings,
      movements,
      trainings,
      trainingAssignments
    ] = await Promise.all([
      selectAllDashboardRows("usuarios"),
      selectAllDashboardRows(taskTable),
      selectAllDashboardRows("marcas"),
      selectAllDashboardRows("registros_tareas", { optional: true }),
      selectAllDashboardRows("registros_tareas_jefe_equipo", { optional: true }),
      selectAllDashboardRows("asistencias", { optional: true }),
      selectAllDashboardRows("incidentes", { optional: true }),
      selectAllDashboardRows("amonestaciones", { optional: true }),
      selectAllDashboardRows("movimientos_personal", { optional: true }),
      selectAllDashboardRows("capacitaciones", { optional: true }),
      selectAllDashboardRows("usuario_capacitaciones", { optional: true })
    ]);

    const years = new Set([new Date().getFullYear()]);
    const collectYear = (value) => {
      const date = dashboardDate(value);
      if (date) years.add(Number(date.slice(0, 4)));
    };
    workerRecords.forEach((row) => collectYear(row.fecha_registro || row.created_at));
    leaderRecords.forEach((row) => collectYear(row.fecha_registro || row.created_at));
    attendances.forEach((row) => collectYear(row.fecha || row.created_at));
    incidents.forEach((row) => collectYear(row.created_at));
    warnings.forEach((row) => collectYear(row.created_at));
    movements.forEach((row) => collectYear(row.fecha_movimiento || row.created_at));
    const dashboardYears = [...years].filter(Number.isFinite).sort((a, b) => a - b);

    const safeWorkers = users.map((user) => ({
      id: Number(user.id),
      name: String(user.nombre || `Usuario ${user.id}`),
      alias: String(user.alias || user.nombre || `Usuario ${user.id}`),
      role: normalizeRole(user.rol) || "otros",
      active: isActive(user.activo),
      joinedAt: dashboardDate(user.fecha_ingreso || user.created_at),
      leftAt: dashboardDate(user.fecha_salida),
      birthday: dashboardDate(user.fecha_cumpleanos)
    }));

    const normalizeActivity = (row, source) => ({
      id: `${source}-${row.id}`,
      source,
      workerId: Number(row.usuario_id || row.trabajador_id),
      taskId: Number(row.tarea_id),
      date: dashboardDate(row.fecha_registro || row.created_at),
      quantity: Number(row.cantidad || 0),
      minutes: Number(row.tiempo_minutos || 0),
      brandId: Number(row.marca_id) || null,
      points: Number(row.puntaje || 0)
    });

    response.setHeader("cache-control", "no-store, no-cache, must-revalidate");
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      years: dashboardYears,
      workers: safeWorkers,
      tasks: tasks.map((task) => ({
        id: Number(task.id),
        name: taskTitle(task) || `Tarea ${task.id}`,
        type: String(task.tipo_tarea || "General"),
        active: isActive(task.activo),
        requiresBrand: [true, 1, "1", "true", "si", "sí"].includes(task.requiere_marca),
        requiresTime: [true, 1, "1", "true", "si", "sí"].includes(task.requiere_tiempo) || isGroupLeaderTimeTask(task)
      })),
      brands: brands.map((brand) => ({ id: Number(brand.id), name: String(brand.nombre || `Marca ${brand.id}`) })),
      activities: [
        ...workerRecords.map((row) => normalizeActivity(row, "operante")),
        ...leaderRecords.map((row) => normalizeActivity(row, "jefe-equipo"))
      ].filter((row) => row.workerId && row.taskId && row.date),
      attendances: attendances.map((row) => ({
        id: Number(row.id), workerId: Number(row.usuario_id), date: dashboardDate(row.fecha || row.created_at),
        state: String(row.estado || "AUSENTE").toUpperCase(), earlyExit: Boolean(row.retiro_anticipado)
      })).filter((row) => row.workerId && row.date),
      incidents: incidents.map((row) => ({
        id: Number(row.id), workerId: Number(row.usuario_id), taskId: Number(row.tarea_id),
        taskName: String(row.tarea_nombre || ""), errorType: String(row.tipo_error || "Sin tipo"),
        shift: /extra/i.test(String(row.turno || "")) ? "extra" : "regular", date: dashboardDate(row.created_at)
      })).filter((row) => row.date),
      warnings: warnings.map((row) => ({ id: Number(row.id), workerId: Number(row.usuario_id), date: dashboardDate(row.created_at) })),
      movements: movements.map((row) => ({
        id: Number(row.id), workerId: Number(row.usuario_id), type: String(row.tipo_movimiento || ""),
        reason: String(row.motivo || "Sin especificar"), date: dashboardDate(row.fecha_movimiento || row.created_at)
      })).filter((row) => row.date),
      trainings: trainings.map((row) => ({
        id: Number(row.id), code: String(row.id_curso || row.id),
        course: String(row.nombre_curso || row.curso || `Capacitacion ${row.id}`),
        competence: String(row.competencias || row.competencia || "General"),
        hours: Number(row.nro_horas ?? row.numero_horas ?? 0)
      })),
      trainingAssignments: trainingAssignments.map((row) => ({
        id: Number(row.id), workerId: Number(row.usuario_id),
        trainingId: Number(row.capacitacion_id || row.curso_id),
        state: String(row.estado || (row.completado ? "finalizado" : "pendiente")).toLowerCase()
      })),
      payrollByRole: dashboardPayrollByRole(users, dashboardYears)
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo cargar la informacion del dashboard." });
  }
}

function isGroupLeaderTimeTask(task) {
  const timeTasks = new Set([
    "etiquetado",
    "envio nuevo",
    "visita de tienda",
    "picking",
    "embalado y rotulado de guia"
  ]);
  return timeTasks.has(normalizeTaskName(taskTitle(task)));
}

function normalizedBrandItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item) => {
    const marca_id = Number(item.marca_id);
    const cantidad = Number(item.cantidad);
    if (!marca_id || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error("Cada marca debe tener una cantidad mayor a cero.");
    }
    if (seen.has(marca_id)) throw new Error("No puedes repetir una marca en el mismo registro.");
    seen.add(marca_id);
    return { marca_id, cantidad };
  });
}

function normalizedGuideItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item) => {
    const numero_guia = String(item.numero_guia || "").trim();
    const cantidad = Number(item.cantidad);
    if (!numero_guia || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error("Cada guía debe tener un número y una cantidad mayor a cero.");
    }
    const normalizedNumber = normalizeRole(numero_guia);
    if (seen.has(normalizedNumber)) throw new Error("No puedes repetir un número de guía en el mismo registro.");
    seen.add(normalizedNumber);
    return { numero_guia, cantidad };
  });
}

async function attachBrandBreakdown(rows) {
  if (!rows.length) return rows;
  const brands = await selectBrands();
  const brandName = new Map(brands.map((brand) => [Number(brand.id), brand.nombre]));
  return rows.map((row) => ({
    ...row,
    marcas: row.marca_id
      ? [{
          marca_id: Number(row.marca_id),
          cantidad: nullableNumber(row.cantidad),
          marca_nombre: brandName.get(Number(row.marca_id)) || `Marca ${row.marca_id}`
        }]
      : []
  }));
}

async function selectTaskScoreRanges(taskId = null) {
  let query = supabase.from("reglas_puntaje").select("*").order("puntos", { ascending: true });
  if (taskId) query = query.eq("tarea_id", taskId);
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

// Las actividades por tiempo que registra un jefe de equipo a nombre de un
// operante viven en una tabla aparte. Se muestran en el historial del
// operante puntuadas con las mismas reglas de "Configuracion de puntajes"
// que usa cualquier otra tarea (segun cantidad); el tiempo registrado por el
// jefe de equipo es solo informativo y no participa en el calculo.
async function selectGroupLeaderActivityLogsForWorker(workerId) {
  const result = await selectGroupLeaderRecordRows((query) =>
    query.eq("trabajador_id", workerId).order("created_at", { ascending: false })
  );
  if (result.error || !result.data?.length) return [];
  const rows = result.data;

  const tableName = await getTaskTableName();
  const taskIds = Array.from(new Set(rows.map((row) => Number(row.tarea_id)).filter(Boolean)));
  const encargadoIds = Array.from(new Set(rows.map((row) => Number(row.encargado_id)).filter(Boolean)));
  const brandIds = Array.from(new Set(rows.map((row) => Number(row.marca_id)).filter(Boolean)));
  const [tasksResult, rulesResult, leadersResult, brandsResult] = await Promise.all([
    taskIds.length ? supabase.from(tableName).select("*").in("id", taskIds) : Promise.resolve({ data: [] }),
    taskIds.length ? supabase.from("reglas_puntaje").select("*").in("tarea_id", taskIds) : Promise.resolve({ data: [] }),
    encargadoIds.length ? supabase.from("usuarios").select("id,nombre,email").in("id", encargadoIds) : Promise.resolve({ data: [] }),
    brandIds.length ? supabase.from("marcas").select("id,nombre").in("id", brandIds) : Promise.resolve({ data: [] })
  ]);
  const rulesByTaskId = new Map();
  (rulesResult.data || []).forEach((rule) => {
    const key = Number(rule.tarea_id);
    if (!rulesByTaskId.has(key)) rulesByTaskId.set(key, []);
    rulesByTaskId.get(key).push(rule);
  });
  const scoredTaskById = new Map(
    (tasksResult.data || []).map((task) => [Number(task.id), applyScoringRules(task, rulesByTaskId.get(Number(task.id)) || [])])
  );
  const leaderById = new Map((leadersResult.data || []).map((leader) => [Number(leader.id), leader]));
  const brandById = new Map((brandsResult.data || []).map((brand) => [Number(brand.id), brand]));

  return rows.map((row) => {
    const leader = leaderById.get(Number(row.encargado_id));
    const task = scoredTaskById.get(Number(row.tarea_id));
    const brand = row.marca_id ? brandById.get(Number(row.marca_id)) : null;
    // Se puntua con las reglas configuradas en el admin (por cantidad, fijo o
    // turno). El tiempo registrado es solo para seguimiento, no para puntaje.
    const storedPoints = row.puntaje === null || row.puntaje === undefined ? null : Number(row.puntaje);
    const puntosObtenidos = storedPoints ?? (task ? calculatePoints(task, row.cantidad, null, true) : null);
    return {
      id: `jefe-equipo-${row.id}`,
      trabajador_id: row.trabajador_id,
      usuario_id: row.trabajador_id,
      tarea_id: row.tarea_id,
      actividad_nombre: task ? taskTitle(task) : "",
      fecha_registro: row.fecha_registro,
      cantidad: row.cantidad,
      tiempo_minutos: row.tiempo_minutos,
      numero_guia: row.numero_guia,
      lote: row.lote,
      tienda_id: row.tienda_id,
      detalle: row.observacion,
      cumplimiento: true,
      puntaje: puntosObtenidos,
      marcas: brand ? [{ marca_id: brand.id, marca_nombre: brand.nombre, cantidad: nullableNumber(row.cantidad) }] : [],
      created_at: row.created_at,
      origen: "jefe_equipo",
      encargado_id: row.encargado_id,
      encargado_nombre: leader?.nombre || leader?.email || `Usuario ${row.encargado_id}`
    };
  });
}

async function selectActivityLogs(workerId = null) {
  const resources = [
    { table: "v_registro_actividades", userColumn: "usuario_id", orderColumn: "fecha_registro" },
    { table: "registros_tareas", userColumn: "usuario_id", orderColumn: "fecha_registro" }
  ];

  let lastError = null;
  for (const resource of resources) {
    let query = supabase.from(resource.table).select("*");
    if (workerId) query = query.eq(resource.userColumn, workerId);
    query = query.order(resource.orderColumn, { ascending: false });

    const result = await query;
    if (!result.error) {
      const rows = await attachBrandBreakdown((result.data || []).map(normalizeActivityLog));
      if (!workerId) return rows;
      const groupLeaderRows = await selectGroupLeaderActivityLogsForWorker(workerId);
      if (!groupLeaderRows.length) return rows;
      return [...rows, ...groupLeaderRows].sort((left, right) => {
        const dateCompare = String(right.fecha_registro || "").localeCompare(String(left.fecha_registro || ""));
        if (dateCompare !== 0) return dateCompare;
        return String(right.created_at || "").localeCompare(String(left.created_at || ""));
      });
    }
    lastError = result.error;
  }

  throw lastError || new Error("No se pudieron leer los registros de actividades.");
}

async function handleReadUsers(_request, response) {
  try {
    if (!requireAdministrator(_request, response)) return;
    sendJson(response, 200, { users: await selectUsers() });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los usuarios." });
  }
}

async function handleReadBrands(_request, response) {
  try {
    sendJson(response, 200, { brands: await selectBrands() });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar las marcas." });
  }
}

async function handleReadTasks(_request, response) {
  try {
    sendJson(response, 200, { tasks: await selectTasks() });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar las tareas." });
  }
}

async function handleCreateTask(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const tableName = await getTaskTableName();
    const payload = taskPayloadForDb(body, tableName);
    if (!String(payload.nombre || "").trim()) {
      sendJson(response, 400, { error: "El nombre de la tarea es obligatorio." });
      return;
    }

    let result = await supabase.from(tableName).insert(payload).select("*").single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from(tableName)
        .insert({ ...payload, id: await nextTableId(tableName) })
        .select("*")
        .single();
    }
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    sendJson(response, 201, { task: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo crear la tarea." });
  }
}

async function handleUpdateTask(request, response, taskId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const tableName = await getTaskTableName();
    const payload = taskPayloadForDb(body, tableName);
    const result = await supabase.from(tableName).update(payload).eq("id", taskId).select("*").single();
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    sendJson(response, 200, { task: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo actualizar la tarea." });
  }
}

async function archiveTask(response, tableName, taskId) {
  const archived = await supabase
    .from(tableName)
    .update({ activo: false })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();
  if (archived.error) throw archived.error;
  if (!archived.data) {
    sendJson(response, 404, { error: "Tarea no encontrada." });
    return false;
  }
  sendJson(response, 200, { deleted: false, archived: true });
  return true;
}

async function handleDeleteTask(request, response, taskId) {
  try {
    if (!requireAdministrator(request, response)) return;
    if (!Number.isInteger(taskId) || taskId <= 0) {
      sendJson(response, 400, { error: "Tarea invalida." });
      return;
    }

    const tableName = await getTaskTableName();
    const existing = await supabase.from(tableName).select("id").eq("id", taskId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) {
      sendJson(response, 404, { error: "Tarea no encontrada." });
      return;
    }

    const historyResults = await Promise.all([
      supabase.from("registros_tareas").select("id", { count: "exact", head: true }).eq("tarea_id", taskId),
      supabase.from("registros_tareas_jefe_equipo").select("id", { count: "exact", head: true }).eq("tarea_id", taskId),
      supabase.from("incidentes").select("id", { count: "exact", head: true }).eq("tarea_id", taskId)
    ]);
    const historyError = historyResults.find((result) => result.error)?.error;
    if (historyError) throw historyError;
    if (historyResults.some((result) => Number(result.count || 0) > 0)) {
      await archiveTask(response, tableName, taskId);
      return;
    }

    const previousRules = await selectTaskScoreRanges(taskId);
    const deleteRules = await supabase.from("reglas_puntaje").delete().eq("tarea_id", taskId);
    if (deleteRules.error) throw deleteRules.error;

    const result = await supabase.from(tableName).delete().eq("id", taskId).select("id").maybeSingle();
    if (result.error) {
      if (previousRules.length) await supabase.from("reglas_puntaje").insert(previousRules);
      if (result.error.code === "23503") {
        await archiveTask(response, tableName, taskId);
        return;
      }
      throw result.error;
    }
    if (!result.data) {
      sendJson(response, 404, { error: "Tarea no encontrada." });
      return;
    }
    sendJson(response, 200, { deleted: true, archived: false });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo eliminar la tarea." });
  }
}

async function handleReadTaskScoreRanges(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const taskId = url.searchParams.get("taskId");
    const rules = await selectTaskScoreRanges(taskId);
    sendJson(response, 200, { rules, ranges: rules });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los rangos." });
  }
}

async function handleReplaceTaskScoreRanges(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const taskId = Number(body.taskId || body.tarea_id);
    const rules = Array.isArray(body.rules) ? body.rules : Array.isArray(body.ranges) ? body.ranges : [];
    if (!taskId) {
      sendJson(response, 400, { error: "La tarea es obligatoria." });
      return;
    }

    const normalized = rules.map((item) => ({
      tarea_id: taskId,
      tipo_regla: String(item.tipo_regla || "CANTIDAD").trim().toUpperCase(),
      desde: nullableNumber(item.desde ?? item.cantidad_desde),
      hasta: nullableNumber(item.hasta ?? item.cantidad_hasta),
      turno: item.turno ? String(item.turno).trim() : null,
      puntos: nullableNumber(item.puntos)
    }));
    const invalid = normalized.find((rule) => (
      !["CANTIDAD", "FIJO", "TURNO"].includes(rule.tipo_regla) ||
      !Number.isInteger(rule.puntos) || rule.puntos < 1 || rule.puntos > 10 ||
      (rule.tipo_regla === "CANTIDAD" && (
        rule.desde === null || rule.desde < 0 || rule.desde > MAX_SCORE_QUANTITY
      )) ||
      (rule.hasta !== null && (
        rule.desde === null || rule.hasta < rule.desde || rule.hasta > MAX_SCORE_QUANTITY
      ))
    ));
    if (invalid) {
      sendJson(response, 400, {
        error: "Hay una regla invalida. Los rangos deben estar entre 0 y 99,999,999.99 y el puntaje entre 1 y 10."
      });
      return;
    }

    const quantityRules = normalized
      .filter((rule) => rule.tipo_regla === "CANTIDAD")
      .sort((a, b) => a.puntos - b.puntos);
    if (quantityRules.length && (quantityRules.length !== 10 || quantityRules.at(-1)?.puntos !== 10 || quantityRules.at(-1)?.hasta !== null)) {
      sendJson(response, 400, { error: "Las tareas por cantidad necesitan 10 rangos y el rango de 10 puntos debe quedar sin límite final." });
      return;
    }

    const previousRules = await selectTaskScoreRanges(taskId);
    const deleteResult = await supabase.from("reglas_puntaje").delete().eq("tarea_id", taskId);
    if (deleteResult.error) {
      sendJson(response, 500, { error: deleteResult.error.message });
      return;
    }

    if (normalized.length) {
      let insertResult = await supabase.from("reglas_puntaje").insert(normalized);
      if (isPrimaryKeySequenceConflict(insertResult.error)) {
        const firstId = await nextTableId("reglas_puntaje");
        insertResult = await supabase.from("reglas_puntaje").insert(
          normalized.map((rule, index) => ({ ...rule, id: firstId + index }))
        );
      }
      if (insertResult.error) {
        const rollback = previousRules.map(({ id: _id, ...rule }) => rule);
        if (rollback.length) await supabase.from("reglas_puntaje").insert(rollback);
        sendJson(response, 500, { error: insertResult.error.message });
        return;
      }
    }

    const savedRules = await selectTaskScoreRanges(taskId);
    sendJson(response, 200, { rules: savedRules, ranges: savedRules });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron guardar los rangos." });
  }
}

async function handleDeleteTaskScoreRanges(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const url = new URL(request.url, `http://${request.headers.host}`);
    const taskId = Number(url.searchParams.get("taskId"));
    if (!taskId) {
      sendJson(response, 400, { error: "La tarea es obligatoria." });
      return;
    }
    const result = await supabase.from("reglas_puntaje").delete().eq("tarea_id", taskId);
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron eliminar los rangos." });
  }
}

async function handleReadStores(request, response) {
  try {
    if (!requireSessionRole(request, response, ["administrador", "operante", "jefe de equipo", "jefe de grupo"])) return;
    const result = await supabase.from("tiendas").select("*").order("id", { ascending: true });
    if (result.error) throw result.error;
    sendJson(response, 200, { stores: result.data || [] });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar las tiendas." });
  }
}

async function handleCreateStore(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = { nombre: String(body.nombre || "").trim(), activo: body.activo !== false };
    if (!payload.nombre) {
      sendJson(response, 400, { error: "El nombre de la tienda es obligatorio." });
      return;
    }
    let result = await supabase.from("tiendas").insert(payload).select("*").single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase.from("tiendas").insert({ ...payload, id: await nextTableId("tiendas") }).select("*").single();
    }
    if (result.error) {
      userMutationError(response, result.error, "No se pudo crear la tienda.");
      return;
    }
    sendJson(response, 201, { store: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo crear la tienda." });
  }
}

async function handleUpdateStore(request, response, storeId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = {};
    if (body.nombre !== undefined) payload.nombre = String(body.nombre).trim();
    if (body.activo !== undefined) payload.activo = Boolean(body.activo);
    if (payload.nombre === "") {
      sendJson(response, 400, { error: "El nombre de la tienda es obligatorio." });
      return;
    }
    const result = await supabase.from("tiendas").update(payload).eq("id", storeId).select("*").maybeSingle();
    if (result.error) {
      userMutationError(response, result.error, "No se pudo actualizar la tienda.");
      return;
    }
    if (!result.data) {
      sendJson(response, 404, { error: "Tienda no encontrada." });
      return;
    }
    sendJson(response, 200, { store: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo actualizar la tienda." });
  }
}

async function handleDeleteStore(request, response, storeId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const result = await supabase.from("tiendas").delete().eq("id", storeId).select("id").maybeSingle();
    if (result.error?.code === "23503") {
      const archived = await supabase.from("tiendas").update({ activo: false }).eq("id", storeId).select("id").maybeSingle();
      if (archived.error) throw archived.error;
      sendJson(response, 200, { deleted: false, archived: true });
      return;
    }
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(response, 404, { error: "Tienda no encontrada." });
      return;
    }
    sendJson(response, 200, { deleted: true, archived: false });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo eliminar la tienda." });
  }
}

async function handleReadAmonestaciones(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const result = await supabase.from("amonestaciones").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    sendJson(response, 200, { amonestaciones: result.data || [] });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar las amonestaciones." });
  }
}

async function handleCreateAmonestacion(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const usuarioId = Number(body.usuario_id);
    const descripcion = String(body.descripcion || "").trim();

    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      sendJson(response, 400, { error: "Selecciona un usuario valido." });
      return;
    }
    if (!descripcion) {
      sendJson(response, 400, { error: "La descripcion de la amonestacion es obligatoria." });
      return;
    }

    const userResult = await supabase.from("usuarios").select("id,activo").eq("id", usuarioId).maybeSingle();
    if (userResult.error) throw userResult.error;
    if (!userResult.data || !isActive(userResult.data.activo)) {
      sendJson(response, 400, { error: "Selecciona un usuario activo." });
      return;
    }

    const payload = {
      usuario_id: usuarioId,
      descripcion,
      created_by: session?.id ? Number(session.id) : null
    };
    let result = await supabase.from("amonestaciones").insert(payload).select("*").single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from("amonestaciones")
        .insert({ ...payload, id: await nextTableId("amonestaciones") })
        .select("*")
        .single();
    }
    if (result.error) {
      userMutationError(response, result.error, "No se pudo crear la amonestacion.");
      return;
    }
    sendJson(response, 201, { amonestacion: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo crear la amonestacion." });
  }
}

async function handleDeleteAmonestacion(request, response, amonestacionId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const result = await supabase.from("amonestaciones").delete().eq("id", amonestacionId).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(response, 404, { error: "Amonestacion no encontrada." });
      return;
    }
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo eliminar la amonestacion." });
  }
}

async function handleReadAttendances(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const url = new URL(request.url, `http://${request.headers.host}`);
    let query = supabase.from("asistencias").select("*").order("fecha", { ascending: false });
    if (url.searchParams.get("date")) query = query.eq("fecha", url.searchParams.get("date"));
    const result = await query;
    if (result.error) throw result.error;
    sendJson(response, 200, { attendances: result.data || [] });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo cargar la asistencia." });
  }
}

const ATTENDANCE_STATES = new Set(["AUSENTE", "PUNTUAL", "TARDANZA"]);
const ATTENDANCE_TIME_ZONE = "America/Lima";

function currentAttendanceMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function attendanceCutoffMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function currentLimaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function operationsSchemaMissing(error) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST203", "PGRST204", "PGRST205"].includes(error?.code);
}

function handleOperationsError(response, error, fallback) {
  if (operationsSchemaMissing(error)) {
    sendJson(response, 503, {
      code: "OPERATIONS_MIGRATION_REQUIRED",
      error: "Falta ejecutar sql/026_asistencia_retiro_y_actividades_en_curso.sql en Supabase."
    });
    return;
  }
  const statusByCode = {
    "23514": 409,
    "42501": 403,
    P0002: 404,
    "22P02": 400,
    "23503": 400
  };
  if (statusByCode[error?.code]) {
    sendJson(response, statusByCode[error.code], { error: error?.message || fallback });
    return;
  }
  sendJson(response, 500, { error: error?.message || fallback });
}

async function handleMarkAttendance(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const userId = Number(body.usuario_id);
    const date = String(body.fecha || "").trim();
    if (!Number.isInteger(userId) || userId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sendJson(response, 400, { error: "Usuario y fecha de asistencia son obligatorios." });
      return;
    }
    let estado = String(body.estado || "").trim().toUpperCase();
    if (!estado && body.presente !== undefined) {
      if (body.presente === false) {
        estado = "AUSENTE";
      } else {
        const cutoffMinutes = attendanceCutoffMinutes(body.hora_limite);
        if (cutoffMinutes === null) {
          sendJson(response, 400, { error: "Selecciona una hora limite valida para marcar la asistencia." });
          return;
        }
        estado = currentAttendanceMinutes() <= cutoffMinutes ? "PUNTUAL" : "TARDANZA";
      }
    }
    if (!ATTENDANCE_STATES.has(estado)) {
      sendJson(response, 400, { error: "El estado de asistencia debe ser Ausente, Puntual o Tardanza." });
      return;
    }
    const present = estado !== "AUSENTE";
    const hasWithdrawalFields = "retiro_anticipado" in body || "motivo_retiro" in body || "retirado_en" in body;
    const requestedEarlyExit = Boolean(body.retiro_anticipado);
    const earlyExitReason = String(body.motivo_retiro || "").trim();
    if (hasWithdrawalFields && date !== currentLimaDate()) {
      sendJson(response, 409, { error: "El retiro anticipado solo puede editarse para la asistencia del dia de hoy." });
      return;
    }
    if (earlyExitReason.length > 500) {
      sendJson(response, 400, { error: "El motivo del retiro no puede superar 500 caracteres." });
      return;
    }
    if (requestedEarlyExit && !present) {
      sendJson(response, 400, { error: "Un trabajador ausente no puede figurar con retiro anticipado." });
      return;
    }
    if (requestedEarlyExit && !earlyExitReason) {
      sendJson(response, 400, { error: "Ingresa el motivo del retiro anticipado." });
      return;
    }
    const existingResult = await supabase
      .from("asistencias")
      .select(hasWithdrawalFields ? "id,created_at,retiro_anticipado,motivo_retiro,retirado_en" : "id,created_at")
      .eq("usuario_id", userId)
      .eq("fecha", date)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;
    if (hasWithdrawalFields && !existingResult.data) {
      sendJson(response, 409, { error: "Primero guarda la asistencia de hoy antes de editar su salida." });
      return;
    }
    const payload = {
      usuario_id: userId,
      fecha: date,
      estado,
      created_at: present ? (existingResult.data?.created_at || new Date().toISOString()) : null,
      ...(existingResult.data?.id ? { updated_at: new Date().toISOString() } : {})
    };
    if (hasWithdrawalFields) {
      payload.retiro_anticipado = requestedEarlyExit && present;
      payload.motivo_retiro = requestedEarlyExit && present ? earlyExitReason : null;
      payload.retirado_en = requestedEarlyExit && present
        ? (existingResult.data?.retiro_anticipado ? existingResult.data.retirado_en : new Date().toISOString())
        : null;
      payload.updated_at = new Date().toISOString();
    } else if (!present && existingResult.data?.id) {
      // Si se desmarca desde la lista principal, elimina cualquier retiro previo
      // para no dejar AUSENTE + retiro_anticipado, combinacion invalida en SQL.
      payload.retiro_anticipado = false;
      payload.motivo_retiro = null;
      payload.retirado_en = null;
      payload.updated_at = new Date().toISOString();
    }
    let result = await supabase
      .from("asistencias")
      .upsert(payload, { onConflict: "usuario_id,fecha" })
      .select("*")
      .single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from("asistencias")
        .upsert({ ...payload, id: await nextTableId("asistencias") }, { onConflict: "usuario_id,fecha" })
        .select("*")
        .single();
    }
    if (result.error) throw result.error;
    sendJson(response, 200, { attendance: result.data });
  } catch (error) {
    handleOperationsError(response, error, "No se pudo guardar la asistencia.");
  }
}

function attendanceReportSchemaMissing(error) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code);
}

function handleAttendanceReportError(response, error, fallback, defaultStatus = 500) {
  if (attendanceReportSchemaMissing(error)) {
    sendJson(response, 503, {
      code: "ATTENDANCE_REPORT_MIGRATION_REQUIRED",
      error: "Falta aplicar una migracion de reportes en Supabase (sql/017, sql/018, sql/019 o sql/022)."
    });
    return;
  }
  if (["ATTENDANCE_REPORT_CONFIG_NOT_FOUND", "ACTIVITY_REPORT_CONFIG_NOT_FOUND", "P0002"].includes(error?.code)) {
    sendJson(response, 404, { error: "La programacion del reporte no existe o fue eliminada." });
    return;
  }
  if (error?.code === "GMAIL_CONFIGURATION_REQUIRED" || String(error?.message || "").includes("GMAIL_APP_PASSWORD")) {
    sendJson(response, 503, {
      code: "GMAIL_CONFIGURATION_REQUIRED",
      error: "Falta configurar la contrasena de aplicacion de Gmail en Netlify."
    });
    return;
  }
  if (["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(error?.code)) {
    sendJson(response, 502, {
      code: "GMAIL_SEND_FAILED",
      error: "Gmail rechazo o no completo el envio. Revisa la cuenta y su contrasena de aplicacion."
    });
    return;
  }
  sendJson(response, defaultStatus, { error: error?.message || fallback });
}

function formatAttendanceReportConfig(config) {
  return {
    ...config,
    hora_envio: String(config?.hora_envio || "18:00").slice(0, 5),
    usuario_ids: Array.isArray(config?.usuario_ids) ? config.usuario_ids.map(Number) : []
  };
}

async function attendanceReportSchedulePayload(body) {
  const recipients = normalizeRecipients(body.destinatarios);
  const active = body.activo === true;
  const name = String(body.nombre || "").trim();
  if (!name) throw new Error("El nombre de la programacion es obligatorio.");
  if (name.length > 100) throw new Error("El nombre de la programacion no puede superar 100 caracteres.");
  if (active && !recipients.length) {
    throw new Error("Agrega al menos un correo destinatario para activar el reporte.");
  }
  if (active && !gmailConfiguration(env).configured) {
    const error = new Error("Configura primero la contrasena de aplicacion de Gmail en Netlify para activar el reporte.");
    error.code = "GMAIL_CONFIGURATION_REQUIRED";
    throw error;
  }

  const includeAllActive = body.incluir_todos_activos !== false;
  const rawUserIds = Array.isArray(body.usuario_ids) ? body.usuario_ids : [];
  const invalidUserId = rawUserIds.find((value) => !Number.isInteger(Number(value)) || Number(value) <= 0);
  if (invalidUserId !== undefined) throw new Error("La seleccion de trabajadores no es valida.");
  const userIds = Array.from(new Set(rawUserIds.map(Number)));

  if (!includeAllActive) {
    if (!userIds.length) throw new Error("Selecciona al menos un trabajador activo para el reporte.");
    const activeWorkers = await readActiveAttendanceWorkers(supabase);
    const activeWorkerIds = new Set(activeWorkers.map((worker) => Number(worker.id)));
    if (userIds.some((userId) => !activeWorkerIds.has(userId))) {
      throw new Error("Solo puedes seleccionar trabajadores que tengan su cuenta activa.");
    }
  }

  return {
    nombre: name,
    activo: active,
    destinatarios: recipients,
    hora_envio: normalizeReportTime(body.hora_envio),
    zona_horaria: REPORT_TIME_ZONE,
    asunto: normalizeReportSubject(body.asunto),
    incluir_todos_activos: includeAllActive,
    usuario_ids: includeAllActive ? [] : userIds
  };
}

async function attendanceReportScheduleExists(configId) {
  const result = await supabase
    .from("configuracion_reporte_asistencia")
    .select("id")
    .eq("id", configId)
    .is("eliminado_en", null)
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

async function saveAttendanceReportSchedule({ configId = null, body, updatedBy }) {
  if (configId && !(await attendanceReportScheduleExists(configId))) {
    const error = new Error("La programacion no existe.");
    error.code = "ATTENDANCE_REPORT_CONFIG_NOT_FOUND";
    throw error;
  }
  const payload = await attendanceReportSchedulePayload(body);
  const result = await supabase.rpc("guardar_programacion_reporte_asistencia", {
    p_configuracion_id: configId || null,
    p_nombre: payload.nombre,
    p_activo: payload.activo,
    p_destinatarios: payload.destinatarios,
    p_hora_envio: payload.hora_envio,
    p_zona_horaria: payload.zona_horaria,
    p_asunto: payload.asunto,
    p_incluir_todos_activos: payload.incluir_todos_activos,
    p_usuario_ids: payload.usuario_ids,
    p_actualizado_por: updatedBy || null
  });
  if (result.error) throw result.error;
  const saved = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!saved?.id) throw new Error("Supabase no devolvio la programacion guardada.");
  return formatAttendanceReportConfig(await readAttendanceReportConfig(supabase, saved.id));
}

async function handleReadAttendanceReportSettings(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const [configs, workers, history] = await Promise.all([
      readAttendanceReportConfigs(supabase),
      readActiveAttendanceWorkers(supabase),
      readAttendanceReportHistory(supabase, 50)
    ]);
    const gmail = gmailConfiguration(env);
    sendJson(response, 200, {
      configs: configs.map(formatAttendanceReportConfig),
      config: configs[0] ? formatAttendanceReportConfig(configs[0]) : null,
      workers,
      history,
      gmail: { sender: gmail.sender, configured: gmail.configured }
    });
  } catch (error) {
    handleAttendanceReportError(response, error, "No se pudo cargar la configuracion del reporte.");
  }
}

async function handleCreateAttendanceReportSettings(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await saveAttendanceReportSchedule({
      body,
      updatedBy: Number(session?.id) || null
    });
    sendJson(response, 201, { config });
  } catch (error) {
    const validationError = error instanceof SyntaxError ||
      /correo|hora|asunto|destinatario|nombre|programacion|trabajador|usuario/i.test(String(error?.message || ""));
    handleAttendanceReportError(
      response,
      error,
      "No se pudo crear la programacion del reporte.",
      validationError ? 400 : 500
    );
  }
}

async function handleUpdateAttendanceReportSettings(request, response, configId = 1) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await saveAttendanceReportSchedule({
      configId,
      body,
      updatedBy: Number(session?.id) || null
    });
    sendJson(response, 200, { config });
  } catch (error) {
    const validationError = error instanceof SyntaxError ||
      /correo|hora|asunto|destinatario|nombre|programacion|trabajador|usuario/i.test(String(error?.message || ""));
    handleAttendanceReportError(
      response,
      error,
      "No se pudo actualizar la programacion del reporte.",
      validationError ? 400 : 500
    );
  }
}

async function handleDeleteAttendanceReportSettings(request, response, configId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const result = await supabase
      .from("configuracion_reporte_asistencia")
      .update({
        activo: false,
        eliminado_en: new Date().toISOString(),
        eliminado_por: Number(session?.id) || null
      })
      .eq("id", configId)
      .is("eliminado_en", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(response, 404, { error: "La programacion no existe o ya fue eliminada." });
      return;
    }
    sendJson(response, 200, { deleted: true, id: configId });
  } catch (error) {
    handleAttendanceReportError(response, error, "No se pudo eliminar la programacion del reporte.");
  }
}

async function handleSendAttendanceReport(request, response, configId = 1) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await readAttendanceReportConfig(supabase, configId);
    const reportDate = String(
      body.fecha || localDateTimeParts(new Date(), config.zona_horaria || REPORT_TIME_ZONE).date
    ).trim();
    const result = await sendAttendanceReport({
      db: supabase,
      envValues: env,
      config,
      reportDate,
      type: "manual",
      initiatedBy: Number(session?.id) || null
    });
    sendJson(response, 200, { report: result });
  } catch (error) {
    const validationError = error instanceof SyntaxError ||
      /fecha|correo|destinatario|tipo de envio/i.test(String(error?.message || ""));
    handleAttendanceReportError(
      response,
      error,
      "No se pudo enviar el reporte de asistencia.",
      validationError ? 400 : 500
    );
  }
}

function formatActivityReportConfig(config) {
  return {
    ...config,
    hora_manana: String(config?.hora_manana || "12:00").slice(0, 5),
    hora_tarde: String(config?.hora_tarde || "18:00").slice(0, 5),
    usuario_ids: Array.isArray(config?.usuario_ids) ? config.usuario_ids.map(Number) : []
  };
}

async function activityReportSchedulePayload(body) {
  const recipients = normalizeRecipients(body.destinatarios);
  const active = body.activo === true;
  const name = String(body.nombre || "").trim();
  if (!name) throw new Error("El nombre de la programacion es obligatorio.");
  if (name.length > 100) throw new Error("El nombre de la programacion no puede superar 100 caracteres.");
  const morning = normalizeReportTime(body.hora_manana);
  const afternoon = normalizeReportTime(body.hora_tarde);
  if (morning >= afternoon) throw new Error("La hora de la manana debe ser anterior a la hora de la tarde.");
  if (active && !recipients.length) {
    throw new Error("Agrega al menos un correo destinatario para activar el reporte.");
  }
  if (active && !gmailConfiguration(env).configured) {
    const error = new Error("Configura primero la contrasena de aplicacion de Gmail en Netlify para activar el reporte.");
    error.code = "GMAIL_CONFIGURATION_REQUIRED";
    throw error;
  }

  const includeAllActive = body.incluir_todos_activos !== false;
  const rawUserIds = Array.isArray(body.usuario_ids) ? body.usuario_ids : [];
  const invalidUserId = rawUserIds.find((value) => !Number.isInteger(Number(value)) || Number(value) <= 0);
  if (invalidUserId !== undefined) throw new Error("La seleccion de operantes no es valida.");
  const userIds = Array.from(new Set(rawUserIds.map(Number)));

  if (!includeAllActive) {
    if (!userIds.length) throw new Error("Selecciona al menos un operante activo para el reporte.");
    const activeWorkers = await readActiveActivityWorkers(supabase);
    const activeWorkerIds = new Set(activeWorkers.map((worker) => Number(worker.id)));
    if (userIds.some((userId) => !activeWorkerIds.has(userId))) {
      throw new Error("Solo puedes seleccionar operantes que tengan su cuenta activa.");
    }
  }

  return {
    nombre: name,
    activo: active,
    destinatarios: recipients,
    hora_manana: morning,
    hora_tarde: afternoon,
    zona_horaria: REPORT_TIME_ZONE,
    asunto: normalizeReportSubject(body.asunto || "Reporte de registros de actividades"),
    incluir_todos_activos: includeAllActive,
    usuario_ids: includeAllActive ? [] : userIds
  };
}

async function activityReportScheduleExists(configId) {
  const result = await supabase
    .from("configuracion_reporte_actividad")
    .select("id")
    .eq("id", configId)
    .is("eliminado_en", null)
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

async function saveActivityReportSchedule({ configId = null, body, updatedBy }) {
  if (configId && !(await activityReportScheduleExists(configId))) {
    const error = new Error("La programacion no existe.");
    error.code = "ACTIVITY_REPORT_CONFIG_NOT_FOUND";
    throw error;
  }
  const payload = await activityReportSchedulePayload(body);
  const result = await supabase.rpc("guardar_programacion_reporte_actividad", {
    p_configuracion_id: configId || null,
    p_nombre: payload.nombre,
    p_activo: payload.activo,
    p_destinatarios: payload.destinatarios,
    p_hora_manana: payload.hora_manana,
    p_hora_tarde: payload.hora_tarde,
    p_zona_horaria: payload.zona_horaria,
    p_asunto: payload.asunto,
    p_incluir_todos_activos: payload.incluir_todos_activos,
    p_usuario_ids: payload.usuario_ids,
    p_actualizado_por: updatedBy || null
  });
  if (result.error) throw result.error;
  const saved = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!saved?.id) throw new Error("Supabase no devolvio la programacion guardada.");
  return formatActivityReportConfig(await readActivityReportConfig(supabase, saved.id));
}

async function handleReadActivityReportSettings(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const [configs, workers, history] = await Promise.all([
      readActivityReportConfigs(supabase),
      readActiveActivityWorkers(supabase),
      readActivityReportHistory(supabase, 50)
    ]);
    const gmail = gmailConfiguration(env);
    sendJson(response, 200, {
      configs: configs.map(formatActivityReportConfig),
      config: configs[0] ? formatActivityReportConfig(configs[0]) : null,
      workers,
      history,
      gmail: { sender: gmail.sender, configured: gmail.configured }
    });
  } catch (error) {
    handleAttendanceReportError(response, error, "No se pudo cargar el reporte de actividades.");
  }
}

async function handleCreateActivityReportSettings(request, response) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await saveActivityReportSchedule({
      body,
      updatedBy: Number(session?.id) || null
    });
    sendJson(response, 201, { config });
  } catch (error) {
    const validationError = error instanceof SyntaxError ||
      /correo|hora|asunto|destinatario|nombre|programacion|operante|usuario|manana|tarde/i.test(String(error?.message || ""));
    handleAttendanceReportError(
      response,
      error,
      "No se pudo crear la programacion del reporte de actividades.",
      validationError ? 400 : 500
    );
  }
}

async function handleUpdateActivityReportSettings(request, response, configId = 1) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await saveActivityReportSchedule({
      configId,
      body,
      updatedBy: Number(session?.id) || null
    });
    sendJson(response, 200, { config });
  } catch (error) {
    const validationError = error instanceof SyntaxError ||
      /correo|hora|asunto|destinatario|nombre|programacion|operante|usuario|manana|tarde/i.test(String(error?.message || ""));
    handleAttendanceReportError(
      response,
      error,
      "No se pudo actualizar la programacion del reporte de actividades.",
      validationError ? 400 : 500
    );
  }
}

async function handleDeleteActivityReportSettings(request, response, configId) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const result = await supabase
      .from("configuracion_reporte_actividad")
      .update({
        activo: false,
        eliminado_en: new Date().toISOString(),
        eliminado_por: Number(session?.id) || null
      })
      .eq("id", configId)
      .is("eliminado_en", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      sendJson(response, 404, { error: "La programacion no existe o ya fue eliminada." });
      return;
    }
    sendJson(response, 200, { deleted: true, id: configId });
  } catch (error) {
    handleAttendanceReportError(response, error, "No se pudo eliminar la programacion del reporte de actividades.");
  }
}

async function handlePreviewActivityReport(request, response, configId = 1) {
  try {
    if (!requireAdministrator(request, response)) return;
    const url = new URL(request.url, `http://${request.headers.host}`);
    const config = await readActivityReportConfig(supabase, configId);
    const reportDate = String(url.searchParams.get("date") || localDateTimeParts(new Date(), REPORT_TIME_ZONE).date);
    const shift = String(url.searchParams.get("shift") || "manana");
    const rows = await readActivityCompliance(supabase, reportDate, shift, config);
    sendJson(response, 200, {
      report: {
        fecha: reportDate,
        turno: shift,
        rows,
        cumplieron: rows.filter((row) => row.cumplio).length,
        sin_registro: rows.filter((row) => !row.cumplio).length
      }
    });
  } catch (error) {
    const validationError = /fecha|turno/i.test(String(error?.message || ""));
    handleAttendanceReportError(response, error, "No se pudo generar el reporte de actividades.", validationError ? 400 : 500);
  }
}

async function handleSendActivityReport(request, response, configId = 1) {
  try {
    if (!requireAdministrator(request, response)) return;
    const session = readSession(request);
    const body = JSON.parse((await readBody(request)) || "{}");
    const config = await readActivityReportConfig(supabase, configId);
    const reportDate = String(body.fecha || localDateTimeParts(new Date(), REPORT_TIME_ZONE).date);
    const result = await sendActivityReport({
      db: supabase,
      envValues: env,
      config,
      reportDate,
      shift: String(body.turno || "manana"),
      type: "manual",
      initiatedBy: Number(session?.id) || null
    });
    sendJson(response, 200, { report: result });
  } catch (error) {
    const validationError = error instanceof SyntaxError || /fecha|turno|correo|destinatario/i.test(String(error?.message || ""));
    handleAttendanceReportError(response, error, "No se pudo enviar el reporte de actividades.", validationError ? 400 : 500);
  }
}

async function handleReadActivityLogs(request, response) {
  try {
    const session = requireSessionRole(request, response, ["administrador", "operante", "jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const url = new URL(request.url, `http://${request.headers.host}`);
    const workerId = url.searchParams.get("workerId");
    if (normalizeRole(session.rol) !== "administrador" && workerId && Number(workerId) !== Number(session.id)) {
      sendJson(response, 403, { error: "No puedes consultar los registros de otro usuario." });
      return;
    }
    sendJson(response, 200, { logs: await selectActivityLogs(workerId) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los registros." });
  }
}

async function handleCreateActivityLog(request, response) {
  try {
    const session = requireSessionRole(request, response, ["operante", "jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const submittedTime = body.tiempo_minutos ?? body.dato_extra;
    if (
      normalizeRole(session.rol) === "operante" &&
      submittedTime !== null &&
      submittedTime !== undefined &&
      submittedTime !== ""
    ) {
      sendJson(response, 403, { error: "El operante no puede registrar tiempo, horas ni minutos." });
      return;
    }
    const tableName = await getTaskTableName();
    const taskResult = await supabase.from(tableName).select("*").eq("id", Number(body.tarea_id)).maybeSingle();
    if (taskResult.error || !taskResult.data) {
      sendJson(response, 400, { error: "La tarea seleccionada no existe." });
      return;
    }
    const scoringRulesResult = await supabase
      .from("reglas_puntaje")
      .select("tipo_regla")
      .eq("tarea_id", Number(body.tarea_id));
    if (scoringRulesResult.error) {
      sendJson(response, 500, { error: scoringRulesResult.error.message });
      return;
    }
    const scoringTypes = new Set((scoringRulesResult.data || []).map((rule) => normalizeRole(rule.tipo_regla)));
    const requestedType = normalizeRole(body.tipo_medicion);
    const storesQuantity = !scoringTypes.has("fijo") && !scoringTypes.has("turno") &&
      !["fijo", "turno", "cumplimiento"].includes(requestedType);
    const isTimeTask = isGroupLeaderTimeTask(taskResult.data);
    const requiresStore = taskUsesStore(taskResult.data);
    const allowsBrands = isEtiquetadoTask(taskResult.data);
    const allowsGuideNumber = isGuideBreakdownTask(taskResult.data);
    const allowsLote = isEtiquetadoTask(taskResult.data);
    if (isTimeTask && body.tiempo_minutos !== null && body.tiempo_minutos !== undefined && body.tiempo_minutos !== "") {
      sendJson(response, 403, { error: "El operante no puede registrar el tiempo. Debe hacerlo el jefe de equipo." });
      return;
    }
    const brandItems = normalizedBrandItems(body.marcas);
    const guideItems = normalizedGuideItems(body.guias);
    const singleGuideNumber = String(body.numero_guia || "").trim();
    const lote = String(body.lote || "").trim().toUpperCase();
    if (brandItems.length && !allowsBrands) {
      sendJson(response, 400, { error: "Las marcas solo estan disponibles para la tarea Etiquetado." });
      return;
    }
    if (lote && !allowsLote) {
      sendJson(response, 400, { error: "El lote solo esta disponible para la tarea Etiquetado." });
      return;
    }
    if ((guideItems.length || singleGuideNumber) && !allowsGuideNumber) {
      sendJson(response, 400, { error: "El número de guía no está disponible para esta tarea." });
      return;
    }
    if (brandItems.length && guideItems.length) {
      sendJson(response, 400, { error: "No puedes distribuir el mismo registro por marcas y por guías a la vez." });
      return;
    }
    const brandTotal = brandItems.reduce((total, item) => total + item.cantidad, 0);
    const guideTotal = guideItems.reduce((total, item) => total + item.cantidad, 0);
    const requestedQuantity = storesQuantity ? nullableNumber(body.cantidad) : null;
    if (isTimeTask && (!requestedQuantity || requestedQuantity <= 0)) {
      sendJson(response, 400, { error: "Las tareas de tiempo también requieren una cantidad mayor a cero." });
      return;
    }
    if (brandItems.length && (!requestedQuantity || requestedQuantity <= 0 || requestedQuantity !== brandTotal)) {
      sendJson(response, 400, { error: `Las cantidades por marca deben sumar exactamente la cantidad total (${requestedQuantity || 0}).` });
      return;
    }
    if (guideItems.length && (!requestedQuantity || requestedQuantity <= 0 || requestedQuantity !== guideTotal)) {
      sendJson(response, 400, { error: `Las cantidades por guía deben sumar exactamente la cantidad total (${requestedQuantity || 0}).` });
      return;
    }
    const payload = {
      usuario_id: Number(session.id),
      tarea_id: Number(body.tarea_id),
      fecha_registro: body.fecha_registro ? String(body.fecha_registro) : new Date().toISOString().slice(0, 10),
      cantidad: requestedQuantity,
      turno: body.turno ? String(body.turno).trim() : null,
      cumplimiento: body.cumplimiento === undefined ? null : Boolean(body.cumplimiento),
      tienda_id: requiresStore ? nullableNumber(body.tienda_id) : null,
      numero_guia: singleGuideNumber || null,
      dato_extra: lote || null,
      observacion: body.observacion || body.detalle ? String(body.observacion || body.detalle).trim() : null,
      puntaje: nullableNumber(body.puntaje) ?? 0
    };
    const requestedTime = nullableNumber(body.tiempo_minutos ?? body.dato_extra);
    if (!isTimeTask && requestedTime !== null) payload.tiempo_minutos = requestedTime;

    if (!payload.usuario_id || !payload.tarea_id) {
      sendJson(response, 400, { error: "Usuario y tarea son obligatorios." });
      return;
    }
    if (requiresStore && !payload.tienda_id) {
      sendJson(response, 400, { error: `La tienda es obligatoria para ${taskTitle(taskResult.data)}.` });
      return;
    }
    if (payload.tienda_id) {
      const storeResult = await supabase
        .from("tiendas")
        .select("id,activo")
        .eq("id", payload.tienda_id)
        .maybeSingle();
      if (storeResult.error || !storeResult.data || !isActive(storeResult.data.activo)) {
        sendJson(response, 400, { error: "Selecciona una tienda activa y valida." });
        return;
      }
    }

    const insertedRows = [];
    const rowsToInsert = brandItems.length
      ? brandItems.map((item, index) => ({
          ...payload,
          cantidad: item.cantidad,
          marca_id: item.marca_id,
          puntaje: index === 0 ? payload.puntaje : 0
        }))
      : guideItems.length
        ? guideItems.map((item, index) => ({
            ...payload,
            cantidad: item.cantidad,
            numero_guia: item.numero_guia,
            puntaje: index === 0 ? payload.puntaje : 0
          }))
      : [payload];

    for (const row of rowsToInsert) {
      const result = await insertCompatibleActivityRow(row);
      if (result.error) {
        if (insertedRows.length) {
          await supabase.from("registros_tareas").delete().in("id", insertedRows.map((item) => item.id));
        }
        sendJson(response, 500, { error: result.error.message });
        return;
      }
      insertedRows.push(result.data);
    }

    const brands = brandItems.length ? await selectBrands() : [];
    const brandName = new Map(brands.map((brand) => [Number(brand.id), brand.nombre]));
    const log = {
      ...normalizeActivityLog(insertedRows[0]),
      cantidad: requestedQuantity,
      puntaje: payload.puntaje,
      guias: guideItems,
      marcas: brandItems.map((item) => ({
        ...item,
        marca_nombre: brandName.get(Number(item.marca_id)) || `Marca ${item.marca_id}`
      }))
    };
    sendJson(response, 201, { log });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo guardar el registro." });
  }
}

const GROUP_RECORD_COLUMNS_WITH_EXTRAS =
  "id,encargado_id,trabajador_id,tarea_id,fecha_registro,cantidad,tiempo_minutos,numero_guia,lote,marca_id,tienda_id,observacion,puntaje,created_at";
const GROUP_RECORD_COLUMNS_BASE =
  "id,encargado_id,trabajador_id,tarea_id,fecha_registro,cantidad,tiempo_minutos,numero_guia,lote,observacion,puntaje,created_at";

// marca_id/tienda_id solo existen despues de aplicar sql/024. Hasta entonces,
// esta consulta cae de vuelta a las columnas base para no romper el resto del
// panel de jefe de equipo (lista de tareas, historial, etc.).
async function selectGroupLeaderRecordRows(applyFilters) {
  let query = supabase.from("registros_tareas_jefe_equipo").select(GROUP_RECORD_COLUMNS_WITH_EXTRAS);
  query = applyFilters(query);
  let result = await query;
  if (["42703", "PGRST204"].includes(result.error?.code)) {
    let fallbackQuery = supabase.from("registros_tareas_jefe_equipo").select(GROUP_RECORD_COLUMNS_BASE);
    fallbackQuery = applyFilters(fallbackQuery);
    result = await fallbackQuery;
    if (["42703", "PGRST204"].includes(result.error?.code)) {
      let legacyQuery = supabase
        .from("registros_tareas_jefe_equipo")
        .select("id,encargado_id,trabajador_id,tarea_id,fecha_registro,cantidad,tiempo_minutos,numero_guia,lote,observacion,created_at");
      legacyQuery = applyFilters(legacyQuery);
      result = await legacyQuery;
    }
    if (!result.error) {
      result.data = (result.data || []).map((row) => ({ ...row, marca_id: row.marca_id ?? null, tienda_id: row.tienda_id ?? null, puntaje: row.puntaje ?? null }));
    }
  }
  return result;
}

function enrichGroupRecords(records, users, tasks, brands = [], stores = []) {
  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const taskById = new Map(tasks.map((task) => [Number(task.id), task]));
  const brandById = new Map(brands.map((brand) => [Number(brand.id), brand]));
  const storeById = new Map(stores.map((store) => [Number(store.id), store]));

  return records.map((record) => {
    const encargado = userById.get(Number(record.encargado_id));
    const trabajador = userById.get(Number(record.trabajador_id));
    const task = taskById.get(Number(record.tarea_id));
    const brand = record.marca_id ? brandById.get(Number(record.marca_id)) : null;
    const store = record.tienda_id ? storeById.get(Number(record.tienda_id)) : null;

    return {
      ...record,
      encargado_nombre: encargado?.nombre || encargado?.email || "",
      encargado_email: encargado?.email || "",
      trabajador_nombre: trabajador?.nombre || trabajador?.email || "",
      trabajador_email: trabajador?.email || "",
      tarea_nombre: record.tarea_nombre || taskTitle(task) || `Tarea ${record.tarea_id}`,
      marca_nombre: brand?.nombre || "",
      tienda_nombre: store?.nombre || ""
    };
  });
}

async function loadGroupLeaderData() {
  const tableName = await getTaskTableName();
  const [usersResult, tasksResult, recordsResult, brandsResult, storesResult] = await Promise.all([
    supabase.from("usuarios").select("id,nombre,email,rol,activo").order("id", { ascending: true }),
    supabase.from(tableName).select("*").order("id", { ascending: true }),
    selectGroupLeaderRecordRows((query) => query.order("created_at", { ascending: false })),
    supabase.from("marcas").select("*").order("nombre", { ascending: true }),
    supabase.from("tiendas").select("id,nombre")
  ]);

  if (usersResult.error) throw usersResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (recordsResult.error) throw recordsResult.error;
  if (brandsResult.error) throw brandsResult.error;
  if (storesResult.error) throw storesResult.error;

  const users = usersResult.data || [];
  const tasks = (tasksResult.data || []).filter((task) => isActive(task.activo) && isGroupLeaderTimeTask(task));
  const workers = users.filter((user) => normalizeRole(user.rol) === "operante" && isActive(user.activo));
  const leaders = users.filter((user) => ["jefe de equipo", "jefe de grupo"].includes(normalizeRole(user.rol)) && isActive(user.activo));
  const records = enrichGroupRecords(
    (recordsResult.data || []).map((record) => ({
      ...record,
      codigo_guia: record.numero_guia,
      detalle: record.observacion
    })),
    users,
    tasksResult.data || [],
    brandsResult.data || [],
    storesResult.data || []
  );
  const stores = (storesResult.data || []).filter((store) => isActive(store.activo));
  let activities = [];
  let operationsMigrationRequired = false;
  try {
    activities = await selectLiveGroupLeaderActivities();
  } catch (error) {
    if (!operationsSchemaMissing(error)) throw error;
    operationsMigrationRequired = true;
  }

  return {
    workers,
    tasks,
    leaders,
    records,
    activities,
    operationsMigrationRequired,
    brands: (brandsResult.data || []).filter((brand) => isActive(brand.activo)),
    stores
  };
}

async function handleGroupLeaderContext(request, response) {
  try {
    if (!requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"])) return;
    const data = await loadGroupLeaderData();
    sendJson(response, 200, data);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los datos." });
  }
}

async function handleCreateGroupLeaderRecord(request, response) {
  try {
    const session = requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const rawBody = await readBody(request);
    const body = JSON.parse(rawBody || "{}");
    const taskId = Number(body.tarea_id);
    const workerId = Number(body.trabajador_id);
    if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(workerId) || workerId <= 0) {
      sendJson(response, 400, { error: "Operante y tarea son obligatorios." });
      return;
    }

    const tableName = await getTaskTableName();
    const taskResult = await supabase
      .from(tableName)
      .select("*")
      .eq("id", taskId)
      .maybeSingle();
    if (taskResult.error || !taskResult.data || !isGroupLeaderTimeTask(taskResult.data)) {
      sendJson(response, 400, { error: "Selecciona una tarea por tiempo válida." });
      return;
    }
    if (!isActive(taskResult.data.activo)) {
      sendJson(response, 400, { error: "La tarea seleccionada no está activa." });
      return;
    }
    const workerResult = await supabase
      .from("usuarios")
      .select("id,rol,activo")
      .eq("id", workerId)
      .maybeSingle();
    if (
      workerResult.error ||
      !workerResult.data ||
      normalizeRole(workerResult.data.rol) !== "operante" ||
      !isActive(workerResult.data.activo)
    ) {
      sendJson(response, 400, { error: "Selecciona un operante activo." });
      return;
    }

    const requestedQuantity = Number(body.cantidad);
    const requestedMinutes = Number(body.tiempo_minutos);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      sendJson(response, 400, { error: "La cantidad debe ser un número entero mayor a cero." });
      return;
    }
    if (!Number.isInteger(requestedMinutes) || requestedMinutes <= 0) {
      sendJson(response, 400, { error: "El tiempo debe ser una cantidad entera de minutos mayor a cero." });
      return;
    }
    const guideNumber = String(body.codigo_guia || "").trim();
    const lote = String(body.lote || "").trim().toUpperCase();
    if (guideNumber && !isGuideBreakdownTask(taskResult.data)) {
      sendJson(response, 400, { error: "El numero de guia no esta disponible para esta tarea." });
      return;
    }
    if (lote && !isEtiquetadoTask(taskResult.data)) {
      sendJson(response, 400, { error: "El lote solo esta disponible para la tarea Etiquetado." });
      return;
    }

    // Las mismas tareas por tiempo piden aqui los mismos datos adicionales
    // que ya le pide el operante para esa tarea (marca en Etiquetado, tienda
    // en Picking/Visita de tienda).
    const requiresBrand = isEtiquetadoTask(taskResult.data);
    const requiresStore = taskUsesStore(taskResult.data);
    const requestedBrandId = nullableNumber(body.marca_id);
    const requestedStoreId = nullableNumber(body.tienda_id);

    if (requiresBrand && !requestedBrandId) {
      sendJson(response, 400, { error: `Selecciona una marca para ${taskTitle(taskResult.data)}.` });
      return;
    }
    if (!requiresBrand && requestedBrandId) {
      sendJson(response, 400, { error: "La marca solo esta disponible para la tarea Etiquetado." });
      return;
    }
    if (requiresStore && !requestedStoreId) {
      sendJson(response, 400, { error: `Selecciona una tienda para ${taskTitle(taskResult.data)}.` });
      return;
    }
    if (!requiresStore && requestedStoreId) {
      sendJson(response, 400, { error: "La tienda no esta disponible para esta tarea." });
      return;
    }
    if (requestedBrandId) {
      const brandResult = await supabase.from("marcas").select("id").eq("id", requestedBrandId).maybeSingle();
      if (brandResult.error || !brandResult.data) {
        sendJson(response, 400, { error: "Selecciona una marca valida." });
        return;
      }
    }
    if (requestedStoreId) {
      const storeResult = await supabase.from("tiendas").select("id,activo").eq("id", requestedStoreId).maybeSingle();
      if (storeResult.error || !storeResult.data || !isActive(storeResult.data.activo)) {
        sendJson(response, 400, { error: "Selecciona una tienda activa y valida." });
        return;
      }
    }

    const payload = {
      encargado_id: Number(session.id),
      trabajador_id: workerId,
      tarea_id: taskId,
      fecha_registro: body.fecha_registro ? String(body.fecha_registro) : new Date().toISOString().slice(0, 10),
      cantidad: requestedQuantity,
      tiempo_minutos: requestedMinutes,
      numero_guia: guideNumber || null,
      lote: lote || null,
      marca_id: requestedBrandId,
      tienda_id: requestedStoreId,
      observacion: body.detalle ? String(body.detalle).trim() : null
    };

    if (!payload.encargado_id || !payload.trabajador_id || !payload.tarea_id) {
      sendJson(response, 400, { error: "Encargado, trabajador y tarea son obligatorios." });
      return;
    }

    let result = await supabase
      .from("registros_tareas_jefe_equipo")
      .insert(payload)
      .select(GROUP_RECORD_COLUMNS_WITH_EXTRAS)
      .single();

    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from("registros_tareas_jefe_equipo")
        .insert({ ...payload, id: await nextTableId("registros_tareas_jefe_equipo") })
        .select(GROUP_RECORD_COLUMNS_WITH_EXTRAS)
        .single();
    }

    // marca_id/tienda_id solo existen despues de aplicar sql/024. Si la tarea no
    // los necesita (ambos quedaron null), reintenta sin esas columnas para no
    // bloquear el registro completo por una migracion pendiente.
    if (["42703", "PGRST204"].includes(result.error?.code) && !payload.marca_id && !payload.tienda_id) {
      const { marca_id, tienda_id, ...basePayload } = payload;
      result = await supabase
        .from("registros_tareas_jefe_equipo")
        .insert(basePayload)
        .select(GROUP_RECORD_COLUMNS_BASE)
        .single();
      if (isPrimaryKeySequenceConflict(result.error)) {
        result = await supabase
          .from("registros_tareas_jefe_equipo")
          .insert({ ...basePayload, id: await nextTableId("registros_tareas_jefe_equipo") })
          .select(GROUP_RECORD_COLUMNS_BASE)
          .single();
      }
      if (!result.error) result.data = { ...result.data, marca_id: null, tienda_id: null };
    }

    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    const data = await loadGroupLeaderData();
    const record = data.records.find((item) => Number(item.id) === Number(result.data.id)) || result.data;
    sendJson(response, 201, { record });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo guardar el registro." });
  }
}

function normalizeLiveActivity(activity, usersById, tasksById, brandsById, storesById, history = []) {
  const worker = usersById.get(Number(activity.trabajador_id));
  const leader = usersById.get(Number(activity.encargado_id));
  const task = tasksById.get(Number(activity.tarea_id));
  return {
    ...activity,
    trabajador_nombre: worker?.nombre || worker?.email || `Usuario ${activity.trabajador_id}`,
    trabajador_email: worker?.email || "",
    encargado_nombre: leader?.nombre || leader?.email || `Usuario ${activity.encargado_id}`,
    tarea_nombre: taskTitle(task) || `Tarea ${activity.tarea_id}`,
    marca_nombre: brandsById.get(Number(activity.marca_id))?.nombre || "",
    tienda_nombre: storesById.get(Number(activity.tienda_id))?.nombre || "",
    history
  };
}

async function selectLiveGroupLeaderActivities() {
  const activitiesResult = await supabase
    .from("actividades_jefe_equipo")
    .select("*")
    .order("hora_inicio", { ascending: false });
  if (activitiesResult.error) throw activitiesResult.error;
  const activities = activitiesResult.data || [];
  if (!activities.length) return [];

  const activityIds = activities.map((item) => Number(item.id));
  const [usersResult, tasksResult, brandsResult, storesResult, historyResult] = await Promise.all([
    supabase.from("usuarios").select("id,nombre,email"),
    supabase.from(await getTaskTableName()).select("*"),
    supabase.from("marcas").select("id,nombre"),
    supabase.from("tiendas").select("id,nombre"),
    supabase.from("actividades_jefe_equipo_historial").select("*").in("actividad_id", activityIds).order("created_at", { ascending: true }).order("id", { ascending: true })
  ]);
  if (usersResult.error) throw usersResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (brandsResult.error) throw brandsResult.error;
  if (storesResult.error) throw storesResult.error;
  if (historyResult.error) throw historyResult.error;

  const usersById = new Map((usersResult.data || []).map((item) => [Number(item.id), item]));
  const tasksById = new Map((tasksResult.data || []).map((item) => [Number(item.id), item]));
  const brandsById = new Map((brandsResult.data || []).map((item) => [Number(item.id), item]));
  const storesById = new Map((storesResult.data || []).map((item) => [Number(item.id), item]));
  const historyByActivity = new Map();
  (historyResult.data || []).forEach((item) => {
    const key = Number(item.actividad_id);
    if (!historyByActivity.has(key)) historyByActivity.set(key, []);
    historyByActivity.get(key).push(item);
  });
  return activities.map((item) => normalizeLiveActivity(
    item,
    usersById,
    tasksById,
    brandsById,
    storesById,
    historyByActivity.get(Number(item.id)) || []
  ));
}

async function taskWithScoringRules(taskId) {
  const tableName = await getTaskTableName();
  const [taskResult, rulesResult] = await Promise.all([
    supabase.from(tableName).select("*").eq("id", taskId).maybeSingle(),
    supabase.from("reglas_puntaje").select("*").eq("tarea_id", taskId)
  ]);
  if (taskResult.error) throw taskResult.error;
  if (rulesResult.error) throw rulesResult.error;
  return taskResult.data ? applyScoringRules(taskResult.data, rulesResult.data || []) : null;
}

async function validateLiveActivityContext(body) {
  const taskId = Number(body.tarea_id);
  const workerId = Number(body.trabajador_id);
  if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isInteger(workerId) || workerId <= 0) {
    throw new Error("Operante y tarea son obligatorios.");
  }
  const [task, workerResult] = await Promise.all([
    taskWithScoringRules(taskId),
    supabase.from("usuarios").select("id,rol,activo").eq("id", workerId).maybeSingle()
  ]);
  if (!task || !isActive(task.activo) || !isGroupLeaderTimeTask(task)) {
    throw new Error("Selecciona una tarea por tiempo valida.");
  }
  if (workerResult.error || !workerResult.data || normalizeRole(workerResult.data.rol) !== "operante" || !isActive(workerResult.data.activo)) {
    throw new Error("Selecciona un operante activo.");
  }
  return { task, taskId, workerId };
}

async function insertLiveActivityHistory(activityId, quantity, userId, type, points = null) {
  let result = await supabase.from("actividades_jefe_equipo_historial").insert({
    actividad_id: activityId,
    cantidad: quantity,
    registrado_por: userId,
    tipo: type,
    puntaje: points
  });
  if (isPrimaryKeySequenceConflict(result.error)) {
    result = await supabase.from("actividades_jefe_equipo_historial").insert({
      id: await nextTableId("actividades_jefe_equipo_historial"),
      actividad_id: activityId,
      cantidad: quantity,
      registrado_por: userId,
      tipo: type,
      puntaje: points
    });
  }
  if (result.error) throw result.error;
}

async function handleCreateLiveGroupLeaderActivity(request, response) {
  try {
    const session = requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const { task, taskId, workerId } = await validateLiveActivityContext(body);
    const start = new Date(body.hora_inicio || "");
    if (Number.isNaN(start.getTime())) {
      sendJson(response, 400, { error: "Selecciona una hora de inicio valida." });
      return;
    }
    if (start.getTime() > Date.now() + 60000) {
      sendJson(response, 400, { error: "La hora de inicio no puede estar en el futuro." });
      return;
    }
    const startLimaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: ATTENDANCE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(start);
    if (startLimaDate !== currentLimaDate()) {
      sendJson(response, 400, { error: "La hora de inicio debe pertenecer al dia actual en Lima." });
      return;
    }
    const openResult = await supabase.from("actividades_jefe_equipo").select("id").eq("trabajador_id", workerId).eq("estado", "EN_CURSO").maybeSingle();
    if (openResult.error) throw openResult.error;
    if (openResult.data) {
      sendJson(response, 409, { error: "El operante ya tiene una actividad en curso. Finalizala antes de iniciar otra." });
      return;
    }

    const requiresStore = taskUsesStore(task);
    const tiendaId = nullableNumber(body.tienda_id);
    const guideNumber = String(body.numero_guia || body.codigo_guia || "").trim();
    if (requiresStore && !tiendaId) {
      sendJson(response, 400, { error: `Selecciona una tienda para ${taskTitle(task)}.` });
      return;
    }
    if (guideNumber && !isGuideBreakdownTask(task)) {
      sendJson(response, 400, { error: "El numero de guia no esta disponible para esta tarea." });
      return;
    }
    if (tiendaId) {
      const storeResult = await supabase.from("tiendas").select("id,activo").eq("id", tiendaId).maybeSingle();
      if (storeResult.error || !storeResult.data || !isActive(storeResult.data.activo)) {
        sendJson(response, 400, { error: "Selecciona una tienda activa y valida." });
        return;
      }
    }
    const payload = {
      encargado_id: Number(session.id),
      trabajador_id: workerId,
      tarea_id: taskId,
      fecha_registro: currentLimaDate(),
      hora_inicio: start.toISOString(),
      cantidad: 0,
      puntaje: null,
      numero_guia: guideNumber || null,
      lote: null,
      marca_id: null,
      tienda_id: requiresStore ? tiendaId : null,
      observacion: String(body.observacion || body.detalle || "").trim() || null,
      estado: "EN_CURSO",
      updated_at: new Date().toISOString()
    };
    const result = await supabase.rpc("iniciar_actividad_jefe_equipo", {
      p_encargado_id: payload.encargado_id,
      p_trabajador_id: payload.trabajador_id,
      p_tarea_id: payload.tarea_id,
      p_fecha_registro: payload.fecha_registro,
      p_hora_inicio: payload.hora_inicio,
      p_numero_guia: payload.numero_guia,
      p_lote: payload.lote,
      p_marca_id: payload.marca_id,
      p_tienda_id: payload.tienda_id,
      p_observacion: payload.observacion
    });
    if (result.error?.code === "23505") {
      sendJson(response, 409, { error: "El operante ya tiene una actividad en curso." });
      return;
    }
    if (result.error) throw result.error;
    const createdActivity = Array.isArray(result.data) ? result.data[0] : result.data;
    const activity = (await selectLiveGroupLeaderActivities()).find((item) => Number(item.id) === Number(createdActivity.id));
    sendJson(response, 201, { activity });
  } catch (error) {
    if (/obligatorios|valida|activo/i.test(String(error?.message || "")) && !operationsSchemaMissing(error)) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    handleOperationsError(response, error, "No se pudo iniciar la actividad.");
  }
}

async function handleUpdateLiveGroupLeaderActivity(request, response, activityId) {
  try {
    const session = requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const currentResult = await supabase.from("actividades_jefe_equipo").select("*").eq("id", activityId).maybeSingle();
    if (currentResult.error) throw currentResult.error;
    const current = currentResult.data;
    if (!current) {
      sendJson(response, 404, { error: "Actividad no encontrada." });
      return;
    }
    if (Number(current.encargado_id) !== Number(session.id)) {
      sendJson(response, 403, { error: "Solo el jefe que inicio la actividad puede actualizarla." });
      return;
    }
    if (current.estado !== "EN_CURSO") {
      sendJson(response, 409, { error: "La actividad ya fue finalizada y no admite mas cambios." });
      return;
    }
    const task = await taskWithScoringRules(current.tarea_id);
    if (!task || !isActive(task.activo) || !isGroupLeaderTimeTask(task)) {
      sendJson(response, 409, { error: "La tarea de esta actividad ya no esta activa o disponible." });
      return;
    }
    const supportsMetadata = isEtiquetadoTask(task);
    const hasBrandField = Object.hasOwn(body, "marca_id");
    const hasLoteField = Object.hasOwn(body, "lote");
    const hasUnexpectedBrand = hasBrandField && body.marca_id !== null && body.marca_id !== "";
    const hasUnexpectedLote = hasLoteField && String(body.lote || "").trim() !== "";
    if (!supportsMetadata && (hasUnexpectedBrand || hasUnexpectedLote || Boolean(body.actualizar_datos))) {
      sendJson(response, 400, { error: "Marca y lote solo estan disponibles para la tarea Etiquetado." });
      return;
    }
    let marcaId = supportsMetadata
      ? (hasBrandField ? nullableNumber(body.marca_id) : nullableNumber(current.marca_id))
      : null;
    const lote = supportsMetadata
      ? (hasLoteField ? String(body.lote || "").trim().toUpperCase() || null : current.lote || null)
      : null;
    if (lote && lote.length > 100) {
      sendJson(response, 400, { error: "El codigo de lote no puede superar 100 caracteres." });
      return;
    }
    if (hasBrandField && body.marca_id !== null && body.marca_id !== "" && (!Number.isInteger(marcaId) || marcaId <= 0)) {
      sendJson(response, 400, { error: "Selecciona una marca valida." });
      return;
    }
    if (marcaId) {
      const brandResult = await supabase.from("marcas").select("*").eq("id", marcaId).maybeSingle();
      if (brandResult.error) throw brandResult.error;
      if (!brandResult.data || !isActive(brandResult.data.activo)) {
        sendJson(response, 400, { error: "Selecciona una marca activa y valida." });
        return;
      }
    }
    const metadataOnly = Boolean(body.actualizar_datos);
    const quantity = metadataOnly ? Number(current.cantidad || 0) : Number(body.cantidad);
    if (!Number.isInteger(quantity) || quantity < 0) {
      sendJson(response, 400, { error: "La cantidad debe ser un numero entero mayor o igual a cero." });
      return;
    }
    if (quantity < Number(current.cantidad || 0)) {
      sendJson(response, 400, { error: "La cantidad no puede ser menor que la ultima cantidad registrada." });
      return;
    }
    const finishRequested = Boolean(body.finalizar) || Boolean(body.hora_fin);
    if (metadataOnly && finishRequested) {
      sendJson(response, 400, { error: "Guarda los datos o finaliza la actividad, pero no ambas acciones en modo solo datos." });
      return;
    }
    const metadataChanged = supportsMetadata && (
      Number(marcaId || 0) !== Number(current.marca_id || 0) ||
      String(lote || "") !== String(current.lote || "")
    );
    if (!finishRequested && quantity === Number(current.cantidad || 0) && !metadataChanged && !metadataOnly) {
      sendJson(response, 400, { error: "Ingresa una cantidad mayor para registrar un nuevo avance." });
      return;
    }

    if (!finishRequested) {
      const updateResult = await supabase.rpc("actualizar_actividad_jefe_equipo", {
        p_actividad_id: activityId,
        p_encargado_id: Number(session.id),
        p_cantidad: quantity,
        p_hora_fin: null,
        p_marca_id: marcaId,
        p_lote: lote,
        p_actualizar_datos: metadataChanged || metadataOnly
      });
      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) {
        sendJson(response, 409, { error: "La actividad fue modificada por otra solicitud. Actualiza la pantalla." });
        return;
      }
      const activity = (await selectLiveGroupLeaderActivities()).find((item) => Number(item.id) === Number(activityId));
      sendJson(response, 200, { activity });
      return;
    }

    if (quantity <= 0) {
      sendJson(response, 400, { error: "Para finalizar, la cantidad debe ser mayor a cero." });
      return;
    }
    if (supportsMetadata && !marcaId) {
      sendJson(response, 400, { error: "Selecciona una marca antes de finalizar la actividad de Etiquetado." });
      return;
    }
    const finish = new Date(body.hora_fin || "");
    const start = new Date(current.hora_inicio);
    if (Number.isNaN(finish.getTime()) || finish <= start || finish.getTime() > Date.now() + 60000) {
      sendJson(response, 400, { error: "La hora fin debe ser posterior al inicio y no puede estar en el futuro." });
      return;
    }
    const closeResult = await supabase.rpc("actualizar_actividad_jefe_equipo", {
      p_actividad_id: activityId,
      p_encargado_id: Number(session.id),
      p_cantidad: quantity,
      p_hora_fin: finish.toISOString(),
      p_marca_id: marcaId,
      p_lote: lote,
      p_actualizar_datos: supportsMetadata
    });
    if (closeResult.error?.code === "23514") {
      sendJson(response, 409, { error: closeResult.error.message || "La actividad o sus reglas cambiaron. Actualiza la pantalla e intenta nuevamente." });
      return;
    }
    if (closeResult.error) throw closeResult.error;
    const activity = (await selectLiveGroupLeaderActivities()).find((item) => Number(item.id) === Number(activityId));
    sendJson(response, 200, { activity });
  } catch (error) {
    handleOperationsError(response, error, "No se pudo actualizar la actividad.");
  }
}

async function handleCancelLiveGroupLeaderActivity(request, response, activityId) {
  try {
    const session = requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const currentResult = await supabase.from("actividades_jefe_equipo").select("id,encargado_id,estado,registro_tarea_id").eq("id", activityId).maybeSingle();
    if (currentResult.error) throw currentResult.error;
    if (!currentResult.data) {
      sendJson(response, 404, { error: "Actividad no encontrada." });
      return;
    }
    if (Number(currentResult.data.encargado_id) !== Number(session.id)) {
      sendJson(response, 403, { error: "Solo el jefe que inicio la actividad puede cancelarla." });
      return;
    }
    if (currentResult.data.estado !== "EN_CURSO" || currentResult.data.registro_tarea_id) {
      sendJson(response, 409, { error: "Solo se pueden cancelar actividades que siguen en curso." });
      return;
    }
    const deleteResult = await supabase.from("actividades_jefe_equipo").delete().eq("id", activityId).eq("estado", "EN_CURSO").select("id").maybeSingle();
    if (deleteResult.error) throw deleteResult.error;
    sendJson(response, 200, { deleted: Boolean(deleteResult.data) });
  } catch (error) {
    handleOperationsError(response, error, "No se pudo cancelar la actividad.");
  }
}

async function loadIncidentData() {
  const tableName = await getTaskTableName();
  const [usersResult, tasksResult, storesResult, incidentsResult] = await Promise.all([
    supabase.from("usuarios").select("id,nombre,email,rol,activo").order("id", { ascending: true }),
    supabase.from(tableName).select("id,nombre,activo").order("id", { ascending: true }),
    supabase.from("tiendas").select("id,nombre,activo").order("id", { ascending: true }),
    supabase
      .from("incidentes")
      .select("id,turno,nombre,tarea_id,tarea_nombre,tienda_id,numero_guia,observacion,tipo_error,created_by,created_at,usuario_id")
      .order("created_at", { ascending: false })
  ]);

  if (usersResult.error) throw usersResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (storesResult.error) throw storesResult.error;
  if (incidentsResult.error) throw incidentsResult.error;

  const stores = (storesResult.data || []).filter((store) => isActive(store.activo));
  const storeNames = new Map((storesResult.data || []).map((store) => [Number(store.id), store.nombre]));
  const incidents = (incidentsResult.data || []).map((incident) => ({
    ...incident,
    tienda_nombre: storeNames.get(Number(incident.tienda_id)) || ""
  }));

  return {
    workers: (usersResult.data || []).filter(
      (user) => normalizeRole(user.rol) === "operante" && isActive(user.activo)
    ),
    tasks: (tasksResult.data || []).filter((task) => isActive(task.activo)),
    stores,
    incidents
  };
}

async function handleIncidentContext(request, response) {
  try {
    if (!requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"])) return;
    sendJson(response, 200, await loadIncidentData());
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar las incidencias." });
  }
}

async function handleCreateIncident(request, response) {
  try {
    const session = requireSessionRole(request, response, ["jefe de equipo", "jefe de grupo"]);
    if (!session) return;
    const body = JSON.parse((await readBody(request)) || "{}");
    const workerId = Number(body.usuario_id);
    const taskId = Number(body.tarea_id);
    const storeId = Number(body.tienda_id);
    const turno = String(body.turno || "").trim().toLowerCase();
    const guideNumber = String(body.numero_guia || "").trim();
    const errorType = String(body.tipo_error || "").trim().toUpperCase();

    if (![workerId, taskId, storeId].every((id) => Number.isInteger(id) && id > 0)) {
      sendJson(response, 400, { error: "Operante, tarea y tienda son obligatorios." });
      return;
    }
    if (!turno || !guideNumber || !errorType) {
      sendJson(response, 400, { error: "Turno, número de guía y tipo de error son obligatorios." });
      return;
    }
    if (!["CONTENIDO", "LIBERADO"].includes(errorType)) {
      sendJson(response, 400, { error: "El tipo de error debe ser CONTENIDO o LIBERADO." });
      return;
    }
    if (!["turno regular", "incidencia", "turno extra"].includes(turno)) {
      sendJson(response, 400, { error: "Selecciona un turno valido." });
      return;
    }

    const tableName = await getTaskTableName();
    const [workerResult, taskResult, storeResult] = await Promise.all([
      supabase.from("usuarios").select("id,nombre,email,rol,activo").eq("id", workerId).maybeSingle(),
      supabase.from(tableName).select("id,nombre,activo").eq("id", taskId).maybeSingle(),
      supabase.from("tiendas").select("id,nombre,activo").eq("id", storeId).maybeSingle()
    ]);

    const worker = workerResult.data;
    const task = taskResult.data;
    const store = storeResult.data;
    if (workerResult.error || !worker || normalizeRole(worker.rol) !== "operante" || !isActive(worker.activo)) {
      sendJson(response, 400, { error: "Selecciona un operante activo." });
      return;
    }
    if (taskResult.error || !task || !isActive(task.activo)) {
      sendJson(response, 400, { error: "Selecciona una tarea activa." });
      return;
    }
    if (storeResult.error || !store || !isActive(store.activo)) {
      sendJson(response, 400, { error: "Selecciona una tienda activa." });
      return;
    }

    const payload = {
      turno,
      nombre: worker.nombre || worker.email || `Usuario ${worker.id}`,
      tarea_id: task.id,
      tarea_nombre: taskTitle(task),
      tienda_id: store.id,
      numero_guia: guideNumber,
      observacion: body.observacion ? String(body.observacion).trim() : null,
      tipo_error: errorType,
      created_by: Number(session.id),
      usuario_id: worker.id
    };
    let result = await supabase.from("incidentes").insert(payload).select("*").single();
    if (isPrimaryKeySequenceConflict(result.error)) {
      result = await supabase
        .from("incidentes")
        .insert({ ...payload, id: await nextTableId("incidentes") })
        .select("*")
        .single();
    }
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }
    sendJson(response, 201, { incident: { ...result.data, tienda_nombre: store.nombre } });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo guardar la incidencia." });
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
    ".svg": "image/svg+xml"
  };
  return types[extension] || "application/octet-stream";
}

function serveStatic(request, response) {
  if (!fs.existsSync(distDir)) {
    sendJson(response, 404, { error: "Ejecuta npm.cmd run build antes de usar npm.cmd start." });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  let filePath = path.resolve(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, "index.html");
  }

  response.writeHead(200, { "content-type": contentTypeFor(filePath) });
  fs.createReadStream(filePath).pipe(response);
}

export async function handleRequest(request, response, { serveFiles = true } = {}) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const apiUrl = new URL(request.url, `http://${request.headers.host}`);
  const apiPath = decodeURIComponent(apiUrl.pathname);
  const trainingProfileMatch = apiPath.match(/^\/api\/users\/(\d+)\/trainings\/?$/);
  const trainingCourseMatch = apiPath.match(/^\/api\/users\/(\d+)\/trainings\/(CAP\s+\d+)\/?$/i);
  const attendanceReportSettingMatch = apiPath.match(/^\/api\/attendance-report\/settings\/(\d+)\/?$/);
  const attendanceReportSendMatch = apiPath.match(/^\/api\/attendance-report\/settings\/(\d+)\/send\/?$/);
  const activityReportSettingMatch = apiPath.match(/^\/api\/activity-report\/settings\/(\d+)\/?$/);
  const activityReportSendMatch = apiPath.match(/^\/api\/activity-report\/settings\/(\d+)\/send\/?$/);
  const activityReportPreviewMatch = apiPath.match(/^\/api\/activity-report\/settings\/(\d+)\/preview\/?$/);
  const groupLeaderActivityMatch = apiPath.match(/^\/api\/group-leader\/activities\/(\d+)\/?$/);

  if (/^\/api\/health\/?$/.test(apiPath) && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      apiVersion: 7,
      features: [
        "attendance-report",
        "attendance-report-schedules",
        "activity-report-shifts",
        "activity-report-schedules",
        "attendance-early-exit",
        "live-group-activities",
        "live-footwear-dashboard"
      ]
    });
    return;
  }

  if (trainingProfileMatch && request.method === "GET") {
    await handleReadUserTrainingProfile(request, response, Number(trainingProfileMatch[1]));
    return;
  }

  if (trainingCourseMatch && request.method === "PUT") {
    await handleUpdateUserTraining(
      request,
      response,
      Number(trainingCourseMatch[1]),
      trainingCourseMatch[2].toUpperCase().replace(/\s+/g, " ")
    );
    return;
  }

  if (request.url?.startsWith("/api/login") && request.method === "POST") {
    await handleLogin(request, response);
    return;
  }

  if (/^\/api\/dashboard\/?$/.test(apiPath) && request.method === "GET") {
    await handleReadFootwearDashboard(request, response);
    return;
  }

  if (request.url?.startsWith("/api/users") && request.method === "GET") {
    await handleReadUsers(request, response);
    return;
  }

  if (request.url?.startsWith("/api/brands") && request.method === "GET") {
    await handleReadBrands(request, response);
    return;
  }

  if (request.url?.startsWith("/api/users/") && ["PATCH", "DELETE"].includes(request.method)) {
    const userId = Number(new URL(request.url, `http://${request.headers.host}`).pathname.split("/").pop());
    if (request.method === "PATCH") await handleUpdateUser(request, response, userId);
    else await handleDeleteUser(request, response, userId);
    return;
  }

  if (request.url?.startsWith("/api/users") && request.method === "POST") {
    await handleCreateUser(request, response);
    return;
  }

  if (request.url?.startsWith("/api/tasks/") && ["PATCH", "DELETE"].includes(request.method)) {
    const taskId = Number(new URL(request.url, `http://${request.headers.host}`).pathname.split("/").pop());
    if (request.method === "PATCH") await handleUpdateTask(request, response, taskId);
    else await handleDeleteTask(request, response, taskId);
    return;
  }

  if (request.url?.startsWith("/api/tasks") && request.method === "GET") {
    await handleReadTasks(request, response);
    return;
  }

  if (request.url?.startsWith("/api/tasks") && request.method === "POST") {
    await handleCreateTask(request, response);
    return;
  }

  if (request.url?.startsWith("/api/task-score-ranges") && request.method === "GET") {
    await handleReadTaskScoreRanges(request, response);
    return;
  }

  if (request.url?.startsWith("/api/task-score-ranges") && request.method === "PUT") {
    await handleReplaceTaskScoreRanges(request, response);
    return;
  }

  if (request.url?.startsWith("/api/task-score-ranges") && request.method === "DELETE") {
    await handleDeleteTaskScoreRanges(request, response);
    return;
  }

  if (request.url?.startsWith("/api/stores/") && ["PATCH", "DELETE"].includes(request.method)) {
    const storeId = Number(new URL(request.url, `http://${request.headers.host}`).pathname.split("/").pop());
    if (request.method === "PATCH") await handleUpdateStore(request, response, storeId);
    else await handleDeleteStore(request, response, storeId);
    return;
  }

  if (request.url?.startsWith("/api/stores") && request.method === "GET") {
    await handleReadStores(request, response);
    return;
  }

  if (request.url?.startsWith("/api/stores") && request.method === "POST") {
    await handleCreateStore(request, response);
    return;
  }

  if (request.url?.startsWith("/api/amonestaciones/") && request.method === "DELETE") {
    const amonestacionId = Number(new URL(request.url, `http://${request.headers.host}`).pathname.split("/").pop());
    await handleDeleteAmonestacion(request, response, amonestacionId);
    return;
  }

  if (request.url?.startsWith("/api/amonestaciones") && request.method === "GET") {
    await handleReadAmonestaciones(request, response);
    return;
  }

  if (request.url?.startsWith("/api/amonestaciones") && request.method === "POST") {
    await handleCreateAmonestacion(request, response);
    return;
  }

  if (/^\/api\/attendance-report\/settings\/?$/.test(apiPath) && request.method === "GET") {
    await handleReadAttendanceReportSettings(request, response);
    return;
  }

  if (/^\/api\/attendance-report\/settings\/?$/.test(apiPath) && request.method === "POST") {
    await handleCreateAttendanceReportSettings(request, response);
    return;
  }

  if (/^\/api\/attendance-report\/settings\/?$/.test(apiPath) && request.method === "PUT") {
    await handleUpdateAttendanceReportSettings(request, response);
    return;
  }

  if (attendanceReportSendMatch && request.method === "POST") {
    await handleSendAttendanceReport(request, response, Number(attendanceReportSendMatch[1]));
    return;
  }

  if (attendanceReportSettingMatch && request.method === "PUT") {
    await handleUpdateAttendanceReportSettings(request, response, Number(attendanceReportSettingMatch[1]));
    return;
  }

  if (attendanceReportSettingMatch && request.method === "DELETE") {
    await handleDeleteAttendanceReportSettings(request, response, Number(attendanceReportSettingMatch[1]));
    return;
  }

  if (/^\/api\/attendance-report\/send\/?$/.test(apiPath) && request.method === "POST") {
    await handleSendAttendanceReport(request, response);
    return;
  }

  if (/^\/api\/activity-report\/settings\/?$/.test(apiPath) && request.method === "GET") {
    await handleReadActivityReportSettings(request, response);
    return;
  }

  if (/^\/api\/activity-report\/settings\/?$/.test(apiPath) && request.method === "POST") {
    await handleCreateActivityReportSettings(request, response);
    return;
  }

  if (/^\/api\/activity-report\/settings\/?$/.test(apiPath) && request.method === "PUT") {
    await handleUpdateActivityReportSettings(request, response);
    return;
  }

  if (activityReportSendMatch && request.method === "POST") {
    await handleSendActivityReport(request, response, Number(activityReportSendMatch[1]));
    return;
  }

  if (activityReportPreviewMatch && request.method === "GET") {
    await handlePreviewActivityReport(request, response, Number(activityReportPreviewMatch[1]));
    return;
  }

  if (activityReportSettingMatch && request.method === "PUT") {
    await handleUpdateActivityReportSettings(request, response, Number(activityReportSettingMatch[1]));
    return;
  }

  if (activityReportSettingMatch && request.method === "DELETE") {
    await handleDeleteActivityReportSettings(request, response, Number(activityReportSettingMatch[1]));
    return;
  }

  if (/^\/api\/activity-report\/preview\/?$/.test(apiPath) && request.method === "GET") {
    await handlePreviewActivityReport(request, response);
    return;
  }

  if (/^\/api\/activity-report\/send\/?$/.test(apiPath) && request.method === "POST") {
    await handleSendActivityReport(request, response);
    return;
  }

  if (request.url?.startsWith("/api/attendances") && request.method === "GET") {
    await handleReadAttendances(request, response);
    return;
  }

  if (request.url?.startsWith("/api/attendances") && request.method === "PUT") {
    await handleMarkAttendance(request, response);
    return;
  }

  if (request.url?.startsWith("/api/activity-logs") && request.method === "GET") {
    await handleReadActivityLogs(request, response);
    return;
  }

  if (request.url?.startsWith("/api/activity-logs") && request.method === "POST") {
    await handleCreateActivityLog(request, response);
    return;
  }

  if (request.url?.startsWith("/api/group-leader/context") && request.method === "GET") {
    await handleGroupLeaderContext(request, response);
    return;
  }

  if (/^\/api\/group-leader\/activities\/?$/.test(apiPath) && request.method === "POST") {
    await handleCreateLiveGroupLeaderActivity(request, response);
    return;
  }

  if (groupLeaderActivityMatch && request.method === "PUT") {
    await handleUpdateLiveGroupLeaderActivity(request, response, Number(groupLeaderActivityMatch[1]));
    return;
  }

  if (groupLeaderActivityMatch && request.method === "DELETE") {
    await handleCancelLiveGroupLeaderActivity(request, response, Number(groupLeaderActivityMatch[1]));
    return;
  }

  if (request.url?.startsWith("/api/group-leader/records") && request.method === "POST") {
    await handleCreateGroupLeaderRecord(request, response);
    return;
  }

  if (request.url?.startsWith("/api/incidents/context") && request.method === "GET") {
    await handleIncidentContext(request, response);
    return;
  }

  if (request.url?.startsWith("/api/incidents") && request.method === "POST") {
    await handleCreateIncident(request, response);
    return;
  }

  if (apiPath === "/api" || apiPath.startsWith("/api/")) {
    sendJson(response, 404, { error: "Ruta de API no encontrada." });
    return;
  }
  if (serveFiles) serveStatic(request, response);
  else sendJson(response, 404, { error: "Ruta de API no encontrada." });
}

const isMainModule = modulePath && process.argv[1] && path.resolve(process.argv[1]) === modulePath;
if (isMainModule) {
  const server = http.createServer((request, response) => handleRequest(request, response));
  server.listen(port, "127.0.0.1", () => {
    console.log(`Servidor local listo en http://127.0.0.1:${port}`);
  });
}
