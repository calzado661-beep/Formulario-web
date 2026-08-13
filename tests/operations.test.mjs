import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceDisplayState,
  calculateCompletedActivityPoints,
  elapsedMinutes,
  validateActivityCardMetadata,
  validateAttendanceEdit,
  validateProgressQuantity
} from "../src/lib/operations.js";
import { limaDateTimeToISO } from "../src/lib/dates.js";
import { validateQuantityRanges } from "../src/lib/scoring.js";

test("retiro anticipado conserva puntualidad y exige motivo", () => {
  assert.equal(validateAttendanceEdit({ estado: "PUNTUAL", retiro_anticipado: true, motivo_retiro: "" }), "Ingresa el motivo del retiro anticipado.");
  assert.equal(validateAttendanceEdit({ estado: "TARDANZA", retiro_anticipado: true, motivo_retiro: "Cita medica" }), "");
  assert.equal(attendanceDisplayState({ estado: "PUNTUAL", retiro_anticipado: true }), "Retiro anticipado");
});

test("un ausente no puede retirarse anticipadamente", () => {
  assert.match(validateAttendanceEdit({ estado: "AUSENTE", retiro_anticipado: true, motivo_retiro: "Motivo" }), /ausente/i);
});

test("la cantidad acumulada no puede disminuir", () => {
  assert.match(validateProgressQuantity(120, 119), /no puede ser menor/i);
  assert.equal(validateProgressQuantity(120, 120), "");
  assert.equal(validateProgressQuantity(120, 150), "");
});

test("marca y lote se validan dentro de la tarjeta de Etiquetado", () => {
  assert.match(validateActivityCardMetadata({ requiresBrand: true, allowsLote: true, requireBrand: true }), /marca/i);
  assert.match(validateActivityCardMetadata({ requiresBrand: true, allowsLote: true, marcaId: 2, useLote: true, lote: "", requireBrand: true }), /codigo de lote/i);
  assert.equal(validateActivityCardMetadata({ requiresBrand: true, allowsLote: true, marcaId: 2, useLote: true, lote: " a05 ", requireBrand: true }), "");
  assert.equal(validateActivityCardMetadata({ requiresBrand: true, allowsLote: true, requireBrand: false }), "");
});

test("otras tareas no aceptan lote", () => {
  assert.match(validateActivityCardMetadata({ allowsLote: false, useLote: true, lote: "A05" }), /solo esta disponible/i);
});

test("la duracion se obtiene de inicio y fin", () => {
  assert.equal(elapsedMinutes("2026-08-13T08:00:00-05:00", "2026-08-13T09:25:00-05:00"), 85);
  assert.equal(elapsedMinutes("2026-08-13T09:25:00-05:00", "2026-08-13T08:00:00-05:00"), 0);
});

test("el puntaje final usa las reglas de cantidad", () => {
  const task = {
    tipo_medicion: "cantidad",
    reglas_puntaje: [
      { tipo_regla: "CANTIDAD", desde: 0, hasta: 20, puntos: 1 },
      { tipo_regla: "CANTIDAD", desde: 21, hasta: 40, puntos: 2 }
    ]
  };
  assert.equal(calculateCompletedActivityPoints(task, 20), 1);
  assert.equal(calculateCompletedActivityPoints(task, 21), 2);
  assert.equal(calculateCompletedActivityPoints(task, 41), 0);
});

test("convierte fecha y hora de Lima y permite cierres después de medianoche", () => {
  assert.equal(limaDateTimeToISO("2026-08-14", "00:15"), "2026-08-14T05:15:00.000Z");
  assert.equal(limaDateTimeToISO("", "00:15"), "");
});

test("el rango de 10 puntos debe quedar abierto", () => {
  const ranges = Array.from({ length: 10 }, (_, index) => ({
    desde: index * 10,
    hasta: index === 9 ? 999 : index * 10 + 9,
    puntos: index + 1
  }));
  assert.match(validateQuantityRanges(ranges), /sin limite|vacío|vacío/i);
  ranges[9].hasta = "";
  assert.equal(validateQuantityRanges(ranges), "");
});
