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

async function tableExists() {
  const result = await supabase.from("registros_jefe_grupo").select("id").limit(1);
  return !result.error;
}

async function tryRpc(functionName, payload) {
  const result = await supabase.rpc(functionName, payload);
  return {
    ok: !result.error,
    error: result.error?.message || null
  };
}

async function main() {
  if (await tableExists()) {
    console.log(JSON.stringify({ migrated: true, table_exists: true }, null, 2));
    return;
  }

  const sql = fs.readFileSync("sql/005_jefe_grupo_registros.sql", "utf8");
  const attempts = [
    ["exec_sql", { query: sql }],
    ["exec_sql", { sql }],
    ["run_sql", { query: sql }],
    ["run_sql", { sql }],
    ["execute_sql", { query: sql }],
    ["execute_sql", { sql }]
  ];

  const errors = [];
  for (const [functionName, payload] of attempts) {
    const attempt = await tryRpc(functionName, payload);
    if (attempt.ok && (await tableExists())) {
      console.log(
        JSON.stringify(
          {
            migrated: true,
            table_exists: true,
            applied_with_rpc: functionName
          },
          null,
          2
        )
      );
      return;
    }
    errors.push({ function: functionName, error: attempt.error });
  }

  console.log(
    JSON.stringify(
      {
        migrated: false,
        table_exists: false,
        reason: "No hay una RPC SQL disponible para ejecutar DDL desde Supabase JS.",
        run_manually: "sql/005_jefe_grupo_registros.sql",
        rpc_errors: errors
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
        migrated: false,
        error: error.message || String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
