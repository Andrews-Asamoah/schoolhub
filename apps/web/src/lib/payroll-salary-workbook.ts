import { downloadXlsx } from "@/lib/download";

type Kind = "TEACHER" | "STAFF";
export type SalaryWorkbookEmployee = { type: Kind; employeeCode: string; name: string };
export type SalaryWorkbookRow = { row: number; kind: Kind; employeeCode: string; monthlySalary: string };

const sheetName = "Salary import";
const headings = ["Type", "Employee ID", "Employee", "Monthly salary (GHS)"];

export async function downloadSalaryWorkbook(employees: SalaryWorkbookEmployee[]) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [{ width: 15 }, { width: 25 }, { width: 36 }, { width: 24 }];
  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(4).numFmt = "#,##0.00";
  sheet.addRow(headings).font = { bold: true };
  sheet.addRows(employees.map(employee => [employee.type, employee.employeeCode, employee.name, null]));
  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 100;
  instructions.addRows([
    ["Fill in the monthly base salary for each employee to update, in Ghana cedis."],
    ["Leave the salary blank to skip that employee. Enter 0 only to explicitly set the salary to zero."],
    ["Keep employee IDs as text to preserve leading zeros. Paste amounts as values."],
    ["Import up to 250 filled salary rows at a time. Review the preview before saving."],
  ]);
  downloadXlsx(await workbook.xlsx.writeBuffer(), "schoolhub-salary-import.xlsx");
}

export async function readSalaryWorkbook(file: File): Promise<SalaryWorkbookRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 2 * 1024 * 1024) {
    throw new Error("Choose an Excel .xlsx file under 2 MB.");
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("This workbook could not be read. Re-save it as .xlsx and try again.");
  }
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet || headings.some((heading, index) => sheet.getRow(1).getCell(index + 1).value !== heading)) {
    throw new Error("The Salary import worksheet or column headings are missing. Use the provided template.");
  }
  if (sheet.rowCount > 5001) throw new Error("Keep the worksheet to 5,000 employee rows or fewer.");
  const rows: SalaryWorkbookRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const amount = row.getCell(4).value;
    if (amount == null || (typeof amount === "string" && !amount.trim())) return;
    const kind = String(row.getCell(1).value ?? "").trim().toUpperCase();
    if (kind !== "TEACHER" && kind !== "STAFF") {
      throw new Error(`Row ${rowNumber} needs TEACHER or STAFF in the Type column.`);
    }
    const identifier = row.getCell(2).value;
    if (typeof identifier !== "string" || !identifier.trim() || identifier.trim().length > 100) {
      throw new Error(`Row ${rowNumber} needs a valid Employee ID stored as text.`);
    }
    const text = typeof amount === "string" || typeof amount === "number" ? String(amount).trim() : "";
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text) || Number(text) > 10_000_000) {
      throw new Error(`Row ${rowNumber} needs a salary from 0 to 10,000,000 with no more than two decimal places. Paste formula results as values.`);
    }
    rows.push({ row: rowNumber, kind, employeeCode: identifier.trim(), monthlySalary: text });
  });
  if (!rows.length) throw new Error("Enter at least one monthly salary in the workbook.");
  if (rows.length > 250) throw new Error("Import a maximum of 250 filled salary rows per workbook.");
  return rows;
}
