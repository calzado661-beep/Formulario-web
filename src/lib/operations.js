import { calculatePoints } from "./scoring.js";

export const ATTENDANCE_STATES = ["FALTA", "ASISTENCIA", "TARDANZA", "MEDIO_TURNO", "APOYO", "PERMISO", "DESCANSO_MEDICO", "SUSPENSION"];
const ATTENDANCE_PRESENT_STATES = ["ASISTENCIA", "TARDANZA", "MEDIO_TURNO", "APOYO"];
export const ATTENDANCE_RETIRO_TYPES = ["personal", "apoyo"];

// Agrupa los estados en tres categorias para que el dashboard de asistencia
// sea facil de contabilizar: "asistencia" (llego a trabajar de alguna forma),
// "tardanza" (aparte, ni cuenta como asistencia puntual ni como ausencia) y
// "ausente" (no estuvo, con o sin justificacion).
const ATTENDANCE_GROUP_BY_STATE = {
  ASISTENCIA: "asistencia",
  MEDIO_TURNO: "asistencia",
  APOYO: "asistencia",
  TARDANZA: "tardanza",
  FALTA: "ausente",
  SUSPENSION: "ausente",
  DESCANSO_MEDICO: "ausente",
  PERMISO: "ausente"
};

export function attendanceGroup(estado) {
  const normalized = String(estado || "FALTA").trim().toUpperCase();
  return ATTENDANCE_GROUP_BY_STATE[normalized] || "ausente";
}

export function validateAttendanceEdit({ estado, retiro_anticipado, motivo_retiro, tipo_retiro }) {
  const normalizedState = String(estado || "").trim().toUpperCase();
  if (!ATTENDANCE_STATES.includes(normalizedState)) {
    return "Selecciona un estado de asistencia valido.";
  }
  if (retiro_anticipado && !ATTENDANCE_PRESENT_STATES.includes(normalizedState)) {
    return "Solo un trabajador presente (Asistencia, Tardanza, Medio turno o Apoyo) puede figurar con retiro anticipado.";
  }
  if (retiro_anticipado && !ATTENDANCE_RETIRO_TYPES.includes(String(tipo_retiro || "").trim().toLowerCase())) {
    return "Selecciona si el retiro fue por apoyo a otra area o por un motivo personal.";
  }
  if (retiro_anticipado && !String(motivo_retiro || "").trim()) {
    return "Ingresa el motivo del retiro anticipado.";
  }
  return "";
}

export function attendanceDisplayState(attendance) {
  if (attendance?.retiro_anticipado) return "Retiro anticipado";
  const state = String(attendance?.estado || "FALTA").toUpperCase();
  if (state === "ASISTENCIA") return "Asistencia";
  if (state === "TARDANZA") return "Tardanza";
  if (state === "MEDIO_TURNO") return "Medio turno";
  if (state === "APOYO") return "Apoyo";
  if (state === "PERMISO") return "Permiso";
  if (state === "DESCANSO_MEDICO") return "Descanso Médico";
  if (state === "SUSPENSION") return "Suspensión";
  return "Falta";
}

export function elapsedMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function validateProgressQuantity(currentQuantity, nextQuantity) {
  const current = Number(currentQuantity || 0);
  const next = Number(nextQuantity);
  if (!Number.isInteger(next) || next < 0) return "La cantidad debe ser un numero entero mayor o igual a cero.";
  if (next < current) return "La cantidad no puede ser menor que la ultima cantidad registrada.";
  return "";
}

export function validateActivityCardMetadata({
  requiresBrand = false,
  allowsLote = false,
  marcaId = null,
  useLote = false,
  lote = "",
  requireBrand = false
}) {
  if (requireBrand && requiresBrand) {
    const brand = Number(marcaId);
    if (!Number.isInteger(brand) || brand <= 0) return "Selecciona una marca antes de finalizar.";
  }
  if (!allowsLote && (useLote || String(lote || "").trim())) return "El lote solo esta disponible para la tarea Etiquetado.";
  const normalizedLote = String(lote || "").trim();
  if (allowsLote && useLote && !normalizedLote) return "Ingresa el codigo de lote o desactiva la opcion de lote.";
  if (normalizedLote.length > 100) return "El codigo de lote no puede superar 100 caracteres.";
  return "";
}

export function calculateCompletedActivityPoints(task, quantity) {
  return calculatePoints(task, Number(quantity || 0), null, true);
}
