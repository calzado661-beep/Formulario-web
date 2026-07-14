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

async function loteExists() {
  const result = await supabase.from("registros_jefe_grupo").select("id,lote").limit(1);
  return !result.error;
}

if (await loteExists()) {
  console.log(JSON.stringify({ applied: true, lote_exists: true }, null, 2));
  process.exit(0);
}

const sql = fs.readFileSync("sql/006_lote_etiquetado_jefe_grupo.sql", "utf8");
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
  const result = await supabase.rpc(functionName, payload);
  if (!result.error && (await loteExists())) {
    console.log(JSON.stringify({ applied: true, lote_exists: true, rpc: functionName }, null, 2));
    process.exit(0);
  }
  errors.push({ function: functionName, error: result.error?.message || null });
}

console.log(
  JSON.stringify(
    {
      applied: false,
      lote_exists: false,
      reason: "Supabase JS no puede ejecutar ALTER TABLE si no existe una RPC SQL.",
      run_manually: "sql/006_lote_etiquetado_jefe_grupo.sql",
      rpc_errors: errors
    },
    null,
    2
  )
);
