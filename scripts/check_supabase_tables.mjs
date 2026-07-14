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

for (const table of ["tarea", "tareas", "usuarios", "registros_jefe_grupo", "v_registros_jefe_grupo"]) {
  const result = await supabase.from(table).select("*").limit(1);
  console.log(
    JSON.stringify({
      table,
      ok: !result.error,
      error: result.error?.message || null,
      columns: result.data?.[0] ? Object.keys(result.data[0]) : []
    })
  );
}
