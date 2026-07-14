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

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyTask(task) {
  const name = normalize(task.nombre || task.titulo);
  const type = normalize(task.tipo_medicion);

  if (name.includes("montacarga")) return "realizado";

  if (name.includes("etiquetado") || name.includes("codificado") || name.includes("codificacion")) {
    return "lote";
  }

  if (
    name.includes("embalado") ||
    name.includes("envio nuevo") ||
    name.includes("reposicion") ||
    name.includes("repocicion") ||
    name.includes("envio tienda") ||
    name.includes("envio a tienda") ||
    name.includes("picking") ||
    name.includes("peakin") ||
    name.includes("pickin")
  ) {
    return "tiempo";
  }

  if (name.includes("revision de guia") || name.includes("revicion de guia") || name.includes("revicicion de guia")) {
    return "guia";
  }

  if (type === "turno" || name.includes("visita de tienda") || name.includes("apoyo inter area")) {
    return "turno";
  }

  if (type === "fijo" || type === "cumplimiento") return "realizado";

  return "cantidad";
}

function daysAgo(index) {
  const date = new Date();
  date.setDate(date.getDate() - (index % 12));
  return date.toISOString().slice(0, 10);
}

function recordFor({ index, leader, worker, task }) {
  const kind = classifyTask(task);
  const base = {
    encargado_id: leader.id,
    trabajador_id: worker.id,
    tarea_id: task.id,
    tarea_nombre: task.nombre || task.titulo || `Tarea ${task.id}`,
    fecha_registro: daysAgo(index),
    cantidad: null,
    tiempo_minutos: null,
    codigo_guia: null,
    lote: null,
    detalle: null
  };

  if (kind === "guia") {
    return {
      ...base,
      cantidad: 18 + ((index * 7) % 95),
      tiempo_minutos: 20 + ((index * 5) % 70),
      codigo_guia: `GUIA-${String(202607000 + index).slice(-6)}`,
      detalle: "Revision de guia con cantidad y tiempo"
    };
  }

  if (kind === "lote") {
    return {
      ...base,
      cantidad: 12 + ((index * 9) % 140),
      lote: `A${String((index % 20) + 1).padStart(2, "0")}`,
      detalle: "Etiquetado/codificado con lote"
    };
  }

  if (kind === "tiempo") {
    return {
      ...base,
      tiempo_minutos: 25 + ((index * 11) % 160),
      detalle: "Tiempo realizado registrado"
    };
  }

  if (kind === "turno") {
    return {
      ...base,
      detalle: index % 3 === 0 ? "Turno completo realizado" : "Turno simple realizado"
    };
  }

  if (kind === "realizado") {
    return {
      ...base,
      detalle: "Realizado"
    };
  }

  return {
    ...base,
    cantidad: 10 + ((index * 13) % 180),
    detalle: "Cantidad realizada registrada"
  };
}

const env = readEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const newLeaders = [
  {
    nombre: "Jefe de Grupo Norte",
    email: "jefegrupo2@empresa.com",
    password_hash: "Grupo234!",
    rol: "jefe de grupo",
    activo: true,
    fecha_cumpleanos: null
  },
  {
    nombre: "Jefe de Grupo Sur",
    email: "jefegrupo3@empresa.com",
    password_hash: "Grupo345!",
    rol: "jefe de grupo",
    activo: true,
    fecha_cumpleanos: null
  }
];

const leaderInsert = await supabase
  .from("usuarios")
  .upsert(newLeaders, { onConflict: "email" })
  .select("id,nombre,email,rol,activo");

if (leaderInsert.error) throw leaderInsert.error;

const [leadersResult, workersResult, tasksResult] = await Promise.all([
  supabase.from("usuarios").select("id,nombre,email,rol,activo").eq("rol", "jefe de grupo").eq("activo", true),
  supabase.from("usuarios").select("id,nombre,email,rol,activo").eq("rol", "operante").eq("activo", true),
  supabase.from("tareas").select("*").eq("activo", true).order("id", { ascending: true })
]);

if (leadersResult.error) throw leadersResult.error;
if (workersResult.error) throw workersResult.error;
if (tasksResult.error) throw tasksResult.error;

const leaders = leadersResult.data || [];
const workers = workersResult.data || [];
const tasks = tasksResult.data || [];

if (leaders.length < 2) throw new Error("No hay suficientes jefes de grupo activos.");
if (!workers.length) throw new Error("No hay trabajadores operantes activos.");
if (!tasks.length) throw new Error("No hay tareas activas.");

const records = Array.from({ length: 50 }, (_, index) =>
  recordFor({
    index: index + 1,
    leader: leaders[index % leaders.length],
    worker: workers[(index * 2) % workers.length],
    task: tasks[index % tasks.length]
  })
);

const deleteResult = await supabase
  .from("registros_jefe_grupo")
  .delete()
  .in(
    "encargado_id",
    leaders.map((leader) => leader.id)
  );

if (deleteResult.error) throw deleteResult.error;

const insertResult = await supabase
  .from("registros_jefe_grupo")
  .insert(records)
  .select("id,encargado_id,trabajador_id,tarea_id,tarea_nombre,cantidad,tiempo_minutos,codigo_guia,lote,detalle");

if (insertResult.error) throw insertResult.error;

const counts = records.reduce((acc, record) => {
  const task = tasks.find((item) => item.id === record.tarea_id);
  const kind = classifyTask(task);
  acc[kind] = (acc[kind] || 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      created_group_leaders: leaderInsert.data,
      credentials: [
        { email: "jefegrupo2@empresa.com", password: "Grupo234!" },
        { email: "jefegrupo3@empresa.com", password: "Grupo345!" }
      ],
      inserted_records: insertResult.data?.length || 0,
      record_type_counts: counts,
      sample: insertResult.data?.slice(0, 5) || []
    },
    null,
    2
  )
);
