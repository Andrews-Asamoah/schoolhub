import { describe, expect, it } from "vitest";
import {
  approvalProblem,
  cellId,
  classStats,
  cleanExcused,
  completion,
  correctionAllowed,
  effectiveChanges,
  effectiveDeadline,
  reasonProblem,
  sheetLock,
  submissionBlockers,
  trackingStatus,
} from "./assessment-workflow.js";

const d = (value: string) => new Date(value);
const now = d("2026-11-10T12:00:00Z");

describe("effectiveDeadline", () => {
  it("returns null when the assessment has no deadline", () => {
    expect(effectiveDeadline(null, [{ teacherId: null, deadline: d("2026-12-01") }], "t1")).toBeNull();
  });
  it("uses the latest of the base, class-wide and this teacher's extension", () => {
    const base = d("2026-11-01");
    expect(effectiveDeadline(base, [{ teacherId: null, deadline: d("2026-11-05") }], "t1")).toEqual(d("2026-11-05"));
    expect(effectiveDeadline(base, [
      { teacherId: null, deadline: d("2026-11-05") },
      { teacherId: "t1", deadline: d("2026-11-09") },
    ], "t1")).toEqual(d("2026-11-09"));
  });
  it("ignores another teacher's extension and never shortens the deadline", () => {
    const base = d("2026-11-10");
    expect(effectiveDeadline(base, [{ teacherId: "t2", deadline: d("2026-12-01") }], "t1")).toEqual(base);
    expect(effectiveDeadline(base, [{ teacherId: null, deadline: d("2026-11-01") }], "t1")).toEqual(base);
  });
});

describe("sheetLock", () => {
  const open = { templateLocked: false, submitted: false, deadline: null, now, canEnterAnyComponent: true };
  it("lets an open sheet be edited", () => expect(sheetLock(open)).toBeNull());
  it("locks by template, submission, then deadline, in that order", () => {
    expect(sheetLock({ ...open, templateLocked: true, submitted: true })).toBe("TEMPLATE_LOCKED");
    expect(sheetLock({ ...open, submitted: true, deadline: d("2026-11-01") })).toBe("SUBMITTED");
    expect(sheetLock({ ...open, deadline: d("2026-11-01") })).toBe("DEADLINE_PASSED");
  });
  it("allows entry right up to the deadline", () => {
    expect(sheetLock({ ...open, deadline: d("2026-11-10T12:00:00Z") })).toBeNull();
  });
  it("reports a missing teaching area last", () => {
    expect(sheetLock({ ...open, canEnterAnyComponent: false })).toBe("NO_TEACHING_AREA");
  });
  it("lets a correction lift every lock except a missing teaching area", () => {
    expect(correctionAllowed("DEADLINE_PASSED")).toBe(true);
    expect(correctionAllowed("SUBMITTED")).toBe(true);
    expect(correctionAllowed("TEMPLATE_LOCKED")).toBe(true);
    expect(correctionAllowed("NO_TEACHING_AREA")).toBe(false);
    expect(correctionAllowed(null)).toBe(false);
  });
});

describe("completion and status", () => {
  const roster = ["a", "b", "c", "d", "e"];
  const progress = new Map([
    ["a", { complete: true, hasMarks: true }],
    ["b", { complete: false, hasMarks: true }],
    ["c", { complete: false, hasMarks: false }],
  ]);
  it("counts complete, excused, partial and missing pupils", () => {
    const stats = completion(roster, progress, new Set(["c"]));
    expect(stats).toEqual({ total: 5, complete: 1, excused: 1, partial: 1, missing: 2, percent: 40 });
  });
  it("counts a complete pupil once even if also excused", () => {
    expect(completion(["a"], progress, new Set(["a"]))).toMatchObject({ complete: 1, excused: 0, percent: 100 });
  });
  it("handles an empty roster", () => {
    expect(completion([], new Map(), new Set())).toMatchObject({ total: 0, percent: 0 });
    expect(trackingStatus(completion([], new Map(), new Set()), false, null, now)).toBe("NO_PUPILS");
  });
  it("derives a tracking status", () => {
    const none = completion(roster, new Map(), new Set());
    expect(trackingStatus(none, false, d("2026-12-01"), now)).toBe("NOT_STARTED");
    expect(trackingStatus(none, false, d("2026-11-01"), now)).toBe("OVERDUE");
    expect(trackingStatus(completion(roster, progress, new Set()), false, d("2026-12-01"), now)).toBe("IN_PROGRESS");
    expect(trackingStatus(none, true, d("2026-11-01"), now)).toBe("SUBMITTED");
    const done = completion(["a"], progress, new Set());
    expect(trackingStatus(done, false, d("2026-11-01"), now)).toBe("COMPLETE");
  });
  it("lists the pupils still blocking a submission", () => {
    expect(submissionBlockers(roster, progress, new Set(["c"]))).toEqual(["b", "d", "e"]);
    expect(submissionBlockers(["a"], progress, new Set())).toEqual([]);
  });
  it("keeps only excused pupils who are on the roster, once each", () => {
    expect(cleanExcused(["a", "a", "zz"], roster)).toEqual(["a"]);
  });
});

describe("effectiveChanges", () => {
  const current = new Map([[cellId("s1", "c1", 0), 10], [cellId("s2", "c1", 0), 5]]);
  it("drops no-op edits and keeps the last edit per cell", () => {
    const changes = effectiveChanges([
      { studentId: "s1", componentId: "c1", occurrenceIndex: 0, marks: 10 },
      { studentId: "s2", componentId: "c1", occurrenceIndex: 0, marks: 7 },
      { studentId: "s2", componentId: "c1", occurrenceIndex: 0, marks: 8 },
      { studentId: "s3", componentId: "c1", occurrenceIndex: 0, marks: null },
      { studentId: "s1", componentId: "c2", occurrenceIndex: 0, marks: 3 },
    ], current);
    expect(changes).toEqual([
      { studentId: "s2", componentId: "c1", occurrenceIndex: 0, before: 5, after: 8 },
      { studentId: "s1", componentId: "c2", occurrenceIndex: 0, before: null, after: 3 },
    ]);
  });
  it("treats clearing an existing mark as a change", () => {
    expect(effectiveChanges([{ studentId: "s1", componentId: "c1", occurrenceIndex: 0, marks: null }], current))
      .toEqual([{ studentId: "s1", componentId: "c1", occurrenceIndex: 0, before: 10, after: null }]);
  });
});

describe("approvalProblem and reasonProblem", () => {
  it("allows only owner and headteacher to decide", () => {
    expect(approvalProblem({ role: "admin", reviewerId: "u1", requesterId: "u2" })).not.toBeNull();
    expect(approvalProblem({ role: "teacher", reviewerId: "u1", requesterId: "u2" })).not.toBeNull();
    expect(approvalProblem({ role: "headteacher", reviewerId: "u1", requesterId: "u2" })).toBeNull();
  });
  it("blocks self-approval except for the owner", () => {
    expect(approvalProblem({ role: "headteacher", reviewerId: "u1", requesterId: "u1" })).not.toBeNull();
    expect(approvalProblem({ role: "owner", reviewerId: "u1", requesterId: "u1" })).toBeNull();
  });
  it("requires a reason of sensible length", () => {
    expect(reasonProblem("short")).not.toBeNull();
    expect(reasonProblem("Mark was transposed on the script.")).toBeNull();
    expect(reasonProblem("x".repeat(2001))).not.toBeNull();
  });
});

describe("classStats", () => {
  it("summarises a class", () => {
    expect(classStats([40, 50, 60, 90])).toEqual({ count: 4, mean: 60, median: 55, highest: 90, lowest: 40, passRate: 75 });
  });
  it("returns nulls for no results", () => {
    expect(classStats([])).toEqual({ count: 0, mean: null, median: null, highest: null, lowest: null, passRate: null });
  });
});

import { hasAllRequired, rollupByTeacher } from "./assessment-workflow.js";

describe("hasAllRequired", () => {
  const components = [{ id: "a", isRequired: true }, { id: "b", isRequired: false }, { id: "c", isRequired: true }];
  it("needs every required component and ignores optional ones", () => {
    expect(hasAllRequired(components, new Set(["a", "c"]))).toBe(true);
    expect(hasAllRequired(components, new Set(["a", "b"]))).toBe(false);
    expect(hasAllRequired([], new Set())).toBe(true);
  });
});

describe("rollupByTeacher", () => {
  it("groups sheets per teacher, counts shared sheets for each and lists the unassigned", () => {
    const rows = rollupByTeacher([
      { teacherIds: ["t1"], status: "OVERDUE", total: 10, done: 2 },
      { teacherIds: ["t1", "t2"], status: "SUBMITTED", total: 10, done: 10 },
      { teacherIds: [], status: "NOT_STARTED", total: 5, done: 0 },
    ]);
    const t1 = rows.find((row) => row.teacherId === "t1")!;
    expect(t1).toMatchObject({ sheets: 2, submitted: 1, overdue: 1, pupils: 20, done: 12, percent: 60 });
    expect(rows.find((row) => row.teacherId === "t2")).toMatchObject({ sheets: 1, percent: 100 });
    expect(rows.find((row) => row.teacherId === null)).toMatchObject({ sheets: 1, percent: 0 });
    expect(rows[0]!.teacherId).toBe("t1"); // most overdue first
  });
});
