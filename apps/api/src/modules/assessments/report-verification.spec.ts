import { describe, expect, it, vi } from "vitest";

// The real service needs a generated Prisma client; these tests only need its shape.
vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
import { ReportVerificationService } from "./report-verification.service.js";
import { academicReportPdf, reportVerificationCode, reportVerifyUrl, snapshotHash } from "./report-version.js";

const snapshot = {
  schemaVersion: 2,
  report: { student: { class: { id: "c1", name: "JHS 3", level: "JHS" } }, summary: { average: 72, subjectsGraded: 1, overallPosition: 2, classSize: 30 },
    subjects: [{ subject: { name: "Maths", code: "MTH" }, totalScore: 72, percentage: 72, grade: "B" }] },
  school: { name: "Wesley International School", code: "W" }, template: { name: "t", layout: {} },
  student: { name: "Ama Mensah", admissionNumber: "A001" }, year: "2026/27", term: "Term 1", set: "Mock 1", capturedAt: "x",
};
const hash = snapshotHash(snapshot);
const row = { id: "v1", setId: "s1", studentId: "st1", version: 1, stage: "PUBLISHED", publishedAt: new Date("2026-11-12"), snapshot, snapshotHash: hash, teacherName: "T", teacherApprovedAt: new Date(), headName: "H", headApprovedAt: new Date() };

function service(version: unknown, setStatus = "PUBLISHED") {
  const client = { reportCardVersion: { findFirst: async () => version }, reportCardSet: { findFirst: async () => ({ status: setStatus }) } };
  return new ReportVerificationService({ client } as never);
}
const code = reportVerificationCode(hash);

describe("report verification code and link", () => {
  it("prints 16 hex characters in groups of four", () => expect(code).toMatch(/^([0-9A-F]{4}-){3}[0-9A-F]{4}$/));
  it("builds a link on the web origin, or none without one", () => {
    expect(reportVerifyUrl("https://app.example.com", "v1", hash)).toBe(`https://app.example.com/verify-report/v1/${code}`);
    expect(reportVerifyUrl(undefined, "v1", hash)).toBeNull();
  });
  it("draws the QR block into the PDF, and leaves it out of a preview", () => {
    const approval = { version: 1, snapshotHash: hash, teacherName: "T", teacherRemark: "ok", teacherApprovedAt: new Date(), headName: "H", headRemark: "ok", headApprovedAt: new Date(), publishedAt: new Date() };
    const issued = academicReportPdf(snapshot as never, approval, { verifyUrl: "https://app.example.com/verify-report/v1/x" });
    const preview = academicReportPdf(snapshot as never, { ...approval, preview: true }, { verifyUrl: "https://app.example.com/verify-report/v1/x" });
    expect(issued.length).toBeGreaterThan(preview.length);
  });
});

describe("ReportVerificationService", () => {
  it("confirms a current published report and returns what to compare", async () => {
    const result = await service(row).verify("v1", code);
    expect(result).toMatchObject({ status: "VALID", student: { name: "Ama Mensah" }, results: { average: 72, subjects: [{ name: "Maths", grade: "B" }] }, fingerprint: hash });
  });
  it("accepts the code typed without dashes or in lower case", async () => {
    expect((await service(row).verify("v1", code.replace(/-/g, "").toLowerCase())).status).toBe("VALID");
  });
  it("does not recognise a wrong code, a malformed code or an unknown report", async () => {
    expect((await service(row).verify("v1", "0000-0000-0000-0000")).status).toBe("NOT_FOUND");
    expect((await service(row).verify("v1", "abc")).status).toBe("NOT_FOUND");
    expect((await service(null).verify("nope", code)).status).toBe("NOT_FOUND");
  });
  it("flags a stored report whose content no longer matches its seal", async () => {
    const tampered = { ...row, snapshot: { ...snapshot, student: { name: "Someone Else", admissionNumber: "A001" } } };
    expect((await service(tampered).verify("v1", code)).status).toBe("FAILED_INTEGRITY");
  });
  it("shows a replaced or reopened report as superseded, without its results", async () => {
    const old = await service({ ...row, stage: "SUPERSEDED" }).verify("v1", code);
    expect(old).toMatchObject({ status: "SUPERSEDED", results: null, fingerprint: null });
    expect((await service(row, "GENERATED").verify("v1", code)).status).toBe("SUPERSEDED");
  });
});
