import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const rows = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  return Object.fromEntries(
    rows
      .map((row) => row.trim())
      .filter((row) => row && !row.startsWith("#") && row.includes("="))
      .map((row) => {
        const index = row.indexOf("=");
        return [row.slice(0, index).trim(), row.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

const env = readEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function configureCatalog() {
  const rename = await supabase
    .from("tareas")
    .update({ nombre: "Clasificado y Rotulado según Género, Talla y Modelo" })
    .eq("nombre", "Clasificado y Rotulado");
  if (rename.error) throw rename.error;

  const timeTasks = ["Etiquetado", "Envío Nuevo", "Visita de Tienda", "Picking", "Embalado y Rotulado de Guía"];
  for (const nombre of timeTasks) {
    const result = await supabase.from("tareas").update({ tipo_medicion: "tiempo" }).eq("nombre", nombre);
    if (result.error) throw result.error;
  }
}

async function migrated() {
  const [tasks, workerBrands, leaderBrands] = await Promise.all([
    supabase.from("tareas").select("id,requiere_marca").limit(1),
    supabase.from("registro_tarea_marcas").select("id").limit(1),
    supabase.from("registro_jefe_grupo_marcas").select("id").limit(1)
  ]);
  return !tasks.error && !workerBrands.error && !leaderBrands.error;
}

if (await migrated()) {
  await configureCatalog();
  console.log(JSON.stringify({ migrated: true, already_applied: true }));
  process.exit(0);
}

const sql = fs.readFileSync("sql/008_tareas_marcas_y_tiempos.sql", "utf8");
const attempts = [
  ["exec_sql", { query: sql }],
  ["exec_sql", { sql }],
  ["run_sql", { query: sql }],
  ["run_sql", { sql }],
  ["execute_sql", { query: sql }],
  ["execute_sql", { sql }]
];

for (const [functionName, payload] of attempts) {
  const result = await supabase.rpc(functionName, payload);
  if (!result.error && (await migrated())) {
    await configureCatalog();
    console.log(JSON.stringify({ migrated: true, applied_with_rpc: functionName }));
    process.exit(0);
  }
}

let catalogConfigured = false;
let catalogError = null;
try {
  await configureCatalog();
  catalogConfigured = true;
} catch (error) {
  catalogError = error.message || String(error);
}

console.log(
  JSON.stringify({
    migrated: false,
    catalog_configured: catalogConfigured,
    catalog_error: catalogError,
    reason: "No hay una RPC SQL habilitada.",
    run_manually: "sql/008_tareas_marcas_y_tiempos.sql"
  })
);
process.exitCode = 2;
