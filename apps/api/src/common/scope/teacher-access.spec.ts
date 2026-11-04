import { describe, expect, it } from "vitest";
import { canEnterComponentMarks, canEnterMarks, canMarkRegister, canViewMarks } from "./teacher-access.js";
import type { TeacherAssignments } from "./teacher-scope.service.js";

const ama: TeacherAssignments = {
  teacherId: "t-ama",
  classTeacherClassIds: ["c-1a"],
  subjectAssignments: [
    { classId: "c-1a", subjectId: "math" },
    { classId: "c-1b", subjectId: "math" },
  ],
  subjectStrandAssignments: [
    { classId: "c-1a", subjectId: "cad", subjectStrandId: "arts" },
  ],
};
const none: TeacherAssignments = { teacherId: null, classTeacherClassIds: [], subjectAssignments: [], subjectStrandAssignments: [] };

describe("canMarkRegister", () => {
  it("keeps attendance marking restricted to assigned class teachers", () => {
    for (const role of ["owner", "admin", "headteacher", "accountant", "staff", "student", undefined]) {
      expect(canMarkRegister(role, none, ["c-9"])).toBe(false);
    }
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

describe("strand-level assessment permissions", () => {
  it("allows a specialist to edit only their assigned strand in their assigned class", () => {
    expect(canEnterComponentMarks("teacher", ama, "c-1a", "cad", "arts")).toBe(true);
    expect(canEnterComponentMarks("teacher", ama, "c-1a", "cad", "music")).toBe(false);
    expect(canEnterComponentMarks("teacher", ama, "c-1b", "cad", "arts")).toBe(false);
    expect(canEnterComponentMarks("teacher", ama, "c-1a", "cad", null)).toBe(false);
  });

  it("retains manager permissions and legacy single-teacher subjects", () => {
    expect(canEnterComponentMarks("admin", none, "c-1a", "cad", "music")).toBe(true);
    expect(canEnterComponentMarks("teacher", ama, "c-1a", "math", null)).toBe(true);
    expect(canViewMarks("teacher", ama, "c-1a", "cad")).toBe(true);
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
