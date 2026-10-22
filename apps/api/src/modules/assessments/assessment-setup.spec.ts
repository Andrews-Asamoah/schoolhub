import { describe, expect, it } from "vitest";
import {
  gradeScaleProblems,
  lockedStructureProblem,
  saveAssessmentTemplateSchema,
  saveGradingSystemSchema,
} from "@schoolhub/shared";
import { deadlineFromDate, findUncoveredPairs, narrowsCoverage, nextCopyName, slugCode } from "./assessment-setup.js";
import type { TemplateScope } from "./assessment-entry.js";

const bands = [
  { grade: "A", description: "Excellent", minScore: 80, maxScore: 100, gradePoint: 4 },
  { grade: "B", description: "Good", minScore: 70, maxScore: 79.99, gradePoint: 3 },
  { grade: "F", description: "Fail", minScore: 0, maxScore: 69.99, gradePoint: 0 },
];

describe("grade scale rules", () => {
  it("accepts a scale that covers 0 to 100 without overlaps", () => {
    expect(gradeScaleProblems(bands)).toEqual([]);
    expect(saveGradingSystemSchema.safeParse({ name: "Standard", scales: bands }).success).toBe(true);
  });
  it("rejects overlaps, repeated grades, missing coverage and backwards bands", () => {
    expect(gradeScaleProblems([{ grade: "A", minScore: 70, maxScore: 100 }, { grade: "B", minScore: 60, maxScore: 75 }, { grade: "C", minScore: 0, maxScore: 59 }]).join(" ")).toMatch(/overlaps/);
    expect(gradeScaleProblems([{ grade: "A", minScore: 50, maxScore: 100 }, { grade: "a", minScore: 0, maxScore: 49 }]).join(" ")).toMatch(/more than once/);
    expect(gradeScaleProblems([{ grade: "A", minScore: 50, maxScore: 100 }, { grade: "B", minScore: 10, maxScore: 49 }]).join(" ")).toMatch(/start at 0/);
    expect(gradeScaleProblems([{ grade: "A", minScore: 50, maxScore: 90 }, { grade: "B", minScore: 0, maxScore: 49 }]).join(" ")).toMatch(/reach 100/);
    expect(gradeScaleProblems([{ grade: "A", minScore: 90, maxScore: 80 }, { grade: "B", minScore: 0, maxScore: 79 }]).join(" ")).toMatch(/above the highest/);
  });
  it("needs at least two grades", () => {
    expect(saveGradingSystemSchema.safeParse({ name: "One", scales: [bands[0]] }).success).toBe(false);
  });
});

const comp = (name: string, weight: number, extra = {}) => ({ name, componentType: "CLASS_TEST" as const, maxMarks: 100, weight, ...extra });
const base = { name: "Termly assessment", gradingSystemId: "gs1", components: [comp("Class assessment", 30), comp("Exam", 70)] };

describe("saveAssessmentTemplateSchema", () => {
  it("accepts weights that total 100 and applies friendly defaults", () => {
    const parsed = saveAssessmentTemplateSchema.parse(base);
    expect(parsed).toMatchObject({ classIds: [], isActive: true, isLocked: false });
    expect(parsed.components[0]).toMatchObject({ isRequired: true, isRepeatable: false, expectedCount: 1 });
  });
  it("rejects weights that do not total 100, saying what they total", () => {
    const result = saveAssessmentTemplateSchema.safeParse({ ...base, components: [comp("A", 30), comp("B", 60)] });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("add up to 100%. They add up to 90%");
  });
  it("rejects repeated component names and bad maximums", () => {
    expect(saveAssessmentTemplateSchema.safeParse({ ...base, components: [comp("Exam", 50), comp("exam", 50)] }).success).toBe(false);
    expect(saveAssessmentTemplateSchema.safeParse({ ...base, components: [comp("A", 50, { maxMarks: 0 }), comp("B", 50)] }).success).toBe(false);
  });
  it("blank optional fields clear and deadline must be a date", () => {
    expect(saveAssessmentTemplateSchema.parse({ ...base, description: "", subjectCode: "", deadline: "" })).toMatchObject({ description: null, subjectCode: null, deadline: null });
    expect(saveAssessmentTemplateSchema.safeParse({ ...base, deadline: "18/12/2026" }).success).toBe(false);
  });
});

describe("lockedStructureProblem", () => {
  const existing = [
    { id: "c1", maxMarks: 30, weight: 30, componentType: "CLASS_TEST", isRequired: true, isRepeatable: false, expectedCount: 1 },
    { id: "c2", maxMarks: 70, weight: 70, componentType: "FINAL_EXAM", isRequired: true, isRepeatable: false, expectedCount: 1 },
  ];
  it("allows the same structure, with or without renaming", () => {
    expect(lockedStructureProblem(existing, existing.map((c) => ({ ...c, name: "Renamed" })))).toBeNull();
  });
  it("blocks changed marks or weights, added or removed components", () => {
    expect(lockedStructureProblem(existing, [{ ...existing[0]!, maxMarks: 40 }, existing[1]!])).toMatch(/can't change/);
    expect(lockedStructureProblem(existing, [{ ...existing[0]!, weight: 40 }, existing[1]!])).toMatch(/can't change/);
    expect(lockedStructureProblem(existing, [existing[0]!])).toMatch(/can't change/);
    expect(lockedStructureProblem(existing, [...existing, { ...existing[0]!, id: undefined }])).toMatch(/can't change/);
  });
});

describe("narrowsCoverage", () => {
  const all = { classIds: null, subjectCode: null, termNumber: null };
  it("allows widening and keeping the same coverage", () => {
    expect(narrowsCoverage({ classIds: ["a"], subjectCode: "MTH", termNumber: 1 }, all)).toBeNull();
    expect(narrowsCoverage({ classIds: ["a"], subjectCode: null, termNumber: null }, { ...all, classIds: ["a", "b"] })).toBeNull();
    expect(narrowsCoverage(all, all)).toBeNull();
  });
  it("blocks narrowing classes, subject or term", () => {
    expect(narrowsCoverage(all, { ...all, classIds: ["a"] })).toBe("classes");
    expect(narrowsCoverage({ ...all, classIds: ["a", "b"] }, { ...all, classIds: ["a"] })).toBe("classes");
    expect(narrowsCoverage(all, { ...all, subjectCode: "MTH" })).toBe("subject");
    expect(narrowsCoverage({ ...all, subjectCode: "MTH" }, { ...all, subjectCode: "ENG" })).toBe("subject");
    expect(narrowsCoverage(all, { ...all, termNumber: 2 })).toBe("term");
  });
});

describe("helpers", () => {
  it("picks the next free copy name", () => {
    expect(nextCopyName("Exam", [])).toBe("Exam (copy)");
    expect(nextCopyName("Exam", ["Exam (copy)", "exam (copy 2)"])).toBe("Exam (copy 3)");
  });
  it("makes a deadline run to the end of the day, and codes from names", () => {
    expect(deadlineFromDate("2026-12-18")?.toISOString()).toBe("2026-12-18T23:59:59.999Z");
    expect(deadlineFromDate(null)).toBeNull();
    expect(slugCode("Standard scale (A-F)")).toBe("STANDARD_SCALE_A_F");
  });
  it("finds class and subject pairs no assessment covers", () => {
    const classes = new Map([["c1", { id: "c1", name: "JHS 1A", level: "JHS1", departmentId: null }], ["c2", { id: "c2", name: "JHS 2A", level: "JHS2", departmentId: null }]]);
    const subjects = new Map([["m", { id: "m", code: "MTH", name: "Maths" }]]);
    const jhs1Only: TemplateScope = { isActive: true, termNumber: null, subjectCode: null, classId: null, classIds: [], classLevel: "JHS1", departmentId: null };
    const out = findUncoveredPairs([{ classId: "c1", subjectId: "m" }, { classId: "c2", subjectId: "m" }], classes, subjects, [jhs1Only], 1);
    expect(out).toEqual([{ classId: "c2", className: "JHS 2A", subjectId: "m", subjectName: "Maths" }]);
    expect(findUncoveredPairs([{ classId: "c2", subjectId: "m" }], classes, subjects, [], 1)).toHaveLength(1);
  });
});
