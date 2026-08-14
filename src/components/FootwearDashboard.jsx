import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadFootwearDashboard } from "../lib/repository";
import {
  buildTaggedPairsByBrand,
  dashboardDateParts,
  taskVolumeRows,
  timedActivityKpi,
  workerProductionRows
} from "../lib/dashboardMetrics";
import "../footwear-dashboard.css";

const ACTIVITY_KPIS = [
  { label: "Picking", daily: 343, hourly: 378 },
  { label: "Visita Tienda", daily: 1857, hourly: 393 },
  { label: "Embalado y Rotulado", daily: 184, hourly: 297 },
  { label: "Etiquetado", daily: 269, hourly: 199 },
  { label: "Envío Nuevo", daily: 221, hourly: 184 }
];

const MONTHLY_TASKS = [
  { label: "Ene", name: "enero", value: 81 },
  { label: "Feb", name: "febrero", value: 85 },
  { label: "Mar", name: "marzo", value: 115 },
  { label: "Abr", name: "abril", value: 101 },
  { label: "May", name: "mayo", value: 100 },
  { label: "Jun", name: "junio", value: 124 },
  { label: "Jul", name: "julio", value: 130 },
  { label: "Ago", name: "agosto", value: 65 },
  { label: "Sep", name: "septiembre", value: 57 },
  { label: "Oct", name: "octubre", value: 97 },
  { label: "Nov", name: "noviembre", value: 81 },
  { label: "Dic", name: "diciembre", value: 79 }
];

const INCIDENT_RECORDS = [
  [72, "luis.v", 14, "Cargar Bultos", "Liberado", "regular", 26],
  [63, "danny.a", 3, "Etiquetado", "Contenido", "extra", 26],
  [63, "danny.a", 8, "Picking", "Liberado", "extra", 25],
  [75, "alexander.r", 2, "Clasificado", "Contenido", "regular", 25],
  [63, "danny.a", 14, "Cargar Bultos", "Contenido", "extra", 27],
  [75, "alexander.r", 3, "Etiquetado", "Contenido", "regular", 28],
  [75, "alexander.r", 8, "Picking", "Contenido", "regular", 27],
  [72, "luis.v", 2, "Clasificado", "Liberado", "regular", 27],
  [63, "danny.a", 2, "Clasificado", "Contenido", "regular", 20],
  [75, "alexander.r", 14, "Cargar Bultos", "Contenido", "regular", 23],
  [72, "luis.v", 8, "Picking", "Contenido", "extra", 23],
  [72, "luis.v", 3, "Etiquetado", "Liberado", "regular", 23],
  [75, "alexander.r", 14, "Cargar Bultos", "Contenido", "regular", 24],
  [72, "luis.v", 3, "Etiquetado", "Contenido", "regular", 25],
  [63, "danny.a", 2, "Clasificado", "Contenido", "regular", 24],
  [72, "luis.v", 8, "Picking", "Liberado", "extra", 24]
].map(([workerId, workerAlias, taskId, taskName, errorType, shift, day]) => ({ workerId, workerAlias, taskId, taskName, errorType, shift, day }));

const WARNINGS = [
  { alias: "saul.m", value: 2 },
  { alias: "usuario.o", value: 1 },
  { alias: "danny.a", value: 1 },
  { alias: "marlon.v", value: 1 },
  { alias: "estefani.o", value: 1 },
  { alias: "daniel.c", value: 1 },
  { alias: "alexandra.p", value: 1 },
  { alias: "aaron.o", value: 1 }
];

const STAFF_ROTATION = [
  { name: "Ene", primary: 11, secondary: 10 },
  { name: "Feb", primary: 8, secondary: 1 },
  { name: "Mar", primary: 13, secondary: 1 },
  { name: "Abr", primary: 5, secondary: 0 },
  { name: "May", primary: 6, secondary: 3 },
  { name: "Jun", primary: 9, secondary: 3 },
  { name: "Jul", primary: 6, secondary: 3 },
  { name: "Ago", primary: 4, secondary: 9 },
  { name: "Sep", primary: 6, secondary: 4 },
  { name: "Oct", primary: 7, secondary: 1 },
  { name: "Nov", primary: 4, secondary: 7 },
  { name: "Dic", primary: 17, secondary: 3 }
];

const EXIT_REASONS = [
  { name: "Mejor oferta", value: 14 },
  { name: "Estudios", value: 10 },
  { name: "Sin especificar", value: 5 },
  { name: "Personal", value: 6 },
  { name: "Sin previo aviso", value: 4 },
  { name: "Cambio de área", value: 3 },
  { name: "Mal desempeño", value: 3 }
];

const ATTENDANCE_BY_WORKER = [
  { name: "sair.r", absent: 5, punctual: 10, late: 4 },
  { name: "alexander.r", absent: 0, punctual: 14, late: 2 },
  { name: "luis.v", absent: 0, punctual: 12, late: 1 },
  { name: "jafet.p", absent: 3, punctual: 5, late: 1, augustPunctual: 1 },
  { name: "saul.m", absent: 3, punctual: 6, late: 2, augustPunctual: 1 },
  { name: "giancarlos.t", absent: 2, punctual: 5, late: 1 },
  { name: "aaron.o", absent: 4, punctual: 2, late: 0, augustPunctual: 1 },
  { name: "dylan.v", absent: 0, punctual: 10, late: 1 },
  { name: "renzo.c", absent: 3, punctual: 1, late: 0 },
  { name: "sebastian.a", absent: 5, punctual: 0, late: 0 },
  { name: "alexandra.p", absent: 1, punctual: 1, late: 0, augustPunctual: 1 }
];

const TRAINING_COURSES = [
  { id: 1, course: "Power BI Básico", competence: "Análisis de Datos", hours: 16 },
  { id: 2, course: "Power BI Intermedio", competence: "Business Intelligence", hours: 20 },
  { id: 3, course: "Excel Avanzado", competence: "Ofimática", hours: 24 },
  { id: 4, course: "Seguridad Industrial", competence: "Seguridad", hours: 8 },
  { id: 5, course: "Prevención de Riesgos", competence: "Seguridad", hours: 12 },
  { id: 6, course: "Atención al Cliente", competence: "Servicio al Cliente", hours: 10 },
  { id: 7, course: "Gestión de Inventarios", competence: "Logística", hours: 16 }
];

// Cada trabajador tiene siete asignaciones en el modelo. Estos son los cursos
// que siguen pendientes; el resto aparece como completado en el PBIX.
const PENDING_TRAINING_BY_WORKER = {
  69: [6, 7],
  70: [],
  71: [7],
  72: [],
  73: [],
  74: [],
  75: [4, 5, 6, 7],
  76: [7],
  77: []
};

const TRAINING_PROGRESS_BY_WORKER = [
  { workerId: 69, name: "saul.m", completed: 5, pending: 2 },
  { workerId: 70, name: "jafet.p", completed: 7, pending: 0 },
  { workerId: 71, name: "renzo.c", completed: 6, pending: 1 },
  { workerId: 72, name: "luis.v", completed: 7, pending: 0 },
  { workerId: 73, name: "sair.r", completed: 7, pending: 0 },
  { workerId: 74, name: "giancarlos.t", completed: 7, pending: 0 },
  { workerId: 75, name: "alexander.r", completed: 3, pending: 4 },
  { workerId: 76, name: "dylan.v", completed: 6, pending: 1 },
  { workerId: 77, name: "sebastian.a", completed: 7, pending: 0 }
];

const BRAND_PAIRS = [
  { name: "Under Armour", value: 56 },
  { name: "Superga", value: 47 },
  { name: "Adidas", value: 39 },
  { name: "Umbro", value: 37 },
  { name: "Champion", value: 2 },
  { name: "NKG", value: 1 },
  { name: "Avia", value: 1 },
  { name: "Body Glove", value: 1 }
];

const PAYROLL = [
  { label: "Ene", value: 43507 },
  { label: "Feb", value: 40117 },
  { label: "Mar", value: 41247 },
  { label: "Abr", value: 41247 },
  { label: "May", value: 42377 },
  { label: "Jun", value: 42377 },
  { label: "Jul", value: 42377 },
  { label: "Ago", value: 42377 },
  { label: "Sep", value: 0 },
  { label: "Oct", value: 0 },
  { label: "Nov", value: 0 },
  { label: "Dic", value: 0 }
];

const INDICATORS = [
  { label: "Margen de error", value: "1.43%", detail: "Incidentes / registros" },
  { label: "Ausentismo", value: "36.59%", detail: "Registro de asistencias" },
  { label: "Tardanza", value: "9.76%", detail: "Llegadas fuera de hora" },
  { label: "Permanencia promedio", value: "11.45", suffix: "meses", detail: "Personal activo" }
];

const WORKERS = [
  { id: 68, name: "Aaron Osorio", role: "jefe de equipo", alias: "aaron.o", points: { 2025: [0, 1, 0, 1, 0, 1, 3, 0, 1, 2, 0, 0], 2026: [3, 4, 3, 0, 2, 3, 1, 0, 0, 0, 0, 0] } },
  { id: 75, name: "Alexander Rojas", role: "operante", alias: "alexander.r", points: { 2025: [0, 0, 0, 33, 34, 45, 38, 22, 35, 37, 42, 46], 2026: [27, 44, 73, 4, 0, 0, 8, 0, 0, 0, 0, 0] } },
  { id: 67, name: "Alexandra Paredes", role: "jefe de equipo", alias: "alexandra.p", points: { 2025: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2026: [0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0] } },
  { id: 76, name: "Dylan Vasquez", role: "operante", alias: "dylan.v", points: { 2025: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2026: [0, 0, 67, 42, 48, 72, 33, 0, 0, 0, 0, 0] } },
  { id: 74, name: "Giancarlos Toribio", role: "operante", alias: "giancarlos.t", points: { 2025: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 28], 2026: [53, 46, 34, 22, 25, 7, 42, 0, 0, 0, 0, 0] } },
  { id: 70, name: "Jafet Pacheco", role: "operante", alias: "jafet.p", points: { 2025: [0, 0, 23, 23, 19, 12, 23, 7, 0, 20, 2, 17], 2026: [12, 9, 27, 9, 0, 1, 8, 0, 0, 0, 0, 0] } },
  { id: 72, name: "Luis Vargas", role: "operante", alias: "luis.v", points: { 2025: [0, 0, 0, 99, 104, 131, 78, 123, 71, 146, 139, 131], 2026: [106, 80, 57, 4, 0, 0, 8, 0, 0, 0, 0, 0] } },
  { id: 71, name: "Renzo Calzada", role: "operante", alias: "renzo.c", points: { 2025: [0, 0, 4, 7, 5, 6, 15, 11, 14, 0, 2, 20], 2026: [7, 8, 3, 6, 15, 0, 3, 0, 0, 0, 0, 0] } },
  { id: 73, name: "Sair Ramirez", role: "operante", alias: "sair.r", points: { 2025: [0, 0, 0, 56, 84, 88, 88, 55, 50, 122, 68, 42], 2026: [56, 82, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
  { id: 69, name: "Saul Meza", role: "operante", alias: "saul.m", points: { 2025: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2026: [48, 25, 23, 44, 30, 18, 31, 0, 0, 0, 0, 0] } },
  { id: 77, name: "Sebastian Andre", role: "operante", alias: "sebastian.a", points: { 2025: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2026: [0, 0, 0, 0, 16, 26, 6, 0, 0, 0, 0, 0] } }
];

const ROLE_OPTIONS = [
  { value: "administrador", label: "Administrador", active: 1 },
  { value: "jefe de equipo", label: "Jefe de equipo", active: 2 },
  { value: "operante", label: "Operante", active: 9 },
  { value: "otros", label: "Otros", active: 3 }
];

const TASK_CATALOG = [
  { id: 1, name: "Recepción de Mercaderías", shortName: "Recepción Mercadería", type: "Ingreso", total: 1, yearly: { 2025: 0, 2026: 1 } },
  { id: 2, name: "Clasificado y Rotulado", shortName: "Clasificado", type: "Ingreso", total: 167, yearly: { 2025: 125, 2026: 42 } },
  { id: 3, name: "Etiquetado", shortName: "Etiquetado", type: "Ingreso", total: 184, yearly: { 2025: 120, 2026: 64 } },
  { id: 4, name: "Revisión de Guía (Devolución)", shortName: "Revisión Guía", type: "Ingreso", total: 151, yearly: { 2025: 110, 2026: 41 } },
  { id: 5, name: "Envío Nuevo", shortName: "Envío Nuevo", type: "Despacho", total: 86, yearly: { 2025: 50, 2026: 36 } },
  { id: 6, name: "Visita de Tienda", shortName: "Visita Tienda", type: "General", total: 79, yearly: { 2025: 52, 2026: 27 } },
  { id: 7, name: "Pedido Mayorista", shortName: "Pedido Mayorista", type: "Despacho", total: 13, yearly: { 2025: 3, 2026: 10 } },
  { id: 8, name: "Picking", shortName: "Picking", type: "Despacho", total: 97, yearly: { 2025: 64, 2026: 33 } },
  { id: 9, name: "Pistoleado", shortName: "Pistoleado", type: "Despacho", total: 93, yearly: { 2025: 61, 2026: 32 } },
  { id: 10, name: "Revisión de Guía (Despacho)", shortName: "Revisión Guía Despacho", type: "Despacho", total: 15, yearly: { 2025: 4, 2026: 11 } },
  { id: 11, name: "Embalado y Rotulado de Guía", shortName: "Embalado y Rotulado", type: "Despacho", total: 16, yearly: { 2025: 2, 2026: 14 } },
  { id: 12, name: "Apoyo Inter-Area", shortName: "Apoyo Inter-Area", type: "General", total: 14, yearly: { 2025: 1, 2026: 13 } },
  { id: 13, name: "Manejo de Montacarga", shortName: "Montacarga", type: "General", total: 1, yearly: { 2025: 1, 2026: 0 } },
  { id: 14, name: "Cargar Bultos", shortName: "Cargar Bultos", type: "General", total: 144, yearly: { 2025: 101, 2026: 43 } },
  { id: 15, name: "Inventario", shortName: "Inventario", type: "General", total: 15, yearly: { 2025: 2, 2026: 13 } },
  { id: 17, name: "Limpieza", shortName: "Limpieza", type: "General", total: 22, yearly: { 2025: 3, 2026: 19 } },
  { id: 18, name: "Sacar Basura", shortName: "Sacar Basura", type: "General", total: 17, yearly: { 2025: 2, 2026: 15 } }
];

const BRAND_NAMES = [
  "Fila", "NKG", "Reebok", "Time Shooper", "Umbro", "Under Armour", "Adidas", "Superga", "Ecko", "Skechers",
  "Airwalk", "Avia", "Apolo", "Apolito", "Aqua Fashion", "Vans", "Beverly Hills Polo Club", "Blink", "Body Glove", "Escolar",
  "Champion", "Marca China", "Colloky", "Converse", "Crocs", "Via Uno", "Disney", "Exit", "Fiorenzi", "Follies", "Footlose",
  "Gor-7", "HyM", "Hi-Tec", "Joma", "Kelme", "Merma", "Nike", "Penguin", "Puma", "Xti", "Refresh", "You"
];

const YEAR_MONTHLY_TASKS = {
  2025: [0, 1, 6, 72, 69, 97, 77, 65, 57, 97, 81, 79],
  2026: [81, 84, 109, 29, 31, 27, 53, 0, 0, 0, 0, 0]
};

// Unión de fechas que realmente tienen tareas, asistencias o incidentes en el PBIX.
// El segmentador de Power BI oculta los días sin hechos en lugar de mostrar un calendario vacío.
const DATE_DAYS_BY_YEAR = {
  2025: {
    2: [11],
    3: [7, 16, 17, 19, 20, 25],
    4: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 25, 26, 27, 28, 30],
    5: [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31],
    6: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    7: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 26, 27, 28, 29, 30],
    8: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    9: [1, 2, 3, 4, 7, 8, 10, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 29, 30],
    10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    11: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30],
    12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31]
  },
  2026: {
    1: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24, 25, 27, 28],
    3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    4: [1, 3, 4, 6, 9, 11, 12, 13, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28],
    5: [1, 3, 4, 5, 7, 10, 11, 12, 14, 15, 17, 18, 21, 22, 26, 28, 29, 30, 31],
    6: [3, 5, 6, 8, 9, 10, 12, 13, 14, 17, 18, 19, 21, 24, 25, 26, 27, 30],
    7: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 17, 18, 20, 23, 24, 25, 26, 27, 28, 29, 30],
    8: [4]
  }
};

const TASK_MONTHLY_BY_YEAR = {
  2025: {
    "Visita Tienda": [0, 0, 2, 8, 2, 10, 6, 8, 1, 4, 7, 4], Picking: [0, 0, 1, 7, 3, 15, 15, 5, 8, 6, 1, 3],
    "Cargar Bultos": [0, 0, 1, 5, 11, 16, 14, 4, 9, 9, 15, 17], "Sacar Basura": [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
    Pistoleado: [0, 0, 0, 8, 6, 6, 6, 9, 4, 8, 9, 5], "Envío Nuevo": [0, 0, 0, 5, 6, 6, 6, 2, 8, 9, 2, 6],
    Limpieza: [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0], Clasificado: [0, 0, 0, 8, 14, 16, 15, 16, 6, 21, 15, 14],
    Etiquetado: [0, 0, 0, 11, 16, 12, 7, 11, 3, 21, 23, 16], "Revisión Guía": [0, 1, 0, 18, 10, 11, 5, 10, 18, 17, 7, 13],
    "Recepción Mercadería": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "Pedido Mayorista": [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    "Revisión Guía Despacho": [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1], "Embalado y Rotulado": [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    "Apoyo Inter-Area": [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], Montacarga: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    Inventario: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]
  },
  2026: {
    "Visita Tienda": [13, 2, 7, 1, 1, 2, 1, 0, 0, 0, 0, 0], Picking: [5, 12, 8, 1, 4, 2, 1, 0, 0, 0, 0, 0],
    "Cargar Bultos": [9, 11, 15, 2, 2, 2, 2, 0, 0, 0, 0, 0], "Sacar Basura": [1, 2, 1, 1, 2, 3, 5, 0, 0, 0, 0, 0],
    Pistoleado: [4, 8, 8, 1, 4, 2, 5, 0, 0, 0, 0, 0], "Envío Nuevo": [5, 10, 17, 1, 2, 0, 1, 0, 0, 0, 0, 0],
    Limpieza: [2, 0, 0, 3, 1, 2, 11, 0, 0, 0, 0, 0], Clasificado: [7, 11, 15, 1, 2, 1, 5, 0, 0, 0, 0, 0],
    Etiquetado: [20, 15, 9, 5, 6, 1, 8, 0, 0, 0, 0, 0], "Revisión Guía": [7, 8, 18, 1, 2, 1, 4, 0, 0, 0, 0, 0],
    "Recepción Mercadería": [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], "Pedido Mayorista": [2, 0, 1, 3, 0, 3, 1, 0, 0, 0, 0, 0],
    "Revisión Guía Despacho": [1, 0, 3, 1, 0, 3, 3, 0, 0, 0, 0, 0], "Embalado y Rotulado": [0, 3, 3, 3, 2, 2, 1, 0, 0, 0, 0, 0],
    "Apoyo Inter-Area": [3, 0, 3, 2, 2, 0, 3, 0, 0, 0, 0, 0], Montacarga: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    Inventario: [2, 2, 1, 3, 1, 3, 1, 0, 0, 0, 0, 0]
  }
};

const BRAND_BY_YEAR = {
  2025: { "Under Armour": 41, Umbro: 28, Superga: 27, Adidas: 23, NKG: 1 },
  2026: { Superga: 20, Adidas: 16, "Under Armour": 15, Umbro: 9, Champion: 2, "Body Glove": 1, Avia: 1 }
};

const MOVEMENT_BY_YEAR = {
  2023: [[0, 0], [0, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  2024: [[2, 0], [2, 0], [3, 0], [2, 0], [2, 3], [3, 3], [2, 2], [2, 5], [3, 3], [5, 1], [0, 2], [8, 0]],
  2025: [[3, 6], [3, 1], [7, 1], [2, 0], [2, 0], [5, 0], [4, 0], [2, 4], [3, 1], [2, 0], [4, 5], [8, 3]],
  2026: [[6, 4], [2, 0], [2, 0], [0, 0], [1, 0], [0, 0], [0, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]
};

const BRAND_COLORS = ["#0a4f87", "#e7bd22", "#2d79ae", "#ef8f3d", "#47a7a1", "#745aa6", "#9dbf49", "#b8c8d6"];
const BRAND_TREEMAP_COLORS = {
  Superga: "#2025ad",
  Adidas: "#ef6c32",
  "Under Armour": "#1d8df5",
  Umbro: "#840078",
  Champion: "#d83b9c",
  Avia: "#7457b7",
  "Body Glove": "#b9af00",
  NKG: "#318342"
};
const numberFormatter = new Intl.NumberFormat("es-PE");
const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0
});

function DashboardLogo() {
  return (
    <svg
      className="pbi-brand-icon"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 50c1-8 5-12 12-15v-4c-4-2-6-6-6-12 0-8 4-13 10-13s10 5 10 13c0 6-2 10-6 12v4c3 1 6 3 8 5" />
      <path d="m39 47 6 6 12-15" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="pbi-title-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z" />
    </svg>
  );
}

function FullscreenIcon({ active }) {
  return active ? (
    <svg className="pbi-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
    </svg>
  ) : (
    <svg className="pbi-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

function ExpandVisualIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="pbi-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 4v6h6M5.5 9A8 8 0 1 1 4 14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="pbi-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  );
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function toggleArrayValue(values, value) {
  if (!values.length) return [value];
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleVisibleSeries(current, key) {
  const activeCount = Object.values(current).filter(Boolean).length;
  if (current[key] && activeCount === 1) return current;
  return { ...current, [key]: !current[key] };
}

const SLICER_OPEN_EVENT = "pbi:slicer-open";

function availableDaysForMonth(years, monthNumber, dateDaysByYear = DATE_DAYS_BY_YEAR) {
  const availableYears = Object.keys(dateDaysByYear).map(Number);
  const effectiveYears = years.length ? years : availableYears;
  return [...new Set(effectiveYears.flatMap((year) => dateDaysByYear[year]?.[monthNumber] || []))].sort((a, b) => a - b);
}

function announceOpenSlicer(element) {
  if (element.open) window.dispatchEvent(new CustomEvent(SLICER_OPEN_EVENT, { detail: element }));
}

function MultiSlicer({ id, label, options, selected, onChange, allLabel = "Todas", searchable = true, alignEnd = false }) {
  const [search, setSearch] = useState("");
  const detailsRef = useRef(null);
  const filteredOptions = useMemo(() => {
    const query = normalizeSearch(search.trim());
    if (!query) return options;
    return options.filter((option) => normalizeSearch(option.label).includes(query));
  }, [options, search]);
  const summary = !selected.length
    ? allLabel
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label || "1 seleccionado"
      : `${selected.length} seleccionados`;

  useEffect(() => {
    function closeOnOutside(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.open = false;
    }
    function closeOnOtherSlicer(event) {
      if (detailsRef.current?.open && event.detail !== detailsRef.current) detailsRef.current.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener(SLICER_OPEN_EVENT, closeOnOtherSlicer);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener(SLICER_OPEN_EVENT, closeOnOtherSlicer);
    };
  }, []);

  return (
    <details
      className="pbi-slicer"
      data-testid={`slicer-${id}`}
      ref={detailsRef}
      onToggle={(event) => announceOpenSlicer(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          detailsRef.current.open = false;
          detailsRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="pbi-slicer-trigger" aria-label={`${label}: ${summary}`}>
        <span className="pbi-slicer-copy">
          <span className="pbi-slicer-label">{label}</span>
          <span className="pbi-slicer-value">{summary}</span>
        </span>
        {selected.length ? <span className="pbi-slicer-count">{selected.length}</span> : <span />}
        <span className="pbi-slicer-chevron" aria-hidden="true" />
      </summary>
      <div className={`pbi-slicer-dropdown${alignEnd ? " pbi-slicer-dropdown--end" : ""}`}>
        {searchable ? (
          <label className="pbi-slicer-search">
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Buscar ${label.toLocaleLowerCase("es")}…`}
              aria-label={`Buscar en ${label}`}
            />
          </label>
        ) : null}
        <div className="pbi-slicer-actions">
          <button className="pbi-slicer-action" type="button" onClick={() => onChange([])}>Mostrar todas</button>
          <span className="pbi-slicer-option-count">{filteredOptions.length} opciones</span>
        </div>
        <div className="pbi-slicer-options" role="listbox" aria-label={label} aria-multiselectable="true">
          {filteredOptions.length ? filteredOptions.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                className={`pbi-slicer-option${active ? " pbi-slicer-option--selected" : ""}`}
                type="button"
                key={option.value}
                role="option"
                aria-selected={active}
                onClick={() => onChange(toggleArrayValue(selected, option.value))}
                data-value={option.value}
              >
                <span className="pbi-slicer-checkbox" aria-hidden="true" />
                <span className="pbi-slicer-option-label">{option.label}</span>
                {option.count != null ? <span className="pbi-slicer-option-count">{option.count}</span> : null}
              </button>
            );
          }) : <p className="pbi-slicer-empty">No hay coincidencias.</p>}
        </div>
      </div>
    </details>
  );
}

function DateHierarchySlicer({ selected, onChange, years, dateDaysByYear }) {
  const detailsRef = useRef(null);
  const effectiveYears = years.length ? years : [2025, 2026];
  const yearKey = effectiveYears.join("|");
  const selectedMonths = Object.keys(selected).map(Number);
  const summary = !selectedMonths.length
    ? "Todos los meses y días"
    : selectedMonths.length === 1
      ? MONTHLY_TASKS[selectedMonths[0] - 1].name
      : `${selectedMonths.length} meses seleccionados`;

  function daysForMonth(monthNumber) {
    return availableDaysForMonth(effectiveYears, monthNumber, dateDaysByYear);
  }

  function toggleMonth(monthNumber) {
    onChange((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, monthNumber)) delete next[monthNumber];
      else next[monthNumber] = null;
      return next;
    });
  }

  function toggleDay(monthNumber, day) {
    const allDays = daysForMonth(monthNumber);
    onChange((current) => {
      const next = { ...current };
      const currentDays = Object.prototype.hasOwnProperty.call(current, monthNumber) ? current[monthNumber] : [];
      const base = currentDays === null ? allDays : currentDays;
      const days = base.includes(day) ? base.filter((item) => item !== day) : [...base, day].sort((a, b) => a - b);
      if (!days.length) delete next[monthNumber];
      else next[monthNumber] = days.length === allDays.length ? null : days;
      return next;
    });
  }

  useEffect(() => {
    function closeOnOutside(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.open = false;
    }
    function closeOnOtherSlicer(event) {
      if (detailsRef.current?.open && event.detail !== detailsRef.current) detailsRef.current.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener(SLICER_OPEN_EVENT, closeOnOtherSlicer);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener(SLICER_OPEN_EVENT, closeOnOtherSlicer);
    };
  }, []);

  useEffect(() => {
    onChange((current) => {
      let changed = false;
      const next = {};
      Object.entries(current).forEach(([monthKey, selectedDays]) => {
        const monthNumber = Number(monthKey);
        const availableDays = availableDaysForMonth(effectiveYears, monthNumber, dateDaysByYear);
        if (!availableDays.length) {
          changed = true;
          return;
        }
        if (selectedDays === null) {
          next[monthNumber] = null;
          return;
        }
        const validDays = selectedDays.filter((day) => availableDays.includes(day));
        if (validDays.length !== selectedDays.length) changed = true;
        if (validDays.length) next[monthNumber] = validDays.length === availableDays.length ? null : validDays;
        else changed = true;
      });
      return changed ? next : current;
    });
  }, [yearKey, onChange, dateDaysByYear]);

  return (
    <details
      className="pbi-slicer pbi-slicer--date pbi-filter--months"
      data-testid="slicer-date"
      ref={detailsRef}
      onToggle={(event) => announceOpenSlicer(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Escape") detailsRef.current.open = false;
      }}
    >
      <summary className="pbi-slicer-trigger" aria-label={`Fecha: ${summary}`}>
        <span className="pbi-slicer-copy">
          <span className="pbi-slicer-label">Fecha</span>
          <span className="pbi-slicer-value">{summary}</span>
        </span>
        {selectedMonths.length ? <span className="pbi-slicer-count">{selectedMonths.length}</span> : <span />}
        <span className="pbi-slicer-chevron" aria-hidden="true" />
        <span className="pbi-date-preview" aria-hidden="true">
          {MONTHLY_TASKS.map((month, index) => {
            const monthNumber = index + 1;
            if (!daysForMonth(monthNumber).length) return null;
            return (
              <span className={Object.prototype.hasOwnProperty.call(selected, monthNumber) ? "is-selected" : ""} key={month.name}>
                {month.label}
              </span>
            );
          })}
        </span>
      </summary>
      <div className="pbi-slicer-dropdown pbi-slicer-dropdown--date">
        <div className="pbi-slicer-actions">
          <button className="pbi-slicer-action" type="button" onClick={() => onChange({})}>Mostrar todas las fechas</button>
          <span className="pbi-slicer-option-count">Mes → Día</span>
        </div>
        <div className="pbi-slicer-options pbi-date-tree">
          {MONTHLY_TASKS.map((month, index) => {
            const monthNumber = index + 1;
            const hasMonth = Object.prototype.hasOwnProperty.call(selected, monthNumber);
            const monthDays = selected[monthNumber];
            const partial = hasMonth && monthDays !== null;
            const days = daysForMonth(monthNumber);
            if (!days.length) return null;
            return (
              <details
                className={`pbi-date-month${hasMonth ? " pbi-date-month--selected" : ""}${partial ? " pbi-date-month--partial" : ""}`}
                key={month.name}
              >
                <summary className="pbi-date-row">
                  <span className="pbi-date-expand" aria-hidden="true" />
                  <span>{month.name}</span>
                  <span className="pbi-date-hierarchy-count">{partial ? `${monthDays.length} días` : hasMonth ? "Mes completo" : `${days.length} días`}</span>
                </summary>
                <div className="pbi-date-days">
                  <button
                    className={`pbi-date-month-all${hasMonth && !partial ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => toggleMonth(monthNumber)}
                    aria-pressed={hasMonth && !partial}
                  >
                    {hasMonth ? "Quitar mes" : "Seleccionar mes completo"}
                  </button>
                  {days.map((day) => {
                    const active = monthDays === null || (Array.isArray(monthDays) && monthDays.includes(day));
                    return (
                      <button
                        className={`pbi-date-day${active ? " pbi-date-day--selected" : ""}`}
                        type="button"
                        key={day}
                        onClick={() => toggleDay(monthNumber, day)}
                        aria-pressed={active}
                        aria-label={`${day} de ${month.name}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function ChartTooltip({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div
      className="pbi-tooltip pbi-tooltip--chart"
      style={{ left: tooltip.x, top: tooltip.y }}
      role="status"
    >
      <span className="pbi-tooltip-label">{tooltip.label}</span>
      <strong className="pbi-tooltip-value">{tooltip.value}</strong>
      {tooltip.detail ? <span className="pbi-tooltip-label">{tooltip.detail}</span> : null}
    </div>
  );
}

function tooltipAt(event, setTooltip, label, value, detail = "") {
  const host = event.currentTarget.closest(".pbi-chart, .pbi-bar-list, .pbi-comparison, .pbi-attendance, .pbi-training-progress, .pbi-donut-layout, .pbi-treemap");
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 88), Math.max(88, rect.width - 88));
  const y = Math.max(48, event.clientY - rect.top);
  setTooltip({ x, y, label, value, detail });
}

function tooltipAtFocus(event, setTooltip, label, value, detail = "") {
  const host = event.currentTarget.closest(".pbi-chart, .pbi-bar-list, .pbi-comparison, .pbi-attendance, .pbi-training-progress, .pbi-donut-layout, .pbi-treemap");
  if (!host) return;
  const hostRect = host.getBoundingClientRect();
  const targetRect = event.currentTarget.getBoundingClientRect();
  const x = Math.min(Math.max(targetRect.left + targetRect.width / 2 - hostRect.left, 88), Math.max(88, hostRect.width - 88));
  const y = Math.max(48, targetRect.top - hostRect.top);
  setTooltip({ x, y, label, value, detail });
}

function PersonnelKpi({ label, value }) {
  return (
    <article className="pbi-kpi pbi-kpi--personnel" aria-label={`${label}: ${value}`}>
      <span className="pbi-kpi-label">{label}</span>
      <strong className="pbi-kpi-value">{numberFormatter.format(value)}</strong>
    </article>
  );
}

function ActivityKpi({ label, daily, hourly }) {
  return (
    <article className="pbi-kpi pbi-kpi--paired" aria-label={`${label}: diario ${daily}, por hora ${hourly}`}>
      <span className="pbi-kpi-label">{label}</span>
      <div className="pbi-kpi-pair">
        <span className="pbi-kpi-pair-item">
          <strong className="pbi-kpi-value">{numberFormatter.format(daily)}</strong>
          <small>Diario</small>
        </span>
        <span className="pbi-kpi-pair-item">
          <strong className="pbi-kpi-value">{numberFormatter.format(hourly)}</strong>
          <small>Hora</small>
        </span>
      </div>
    </article>
  );
}

function Card({ id, title, meta, icon, className = "", children, expandable }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = expandable ?? className.includes("pbi-card--chart");

  useEffect(() => {
    if (!isExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isExpanded]);

  const cardContent = (expanded = false) => (
    <section
      id={expanded ? undefined : id}
      className={`pbi-card ${className}${expanded ? " pbi-card--expanded" : ""}`.trim()}
      aria-labelledby={`${id}-title${expanded ? "-expanded" : ""}`}
    >
      <header className="pbi-card-header">
        <h2 className="pbi-card-title" id={`${id}-title${expanded ? "-expanded" : ""}`}>
          {icon}
          <span>{title}</span>
        </h2>
        <div className="pbi-card-tools">
          {meta ? <span className="pbi-card-meta">{meta}</span> : null}
          {canExpand ? (
            <button
              className="pbi-card-expand"
              type="button"
              onClick={() => setIsExpanded(!expanded)}
              aria-label={expanded ? `Cerrar ${title}` : `Ampliar ${title}`}
              title={expanded ? "Cerrar vista ampliada" : "Ampliar gráfica"}
            >
              {expanded ? <CloseIcon /> : <ExpandVisualIcon />}
            </button>
          ) : null}
        </div>
      </header>
      <div className="pbi-card-body">{children}</div>
    </section>
  );

  return (
    <>
      {!isExpanded ? cardContent(false) : null}
      {isExpanded && typeof document !== "undefined" ? createPortal(
        <div className="pbi-visual-modal" role="dialog" aria-modal="true" aria-label={`Vista ampliada: ${title}`} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsExpanded(false);
        }}>
          <div className="pbi-visual-modal-dialog">{cardContent(true)}</div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function splitLabel(label) {
  const parts = label.split(" ");
  if (parts.length < 2) return [label];
  return [parts[0], parts.slice(1).join(" ")];
}

function VerticalBarChart({ id, data, ariaLabel, tone = "gold", onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;

  // La proporción anterior (2:1) reducía demasiado la gráfica dentro de
  // tarjetas altas. Este lienzo aprovecha la altura sin deformar texto o barras.
  const width = 520;
  const height = 360;
  const left = 54;
  const right = 16;
  const top = 30;
  const bottom = 78;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maximum = Math.max(...data.map((item) => item.value), 1) * 1.12;
  const step = innerWidth / data.length;
  const barWidth = Math.min(74, Math.max(28, step * 0.62));
  const fill = tone === "blue" ? "#0a4f87" : "#e7c42d";
  const animationKey = data.map((item) => `${item.name}:${item.value}`).join("|");

  return (
    <div className="pbi-chart" data-animation-key={animationKey}>
      <svg key={animationKey} className="pbi-chart-svg" viewBox={`0 0 ${width} ${height}`} role={onSelect ? "group" : "img"} aria-labelledby={`${id}-chart-title`}>
        <title id={`${id}-chart-title`}>{ariaLabel}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + innerHeight - ratio * innerHeight;
          return (
            <g key={ratio}>
              <line className="pbi-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="pbi-axis-label" x={left - 8} y={y + 4} textAnchor="end">
                {numberFormatter.format(Math.round(maximum * ratio))}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const x = left + index * step + (step - barWidth) / 2;
          const barHeight = (item.value / maximum) * innerHeight;
          const y = top + innerHeight - barHeight;
          const labelLines = splitLabel(item.name);
          const selected = selectedNames.includes(item.name);
          const dimmed = selectedNames.length > 0 && !selected;
          return (
            <g
              key={item.name}
              className={`pbi-chart-mark${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
              tabIndex="0"
              focusable="true"
              role={onSelect ? "button" : undefined}
              aria-pressed={onSelect ? selected : undefined}
              aria-label={`${item.name}: ${item.value}`}
              onClick={() => onSelect?.(item)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
              onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, numberFormatter.format(item.value), "Haz clic para filtrar")}
              onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, numberFormatter.format(item.value), "Presiona Enter para filtrar")}
              onBlur={() => setTooltip(null)}
              onMouseLeave={() => setTooltip(null)}
            >
              <title>{`${item.name}: ${numberFormatter.format(item.value)}`}</title>
              <rect className={`pbi-chart-bar pbi-chart-bar--${tone}`} style={{ "--pbi-index": index }} x={x} y={y} width={barWidth} height={barHeight} rx="3" fill={fill} />
              <text className="pbi-chart-value" x={x + barWidth / 2} y={Math.max(18, y - 8)} textAnchor="middle">
                {numberFormatter.format(item.value)}
              </text>
              <text className="pbi-axis-label pbi-axis-label--category" x={x + barWidth / 2} y={height - bottom + 24} textAnchor="middle">
                {labelLines.map((line, lineIndex) => (
                  <tspan key={line} x={x + barWidth / 2} dy={lineIndex === 0 ? 0 : 15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function LineChart({ id, data, ariaLabel, valueFormatter = (value) => numberFormatter.format(value), tone = "blue", onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;

  const dense = data.length > 12;
  // En escritorio todos los puntos caben dentro del visual. En pantallas
  // angostas el CSS conserva un ancho legible y habilita desplazamiento local.
  const width = Math.max(760, data.length * 42);
  const height = 440;
  const left = 72;
  const right = 24;
  const top = 34;
  const bottom = 70;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maximum = Math.max(...data.map((item) => item.value), 1) * 1.12;
  const points = data.map((item, index) => ({
    ...item,
    x: data.length === 1 ? left + innerWidth / 2 : left + (index * innerWidth) / (data.length - 1),
    y: top + innerHeight - (item.value / maximum) * innerHeight
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${top + innerHeight} L${points[0].x},${top + innerHeight} Z`;
  const color = tone === "gold" ? "#e7bd22" : "#0a4f87";
  const animationKey = data.map((item) => `${item.label}:${item.value}`).join("|");

  return (
    <div
      className="pbi-chart pbi-chart--line"
      data-animation-key={animationKey}
      style={{ "--pbi-line-mobile-width": `${Math.max(600, Math.min(760, data.length * 36))}px` }}
    >
      <svg
        key={animationKey}
        className="pbi-chart-svg"
        data-line-chart="true"
        data-dense={dense ? "true" : undefined}
        viewBox={`0 0 ${width} ${height}`}
        role={onSelect ? "group" : "img"}
        aria-labelledby={`${id}-chart-title`}
      >
        <title id={`${id}-chart-title`}>{ariaLabel}</title>
        <defs>
          <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + innerHeight - ratio * innerHeight;
          return (
            <g key={ratio}>
              <line className="pbi-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="pbi-axis-label" x={left - 10} y={y + 4} textAnchor="end">
                {valueFormatter(Math.round(maximum * ratio))}
              </text>
            </g>
          );
        })}
        <path className="pbi-chart-area" d={areaPath} fill={`url(#${id}-area)`} />
        <path className={`pbi-chart-line pbi-chart-line--${tone}`} d={linePath} fill="none" stroke={color} />
        {points.map((point, index) => {
          const selectionValue = point.name || point.label;
          const selected = selectedNames.includes(selectionValue);
          const dimmed = selectedNames.length > 0 && !selected;
          return (
          <g
            key={point.label}
            className={`pbi-chart-mark${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
            tabIndex="0"
            focusable="true"
            role={onSelect ? "button" : undefined}
            aria-pressed={onSelect ? selected : undefined}
            aria-label={`${point.label}: ${valueFormatter(point.value)}`}
            onClick={() => onSelect?.(point)}
            onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(point);
              }
            }}
            onPointerMove={(event) => tooltipAt(event, setTooltip, point.label, valueFormatter(point.value), onSelect ? "Haz clic para filtrar" : "")}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, point.label, valueFormatter(point.value), onSelect ? "Presiona Enter para filtrar" : "")}
            onBlur={() => setTooltip(null)}
            onMouseLeave={() => setTooltip(null)}
          >
            <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
            <circle className={`pbi-chart-dot pbi-chart-dot--${tone}`} style={{ "--pbi-index": index }} cx={point.x} cy={point.y} r="5" fill={color} />
            <text className="pbi-axis-label pbi-axis-label--category" x={point.x} y={height - 22} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );})}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function HorizontalBars({ data, ariaLabel, color = "#0a4f87", valueFormatter = (value) => numberFormatter.format(value), onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;
  const maximum = Math.max(...data.map((item) => item.value), 1);
  const animationKey = data.map((item) => `${item.name}:${item.value}`).join("|");

  return (
    <div className="pbi-bar-list" role="group" aria-label={ariaLabel} data-animation-key={animationKey}>
      {data.map((item, index) => {
        const selectionValue = item.selectionName || item.workerName || item.name;
        const selected = selectedNames.includes(selectionValue);
        const dimmed = selectedNames.length > 0 && !selected;
        return (
        <div
          className={`pbi-bar-row${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
          key={`${animationKey}-${item.name}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-pressed={onSelect ? selected : undefined}
          onClick={() => onSelect?.(item)}
          onKeyDown={(event) => {
            if (onSelect && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelect(item);
            }
          }}
          onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, valueFormatter(item.value), onSelect ? "Haz clic para filtrar" : "")}
          onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, valueFormatter(item.value), onSelect ? "Presiona Enter para filtrar" : "")}
          onBlur={() => setTooltip(null)}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="pbi-rank" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="pbi-bar-label">{item.name}</span>
          <span className="pbi-bar-track" aria-hidden="true">
            <span className="pbi-bar-fill" style={{ width: `${(item.value / maximum) * 100}%`, backgroundColor: color, "--pbi-index": index }} />
          </span>
          <strong className="pbi-bar-value">{valueFormatter(item.value)}</strong>
        </div>
      );})}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function ComparisonBars({ data, ariaLabel, primaryLabel, secondaryLabel, primaryColor, secondaryColor, onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const [visibleSeries, setVisibleSeries] = useState({ primary: true, secondary: true });
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;
  const maximum = Math.max(...data.flatMap((item) => [item.primary, item.secondary]), 1);
  const animationKey = data.map((item) => `${item.name}:${item.primary}:${item.secondary}`).join("|");
  return (
    <div className="pbi-comparison" role="group" aria-label={ariaLabel} data-animation-key={animationKey}>
      <div className="pbi-legend">
        <button
          className={`pbi-legend-item${visibleSeries.primary ? "" : " is-muted"}`}
          type="button"
          onClick={() => setVisibleSeries((current) => toggleVisibleSeries(current, "primary"))}
          aria-pressed={visibleSeries.primary}
        >
          <i className="pbi-legend-swatch" style={{ backgroundColor: primaryColor }} />{primaryLabel}
        </button>
        <button
          className={`pbi-legend-item${visibleSeries.secondary ? "" : " is-muted"}`}
          type="button"
          onClick={() => setVisibleSeries((current) => toggleVisibleSeries(current, "secondary"))}
          aria-pressed={visibleSeries.secondary}
        >
          <i className="pbi-legend-swatch" style={{ backgroundColor: secondaryColor }} />{secondaryLabel}
        </button>
      </div>
      <div className="pbi-comparison-list">
        {data.map((item, index) => {
          const selected = selectedNames.includes(item.name);
          const dimmed = selectedNames.length > 0 && !selected;
          return (
          <div
            className={`pbi-comparison-row${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
            key={`${animationKey}-${item.name}`}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? selected : undefined}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(item);
              }
            }}
            onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${primaryLabel}: ${item.primary} · ${secondaryLabel}: ${item.secondary}`, onSelect ? "Haz clic para filtrar" : "")}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${primaryLabel}: ${item.primary} · ${secondaryLabel}: ${item.secondary}`, onSelect ? "Presiona Enter para filtrar" : "")}
            onBlur={() => setTooltip(null)}
            onMouseLeave={() => setTooltip(null)}
          >
            <strong>{item.name}</strong>
            <span className="pbi-comparison-track" aria-hidden="true">
              <i style={{ width: visibleSeries.primary ? `${(item.primary / maximum) * 100}%` : "0%", backgroundColor: primaryColor, "--pbi-index": index }} />
            </span>
            <span>{visibleSeries.primary ? item.primary : "—"}</span>
            <span className="pbi-comparison-track" aria-hidden="true">
              <i style={{ width: visibleSeries.secondary ? `${(item.secondary / maximum) * 100}%` : "0%", backgroundColor: secondaryColor, "--pbi-index": index }} />
            </span>
            <span>{visibleSeries.secondary ? item.secondary : "—"}</span>
          </div>
        );})}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function AttendanceBars({ data, onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const [visibleSeries, setVisibleSeries] = useState({ punctual: true, late: true, absent: true });
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;
  const maximum = Math.max(...data.map((item) => item.absent + item.punctual + item.late), 1);
  const animationKey = data.map((item) => `${item.name}:${item.punctual}:${item.late}:${item.absent}`).join("|");
  const series = [
    ["punctual", "Puntual", "#05b13e"],
    ["late", "Tardanza", "#f4b33a"],
    ["absent", "Ausente", "#f4303f"]
  ];
  return (
    <div className="pbi-attendance" role="group" aria-label="Asistencia por trabajador: puntual, tardanza y ausencia" data-animation-key={animationKey}>
      <div className="pbi-legend">
        {series.map(([key, label, color]) => (
          <button
            className={`pbi-legend-item${visibleSeries[key] ? "" : " is-muted"}`}
            type="button"
            key={key}
            onClick={() => setVisibleSeries((current) => toggleVisibleSeries(current, key))}
            aria-pressed={visibleSeries[key]}
          >
            <i className="pbi-legend-swatch" style={{ backgroundColor: color }} />{label}
          </button>
        ))}
      </div>
      <div className="pbi-attendance-list">
        {data.map((item, index) => {
          const selectionValue = item.workerName || item.name;
          const selected = selectedNames.includes(selectionValue);
          const dimmed = selectedNames.length > 0 && !selected;
          return (
          <div
            className={`pbi-attendance-row${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
            key={`${animationKey}-${item.name}`}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? selected : undefined}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(item);
              }
            }}
            onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `Puntual ${item.punctual} · Tardanza ${item.late} · Ausente ${item.absent}`, onSelect ? "Haz clic para filtrar" : "")}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `Puntual ${item.punctual} · Tardanza ${item.late} · Ausente ${item.absent}`, onSelect ? "Presiona Enter para filtrar" : "")}
            onBlur={() => setTooltip(null)}
            onMouseLeave={() => setTooltip(null)}
          >
            <strong>{item.name}</strong>
            <span className="pbi-attendance-track" aria-hidden="true">
              <i style={{ width: visibleSeries.punctual ? `${(item.punctual / maximum) * 100}%` : "0%", backgroundColor: "#05b13e", "--pbi-index": index }} />
              <i style={{ width: visibleSeries.late ? `${(item.late / maximum) * 100}%` : "0%", backgroundColor: "#f4b33a", "--pbi-index": index }} />
              <i style={{ width: visibleSeries.absent ? `${(item.absent / maximum) * 100}%` : "0%", backgroundColor: "#f4303f", "--pbi-index": index }} />
            </span>
            <span>{item.punctual + item.late + item.absent}</span>
          </div>
        );})}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function TrainingProgressBars({ data, onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const [visibleSeries, setVisibleSeries] = useState({ completed: true, pending: true });
  if (!data.length) return <p className="pbi-chart-empty">No hay capacitaciones para el filtro seleccionado.</p>;
  const animationKey = data.map((item) => `${item.name}:${item.completed}:${item.pending}`).join("|");
  const series = [
    ["completed", "Completado", "#05a942"],
    ["pending", "Pendiente", "#ef8f3d"]
  ];

  return (
    <div className="pbi-training-progress" role="group" aria-label="Avance de capacitaciones por trabajador" data-animation-key={animationKey}>
      <div className="pbi-legend">
        {series.map(([key, label, color]) => (
          <button
            className={`pbi-legend-item${visibleSeries[key] ? "" : " is-muted"}`}
            type="button"
            key={key}
            onClick={() => setVisibleSeries((current) => toggleVisibleSeries(current, key))}
            aria-pressed={visibleSeries[key]}
          >
            <i className="pbi-legend-swatch" style={{ backgroundColor: color }} />{label}
          </button>
        ))}
      </div>
      <div className="pbi-training-list">
        {data.map((item, index) => {
          const total = item.completed + item.pending;
          const workerName = item.workerName || item.name;
          const selected = selectedNames.includes(workerName);
          const dimmed = selectedNames.length > 0 && !selected;
          return (
            <div
              className={`pbi-training-row${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
              key={`${animationKey}-${item.workerId}`}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-pressed={onSelect ? selected : undefined}
              onClick={() => onSelect?.({ ...item, workerName })}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect({ ...item, workerName });
                }
              }}
              onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${item.completed} completadas · ${item.pending} pendientes`, `${Math.round((item.completed / Math.max(total, 1)) * 100)}% completado`)}
              onPointerLeave={() => setTooltip(null)}
              onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${item.completed} completadas · ${item.pending} pendientes`, "Presiona Enter para filtrar")}
              onBlur={() => setTooltip(null)}
            >
              <strong>{item.name}</strong>
              <span className="pbi-training-track" aria-hidden="true">
                <i style={{ width: visibleSeries.completed ? `${(item.completed / Math.max(total, 1)) * 100}%` : "0%", backgroundColor: "#05a942", "--pbi-index": index }} />
                <i style={{ width: visibleSeries.pending ? `${(item.pending / Math.max(total, 1)) * 100}%` : "0%", backgroundColor: "#ef8f3d", "--pbi-index": index }} />
              </span>
              <span>{item.completed}/{total}</span>
            </div>
          );
        })}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function treemapLayout(data) {
  const items = [...data].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length || !total) return [];

  const tile = (item, x, y, width, height) => ({ ...item, x, y, width, height, area: (width * height) / 100 });
  if (items.length === 1) return [tile(items[0], 0, 0, 100, 100)];
  if (items.length === 2) {
    const firstWidth = (items[0].value / total) * 100;
    return [tile(items[0], 0, 0, firstWidth, 100), tile(items[1], firstWidth, 0, 100 - firstWidth, 100)];
  }
  if (items.length === 3) {
    const firstWidth = (items[0].value / total) * 100;
    const remaining = items[1].value + items[2].value;
    const secondHeight = (items[1].value / remaining) * 100;
    return [
      tile(items[0], 0, 0, firstWidth, 100),
      tile(items[1], firstWidth, 0, 100 - firstWidth, secondHeight),
      tile(items[2], firstWidth, secondHeight, 100 - firstWidth, 100 - secondHeight)
    ];
  }

  // La partición reproduce el treemap binario de Power BI: dos bloques apilados
  // a la izquierda, dos principales a la derecha y las marcas menores al pie.
  const leftItems = items.slice(0, 2);
  const rightTopItems = items.slice(2, 4);
  const rightBottomItems = items.slice(4);
  const leftTotal = leftItems.reduce((sum, item) => sum + item.value, 0);
  const rightTopTotal = rightTopItems.reduce((sum, item) => sum + item.value, 0);
  const rightBottomTotal = rightBottomItems.reduce((sum, item) => sum + item.value, 0);
  const rightTotal = rightTopTotal + rightBottomTotal;
  const leftWidth = (leftTotal / total) * 100;
  const rightWidth = 100 - leftWidth;
  const firstHeight = (leftItems[0].value / leftTotal) * 100;
  const rightTopHeight = rightTotal ? (rightTopTotal / rightTotal) * 100 : 100;
  const thirdWidth = (rightTopItems[0].value / rightTopTotal) * rightWidth;
  const tiles = [
    tile(leftItems[0], 0, 0, leftWidth, firstHeight),
    tile(leftItems[1], 0, firstHeight, leftWidth, 100 - firstHeight),
    tile(rightTopItems[0], leftWidth, 0, thirdWidth, rightTopHeight),
    tile(rightTopItems[1], leftWidth + thirdWidth, 0, rightWidth - thirdWidth, rightTopHeight)
  ];

  if (rightBottomItems.length) {
    let x = leftWidth;
    rightBottomItems.forEach((item) => {
      const width = (item.value / rightBottomTotal) * rightWidth;
      tiles.push(tile(item, x, rightTopHeight, width, 100 - rightTopHeight));
      x += width;
    });
  }
  return tiles;
}

function TreemapChart({ data, ariaLabel, onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const tiles = treemapLayout(data);
  const total = tiles.reduce((sum, item) => sum + item.value, 0);
  const animationKey = tiles.map((item) => `${item.name}:${item.value}`).join("|");
  if (!tiles.length) return <p className="pbi-chart-empty">No hay pares etiquetados para el filtro seleccionado.</p>;

  return (
    <div className="pbi-treemap" role="group" aria-label={ariaLabel} data-animation-key={animationKey} data-testid="brand-treemap">
      {tiles.map((item, index) => {
        const selected = selectedNames.includes(item.name);
        const dimmed = selectedNames.length > 0 && !selected;
        const compact = item.area < 7;
        const tiny = item.area < 3.5;
        return (
          <button
            className={`pbi-treemap-tile${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${compact ? " is-compact" : ""}${tiny ? " is-tiny" : ""}`}
            type="button"
            key={`${animationKey}-${item.name}`}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              width: `${item.width}%`,
              height: `${item.height}%`,
              backgroundColor: BRAND_TREEMAP_COLORS[item.name] || BRAND_COLORS[index % BRAND_COLORS.length],
              "--pbi-index": index
            }}
            onClick={() => onSelect?.(item)}
            onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${numberFormatter.format(item.value)} ${item.value === 1 ? "par" : "pares"}`, `${((item.value / total) * 100).toFixed(1)}% del total`)}
            onPointerLeave={() => setTooltip(null)}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${numberFormatter.format(item.value)} ${item.value === 1 ? "par" : "pares"}`, "Presiona Enter para filtrar")}
            onBlur={() => setTooltip(null)}
            aria-pressed={selected}
            aria-label={`${item.name}: ${numberFormatter.format(item.value)} ${item.value === 1 ? "par" : "pares"}`}
          >
            <span>{item.name}</span>
            <strong>{numberFormatter.format(item.value)} {item.value === 1 ? "par" : "pares"}</strong>
          </button>
        );
      })}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function DonutChart({ id, data, ariaLabel, unit = "pares", onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const [hiddenNames, setHiddenNames] = useState([]);
  const dataNamesKey = data.map((item) => item.name).join("|");
  useEffect(() => {
    setHiddenNames((current) => {
      const next = current.filter((name) => data.some((item) => item.name === name));
      return next.length === current.length ? current : next;
    });
  }, [dataNamesKey, data]);
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const animationKey = data.map((item) => `${item.name}:${item.value}`).join("|");
  let offset = 0;

  return (
    <div className="pbi-donut-layout" data-animation-key={animationKey}>
      <div className="pbi-donut-chart">
        <svg key={animationKey} className="pbi-chart-svg" viewBox="0 0 240 240" role={onSelect ? "group" : "img"} aria-labelledby={`${id}-chart-title`}>
          <title id={`${id}-chart-title`}>{ariaLabel}</title>
          <circle className="pbi-donut-track" cx="120" cy="120" r="82" pathLength="100" />
          {data.map((item, index) => {
            const percent = total ? (item.value / total) * 100 : 0;
            const currentOffset = offset;
            offset += percent;
            const selected = selectedNames.includes(item.name);
            const dimmed = hiddenNames.includes(item.name) || (selectedNames.length > 0 && !selected);
            return (
              <circle
                className={`pbi-donut-segment${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
                key={item.name}
                cx="120"
                cy="120"
                r="82"
                pathLength="100"
                stroke={BRAND_COLORS[index % BRAND_COLORS.length]}
                strokeDasharray={`${percent} ${100 - percent}`}
                strokeDashoffset={-currentOffset}
                style={{ "--pbi-index": index }}
                tabIndex="0"
                focusable="true"
                role={onSelect ? "button" : undefined}
                aria-pressed={onSelect ? selected : undefined}
                onClick={() => onSelect?.(item)}
                onKeyDown={(event) => {
                  if (onSelect && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelect(item);
                  }
                }}
                onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${item.value} ${unit}`, `${percent.toFixed(1)}% del total`)}
                onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${item.value} ${unit}`, `${percent.toFixed(1)}% del total`)}
                onBlur={() => setTooltip(null)}
                onMouseLeave={() => setTooltip(null)}
              >
                <title>{`${item.name}: ${item.value} ${unit}`}</title>
              </circle>
            );
          })}
          <text className="pbi-donut-total" x="120" y="113" textAnchor="middle">{numberFormatter.format(total)}</text>
          <text className="pbi-donut-caption" x="120" y="137" textAnchor="middle">{unit}</text>
        </svg>
      </div>
      <div className="pbi-legend" aria-label={`Leyenda: ${ariaLabel}`}>
        {data.map((item, index) => (
          <button
            className={`pbi-legend-item${hiddenNames.includes(item.name) ? " is-muted" : ""}`}
            type="button"
            key={item.name}
            onClick={() => setHiddenNames((current) => {
              if (current.includes(item.name)) return current.filter((name) => name !== item.name);
              return current.length >= data.length - 1 ? current : [...current, item.name];
            })}
            aria-pressed={!hiddenNames.includes(item.name)}
          >
            <span className="pbi-legend-swatch" style={{ backgroundColor: BRAND_COLORS[index % BRAND_COLORS.length] }} aria-hidden="true" />
            <span>{item.name}</span>
            <strong>{item.value}</strong>
          </button>
        ))}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function DataTable({ caption, columns, rows }) {
  return (
    <div className="pbi-table-wrap">
      <table className="pbi-data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td className="pbi-table-empty" colSpan={columns.length}>No hay datos para el filtro seleccionado.</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.id ?? `${row[columns[0].key]}-${index}`}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndicatorKpi({ label, value, suffix, detail }) {
  return (
    <article className="pbi-kpi pbi-kpi--indicator">
      <span className="pbi-kpi-label">{label}</span>
      <span className="pbi-indicator-value">
        <strong className="pbi-kpi-value">{value}</strong>
        {suffix ? <small>{suffix}</small> : null}
      </span>
      <small className="pbi-kpi-detail">{detail}</small>
    </article>
  );
}

function distributeTotal(total, weights) {
  const sum = weights.reduce((accumulator, value) => accumulator + value, 0);
  if (!total || !sum) return Array(12).fill(0);
  const raw = weights.map((weight) => (weight / sum) * total);
  const values = raw.map(Math.floor);
  let remainder = total - values.reduce((accumulator, value) => accumulator + value, 0);
  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remainder > 0) {
        values[index] += 1;
        remainder -= 1;
      }
    });
  return values;
}

function taskMonthlySeries(task, year) {
  return TASK_MONTHLY_BY_YEAR[year]?.[task.shortName]
    || distributeTotal(task.yearly[year] || 0, YEAR_MONTHLY_TASKS[year]);
}

function monthSelectionFactor(dateParts, monthNumber, years) {
  const selectedMonths = Object.keys(dateParts);
  if (!selectedMonths.length) return 1;
  if (!Object.prototype.hasOwnProperty.call(dateParts, monthNumber)) return 0;
  const days = dateParts[monthNumber];
  if (days === null) return 1;
  const totalDays = availableDaysForMonth(years, monthNumber).length;
  if (!totalDays) return 0;
  return days.length / totalDays;
}

function workerPointsForPeriod(worker, years, dateParts) {
  const effectiveYears = years.length ? years : [2025, 2026];
  return effectiveYears.reduce((total, year) => total + worker.points[year].reduce((yearTotal, value, monthIndex) => (
    yearTotal + value * monthSelectionFactor(dateParts, monthIndex + 1, effectiveYears)
  ), 0), 0);
}

function aliasToWorkerName(alias) {
  return WORKERS.find((worker) => worker.alias === alias)?.name || alias;
}

function selectedLabel(options, values, fallback) {
  if (!values.length) return fallback;
  const labels = values.map((value) => options.find((option) => option.value === value)?.label).filter(Boolean);
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} seleccionados`;
}

export default function FootwearDashboard() {
  const dashboardRef = useRef(null);
  const dashboardRequestRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [dateParts, setDateParts] = useState({});
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState([]);
  const [movementYear, setMovementYear] = useState("");
  const [selectedMovementMonths, setSelectedMovementMonths] = useState([]);

  const refreshDashboard = useCallback(async ({ silent = false } = {}) => {
    dashboardRequestRef.current?.abort();
    const controller = new AbortController();
    dashboardRequestRef.current = controller;
    if (!silent) setIsRefreshing(true);
    try {
      const payload = await loadFootwearDashboard({ signal: controller.signal });
      setDashboardData(payload);
      setDashboardError("");
    } catch (error) {
      if (error?.name !== "AbortError") setDashboardError(error.message || "No se pudo actualizar el dashboard.");
    } finally {
      if (dashboardRequestRef.current === controller) {
        dashboardRequestRef.current = null;
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshDashboard();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshDashboard({ silent: true });
    }, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDashboard({ silent: true });
    };
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      dashboardRequestRef.current?.abort();
    };
  }, [refreshDashboard]);

  useEffect(() => {
    function handleFullscreenChange() {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(fullscreenElement === dashboardRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  const WORKERS = useMemo(() => dashboardData?.workers || [], [dashboardData]);
  const TASK_CATALOG = useMemo(() => (dashboardData?.tasks || []).map((task) => ({ ...task, shortName: task.name })), [dashboardData]);
  const BRAND_NAMES = useMemo(() => (dashboardData?.brands || []).map((brand) => brand.name), [dashboardData]);
  const dashboardYears = useMemo(() => dashboardData?.years || [], [dashboardData]);
  const effectiveYears = selectedYears.length ? selectedYears : dashboardYears;
  const workerById = useMemo(() => new Map(WORKERS.map((worker) => [worker.id, worker])), [WORKERS]);
  const taskById = useMemo(() => new Map(TASK_CATALOG.map((task) => [task.id, task])), [TASK_CATALOG]);
  const brandById = useMemo(() => new Map((dashboardData?.brands || []).map((brand) => [brand.id, brand.name])), [dashboardData]);

  const dateDaysByYear = useMemo(() => {
    const result = {};
    const addDate = (date) => {
      const [year, month, day] = String(date || "").split("-").map(Number);
      if (!year || !month || !day) return;
      result[year] ||= {};
      result[year][month] ||= [];
      if (!result[year][month].includes(day)) result[year][month].push(day);
    };
    [
      ...(dashboardData?.activities || []), ...(dashboardData?.attendances || []),
      ...(dashboardData?.incidents || []), ...(dashboardData?.warnings || []),
      ...(dashboardData?.movements || [])
    ].forEach((row) => addDate(row.date));
    Object.values(result).forEach((months) => Object.values(months).forEach((days) => days.sort((a, b) => a - b)));
    return result;
  }, [dashboardData]);

  function matchesDashboardDate(date) {
    const [year, month, day] = String(date || "").split("-").map(Number);
    if (!year || !effectiveYears.includes(year)) return false;
    if (!Object.keys(dateParts).length) return true;
    if (!Object.prototype.hasOwnProperty.call(dateParts, month)) return false;
    return dateParts[month] === null || dateParts[month].includes(day);
  }

  function matchesWorker(workerId) {
    const worker = workerById.get(Number(workerId));
    return (!selectedWorkerIds.length || selectedWorkerIds.includes(Number(workerId)))
      && (!selectedRoles.length || (worker && selectedRoles.includes(worker.role)));
  }

  const tasksAllowedByFilters = TASK_CATALOG.filter((task) => (
    (!selectedTaskIds.length || selectedTaskIds.includes(task.id))
    && (!selectedTaskTypes.length || selectedTaskTypes.includes(task.type))
  ));
  const allowedTaskIds = new Set(tasksAllowedByFilters.map((task) => task.id));
  const visibleActivities = (dashboardData?.activities || []).filter((row) => (
    matchesDashboardDate(row.date)
    && matchesWorker(row.workerId)
    && allowedTaskIds.has(row.taskId)
    && (!selectedBrands.length || selectedBrands.includes(brandById.get(row.brandId)))
  ));
  // Los incidentes no almacenan marca. Calidad usa el mismo universo sin el
  // filtro de marca para que numerador y denominador sigan siendo comparables.
  const qualityActivities = (dashboardData?.activities || []).filter((row) => (
    matchesDashboardDate(row.date)
    && matchesWorker(row.workerId)
    && allowedTaskIds.has(row.taskId)
  ));

  const workerOptions = WORKERS.filter((worker) => !selectedRoles.length || selectedRoles.includes(worker.role)).map((worker) => ({
    value: worker.id,
    label: worker.name,
    count: (dashboardData?.activities || []).filter((row) => row.workerId === worker.id && matchesDashboardDate(row.date)).reduce((sum, row) => sum + row.points, 0)
  }));
  const ROLE_OPTIONS = [...WORKERS.reduce((roles, worker) => {
    if (worker.active) roles.set(worker.role, (roles.get(worker.role) || 0) + 1);
    return roles;
  }, new Map()).entries()].map(([value, active]) => ({
    value, active, label: value.replace(/\b\w/g, (letter) => letter.toUpperCase())
  }));
  const roleOptions = ROLE_OPTIONS.map((role) => ({ value: role.value, label: role.label, count: role.active }));
  const brandOptions = BRAND_NAMES.map((name) => ({
    value: name, label: name,
    count: (dashboardData?.activities || []).filter((row) => brandById.get(row.brandId) === name && matchesDashboardDate(row.date)).length
  }));
  const workersAllowedByFilters = WORKERS.filter((worker) => matchesWorker(worker.id));
  const workerProduction = workerProductionRows(workersAllowedByFilters, visibleActivities, selectedWorkerIds);
  const filteredTopWorkers = [...workerProduction].sort((a, b) => b.value - a.value).slice(0, 5);
  const filteredBottomWorkers = [...workerProduction].sort((a, b) => a.value - b.value).slice(0, 5).sort((a, b) => b.value - a.value);
  const activityYears = [...new Set((dashboardData?.activities || []).map((row) => Number(row.date?.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b);
  const monthlySeriesYears = effectiveYears.filter((year) => activityYears.includes(year));
  const filteredMonthlyTasks = (monthlySeriesYears.length ? monthlySeriesYears : effectiveYears.slice(-1)).flatMap((year) => (
    MONTHLY_TASKS.map((month, monthIndex) => ({
      ...month,
      monthNumber: monthIndex + 1,
      year,
      label: monthlySeriesYears.length > 1 ? `${month.label} ${String(year).slice(-2)}` : month.label,
      value: visibleActivities.filter((row) => Number(row.date.slice(0, 4)) === year && Number(row.date.slice(5, 7)) === monthIndex + 1).length
    })).filter((month, monthIndex) => !Object.keys(dateParts).length || Object.prototype.hasOwnProperty.call(dateParts, monthIndex + 1))
  ));
  const allFilteredTaskRows = taskVolumeRows(tasksAllowedByFilters, visibleActivities);
  const filteredTaskVolume = (!selectedTaskIds.length && !selectedTaskTypes.length && !selectedBrands.length)
    ? allFilteredTaskRows.slice(0, 10) : allFilteredTaskRows;
  const filteredBrands = buildTaggedPairsByBrand(visibleActivities, taskById, brandById);
  const selectedTaskTotal = visibleActivities.length;
  const taskVolumeTotal = allFilteredTaskRows.reduce((sum, item) => sum + item.value, 0);
  const filteredActivityKpis = TASK_CATALOG.filter((task) => task.requiresTime && allowedTaskIds.has(task.id)).slice(0, 5).map((task) => {
    const rows = visibleActivities.filter((row) => row.taskId === task.id);
    return { label: task.shortName, ...timedActivityKpi(rows) };
  });

  const selectedWorkerNames = selectedWorkerIds.map((id) => workerById.get(id)?.name).filter(Boolean);
  const visibleIncidentRecords = (dashboardData?.incidents || []).filter((incident) => (
    matchesDashboardDate(incident.date) && matchesWorker(incident.workerId)
    && (!incident.taskId || allowedTaskIds.has(incident.taskId))
  ));
  const incidentCountByTask = visibleIncidentRecords.reduce((counts, incident) => {
    counts.set(incident.taskId, (counts.get(incident.taskId) || 0) + 1);
    return counts;
  }, new Map());
  const filteredErrorsByTask = [...incidentCountByTask.entries()].map(([taskId, value]) => ({
    id: taskId,
    name: taskById.get(taskId)?.shortName || `Tarea ${taskId}`,
    value
  })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const filteredErrorRates = filteredErrorsByTask.map((item) => {
    const taskItem = taskById.get(item.id);
    const denominator = qualityActivities.filter((row) => row.taskId === item.id).length;
    return {
      ...item,
      name: taskItem?.name || item.name,
      selectionName: item.name,
      value: denominator ? (item.value / denominator) * 100 : 0
    };
  }).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const filteredErrorsByWorker = [...visibleIncidentRecords.reduce((counts, incident) => {
    const workerName = workerById.get(incident.workerId)?.name || "Sin trabajador";
    counts.set(workerName, (counts.get(workerName) || 0) + 1);
    return counts;
  }, new Map()).entries()].map(([name, value]) => ({ name, value, workerName: name })).sort((a, b) => b.value - a.value);
  const errorTypes = [...new Set(visibleIncidentRecords.map((incident) => incident.errorType))];
  const filteredErrorsByType = errorTypes.map((name) => ({
    name,
    primary: visibleIncidentRecords.filter((incident) => incident.errorType === name && incident.shift === "regular").length,
    secondary: visibleIncidentRecords.filter((incident) => incident.errorType === name && incident.shift === "extra").length
  })).filter((item) => item.primary + item.secondary > 0);
  const filteredAttendance = [...(dashboardData?.attendances || []).filter((row) => matchesDashboardDate(row.date) && matchesWorker(row.workerId)).reduce((totals, row) => {
    const worker = workerById.get(row.workerId);
    if (!worker) return totals;
    const item = totals.get(row.workerId) || { name: worker.alias, workerName: worker.name, workerId: worker.id, absent: 0, punctual: 0, late: 0 };
    if (row.state === "PUNTUAL") item.punctual += 1;
    else if (row.state === "TARDANZA") item.late += 1;
    else item.absent += 1;
    totals.set(row.workerId, item);
    return totals;
  }, new Map()).values()];
  const trainingById = new Map((dashboardData?.trainings || []).map((course) => [course.id, course]));
  const visibleAssignments = (dashboardData?.trainingAssignments || []).filter((row) => (
    matchesWorker(row.workerId) && (!row.date || matchesDashboardDate(row.date))
  ));
  const filteredTrainingProgress = [...visibleAssignments.reduce((totals, assignment) => {
    const worker = workerById.get(assignment.workerId);
    if (!worker) return totals;
    const item = totals.get(worker.id) || { workerId: worker.id, name: worker.alias, workerName: worker.name, completed: 0, pending: 0 };
    if (["finalizado", "completado"].includes(assignment.state)) item.completed += 1;
    else item.pending += 1;
    totals.set(worker.id, item);
    return totals;
  }, new Map()).values()];
  const trainingCompleted = filteredTrainingProgress.reduce((sum, item) => sum + item.completed, 0);
  const trainingTotal = filteredTrainingProgress.reduce((sum, item) => sum + item.completed + item.pending, 0);
  const filteredTrainingHistory = visibleAssignments.map((assignment) => {
    const course = trainingById.get(assignment.trainingId) || {};
    const worker = workerById.get(assignment.workerId);
    return { ...course, id: assignment.id, worker: worker?.alias || worker?.name || "Sin trabajador", status: ["finalizado", "completado"].includes(assignment.state) ? "Completado" : assignment.state === "en_curso" ? "En curso" : "Pendiente" };
  });
  const attendanceTotals = filteredAttendance.reduce((totals, item) => ({
    absent: totals.absent + item.absent,
    punctual: totals.punctual + item.punctual,
    late: totals.late + item.late
  }), { absent: 0, punctual: 0, late: 0 });
  const attendanceTotal = attendanceTotals.absent + attendanceTotals.punctual + attendanceTotals.late;
  const filteredIndicators = [
    { label: "Margen de error", detail: "Incidentes / registros", value: `${qualityActivities.length ? ((visibleIncidentRecords.length / qualityActivities.length) * 100).toFixed(2) : "0.00"}%` },
    { label: "Ausentismo", detail: "Registro de asistencias", value: `${attendanceTotal ? ((attendanceTotals.absent / attendanceTotal) * 100).toFixed(2) : "0.00"}%` },
    { label: "Tardanza", detail: "Llegadas fuera de hora", value: `${attendanceTotal ? ((attendanceTotals.late / attendanceTotal) * 100).toFixed(2) : "0.00"}%` },
    { label: "Permanencia promedio", detail: "Personal activo", suffix: "meses", value: (() => {
      const active = workersAllowedByFilters.filter((worker) => worker.active && worker.joinedAt);
      if (!active.length) return "0.00";
      return (active.reduce((sum, worker) => sum + Math.max(0, (Date.now() - new Date(`${worker.joinedAt}T00:00:00`).getTime()) / 2_629_746_000), 0) / active.length).toFixed(2);
    })() }
  ];
  const filteredWarnings = [...(dashboardData?.warnings || []).filter((row) => matchesDashboardDate(row.date) && matchesWorker(row.workerId)).reduce((totals, row) => {
    const worker = workerById.get(row.workerId);
    const alias = worker?.alias || worker?.name || "Sin trabajador";
    totals.set(alias, { alias, workerName: worker?.name || alias, value: (totals.get(alias)?.value || 0) + 1 });
    return totals;
  }, new Map()).values()].sort((a, b) => b.value - a.value);

  const visibleMovements = (dashboardData?.movements || []).filter((row) => (
    matchesDashboardDate(row.date)
    && (!movementYear || Number(row.date.slice(0, 4)) === Number(movementYear))
    && matchesWorker(row.workerId)
  ));
  const filteredRotation = MONTHLY_TASKS.map((month, monthIndex) => ({
    name: month.label,
    primary: visibleMovements.filter((row) => Number(row.date.slice(5, 7)) === monthIndex + 1 && /ingreso/i.test(row.type)).length,
    secondary: visibleMovements.filter((row) => Number(row.date.slice(5, 7)) === monthIndex + 1 && /salida/i.test(row.type)).length
  }));
  const EXIT_REASONS = [...visibleMovements.filter((row) => /salida/i.test(row.type) && (!selectedMovementMonths.length || selectedMovementMonths.includes(MONTHLY_TASKS[Number(row.date.slice(5, 7)) - 1].label))).reduce((totals, row) => {
    const name = row.reason || "Sin especificar";
    totals.set(name, (totals.get(name) || 0) + 1);
    return totals;
  }, new Map()).entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const nowParts = dashboardDateParts();
  const payrollCandidateYears = selectedYears.length ? selectedYears : dashboardYears;
  const payrollYear = payrollCandidateYears.includes(nowParts.year) ? nowParts.year : payrollCandidateYears.at(-1);
  const payrollLastMonth = payrollYear < nowParts.year ? 12 : payrollYear === nowParts.year ? nowParts.month : 0;
  const allowedPayrollWorkers = new Set(workersAllowedByFilters.map((worker) => Number(worker.id)));
  const payrollMonthIndexes = Array.from({ length: payrollLastMonth }, (_, index) => index)
    .filter((monthIndex) => !Object.keys(dateParts).length || Object.prototype.hasOwnProperty.call(dateParts, monthIndex + 1));
  const filteredPayroll = payrollMonthIndexes.map((monthIndex) => {
    const byWorker = dashboardData?.payrollByWorker?.[payrollYear]?.[monthIndex];
    const value = byWorker
      ? Object.entries(byWorker).reduce((sum, [workerId, amount]) => (
        allowedPayrollWorkers.has(Number(workerId)) ? sum + Number(amount || 0) : sum
      ), 0)
      : Object.entries(dashboardData?.payrollByRole?.[payrollYear]?.[monthIndex] || {}).reduce((sum, [role, amount]) => (
        !selectedRoles.length || selectedRoles.includes(role) ? sum + Number(amount || 0) : sum
      ), 0);
    return { ...MONTHLY_TASKS[monthIndex], value };
  });
  const payrollTotal = filteredPayroll.reduce((sum, item) => sum + item.value, 0);
  const payrollPeriodLabel = payrollMonthIndexes.length
    ? payrollMonthIndexes.every((monthIndex, index) => monthIndex === index)
      ? `ene–${MONTHLY_TASKS[payrollMonthIndexes.at(-1)].label.toLowerCase()}`
      : `${payrollMonthIndexes.length} meses seleccionados`
    : "sin período";
  const activeWorkers = workersAllowedByFilters.filter((worker) => worker.active);
  const personnelKpis = [
    { label: "Total Trabajadores", value: activeWorkers.length },
    { label: "Total Operantes", value: activeWorkers.filter((worker) => ["operante", "jefe de equipo", "jefe de grupo"].includes(worker.role)).length },
    { label: "Total Administrativo", value: activeWorkers.filter((worker) => !["operante", "jefe de equipo", "jefe de grupo"].includes(worker.role)).length }
  ];
  const nextBirthday = (() => {
    const today = new Date();
    return workersAllowedByFilters.filter((worker) => worker.active && worker.birthday).map((worker) => {
      const [, month, day] = worker.birthday.split("-").map(Number);
      let date = new Date(today.getFullYear(), month - 1, day);
      if (date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) date = new Date(today.getFullYear() + 1, month - 1, day);
      return { ...worker, nextBirthday: date };
    }).sort((a, b) => a.nextBirthday - b.nextBirthday)[0];
  })();

  function closeOpenSlicers() {
    dashboardRef.current?.querySelectorAll("details.pbi-slicer[open]").forEach((element) => {
      element.open = false;
    });
  }

  function resetFilters() {
    closeOpenSlicers();
    setSelectedWorkerIds([]);
    setSelectedRoles([]);
    setSelectedBrands([]);
    setSelectedYears([]);
    setDateParts({});
    setSelectedTaskIds([]);
    setSelectedTaskTypes([]);
    setMovementYear("");
    setSelectedMovementMonths([]);
  }

  function selectWorkerFromChart(item) {
    closeOpenSlicers();
    const id = WORKERS.find((worker) => worker.name === (item.workerName || item.name))?.id;
    if (id) setSelectedWorkerIds((current) => toggleArrayValue(current, id));
  }

  function selectTaskFromChart(item) {
    closeOpenSlicers();
    const aliases = { "Clasificado y Rotulado": "Clasificado", "Visita de Tienda": "Visita Tienda" };
    const itemName = aliases[item.name] || item.name;
    const taskItem = TASK_CATALOG.find((candidate) => candidate.id === item.id || candidate.shortName === itemName || candidate.name === itemName);
    if (taskItem) setSelectedTaskIds((current) => toggleArrayValue(current, taskItem.id));
  }

  function selectMonthFromChart(item) {
    closeOpenSlicers();
    const monthIndex = item.monthNumber
      ? Number(item.monthNumber) - 1
      : MONTHLY_TASKS.findIndex((month) => month.name === item.name || month.label === item.label || month.label === item.name);
    if (monthIndex < 0) return;
    const monthNumber = monthIndex + 1;
    setDateParts((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, monthNumber)) delete next[monthNumber];
      else next[monthNumber] = null;
      return next;
    });
  }

  function selectBrandFromChart(item) {
    closeOpenSlicers();
    setSelectedBrands((current) => toggleArrayValue(current, item.name));
  }

  function toggleTaskType(type) {
    const nextTypes = toggleArrayValue(selectedTaskTypes, type);
    setSelectedTaskTypes(nextTypes);
    setSelectedTaskIds((current) => current.filter((id) => {
      const taskItem = TASK_CATALOG.find((candidate) => candidate.id === id);
      return taskItem && (!nextTypes.length || nextTypes.includes(taskItem.type));
    }));
  }

  function changeRoles(nextRoles) {
    setSelectedRoles(nextRoles);
    setSelectedWorkerIds((current) => current.filter((id) => {
      const worker = WORKERS.find((candidate) => candidate.id === id);
      return worker && (!nextRoles.length || nextRoles.includes(worker.role));
    }));
  }

  async function toggleFullscreen() {
    const element = dashboardRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      }
    } catch {
      setIsFullscreen(false);
    }
  }

  const activeFilters = [
    selectedWorkerIds.length ? { key: "workers", label: `Trabajador: ${selectedLabel(workerOptions, selectedWorkerIds, "Todos")}`, clear: () => setSelectedWorkerIds([]) } : null,
    selectedRoles.length ? { key: "roles", label: `Cargo: ${selectedLabel(roleOptions, selectedRoles, "Todos")}`, clear: () => setSelectedRoles([]) } : null,
    selectedBrands.length ? { key: "brands", label: `Marca: ${selectedLabel(brandOptions, selectedBrands, "Todas")}`, clear: () => setSelectedBrands([]) } : null,
    selectedYears.length ? { key: "years", label: `Año: ${selectedYears.join(", ")}`, clear: () => setSelectedYears([]) } : null,
    Object.keys(dateParts).length ? { key: "date", label: `Fecha: ${Object.keys(dateParts).length} mes(es)`, clear: () => setDateParts({}) } : null,
    selectedTaskIds.length ? { key: "tasks", label: `Tarea: ${selectedTaskIds.length} seleccionada(s)`, clear: () => setSelectedTaskIds([]) } : null,
    selectedTaskTypes.length ? { key: "task-types", label: `Tipo: ${selectedTaskTypes.join(", ")}`, clear: () => setSelectedTaskTypes([]) } : null,
    movementYear ? { key: "movement", label: `Rotación: ${movementYear}`, clear: () => setMovementYear("") } : null,
    selectedMovementMonths.length ? { key: "movement-months", label: `Mes rotación: ${selectedMovementMonths.join(", ")}`, clear: () => setSelectedMovementMonths([]) } : null
  ].filter(Boolean);
  const filterSummary = activeFilters.length
    ? `${activeFilters.length} filtros activos · ${numberFormatter.format(selectedTaskTotal)} registros de producción visibles`
    : `Todos los trabajadores · Todos los cargos · ${dashboardYears.join("–") || "Sin período"} · Todas las fechas`;
  const updatedAtLabel = dashboardData?.generatedAt
    ? new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(dashboardData.generatedAt))
    : "Sin sincronizar";

  return (
    <section
      className={`pbi-dashboard-shell${isFullscreen ? " pbi-dashboard-shell--fullscreen" : ""}`}
      ref={dashboardRef}
      aria-label="Dashboard administrativo de calzado"
    >
      <div className="pbi-dashboard">
        <div className="pbi-topbar">
          <div className="pbi-topbar-copy">
            <span className="pbi-eyebrow">Control operativo</span>
            <span className="pbi-filter-summary" aria-live="polite">{filterSummary}</span>
          </div>
          <div className="pbi-actions">
            <button className={`pbi-icon-btn${isRefreshing ? " is-loading" : ""}`} type="button" onClick={() => refreshDashboard()} disabled={isRefreshing} aria-label="Actualizar datos desde Supabase">
              <RefreshIcon />
              <span>{isRefreshing ? "Actualizando" : "Actualizar"}</span>
            </button>
            <button className="pbi-icon-btn" type="button" onClick={resetFilters} aria-label="Restablecer todos los filtros">
              <ResetIcon />
              <span>Restablecer</span>
            </button>
            <button
              className="pbi-fullscreen-btn"
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Ver dashboard en pantalla completa"}
            >
              <FullscreenIcon active={isFullscreen} />
              <span>{isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}</span>
            </button>
          </div>
        </div>

        <header className="pbi-header">
          <div className="pbi-brand">
            <DashboardLogo />
            <div>
              <h1 className="pbi-title">DASHBOARD CALZADO</h1>
              <p className="pbi-subtitle">Resumen integral de producción, personal y calidad</p>
            </div>
          </div>
          <div className="pbi-header-status">
            <span className="pbi-status-dot" aria-hidden="true" />
            <span>{dashboardData ? `Supabase · actualizado ${updatedAtLabel}` : "Conectando con Supabase"}</span>
          </div>
        </header>

        {dashboardError ? (
          <div className="pbi-data-alert" role="alert">
            <strong>No se pudo sincronizar.</strong>
            <span>{dashboardError}</span>
            <button type="button" onClick={() => refreshDashboard()}>Reintentar</button>
          </div>
        ) : null}

        <main className={`pbi-main${!dashboardData ? " is-data-loading" : ""}`} aria-busy={!dashboardData}>
          <aside className="pbi-sidebar" aria-label="Filtros del dashboard">
            <div className="pbi-kpi-grid pbi-kpi-grid--personnel">
              {personnelKpis.map((item) => <PersonnelKpi key={item.label} {...item} />)}
            </div>

            <div className="pbi-filter-grid">
              <MultiSlicer id="workers" label="Trabajadores" options={workerOptions} selected={selectedWorkerIds} onChange={setSelectedWorkerIds} allLabel="Todos" />
              <MultiSlicer id="roles" label="Cargos" options={roleOptions} selected={selectedRoles} onChange={changeRoles} allLabel="Todos" searchable={false} />
              <MultiSlicer id="brands" label="Marcas" options={brandOptions} selected={selectedBrands} onChange={setSelectedBrands} allLabel="Todas" alignEnd />
            </div>

            <fieldset className="pbi-filter pbi-filter--year">
              <legend className="pbi-filter-label">Año</legend>
              <div className="pbi-period" role="group" aria-label="Seleccionar uno o varios años" data-testid="slicer-years">
                {dashboardYears.map((item) => (
                  <button
                    className={`pbi-period-btn${selectedYears.includes(item) ? " pbi-period-btn--active" : ""}`}
                    type="button"
                    key={item}
                    onClick={() => setSelectedYears((current) => toggleArrayValue(current, item))}
                    aria-pressed={selectedYears.includes(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <DateHierarchySlicer selected={dateParts} onChange={setDateParts} years={selectedYears.length ? selectedYears : dashboardYears} dateDaysByYear={dateDaysByYear} />

            <fieldset className="pbi-filter pbi-filter--tasks">
              <legend className="pbi-filter-label">Tareas</legend>
              <div className="pbi-task-type-row" role="group" aria-label="Tipo de tarea" data-testid="slicer-task-types">
                <span>Tipo</span>
                {["Despacho", "General", "Ingreso"].map((type) => (
                  <button
                    className={`pbi-chip${selectedTaskTypes.includes(type) ? " pbi-chip--active" : ""}`}
                    type="button"
                    key={type}
                    onClick={() => toggleTaskType(type)}
                    aria-pressed={selectedTaskTypes.includes(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className="pbi-filter-chips" data-testid="slicer-tasks">
                <button
                  className={`pbi-chip${!selectedTaskIds.length ? " pbi-chip--active" : ""}`}
                  type="button"
                  onClick={() => setSelectedTaskIds([])}
                  aria-pressed={!selectedTaskIds.length}
                >
                  Todas
                </button>
                {TASK_CATALOG.filter((item) => !selectedTaskTypes.length || selectedTaskTypes.includes(item.type)).map((item) => (
                  <button
                    className={`pbi-chip${selectedTaskIds.includes(item.id) ? " pbi-chip--active" : ""}`}
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedTaskIds((current) => toggleArrayValue(current, item.id))}
                    aria-pressed={selectedTaskIds.includes(item.id)}
                  >
                    {item.shortName}
                  </button>
                ))}
              </div>
            </fieldset>

            {activeFilters.length ? (
              <div className="pbi-active-filters" aria-label="Filtros activos" data-testid="active-filters">
                <span className="pbi-active-filters-label">Filtros activos</span>
                <div className="pbi-active-filters-list">
                  {activeFilters.map((filter) => (
                    <span className="pbi-active-filter-chip" key={filter.key}>
                      <span>{filter.label}</span>
                      <button type="button" onClick={filter.clear} aria-label={`Quitar ${filter.label}`}>×</button>
                    </span>
                  ))}
                </div>
                <span className="pbi-filter-results" aria-live="polite">{numberFormatter.format(selectedTaskTotal)} registros</span>
                <button className="pbi-active-filters-clear" type="button" onClick={resetFilters}>Limpiar todo</button>
              </div>
            ) : null}
          </aside>

          <div className="pbi-report">
            <section className="pbi-kpi-grid pbi-kpi-grid--activities" aria-label="Promedios de producción">
              {filteredActivityKpis.map((item) => <ActivityKpi key={item.label} {...item} />)}
            </section>

            <section className="pbi-section-grid pbi-section-grid--indicators" aria-label="Indicadores generales">
              {filteredIndicators.map((item) => <IndicatorKpi key={item.label} {...item} />)}
              <article className="pbi-kpi pbi-kpi--birthday">
                <span className="pbi-kpi-label">Próximo Cumpleaños</span>
                <strong className="pbi-birthday-name">{nextBirthday?.name || "Sin fecha registrada"}</strong>
                <span className="pbi-birthday-date">{nextBirthday ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long" }).format(nextBirthday.nextBirthday) : "—"}</span>
              </article>
            </section>

            <section className="pbi-report-section" aria-labelledby="pbi-production-section-title">
              <div className="pbi-section-heading">
                <div>
                  <span className="pbi-section-kicker">Producción</span>
                  <h2 id="pbi-production-section-title">Producción y rendimiento</h2>
                </div>
                <p>Comparativo de productividad, volumen operativo y pares procesados.</p>
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-top-workers"
                  title="Top 5 Trabajadores por Producción"
                  meta="Suma de puntaje"
                  icon={<StarIcon />}
                  className="pbi-card--chart pbi-card--featured pbi-card--span-4"
                >
                  <VerticalBarChart
                    id="pbi-top-workers"
                    data={filteredTopWorkers}
                    ariaLabel="Top cinco trabajadores por producción"
                    onSelect={selectWorkerFromChart}
                    selectedNames={selectedWorkerNames}
                  />
                </Card>

                <Card
                  id="pbi-bottom-workers"
                  title="Bottom 5 Trabajadores por Producción"
                  meta="Suma de puntaje"
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <VerticalBarChart
                    id="pbi-bottom-workers"
                    data={filteredBottomWorkers}
                    ariaLabel="Cinco trabajadores con menor producción"
                    tone="blue"
                    onSelect={selectWorkerFromChart}
                    selectedNames={selectedWorkerNames}
                  />
                </Card>

                <Card
                  id="pbi-task-volume"
                  title="Volumen de Registros por Tarea"
                  meta={`${numberFormatter.format(taskVolumeTotal)} registros${filteredTaskVolume.length < allFilteredTaskRows.length ? ` · top ${filteredTaskVolume.length} visible` : ""}`}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <HorizontalBars
                    data={filteredTaskVolume}
                    ariaLabel="Volumen de registros por tipo de tarea"
                    color="#0a4f87"
                    onSelect={selectTaskFromChart}
                    selectedNames={selectedTaskIds.map((id) => TASK_CATALOG.find((taskItem) => taskItem.id === id)?.shortName).filter(Boolean)}
                  />
                </Card>

                <Card
                  id="pbi-monthly-tasks"
                  title="Evolución Mensual de Tareas"
                  meta={`${numberFormatter.format(selectedTaskTotal)} registros`}
                  className="pbi-card--chart pbi-card--span-8"
                >
                  <LineChart
                    id="pbi-monthly-tasks"
                    data={filteredMonthlyTasks}
                    ariaLabel={`Evolución mensual de tareas, total ${selectedTaskTotal}`}
                    tone="gold"
                    onSelect={selectMonthFromChart}
                    selectedNames={Object.keys(dateParts).map((monthNumber) => MONTHLY_TASKS[Number(monthNumber) - 1].name)}
                  />
                </Card>

                <Card
                  id="pbi-brand-pairs"
                  title="Pares Etiquetados por Marca"
                  meta={`${numberFormatter.format(filteredBrands.reduce((sum, item) => sum + item.value, 0))} pares`}
                  className="pbi-card--chart pbi-card--treemap pbi-card--span-4"
                >
                  <TreemapChart
                    data={filteredBrands}
                    ariaLabel="Pares etiquetados por marca"
                    onSelect={selectBrandFromChart}
                    selectedNames={selectedBrands}
                  />
                </Card>
              </div>
            </section>

            <section className="pbi-report-section" aria-labelledby="pbi-people-section-title">
              <div className="pbi-section-heading">
                <div>
                  <span className="pbi-section-kicker">Personas</span>
                  <h2 id="pbi-people-section-title">Personas y operación</h2>
                </div>
                <p>Movimientos, asistencia, permanencia y costo del equipo operativo.</p>
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-rotation"
                  title="Rotación de Personal por Mes"
                  meta={`${filteredRotation.reduce((sum, item) => sum + item.primary, 0)} ingresos · ${filteredRotation.reduce((sum, item) => sum + item.secondary, 0)} salidas`}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <div className="pbi-visual-filter">
                    <label htmlFor="pbi-movement-year">Período de rotación</label>
                    <select id="pbi-movement-year" value={movementYear} onChange={(event) => setMovementYear(event.target.value)} data-testid="movement-year-filter">
                      <option value="">Todos los años</option>
                      {dashboardYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <ComparisonBars
                    data={filteredRotation}
                    ariaLabel="Ingresos y salidas de personal por mes"
                    primaryLabel="Ingreso"
                    secondaryLabel="Salida"
                    primaryColor="#05b13e"
                    secondaryColor="#f4303f"
                    onSelect={(item) => setSelectedMovementMonths((current) => toggleArrayValue(current, item.name))}
                    selectedNames={selectedMovementMonths}
                  />
                </Card>

                <Card
                  id="pbi-exit-reasons"
                  title="Motivos de Salida del Personal"
                  meta={`${EXIT_REASONS.reduce((sum, item) => sum + item.value, 0)} salidas`}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <DonutChart
                    id="pbi-exit-reasons"
                    data={EXIT_REASONS}
                    ariaLabel="Distribución de motivos de salida del personal"
                    unit="salidas"
                  />
                </Card>

                <Card
                  id="pbi-warnings"
                  title="Amonestaciones por Trabajador"
                  meta={`${filteredWarnings.reduce((sum, item) => sum + item.value, 0)} amonestaciones`}
                  className="pbi-card--table pbi-card--span-4"
                >
                  <DataTable
                    caption="Cantidad de amonestaciones registradas por trabajador"
                    columns={[
                      { key: "alias", label: "Trabajador" },
                      {
                        key: "value",
                        label: "Amonestaciones",
                        render: (value) => <span className={`pbi-badge${value > 1 ? " pbi-badge--alert" : ""}`}>{value}</span>
                      }
                    ]}
                    rows={filteredWarnings}
                  />
                </Card>

                <Card
                  id="pbi-attendance"
                  title="Asistencia por Trabajador"
                  meta="Puntual · tardanza · ausencia"
                  className="pbi-card--chart pbi-card--span-6"
                >
                  <AttendanceBars data={filteredAttendance} onSelect={selectWorkerFromChart} selectedNames={selectedWorkerNames} />
                </Card>

                <Card
                  id="pbi-payroll"
                  title={`Costo de Planilla Mensual (${payrollYear || "—"})`}
                  meta={`${currencyFormatter.format(payrollTotal)} · ${payrollPeriodLabel}`}
                  className="pbi-card--chart pbi-card--span-6"
                >
                  <LineChart
                    id="pbi-payroll"
                    data={filteredPayroll}
                    ariaLabel={`Costo mensual de planilla ${payrollYear || ""}, ${payrollPeriodLabel}, total ${currencyFormatter.format(payrollTotal)}`}
                    valueFormatter={(value) => value >= 1000 ? `S/ ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `S/ ${value}`}
                    tone="blue"
                  />
                </Card>
              </div>
            </section>

            <section className="pbi-report-section" aria-labelledby="pbi-quality-section-title">
              <div className="pbi-section-heading">
                <div>
                  <span className="pbi-section-kicker">Calidad</span>
                  <h2 id="pbi-quality-section-title">Calidad y desarrollo</h2>
                </div>
                <p>Incidentes, causas de error, capacitación y trazabilidad de tareas.</p>
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-error-rate"
                  title="% de Error por Tipo de Tarea"
                  meta="Margen de error"
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <HorizontalBars
                    data={filteredErrorRates}
                    ariaLabel="Porcentaje de error por tipo de tarea"
                    color="#e1c233"
                    valueFormatter={(value) => `${value.toFixed(2)}%`}
                    onSelect={selectTaskFromChart}
                    selectedNames={selectedTaskIds.map((id) => TASK_CATALOG.find((taskItem) => taskItem.id === id)?.shortName).filter(Boolean)}
                  />
                </Card>

                <Card
                  id="pbi-errors-task"
                  title="Distribución de Errores por Tarea"
                  meta={`${visibleIncidentRecords.length} errores`}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <HorizontalBars
                    data={filteredErrorsByTask}
                    ariaLabel="Errores registrados por tarea"
                    color="#e7bd22"
                    onSelect={selectTaskFromChart}
                    selectedNames={selectedTaskIds.map((id) => TASK_CATALOG.find((taskItem) => taskItem.id === id)?.shortName).filter(Boolean)}
                  />
                </Card>

                <Card
                  id="pbi-error-types"
                  title="Errores por Tipo"
                  meta="Turno regular y extra"
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <ComparisonBars
                    data={filteredErrorsByType}
                    ariaLabel="Errores por tipo y turno"
                    primaryLabel="Turno regular"
                    secondaryLabel="Turno extra"
                    primaryColor="#6b007b"
                    secondaryColor="#e044a7"
                  />
                </Card>

                <Card
                  id="pbi-training-progress"
                  title="Avance de Capacitaciones"
                  meta={trainingTotal ? `${Math.round((trainingCompleted / trainingTotal) * 100)}% completado · ${trainingTotal} asignaciones` : "Sin asignaciones"}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <TrainingProgressBars
                    data={filteredTrainingProgress}
                    onSelect={selectWorkerFromChart}
                    selectedNames={selectedWorkerNames}
                  />
                </Card>

                  <Card
                    id="pbi-training-history"
                    title="Historial de Capacitaciones"
                    meta={`${filteredTrainingHistory.length} asignaciones`}
                    className="pbi-card--table pbi-card--span-8"
                  >
                  <DataTable
                      caption="Historial de cursos y capacitaciones"
                      columns={[
                        { key: "worker", label: "Trabajador" },
                        { key: "course", label: "Curso" },
                      { key: "competence", label: "Competencia" },
                      { key: "hours", label: "Horas", render: (value) => value ?? "—" },
                      {
                        key: "status",
                        label: "Estado",
                        render: (value) => <span className={`pbi-badge${value === "Pendiente" ? " pbi-badge--alert" : ""}`}>{value}</span>
                      }
                    ]}
                      rows={filteredTrainingHistory}
                  />
                </Card>

                <Card
                  id="pbi-errors-worker"
                  title="Errores por Trabajador"
                  meta="Incidentes"
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <HorizontalBars
                    data={filteredErrorsByWorker}
                    ariaLabel="Errores registrados por trabajador"
                    color="#ef8f3d"
                    onSelect={selectWorkerFromChart}
                    selectedNames={selectedWorkerNames}
                  />
                </Card>

                <Card
                  id="pbi-task-detail"
                  title="Detalle de Registro de Tareas"
                  meta="Resumen por actividad"
                  className="pbi-card--table pbi-card--span-8"
                >
                  <DataTable
                    caption="Detalle consolidado del volumen registrado por tarea"
                    columns={[
                      { key: "name", label: "Tarea" },
                      { key: "value", label: "Registros", render: (value) => numberFormatter.format(value) },
                      {
                        key: "share",
                        label: "% del total",
                        render: (value) => `${value.toFixed(1)}%`
                      }
                    ]}
                    rows={allFilteredTaskRows.map((item) => ({
                      ...item,
                      share: taskVolumeTotal ? (item.value / taskVolumeTotal) * 100 : 0
                    }))}
                  />
                </Card>
              </div>
            </section>
          </div>
        </main>

        <footer className="pbi-footer">
          <span>Dashboard Calzado</span>
          <span>
            Fuente en vivo: base de datos Supabase · actualización automática cada 30 s
            {dashboardData?.dataQuality?.activitiesWithoutStoredScore
              ? ` · ${dashboardData.dataQuality.activitiesWithoutStoredScore} puntajes históricos estimados por no estar guardados`
              : ""}
          </span>
        </footer>
      </div>
    </section>
  );
}
