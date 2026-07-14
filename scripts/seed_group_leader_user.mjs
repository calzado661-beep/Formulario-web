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

const user = {
  nombre: "Jefe de Grupo",
  email: "jefegrupo@empresa.com",
  password_hash: "Grupo123!",
  rol: "jefe de grupo",
  activo: true,
  fecha_cumpleanos: null
};

const result = await supabase
  .from("usuarios")
  .upsert(user, { onConflict: "email" })
  .select("id,nombre,email,rol,activo")
  .single();

if (result.error) {
  console.error(JSON.stringify({ inserted: false, error: result.error.message }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      inserted: true,
      user: result.data,
      credentials: {
        email: user.email,
        password: "Grupo123!"
      }
    },
    null,
    2
  )
);
