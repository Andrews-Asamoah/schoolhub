import { BadRequestException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { detectDelimiter, detectFormat } from "../students/import/import-parse.js";
import type { StatementRow } from "./statement-import.js";

export type StatementMapping = { date: string; description: string; reference?: string; amount?: string; debit?: string; credit?: string };
/** Explicit column names and ISO dates avoid ambiguous regional date/number coercion. */
export async function decodeStatement(buffer: Buffer, filename: string, mapping: StatementMapping): Promise<StatementRow[]> {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new BadRequestException("Statement files must be 1 byte to 5 MB.");
  const format = detectFormat(buffer, filename);
  let records: string[][];
  if (format === "csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
      records = parse(text, { delimiter: detectDelimiter(text), skip_empty_lines: true, max_record_size: 20000, to: 5002 }) as string[][];
    } catch { throw new BadRequestException("Invalid UTF-8 CSV statement."); }
  } else {
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer as never); } catch { throw new BadRequestException("Invalid XLSX statement."); }
    const sheets = workbook.worksheets.filter(sheet => sheet.state === "visible");
    if (sheets.length !== 1) throw new BadRequestException("Upload one visible statement worksheet.");
    const sheet = sheets[0]!;
    if (sheet.rowCount > 5001 || sheet.columnCount > 60) throw new BadRequestException("Statement exceeds 5000 rows or 60 columns.");
    records = [];
    sheet.eachRow(row => {
      const cells: string[] = [];
      for (let col = 1; col <= sheet.columnCount; col++) {
        const value = row.getCell(col).value;
        if (value instanceof Date) cells.push(value.toISOString().slice(0, 10));
        else if (value === null || value === undefined) cells.push("");
        else if (typeof value === "string" || typeof value === "number") cells.push(String(value));
        else throw new BadRequestException("Statement formulas, hyperlinks and rich-text cells are unsupported; export values only.");
      }
      records.push(cells);
    });
  }
  if (records.length < 1 || records.length > 5001) throw new BadRequestException("Statements require a header and at most 5000 data rows.");
  const headers = records.shift()!.map(cell => cell.trim());
  if (headers.length > 60 || new Set(headers).size !== headers.length) throw new BadRequestException("Statement headers must be unique, with at most 60 columns.");
  if (Boolean(mapping.amount) === Boolean(mapping.debit || mapping.credit) || (!mapping.amount && (!mapping.debit || !mapping.credit))) throw new BadRequestException("Map either a signed amount or both debit and credit columns.");
  const names = [mapping.date, mapping.description, mapping.reference, mapping.amount, mapping.debit, mapping.credit].filter((name): name is string => Boolean(name));
  if (new Set(names).size !== names.length || names.some(name => !headers.includes(name))) throw new BadRequestException("Mapped columns must exist and be distinct.");
  const cell = (row: string[], name?: string) => name ? (row[headers.indexOf(name)] ?? "").trim() : "";
  const unsigned = (value: string) => {
    if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException("Debit/credit amounts must be non-negative decimals; leave unused cells blank.");
    return value;
  };
  return records.map(row => {
    let amount = cell(row, mapping.amount);
    if (!mapping.amount) {
      const debit = cell(row, mapping.debit), credit = cell(row, mapping.credit);
      if (Boolean(debit) === Boolean(credit)) throw new BadRequestException("Each row must have exactly one debit or credit amount; leave the other blank.");
      amount = credit ? unsigned(credit) : "-" + unsigned(debit);
    }
    return { date: cell(row, mapping.date), description: cell(row, mapping.description), reference: cell(row, mapping.reference), amount };
  });
}
