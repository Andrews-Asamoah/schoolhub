import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ blob: null as Blob | null, name: "" }));
vi.mock("@/lib/download", () => ({
  downloadBlob: (blob: Blob, name: string) => {
    saved.blob = blob;
    saved.name = name;
  },
  downloadXlsx: (buffer: BlobPart, name: string) => {
    saved.blob = new Blob([buffer]);
    saved.name = name;
  },
}));

import { downloadExcelTemplate } from "@/components/bulk-import/import-templates";
import { buildMarksTemplate, type MarksImportSheet } from "./assessment-marks-bulk-import";

const sheet: MarksImportSheet = {
  classId: "class-1",
  className: "JHS 1A",
  subjectId: "sci",
  subjectName: "Integrated Science",
  templateId: "tpl",
  templateName: "Continuous Assessment",
  termId: "term-1",
  termName: "Term 1",
  components: [
    { id: "ct", name: "Class Test", maxMarks: 20, slots: 2 },
    { id: "exam", name: "Exam", maxMarks: 100, slots: 1 },
  ],
  students: [
    { studentId: "s1", admissionNumber: "0042", name: "Ama Mensah", marks: [{ componentId: "ct", occurrenceIndex: 1, marks: 15.5 }] },
    { studentId: "s2", admissionNumber: null, name: "Kojo Owusu", marks: [] },
  ],
};

describe("buildMarksTemplate", () => {
  it("lists every pupil and one column per mark, with saved marks filled in", () => {
    const template = buildMarksTemplate(sheet);
    expect(template.headers).toEqual([
      "Admission No",
      "Pupil name",
      "Class Test 1 (out of 20)",
      "Class Test 2 (out of 20)",
      "Exam (out of 100)",
    ]);
    expect(template.rows).toEqual([
      ["0042", "Ama Mensah", "", 15.5, ""],
      ["", "Kojo Owusu", "", "", ""],
    ]);
  });

  it("limits each mark column to its own range and keeps admission numbers as text", () => {
    const template = buildMarksTemplate(sheet);
    expect(template.numberColumns).toEqual({
      "Class Test 1 (out of 20)": { min: 0, max: 20 },
      "Class Test 2 (out of 20)": { min: 0, max: 20 },
      "Exam (out of 100)": { min: 0, max: 100 },
    });
    expect(template.textColumns).toEqual(["Admission No"]);
    expect(template.identityColumns).toEqual(["Admission No", "Pupil name"]);
  });

  it("names the file after the class, subject and assessment", () => {
    expect(buildMarksTemplate(sheet).fileBase).toBe("marks-jhs-1a-integrated-science-continuous-assessment");
  });
});

describe("the Excel file made from the template", () => {
  beforeEach(() => {
    saved.blob = null;
  });

  it("opens with the pupils, validation and no stray example sheet", async () => {
    await downloadExcelTemplate(buildMarksTemplate(sheet));
    expect(saved.name).toBe("marks-jhs-1a-integrated-science-continuous-assessment-import-template.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await saved.blob!.arrayBuffer()) as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["Instructions", "Marks"]);

    const marks = workbook.getWorksheet("Marks")!;
    expect(marks.rowCount).toBe(3);
    expect(marks.getRow(2).getCell(1).value).toBe("0042");
    expect(marks.getRow(2).getCell(2).value).toBe("Ama Mensah");
    expect(marks.getRow(2).getCell(4).value).toBe(15.5);
    expect(marks.getRow(3).getCell(2).value).toBe("Kojo Owusu");

    const validation = marks.getRow(3).getCell(5).dataValidation;
    expect(validation).toMatchObject({ type: "decimal", operator: "between", formulae: [0, 100], allowBlank: true });
    // Validation stops at the last pupil rather than running to row 1001.
    expect(marks.getRow(4).getCell(5).dataValidation).toBeUndefined();
  });
});
