import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardPayroll,
  buildTaggedPairsByBrand,
  dashboardDateParts,
  taskVolumeRows,
  timedActivityKpi,
  workerProductionRows
} from "../src/lib/dashboardMetrics.js";

test("la fecha operativa se calcula en America/Lima", () => {
  assert.deepEqual(
    dashboardDateParts(new Date("2026-08-14T02:00:00.000Z")),
    { year: 2026, month: 8, day: 13, iso: "2026-08-13" }
  );
});

test("la planilla excluye inactivos, respeta altas/bajas y no proyecta meses futuros", () => {
  const users = [
    { id: 1, rol: "operante", activo: true, sueldo: 1000, fecha_ingreso: "2026-01-01", fecha_salida: null },
    { id: 2, rol: "otros", activo: false, sueldo: 9000, fecha_ingreso: "2025-01-01", fecha_salida: null },
    { id: 3, rol: "administrador", activo: true, sueldo: 2000, fecha_ingreso: "2026-03-10", fecha_salida: "2026-06-15" }
  ];
  const payroll = buildDashboardPayroll(users, [2026], {
    today: new Date("2026-08-13T18:00:00.000-05:00"),
    normalizeRole: (role) => role
  });

  assert.deepEqual(payroll.byRole[2026][0], { operante: 1000 });
  assert.deepEqual(payroll.byRole[2026][2], { operante: 1000, administrador: 2000 });
  assert.deepEqual(payroll.byRole[2026][6], { operante: 1000 });
  assert.deepEqual(payroll.byRole[2026][8], {});
  assert.deepEqual(payroll.byWorker[2026][2], { 1: 1000, 3: 2000 });
});

test("pares por marca usa solo Etiquetado y suma cantidades reales", () => {
  const tasks = new Map([
    [3, { id: 3, name: "Etiquetado" }],
    [8, { id: 8, name: "Picking" }]
  ]);
  const brands = new Map([[1, "Superga"], [2, "Adidas"]]);
  const rows = buildTaggedPairsByBrand([
    { taskId: 3, brandId: 1, quantity: 20 },
    { taskId: 3, brandId: 1, quantity: 5 },
    { taskId: 3, brandId: 2, quantity: 16 },
    { taskId: 8, brandId: 1, quantity: 999 }
  ], tasks, brands);

  assert.deepEqual(rows, [
    { name: "Superga", value: 25 },
    { name: "Adidas", value: 16 }
  ]);
});

test("KPIs por tiempo usan solo filas cronometradas y promedian la tasa de cada registro", () => {
  const result = timedActivityKpi([
    { date: "2026-08-01", quantity: 1000, minutes: 0 },
    { date: "2026-08-01", quantity: 60, minutes: 60 },
    { date: "2026-08-02", quantity: 60, minutes: 30 }
  ]);
  assert.deepEqual(result, { daily: 60, hourly: 90 });
});

test("detalle por tarea conserva el total completo aunque la grafica use top 10", () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: `Tarea ${index + 1}` }));
  const activities = tasks.flatMap((task, index) => Array.from({ length: index + 1 }, () => ({ taskId: task.id })));
  const rows = taskVolumeRows(tasks, activities);
  assert.equal(rows.length, 12);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 78);
});

test("bottom puede incluir cero puntos cuando el trabajador si tiene registros", () => {
  const rows = workerProductionRows([
    { id: 1, name: "Con cero" },
    { id: 2, name: "Sin actividad" },
    { id: 3, name: "Con puntos" }
  ], [
    { workerId: 1, points: 0 },
    { workerId: 3, points: 7 }
  ]);
  assert.deepEqual(rows.map(({ id, records, value }) => ({ id, records, value })), [
    { id: 1, records: 1, value: 0 },
    { id: 3, records: 1, value: 7 }
  ]);
});
