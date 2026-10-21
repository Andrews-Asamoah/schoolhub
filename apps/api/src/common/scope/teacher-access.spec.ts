import { describe, expect, it } from "vitest";
import { canEnterMarks, canMarkRegister, canViewMarks } from "./teacher-access.js";
import type { TeacherAssignments } from "./teacher-scope.service.js";

const ama: TeacherAssignments = {
  teacherId: "t-ama",
  classTeacherClassIds: ["c-1a"],
  subjectAssignments: [
    { classId: "c-1a", subjectId: "math" },
    { classId: "c-1b", subjectId: "math" },
  ],
};
const none: TeacherAssignments = { teacherId: null, classTeacherClassIds: [], subjectAssignments: [] };

describe("canMarkRegister", () => {
  it("lets managers mark any class", () => {
    for (const role of ["owner", "admin", "headmistress"]) expect(canMarkRegister(role, none, ["c-9"])).toBe(true);
  });
  it("lets a class teacher mark only their own class", () => {
    expect(canMarkRegister("teacher", ama, ["c-1a"])).toBe(true);
    expect(canMarkRegister("teacher", ama, ["c-1b"])).toBe(false);   // teaches maths there, but is not class teacher
    expect(canMarkRegister("teacher", ama, ["c-1a", "c-1b"])).toBe(false);
  });
  it("refuses everyone else and empty requests", () => {
    for (const role of ["staff", "accountant", "student", "guardian", undefined]) expect(canMarkRegister(role, ama, ["c-1a"])).toBe(false);
    expect(canMarkRegister("teacher", ama, [])).toBe(false);
    expect(canMarkRegister("teacher", none, ["c-1a"])).toBe(false);
  });
});

describe("canEnterMarks / canViewMarks", () => {
  it("lets a subject teacher enter marks for that subject in that class only", () => {
    expect(canEnterMarks("teacher", ama, "c-1a", "math")).toBe(true);
    expect(canEnterMarks("teacher", ama, "c-1a", "art")).toBe(false);
    expect(canEnterMarks("teacher", ama, "c-2a", "math")).toBe(false);
  });
  it("lets the class teacher view, but not enter, other teachers' subjects", () => {
    expect(canViewMarks("teacher", ama, "c-1a", "art")).toBe(true);
    expect(canEnterMarks("teacher", ama, "c-1a", "art")).toBe(false);
    expect(canViewMarks("teacher", ama, "c-1b", "art")).toBe(false);
  });
  it("lets managers do both and others neither", () => {
    expect(canEnterMarks("admin", none, "c-1a", "art")).toBe(true);
    expect(canViewMarks("owner", none, "c-1a", "art")).toBe(true);
    expect(canEnterMarks("staff", ama, "c-1a", "math")).toBe(false);
    expect(canViewMarks("student", ama, "c-1a", "math")).toBe(false);
  });
});
