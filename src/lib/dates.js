const LIMA_TIME_ZONE = "America/Lima";

function partsFor(date, timeZone = LIMA_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function todayLimaISO() {
  const parts = partsFor(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeLima(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function birthdayMaxISO() {
  const now = new Date();
  return `${now.getFullYear() - 1}-12-31`;
}

export function nowLimaISODateTime() {
  return new Date().toISOString();
}
