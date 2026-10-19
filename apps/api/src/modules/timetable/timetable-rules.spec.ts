import { describe, expect, it } from "vitest";
import { findPlacementClash, periodsOverlap, planPeriodCopy, type SlotUsage } from "./timetable-rules.js";

const lesson = (over: Partial<SlotUsage>): SlotUsage => ({
  id: "e1",
  classId: "c1",
  className: "Basic 1",
  teacherId: "t1",
  classroomId: "r1",
  type: "LESSON",
  ...over,
});

describe("periodsOverlap", () => {
  it("detects overlapping and touching periods correctly", () => {
    expect(periodsOverlap({ startTime: "08:00", endTime: "08:40" }, { startTime: "08:30", endTime: "09:10" })).toBe(true);
    expect(periodsOverlap({ startTime: "08:00", endTime: "08:40" }, { startTime: "08:40", endTime: "09:20" })).toBe(false);
  });
});

describe("findPlacementClash", () => {
  const next = { classId: "c2", teacherId: "t2", classroomId: "r2", type: "LESSON" as const };

  it("allows a free slot", () => {
    expect(findPlacementClash([lesson({})], next)).toBeNull();
  });
  it("blocks a class that is already busy", () => {
    expect(findPlacementClash([lesson({})], { ...next, classId: "c1" })).toMatch(/class already/i);
  });
  it("blocks a teacher teaching two classes at once", () => {
    expect(findPlacementClash([lesson({})], { ...next, teacherId: "t1" })).toMatch(/teacher is already teaching Basic 1/);
  });
  it("blocks a double-booked room", () => {
    expect(findPlacementClash([lesson({})], { ...next, classroomId: "r1" })).toMatch(/room is already used/);
  });
  it("lets the same entry be edited without clashing with itself", () => {
    expect(findPlacementClash([lesson({})], { id: "e1", classId: "c1", teacherId: "t1", classroomId: "r1", type: "LESSON" })).toBeNull();
  });
  it("ignores teachers and rooms for breaks", () => {
    expect(findPlacementClash([lesson({})], { ...next, teacherId: "t1", classroomId: "r1", type: "BREAK" })).toBeNull();
  });
});

describe("planPeriodCopy", () => {
  const p = (name: string, startTime: string, endTime: string, sortOrder = 0) => ({ name, startTime, endTime, sortOrder });

  it("copies everything into an empty department", () => {
    const plan = planPeriodCopy([p("P1", "08:00", "08:40"), p("P2", "08:40", "09:20", 1)], []);
    expect(plan.create).toHaveLength(2);
    expect(plan.skipped).toHaveLength(0);
  });
  it("skips identical times and reports overlaps separately", () => {
    const plan = planPeriodCopy(
      [p("P1", "08:00", "08:40"), p("P2", "08:40", "09:20", 1), p("P3", "09:20", "10:00", 2)],
      [{ startTime: "08:00", endTime: "08:40" }, { startTime: "09:00", endTime: "09:30" }],
    );
    expect(plan.create.map((x) => x.name)).toEqual([]);
    expect(plan.skipped.map((x) => x.reason)).toEqual(["exists", "overlap", "overlap"]);
  });
});
