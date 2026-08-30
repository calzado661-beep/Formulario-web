// Exportador de CSV compartido por las tablas de historial (líder de equipo y
// registro normal): mismas comillas/escapes y mismo BOM para que Excel abra
// el archivo directo, sin tener que reimplementarlo en cada pantalla.

export function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /["\n,;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// `rows` son objetos planos ya formateados para pantalla; `columns` fija el
// orden de columnas del archivo.
export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map(csvCell).join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  });
  // BOM inicial para que Excel detecte UTF-8 y no rompa tildes/enies.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
