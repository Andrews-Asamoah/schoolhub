import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readSalaryWorkbook } from "./payroll-salary-workbook";

async function fileWithRows(rows: ExcelJS.CellValue[][]) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Salary import").addRows([
    ["Type", "Employee ID", "Employee", "Monthly salary (GHS)"],
    ...rows,
  ]);
  return new File([await workbook.xlsx.writeBuffer()], "salaries.xlsx");
}

describe("payroll salary workbook", () => {
  it("preserves leading zeros, skips blank salaries and keeps an explicit zero", async () => {
    const file = await fileWithRows([
      ["STAFF", "00017", "Staff A", null],
      ["STAFF", "00180", "Staff B", 0],
      ["TEACHER", "00180", "Teacher A", 1250.75],
    ]);
    await expect(readSalaryWorkbook(file)).resolves.toEqual([
      { row: 3, kind: "STAFF", employeeCode: "00180", monthlySalary: "0" },
      { row: 4, kind: "TEACHER", employeeCode: "00180", monthlySalary: "1250.75" },
    ]);
  });

  it("rejects numeric employee IDs and formula salaries", async () => {
    await expect(readSalaryWorkbook(await fileWithRows([["STAFF", 17, "Staff A", 1]])))
      .rejects.toThrow(/Row 2.*stored as text/);
    await expect(readSalaryWorkbook(await fileWithRows([["STAFF", "17", "Staff A", { formula: "1+1", result: 2 }]])))
      .rejects.toThrow(/Row 2.*formula/);
  });
});
