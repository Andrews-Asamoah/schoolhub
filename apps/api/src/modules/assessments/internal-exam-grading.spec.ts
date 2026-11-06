import { describe, expect, it, vi } from "vitest";
import { mockEntryGrade, resolveMockEntryGrading, type MockEntryGrading } from "./internal-exam-grading.js";
import { snapshotHash } from "./mock-report.js";
const bands = [
  { grade: "1", min: 90, max: 100, description: "Highest" },
  { grade: "2", min: 80, max: 89, description: "Higher" },
  { grade: "3", min: 0, max: 79, description: "Custom lower band" },
];
const policy: MockEntryGrading = { name: "School scale", bands, source: "SCHOOL_DEFAULT" };
const stored = { name: policy.name, gradeScales: bands.map((band) => ({ grade: band.grade, minScore: band.min, maxScore: band.max, description: band.description })) };
function db(report: unknown = null, defaults: unknown[] = [stored]) {
  let index = 0;
  return { internalMockReport: { findFirst: vi.fn().mockResolvedValue(report) }, gradingSystem: { findFirst: vi.fn(async (_query: unknown) => defaults[index++] ?? null) } };
}
describe("mock entry grading", () => {
  it("uses the same rounding and configured descriptions as mock reports", () => {
    expect(mockEntryGrade(89.5, policy)).toEqual({ grade: "1", remark: "Highest" });
    expect(mockEntryGrade(89.49, policy)).toEqual({ grade: "2", remark: "Higher" });
    expect(mockEntryGrade(0, policy)).toEqual({ grade: "3", remark: "Custom lower band" });
    expect(mockEntryGrade(null, policy)).toEqual({ grade: null, remark: null });
    expect(mockEntryGrade(90, null)).toEqual({ grade: null, remark: null });
  });
  it("uses the frozen report scale even if the school default has changed", async () => {
    const snapshot = { grading: { name: "Frozen scale", bands } };
    const client = db({ snapshot, snapshotHash: snapshotHash(snapshot) });
    expect((await resolveMockEntryGrading(client as never, "school", "mock")).grading).toMatchObject({ name: "Frozen scale", source: "REPORT", bands });
    expect(client.gradingSystem.findFirst).not.toHaveBeenCalled();
    expect(client.internalMockReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "school", sessionId: "mock" } }));
  });
  it("uses the school's default score bands first, then the shared system default", async () => {
    const school = db();
    expect((await resolveMockEntryGrading(school as never, "school", "mock")).grading?.source).toBe("SCHOOL_DEFAULT");
    expect(school.gradingSystem.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { schoolId: "school", isActive: true, isSchoolDefault: true, method: "SCORE_BANDS" } });
    const system = db(null, [null, stored]);
    expect((await resolveMockEntryGrading(system as never, "school", "mock")).grading?.source).toBe("SYSTEM_DEFAULT");
  });
  it("never invents grades if the saved report policy was altered, a scale is missing or bands overlap", async () => {
    const badReport = db({ snapshot: { grading: { name: "Altered", bands } }, snapshotHash: "wrong" });
    expect((await resolveMockEntryGrading(badReport as never, "school", "mock")).grading).toBeNull();
    expect(badReport.gradingSystem.findFirst).not.toHaveBeenCalled();
    expect((await resolveMockEntryGrading(db(null, []) as never, "school", "mock")).grading).toBeNull();
    const overlap = { ...stored, gradeScales: [...stored.gradeScales, stored.gradeScales[0]] };
    expect((await resolveMockEntryGrading(db(null, [overlap]) as never, "school", "mock")).grading).toBeNull();
  });
});
