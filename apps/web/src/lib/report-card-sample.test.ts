import { describe, expect, it } from "vitest";
import { buildSampleReport, sampleGrade } from "./report-card-sample";

describe("buildSampleReport", () => {
  it("is deterministic and clearly a sample pupil", () => {
    expect(buildSampleReport("jhs")).toEqual(buildSampleReport("jhs"));
    expect(buildSampleReport().pupil.admissionNumber).toMatch(/^SAMPLE-/);
  });
  it("totals each subject from its weighted components, within 0-100", () => {
    for (const row of buildSampleReport("modern").subjects) {
      expect(row.components.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
      expect(row.totalScore).toBeGreaterThan(0);
      expect(row.totalScore).toBeLessThanOrEqual(100);
      expect(row.percentage).toBe(row.totalScore);
      expect(row.grade).toBe(sampleGrade(row.totalScore));
    }
  });
  it("gives primary designs a shorter subject list and a primary class", () => {
    const primary = buildSampleReport("primary");
    expect(primary.subjects.length).toBeLessThan(buildSampleReport("jhs").subjects.length);
    expect(primary.pupil.className).toMatch(/^Primary/);
  });
  it("maps percentages onto the 1-9 scale", () => {
    expect([85, 72, 66, 61, 56, 51, 46, 40, 20].map(sampleGrade)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
