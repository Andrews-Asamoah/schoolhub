import { BadRequestException } from "@nestjs/common";
import { parse as parseCsvText } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";

export interface ParsedSheet {
  headers: string[];
  /** Data rows with their position in the file, so messages can say "row 14". Blank rows are dropped. */
  records: { rowNumber: number; cells: string[] }[];
}

export type ImportFormat = "csv" | "xlsx";

/**
 * Works out the file type from its name and its first bytes rather than trusting
 * the upload's declared type. Old .xls files are refused with a clear instruction.
 */
export function detectFormat(buffer: Buffer, filename: string): ImportFormat {
  const name = filename.toLowerCase();
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  const isOleXls = buffer.length > 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;

  if (isOleXls || name.endsWith(".xls")) {
    throw new BadRequestException("Old Excel files (.xls) aren't supported. In Excel choose Save As and pick .xlsx or .csv, then upload that.");
  }
  if (name.endsWith(".xlsx")) {
    if (!isZip) throw new BadRequestException("This doesn't look like a real Excel (.xlsx) file. Open it in Excel and save it again.");
    return "xlsx";
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    if (buffer.subarray(0, 4096).includes(0)) throw new BadRequestException("This doesn't look like a text CSV file.");
    return "csv";
  }
  throw new BadRequestException("Upload a .csv or .xlsx file.");
}

/** Excel in some regions saves CSV with semicolons or tabs, so look at the header line. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  const [best, count] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]!;
  return count === 0 ? "," : (best as "," | ";" | "\t");
}

function toSheet(rows: { rowNumber: number; cells: string[] }[]): ParsedSheet {
  const headerIndex = rows.findIndex((row) => row.cells.some((cell) => cell.trim() !== ""));
  if (headerIndex === -1) throw new BadRequestException("The file is empty.");
  const header = rows[headerIndex]!;
  const records = rows.slice(headerIndex + 1).filter((row) => row.cells.some((cell) => cell.trim() !== ""));
  if (records.length === 0) throw new BadRequestException("The file has a header row but no students.");
  if (records.length > STUDENT_IMPORT_LIMITS.maxRows) {
    throw new BadRequestException(
      `This file has ${records.length} students. The limit is ${STUDENT_IMPORT_LIMITS.maxRows} per upload, so please split it into smaller files.`,
    );
  }
  return { headers: header.cells.map((cell) => cell.trim()), records };
}

export function parseCsv(buffer: Buffer): ParsedSheet {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let table: string[][];
  try {
    table = parseCsvText(text, {
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      skip_empty_lines: false,
      trim: false,
    }) as string[][];
  } catch {
    throw new BadRequestException("The CSV file couldn't be read. Check that quotation marks are paired, or open it in Excel and save it again.");
  }
  return toSheet(table.map((cells, index) => ({ rowNumber: index + 1, cells: cells.map((cell) => String(cell ?? "")) })));
}

/** A cell's text however Excel stored it: text, number, date, rich text, formula result or link. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return cellText(value.text as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return "";
}

const NON_DATA_SHEETS = /^(instructions?|example|examples|notes|lists?|read ?me)$/i;

export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException("The Excel file couldn't be read. Open it in Excel and save it again as .xlsx.");
  }
  const sheets = workbook.worksheets.filter((sheet) => sheet.state === "visible");
  const sheet = sheets.find((item) => /^students?$/i.test(item.name)) ?? sheets.find((item) => !NON_DATA_SHEETS.test(item.name)) ?? sheets[0];
  if (!sheet) throw new BadRequestException("The Excel file has no worksheets.");
  if (sheet.rowCount > STUDENT_IMPORT_LIMITS.maxRows * 5) {
    throw new BadRequestException(`This sheet has ${sheet.rowCount} rows, which is far more than the ${STUDENT_IMPORT_LIMITS.maxRows}-student limit.`);
  }

  const width = Math.min(sheet.columnCount, 60);
  const rows: { rowNumber: number; cells: string[] }[] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column++) cells.push(cellText(row.getCell(column).value));
    rows.push({ rowNumber, cells });
  });
  return toSheet(rows);
}

export async function parseUpload(buffer: Buffer, filename: string): Promise<{ format: ImportFormat; sheet: ParsedSheet }> {
  if (buffer.length === 0) throw new BadRequestException("The file is empty.");
  if (buffer.length > STUDENT_IMPORT_LIMITS.maxFileBytes) {
    throw new BadRequestException(`The file is larger than ${Math.round(STUDENT_IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB.`);
  }
  const format = detectFormat(buffer, filename);
  return { format, sheet: format === "csv" ? parseCsv(buffer) : await parseXlsx(buffer) };
}
