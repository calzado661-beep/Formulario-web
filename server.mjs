import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function handleLogin(request, response) {
  try {
    const rawBody = await readBody(request);
    const body = JSON.parse(rawBody || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      sendJson(response, 400, { error: "Completa correo y contrasena." });
      return;
    }

    const result = await supabase
      .from("usuarios")
      .select("id,nombre,email,rol,activo,created_at,fecha_cumpleanos")
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

function isActive(value) {
  return !["false", "0", "no"].includes(String(value ?? true).trim().toLowerCase());
}

function taskTitle(task) {
  return String(task?.nombre || task?.titulo || "");
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function normalizeActivityLog(row) {
  const normalized = { ...row };
  if ("usuario_id" in normalized && !("trabajador_id" in normalized)) {
    normalized.trabajador_id = normalized.usuario_id;
  }
  if ("observacion" in normalized && !("detalle" in normalized)) {
    normalized.detalle = normalized.observacion;
  }
  if ("dato_extra" in normalized && !("tiempo_minutos" in normalized)) {
    const parsed = Number(normalized.dato_extra);
    normalized.tiempo_minutos = Number.isNaN(parsed) ? normalized.dato_extra : parsed;
  }
  if ("tarea" in normalized && !("actividad_nombre" in normalized)) {
    normalized.actividad_nombre = normalized.tarea;
  }
  return normalized;
}

function taskPayloadForDb(body) {
  const payload = {
    nombre: body.nombre ?? body.titulo,
    tipo_medicion: body.tipo_medicion,
    activo: body.activo,
    requiere_dato_extra: body.requiere_dato_extra,
    nombre_dato_extra: body.nombre_dato_extra,
    puntaje_fijo: body.puntaje_fijo,
    puntos_turno_simple: body.puntos_turno_simple ?? body.puntaje_turno_simple,
    puntos_turno_completo: body.puntos_turno_completo ?? body.puntaje_turno_completo,
    tipo_tarea: body.tipo_tarea
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
  const result = await supabase
    .from("usuarios")
    .select("id,nombre,email,rol,activo,created_at,fecha_cumpleanos")
    .order("id", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

function userPayloadForDb(body, { creating = false } = {}) {
  const payload = {
    nombre: body.nombre === undefined ? undefined : String(body.nombre).trim(),
    email: body.email === undefined ? undefined : String(body.email).trim().toLowerCase(),
    rol: body.rol === undefined ? undefined : normalizeRole(body.rol),
    activo: body.activo,
    fecha_cumpleanos: body.fecha_cumpleanos || null,
    password_hash: body.password_hash === undefined ? undefined : String(body.password_hash)
  };

  if (creating && (!payload.nombre || !payload.email || !payload.password_hash)) {
    throw new Error("Nombre, correo y contrasena son obligatorios.");
  }

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function userMutationError(response, error, fallback) {
  if (error?.code === "23505") {
    sendJson(response, 409, { error: "Ya existe un usuario con ese correo." });
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
    const result = await supabase.from("usuarios").insert(userPayloadForDb(body, { creating: true })).select("*").single();
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
    const payload = userPayloadForDb(body);
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
    const { password_hash: _passwordHash, password: _password, ...user } = result.data;
    sendJson(response, 200, { user });
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
    const result = await supabase.from("usuarios").delete().eq("id", userId).select("id").maybeSingle();
    if (result.error) {
      userMutationError(response, result.error, "No se pudo eliminar el usuario.");
      return;
    }
    if (!result.data) {
      sendJson(response, 404, { error: "Usuario no encontrado." });
      return;
    }
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo eliminar el usuario." });
  }
}

async function selectTasks() {
  const result = await supabase.from("tareas").select("*").order("id", { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function selectTaskScoreRanges(taskId = null) {
  let query = supabase.from("rangos_puntaje").select("*").order("puntos", { ascending: true });
  if (taskId) query = query.eq("tarea_id", taskId);
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

async function selectActivityLogs(workerId = null) {
  const resources = [
    { table: "v_registro_actividades", userColumn: "usuario_id", orderColumn: "fecha_registro" },
    { table: "registros_tareas", userColumn: "usuario_id", orderColumn: "created_at" }
  ];

  let lastError = null;
  for (const resource of resources) {
    let query = supabase.from(resource.table).select("*");
    if (workerId) query = query.eq(resource.userColumn, workerId);
    query = query.order(resource.orderColumn, { ascending: false });

    const result = await query;
    if (!result.error) return (result.data || []).map(normalizeActivityLog);
    lastError = result.error;
  }

  throw lastError || new Error("No se pudieron leer los registros de actividades.");
}

async function handleReadUsers(_request, response) {
  try {
    sendJson(response, 200, { users: await selectUsers() });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los usuarios." });
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
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = taskPayloadForDb(body);
    if (!String(payload.nombre || "").trim()) {
      sendJson(response, 400, { error: "El nombre de la tarea es obligatorio." });
      return;
    }

    const result = await supabase.from("tareas").insert(payload).select("*").single();
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
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = taskPayloadForDb(body);
    const result = await supabase.from("tareas").update(payload).eq("id", taskId).select("*").single();
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    sendJson(response, 200, { task: result.data });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo actualizar la tarea." });
  }
}

async function handleReadTaskScoreRanges(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const taskId = url.searchParams.get("taskId");
    sendJson(response, 200, { ranges: await selectTaskScoreRanges(taskId) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los rangos." });
  }
}

async function handleReplaceTaskScoreRanges(request, response) {
  try {
    const body = JSON.parse((await readBody(request)) || "{}");
    const taskId = Number(body.taskId || body.tarea_id);
    const ranges = Array.isArray(body.ranges) ? body.ranges : [];
    if (!taskId) {
      sendJson(response, 400, { error: "La tarea es obligatoria." });
      return;
    }

    const deleteResult = await supabase.from("rangos_puntaje").delete().eq("tarea_id", taskId);
    if (deleteResult.error) {
      sendJson(response, 500, { error: deleteResult.error.message });
      return;
    }

    if (ranges.length) {
      const payload = ranges.map((item) => ({
        tarea_id: taskId,
        cantidad_desde: nullableNumber(item.cantidad_desde) ?? 0,
        cantidad_hasta: nullableNumber(item.cantidad_hasta),
        puntos: nullableNumber(item.puntos) ?? 0
      }));
      const insertResult = await supabase.from("rangos_puntaje").insert(payload);
      if (insertResult.error) {
        sendJson(response, 500, { error: insertResult.error.message });
        return;
      }
    }

    sendJson(response, 200, { ranges: await selectTaskScoreRanges(taskId) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron guardar los rangos." });
  }
}

async function handleDeleteTaskScoreRanges(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const taskId = Number(url.searchParams.get("taskId"));
    if (!taskId) {
      sendJson(response, 400, { error: "La tarea es obligatoria." });
      return;
    }
    const result = await supabase.from("rangos_puntaje").delete().eq("tarea_id", taskId);
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron eliminar los rangos." });
  }
}

async function handleReadActivityLogs(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const workerId = url.searchParams.get("workerId");
    sendJson(response, 200, { logs: await selectActivityLogs(workerId) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los registros." });
  }
}

async function handleCreateActivityLog(request, response) {
  try {
    const body = JSON.parse((await readBody(request)) || "{}");
    const payload = {
      usuario_id: Number(body.usuario_id || body.trabajador_id),
      tarea_id: Number(body.tarea_id),
      fecha_registro: body.fecha_registro ? String(body.fecha_registro) : new Date().toISOString().slice(0, 10),
      cantidad: nullableNumber(body.cantidad),
      turno: body.turno ? String(body.turno) : null,
      dato_extra: nullableNumber(body.dato_extra ?? body.tiempo_minutos),
      observacion: body.observacion || body.detalle ? String(body.observacion || body.detalle).trim() : null,
      puntos_obtenidos: nullableNumber(body.puntos_obtenidos) ?? 0
    };

    if (!payload.usuario_id || !payload.tarea_id) {
      sendJson(response, 400, { error: "Usuario y tarea son obligatorios." });
      return;
    }

    const result = await supabase.from("registros_tareas").insert(payload).select("*").single();
    if (result.error) {
      sendJson(response, 500, { error: result.error.message });
      return;
    }

    sendJson(response, 201, { log: normalizeActivityLog(result.data) });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudo guardar el registro." });
  }
}

function enrichGroupRecords(records, users, tasks) {
  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const taskById = new Map(tasks.map((task) => [Number(task.id), task]));

  return records.map((record) => {
    const encargado = userById.get(Number(record.encargado_id));
    const trabajador = userById.get(Number(record.trabajador_id));
    const task = taskById.get(Number(record.tarea_id));

    return {
      ...record,
      encargado_nombre: encargado?.nombre || encargado?.email || "",
      encargado_email: encargado?.email || "",
      trabajador_nombre: trabajador?.nombre || trabajador?.email || "",
      trabajador_email: trabajador?.email || "",
      tarea_nombre: record.tarea_nombre || taskTitle(task) || `Tarea ${record.tarea_id}`
    };
  });
}

async function loadGroupLeaderData() {
  const [usersResult, tasksResult, recordsResult] = await Promise.all([
    supabase.from("usuarios").select("id,nombre,email,rol,activo").order("id", { ascending: true }),
    supabase.from("tareas").select("*").order("id", { ascending: true }),
    supabase
      .from("registros_jefe_grupo")
      .select("id,encargado_id,trabajador_id,tarea_id,tarea_nombre,fecha_registro,cantidad,tiempo_minutos,codigo_guia,lote,detalle,created_at")
      .order("created_at", { ascending: false })
  ]);

  if (usersResult.error) throw usersResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (recordsResult.error) throw recordsResult.error;

  const users = usersResult.data || [];
  const tasks = (tasksResult.data || []).filter((task) => isActive(task.activo));
  const workers = users.filter((user) => normalizeRole(user.rol) === "operante" && isActive(user.activo));
  const leaders = users.filter((user) => normalizeRole(user.rol) === "jefe de grupo" && isActive(user.activo));
  const records = enrichGroupRecords(recordsResult.data || [], users, tasks);

  return { workers, tasks, leaders, records };
}

async function handleGroupLeaderContext(request, response) {
  try {
    const data = await loadGroupLeaderData();
    sendJson(response, 200, data);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "No se pudieron cargar los datos." });
  }
}

async function handleCreateGroupLeaderRecord(request, response) {
  try {
    const rawBody = await readBody(request);
    const body = JSON.parse(rawBody || "{}");
    const payload = {
      encargado_id: Number(body.encargado_id),
      trabajador_id: Number(body.trabajador_id),
      tarea_id: Number(body.tarea_id),
      tarea_nombre: body.tarea_nombre ? String(body.tarea_nombre) : null,
      fecha_registro: body.fecha_registro ? String(body.fecha_registro) : new Date().toISOString().slice(0, 10),
      cantidad: body.cantidad === null || body.cantidad === undefined || body.cantidad === "" ? null : Number(body.cantidad),
      tiempo_minutos:
        body.tiempo_minutos === null || body.tiempo_minutos === undefined || body.tiempo_minutos === ""
          ? null
          : Number(body.tiempo_minutos),
      codigo_guia: body.codigo_guia ? String(body.codigo_guia).trim() : null,
      lote: body.lote ? String(body.lote).trim().toUpperCase() : null,
      detalle: body.detalle ? String(body.detalle).trim() : null
    };

    if (!payload.encargado_id || !payload.trabajador_id || !payload.tarea_id) {
      sendJson(response, 400, { error: "Encargado, trabajador y tarea son obligatorios." });
      return;
    }

    const result = await supabase
      .from("registros_jefe_grupo")
      .insert(payload)
      .select("id,encargado_id,trabajador_id,tarea_id,tarea_nombre,fecha_registro,cantidad,tiempo_minutos,codigo_guia,lote,detalle,created_at")
      .single();

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

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.url?.startsWith("/api/login") && request.method === "POST") {
    await handleLogin(request, response);
    return;
  }

  if (request.url?.startsWith("/api/users") && request.method === "GET") {
    await handleReadUsers(request, response);
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

  if (request.url?.startsWith("/api/tasks/") && request.method === "PATCH") {
    const taskId = Number(new URL(request.url, `http://${request.headers.host}`).pathname.split("/").pop());
    await handleUpdateTask(request, response, taskId);
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

  if (request.url?.startsWith("/api/group-leader/records") && request.method === "POST") {
    await handleCreateGroupLeaderRecord(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Servidor local listo en http://127.0.0.1:${port}`);
});
