import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { exportXlsx } from "./table-export";
import { downloadXlsx } from "./download";
vi.mock("./download", () => ({ downloadXlsx: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
async function exportedSheet() {
  const buffer = vi.mocked(downloadXlsx).mock.calls[0]![0];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0]!;
}
describe("spreadsheet export cell types", () => {
  it("preserves leading zeroes and long identifiers without treating Candidate as a date", async () => {
    await exportXlsx({ title: "Directory", headers: ["Admission no.", "Phone", "Candidate ID", "Reference", "Value"],
      rows: [["0042", "0241234567", "0042", "12345678901234567890", "0017"]] });
    const sheet = await exportedSheet();
    expect(sheet.getRow(2).values).toEqual([undefined, "0042", "0241234567", "0042", "12345678901234567890", "0017"]);
  });
  it("keeps monetary amounts and numeric values usable in spreadsheets", async () => {
    await exportXlsx({ title: "Payments", headers: ["Amount", "Count", "Score", "Paid at"],
      columnTypes: [undefined, undefined, "number", "date"], rows: [["125.50", 2, "90", "2026-11-07"]] });
    const sheet = await exportedSheet();
    expect(sheet.getCell("A2").value).toBe(125.5);
    expect(sheet.getCell("B2").value).toBe(2);
    expect(sheet.getCell("C2").value).toBe(90);
    expect(sheet.getCell("D2").value).toEqual(new Date("2026-11-07"));
  });
  it("respects explicit text types even with misleading headers and retains formula escaping", async () => {
    await exportXlsx({ title: "References", headers: ["Amount", "Created", "Name"], columnTypes: ["text", "text", "text"],
      rows: [["0042", "0042", "=HYPERLINK(\"https://example.test\")"]] });
    const sheet = await exportedSheet();
    expect(sheet.getCell("A2").value).toBe("0042");
    expect(sheet.getCell("B2").value).toBe("0042");
    expect(sheet.getCell("C2").value).toBe("'=HYPERLINK(\"https://example.test\")");
  });
});
