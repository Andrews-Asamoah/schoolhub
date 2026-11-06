import { describe, expect, it } from "vitest";
import { buildSampleReport, sampleGrade } from "./report-card-sample";

describe("buildSampleReport", () => {
  it("is deterministic and clearly a sample pupil", () => {
    expect(buildSampleReport("jhs")).toEqual(buildSampleReport("jhs"));
    expect(buildSampleReport().pupil.admissionNumber).toMatch(/^SAMPLE-/);
  });
  it("adds the class score and exam score into the total, out of 100", () => {
    for (const row of buildSampleReport("modern").subjects) {
      expect(row.classWeight! + row.examWeight!).toBe(100);
      expect(row.classScore! + row.examScore!).toBeCloseTo(row.totalScore, 1);
      expect(row.totalScore).toBeGreaterThan(0);
      expect(row.totalScore).toBeLessThanOrEqual(100);
      expect(row.grade).toBe(sampleGrade(row.totalScore).grade);
      expect(row.gradeRemark).toBe(sampleGrade(row.totalScore).remark);
    }
  });
  it("shows overall position, class size, attendance and both signed remarks", () => {
    const report = buildSampleReport("jhs");
    expect(report.summary).toMatchObject({ overallPosition: 3, classSize: 38 });
    expect(report.attendance).toEqual({ present: 52, total: 56, rate: 93 });
    expect(report.approval.teacher.signature).toMatch(/^data:image\/svg\+xml/);
    expect(report.approval.head.remark).toBeTruthy();
  });
  it("gives primary designs a shorter subject list and a primary class", () => {
    const primary = buildSampleReport("primary");
    expect(primary.subjects.length).toBeLessThan(buildSampleReport("jhs").subjects.length);
    expect(primary.pupil.className).toMatch(/^Primary/);
  });
  it("maps percentages onto the 1-9 scale", () => {
    expect([85, 72, 66, 61, 56, 51, 46, 40, 20].map((value) => sampleGrade(value).grade)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
