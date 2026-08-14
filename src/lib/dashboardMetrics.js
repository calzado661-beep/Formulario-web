const DEFAULT_TIME_ZONE = "America/Lima";

export function dashboardIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? match[0] : null;
}

export function dashboardDateParts(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    iso: `${fields.year}-${fields.month}-${fields.day}`
  };
}

export function dashboardActive(value) {
  return !["false", "0", "no"].includes(String(value ?? true).trim().toLowerCase());
}

export function buildDashboardPayroll(users, years, {
  today = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
  normalizeRole = (role) => String(role || "otros").trim().toLowerCase()
} = {}) {
  const todayParts = dashboardDateParts(today, timeZone);
  const byRole = {};
  const byWorker = {};

  for (const rawYear of years) {
    const year = Number(rawYear);
    byRole[year] = Array.from({ length: 12 }, () => ({}));
    byWorker[year] = Array.from({ length: 12 }, () => ({}));

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const monthNumber = monthIndex + 1;
      if (year > todayParts.year || (year === todayParts.year && monthNumber > todayParts.month)) continue;

      const monthStart = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
      const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const monthEndIso = `${year}-${String(monthNumber).padStart(2, "0")}-${String(monthEnd).padStart(2, "0")}`;

      for (const user of users) {
        if (!dashboardActive(user.activo)) continue;
        const salary = Number(user.sueldo || 0);
        const workerId = Number(user.id);
        const joined = dashboardIsoDate(user.fecha_ingreso) || dashboardIsoDate(user.created_at);
        const left = dashboardIsoDate(user.fecha_salida);
        if (!workerId || !Number.isFinite(salary) || salary <= 0) continue;
        if ((joined && joined > monthEndIso) || (left && left < monthStart)) continue;

        const role = normalizeRole(user.rol) || "otros";
        byRole[year][monthIndex][role] = (byRole[year][monthIndex][role] || 0) + salary;
        byWorker[year][monthIndex][workerId] = salary;
      }
    }
  }

  return { byRole, byWorker };
}

function normalizedTaskName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildTaggedPairsByBrand(activities, taskById, brandById) {
  const totals = new Map();
  for (const row of activities) {
    const task = taskById.get(Number(row.taskId));
    if (normalizedTaskName(task?.name || task?.shortName) !== "etiquetado") continue;
    const brandName = brandById.get(Number(row.brandId));
    const quantity = Math.max(0, Number(row.quantity || 0));
    if (!brandName || !quantity) continue;
    totals.set(brandName, (totals.get(brandName) || 0) + quantity);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

export function timedActivityKpi(rows) {
  const timedRows = rows.filter((row) => Number(row.minutes) > 0);
  if (!timedRows.length) return { daily: 0, hourly: 0 };
  const quantity = timedRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const days = new Set(timedRows.map((row) => row.date).filter(Boolean)).size;
  const averageHourly = timedRows.reduce(
    (sum, row) => sum + (Number(row.quantity || 0) / (Number(row.minutes) / 60)),
    0
  ) / timedRows.length;
  return {
    daily: days ? Math.round(quantity / days) : 0,
    hourly: Number.isFinite(averageHourly) ? Math.round(averageHourly) : 0
  };
}

export function taskVolumeRows(tasks, activities) {
  return tasks.map((task) => ({
    id: Number(task.id),
    name: task.shortName || task.name,
    type: task.type,
    value: activities.filter((row) => Number(row.taskId) === Number(task.id)).length
  })).filter((item) => item.value > 0).sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

export function workerProductionRows(workers, activities, selectedWorkerIds = []) {
  return workers.map((worker) => {
    const rows = activities.filter((row) => Number(row.workerId) === Number(worker.id));
    return {
      id: Number(worker.id),
      name: worker.name,
      workerName: worker.name,
      records: rows.length,
      value: rows.reduce((sum, row) => sum + Number(row.points || 0), 0)
    };
  }).filter((item) => item.records > 0 || selectedWorkerIds.includes(item.id));
}
