import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { ImportAssessmentMarksBatchInput } from "@schoolhub/shared";
import type { PrismaService } from "../../prisma/prisma.service.js";
import type { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentMarksImportService } from "./assessment-marks-import.service.js";

const component = (over: Record<string, unknown>) => ({
  weight: 25,
  isRequired: true,
  isRepeatable: false,
  expectedCount: 1,
  subjectStrandId: null,
  subjectStrandName: null,
  ...over,
});
const components = [
  component({ id: "ct", name: "Class Test", maxMarks: 20, isRepeatable: true, expectedCount: 2 }),
  component({ id: "exam", name: "Exam", maxMarks: 100 }),
  component({ id: "prac", name: "Practical", maxMarks: 30, subjectStrandId: "hw", subjectStrandName: "Hardware" }),
];
const roster = [
  { id: "s1", admissionNumber: "A001", name: "Ama Mensah" },
  { id: "s2", admissionNumber: "A002", name: "Kojo Owusu" },
  { id: "s3", admissionNumber: null, name: "Esi Boateng" },
  { id: "s4", admissionNumber: null, name: "Yaw Twin" },
  { id: "s5", admissionNumber: null, name: "Yaw Twin" },
];
// Ama already has Class Test 1 = 14.
const savedScores = [{ studentId: "s1", componentScores: [{ componentId: "ct", occurrenceIndex: 0, marksObtained: 14 }] }];

const managerAssignments = { teacherId: null, classTeacherClassIds: [], subjectAssignments: [], subjectStrandAssignments: [] };
const teacherAssignments = {
  teacherId: "t1",
  classTeacherClassIds: [],
  subjectAssignments: [{ classId: "class-1", subjectId: "sci" }],
  subjectStrandAssignments: [], // not assigned to the Hardware strand
};

function create({ role = "admin", assertEditable }: { role?: string; assertEditable?: () => void } = {}) {
  const persistEntries = vi.fn().mockResolvedValue(undefined);
  const entry = {
    loadContext: vi.fn().mockResolvedValue({
      term: { id: "term-1", name: "Term 1", termNumber: 1 },
      klass: { id: "class-1", name: "JHS 1A", level: "JHS1", departmentId: null },
      subject: { id: "sci", name: "Science", code: "SCI" },
      assignments: role === "teacher" ? teacherAssignments : managerAssignments,
      templates: [{ id: "tpl", name: "Continuous assessment", isLocked: false, deadline: null, extensions: [], submission: null, method: "SCORE_BANDS", components, bands: [] }],
    }),
    loadRoster: vi.fn().mockResolvedValue(roster),
    assertEditable: vi.fn(assertEditable ?? (() => undefined)),
    persistEntries,
  } as unknown as AssessmentEntryService;
  const prisma = { client: { assessmentScore: { findMany: vi.fn().mockResolvedValue(savedScores) } } } as unknown as PrismaService;
  return { service: new AssessmentMarksImportService(prisma, entry), entry, persistEntries, role };
}

const query = { classId: "class-1", subjectId: "sci", templateId: "tpl" };
const HEAD = "Admission No,Pupil name,Class Test 1 (out of 20),Class Test 2 (out of 20),Exam (out of 100),Practical – Hardware (out of 30)";
const csv = (head: string, ...lines: string[]) => ({ buffer: Buffer.from([head, ...lines].join("\n")), originalname: "marks.csv" });

describe("AssessmentMarksImportService.preview", () => {
  it("matches pupils by admission number and builds only the cells that change", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A001,Ama Mensah,14,16,70,", "A002,Kojo Owusu,,,55,"));

    expect(preview.summary).toMatchObject({ total: 2, ready: 2, update: 0, unchanged: 0, error: 0 });
    const [ama, kojo] = preview.rows;
    // Ama's Class Test 1 (14) is the same as saved, so only Class Test 2 and the exam are sent.
    expect(ama).toMatchObject({ status: "ready", name: "Ama Mensah (A001)" });
    expect(ama!.row).toEqual({
      studentId: "s1",
      entries: [
        { componentId: "ct", occurrenceIndex: 1, marks: 16, expectedMarks: null },
        { componentId: "exam", occurrenceIndex: 0, marks: 70, expectedMarks: null },
      ],
    });
    expect(kojo!.row).toEqual({ studentId: "s2", entries: [{ componentId: "exam", occurrenceIndex: 0, marks: 55, expectedMarks: null }] });
  });

  it("marks a changed saved mark as an update and shows old and new", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A001,Ama Mensah,17,,,"));
    expect(preview.rows[0]).toMatchObject({ status: "update", detail: "Class Test 1: 14 → 17" });
    expect(preview.rows[0]!.row!.entries[0]).toMatchObject({ marks: 17, expectedMarks: 14 });
  });

  it("reports pupils whose marks are all unchanged or empty without sending anything", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A001,Ama Mensah,14,,,", "A002,Kojo Owusu,,,,"));
    expect(preview.rows.map((row) => row.status)).toEqual(["unchanged", "unchanged"]);
    expect(preview.rows.every((row) => row.row === null)).toBe(true);
  });

  it("explains every bad cell on a row and does not import it", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A002,Kojo Owusu,25,abc,70.555,"));
    const row = preview.rows[0]!;
    expect(row.status).toBe("error");
    expect(row.row).toBeNull();
    expect(row.errors).toEqual([
      "Class Test 1: 25 is outside 0 to 20.",
      'Class Test 2: "abc" is not a number. Leave the cell empty if there is no mark.',
      "Exam: 70.555 has more than 2 decimal places.",
    ]);
  });

  it("refuses unknown admission numbers rather than guessing by name", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A999,Ama Mensah,10,,,"));
    expect(preview.rows[0]).toMatchObject({ status: "error" });
    expect(preview.rows[0]!.errors[0]).toContain('"A999" is not on JHS 1A');
  });

  it("falls back to the name for pupils without an admission number and refuses lookalikes", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, ",esi  boateng,,,60,", ",Yaw Twin,,,50,"));
    expect(preview.rows[0]).toMatchObject({ status: "ready", name: "Esi Boateng" });
    expect(preview.rows[1]).toMatchObject({ status: "error" });
    expect(preview.rows[1]!.errors[0]).toContain("More than one pupil is named");
  });

  it("keeps only the first row for a pupil that appears twice", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(HEAD, "A002,Kojo Owusu,,,50,", "A002,Kojo Owusu,,,60,"));
    expect(preview.rows.map((row) => row.status)).toEqual(["ready", "duplicate"]);
  });

  it("refuses marks in a column the teacher is not assigned to, even when the sheet has it", async () => {
    const { service } = create({ role: "teacher" });
    const preview = await service.preview("school", "user", "teacher", query, csv(HEAD, "A002,Kojo Owusu,,,55,20"));
    expect(preview.rows[0]).toMatchObject({ status: "error", errors: ["Practical – Hardware: you are not assigned to enter these marks."] });
    // The same cell left empty is fine.
    const clean = await service.preview("school", "user", "teacher", query, csv(HEAD, "A002,Kojo Owusu,,,55,"));
    expect(clean.rows[0]!.status).toBe("ready");
  });

  it("notices ignored columns and pupils missing from the file", async () => {
    const { service } = create();
    const preview = await service.preview("school", "user", "admin", query, csv(`${HEAD},Total,Grade`, "A002,Kojo Owusu,,,55,,99,A"));
    expect(preview.notices.join(" ")).toContain("Ignored columns that are not part of this assessment: Total, Grade.");
    expect(preview.notices.join(" ")).toContain("4 pupils on the class list are not in this file");
  });

  it("rejects a file that cannot say whose marks they are or whose columns do not match", async () => {
    const { service } = create();
    await expect(service.preview("school", "user", "admin", query, csv("Exam (out of 100)", "55"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.preview("school", "user", "admin", query, csv("Admission No,Pupil name,Quiz", "A001,Ama,3"))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stops before reading the file when the sheet is locked, submitted or past its deadline", async () => {
    const { service } = create({
      assertEditable: () => {
        throw new ForbiddenException("These marks were submitted.");
      },
    });
    await expect(service.preview("school", "user", "admin", query, csv(HEAD, "A001,Ama,1,,,"))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("AssessmentMarksImportService.importBatch", () => {
  const input: ImportAssessmentMarksBatchInput = {
    classId: "class-1",
    subjectId: "sci",
    templateId: "tpl",
    termId: "term-1",
    rows: [
      { rowNumber: 2, name: "Ama Mensah (A001)", row: { studentId: "s1", entries: [{ componentId: "ct", occurrenceIndex: 0, marks: 17, expectedMarks: 14 }] } },
      { rowNumber: 3, name: "Kojo Owusu (A002)", row: { studentId: "s2", entries: [{ componentId: "exam", occurrenceIndex: 0, marks: 55, expectedMarks: null }] } },
    ],
  };

  it("saves the whole batch through the normal entry path and tags it as an import", async () => {
    const { service, persistEntries } = create();
    const { results } = await service.importBatch("school", "user", "admin", input);

    expect(persistEntries).toHaveBeenCalledWith(
      "school",
      "user",
      "admin",
      {
        classId: "class-1",
        subjectId: "sci",
        templateId: "tpl",
        termId: "term-1",
        entries: [
          { studentId: "s1", componentId: "ct", occurrenceIndex: 0, marks: 17, expectedMarks: 14 },
          { studentId: "s2", componentId: "exam", occurrenceIndex: 0, marks: 55, expectedMarks: null },
        ],
      },
      "IMPORT",
    );
    expect(results.map((result) => result.status)).toEqual(["updated", "created"]);
  });

  it("fails every row in the batch, saving nothing, when one mark was changed by someone else", async () => {
    const { service, persistEntries } = create();
    persistEntries.mockRejectedValueOnce(new ConflictException("Another user changed these marks."));
    const { results } = await service.importBatch("school", "user", "admin", input);

    expect(results.map((result) => result.status)).toEqual(["failed", "failed"]);
    expect(results[0]!.message).toBe("Nothing in this group of 2 was saved. Another user changed these marks.");
  });

  it("does not leak the details of an unexpected error", async () => {
    const { service, persistEntries } = create();
    persistEntries.mockRejectedValueOnce(new Error("connection string postgres://secret"));
    const { results } = await service.importBatch("school", "user", "admin", input);

    expect(results[0]).toMatchObject({ status: "failed", message: "This group could not be saved, so none of its marks were changed." });
  });
});
