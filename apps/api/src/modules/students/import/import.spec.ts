import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { STUDENT_IMPORT_LIMITS } from "@schoolhub/shared";
import { cellText, detectDelimiter, detectFormat, parseCsv, parseUpload, parseXlsx } from "./import-parse.js";
import { cleanText, mapHeaders, normalizeHeader, normalizePhone, normalizeRecord, parseDate, parseGender, parseRelationship } from "./import-normalize.js";
import { evaluateRow, newSeen, remember, resolveByName, studentKey, type ImportContext } from "./import-validate.js";
import type { StudentImportField } from "@schoolhub/shared";

const csv = (text: string) => Buffer.from(text, "utf8");

describe("file detection and CSV reading", () => {
  it("detects the format from name and content, not the declared type", () => {
    expect(detectFormat(csv("a,b\n1,2"), "list.CSV")).toBe("csv");
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "list.xlsx")).toBe("xlsx");
    expect(() => detectFormat(csv("not a zip"), "list.xlsx")).toThrow(/real Excel/);
    expect(() => detectFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), "old.xls")).toThrow(/\.xls/);
    expect(() => detectFormat(csv("x"), "photo.png")).toThrow(/\.csv or \.xlsx/);
    expect(() => detectFormat(Buffer.from([1, 2, 0, 3]), "bad.csv")).toThrow(/text CSV/);
  });
  it("reads quotes, embedded commas and new lines, CRLF, BOM and keeps row numbers", () => {
    const sheet = parseCsv(csv('\ufeffFirst name,Last name,Address\r\nAma,"Mensah, Jr","12 Palm St\nAccra"\r\n\r\nKofi,Asare,Kumasi\r\n'));
    expect(sheet.headers).toEqual(["First name", "Last name", "Address"]);
    expect(sheet.records).toEqual([
      { rowNumber: 2, cells: ["Ama", "Mensah, Jr", "12 Palm St\nAccra"] },
      { rowNumber: 4, cells: ["Kofi", "Asare", "Kumasi"] },     // the blank line 3 is skipped but numbering is the file's
    ]);
  });
  it("detects semicolon and tab separated files", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"a,b";c')).toBe(";");
    expect(parseCsv(csv("First name;Last name\nAma;Mensah")).records[0]!.cells).toEqual(["Ama", "Mensah"]);
  });
  it("rejects empty files, header-only files and files over the row limit", () => {
    expect(() => parseCsv(csv("\n\n"))).toThrow(/empty/);
    expect(() => parseCsv(csv("First name,Last name"))).toThrow(/no students/);
    const big = "First name\n" + Array.from({ length: STUDENT_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `S${i}`).join("\n");
    expect(() => parseCsv(csv(big))).toThrow(/limit is 1000/);
  });
  it("rejects oversized and empty uploads before parsing", async () => {
    await expect(parseUpload(Buffer.alloc(0), "a.csv")).rejects.toThrow(/empty/);
    await expect(parseUpload(Buffer.alloc(STUDENT_IMPORT_LIMITS.maxFileBytes + 1, 97), "a.csv")).rejects.toThrow(/larger than/);
  });
});

describe("Excel reading", () => {
  async function workbook(build: (wb: ExcelJS.Workbook) => void) {
    const wb = new ExcelJS.Workbook();
    build(wb);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  it("reads the Students sheet (not Instructions), dates, numbers and rich text", async () => {
    const buffer = await workbook((wb) => {
      wb.addWorksheet("Instructions").addRow(["Read me"]);
      const sheet = wb.addWorksheet("Students");
      sheet.addRow(["First name", "Date of birth", "Guardian phone"]);
      sheet.addRow([{ richText: [{ text: "A" }, { text: "ma" }] }, new Date(Date.UTC(2012, 11, 25)), 244123456]);
      sheet.addRow([null, null, null]);
      sheet.addRow(["Kofi", "01/02/2011", "0244000111"]);
    });
    const parsed = await parseUpload(buffer, "students.xlsx");
    expect(parsed.format).toBe("xlsx");
    expect(parsed.sheet.headers).toEqual(["First name", "Date of birth", "Guardian phone"]);
    expect(parsed.sheet.records.map((r) => r.cells)).toEqual([["Ama", "2012-12-25", "244123456"], ["Kofi", "01/02/2011", "0244000111"]]);
    expect(parsed.sheet.records.map((r) => r.rowNumber)).toEqual([2, 4]);
  });
  it("skips Instructions and Example sheets when there is no Students sheet", async () => {
    const buffer = await workbook((wb) => {
      wb.addWorksheet("Example").addRow(["x"]);
      const s = wb.addWorksheet("Sheet1"); s.addRow(["First name"]); s.addRow(["Ama"]);
    });
    expect((await parseXlsx(buffer)).records[0]!.cells[0]).toBe("Ama");
  });
  it("reads formula results and links as text, never running anything", () => {
    expect(cellText({ formula: "A1+1", result: 5 } as ExcelJS.CellValue)).toBe("5");
    expect(cellText({ text: "site", hyperlink: "https://x.test" } as ExcelJS.CellValue)).toBe("site");
    expect(cellText({ error: "#N/A" } as ExcelJS.CellValue)).toBe("");
  });
  it("gives a clear message for a corrupt workbook", async () => {
    await expect(parseXlsx(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toThrow(/couldn't be read/);
  });
});

describe("header matching", () => {
  it("matches headings however they are typed, with required stars and aliases", () => {
    expect(normalizeHeader("First Name*")).toBe("firstname");
    const m = mapHeaders(["Surname", "FIRST NAME *", "Sex", "DOB", "Class", "Guardian Phone", "Favourite colour", "Parent 1 Email"]);
    expect(m.missing).toEqual([]);
    expect(m.recognized.map((r) => r.field)).toEqual(["lastName", "firstName", "gender", "dateOfBirth", "className", "g1Phone", "g1Email"]);
    expect(m.ignored).toEqual(["Favourite colour"]);
  });
  it("lists missing required columns and repeated headings", () => {
    const m = mapHeaders(["First name", "First name", "Class"]);
    expect(m.missing).toEqual(["Last name", "Gender", "Date of birth"]);
    expect(m.duplicated).toEqual(["First name"]);
  });
});

describe("dates", () => {
  const iso = (s: string) => parseDate(s);
  it("reads day-first dates and never swaps day and month", () => {
    expect(iso("03/04/2012")).toEqual({ iso: "2012-04-03" });          // 3 April, not 4 March
    expect(iso("25-12-2012")).toEqual({ iso: "2012-12-25" });
    expect(iso("5.1.2013")).toEqual({ iso: "2013-01-05" });
    expect(iso("2012-12-25")).toEqual({ iso: "2012-12-25" });
    expect(iso("2012/1/5")).toEqual({ iso: "2012-01-05" });
    expect(iso("2012-12-25T00:00:00.000Z")).toEqual({ iso: "2012-12-25" });
  });
  it("reads written months and Excel date numbers", () => {
    expect(iso("25 Dec 2012")).toEqual({ iso: "2012-12-25" });
    expect(iso("3rd April, 2012".replace(",", ""))).toEqual({ iso: "2012-04-03" });
    expect(iso("December 25, 2012")).toEqual({ iso: "2012-12-25" });
    expect(iso("41268")).toEqual({ iso: "2012-12-25" });
  });
  it("rejects impossible, two-digit-year and unreadable dates", () => {
    expect(iso("31/02/2012")).toMatchObject({ error: expect.stringContaining("real date") });
    expect(iso("25/12/12")).toMatchObject({ error: expect.stringContaining("four digits") });
    expect(iso("13/13/2012")).toHaveProperty("error");
    expect(iso("yesterday")).toHaveProperty("error");
    expect(iso("29/02/2011")).toHaveProperty("error");
    expect(iso("29/02/2012")).toEqual({ iso: "2012-02-29" });
  });
});

describe("value parsers", () => {
  it("reads genders, relationships and tidies text", () => {
    expect([parseGender("M"), parseGender(" female "), parseGender("Boy"), parseGender("other"), parseGender("x")]).toEqual(["MALE", "FEMALE", "MALE", "OTHER", null]);
    expect([parseRelationship("Mum"), parseRelationship("FATHER"), parseRelationship("Aunty"), parseRelationship("neighbour")]).toEqual(["MOTHER", "FATHER", "RELATIVE", null]);
    expect(cleanText("  Ama\u200b   Serwaa\t\n ")).toBe("Ama Serwaa");
  });
  it("normalises Ghana phone numbers, including ones Excel stripped the zero from", () => {
    expect(normalizePhone("+233 24 412 3456").value).toBe("0244123456");
    expect(normalizePhone("233244123456").value).toBe("0244123456");
    expect(normalizePhone("024-412-3456").value).toBe("0244123456");
    expect(normalizePhone("244123456").value).toBe("0244123456");
    expect(normalizePhone("+44 7700 900123").value).toBe("+447700900123");
    expect(normalizePhone("abc").warning).toMatch(/doesn't look like a phone/);
    expect(normalizePhone("").value).toBe("");
  });
});

function record(values: Partial<Record<StudentImportField, string>>) {
  return (field: StudentImportField) => values[field] ?? "";
}
const NOW = new Date("2026-10-23T00:00:00Z");
const good = { firstName: "Akosua", lastName: "Mensah", gender: "Female", dateOfBirth: "25/12/2012" };

describe("normalizeRecord", () => {
  it("cleans a good row", () => {
    const out = normalizeRecord(record({ ...good, className: "JHS 1A", g1FirstName: "Kofi", g1LastName: "Mensah", g1Relationship: "dad", g1Phone: "244123456", g1Email: "KOFI@x.com" }), 5, NOW);
    expect(out.errors).toEqual([]);
    expect(out.row).toMatchObject({ rowNumber: 5, firstName: "Akosua", gender: "FEMALE", dateOfBirth: "2012-12-25", className: "JHS 1A" });
    expect(out.row!.guardians).toEqual([{ firstName: "Kofi", lastName: "Mensah", relationshipType: "FATHER", phone: "0244123456", email: "kofi@x.com" }]);
  });
  it("reports every problem in one pass", () => {
    const out = normalizeRecord(record({ firstName: "", lastName: "=cmd", gender: "?", dateOfBirth: "31/02/2012" }), 2, NOW);
    expect(out.row).toBeNull();
    expect(out.errors).toEqual(expect.arrayContaining([
      "First name is missing.", "Last name can't start with = + or @.", expect.stringContaining('Gender "?"'), expect.stringContaining("Date of birth:"),
    ]));
  });
  it("does not default a missing gender", () => {
    expect(normalizeRecord(record({ ...good, gender: "" }), 2, NOW).errors).toContain("Gender is missing.");
  });
  it("flags impossible and suspicious ages", () => {
    expect(normalizeRecord(record({ ...good, dateOfBirth: "01/01/2030" }), 2, NOW).errors).toContain("Date of birth is in the future.");
    expect(normalizeRecord(record({ ...good, dateOfBirth: "01/01/1950" }), 2, NOW).errors.join()).toMatch(/age of 76/);
    const young = normalizeRecord(record({ ...good, dateOfBirth: "01/01/2026" }), 2, NOW);
    expect(young.row).not.toBeNull();
    expect(young.warnings.join()).toMatch(/age of 0/);
  });
  it("checks the admission date", () => {
    expect(normalizeRecord(record({ ...good, admissionDate: "01/01/2010" }), 2, NOW).errors).toContain("Admission date is before the date of birth.");
    expect(normalizeRecord(record({ ...good, admissionDate: "01/01/2031" }), 2, NOW).errors).toContain("Admission date is in the future.");
    expect(normalizeRecord(record({ ...good, admissionDate: "12/09/2022" }), 2, NOW).row?.admissionDate).toBe("2022-09-12");
  });
  it("warns, and does not fail the student, when a guardian is incomplete", () => {
    const out = normalizeRecord(record({ ...good, g1FirstName: "Kofi", g1LastName: "Mensah", g2FirstName: "Ama", g2LastName: "Mensah", g2Phone: "0244000111", g2Relationship: "neighbour" }), 2, NOW);
    expect(out.row!.guardians).toEqual([{ firstName: "Ama", lastName: "Mensah", relationshipType: "OTHER", phone: "0244000111" }]);
    expect(out.warnings.join("|")).toMatch(/Guardian 1 \(Kofi Mensah\) was not saved because it needs a phone number/);
    expect(out.warnings.join("|")).toMatch(/Guardian 2 relationship "neighbour"/);
  });
  it("warns about an unusual blood group and bad guardian email instead of failing", () => {
    const out = normalizeRecord(record({ ...good, bloodGroup: "Z+", g1FirstName: "K", g1LastName: "M", g1Phone: "0244000111", g1Email: "nope" }), 2, NOW);
    expect(out.row).toMatchObject({ bloodGroup: undefined });
    expect(out.row!.guardians[0]).not.toHaveProperty("email");
    expect(out.warnings).toHaveLength(2);
  });
  it("rejects an admission number with odd characters", () => {
    const out = normalizeRecord(record({ ...good, admissionNumber: "<script>" }), 2, NOW);
    expect(out.row).toBeNull();
    expect(out.errors.join()).toMatch(/Admission numbers use letters/);
  });
});

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  classes: [{ id: "c1", name: "JHS 1A" }, { id: "c2", name: "JHS 1B" }, { id: "c3", name: "Class 6" }],
  houses: [{ id: "h1", name: "Red House" }],
  hasCurrentTerm: true,
  admissionNumbers: new Set(["adm-001"]),
  studentKeys: new Set([studentKey("Old", "Pupil", "2010-01-01")]),
  ...over,
});
const row = (over: Record<string, unknown> = {}) => normalizeRecord(record({ ...good, ...(over as object) }), 2, NOW).row!;

describe("evaluateRow", () => {
  it("matches classes loosely and resolves ids", () => {
    expect(evaluateRow(row({ className: "jhs-1a" }), ctx())).toMatchObject({ status: "ready", classId: "c1" });
    expect(evaluateRow(row({ className: "JHS1B" }), ctx()).classId).toBe("c2");
    expect(evaluateRow(row({ houseName: "red house" }), ctx()).houseId).toBe("h1");
  });
  it("suggests the closest class for a typo and fails an unknown one", () => {
    expect(evaluateRow(row({ className: "JHS 1C" }), ctx()).errors[0]).toMatch(/Did you mean JHS 1[AB]\?/);
    expect(evaluateRow(row({ className: "Basement" }), ctx()).errors[0]).toMatch(/Create it first/);
    expect(resolveByName(ctx().classes, "JHS 1AA")).toEqual({ suggestion: "JHS 1A" });
  });
  it("reports two classes that match the same name as ambiguous", () => {
    const both = ctx({ classes: [{ id: "a", name: "JHS 1A" }, { id: "b", name: "JHS-1A" }] });
    expect(evaluateRow(row({ className: "JHS 1A" }), both).errors[0]).toMatch(/more than one class/);
  });
  it("needs a current term only when a class is given", () => {
    expect(evaluateRow(row({ className: "JHS 1A" }), ctx({ hasCurrentTerm: false })).errors[0]).toMatch(/current academic year and term/);
    expect(evaluateRow(row(), ctx({ hasCurrentTerm: false })).status).toBe("ready");
  });
  it("treats students the school already has as duplicates, not errors", () => {
    expect(evaluateRow(row({ admissionNumber: "ADM-001" }), ctx()).status).toBe("duplicate");
    expect(evaluateRow(row({ firstName: "Old", lastName: "Pupil", dateOfBirth: "01/01/2010" }), ctx()).status).toBe("duplicate");
    expect(evaluateRow(row({ firstName: "OLD", lastName: "pupil", dateOfBirth: "1 Jan 2010", className: "Nowhere" }), ctx()).status).toBe("duplicate");
  });
  it("catches a student listed twice in the same file", () => {
    const seen = newSeen();
    const first = row({ rowNumber: 2 });
    expect(evaluateRow(first, ctx(), [], seen).status).toBe("ready");
    const again = { ...row(), rowNumber: 9 };
    expect(evaluateRow(again, ctx(), [], seen).errors).toEqual(["Same name and date of birth as row 2."]);
    const s2 = newSeen();
    evaluateRow({ ...row({ admissionNumber: "X1", firstName: "A" }), rowNumber: 3 }, ctx(), [], s2);
    expect(evaluateRow({ ...row({ admissionNumber: "x1", firstName: "B" }), rowNumber: 4 }, ctx(), [], s2).errors).toEqual(["Same admission number as row 3."]);
  });
  it("carries warnings through and remembers created students", () => {
    expect(evaluateRow(row(), ctx(), ["Check the phone number."]).status).toBe("warning");
    const c = ctx();
    const r = row({ admissionNumber: "NEW-1" });
    remember(c, r);
    expect(evaluateRow(r, c).status).toBe("duplicate");
  });
});
