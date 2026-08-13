import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { data, error } = await client.from("tarea").select("*").order("nombre");
if (error) throw error;
fs.writeFileSync("outputs/019ff1a5-512f-7893-a10e-5adf5b905829/catalogo_tareas.json", JSON.stringify(data, null, 2));
console.log(JSON.stringify({ tareas: data.length, campos: data[0] ? Object.keys(data[0]) : [] }));
