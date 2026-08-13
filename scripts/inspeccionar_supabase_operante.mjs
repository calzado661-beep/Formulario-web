import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#") && x.includes("=")).map((x) => {
  const i = x.indexOf("="); return [x.slice(0, i).trim(), x.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const tables = ["registros_tareas", "tarea", "marcas", "tiendas", "reglas_puntaje"];
const out = {};
for (const table of tables) {
  const result = await db.from(table).select("*").limit(1);
  out[table] = result.error ? { error: result.error.message } : { columns: result.data?.[0] ? Object.keys(result.data[0]) : [], sample: result.data?.[0] || null };
}
fs.writeFileSync("outputs/019ff1a5-512f-7893-a10e-5adf5b905829/esquema_operante_supabase.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k,v]) => [k,v.columns || v.error]))));
