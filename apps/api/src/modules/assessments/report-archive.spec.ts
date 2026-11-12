import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../../common/scope/teacher-scope.service.js", () => ({ TeacherScopeService: class {} }));
vi.mock("./report-version.service.js", () => ({ ReportVersionService: class {} }));

import { ARCHIVE_MAX_PAGE_SIZE, ReportArchiveService, archiveWhere } from "./report-archive.service.js";

describe("archiveWhere", () => {
  it("only matches published reports of this school's undeleted pupils", () => {
    const where = archiveWhere("school1", {}, null);
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.set).toEqual({ schoolId: "school1", status: "PUBLISHED" });
    expect(where.student).toEqual({ schoolId: "school1", deletedAt: null });
    expect(where).not.toHaveProperty("data");
  });

  it("filters by year, term and the class the pupil was in when the report was issued", () => {
    const where = archiveWhere("school1", { academicYearId: "y1", termId: "t1", classId: "c1" }, null);
    expect(where.set).toMatchObject({ academicYearId: "y1", termId: "t1" });
    expect(where.data).toEqual({ path: ["student", "class", "id"], equals: "c1" });
  });

  it("requires every word of a search to match a first name, last name or admission number", () => {
    const where = archiveWhere("school1", { q: "  ama   ADM-7 " }, null);
    const and = (where.student as { AND: { OR: unknown[] }[] }).AND;
    expect(and).toHaveLength(2);
    expect(and[0]!.OR).toHaveLength(3);
    expect(JSON.stringify(and[1])).toContain("ADM-7");
  });

  it("limits a teacher to pupils currently enrolled in the classes they teach", () => {
    const where = archiveWhere("school1", {}, ["c1", "c2"]);
    expect(where.student).toMatchObject({ enrollments: { some: { classId: { in: ["c1", "c2"] }, status: "ACTIVE" } } });
  });

  it("ignores a blank search and caps the number of search words", () => {
    expect(archiveWhere("s", { q: "   " }, null).student).not.toHaveProperty("AND");
    const many = archiveWhere("s", { q: "a b c d e f g h" }, null).student as { AND: unknown[] };
    expect(many.AND).toHaveLength(5);
  });
});

function setup(options: { taught?: string[]; reports?: unknown[]; versions?: unknown[]; reportFound?: boolean; pdfError?: Error } = {}) {
  const reportCard = {
    count: vi.fn().mockResolvedValue(options.reports?.length ?? 0),
    findMany: vi.fn().mockResolvedValue(options.reports ?? []),
    findFirst: vi.fn().mockResolvedValue(options.reportFound === false ? null : { id: "r1", setId: "set1", studentId: "s1" }),
  };
  const auditLog = { create: vi.fn().mockResolvedValue({}) };
  const prisma = { client: { reportCard, auditLog,
    reportCardVersion: { findMany: vi.fn().mockResolvedValue(options.versions ?? []) } } };
  const teacherScope = { getTaughtClassIds: vi.fn().mockResolvedValue(options.taught ?? ["c1"]) };
  const versions = {
    publishedPdf: options.pdfError
      ? vi.fn().mockRejectedValue(options.pdfError)
      : vi.fn().mockResolvedValue({ filename: "academic-report-v1.pdf", pdf: Buffer.from("pdf") }),
  };
  return { svc: new ReportArchiveService(prisma as never, teacherScope as never, versions as never), reportCard, auditLog, teacherScope, versions };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1", setId: "set1", studentId: "s1", publishedAt: new Date("2026-07-01"),
  data: { student: { class: { id: "c1", name: "JHS 1A" } } },
  student: { admissionNumber: "A1", profile: { firstName: "Ama", lastName: "Mensah" } },
  set: { name: "End of term", academicYear: { name: "2025/26" }, term: { name: "Term 3" } }, ...over,
});

describe("ReportArchiveService.list", () => {
  it("returns the page with class, year, term and whether a signed PDF exists", async () => {
    const { svc } = setup({ reports: [row()], versions: [{ setId: "set1", studentId: "s1", version: 2 }] });
    const result = await svc.list("school1", "u1", "owner", { page: 1, pageSize: 25 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual({
      id: "r1", pupilName: "Ama Mensah", admissionNumber: "A1", className: "JHS 1A", setName: "End of term",
      academicYear: "2025/26", term: "Term 3", publishedAt: new Date("2026-07-01"), version: 2, hasPdf: true,
    });
  });

  it("marks a legacy report with no versioned PDF as having none", async () => {
    const { svc } = setup({ reports: [row()], versions: [] });
    const [first] = (await svc.list("school1", "u1", "admin", { page: 1, pageSize: 25 })).items;
    expect(first).toMatchObject({ hasPdf: false, version: null });
  });

  it("copes with a stored report that has no class", async () => {
    const { svc } = setup({ reports: [row({ data: {} })] });
    expect((await svc.list("school1", "u1", "owner", { page: 1, pageSize: 25 })).items[0]!.className).toBeNull();
  });

  it("paginates on the server and caps the page size", async () => {
    const { svc, reportCard } = setup({ reports: [row()] });
    await svc.list("school1", "u1", "owner", { page: 3, pageSize: 500 });
    expect(reportCard.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2 * ARCHIVE_MAX_PAGE_SIZE, take: ARCHIVE_MAX_PAGE_SIZE }));
  });

  it("applies no class limit for the owner, administrator or headteacher", async () => {
    for (const role of ["owner", "admin", "headteacher"]) {
      const { svc, reportCard, teacherScope } = setup();
      await svc.list("school1", "u1", role, { page: 1, pageSize: 25 });
      expect(teacherScope.getTaughtClassIds).not.toHaveBeenCalled();
      expect(JSON.stringify(reportCard.count.mock.calls[0])).not.toContain("enrollments");
    }
  });

  it("limits a teacher to their classes", async () => {
    const { svc, reportCard } = setup({ taught: ["c1", "c9"] });
    await svc.list("school1", "u1", "teacher", { page: 1, pageSize: 25 });
    expect(JSON.stringify(reportCard.count.mock.calls[0])).toContain('"in":["c1","c9"]');
  });

  it("shows a teacher with no classes nothing, without querying reports", async () => {
    const { svc, reportCard } = setup({ taught: [] });
    expect(await svc.list("school1", "u1", "teacher", { page: 1, pageSize: 25 })).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
    expect(reportCard.count).not.toHaveBeenCalled();
  });
});

describe("ReportArchiveService.pdf", () => {
  it("opens the PDF for a report in scope and records the download", async () => {
    const { svc, versions, auditLog } = setup();
    const file = await svc.pdf("school1", { id: "u1" }, "headteacher", "r1");
    expect(file.filename).toBe("academic-report-v1.pdf");
    expect(versions.publishedPdf).toHaveBeenCalledWith("school1", "u1", "r1", "staff");
    expect(auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      schoolId: "school1", userId: "u1", action: "FILE_DOWNLOADED", entityType: "REPORT_CARD", entityId: "r1",
      newValues: expect.objectContaining({ audience: "staff", role: "headteacher", studentId: "s1", setId: "set1" }),
    }) });
  });

  it("refuses a report outside the teacher's scope without building a PDF or auditing", async () => {
    const { svc, versions, auditLog } = setup({ reportFound: false });
    await expect(svc.pdf("school1", { id: "u1" }, "teacher", "r1")).rejects.toBeInstanceOf(NotFoundException);
    expect(versions.publishedPdf).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it("re-checks the teacher's classes on every request, not just in the list", async () => {
    const { svc, teacherScope, reportCard } = setup({ taught: ["c1"] });
    await svc.pdf("school1", { id: "u1" }, "teacher", "r1");
    await svc.pdf("school1", { id: "u1" }, "teacher", "r1");
    expect(teacherScope.getTaughtClassIds).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(reportCard.findFirst.mock.calls[0])).toContain('"in":["c1"]');
  });

  it("refuses a teacher who teaches no classes", async () => {
    const { svc, reportCard } = setup({ taught: [] });
    await expect(svc.pdf("school1", { id: "u1" }, "teacher", "r1")).rejects.toBeInstanceOf(NotFoundException);
    expect(reportCard.findFirst).not.toHaveBeenCalled();
  });

  it("does not audit a download that failed, such as a legacy report with no versioned PDF", async () => {
    const { svc, auditLog } = setup({ pdfError: new ConflictException("This historical report predates versioned PDFs.") });
    await expect(svc.pdf("school1", { id: "u1" }, "owner", "r1")).rejects.toBeInstanceOf(ConflictException);
    expect(auditLog.create).not.toHaveBeenCalled();
  });
});

describe("ReportArchiveService.filters", () => {
  it("lists years newest first with their terms in order, and classes with their year", async () => {
    const prisma = { client: {
      reportCardSet: { findMany: vi.fn().mockResolvedValue([
        { academicYear: { id: "y1", name: "2024/25", startDate: new Date("2024-09-01") }, term: { id: "t2", name: "Term 2", termNumber: 2 } },
        { academicYear: { id: "y2", name: "2025/26", startDate: new Date("2025-09-01") }, term: { id: "t3", name: "Term 3", termNumber: 3 } },
        { academicYear: { id: "y2", name: "2025/26", startDate: new Date("2025-09-01") }, term: { id: "t1", name: "Term 1", termNumber: 1 } },
        { academicYear: { id: "y2", name: "2025/26", startDate: new Date("2025-09-01") }, term: { id: "t1", name: "Term 1", termNumber: 1 } },
      ]) },
      class: { findMany: vi.fn().mockResolvedValue([{ id: "c1", name: "JHS 1A", academicYear: { name: "2025/26" } }, { id: "c2", name: "Nursery", academicYear: null }]) },
    } };
    const svc = new ReportArchiveService(prisma as never, {} as never, {} as never);
    const result = await svc.filters("school1");
    expect(result.years.map(y => y.name)).toEqual(["2025/26", "2024/25"]);
    expect(result.years[0]!.terms.map(t => t.name)).toEqual(["Term 1", "Term 3"]);
    expect(result.classes).toEqual([{ id: "c1", name: "JHS 1A (2025/26)" }, { id: "c2", name: "Nursery" }]);
  });
});
