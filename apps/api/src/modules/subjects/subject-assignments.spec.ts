import { describe, expect, it } from "vitest";
import { findUnqualifiedTeachers } from "./subject-assignments.js";

const qualified = new Set(["t-math"]);
const none = new Map<string, string | null>();

describe("findUnqualifiedTeachers", () => {
  it("accepts teachers assigned to the subject and classes with no teacher", () => {
    expect(
      findUnqualifiedTeachers(
        [{ classId: "c1", teacherId: "t-math" }, { classId: "c2", teacherId: null }, { classId: "c3" }],
        qualified,
        none,
      ),
    ).toEqual([]);
  });
  it("rejects a teacher who is not assigned to the subject", () => {
    expect(findUnqualifiedTeachers([{ classId: "c1", teacherId: "t-art" }], qualified, none)).toEqual(["t-art"]);
  });
  it("lists each offending teacher once", () => {
    expect(
      findUnqualifiedTeachers(
        [{ classId: "c1", teacherId: "t-art" }, { classId: "c2", teacherId: "t-art" }],
        qualified,
        none,
      ),
    ).toEqual(["t-art"]);
  });
  it("keeps an existing assignment that predates the rule", () => {
    expect(
      findUnqualifiedTeachers([{ classId: "c1", teacherId: "t-art" }], qualified, new Map([["c1", "t-art"]])),
    ).toEqual([]);
  });
  it("does not let an old assignment in one class excuse the same teacher in another", () => {
    expect(
      findUnqualifiedTeachers(
        [{ classId: "c1", teacherId: "t-art" }, { classId: "c2", teacherId: "t-art" }],
        qualified,
        new Map([["c1", "t-art"]]),
      ),
    ).toEqual(["t-art"]);
  });
});
