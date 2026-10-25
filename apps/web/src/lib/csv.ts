/**
 * Minimal, safe CSV writer. Cells that start with = + - @ (or a tab/CR) are
 * prefixed with an apostrophe so spreadsheet apps cannot run them as formulas
 * (CSV injection), which matters because audit data contains user-typed text.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (raw: string | number | null | undefined) => {
    let value = raw === null || raw === undefined ? "" : String(raw);
    if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob(["\ufeff", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
