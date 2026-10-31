import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decodeStatement } from "./statement-decoder.js";
const mapping = { date: "Date", description: "Description", amount: "Amount" };
describe("bank statement decoding", () => {
  it("decodes quoted CSV using explicit columns", async () => {
    expect(await decodeStatement(Buffer.from('Date,Description,Amount\n2026-09-01,"Fees, class A",10.50'), "bank.csv", mapping)).toEqual([{ date: "2026-09-01", description: "Fees, class A", reference: "", amount: "10.50" }]);
  });
  it("maps debits to withdrawals and credits to deposits", async () => {
    const rows = await decodeStatement(Buffer.from('Date,Description,Debit,Credit\n2026-09-01,Charge,2.50,\n2026-09-02,Fees,,100'), "bank.csv", { date: "Date", description: "Description", debit: "Debit", credit: "Credit" });
    expect(rows.map(row => row.amount)).toEqual(["-2.50", "100"]);
  });
  it("rejects ambiguous mappings and duplicate headers", async () => {
    await expect(decodeStatement(Buffer.from('Date,Date,Amount\nx,x,1'), "a.csv", mapping)).rejects.toThrow();
    await expect(decodeStatement(Buffer.from('Date,Description,Amount\nx,x,1'), "a.csv", { ...mapping, amount: "Missing" })).rejects.toThrow();
  });
  it("decodes XLSX values and rejects formulas", async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Statement");
    sheet.addRow(["Date", "Description", "Amount"]); sheet.addRow(["2026-09-01", "Fees", 10.5]);
    expect((await decodeStatement(Buffer.from(await book.xlsx.writeBuffer()), "a.xlsx", mapping))[0]!.amount).toBe("10.5");
    sheet.getCell("C2").value = { formula: "5+5", result: 10 };
    await expect(decodeStatement(Buffer.from(await book.xlsx.writeBuffer()), "a.xlsx", mapping)).rejects.toThrow(/formulas/);
  });
});
