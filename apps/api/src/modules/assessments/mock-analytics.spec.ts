import { describe, expect, it } from "vitest";
import { buildMockAnalytics, statusFor, trendFor, type MockScoreRow } from "./mock-analytics.js";

const mocks = [
  { id: "m1", name: "Mock 1", sequence: 1, yearName: "2026/27" },
  { id: "m2", name: "Mock 2", sequence: 2, yearName: "2026/27" },
];
const students = [
  { id: "a", name: "Ama", admissionNumber: "1" },
  { id: "b", name: "Kofi", admissionNumber: "2" },
  { id: "c", name: "Esi", admissionNumber: "3" },
];
const row = (studentId: string, templateId: string, subjectId: string, percentage: number, grade: string | null = null, gradePoint: number | null = null): MockScoreRow =>
  ({ studentId, templateId, subjectId, subjectName: subjectId === "math" ? "Mathematics" : "English", percentage, grade, gradePoint });

describe("mock analytics", () => {
  it("labels level and trend with documented thresholds", () => {
    expect(statusFor(50)).toBe("ON_TRACK");
    expect(statusFor(49.9)).toBe("WATCH");
    expect(statusFor(39.9)).toBe("AT_RISK");
    expect(statusFor(null)).toBeNull();
    expect(trendFor([60])).toEqual({ change: null, trend: "NEW" });
    expect(trendFor([50, 55]).trend).toBe("IMPROVING");
    expect(trendFor([50, 45]).trend).toBe("DECLINING");
    expect(trendFor([50, 52]).trend).toBe("STEADY");
  });

  it("averages per mock, ranks pupils, and never counts a missed mock as zero", () => {
    const result = buildMockAnalytics(mocks, students, [
      row("a", "m1", "math", 80), row("a", "m1", "eng", 60),
      row("b", "m1", "math", 40), row("b", "m1", "eng", 40),
      row("a", "m2", "math", 50), row("a", "m2", "eng", 50),
      // Esi sat nothing; Kofi missed Mock 2.
    ]);
    const m1 = result.mocks[0]!;
    expect(m1.sat).toBe(2);
    expect(m1.classAverage).toBe(55);
    expect(m1.atRisk).toBe(0);
    expect(result.mocks[1]!.sat).toBe(1);
    const ama = result.students.find((s) => s.id === "a")!;
    expect(ama.series.map((p) => p.average)).toEqual([70, 50]);
    expect(ama.series[0]!.position).toBe(1);
    expect(ama.trend).toBe("DECLINING");
    expect(ama.change).toBe(-20);
    const kofi = result.students.find((s) => s.id === "b")!;
    expect(kofi.series[1]!.average).toBeNull();
    expect(kofi.latestAverage).toBe(40);
    expect(kofi.status).toBe("WATCH");
    const esi = result.students.find((s) => s.id === "c")!;
    expect(esi.latestAverage).toBeNull();
    expect(esi.status).toBeNull();
  });

  it("gives subject deltas against the previous mock the subject was sat in", () => {
    const result = buildMockAnalytics(mocks, students, [row("a", "m1", "math", 50), row("a", "m2", "math", 62)]);
    const math = result.subjects.find((s) => s.subjectId === "math")!;
    expect(math.points.map((p) => p.delta)).toEqual([null, 12]);
  });

  it("orders grades best first and counts them per mock", () => {
    const result = buildMockAnalytics(mocks, students, [
      row("a", "m1", "math", 80, "2", 2), row("b", "m1", "math", 30, "9", 9), row("c", "m1", "math", 85, "2", 2),
    ]);
    expect(result.grades).toEqual(["2", "9"]);
    expect(result.gradeDistribution[0]!.counts).toEqual({ "2": 2, "9": 1 });
  });
});
