import { isValidElement, type ReactNode } from "react";

/** One export-ready table: plain text/number cells only. */
export interface ExportTable {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
}

/** Text found inside a rendered cell, used when a column has no explicit value(). */
export function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return node.map(nodeToText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode }).children);
  return "";
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Stops spreadsheet apps from running cells that start with = + - @ as formulas. */
function safeText(value: string | number | null): string | number {
  if (value == null) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

export function exportFileName(title: string, extension: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(table: ExportTable) {
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [table.headers, ...table.rows].map((row) => row.map((cell) => quote(safeText(cell))).join(","));
  // BOM so Excel reads UTF-8 (e.g. the cedi sign) correctly.
  download(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), exportFileName(table.title, "csv"));
}

export async function exportXlsx(table: ExportTable) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " ") || "Sheet1", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(table.headers);
  for (const row of table.rows) sheet.addRow(row.map(safeText));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column, index) => {
    const longest = Math.max(table.headers[index]?.length ?? 0, ...table.rows.map((row) => String(row[index] ?? "").length));
    column.width = Math.min(Math.max(longest + 2, 10), 50);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    exportFileName(table.title, "xlsx"),
  );
}

export async function exportPdf(table: ExportTable) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: table.headers.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(table.title, 40, 40);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, 54);
  autoTable(doc, {
    startY: 66,
    head: [table.headers],
    body: table.rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [79, 70, 229] },
    margin: { left: 40, right: 40 },
  });
  doc.save(exportFileName(table.title, "pdf"));
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Prints just the table (always light, ink-friendly) rather than the whole app screen. */
export function printTable(table: ExportTable) {
  const head = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell == null ? "" : String(cell))}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:24px}
  h1{font-size:16px;margin:0 0 4px} p{font-size:10px;color:#64748b;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  thead{display:table-header-group} tr{page-break-inside:avoid}
</style></head><body><h1>${escapeHtml(table.title)}</h1><p>Printed ${escapeHtml(new Date().toLocaleString())}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  const win = frame.contentWindow;
  if (!win) return cleanup();
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
  }, 100);
}
