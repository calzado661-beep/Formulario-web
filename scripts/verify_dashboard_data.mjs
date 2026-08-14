import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildDashboardPayroll, buildTaggedPairsByBrand } from "../src/lib/dashboardMetrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const fileEnv = Object.fromEntries(envText.split(/\r?\n/).flatMap((rawLine) => {
  const line = rawLine.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const index = line.indexOf("=");
  return [[line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(?:"|')|(?:"|')$/g, "")]];
}));
const env = { ...fileEnv, ...process.env };
const apiBase = String(env.DASHBOARD_API_URL || "http://127.0.0.1:5180").replace(/\/$/, "");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function selectAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const result = await db.from(table).select("*").order("id", { ascending: true }).range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}

function sessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: Number(user.id),
    rol: "administrador",
    exp: Date.now() + 10 * 60 * 1000
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.API_SESSION_SECRET || env.SUPABASE_SECRET_KEY)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

const [adminResult, users, tasks, brands, workerRecords, leaderRecords, attendances, incidents, warnings, movements] = await Promise.all([
  db.from("usuarios").select("id,rol").ilike("rol", "administrador").limit(1).single(),
  selectAll("usuarios"),
  selectAll("tarea"),
  selectAll("marcas"),
  selectAll("registros_tareas"),
  selectAll("registros_tareas_jefe_equipo"),
  selectAll("asistencias"),
  selectAll("incidentes"),
  selectAll("amonestaciones"),
  selectAll("movimientos_personal")
]);
if (adminResult.error) throw adminResult.error;

const response = await fetch(`${apiBase}/api/dashboard`, {
  headers: { authorization: `Bearer ${sessionToken(adminResult.data)}` }
});
assert.equal(response.status, 200, `El dashboard respondio HTTP ${response.status}.`);
assert.match(response.headers.get("cache-control") || "", /no-store/i);
const dashboard = await response.json();

assert.equal(dashboard.workers.length, users.length);
assert.equal(dashboard.tasks.length, tasks.length);
assert.equal(dashboard.brands.length, brands.length);
assert.equal(dashboard.activities.length, workerRecords.length + leaderRecords.length);
assert.equal(dashboard.attendances.length, attendances.length);
assert.equal(dashboard.incidents.length, incidents.length);
assert.equal(dashboard.warnings.length, warnings.length);
assert.equal(dashboard.movements.length, movements.length);

const expectedIds = new Set([
  ...workerRecords.map((row) => `operante-${row.id}`),
  ...leaderRecords.map((row) => `jefe-equipo-${row.id}`)
]);
assert.equal(new Set(dashboard.activities.map((row) => row.id)).size, expectedIds.size);
dashboard.activities.forEach((row) => assert(expectedIds.has(row.id), `Actividad inesperada ${row.id}.`));

const rawById = new Map([
  ...workerRecords.map((row) => [`operante-${row.id}`, row]),
  ...leaderRecords.map((row) => [`jefe-equipo-${row.id}`, row])
]);
dashboard.activities.forEach((row) => {
  const raw = rawById.get(row.id);
  assert.equal(row.quantity, Number(raw.cantidad || 0));
  if (raw.puntaje !== null && raw.puntaje !== undefined) assert.equal(row.points, Number(raw.puntaje));
});

const taskById = new Map(dashboard.tasks.map((task) => [task.id, task]));
const brandById = new Map(dashboard.brands.map((brand) => [brand.id, brand.name]));
const taggedPairs = buildTaggedPairsByBrand(dashboard.activities, taskById, brandById);
const taggedPairsTotal = taggedPairs.reduce((sum, item) => sum + item.value, 0);
const etiquetadoId = tasks.find((task) => String(task.nombre || "").trim().toLowerCase() === "etiquetado")?.id;
const expectedTaggedPairs = [...workerRecords, ...leaderRecords]
  .filter((row) => Number(row.tarea_id) === Number(etiquetadoId) && row.marca_id)
  .reduce((sum, row) => sum + Math.max(0, Number(row.cantidad || 0)), 0);
assert.equal(taggedPairsTotal, expectedTaggedPairs);

const years = dashboard.years.map(Number);
const expectedPayroll = buildDashboardPayroll(users, years, {
  normalizeRole: (role) => String(role || "otros").trim().toLowerCase()
});
assert.deepEqual(dashboard.payrollByRole, expectedPayroll.byRole);
assert.deepEqual(dashboard.payrollByWorker, expectedPayroll.byWorker);

console.log(JSON.stringify({
  ok: true,
  generatedAt: dashboard.generatedAt,
  workers: dashboard.workers.length,
  activities: dashboard.activities.length,
  storedScoreTotal: [...workerRecords, ...leaderRecords].reduce((sum, row) => sum + Number(row.puntaje || 0), 0),
  dashboardScoreTotal: dashboard.activities.reduce((sum, row) => sum + Number(row.points || 0), 0),
  taggedPairs: taggedPairsTotal,
  attendances: dashboard.attendances.length,
  incidents: dashboard.incidents.length
}, null, 2));
