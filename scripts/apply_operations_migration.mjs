import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function migrated() {
  const [attendance, activities, history, records, startRpc, updateRpc] = await Promise.all([
    supabase.from("asistencias").select("id,retiro_anticipado,motivo_retiro,retirado_en,updated_at").limit(1),
    supabase.from("actividades_jefe_equipo").select("id,hora_inicio,hora_fin,cantidad,puntaje,estado,registro_tarea_id,marca_id,lote").limit(1),
    supabase.from("actividades_jefe_equipo_historial").select("id,actividad_id,cantidad,tipo,puntaje").limit(1),
    supabase.from("registros_tareas_jefe_equipo").select("id,puntaje,marca_id,tienda_id,lote").limit(1),
    supabase.rpc("iniciar_actividad_jefe_equipo", {
      p_encargado_id: 0,
      p_trabajador_id: 0,
      p_tarea_id: 0,
      p_fecha_registro: "1900-01-01",
      p_hora_inicio: "1900-01-01T00:00:00Z",
      p_numero_guia: null,
      p_lote: null,
      p_marca_id: null,
      p_tienda_id: null,
      p_observacion: null
    }),
    supabase.rpc("actualizar_actividad_jefe_equipo", {
      p_actividad_id: 0,
      p_encargado_id: 0,
      p_cantidad: 0,
      p_marca_id: null,
      p_lote: null,
      p_actualizar_datos: true
    })
  ]);
  const rpcExists = (result) => !["PGRST202", "PGRST203", "42883"].includes(result.error?.code);
  return !attendance.error && !activities.error && !history.error && !records.error && rpcExists(startRpc) && rpcExists(updateRpc);
}

if (await migrated()) {
  console.log(JSON.stringify({ migrated: true, already_applied: true }));
  process.exit(0);
}

const sql = fs.readFileSync("sql/026_asistencia_retiro_y_actividades_en_curso.sql", "utf8");
const attempts = [
  ["exec_sql", { query: sql }], ["exec_sql", { sql }],
  ["run_sql", { query: sql }], ["run_sql", { sql }],
  ["execute_sql", { query: sql }], ["execute_sql", { sql }]
];
const errors = [];
for (const [functionName, payload] of attempts) {
  const result = await supabase.rpc(functionName, payload);
  if (!result.error && await migrated()) {
    console.log(JSON.stringify({ migrated: true, applied_with_rpc: functionName }));
    process.exit(0);
  }
  errors.push({ functionName, error: result.error?.message || null });
}

console.log(JSON.stringify({
  migrated: false,
  reason: "No hay una RPC SQL disponible para ejecutar DDL.",
  run_manually: "sql/026_asistencia_retiro_y_actividades_en_curso.sql",
  rpc_errors: errors
}, null, 2));
process.exitCode = 2;
