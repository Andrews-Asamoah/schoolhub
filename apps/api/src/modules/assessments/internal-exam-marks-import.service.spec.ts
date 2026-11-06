import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { InternalExamMarksImportService } from "./internal-exam-marks-import.service.js";
import { mockMarksImportBatchSchema } from "./internal-exams.schemas.js";
const candidate = (id: string, name: string, admissionNumber: string | null, marks: number | null = null, version = 0) => ({
  id, name, admissionNumber, marks, status: marks === null ? null : "MARKED", version, sectionMarks: [],
});
function fixture(sectionMode = false, editable = true) {
  const target = {
    paper: { id: "paper", name: "Science", maxMarks: 100, sections: sectionMode ? [
      { id: "section", name: "Practical", maxMarks: 30, canEdit: editable },
      { id: "other-section", name: "Theory", maxMarks: 70, canEdit: false },
    ] : [] },
    session: { id: "mock", name: "Mock 1" }, canEdit: editable,
    candidates: [candidate("c1", "Ama Akua Mensah", "0042", 80, 3), candidate("c2", "Esi Boateng", null),
      candidate("c3", "Yaw Twin", null), candidate("c4", "Yaw Twin", null)],
  };
  const exams = { sheet: vi.fn().mockResolvedValue(target), save: vi.fn().mockResolvedValue({ saved: 1 }), saveSectionMarks: vi.fn().mockResolvedValue({ saved: 1 }) };
  const service = new InternalExamMarksImportService(exams as never);
  return { target, exams, service };
}
const head = "Candidate ID,Admission No,Pupil name,Marks (out of 100),Absent";
const csv = (...rows: string[]) => ({ buffer: Buffer.from([head, ...rows].join("\n")), originalname: "marks.csv" });
const ref = { paperId: "paper" };
describe("internal mock marks preview", () => {
  it("matches the frozen candidate IDs, keeps leading-zero admissions, skips blanks and carries versions", async () => {
    const { service, exams } = fixture();
    const preview = await service.preview("school", "teacher", "teacher", ref, csv("c1,0042,Ama Akua Mensah,85,NO", "c2,,Esi Boateng,,NO"));
    expect(preview.summary).toMatchObject({ update: 1, unchanged: 1, error: 0 });
    expect(preview.rows[0]).toMatchObject({ detail: "80 → 85", row: { candidateId: "c1", status: "MARKED", marks: 85, expectedVersion: 3 } });
    expect(preview.rows[1]!.row).toBeNull();
    expect(exams.save).not.toHaveBeenCalled();
  });
  it("records explicit absences, keeps zero as a mark and rejects absent-plus-mark conflicts", async () => {
    const { service } = fixture();
    const absent = await service.preview("s", "t", "teacher", ref, csv("c2,,Esi Boateng,,YES", "c1,0042,Ama,0,NO"));
    expect(absent.rows[0]!.row).toMatchObject({ status: "ABSENT", marks: null, expectedVersion: 0 });
    expect(absent.rows[1]!.row).toMatchObject({ status: "MARKED", marks: 0 });
    const conflict = await service.preview("s", "t", "teacher", ref, csv("c1,0042,Ama,0,YES"));
    expect(conflict.rows[0]!.errors[0]).toContain("Leave Marks empty");
  });
  it("refuses wrong/ambiguous identities and duplicates rather than guessing", async () => {
    const { service } = fixture();
    const preview = await service.preview("s", "t", "teacher", ref, csv("missing,0042,Ama,50,NO", ",,Yaw Twin,40,NO", "c1,0042,Ama,70,NO", "c1,0042,Ama,60,NO"));
    expect(preview.rows.map((row) => row.status)).toEqual(["error", "error", "update", "duplicate"]);
    const mismatched = await service.preview("s", "t", "teacher", ref, csv("c1,999,Ama,50,NO"));
    expect(mismatched.rows[0]!.status).toBe("error");
  });
  it("validates ranges, decimals and absence values", async () => {
    const { service } = fixture();
    for (const cells of ["101,NO", "70.555,NO", "text,NO", "50,MAYBE"]) {
      const preview = await service.preview("s", "t", "teacher", ref, csv(`c1,0042,Ama,${cells}`));
      expect(preview.rows[0]!.status).toBe("error"); expect(preview.rows[0]!.row).toBeNull();
    }
  });
  it("rejects duplicate headers and missing identity columns", async () => {
    const { service } = fixture();
    for (const text of ["Candidate ID,Marks,Score\nc1,1,2", "Marks\n50"]) {
      await expect(service.preview("s", "t", "teacher", ref, { buffer: Buffer.from(text), originalname: "marks.csv" })).rejects.toThrow();
    }
  });
  it("uses the selected section's maximum and refuses locked, foreign or unassigned sections before parsing", async () => {
    const { service } = fixture(true);
    const query = { paperId: "paper", sectionId: "section" };
    const preview = await service.preview("s", "t", "teacher", query, csv("c2,,Esi,31,NO"));
    expect(preview.rows[0]!.errors[0]).toContain("0 to 30");
    await expect(service.preview("s", "t", "teacher", ref, csv("c2,,Esi,20,NO"))).rejects.toThrow(/Choose/);
    await expect(service.preview("s", "t", "teacher", { ...ref, sectionId: "other-section" }, csv("c2,,Esi,20,NO"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture(false, false).service.preview("s", "t", "teacher", ref, csv())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.preview("s", "t", "admin", query, csv())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("reads Excel templates with instructions without importing their instructions sheet", async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("Instructions").addRow(["Fill the marks"]);
    const sheet = workbook.addWorksheet("Marks"); sheet.addRow(head.split(",")); sheet.addRow(["c1", "0042", "Ama", 88, "NO"]);
    const result = await fixture().service.preview("s", "t", "teacher", ref, { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: "marks.xlsx" });
    expect(result.rows[0]!.row).toMatchObject({ candidateId: "c1", marks: 88, expectedVersion: 3 });
  });
});
describe("internal mock import writes", () => {
  const input = { paperId: "paper", rows: [{ rowNumber: 2, name: "Ama", row: { candidateId: "c1", status: "MARKED" as const, marks: 90, expectedVersion: 3 } }] };
  it("uses the canonical whole-paper save path with original versions and import provenance", async () => {
    const { service, exams } = fixture();
    expect((await service.importBatch("s", "t", "teacher", input)).results[0]!.status).toBe("updated");
    expect(exams.save).toHaveBeenCalledWith("s", "t", "teacher", { paperId: "paper", entries: [input.rows[0]!.row] }, "IMPORT");
  });
  it("uses the canonical section writer and rejects mismatched section/paper references", async () => {
    const { service, exams } = fixture(true);
    await service.importBatch("s", "t", "teacher", { ...input, sectionId: "section" });
    expect(exams.saveSectionMarks).toHaveBeenCalledWith("s", "t", "teacher", { sectionId: "section", entries: [input.rows[0]!.row] }, "IMPORT");
    const bad = await service.importBatch("s", "t", "teacher", { ...input, sectionId: "foreign" });
    expect(bad.results[0]!.status).toBe("failed"); expect(exams.saveSectionMarks).toHaveBeenCalledTimes(1);
  });
  it("fails the whole batch on conflicts without exposing unexpected internal errors", async () => {
    const { service, exams } = fixture();
    exams.save.mockRejectedValueOnce(new ConflictException("Marks changed after preview."));
    expect((await service.importBatch("s", "t", "teacher", input)).results[0]).toMatchObject({ status: "failed", message: "Nothing in this batch was saved. Marks changed after preview." });
    exams.save.mockRejectedValueOnce(new Error("postgres://secret"));
    expect(JSON.stringify(await service.importBatch("s", "t", "teacher", input))).not.toContain("postgres://secret");
  });
  it("rejects malformed absence values and oversized batches at the endpoint schema", () => {
    expect(mockMarksImportBatchSchema.safeParse({ ...input, rows: [{ ...input.rows[0], row: { ...input.rows[0]!.row, status: "ABSENT", marks: 0 } }] }).success).toBe(false);
    expect(mockMarksImportBatchSchema.safeParse({ ...input, rows: Array.from({ length: 121 }, () => input.rows[0]) }).success).toBe(false);
  });
});
