import { describe, expect, it } from "vitest";
import {
  computeStudentResult,
  rankByPercentage,
  templateSpecificity,
  validateMarks,
  type EntryComponent,
  type GradeBand,
  type TemplateScope,
} from "./assessment-entry.js";

const cls = { id: "c-1a", level: "JHS1", departmentId: "d-jhs" };
const generic: TemplateScope = { isActive: true, termNumber: null, subjectCode: null, classId: null, classIds: [], classLevel: null, departmentId: null };

describe("templateSpecificity", () => {
  it("applies an unrestricted template to everything, as the least specific", () => {
    expect(templateSpecificity(generic, cls, "MTH", 1)).toBe(0);
  });
  it("ignores inactive templates and ones for another term or subject", () => {
    expect(templateSpecificity({ ...generic, isActive: false }, cls, "MTH", 1)).toBeNull();
    expect(templateSpecificity({ ...generic, termNumber: 2 }, cls, "MTH", 1)).toBeNull();
    expect(templateSpecificity({ ...generic, subjectCode: "ENG" }, cls, "MTH", 1)).toBeNull();
    expect(templateSpecificity({ ...generic, subjectCode: "mth" }, cls, "MTH", 1)).toBeGreaterThan(0);
  });
  it("matches a class by id, by level or by department, and rejects others", () => {
    expect(templateSpecificity({ ...generic, classId: "c-1a" }, cls, "MTH", 1)).toBe(8);
    expect(templateSpecificity({ ...generic, classIds: ["c-9", "c-1a"] }, cls, "MTH", 1)).toBe(8);
    expect(templateSpecificity({ ...generic, classLevel: "JHS1" }, cls, "MTH", 1)).toBe(4);
    expect(templateSpecificity({ ...generic, departmentId: "d-jhs" }, cls, "MTH", 1)).toBe(2);
    expect(templateSpecificity({ ...generic, classLevel: "JHS3" }, cls, "MTH", 1)).toBeNull();
    expect(templateSpecificity({ ...generic, classId: "c-2b" }, cls, "MTH", 1)).toBeNull();
  });
  it("prefers the template made for this exact class, subject and term", () => {
    const exact = templateSpecificity({ ...generic, classId: "c-1a", subjectCode: "MTH", termNumber: 1 }, cls, "MTH", 1)!;
    const level = templateSpecificity({ ...generic, classLevel: "JHS1" }, cls, "MTH", 1)!;
    expect(exact).toBeGreaterThan(level);
  });
});

const comp = (id: string, maxMarks: number, weight: number, extra: Partial<EntryComponent> = {}): EntryComponent => ({
  id, maxMarks, weight, isRequired: true, isRepeatable: false, expectedCount: 1, ...extra,
});
const bands: GradeBand[] = [
  { grade: "A", minScore: 80, gradePoint: 4 },
  { grade: "B", minScore: 70, gradePoint: 3 },
  { grade: "C", minScore: 60, gradePoint: 2 },
  { grade: "F", minScore: 0, gradePoint: 0 },
];
const classwork30 = comp("cw", 30, 30);
const exam70 = comp("ex", 70, 70);

describe("computeStudentResult", () => {
  it("adds weighted components and grades when complete", () => {
    const r = computeStudentResult([classwork30, exam70], [{ componentId: "cw", occurrenceIndex: 0, marks: 24 }, { componentId: "ex", occurrenceIndex: 0, marks: 56 }], bands);
    expect(r).toMatchObject({ totalScore: 80, percentage: 80, complete: true, grade: "A", gradePoint: 4 });
  });
  it("scales marks to the component's weight, not its raw maximum", () => {
    // test out of 20 worth 30 percent, exam out of 100 worth 70 percent
    const r = computeStudentResult([comp("t", 20, 30), comp("e", 100, 70)], [{ componentId: "t", occurrenceIndex: 0, marks: 10 }, { componentId: "e", occurrenceIndex: 0, marks: 80 }], bands);
    expect(r.totalScore).toBe(71);          // 10/20*30 + 80/100*70 = 15 + 56
    expect(r.grade).toBe("B");
  });
  it("gives no grade until every required component has a mark", () => {
    const r = computeStudentResult([classwork30, exam70], [{ componentId: "cw", occurrenceIndex: 0, marks: 30 }], bands);
    expect(r).toMatchObject({ complete: false, grade: null, gradePoint: null, percentage: 30 });
  });
  it("lets an optional component be left empty", () => {
    const r = computeStudentResult([classwork30, comp("bonus", 10, 0, { isRequired: false }), exam70], [{ componentId: "cw", occurrenceIndex: 0, marks: 15 }, { componentId: "ex", occurrenceIndex: 0, marks: 35 }], bands);
    expect(r).toMatchObject({ complete: true, percentage: 50, grade: "F" });
  });
  it("averages a repeatable component over the marks entered", () => {
    const quizzes = comp("q", 10, 20, { isRepeatable: true, expectedCount: 3 });
    const r = computeStudentResult([quizzes, comp("e", 80, 80)], [
      { componentId: "q", occurrenceIndex: 0, marks: 10 },
      { componentId: "q", occurrenceIndex: 1, marks: 5 },
      { componentId: "e", occurrenceIndex: 0, marks: 80 },
    ], bands);
    expect(r.totalScore).toBe(95);          // avg(1, .5)=.75 x 20 = 15, plus 80
    expect(r.grade).toBe("A");
  });
  it("still grades a percentage that falls in a gap between bands", () => {
    const r = computeStudentResult([comp("x", 100, 100)], [{ componentId: "x", occurrenceIndex: 0, marks: 79.5 }], bands);
    expect(r.grade).toBe("B");
  });
  it("copes with no components", () => {
    expect(computeStudentResult([], [], bands)).toMatchObject({ percentage: 0, totalScore: 0 });
  });
});

describe("rankByPercentage", () => {
  it("ranks high to low with shared places for ties, skipping ungraded", () => {
    const ranks = rankByPercentage([
      { id: "a", percentage: 90 }, { id: "b", percentage: 75 }, { id: "c", percentage: 75 }, { id: "d", percentage: 60 }, { id: "e", percentage: null },
    ]);
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c"), ranks.get("d"), ranks.has("e")]).toEqual([1, 2, 2, 4, false]);
  });
});

describe("validateMarks", () => {
  const components = [classwork30, exam70, comp("q", 10, 20, { isRepeatable: true, expectedCount: 3 })];
  const entry = (componentId: string, marks: number | null, occurrenceIndex = 0) => ({ studentId: "s1", componentId, occurrenceIndex, marks });
  it("accepts marks within limits, zero, and clearing", () => {
    expect(validateMarks([entry("cw", 30), entry("ex", 0), entry("q", 7, 2), entry("cw", null)], components)).toEqual([]);
  });
  it("rejects negative, too-high and non-numeric marks", () => {
    const problems = validateMarks([entry("cw", 31), entry("ex", -1), entry("ex", Number.NaN)], components);
    expect(problems).toHaveLength(3);
    expect(problems[0].message).toContain("0 and 30");
  });
  it("rejects unknown components and slots that do not exist", () => {
    expect(validateMarks([entry("nope", 1)], components)).toHaveLength(1);
    expect(validateMarks([entry("cw", 1, 1)], components)).toHaveLength(1);     // not repeatable
    expect(validateMarks([entry("q", 1, 3)], components)).toHaveLength(1);      // only 0..2
  });
});
