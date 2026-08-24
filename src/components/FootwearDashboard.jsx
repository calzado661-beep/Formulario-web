import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadFootwearDashboard, updateGroupLeaderAverageReference } from "../lib/repository";
import { attendanceGroup } from "../lib/operations";
import {
  averageEmployeeTenureMonths,
  buildComparableIncidentMetrics,
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

const CURRENT_LIMA_PARTS = dashboardDateParts();
const CURRENT_LIMA_YEAR = CURRENT_LIMA_PARTS.year;
const CURRENT_LIMA_MONTH = CURRENT_LIMA_PARTS.month;
const PREVIOUS_LIMA_MONTH = CURRENT_LIMA_MONTH === 1 ? 12 : CURRENT_LIMA_MONTH - 1;
const PREVIOUS_LIMA_MONTH_YEAR = CURRENT_LIMA_MONTH === 1 ? CURRENT_LIMA_YEAR - 1 : CURRENT_LIMA_YEAR;

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

function DateHierarchySlicer({ selected, onChange, years, dateDaysByYear, label = "Fecha", selectedYears, onYearsChange }) {
  const detailsRef = useRef(null);
  const effectiveYears = selectedYears?.length ? selectedYears : years.length ? years : [2025, 2026];
  const yearKey = effectiveYears.join("|");
  const selectedMonths = Object.keys(selected).map(Number);
  const yearSummary = selectedYears?.length ? selectedYears.join(", ") : "Todos los años";
  const summary = !selectedMonths.length
    ? yearSummary
    : selectedMonths.length === 1
      ? `${yearSummary} · ${MONTHLY_TASKS[selectedMonths[0] - 1].name}`
      : `${yearSummary} · ${selectedMonths.length} meses`;

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
      <summary className="pbi-slicer-trigger" aria-label={`${label}: ${summary}`}>
        <span className="pbi-slicer-copy">
          <span className="pbi-slicer-label">{label}</span>
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
          <button className="pbi-slicer-action" type="button" onClick={() => { onChange({}); onYearsChange?.([]); }}>Mostrar todas las fechas</button>
          <span className="pbi-slicer-option-count">{onYearsChange ? "Año → Mes → Día" : "Mes → Día"}</span>
        </div>
        <div className="pbi-slicer-options pbi-date-tree">
          {onYearsChange ? (
            <div className="pbi-date-years" role="group" aria-label="Seleccionar año">
              <span className="pbi-date-years-label">Año</span>
              {years.map((year) => (
                <button
                  className={`pbi-chip${selectedYears.includes(year) ? " pbi-chip--active" : ""}`}
                  type="button"
                  key={year}
                  onClick={() => onYearsChange((current) => toggleArrayValue(current, year))}
                  aria-pressed={selectedYears.includes(year)}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}
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

function PersonnelKpi({ label, value, detail }) {
  return (
    <article className="pbi-kpi pbi-kpi--personnel" aria-label={`${label}: ${value}${detail ? `. ${detail}` : ""}`}>
      <span className="pbi-kpi-label">
        <span>{label}</span>
        {detail ? <small className="pbi-personnel-kpi-detail">{detail}</small> : null}
      </span>
      <strong className="pbi-kpi-value">{numberFormatter.format(value)}</strong>
    </article>
  );
}

function ActivityKpi({ label, daily, hourly, unit = "unidades" }) {
  return (
    <article className="pbi-kpi pbi-kpi--paired" aria-label={`${label}: ${daily} ${unit} por día, ${hourly} ${unit} por hora`}>
      <span className="pbi-kpi-label">{label}</span>
      <div className="pbi-kpi-pair">
        <span className="pbi-kpi-pair-item">
          <span className="pbi-kpi-value-line">
            <strong className="pbi-kpi-value">{numberFormatter.format(daily)}</strong>
            <small className="pbi-kpi-unit">{unit}</small>
          </span>
          <small>promedio por día</small>
        </span>
        <span className="pbi-kpi-pair-item">
          <span className="pbi-kpi-value-line">
            <strong className="pbi-kpi-value">{numberFormatter.format(hourly)}</strong>
            <small className="pbi-kpi-unit">{unit}</small>
          </span>
          <small>promedio por hora</small>
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

function VerticalBarChart({ id, data, ariaLabel, tone = "gold", unit = "", onSelect, selectedNames = [], compact = false }) {
  const [tooltip, setTooltip] = useState(null);
  if (!data.length) return <p className="pbi-chart-empty">No hay datos para el filtro seleccionado.</p>;

  // La proporción anterior (2:1) reducía demasiado la gráfica dentro de
  // tarjetas altas. Este lienzo aprovecha la altura sin deformar texto o barras.
  const width = Math.max(520, data.length * 76);
  const height = compact ? 280 : 360;
  const left = 54;
  const right = 16;
  const top = 30;
  const bottom = 78;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const hasSecondaryValues = data.some((item) => Number.isFinite(Number(item.secondaryValue)));
  const maximum = Math.max(...data.flatMap((item) => [Number(item.value || 0), Number(item.secondaryValue || 0)]), 1) * 1.12;
  const step = innerWidth / data.length;
  const barWidth = Math.min(58, step * 0.5);
  const fill = tone === "blue" ? "#0a4f87" : "#e7c42d";
  const animationKey = data.map((item) => `${item.name}:${item.value}:${item.secondaryValue || 0}`).join("|");

  return (
    <div className="pbi-chart pbi-chart--scrollable" data-animation-key={animationKey}>
      {hasSecondaryValues ? (
        <div className="pbi-chart-series-legend" aria-label="Leyenda del gráfico">
          <span><i className="is-favor" />Puntos a favor</span>
          <span><i className="is-against" />Puntos en contra</span>
        </div>
      ) : null}
      <svg key={animationKey} className="pbi-chart-svg" style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} ${height}`} role={onSelect ? "group" : "img"} aria-labelledby={`${id}-chart-title`}>
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
          const secondaryValue = Number(item.secondaryValue || 0);
          const againstPoints = Number(item.againstPoints ?? secondaryValue ?? 0);
          const secondaryHeight = (secondaryValue / maximum) * innerHeight;
          const secondaryY = top + innerHeight - secondaryHeight;
          const seriesGap = hasSecondaryValues ? 5 : 0;
          const seriesWidth = hasSecondaryValues ? (barWidth - seriesGap) / 2 : barWidth;
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
              aria-label={`${item.name}: ${item.value} puntos normales${againstPoints ? `, ${againstPoints} puntos en contra. ${item.againstReason || ""}` : ""}`}
              onClick={() => onSelect?.(item)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
              onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${numberFormatter.format(item.value)} puntos normales${againstPoints ? ` · -${numberFormatter.format(againstPoints)} puntos en contra` : " · 0 puntos en contra"}${unit ? ` ${unit}` : ""}`, item.againstReason || "Sin descuentos en el periodo")}
              onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${numberFormatter.format(item.value)} puntos normales${againstPoints ? ` · -${numberFormatter.format(againstPoints)} puntos en contra` : " · 0 puntos en contra"}${unit ? ` ${unit}` : ""}`, item.againstReason || "Sin descuentos en el periodo")}
              onBlur={() => setTooltip(null)}
              onMouseLeave={() => setTooltip(null)}
            >
              <title>{`${item.name}: ${numberFormatter.format(item.value)}`}</title>
              <rect className={`pbi-chart-bar pbi-chart-bar--${tone}`} style={{ "--pbi-index": index }} x={x} y={y} width={seriesWidth} height={barHeight} rx="3" fill={fill} />
              {hasSecondaryValues ? <rect className="pbi-chart-bar pbi-chart-bar--against" style={{ "--pbi-index": index }} x={x + seriesWidth + seriesGap} y={secondaryY} width={seriesWidth} height={secondaryHeight} rx="3" fill="#c94b4b" /> : null}
              <text className="pbi-chart-value" x={x + seriesWidth / 2} y={Math.max(18, y - 8)} textAnchor="middle">
                {numberFormatter.format(item.value)}
              </text>
              {hasSecondaryValues ? <text className="pbi-chart-value pbi-chart-value--against" x={x + seriesWidth + seriesGap + seriesWidth / 2} y={Math.max(18, secondaryY - 8)} textAnchor="middle">{numberFormatter.format(secondaryValue)}</text> : null}
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
        const barDetail = item.tooltipDetail || (onSelect ? "Haz clic para filtrar" : "");
        const barDetailFocus = item.tooltipDetail || (onSelect ? "Presiona Enter para filtrar" : "");
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
          onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, valueFormatter(item.value), barDetail)}
          onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, valueFormatter(item.value), barDetailFocus)}
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

function ComparisonBars({ data, ariaLabel, primaryLabel, secondaryLabel, primaryColor, secondaryColor, onSelect, onSeriesSelect, selectedNames = [] }) {
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
          const tooltipLabel = item.year ? `${item.name} ${item.year}` : item.name;
          const hasSplitDetail = Boolean(item.primaryDetail || item.secondaryDetail);
          const primaryDetail = item.primaryDetail || (onSelect ? "Haz clic para filtrar" : "");
          const secondaryDetail = item.secondaryDetail || (onSelect ? "Haz clic para filtrar" : "");
          const rowDetail = hasSplitDetail
            ? [item.primaryDetail, item.secondaryDetail].filter(Boolean).join(" · ")
            : (onSelect ? "Haz clic para filtrar" : "");
          const rowDetailFocus = hasSplitDetail
            ? [item.primaryDetail, item.secondaryDetail].filter(Boolean).join(" · ")
            : (onSelect ? "Presiona Enter para filtrar" : "");
          const showPrimaryTooltip = (event) => {
            event.stopPropagation();
            tooltipAt(event, setTooltip, tooltipLabel, `${primaryLabel}: ${item.primary}`, primaryDetail);
          };
          const showSecondaryTooltip = (event) => {
            event.stopPropagation();
            tooltipAt(event, setTooltip, tooltipLabel, `${secondaryLabel}: ${item.secondary}`, secondaryDetail);
          };
          const selectSeries = (event, series) => {
            if (!onSeriesSelect) return;
            event.stopPropagation();
            onSeriesSelect(item, series);
          };
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
            onPointerMove={(event) => tooltipAt(event, setTooltip, tooltipLabel, `${primaryLabel}: ${item.primary} · ${secondaryLabel}: ${item.secondary}`, rowDetail)}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, tooltipLabel, `${primaryLabel}: ${item.primary} · ${secondaryLabel}: ${item.secondary}`, rowDetailFocus)}
            onBlur={() => setTooltip(null)}
            onMouseLeave={() => setTooltip(null)}
          >
            <strong>{item.name}</strong>
            <span className="pbi-comparison-track" role={onSeriesSelect ? "button" : undefined} tabIndex={onSeriesSelect ? 0 : undefined} aria-label={onSeriesSelect ? `Ver ${primaryLabel.toLowerCase()} de ${tooltipLabel}` : undefined} onClick={(event) => selectSeries(event, "primary")} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSeries(event, "primary"); }
            }} onPointerMove={showPrimaryTooltip}>
              <i style={{ width: visibleSeries.primary ? `${(item.primary / maximum) * 100}%` : "0%", backgroundColor: primaryColor, "--pbi-index": index }} />
            </span>
            <span className={onSeriesSelect ? "pbi-comparison-value-action" : undefined} onClick={(event) => selectSeries(event, "primary")} onPointerMove={showPrimaryTooltip}>{visibleSeries.primary ? item.primary : "—"}</span>
            <span className="pbi-comparison-track" role={onSeriesSelect ? "button" : undefined} tabIndex={onSeriesSelect ? 0 : undefined} aria-label={onSeriesSelect ? `Ver ${secondaryLabel.toLowerCase()} de ${tooltipLabel}` : undefined} onClick={(event) => selectSeries(event, "secondary")} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSeries(event, "secondary"); }
            }} onPointerMove={showSecondaryTooltip}>
              <i style={{ width: visibleSeries.secondary ? `${(item.secondary / maximum) * 100}%` : "0%", backgroundColor: secondaryColor, "--pbi-index": index }} />
            </span>
            <span className={onSeriesSelect ? "pbi-comparison-value-action" : undefined} onClick={(event) => selectSeries(event, "secondary")} onPointerMove={showSecondaryTooltip}>{visibleSeries.secondary ? item.secondary : "—"}</span>
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
    ["punctual", "Asistencia", "#05b13e"],
    ["late", "Tardanza", "#f4b33a"],
    ["absent", "Ausente", "#f4303f"]
  ];
  return (
    <div className="pbi-attendance" role="group" aria-label="Asistencia por trabajador: asistencia, tardanza y ausencia" data-animation-key={animationKey}>
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
          const attendanceDates = [
            item.late ? `Última tardanza: ${formatCalendarDate(item.lastLate)}` : null,
            item.absent ? `Última falta: ${formatCalendarDate(item.lastAbsent)}` : null
          ].filter(Boolean).join(" · ");
          const attendanceDetail = attendanceDates || (onSelect ? "Haz clic para filtrar" : "");
          const attendanceDetailFocus = attendanceDates || (onSelect ? "Presiona Enter para filtrar" : "");
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
            onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `Asistencia ${item.punctual} · Tardanza ${item.late} · Ausente ${item.absent}`, attendanceDetail)}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `Asistencia ${item.punctual} · Tardanza ${item.late} · Ausente ${item.absent}`, attendanceDetailFocus)}
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

function TreemapChart({ data, ariaLabel, unit = "pares", onSelect, selectedNames = [] }) {
  const [tooltip, setTooltip] = useState(null);
  const tiles = treemapLayout(data);
  const total = tiles.reduce((sum, item) => sum + item.value, 0);
  const animationKey = tiles.map((item) => `${item.name}:${item.value}`).join("|");
  if (!tiles.length) return <p className="pbi-chart-empty">No hay pares etiquetados para el filtro seleccionado.</p>;

  return (
    <div className="pbi-treemap" role="group" aria-label={ariaLabel} data-animation-key={animationKey} data-testid="brand-treemap">
      {tiles.map((item, index) => {
        const itemUnit = item.value === 1
          ? ({ incidencias: "incidencia", registros: "registro", pares: "par" }[unit] || unit)
          : unit;
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
            onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${numberFormatter.format(item.value)} ${itemUnit}`, `${((item.value / total) * 100).toFixed(1)}% del total`)}
            onPointerLeave={() => setTooltip(null)}
            onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${numberFormatter.format(item.value)} ${itemUnit}`, "Presiona Enter para filtrar")}
            onBlur={() => setTooltip(null)}
            aria-pressed={selected}
            aria-label={`${item.name}: ${numberFormatter.format(item.value)} ${itemUnit}`}
          >
            <span>{item.name}</span>
            <strong>{numberFormatter.format(item.value)} {itemUnit}</strong>
          </button>
        );
      })}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

function DonutChart({ id, data, ariaLabel, unit = "pares", horizontalLegend = false, onSelect, selectedNames = [] }) {
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
    <div className={`pbi-donut-layout${horizontalLegend ? " pbi-donut-layout--horizontal-legend" : ""}`} data-animation-key={animationKey}>
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
            const donutDetail = item.lastDate
              ? `${percent.toFixed(1)}% del total · Más reciente: ${formatCalendarDate(item.lastDate)}`
              : `${percent.toFixed(1)}% del total`;
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
                onPointerMove={(event) => tooltipAt(event, setTooltip, item.name, `${item.value} ${unit}`, donutDetail)}
                onFocus={(event) => tooltipAtFocus(event, setTooltip, item.name, `${item.value} ${unit}`, donutDetail)}
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

function HourlyRankingRecordsModal({ workerName, taskName, periodLabel, unit, rows, targetHourly, onTargetHourlyChange, onSaveTarget, targetSaving, targetStatus, showHangtag, hangtagValue, onHangtagChange, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const detailRows = rows.map((row) => ({
    id: row.id,
    date: formatCalendarDate(row.date),
    quantity: numberFormatter.format(row.quantity || 0),
    time: `${numberFormatter.format(row.minutes || 0)} min`,
    averageValue: row.minutes > 0 ? Math.round(Number(row.quantity || 0) / (Number(row.minutes) / 60)) : null,
    hangtag: row.labelingType || "—",
    lote: row.lote || "—",
    observation: row.observation || "—"
  }));
  const numericTarget = String(targetHourly).trim() === "" ? null : Number(targetHourly);
  const columns = [
    { key: "date", label: "Fecha" },
    { key: "quantity", label: "Cantidad" },
    { key: "time", label: "Tiempo" },
    {
      key: "averageValue",
      label: "Promedio/h",
      render: (value) => value === null ? "—" : (
        <span className={Number.isFinite(numericTarget) ? `pbi-hourly-result pbi-hourly-result--${value >= numericTarget ? "above" : "below"}` : "pbi-hourly-result"}>
          {numberFormatter.format(value)} {unit}/h
        </span>
      )
    },
    ...(showHangtag ? [{ key: "hangtag", label: "Hangtag" }] : []),
    { key: "lote", label: "Lote" },
    { key: "observation", label: "Observación" }
  ];

  return createPortal(
    <div className="pbi-visual-modal pbi-ranking-records-modal" role="dialog" aria-modal="true" aria-labelledby="pbi-ranking-records-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pbi-ranking-records-dialog">
        <header className="pbi-ranking-records-header">
          <div>
            <span className="pbi-card-eyebrow">Registros de jefe de equipo</span>
            <h2 id="pbi-ranking-records-title">{workerName}</h2>
            <p>{taskName} · {periodLabel} · {numberFormatter.format(rows.length)} registros</p>
          </div>
          <button type="button" className="pbi-ranking-records-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
        </header>
        <div className="pbi-hourly-modal-fields">
          {showHangtag ? (
            <label>
              <span>Tipo de etiquetado</span>
              <select value={hangtagValue} onChange={(event) => onHangtagChange(event.target.value)}>
                <option value="CON_HANGTAG">Con hangtag</option>
                <option value="SIN_HANGTAG">Sin hangtag</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>Promedio de referencia</span>
            <div>
            <input
              id="pbi-hourly-target"
              type="number"
              min="0"
              step="0.01"
              value={targetHourly}
              onChange={(event) => onTargetHourlyChange(event.target.value)}
              placeholder="Ej. 120"
            />
            <span>{unit}/h</span>
            <button type="button" onClick={onSaveTarget} disabled={targetSaving}>{targetSaving ? "…" : "Guardar"}</button>
            </div>
          </label>
          <small>{targetStatus || "Verde: igual o superior · Rojo: inferior"}</small>
        </div>
        <DataTable
          caption={`Registros de ${workerName} en ${taskName}`}
          columns={columns}
          rows={detailRows}
        />
      </section>
    </div>,
    document.body
  );
}

function MovementRecordsModal({ month, movementLabel, rows, workerById, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const detailRows = rows.map((row) => ({
    id: row.id,
    worker: workerById.get(Number(row.workerId))?.name || `Usuario ${row.workerId}`,
    date: formatCalendarDate(row.date),
    rawDate: row.date
  })).sort((a, b) => String(b.rawDate).localeCompare(String(a.rawDate)));
  return createPortal(
    <div className="pbi-visual-modal" role="dialog" aria-modal="true" aria-labelledby="pbi-movement-records-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pbi-ranking-records-dialog pbi-movement-records-dialog">
        <header className="pbi-ranking-records-header">
          <div>
            <span className="pbi-card-eyebrow">Rotación de personal</span>
            <h2 id="pbi-movement-records-title">{movementLabel} · {month}</h2>
            <p>{numberFormatter.format(rows.length)} trabajador(es)</p>
          </div>
          <button type="button" className="pbi-ranking-records-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
        </header>
        <DataTable caption={`${movementLabel} de personal en ${month}`} columns={[
          { key: "worker", label: "Trabajador" },
          { key: "date", label: "Fecha" }
        ]} rows={detailRows} />
      </section>
    </div>,
    document.body
  );
}

function ErrorRecordsModal({ shiftLabel, errorType, rows, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const detailRows = rows.map((row) => ({
    id: row.id,
    offender: row.offenderName || "Sin identificar",
    offenderType: row.offenderType || "Usuario/Área",
    date: formatCalendarDate(row.date),
    rawDate: row.date
  })).sort((a, b) => String(b.rawDate).localeCompare(String(a.rawDate)));
  return createPortal(
    <div className="pbi-visual-modal" role="dialog" aria-modal="true" aria-labelledby="pbi-error-records-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pbi-ranking-records-dialog pbi-movement-records-dialog">
        <header className="pbi-ranking-records-header">
          <div>
            <span className="pbi-card-eyebrow">Detalle de errores</span>
            <h2 id="pbi-error-records-title">{errorType} · {shiftLabel}</h2>
            <p>{numberFormatter.format(rows.length)} error(es)</p>
          </div>
          <button type="button" className="pbi-ranking-records-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
        </header>
        <DataTable caption={`${errorType} en ${shiftLabel}`} columns={[
          { key: "offender", label: "Usuario o área" },
          { key: "offenderType", label: "Tipo" },
          { key: "date", label: "Fecha" }
        ]} rows={detailRows} />
      </section>
    </div>,
    document.body
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

// Formatea una fecha "AAAA-MM-DD" (sin hora) a "DD/MM/AAAA" para los
// tooltips con detalle; se evita Date/timezone porque el valor ya es un dia
// de calendario puro.
function formatCalendarDate(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-");
  if (!year || !month || !day) return dateStr || "";
  return `${day}/${month}/${year}`;
}

function selectedLabel(options, values, fallback) {
  if (!values.length) return fallback;
  const labels = values.map((value) => options.find((option) => option.value === value)?.label).filter(Boolean);
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} seleccionados`;
}

function productionUnit(task) {
  const configured = String(task?.unit || "").trim().toLowerCase();
  const source = `${configured} ${task?.name || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/bulto/.test(source)) return "bultos";
  if (/par|calzado|zapat/.test(source)) return "pares";
  return configured || "unidades";
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
  const [selectedWorkerStatus, setSelectedWorkerStatus] = useState([]);
  const [selectedYears, setSelectedYears] = useState([CURRENT_LIMA_YEAR]);
  const [productionMonths, setProductionMonths] = useState([CURRENT_LIMA_MONTH]);
  const [selectedProductionRoles, setSelectedProductionRoles] = useState([]);
  const [taskVolumePeriod, setTaskVolumePeriod] = useState("current");
  const [hourlyRankingTaskId, setHourlyRankingTaskId] = useState("");
  const [hourlyRankingWorkerId, setHourlyRankingWorkerId] = useState(null);
  const [hourlyRankingHangtag, setHourlyRankingHangtag] = useState("CON_HANGTAG");
  const [hourlyReferenceDraft, setHourlyReferenceDraft] = useState("");
  const [hourlyReferenceSaving, setHourlyReferenceSaving] = useState(false);
  const [hourlyReferenceStatus, setHourlyReferenceStatus] = useState("");
  const [quantityRankingTaskId, setQuantityRankingTaskId] = useState("");
  const [detailTaskIds, setDetailTaskIds] = useState([]);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState([]);
  const [productionWorkerScope, setProductionWorkerScope] = useState("active");
  const [selectedIncidentTaskIds, setSelectedIncidentTaskIds] = useState([]);
  const [peopleWorkerIds, setPeopleWorkerIds] = useState([]);
  const [peopleYears, setPeopleYears] = useState([]);
  const [qualityWorkerIds, setQualityWorkerIds] = useState([]);
  const [qualityPeriod, setQualityPeriod] = useState("current");
  const [incidentUserIds, setIncidentUserIds] = useState([]);
  const [incidentAreaIds, setIncidentAreaIds] = useState([]);
  const [trainingYears, setTrainingYears] = useState([]);
  const [trainingMonths, setTrainingMonths] = useState([]);
  const [trainingDays, setTrainingDays] = useState([]);
  const [trainingCourseIds, setTrainingCourseIds] = useState([]);
  const [trainingStatuses, setTrainingStatuses] = useState([]);
  const [selectedMovementMonths, setSelectedMovementMonths] = useState([]);
  const [selectedMovementDetail, setSelectedMovementDetail] = useState(null);
  const [attendanceYear, setAttendanceYear] = useState(String(CURRENT_LIMA_YEAR));
  const [attendancePeriod, setAttendancePeriod] = useState(String(CURRENT_LIMA_MONTH));
  const [attendanceDay, setAttendanceDay] = useState("all");
  const [selectedErrorDetail, setSelectedErrorDetail] = useState(null);

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
  const OPERATIONAL_TASKS = useMemo(() => TASK_CATALOG.filter((task) => task.operational), [TASK_CATALOG]);
  const INCIDENT_TASKS = useMemo(() => (dashboardData?.errorTasks || []).filter((task) => task.active).map((task) => ({ ...task, shortName: task.name })), [dashboardData]);
  const yearsFromRows = (rows) => [...new Set((rows || [])
    .map((row) => Number(String(row.date || "").slice(0, 4)))
    .filter(Number.isFinite))].sort((a, b) => a - b);
  const peopleAvailableYears = useMemo(() => yearsFromRows([
    ...(dashboardData?.attendances || []),
    ...(dashboardData?.warnings || []),
    ...(dashboardData?.movements || [])
  ]), [dashboardData]);
  const trainingAvailableYears = useMemo(() => yearsFromRows(dashboardData?.trainingAssignments), [dashboardData]);
  const workerById = useMemo(() => new Map(WORKERS.map((worker) => [worker.id, worker])), [WORKERS]);
  const taskById = useMemo(() => new Map(TASK_CATALOG.map((task) => [task.id, task])), [TASK_CATALOG]);
  const errorTaskById = useMemo(() => new Map(INCIDENT_TASKS.map((task) => [task.id, task])), [INCIDENT_TASKS]);
  const brandById = useMemo(() => new Map((dashboardData?.brands || []).map((brand) => [brand.id, brand.name])), [dashboardData]);

  const trainingCalendarRows = useMemo(() => (dashboardData?.trainingAssignments || []).map((row) => {
      const [year, month, day] = String(row.date || "").split("-").map(Number);
      return { year, month, day };
    }).filter((row) => row.year && row.month && row.day), [dashboardData]);
  const trainingMonthOptions = [...new Set(trainingCalendarRows
    .filter((row) => !trainingYears.length || trainingYears.includes(row.year))
    .map((row) => row.month))].sort((a, b) => a - b).map((month) => ({ value: month, label: MONTHLY_TASKS[month - 1].name }));
  const trainingDayOptions = [...new Set(trainingCalendarRows
    .filter((row) => (!trainingYears.length || trainingYears.includes(row.year)) && (!trainingMonths.length || trainingMonths.includes(row.month)))
    .map((row) => row.day))].sort((a, b) => a - b).map((day) => ({ value: day, label: String(day) }));

  useEffect(() => {
    const validMonths = new Set(trainingMonthOptions.map((option) => option.value));
    const validDays = new Set(trainingDayOptions.map((option) => option.value));
    setTrainingMonths((current) => {
      const next = current.filter((value) => validMonths.has(value));
      return next.length === current.length ? current : next;
    });
    setTrainingDays((current) => {
      const next = current.filter((value) => validDays.has(value));
      return next.length === current.length ? current : next;
    });
  }, [trainingYears, trainingMonthOptions.map((option) => option.value).join("|"), trainingDayOptions.map((option) => option.value).join("|")]);

  function matchesSectionDate(date, years, availableYears, parts = {}) {
    const [year, month, day] = String(date || "").split("-").map(Number);
    const allowedYears = years.length ? years : availableYears;
    if (!year || !allowedYears.includes(year)) return false;
    if (!Object.keys(parts).length) return true;
    if (!Object.prototype.hasOwnProperty.call(parts, month)) return false;
    return parts[month] === null || parts[month].includes(day);
  }

  const matchesProductionDate = (date) => {
    const [year, month] = String(date || "").split("-").map(Number);
    return (!selectedYears.length || selectedYears.includes(year))
      && (!productionMonths.length || productionMonths.includes(month));
  };
  const matchesPeopleDate = (date) => matchesSectionDate(date, peopleYears, peopleAvailableYears);
  const matchesQualityDate = (date) => {
    if (qualityPeriod === "all") return true;
    const [year, month] = String(date || "").split("-").map(Number);
    return qualityPeriod === "previous"
      ? year === PREVIOUS_LIMA_MONTH_YEAR && month === PREVIOUS_LIMA_MONTH
      : year === CURRENT_LIMA_YEAR && month === CURRENT_LIMA_MONTH;
  };

  function matchesPeopleWorker(workerId) {
    const worker = workerById.get(Number(workerId));
    return (!peopleWorkerIds.length || peopleWorkerIds.includes(Number(workerId)))
      && (!selectedRoles.length || (worker && selectedRoles.includes(worker.role)))
      && (!selectedWorkerStatus.length || (worker && selectedWorkerStatus.includes(worker.active ? "activo" : "inactivo")));
  }

  const tasksAllowedByFilters = OPERATIONAL_TASKS.filter((task) => (
    !selectedTaskTypes.length || selectedTaskTypes.includes(task.type)
  ));
  const allowedTaskIds = new Set(tasksAllowedByFilters.map((task) => task.id));
  const allowedIncidentTaskIds = new Set(INCIDENT_TASKS
    .filter((task) => !selectedIncidentTaskIds.length || selectedIncidentTaskIds.includes(task.id))
    .map((task) => task.id));
  const visibleActivities = (dashboardData?.activities || []).filter((row) => (
    matchesProductionDate(row.date)
    && (!selectedWorkerIds.length || selectedWorkerIds.includes(Number(row.workerId)))
    && (!selectedProductionRoles.length || selectedProductionRoles.includes(workerById.get(Number(row.workerId))?.role))
    && ["operante", "jefe de equipo"].includes(workerById.get(Number(row.workerId))?.role)
    && (productionWorkerScope === "all" || workerById.get(Number(row.workerId))?.active)
    && allowedTaskIds.has(row.taskId)
  ));
  // Calidad comparable usa registros operativos reales de ambas fuentes. No
  // aplica trabajador ni marca porque los incidentes generales se vinculan a
  // responsables, no necesariamente a usuarios operativos.
  const qualityActivities = (dashboardData?.activities || []).filter((row) => (
    matchesQualityDate(row.date)
    && allowedIncidentTaskIds.has(row.taskId)
  ));

  const operationalTaskIds = new Set(OPERATIONAL_TASKS.map((task) => Number(task.id)));
  const operationalWorkerIds = new Set((dashboardData?.activities || [])
    .filter((row) => operationalTaskIds.has(Number(row.taskId)))
    .map((row) => Number(row.workerId)));
  const eligibleProductionWorkers = WORKERS.filter((worker) => (
    ["operante", "jefe de equipo"].includes(worker.role)
    && (!selectedProductionRoles.length || selectedProductionRoles.includes(worker.role))
    && (productionWorkerScope === "all" || worker.active)
    && operationalWorkerIds.has(Number(worker.id))
  ));
  const workerOptions = eligibleProductionWorkers.map((worker) => ({
    value: worker.id,
    label: worker.name,
    count: (dashboardData?.activities || []).filter((row) => row.workerId === worker.id && matchesProductionDate(row.date)).reduce((sum, row) => sum + row.points, 0)
  }));
  const operationalTaskTypeOptions = [...new Set(OPERATIONAL_TASKS.map((task) => task.type))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((type) => ({ value: type, label: type }));
  const productionRoleOptions = [
    { value: "operante", label: "Operante" },
    { value: "jefe de equipo", label: "Jefe de equipo" }
  ];
  const operationalTaskOptions = OPERATIONAL_TASKS
    .filter((task) => !selectedTaskTypes.length || selectedTaskTypes.includes(task.type))
    .map((task) => ({ value: task.id, label: task.shortName }));
  const peopleWorkerOptions = WORKERS.filter((worker) => (
    (!selectedRoles.length || selectedRoles.includes(worker.role))
    && (!selectedWorkerStatus.length || selectedWorkerStatus.includes(worker.active ? "activo" : "inactivo"))
  )).map((worker) => ({
    value: worker.id,
    label: worker.name,
    count: (dashboardData?.attendances || []).filter((row) => row.workerId === worker.id && matchesPeopleDate(row.date)).length
  }));
  const qualityWorkerOptions = WORKERS.map((worker) => ({ value: worker.id, label: worker.name }));
  const incidentUserOptions = WORKERS.filter((worker) => (
    worker.active
    && (dashboardData?.incidents || []).some((incident) => Number(incident.workerId) === Number(worker.id))
  )).map((worker) => ({ value: worker.id, label: worker.name }));
  const incidentAreaOptions = [...(dashboardData?.incidents || []).reduce((areas, incident) => {
    if (incident.areaId && incident.offenderType === "Área") {
      areas.set(Number(incident.areaId), incident.offenderName || `Área ${incident.areaId}`);
    }
    return areas;
  }, new Map()).entries()].map(([value, label]) => ({ value, label }));
  const trainingCourseOptions = (dashboardData?.trainings || []).map((course) => ({ value: course.id, label: course.course }));
  const trainingStatusOptions = [
    { value: "completado", label: "Completado" },
    { value: "en_curso", label: "En curso" },
    { value: "pendiente", label: "Pendiente" }
  ];
  const ROLE_OPTIONS = [...WORKERS.reduce((roles, worker) => {
    if (worker.active) roles.set(worker.role, (roles.get(worker.role) || 0) + 1);
    return roles;
  }, new Map()).entries()].map(([value, active]) => ({
    value, active, label: value.replace(/\b\w/g, (letter) => letter.toUpperCase())
  }));
  const roleOptions = ROLE_OPTIONS.map((role) => ({ value: role.value, label: role.label, count: role.active }));
  const statusOptions = [
    { value: "activo", label: "Activo", count: WORKERS.filter((worker) => worker.active).length },
    { value: "inactivo", label: "Inactivo", count: WORKERS.filter((worker) => !worker.active).length }
  ];
  const productionWorkers = eligibleProductionWorkers.filter((worker) => !selectedWorkerIds.length || selectedWorkerIds.includes(worker.id));
  const peopleWorkers = WORKERS.filter((worker) => matchesPeopleWorker(worker.id));
  const workerProduction = workerProductionRows(productionWorkers, visibleActivities, selectedWorkerIds);
  const penaltyByKey = new Map((dashboardData?.penalties || []).map((item) => [item.key, Number(item.points || 0)]));
  const filteredTopWorkers = workerProduction.map((item) => {
    const attendanceRows = (dashboardData?.attendances || []).filter((row) => Number(row.workerId) === Number(item.id) && matchesProductionDate(row.date));
    const warningRows = (dashboardData?.warnings || []).filter((row) => Number(row.workerId) === Number(item.id) && matchesProductionDate(row.date));
    const faltas = attendanceRows.filter((row) => String(row.state).toUpperCase() === "FALTA").length;
    const suspensiones = attendanceRows.filter((row) => String(row.state).toUpperCase() === "SUSPENSION").length;
    const tardanzas = attendanceRows.filter((row) => String(row.state).toUpperCase() === "TARDANZA").length;
    const cartas = warningRows.filter((row) => row.documentType === "CARTA AMONESTACION").length;
    const memorandums = warningRows.filter((row) => row.documentType === "MEMORANDUM").length;
    const againstPoints = (faltas + suspensiones) * (penaltyByKey.get("inasistencia") || 0)
      + tardanzas * (penaltyByKey.get("tardanza") || 0)
      + cartas * (penaltyByKey.get("carta_amonestacion") || 0)
      + memorandums * (penaltyByKey.get("memorandum") || 0);
    const reasons = [
      faltas ? `${faltas} falta${faltas === 1 ? "" : "s"}` : null,
      suspensiones ? `${suspensiones} suspensión${suspensiones === 1 ? "" : "es"}` : null,
      tardanzas ? `${tardanzas} tardanza${tardanzas === 1 ? "" : "s"}` : null,
      cartas ? `${cartas} carta${cartas === 1 ? "" : "s"} de amonestación` : null,
      memorandums ? `${memorandums} memorándum${memorandums === 1 ? "" : "s"}` : null
    ].filter(Boolean);
    return { ...item, againstPoints, againstReason: reasons.length ? `Motivo: ${reasons.join(" · ")}` : "Sin descuentos en el periodo" };
  }).sort((a, b) => b.value - a.value).slice(0, 5);
  const staticMonthlyTasks = MONTHLY_TASKS.map((month, monthIndex) => ({
    ...month,
    monthNumber: monthIndex + 1,
    year: CURRENT_LIMA_YEAR,
    value: (dashboardData?.activities || []).filter((row) => (
      operationalTaskIds.has(Number(row.taskId))
      && Number(String(row.date || "").slice(0, 4)) === CURRENT_LIMA_YEAR
      && Number(String(row.date || "").slice(5, 7)) === monthIndex + 1
    )).length
  }));
  const taskVolumeActivities = (dashboardData?.activities || []).filter((row) => {
    if (!operationalTaskIds.has(Number(row.taskId))) return false;
    if (selectedProductionRoles.length && !selectedProductionRoles.includes(workerById.get(Number(row.workerId))?.role)) return false;
    if (taskVolumePeriod === "all") return true;
    const [year, month] = String(row.date || "").split("-").map(Number);
    return taskVolumePeriod === "previous"
      ? year === PREVIOUS_LIMA_MONTH_YEAR && month === PREVIOUS_LIMA_MONTH
      : year === CURRENT_LIMA_YEAR && month === CURRENT_LIMA_MONTH;
  });
  const staticTaskVolume = taskVolumeRows(
    OPERATIONAL_TASKS,
    taskVolumeActivities
  );
  // En los rankings el filtro de trabajador funciona como resaltado: se
  // conservan todos los nombres para no perder la comparacion ni la posicion.
  const rankingWorkers = eligibleProductionWorkers;
  const rankingActivities = (dashboardData?.activities || []).filter((row) => matchesProductionDate(row.date));
  const leaderRankingActivities = rankingActivities.filter((row) => row.source === "jefe-equipo");
  const timedRankingTasks = OPERATIONAL_TASKS.filter((task) => task.requiresTime);
  const effectiveHourlyTaskId = timedRankingTasks.some((task) => String(task.id) === String(hourlyRankingTaskId))
    ? Number(hourlyRankingTaskId)
    : timedRankingTasks[0]?.id;
  const effectiveHourlyTask = taskById.get(Number(effectiveHourlyTaskId));
  const hourlyTaskIsLabeling = String(effectiveHourlyTask?.shortName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "etiquetado";
  const effectiveHourlyHangtagKey = hourlyTaskIsLabeling ? hourlyRankingHangtag : "";
  const storedHourlyReference = dashboardData?.averageReferenceByTask?.[effectiveHourlyTaskId]?.[effectiveHourlyHangtagKey];
  useEffect(() => {
    setHourlyReferenceDraft(storedHourlyReference === undefined ? "" : String(storedHourlyReference));
    setHourlyReferenceStatus("");
  }, [effectiveHourlyTaskId, effectiveHourlyHangtagKey, storedHourlyReference]);
  const hourlyTaskActivities = leaderRankingActivities.filter((row) => Number(row.taskId) === Number(effectiveHourlyTaskId));
  const hourlyWorkerRanking = rankingWorkers.map((worker) => {
    const rows = hourlyTaskActivities.filter((row) => Number(row.workerId) === Number(worker.id));
    return { id: worker.id, name: worker.alias || worker.name, workerName: worker.name, value: timedActivityKpi(rows).hourly, records: rows.length };
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const selectedHourlyRankingWorker = workerById.get(Number(hourlyRankingWorkerId));
  const selectedHourlyRankingRows = hourlyTaskActivities
    .filter((row) => Number(row.workerId) === Number(hourlyRankingWorkerId))
    .filter((row) => !hourlyTaskIsLabeling || row.labelingType === effectiveHourlyHangtagKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  const productionPeriodLabel = `${selectedYears.length ? selectedYears.join(", ") : "Todos los años"} · ${productionMonths.length ? productionMonths.map((month) => MONTHLY_TASKS[month - 1]?.name).filter(Boolean).join(", ") : "Todos los meses"}`;
  async function saveHourlyReference() {
    const value = Number(hourlyReferenceDraft);
    if (hourlyReferenceDraft === "" || !Number.isFinite(value) || value < 0) {
      setHourlyReferenceStatus("Ingresa un promedio válido mayor o igual a cero.");
      return;
    }
    setHourlyReferenceSaving(true);
    setHourlyReferenceStatus("");
    try {
      const saved = await updateGroupLeaderAverageReference(effectiveHourlyTaskId, value, effectiveHourlyHangtagKey);
      setDashboardData((current) => ({
        ...current,
        averageReferenceByTask: {
          ...(current?.averageReferenceByTask || {}),
          [effectiveHourlyTaskId]: {
            ...(current?.averageReferenceByTask?.[effectiveHourlyTaskId] || {}),
            [effectiveHourlyHangtagKey]: saved
          }
        }
      }));
      setHourlyReferenceStatus("Promedio actualizado.");
    } catch (error) {
      setHourlyReferenceStatus(error.message || "No se pudo actualizar el promedio.");
    } finally {
      setHourlyReferenceSaving(false);
    }
  }
  const pairRankingTasks = OPERATIONAL_TASKS.filter((task) => productionUnit(task) === "pares");
  const defaultPairTask = pairRankingTasks.find((task) => String(task.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "etiquetado") || pairRankingTasks[0];
  const effectiveQuantityTaskId = pairRankingTasks.some((task) => String(task.id) === String(quantityRankingTaskId))
    ? Number(quantityRankingTaskId)
    : defaultPairTask?.id;
  const effectiveQuantityTask = taskById.get(Number(effectiveQuantityTaskId));
  const quantityWorkerRanking = rankingWorkers.map((worker) => {
    const rows = rankingActivities.filter((row) => Number(row.workerId) === Number(worker.id) && Number(row.taskId) === Number(effectiveQuantityTaskId));
    return { name: worker.alias || worker.name, workerName: worker.name, value: rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0), records: rows.length };
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const staticMonthlyTotal = staticMonthlyTasks.reduce((sum, month) => sum + month.value, 0);
  const taskVolumeTotal = staticTaskVolume.reduce((sum, item) => sum + item.value, 0);
  const taskDetailRows = [...visibleActivities]
    .filter((row) => row.source === "operante")
    .filter((row) => !detailTaskIds.length || detailTaskIds.includes(Number(row.taskId)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))
    .map((row) => {
      const task = taskById.get(row.taskId);
      const worker = workerById.get(Number(row.workerId));
      return {
        id: row.id,
        date: formatCalendarDate(row.date),
        worker: worker?.name || `Usuario ${row.workerId}`,
        task: task?.shortName || `Tarea ${row.taskId}`,
        shift: row.shift || "—",
        quantity: numberFormatter.format(row.quantity || 0),
        unit: String(task?.unit || "").trim() || productionUnit(task),
        guideNumber: row.guideNumber || "—",
        lote: row.lote || "—",
        brand: row.brandId ? brandById.get(Number(row.brandId)) || `Marca ${row.brandId}` : "—",
        observation: row.observation || "—",
        source: row.source === "jefe-equipo" ? "Jefe de equipo" : "Operante"
      };
    });
  const averageActivities = (dashboardData?.activities || []).filter((row) => (
    !selectedWorkerIds.length || selectedWorkerIds.includes(Number(row.workerId))
  ));
  const filteredActivityKpis = OPERATIONAL_TASKS.filter((task) => task.requiresTime).slice(0, 5).map((task) => {
    const rows = averageActivities.filter((row) => row.taskId === task.id);
    return { label: task.shortName, unit: String(task.unit || "").trim() || productionUnit(task), ...timedActivityKpi(rows) };
  });

  const selectedWorkerNames = selectedWorkerIds.map((id) => workerById.get(id)?.name).filter(Boolean);
  const selectedPeopleWorkerNames = peopleWorkerIds.map((id) => workerById.get(id)?.name).filter(Boolean);
  const selectedQualityWorkerNames = qualityWorkerIds.map((id) => workerById.get(id)?.name).filter(Boolean);
  const visibleIncidentRecords = (dashboardData?.incidents || []).filter((incident) => (
    matchesQualityDate(incident.date)
    && allowedIncidentTaskIds.has(incident.taskId)
    && (
      (!incidentUserIds.length && !incidentAreaIds.length)
      || incidentUserIds.includes(Number(incident.workerId))
      || incidentAreaIds.includes(Number(incident.areaId))
    )
  ));
  const comparableIncidentMetrics = buildComparableIncidentMetrics(visibleIncidentRecords, qualityActivities);
  const incidentCountByTask = visibleIncidentRecords.reduce((counts, incident) => {
    const item = counts.get(incident.taskId) || { value: 0, lastDate: null };
    item.value += 1;
    if (!item.lastDate || incident.date > item.lastDate) item.lastDate = incident.date;
    counts.set(incident.taskId, item);
    return counts;
  }, new Map());
  const filteredErrorsByTask = [...incidentCountByTask.entries()].map(([taskId, { value, lastDate }]) => ({
    id: taskId,
    name: errorTaskById.get(taskId)?.shortName || `Tarea de error ${taskId}`,
    value,
    tooltipDetail: lastDate ? `Más reciente: ${formatCalendarDate(lastDate)}` : ""
  })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const filteredErrorsByOffender = [...visibleIncidentRecords.reduce((counts, incident) => {
    const offenderName = incident.offenderName || "Sin identificar";
    const key = `${offenderName} (${incident.offenderType || "Usuario/Área"})`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map()).entries()].map(([name, value]) => ({ name, value, workerName: name })).sort((a, b) => b.value - a.value);
  const filteredErrorsByTypeAndShift = [
    { value: "turno regular", label: "Turno regular" },
    { value: "incidencia", aliases: ["incidencia", "error"], label: "Incidencia" },
    { value: "turno extra", label: "Turno extra" }
  ].map((shift) => {
    const acceptedValues = shift.aliases || [shift.value];
    const rows = visibleIncidentRecords.filter((incident) => acceptedValues.includes(incident.shift));
    const primaryRows = rows.filter((incident) => incident.errorType === "CONTENIDO");
    const secondaryRows = rows.filter((incident) => incident.errorType === "LIBERADO");
    return {
      name: shift.label,
      primaryRows,
      secondaryRows,
      primary: primaryRows.length,
      secondary: secondaryRows.length,
      primaryDetail: primaryRows.length ? "Haz clic para ver responsables" : "Sin errores de contenido",
      secondaryDetail: secondaryRows.length ? "Haz clic para ver responsables" : "Sin errores liberados"
    };
  });
  const aggregateAttendance = (rows) => [...rows.reduce((totals, row) => {
    const worker = workerById.get(row.workerId);
    if (!worker) return totals;
    const item = totals.get(row.workerId) || {
      name: worker.alias, workerName: worker.name, workerId: worker.id,
      absent: 0, punctual: 0, late: 0, lastLate: null, lastAbsent: null
    };
    // Agrupado en tres categorias para contabilizar facil: "asistencia"
    // (Asistencia, Medio turno, Apoyo), "tardanza" (aparte) y "ausente"
    // (Falta, Suspension, Descanso medico, Permiso).
    const group = attendanceGroup(row.state);
    if (group === "asistencia") item.punctual += 1;
    else if (group === "tardanza") {
      item.late += 1;
      if (!item.lastLate || row.date > item.lastLate) item.lastLate = row.date;
    } else {
      item.absent += 1;
      if (!item.lastAbsent || row.date > item.lastAbsent) item.lastAbsent = row.date;
    }
    totals.set(row.workerId, item);
    return totals;
  }, new Map()).values()];
  const filteredAttendance = aggregateAttendance((dashboardData?.attendances || []).filter((row) => matchesPeopleDate(row.date) && matchesPeopleWorker(row.workerId)));
  const attendanceAvailableYears = [...new Set([
    CURRENT_LIMA_YEAR,
    ...(dashboardData?.attendances || []).map((row) => Number(String(row.date || "").slice(0, 4))).filter(Number.isFinite)
  ])].sort((left, right) => right - left);
  const attendancePeriodRows = (dashboardData?.attendances || []).filter((row) => {
    if (!matchesPeopleWorker(row.workerId)) return false;
    const [year, month] = String(row.date || "").split("-").map(Number);
    if (attendanceYear !== "all" && year !== Number(attendanceYear)) return false;
    if (attendancePeriod === "all") return true;
    return month === Number(attendancePeriod);
  });
  const attendanceMonthDays = attendancePeriod === "all"
    ? 31
    : new Date(attendanceYear === "all" ? 2024 : Number(attendanceYear), Number(attendancePeriod), 0).getDate();
  const attendanceChartRows = attendanceDay === "all"
    ? attendancePeriodRows
    : attendancePeriodRows.filter((row) => {
      const [, , day] = String(row.date || "").split("-").map(Number);
      return day === Number(attendanceDay);
    });
  const attendanceChartData = aggregateAttendance(attendanceChartRows);
  const trainingById = new Map((dashboardData?.trainings || []).map((course) => [course.id, course]));
  const normalizeTrainingStatus = (state) => ["finalizado", "completado"].includes(state) ? "completado" : state === "en_curso" ? "en_curso" : "pendiente";
  const visibleAssignments = (dashboardData?.trainingAssignments || []).filter((row) => {
    const [year, month, day] = String(row.date || "").split("-").map(Number);
    return (!qualityWorkerIds.length || qualityWorkerIds.includes(Number(row.workerId)))
      && (!trainingCourseIds.length || trainingCourseIds.includes(Number(row.trainingId)))
      && (!trainingStatuses.length || trainingStatuses.includes(normalizeTrainingStatus(row.state)))
      && (!trainingYears.length || trainingYears.includes(year))
      && (!trainingMonths.length || trainingMonths.includes(month))
      && (!trainingDays.length || trainingDays.includes(day));
  });
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
    const normalizedStatus = normalizeTrainingStatus(assignment.state);
    return { ...course, id: assignment.id, worker: worker?.alias || worker?.name || "Sin trabajador", status: trainingStatusOptions.find((option) => option.value === normalizedStatus)?.label || "Pendiente", date: assignment.date ? formatCalendarDate(assignment.date) : "—" };
  });
  const attendanceTotals = filteredAttendance.reduce((totals, item) => ({
    absent: totals.absent + item.absent,
    punctual: totals.punctual + item.punctual,
    late: totals.late + item.late
  }), { absent: 0, punctual: 0, late: 0 });
  const attendanceTotal = attendanceTotals.absent + attendanceTotals.punctual + attendanceTotals.late;
  const tenure = averageEmployeeTenureMonths(dashboardData?.movements || [], {
    allowedWorkerIds: new Set(peopleWorkers.map((worker) => Number(worker.id)))
  });
  const filteredIndicators = [
    { label: "Margen de error", detail: `${comparableIncidentMetrics.comparableIncidents} incidentes / ${comparableIncidentMetrics.comparableRecords} registros comparables`, value: `${comparableIncidentMetrics.margin.toFixed(2)}%` },
    { label: "Ausentismo", detail: "Registro de asistencias", value: `${attendanceTotal ? ((attendanceTotals.absent / attendanceTotal) * 100).toFixed(2) : "0.00"}%` },
    { label: "Tardanza", detail: "Llegadas fuera de hora", value: `${attendanceTotal ? ((attendanceTotals.late / attendanceTotal) * 100).toFixed(2) : "0.00"}%` },
    { label: "Permanencia promedio", detail: `${tenure.workerCount} trabajador(es) con periodos laborales`, suffix: "meses", value: tenure.months.toFixed(2) }
  ];
  const filteredWarnings = (dashboardData?.warnings || []).filter((row) => (
    matchesPeopleDate(row.date) && matchesPeopleWorker(row.workerId)
  )).map((row) => {
    const worker = workerById.get(row.workerId);
    const alias = worker?.alias || worker?.name || "Sin trabajador";
    const documentType = row.documentType === "MEMORANDUM" ? "Memorándum" : row.documentType === "CARTA AMONESTACION" ? "Carta de amonestación" : "Sin especificar";
    return { id: row.id, alias, workerName: worker?.name || alias, date: formatCalendarDate(row.date), documentType };
  }).sort((a, b) => b.id - a.id);

  const visibleMovements = (dashboardData?.movements || []).filter((row) => (
    matchesPeopleDate(row.date)
    && matchesPeopleWorker(row.workerId)
  ));
  const filteredRotation = MONTHLY_TASKS.map((month, monthIndex) => {
    const monthMovements = visibleMovements.filter((row) => Number(row.date.slice(5, 7)) === monthIndex + 1);
    const entries = monthMovements.filter((row) => /ingreso/i.test(row.type));
    const exits = monthMovements.filter((row) => /salida/i.test(row.type));
    return {
      name: month.label,
      year: null,
      primary: entries.length,
      secondary: exits.length,
      primaryRows: entries,
      secondaryRows: exits,
      primaryDetail: entries.length ? "Haz clic para ver trabajadores" : "Sin ingresos registrados",
      secondaryDetail: exits.length ? "Haz clic para ver trabajadores" : "Sin salidas registradas"
    };
  });
  const EXIT_REASONS = [...visibleMovements.filter((row) => /salida/i.test(row.type) && (!selectedMovementMonths.length || selectedMovementMonths.includes(MONTHLY_TASKS[Number(row.date.slice(5, 7)) - 1].label))).reduce((totals, row) => {
    const name = row.reason || "Sin especificar";
    const item = totals.get(name) || { value: 0, lastDate: null };
    item.value += 1;
    if (!item.lastDate || row.date > item.lastDate) item.lastDate = row.date;
    totals.set(name, item);
    return totals;
  }, new Map()).entries()].map(([name, { value, lastDate }]) => ({ name, value, lastDate })).sort((a, b) => b.value - a.value);

  const nowParts = dashboardDateParts();
  // La planilla siempre muestra el año actual: el slicer "Año" no la afecta,
  // solo sirve para acotar el resto del dashboard.
  const payrollYear = nowParts.year;
  const payrollLastMonth = Math.max(nowParts.month - 1, 0);
  const allowedPayrollWorkers = new Set(peopleWorkers.map((worker) => Number(worker.id)));
  const payrollMonthIndexes = Array.from({ length: payrollLastMonth }, (_, index) => index);
  const filteredPayroll = payrollMonthIndexes.map((monthIndex) => {
    const byWorker = dashboardData?.payrollByWorker?.[payrollYear]?.[monthIndex];
    const value = byWorker
      ? Object.entries(byWorker).reduce((sum, [workerId, amount]) => (
        allowedPayrollWorkers.has(Number(workerId)) ? sum + Number(amount || 0) : sum
      ), 0)
      : Object.entries(dashboardData?.payrollByRole?.[payrollYear]?.[monthIndex] || {}).reduce((sum, [role, amount]) => (
        !selectedRoles.length || selectedRoles.includes(role) ? sum + Number(amount || 0) : sum
      ), 0);
    const workers = byWorker
      ? Object.keys(byWorker).filter((workerId) => allowedPayrollWorkers.has(Number(workerId))).length
      : Number(dashboardData?.payrollWorkersByMonth?.[payrollYear]?.[monthIndex] || 0);
    return { ...MONTHLY_TASKS[monthIndex], value, workers };
  });
  const payrollTotal = filteredPayroll.reduce((sum, item) => sum + item.value, 0);
  const payrollPeriodLabel = payrollMonthIndexes.length
    ? payrollMonthIndexes.every((monthIndex, index) => monthIndex === index)
      ? `ene–${MONTHLY_TASKS[payrollMonthIndexes.at(-1)].label.toLowerCase()}`
      : `${payrollMonthIndexes.length} meses seleccionados`
    : "sin período";
  // Sin filtro de estado, las tarjetas de personal siguen mostrando solo
  // activos (comportamiento previo); al elegir un estado se respeta la
  // seleccion, incluyendo ver inactivos o ambos a la vez.
  const activeWorkers = selectedWorkerStatus.length
    ? peopleWorkers
    : peopleWorkers.filter((worker) => worker.active);
  const operantCount = activeWorkers.filter((worker) => worker.role === "operante").length;
  const teamLeadCount = activeWorkers.filter((worker) => worker.role === "jefe de equipo").length;
  const groupLeadCount = activeWorkers.filter((worker) => worker.role === "jefe de grupo").length;
  const personnelKpis = [
    { label: "Total Trabajadores", value: activeWorkers.length },
    {
      label: "Total Operantes",
      value: operantCount + teamLeadCount + groupLeadCount,
      detail: `${operantCount} operantes · ${teamLeadCount} jefes de equipo${groupLeadCount ? ` · ${groupLeadCount} jefes de grupo` : ""}`
    },
    { label: "Total Administrativo", value: activeWorkers.filter((worker) => !["operante", "jefe de equipo", "jefe de grupo"].includes(worker.role)).length }
  ];
  const nextBirthday = (() => {
    const today = new Date();
    return peopleWorkers.filter((worker) => worker.active && worker.birthday).map((worker) => {
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
    setSelectedYears([CURRENT_LIMA_YEAR]);
    setProductionMonths([CURRENT_LIMA_MONTH]);
    setSelectedProductionRoles([]);
    setTaskVolumePeriod("current");
    setHourlyRankingTaskId("");
    setQuantityRankingTaskId("");
    setDetailTaskIds([]);
    setSelectedTaskTypes([]);
    setProductionWorkerScope("active");
    setSelectedIncidentTaskIds([]);
    setPeopleWorkerIds([]);
    setPeopleYears([]);
    setQualityWorkerIds([]);
    setQualityPeriod("current");
    setIncidentUserIds([]);
    setIncidentAreaIds([]);
    setTrainingYears([]);
    setTrainingMonths([]);
    setTrainingDays([]);
    setTrainingCourseIds([]);
    setTrainingStatuses([]);
    setSelectedMovementMonths([]);
    setAttendanceYear(String(CURRENT_LIMA_YEAR));
    setAttendancePeriod(String(CURRENT_LIMA_MONTH));
    setAttendanceDay("all");
  }

  function selectWorkerFromChart(item, setter = setSelectedWorkerIds) {
    closeOpenSlicers();
    const id = WORKERS.find((worker) => worker.name === (item.workerName || item.name))?.id;
    if (id) setter((current) => toggleArrayValue(current, id));
  }

  function selectTaskFromChart(item, setter, catalog = TASK_CATALOG) {
    closeOpenSlicers();
    const aliases = { "Clasificado y Rotulado": "Clasificado", "Visita de Tienda": "Visita Tienda" };
    const itemName = aliases[item.name] || item.name;
    const taskItem = catalog.find((candidate) => candidate.id === item.id || candidate.shortName === itemName || candidate.name === itemName);
    if (taskItem) setter((current) => toggleArrayValue(current, taskItem.id));
  }

  function changeTaskTypes(nextTypes) {
    setSelectedTaskTypes(nextTypes);
    setDetailTaskIds((current) => current.filter((id) => {
      const taskItem = TASK_CATALOG.find((candidate) => candidate.id === id);
      return taskItem && (!nextTypes.length || nextTypes.includes(taskItem.type));
    }));
  }

  function changeProductionWorkerScope(scope) {
    setProductionWorkerScope(scope);
    if (scope === "active") {
      setSelectedWorkerIds((current) => current.filter((id) => workerById.get(Number(id))?.active));
    }
  }

  function changeProductionPeriod(period) {
    setTaskVolumePeriod(period);
    if (period === "previous") {
      setSelectedYears([PREVIOUS_LIMA_MONTH_YEAR]);
      setProductionMonths([PREVIOUS_LIMA_MONTH]);
      return;
    }
    if (period === "all") {
      setSelectedYears([]);
      setProductionMonths([]);
      return;
    }
    setSelectedYears([CURRENT_LIMA_YEAR]);
    setProductionMonths([CURRENT_LIMA_MONTH]);
  }

  function changeProductionRoles(roles) {
    setSelectedProductionRoles(roles);
    setSelectedWorkerIds((current) => current.filter((id) => {
      const worker = workerById.get(Number(id));
      return worker && (!roles.length || roles.includes(worker.role));
    }));
  }

  function changeRoles(nextRoles) {
    setSelectedRoles(nextRoles);
    setPeopleWorkerIds((current) => current.filter((id) => {
      const worker = WORKERS.find((candidate) => candidate.id === id);
      return worker && (!nextRoles.length || nextRoles.includes(worker.role));
    }));
  }

  function changeWorkerStatus(nextStatus) {
    setSelectedWorkerStatus(nextStatus);
    setPeopleWorkerIds((current) => current.filter((id) => {
      const worker = WORKERS.find((candidate) => candidate.id === id);
      return worker && (!nextStatus.length || nextStatus.includes(worker.active ? "activo" : "inactivo"));
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

  const activeFilterCount = [
    selectedWorkerIds, productionMonths, selectedProductionRoles, detailTaskIds, selectedTaskTypes,
    hourlyRankingTaskId ? [hourlyRankingTaskId] : [], quantityRankingTaskId ? [quantityRankingTaskId] : [],
    peopleWorkerIds, selectedRoles, selectedWorkerStatus, peopleYears,
    selectedIncidentTaskIds, qualityWorkerIds, incidentUserIds, incidentAreaIds,
    trainingYears, trainingMonths, trainingDays, trainingCourseIds, trainingStatuses, selectedMovementMonths
  ].filter((values) => values.length).length;
  const filterSummary = activeFilterCount
    ? `${activeFilterCount} filtros locales activos · cada uno afecta solo su sección`
    : `Filtros independientes por Producción, Personas, Calidad y Capacitación`;
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
          <div className="pbi-report">
            <section className="pbi-kpi-grid pbi-kpi-grid--personnel" aria-label="Resumen de personal">
              {personnelKpis.map((item) => <PersonnelKpi key={item.label} {...item} />)}
            </section>

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

              <div className="pbi-section-filters pbi-section-filters--production" aria-label="Filtros de producción">
                <MultiSlicer id="production-workers" label="Trabajadores" options={workerOptions} selected={selectedWorkerIds} onChange={setSelectedWorkerIds} allLabel="Todos" />
                <label className="pbi-compact-check" htmlFor="pbi-production-worker-scope">
                  <input
                    id="pbi-production-worker-scope"
                    type="checkbox"
                    checked={productionWorkerScope === "all"}
                    onChange={(event) => changeProductionWorkerScope(event.target.checked ? "all" : "active")}
                  />
                  <span>Habilitar trabajadores inactivos</span>
                </label>
                <div className="pbi-ranking-task-filter pbi-section-period-filter">
                  <label htmlFor="pbi-production-period">Período</label>
                  <select id="pbi-production-period" value={taskVolumePeriod} onChange={(event) => changeProductionPeriod(event.target.value)}>
                    <option value="current">Mes actual</option>
                    <option value="previous">Mes anterior</option>
                    <option value="all">Todo</option>
                  </select>
                </div>
                <MultiSlicer id="production-roles" label="Cargo" options={productionRoleOptions} selected={selectedProductionRoles} onChange={changeProductionRoles} allLabel="Todos" searchable={false} />
                <MultiSlicer id="production-task-types" label="Tipo de tarea" options={operationalTaskTypeOptions} selected={selectedTaskTypes} onChange={changeTaskTypes} allLabel="Todos" searchable={false} />
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-top-workers"
                  title="Top 5 Trabajadores por Producción"
                  meta="Suma de puntos a favor"
                  icon={<StarIcon />}
                  className="pbi-card--chart pbi-card--featured pbi-card--top-workers-compact pbi-card--span-12"
                >
                  <VerticalBarChart
                    id="pbi-top-workers"
                    data={filteredTopWorkers}
                    ariaLabel="Top cinco trabajadores por producción"
                    onSelect={selectWorkerFromChart}
                    selectedNames={selectedWorkerNames}
                    compact
                  />
                </Card>

                <Card
                  id="pbi-task-detail"
                  title="Detalle de Registro de Tareas"
                  meta={`${taskDetailRows.length} registros`}
                  className="pbi-card--table pbi-card--task-detail-scroll pbi-card--span-12"
                >
                  <div className="pbi-table-local-filter">
                    <MultiSlicer id="task-detail-tasks" label="Filtrar tarea en la tabla" options={operationalTaskOptions} selected={detailTaskIds} onChange={setDetailTaskIds} allLabel="Todas" />
                  </div>
                  <DataTable
                    caption="Detalle de registros operativos por tarea"
                    columns={[
                      { key: "date", label: "Fecha" },
                      { key: "worker", label: "Trabajador" },
                      { key: "task", label: "Tarea" },
                      { key: "shift", label: "Turno" },
                      { key: "quantity", label: "Cantidad" },
                      { key: "unit", label: "Unidad" },
                      { key: "guideNumber", label: "N.º de guía" },
                      { key: "lote", label: "Lote" },
                      { key: "brand", label: "Marca" },
                      { key: "observation", label: "Observación" },
                      { key: "source", label: "Origen" }
                    ]}
                    rows={taskDetailRows}
                  />
                </Card>

                <Card
                  id="pbi-hourly-ranking"
                  title="Ranking por Promedio por Hora"
                  meta={effectiveHourlyTask?.shortName || "Selecciona una tarea"}
                  className="pbi-card--chart pbi-card--ranking pbi-card--span-6"
                >
                  <div className="pbi-ranking-task-filter">
                    <label htmlFor="pbi-hourly-ranking-task">Tarea de jefe de equipo</label>
                    <select id="pbi-hourly-ranking-task" value={effectiveHourlyTaskId || ""} onChange={(event) => setHourlyRankingTaskId(event.target.value)}>
                      {timedRankingTasks.map((task) => <option key={task.id} value={task.id}>{task.shortName}</option>)}
                    </select>
                  </div>
                  <div className="pbi-ranking-scroll">
                    <HorizontalBars data={hourlyWorkerRanking} ariaLabel={`Ranking de todos los trabajadores por promedio por hora en ${effectiveHourlyTask?.shortName || "la tarea seleccionada"}`} color="#0a4f87" valueFormatter={(value) => `${numberFormatter.format(value)} ${productionUnit(effectiveHourlyTask)}/h`} onSelect={(item) => setHourlyRankingWorkerId(item.id)} selectedNames={selectedWorkerNames} />
                  </div>
                </Card>

                <Card
                  id="pbi-labeling-ranking"
                  title="Ranking de Cantidad por Pares"
                  meta={effectiveQuantityTask?.shortName || "Selecciona una tarea"}
                  className="pbi-card--chart pbi-card--ranking pbi-card--span-6"
                >
                  <div className="pbi-ranking-task-filter">
                    <label htmlFor="pbi-quantity-ranking-task">Tarea por pares</label>
                    <select id="pbi-quantity-ranking-task" value={effectiveQuantityTaskId || ""} onChange={(event) => setQuantityRankingTaskId(event.target.value)}>
                      {pairRankingTasks.map((task) => <option key={task.id} value={task.id}>{task.shortName}</option>)}
                    </select>
                  </div>
                  <div className="pbi-ranking-scroll">
                    <HorizontalBars data={quantityWorkerRanking} ariaLabel={`Ranking de todos los trabajadores por cantidad de pares en ${effectiveQuantityTask?.shortName || "la tarea seleccionada"}`} color="#e1c233" valueFormatter={(value) => `${numberFormatter.format(value)} pares`} selectedNames={selectedWorkerNames} />
                  </div>
                </Card>

                {selectedHourlyRankingWorker ? (
                  <HourlyRankingRecordsModal
                    workerName={selectedHourlyRankingWorker.name}
                    taskName={effectiveHourlyTask?.shortName || "Tarea seleccionada"}
                    periodLabel={productionPeriodLabel}
                    unit={productionUnit(effectiveHourlyTask)}
                    rows={selectedHourlyRankingRows}
                    targetHourly={hourlyReferenceDraft}
                    onTargetHourlyChange={setHourlyReferenceDraft}
                    onSaveTarget={saveHourlyReference}
                    targetSaving={hourlyReferenceSaving}
                    targetStatus={hourlyReferenceStatus}
                    showHangtag={hourlyTaskIsLabeling}
                    hangtagValue={hourlyRankingHangtag}
                    onHangtagChange={setHourlyRankingHangtag}
                    onClose={() => setHourlyRankingWorkerId(null)}
                  />
                ) : null}

                <Card
                  id="pbi-task-volume"
                  title="Volumen de Registros por Tarea"
                  meta={`${numberFormatter.format(taskVolumeTotal)} registros`}
                  className="pbi-card--chart pbi-card--span-6"
                >
                  <div className="pbi-task-volume-scroll">
                    <HorizontalBars
                      data={staticTaskVolume}
                      ariaLabel="Volumen de registros por tipo de tarea"
                      color="#0a4f87"
                    />
                  </div>
                </Card>

                <Card
                  id="pbi-monthly-tasks"
                  title="Volumen de Registros por Mes"
                  meta={`${CURRENT_LIMA_YEAR} · ${numberFormatter.format(staticMonthlyTotal)} registros`}
                  className="pbi-card--chart pbi-card--span-6"
                >
                  <LineChart
                    id="pbi-monthly-tasks"
                    data={staticMonthlyTasks}
                    ariaLabel={`Volumen mensual de registros operativos de ${CURRENT_LIMA_YEAR}, total ${staticMonthlyTotal}`}
                    tone="gold"
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

              <div className="pbi-section-filters pbi-section-filters--people" aria-label="Filtros de personas">
                <MultiSlicer id="people-workers" label="Trabajadores" options={peopleWorkerOptions} selected={peopleWorkerIds} onChange={setPeopleWorkerIds} allLabel="Todos" />
                <MultiSlicer id="people-roles" label="Cargos" options={roleOptions} selected={selectedRoles} onChange={changeRoles} allLabel="Todos" searchable={false} />
                <MultiSlicer id="people-status" label="Estado" options={statusOptions} selected={selectedWorkerStatus} onChange={changeWorkerStatus} allLabel="Todos" searchable={false} />
                <MultiSlicer id="people-years" label="Año" options={peopleAvailableYears.map((year) => ({ value: year, label: String(year) }))} selected={peopleYears} onChange={setPeopleYears} allLabel="Todos" searchable={false} />
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-rotation"
                  title="Rotación de Personal por Mes"
                  meta={`${filteredRotation.reduce((sum, item) => sum + item.primary, 0)} ingresos · ${filteredRotation.reduce((sum, item) => sum + item.secondary, 0)} salidas`}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <ComparisonBars
                    data={filteredRotation}
                    ariaLabel="Ingresos y salidas de personal por mes"
                    primaryLabel="Ingreso"
                    secondaryLabel="Salida"
                    primaryColor="#05b13e"
                    secondaryColor="#f4303f"
                    onSelect={(item) => setSelectedMovementMonths((current) => toggleArrayValue(current, item.name))}
                    onSeriesSelect={(item, series) => {
                      const rows = series === "primary" ? item.primaryRows : item.secondaryRows;
                      if (rows.length) setSelectedMovementDetail({
                        month: item.name,
                        movementLabel: series === "primary" ? "Ingresos" : "Salidas",
                        rows
                      });
                    }}
                    selectedNames={selectedMovementMonths}
                  />
                </Card>

                {selectedMovementDetail ? (
                  <MovementRecordsModal
                    {...selectedMovementDetail}
                    workerById={workerById}
                    onClose={() => setSelectedMovementDetail(null)}
                  />
                ) : null}

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
                  meta={`${filteredWarnings.length} amonestaciones`}
                  className="pbi-card--table pbi-card--span-4"
                >
                  <DataTable
                    caption="Detalle de amonestaciones registradas por trabajador"
                    columns={[
                      { key: "date", label: "Fecha" },
                      { key: "alias", label: "Trabajador" },
                      { key: "documentType", label: "Documento" }
                    ]}
                    rows={filteredWarnings}
                  />
                </Card>

                <Card
                  id="pbi-attendance"
                  title="Asistencia por Trabajador"
                  meta="Puntual · tardanza · ausencia"
                  className="pbi-card--chart pbi-card--attendance-compact pbi-card--span-6"
                >
                  <div className="pbi-ranking-task-filter pbi-attendance-period-filter">
                    <label htmlFor="pbi-attendance-year">Año</label>
                    <select
                      id="pbi-attendance-year"
                      value={attendanceYear}
                      onChange={(event) => {
                        setAttendanceYear(event.target.value);
                        setAttendanceDay("all");
                      }}
                    >
                      <option value="all">General</option>
                      {attendanceAvailableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                    </select>
                    <label htmlFor="pbi-attendance-period">Periodo</label>
                    <select
                      id="pbi-attendance-period"
                      value={attendancePeriod}
                      onChange={(event) => {
                        setAttendancePeriod(event.target.value);
                        setAttendanceDay("all");
                      }}
                    >
                      <option value="all">General</option>
                      {MONTHLY_TASKS.map((month, index) => (
                        <option key={month.label} value={String(index + 1)}>
                          {month.name.charAt(0).toUpperCase() + month.name.slice(1)}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="pbi-attendance-day">Fecha</label>
                    <select id="pbi-attendance-day" value={attendanceDay} onChange={(event) => setAttendanceDay(event.target.value)}>
                      <option value="all">Todos</option>
                      {Array.from({ length: attendanceMonthDays }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={String(day)}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <AttendanceBars data={attendanceChartData} onSelect={(item) => selectWorkerFromChart(item, setPeopleWorkerIds)} selectedNames={selectedPeopleWorkerNames} />
                </Card>

                <Card
                  id="pbi-payroll"
                  title={`Costo de Planilla Mensual (${payrollYear || "—"})`}
                  meta={`${currencyFormatter.format(payrollTotal)} · ${payrollPeriodLabel}`}
                  className="pbi-card--chart pbi-card--span-12 pbi-card--payroll"
                >
                  <div className="pbi-payroll-layout">
                    <div className="pbi-payroll-chart">
                      <LineChart
                        id="pbi-payroll"
                        data={filteredPayroll}
                        ariaLabel={`Costo mensual de planilla ${payrollYear || ""}, ${payrollPeriodLabel}, total ${currencyFormatter.format(payrollTotal)}`}
                        valueFormatter={(value) => value >= 1000 ? `S/ ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `S/ ${value}`}
                        tone="blue"
                      />
                    </div>
                    <div className="pbi-payroll-table">
                      <DataTable
                        caption={`Planilla mensual estimada de ${payrollYear}`}
                        columns={[
                          { key: "name", label: "Mes" },
                          { key: "workers", label: "Trabajadores" },
                          { key: "cost", label: "Costo estimado" }
                        ]}
                        rows={filteredPayroll.map((item) => ({
                          name: item.name,
                          workers: item.workers,
                          cost: currencyFormatter.format(item.value)
                        }))}
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            <section className="pbi-report-section" aria-labelledby="pbi-quality-section-title">
              <div className="pbi-section-heading">
                <div>
                  <span className="pbi-section-kicker">Calidad</span>
                  <h2 id="pbi-quality-section-title">Calidad y errores</h2>
                </div>
                <p>Errores, causas y trazabilidad de tareas.</p>
              </div>

              <fieldset className="pbi-filter pbi-filter--quality-tasks">
                <legend className="pbi-filter-label">Tareas de error</legend>
                <div className="pbi-filter-chips" data-testid="slicer-incident-tasks">
                  <button
                    className={`pbi-chip${!selectedIncidentTaskIds.length ? " pbi-chip--active" : ""}`}
                    type="button"
                    onClick={() => setSelectedIncidentTaskIds([])}
                    aria-pressed={!selectedIncidentTaskIds.length}
                  >
                    Todas
                  </button>
                  {INCIDENT_TASKS.map((task) => (
                    <button
                      className={`pbi-chip${selectedIncidentTaskIds.includes(task.id) ? " pbi-chip--active" : ""}`}
                      type="button"
                      key={task.id}
                      onClick={() => setSelectedIncidentTaskIds((current) => toggleArrayValue(current, task.id))}
                      aria-pressed={selectedIncidentTaskIds.includes(task.id)}
                    >
                      {task.shortName}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="pbi-section-filters pbi-section-filters--quality" aria-label="Filtros de calidad y errores">
                <div className="pbi-ranking-task-filter pbi-section-period-filter">
                  <label htmlFor="pbi-quality-period">Período</label>
                  <select id="pbi-quality-period" value={qualityPeriod} onChange={(event) => setQualityPeriod(event.target.value)}>
                    <option value="current">Mes actual</option>
                    <option value="previous">Mes anterior</option>
                    <option value="all">Todo</option>
                  </select>
                </div>
                <MultiSlicer id="incident-users" label="Trabajador" options={incidentUserOptions} selected={incidentUserIds} onChange={setIncidentUserIds} allLabel="Todos los activos" />
                <MultiSlicer id="incident-areas" label="Área" options={incidentAreaOptions} selected={incidentAreaIds} onChange={setIncidentAreaIds} allLabel="Todas" />
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-errors-task"
                  title="Distribución de Errores por Tarea"
                  meta={`${visibleIncidentRecords.length} registros de error`}
                  className="pbi-card--chart pbi-card--quality-treemap pbi-card--span-4"
                >
                  <TreemapChart
                    data={filteredErrorsByTask}
                    ariaLabel="Registros de errores agrupados por tarea"
                    unit="errores"
                    onSelect={(item) => selectTaskFromChart(item, setSelectedIncidentTaskIds, INCIDENT_TASKS)}
                    selectedNames={selectedIncidentTaskIds.map((id) => errorTaskById.get(id)?.shortName).filter(Boolean)}
                  />
                </Card>

                <Card
                  id="pbi-error-types"
                  title="Errores por Turno y Tipo"
                  meta={`${visibleIncidentRecords.length} errores`}
                  className="pbi-card--chart pbi-card--error-comparison pbi-card--span-8"
                >
                  <ComparisonBars
                    data={filteredErrorsByTypeAndShift}
                    ariaLabel="Comparación de errores de contenido y liberados en los tres turnos"
                    primaryLabel="CONTENIDO"
                    secondaryLabel="LIBERADO"
                    primaryColor="#0a4f87"
                    secondaryColor="#e1c233"
                    onSeriesSelect={(item, series) => {
                      const rows = series === "primary" ? item.primaryRows : item.secondaryRows;
                      if (rows.length) setSelectedErrorDetail({
                        shiftLabel: item.name,
                        errorType: series === "primary" ? "CONTENIDO" : "LIBERADO",
                        rows
                      });
                    }}
                  />
                </Card>

                {selectedErrorDetail ? (
                  <ErrorRecordsModal {...selectedErrorDetail} onClose={() => setSelectedErrorDetail(null)} />
                ) : null}

                <Card
                  id="pbi-errors-worker"
                  title="Errores por Usuario o Área"
                  meta={`${visibleIncidentRecords.length} errores`}
                  className="pbi-card--chart pbi-card--quality-responsible pbi-card--tall pbi-card--span-12"
                >
                  <HorizontalBars
                    data={filteredErrorsByOffender}
                    ariaLabel="Errores agrupados por usuario o área que cometió el error"
                    color="#0a4f87"
                  />
                </Card>

              </div>
            </section>

            <section className="pbi-report-section" aria-labelledby="pbi-training-section-title">
              <div className="pbi-section-heading">
                <div>
                  <span className="pbi-section-kicker">Desarrollo</span>
                  <h2 id="pbi-training-section-title">Capacitación y desarrollo</h2>
                </div>
                <p>Avance, estado e historial de cursos asignados al personal.</p>
              </div>

              <div className="pbi-section-filters pbi-section-filters--training" aria-label="Filtros de capacitación">
                <MultiSlicer id="training-workers" label="Trabajador" options={qualityWorkerOptions} selected={qualityWorkerIds} onChange={setQualityWorkerIds} allLabel="Todos" />
                <MultiSlicer id="training-courses" label="Curso" options={trainingCourseOptions} selected={trainingCourseIds} onChange={setTrainingCourseIds} allLabel="Todos" />
                <MultiSlicer id="training-statuses" label="Estado" options={trainingStatusOptions} selected={trainingStatuses} onChange={setTrainingStatuses} allLabel="Todos" searchable={false} />
                <div className="pbi-powerbi-date-grid" aria-label="Fecha de capacitación">
                  <MultiSlicer id="training-years" label="Año" options={trainingAvailableYears.map((year) => ({ value: year, label: String(year) }))} selected={trainingYears} onChange={setTrainingYears} allLabel="Todos" searchable={false} />
                  <MultiSlicer id="training-months" label="Mes" options={trainingMonthOptions} selected={trainingMonths} onChange={setTrainingMonths} allLabel="Todos" searchable={false} />
                  <MultiSlicer id="training-days" label="Día" options={trainingDayOptions} selected={trainingDays} onChange={setTrainingDays} allLabel="Todos" searchable={false} />
                </div>
              </div>

              <div className="pbi-content-grid">
                <Card
                  id="pbi-training-progress"
                  title="Avance de Capacitaciones"
                  meta={trainingTotal ? `${Math.round((trainingCompleted / trainingTotal) * 100)}% completado · ${trainingTotal} asignaciones` : "Sin asignaciones"}
                  className="pbi-card--chart pbi-card--span-4"
                >
                  <TrainingProgressBars
                    data={filteredTrainingProgress}
                    onSelect={(item) => selectWorkerFromChart(item, setQualityWorkerIds)}
                    selectedNames={selectedQualityWorkerNames}
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
                      { key: "date", label: "Fecha" },
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
