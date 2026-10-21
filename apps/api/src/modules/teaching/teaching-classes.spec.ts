import { describe, expect, it } from "vitest";
import { buildTeachingClasses } from "./teaching-classes.js";

const classes = [
  { id: "c1", name: "JHS 1A", level: "JHS1" },
  { id: "c2", name: "JHS 1B", level: "JHS1" },
  { id: "c3", name: "JHS 2A", level: "JHS2" },
];
const subjects = [
  { id: "math", name: "Mathematics", code: "MTH" },
  { id: "sci", name: "Science", code: "SCI" },
];

describe("buildTeachingClasses", () => {
  it("flags class-teacher classes, lists subjects taught there, and puts own class first", () => {
    const result = buildTeachingClasses(
      {
        teacherId: "t1",
        classTeacherClassIds: ["c2"],
        subjectAssignments: [
          { classId: "c1", subjectId: "sci" },
          { classId: "c1", subjectId: "math" },
          { classId: "c2", subjectId: "math" },
        ],
      },
      classes,
      subjects,
      new Map([["c1", 30], ["c2", 28]]),
    );
    expect(result.map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    expect(result[0]).toMatchObject({ isClassTeacher: true, studentCount: 28 });
    expect(result[1].subjects.map((s) => s.name)).toEqual(["Mathematics", "Science"]);
    expect(result[1].isClassTeacher).toBe(false);
  });
  it("shows a class teacher's class even when they teach no subject in it", () => {
    const result = buildTeachingClasses({ teacherId: "t1", classTeacherClassIds: ["c3"], subjectAssignments: [] }, [classes[2]], subjects, new Map());
    expect(result).toEqual([{ id: "c3", name: "JHS 2A", level: "JHS2", isClassTeacher: true, studentCount: 0, subjects: [] }]);
  });
});
