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
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Faltan SUPABASE_URL y una clave Supabase en .env");
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const usersToSeed = [
  {
    nombre: "Administrador Principal",
    email: "admin@empresa.com",
    password_hash: "Admin123!",
    rol: "administrador",
    activo: true,
    fecha_cumpleanos: null
  },
  {
    nombre: "Usuario Operante",
    email: "user@empresa.com",
    password_hash: "User123!",
    rol: "operante",
    activo: true,
    fecha_cumpleanos: null
  }
];

async function main() {
  const health = await supabase
    .from("usuarios")
    .select("id,email,rol,activo", { count: "exact" })
    .limit(3);

  if (health.error) throw health.error;

  const upsert = await supabase
    .from("usuarios")
    .upsert(usersToSeed, { onConflict: "email" })
    .select("id,nombre,email,rol,activo");

  if (upsert.error) throw upsert.error;

  const verify = await supabase
    .from("usuarios")
    .select("id,nombre,email,rol,activo")
    .in(
      "email",
      usersToSeed.map((user) => user.email)
    )
    .order("id", { ascending: true });

  if (verify.error) throw verify.error;

  const loginChecks = [];
  for (const user of usersToSeed) {
    const loginCheck = await supabase
      .from("usuarios")
      .select("id,email,rol,activo")
      .eq("email", user.email)
      .eq("password_hash", user.password_hash)
      .limit(1);

    if (loginCheck.error) throw loginCheck.error;

    loginChecks.push({
      email: user.email,
      login_match: Boolean(loginCheck.data?.length),
      rol: loginCheck.data?.[0]?.rol,
      activo: loginCheck.data?.[0]?.activo
    });
  }

  console.log(
    JSON.stringify(
      {
        connected: true,
        usuarios_count_before_seed: health.count,
        seeded: verify.data,
        login_checks: loginChecks,
        credentials: [
          { email: "admin@empresa.com", password: "Admin123!", rol: "administrador" },
          { email: "user@empresa.com", password: "User123!", rol: "operante" }
        ]
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        connected: false,
        error: error.message || String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
