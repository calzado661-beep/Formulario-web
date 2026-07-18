import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const workbookPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!workbookPath) throw new Error("Indica la ruta del archivo Excel.");

function readEnv(path) {
  const values = {};
  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function userSlug(value) {
  return normalizeText(value).replace(/\s+/g, ".");
}

const env = readEnv(".env");
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Faltan credenciales de Supabase en .env.");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const extractorPath = fileURLToPath(new URL("./extract_workers_from_excel.ps1", import.meta.url));
const extractedJson = execFileSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", extractorPath, "-WorkbookPath", workbookPath],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
);
const spreadsheetWorkers = JSON.parse(extractedJson.replace(/^\uFEFF/, ""));

const [usersResult, movementsResult] = await Promise.all([
  db.from("usuarios").select("id,nombre,email,password_hash").order("id", { ascending: true }),
  db.from("movimientos_personal").select("id").order("id", { ascending: true })
]);
if (usersResult.error) throw usersResult.error;
if (movementsResult.error) throw movementsResult.error;

const existingUsers = usersResult.data || [];
const knownNames = new Set(existingUsers.map((user) => normalizeText(user.nombre)).filter(Boolean));
const knownEmails = new Set(existingUsers.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean));
const knownDni = new Set(
  existingUsers.map((user) => String(user.password_hash || "").trim()).filter((value) => /^\d{7,9}$/.test(value))
);
let nextUserId = Math.max(0, ...existingUsers.map((user) => Number(user.id) || 0)) + 1;
let nextMovementId = Math.max(0, ...(movementsResult.data || []).map((item) => Number(item.id) || 0)) + 1;
const skipped = [];
const candidates = [];
const missingDni = [];
const invalidExitDates = [];

for (const worker of spreadsheetWorkers) {
  const normalizedName = normalizeText(worker.name);
  const normalizedFullName = normalizeText(worker.full_name);
  const dni = String(worker.dni || "").replace(/\D/g, "");
  if (knownNames.has(normalizedName) || knownNames.has(normalizedFullName) || (dni && knownDni.has(dni))) {
    skipped.push({ row: worker.row, nombre: worker.name, dni, reason: "existente" });
    continue;
  }

  const baseUsername = userSlug(worker.name) || `usuario.${worker.row}`;
  let username = baseUsername;
  let suffix = 2;
  while (knownEmails.has(username)) username = `${baseUsername}.${suffix++}`;
  const position = normalizeText(worker.position);
  const role = /lider.*equipo/.test(position) ? "jefe de equipo" : /jefe/.test(position) ? "jefe de grupo" : "operante";
  const active = normalizeText(worker.state) === "laborando";
  let exitDate = worker.exit_date || null;
  if (worker.entry_date && exitDate && exitDate < worker.entry_date) {
    invalidExitDates.push({ row: worker.row, nombre: worker.name, ingreso: worker.entry_date, salida: exitDate });
    exitDate = null;
  }
  if (!dni) missingDni.push({ row: worker.row, nombre: worker.name });

  candidates.push({
    id: nextUserId++,
    nombre: worker.name,
    email: username,
    password_hash: dni ? dni.padStart(8, "0") : "00000000",
    rol: role,
    activo: active,
    fecha_cumpleanos: worker.birth_date || null,
    fecha_ingreso: worker.entry_date || null,
    fecha_salida: exitDate
  });
  knownNames.add(normalizedName);
  if (normalizedFullName) knownNames.add(normalizedFullName);
  if (dni) knownDni.add(dni);
  knownEmails.add(username);
}

const movements = [];
for (const worker of candidates) {
  if (worker.fecha_ingreso) {
    movements.push({
      id: nextMovementId++,
      usuario_id: worker.id,
      tipo_movimiento: "Ingreso",
      fecha_movimiento: worker.fecha_ingreso
    });
  }
  if (worker.fecha_salida) {
    movements.push({
      id: nextMovementId++,
      usuario_id: worker.id,
      tipo_movimiento: "Salida",
      fecha_movimiento: worker.fecha_salida
    });
  }
}

let insertedUsers = [];
let insertedMovements = [];
if (!dryRun && candidates.length) {
  const userRows = candidates.map(({ fecha_ingreso, fecha_salida, ...user }) => user);
  const insertUsers = await db.from("usuarios").insert(userRows).select("id,nombre,email,rol,activo");
  if (insertUsers.error) throw insertUsers.error;
  insertedUsers = insertUsers.data || [];
  if (movements.length) {
    const insertMovements = await db.from("movimientos_personal").insert(movements).select("id,usuario_id,tipo_movimiento,fecha_movimiento");
    if (insertMovements.error) {
      await db.from("movimientos_personal").delete().in("usuario_id", insertedUsers.map((user) => user.id));
      await db.from("usuarios").delete().in("id", insertedUsers.map((user) => user.id));
      throw insertMovements.error;
    }
    insertedMovements = insertMovements.data || [];
  }
}

console.log(JSON.stringify({
  ok: true,
  dry_run: dryRun,
  spreadsheet_rows: spreadsheetWorkers.length,
  existing_users_before: existingUsers.length,
  candidates: candidates.length,
  inserted_users: insertedUsers.length,
  skipped_existing: skipped.length,
  inserted_movements: insertedMovements.length,
  active_candidates: candidates.filter((user) => user.activo).length,
  inactive_candidates: candidates.filter((user) => !user.activo).length,
  missing_dni: missingDni,
  invalid_exit_dates: invalidExitDates,
  skipped,
  users: candidates.map((user) => ({ id: user.id, nombre: user.nombre, usuario: user.email, activo: user.activo, rol: user.rol }))
}, null, 2));
