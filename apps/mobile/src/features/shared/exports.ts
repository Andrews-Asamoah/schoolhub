import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { sessionStore } from "@/lib/session";

type Cell = string | number;
let sequence = 0;
const escape = (value: Cell) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

export function printableTable(
  title: string,
  headers: string[],
  rows: Cell[][],
) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:12px sans-serif;color:#111}table{width:100%;border-collapse:collapse}
    th,td{padding:6px;border:1px solid #777;text-align:left}thead{display:table-header-group}
    tr{break-inside:avoid}</style></head><body><h1>${escape(title)}</h1>
    <table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></body></html>`;
}

export async function outputTable(
  title: string,
  headers: string[],
  rows: Cell[][],
  format: "print" | "pdf" | "xlsx",
) {
  const revision = sessionStore.getRevision();
  if (format === "print") {
    await Print.printAsync({ html: printableTable(title, headers, rows) });
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable on this device.");
  let file: File | undefined;
  try {
    if (format === "pdf") {
      const result = await Print.printToFileAsync({
        html: printableTable(title, headers, rows),
      });
      file = new File(result.uri);
    } else {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet(
        title.slice(0, 31).replace(/[\\/*?:\[\]]/g, " "),
      );
      sheet.addRow(headers).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.addRows(rows);
      for (const column of sheet.columns) column.width = 22;
      const buffer = await workbook.xlsx.writeBuffer();
      file = new File(
        Paths.cache,
        `schoolhub-export-${Date.now()}-${++sequence}.xlsx`,
      );
      await file.write(new Uint8Array(buffer));
    }
    if (sessionStore.getRevision() !== revision)
      throw new Error("The active school session changed.");
    await Sharing.shareAsync(file.uri, {
      dialogTitle: title,
      mimeType:
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } finally {
    if (file?.exists) await file.delete();
  }
}
