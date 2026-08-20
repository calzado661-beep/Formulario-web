import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync("./.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data, error } = await supabase.from("amonestaciones").select("*").limit(3);
if (error) {
  console.log("ERROR:", error.message);
  process.exit(0);
}
console.log("columnas:", data[0] ? Object.keys(data[0]).join(", ") : "(sin filas)");
console.log("filas de muestra:", JSON.stringify(data, null, 1));
