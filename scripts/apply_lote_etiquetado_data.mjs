import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const envText = fs.readFileSync(".env", "utf8");
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

  return env;
}

function isEtiquetado(task) {
  const name = String(task.nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return name.includes("etiquetado") || name.includes("codificado") || name.includes("codificacion");
}

const env = readEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const tasksResult = await supabase.from("tareas").select("*").order("id", { ascending: true });
if (tasksResult.error) throw tasksResult.error;

const etiquetaTasks = (tasksResult.data || []).filter(isEtiquetado);
if (!etiquetaTasks.length) {
  console.log(JSON.stringify({ updated_tasks: 0, updated_records: 0, message: "No encontre tareas de etiquetado/codificado." }, null, 2));
  process.exit(0);
}

const taskUpdate = await supabase
  .from("tareas")
  .update({
    requiere_dato_extra: true,
    nombre_dato_extra: "lote"
  })
  .in(
    "id",
    etiquetaTasks.map((task) => task.id)
  )
  .select("id,nombre,requiere_dato_extra,nombre_dato_extra");

if (taskUpdate.error) throw taskUpdate.error;

const columnCheck = await supabase.from("registros_jefe_grupo").select("id,lote").limit(1);
if (columnCheck.error) {
  console.log(
    JSON.stringify(
      {
        updated_tasks: taskUpdate.data,
        updated_records: 0,
        lote_column_exists: false,
        message: "La columna lote aun no existe. Ejecuta sql/006_lote_etiquetado_jefe_grupo.sql en Supabase y vuelve a correr este script.",
        error: columnCheck.error.message
      },
      null,
      2
    )
  );
  process.exit(0);
}

const recordsResult = await supabase
  .from("registros_jefe_grupo")
  .select("id,tarea_id,lote")
  .in(
    "tarea_id",
    etiquetaTasks.map((task) => task.id)
  )
  .is("lote", null)
  .order("id", { ascending: true });

if (recordsResult.error) throw recordsResult.error;

const updates = [];
for (const [index, record] of (recordsResult.data || []).entries()) {
  const lote = `A${String((index % 20) + 1).padStart(2, "0")}`;
  const result = await supabase
    .from("registros_jefe_grupo")
    .update({ lote })
    .eq("id", record.id)
    .select("id,tarea_id,lote")
    .single();
  if (result.error) throw result.error;
  updates.push(result.data);
}

console.log(
  JSON.stringify(
    {
      updated_tasks: taskUpdate.data,
      lote_column_exists: true,
      updated_records: updates.length,
      sample_records: updates.slice(0, 8)
    },
    null,
    2
  )
);
