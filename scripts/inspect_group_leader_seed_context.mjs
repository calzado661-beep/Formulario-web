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

const env = readEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const [tasks, users, recordColumns, viewColumns] = await Promise.all([
  supabase.from("tareas").select("*").order("id", { ascending: true }),
  supabase.from("usuarios").select("id,nombre,email,rol,activo").order("id", { ascending: true }),
  supabase
    .from("registros_jefe_grupo")
    .select("id,encargado_id,trabajador_id,tarea_id,tarea_nombre,fecha_registro,cantidad,tiempo_minutos,codigo_guia,detalle,created_at")
    .limit(1),
  supabase.from("v_registros_jefe_grupo").select("*").limit(1)
]);

console.log(
  JSON.stringify(
    {
      tasks_error: tasks.error?.message || null,
      tasks: tasks.data || [],
      users_error: users.error?.message || null,
      users: users.data || [],
      record_columns_ok: !recordColumns.error,
      record_columns_error: recordColumns.error?.message || null,
      view_ok: !viewColumns.error,
      view_error: viewColumns.error?.message || null,
      view_sample: viewColumns.data || []
    },
    null,
    2
  )
);
