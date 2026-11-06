import { describe, expect, it } from "vitest";
import { ordinalParts } from "@schoolhub/shared";
import { gradeRemark, overallPositions, splitScore, summariseAttendance, type ReportComponent } from "./report-card-data.js";

const components: ReportComponent[] = [
  { id: "test", componentType: "CLASS_TEST", maxMarks: 20, weight: 20 },
  { id: "proj", componentType: "PROJECT", maxMarks: 10, weight: 10 },
  { id: "pres", componentType: "PRESENTATION", maxMarks: 10, weight: 20 },
  { id: "exam", componentType: "FINAL_EXAM", maxMarks: 100, weight: 50 },
];

describe("splitScore", () => {
  it("adds every non-exam component into the class score and the exam on its own", () => {
    const split = splitScore(components, [
      { componentId: "test", marksObtained: 15 }, // 15/20 x 20 = 15
      { componentId: "proj", marksObtained: 8 }, //   8/10 x 10 = 8
      { componentId: "pres", marksObtained: 5 }, //   5/10 x 20 = 10
      { componentId: "exam", marksObtained: 80 }, // 80/100 x 50 = 40
    ]);
    expect(split).toEqual({ classScore: 33, classWeight: 50, examScore: 40, examWeight: 50, totalScore: 73, totalWeight: 100 });
  });
  it("averages a repeated component, like marks entry does", () => {
    const split = splitScore([{ id: "q", componentType: "QUIZ", maxMarks: 10, weight: 50 }, components[3]!], [
      { componentId: "q", marksObtained: 10 },
      { componentId: "q", marksObtained: 6 },
      { componentId: "exam", marksObtained: 100 },
    ]);
    expect(split.classScore).toBe(40); // average 0.8 x 50
    expect(split.totalScore).toBe(90);
  });
  it("leaves out missing marks and handles a template with no exam", () => {
    expect(splitScore(components, [{ componentId: "exam", marksObtained: 50 }])).toMatchObject({ classScore: 0, examScore: 25, totalScore: 25 });
    expect(splitScore([components[0]!], [{ componentId: "test", marksObtained: 20 }])).toMatchObject({ examWeight: 0, examScore: 0, totalScore: 20, totalWeight: 20 });
  });
  it("never divides by a zero maximum", () => {
    expect(splitScore([{ id: "x", componentType: "QUIZ", maxMarks: 0, weight: 10 }], [{ componentId: "x", marksObtained: 5 }]).classScore).toBe(0);
  });
});

describe("gradeRemark", () => {
  const scales = [{ grade: "1", description: "Highly proficient" }, { grade: "2", description: " " }];
  it("uses the grading scale's own wording", () => {
    expect(gradeRemark("1", scales)).toBe("Highly proficient");
    expect(gradeRemark("2", scales)).toBeNull();
    expect(gradeRemark("9", scales)).toBeNull();
    expect(gradeRemark(null, scales)).toBeNull();
  });
});

describe("overallPositions", () => {
  it("ranks within each class by average percentage, sharing ties", () => {
    const positions = overallPositions([
      { id: "a", classId: "c1", subjectPercentages: [90, 80] },
      { id: "b", classId: "c1", subjectPercentages: [70, 70] },
      { id: "c", classId: "c1", subjectPercentages: [80, 90] },
      { id: "d", classId: "c2", subjectPercentages: [40] },
      { id: "e", classId: "c1", subjectPercentages: [] },
    ]);
    expect(positions.get("a")).toBe(1);
    expect(positions.get("c")).toBe(1);
    expect(positions.get("b")).toBe(3);
    expect(positions.get("d")).toBe(1);
    expect(positions.has("e")).toBe(false);
  });
});

describe("summariseAttendance", () => {
  it("counts present and late as attended", () => {
    expect(summariseAttendance(["PRESENT", "LATE", "ABSENT", "SICK"])).toEqual({ present: 2, total: 4, rate: 50 });
  });
  it("is null when no register was taken", () => {
    expect(summariseAttendance([])).toBeNull();
  });
});

describe("ordinalParts", () => {
  it("handles st, nd, rd, th and the teens", () => {
    const text = (n: number) => { const { suffix } = ordinalParts(n); return `${n}${suffix}`; };
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(text)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});
