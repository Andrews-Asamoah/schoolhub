import { describe, expect, it } from "vitest";
import { buildImpact, describeBlockers, isDedicatedLogin, planGuardians } from "./student-deletion-impact.js";

describe("buildImpact", () => {
  it("allows deletion when there are no financial or exam records", () => {
    const impact = buildImpact({ enrollments: 1, attendances: 12, payments: 0, bills: 0 });
    expect(impact.canDelete).toBe(true);
    expect(impact.willDelete.map((line) => line.key)).toEqual(["enrollments", "attendances"]);
  });
  it("blocks on payments, bills, adjustments, credit and exam records", () => {
    const impact = buildImpact({ payments: 2, bills: 1, billAdjustments: 1, creditEntries: 1, externalExamCandidates: 1 });
    expect(impact.canDelete).toBe(false);
    expect(impact.blockers).toHaveLength(5);
  });
  it("describes blockers in plain words", () => {
    const text = describeBlockers(buildImpact({ payments: 3, bills: 1 }).blockers);
    expect(text).toBe("1 fee bills and 3 payments");
  });
});

describe("planGuardians", () => {
  const guardian = (id: string, linkedStudents: number) => ({ id, name: id, linkedStudents, userId: `u-${id}`, hasOtherRole: false });
  it("removes a parent whose only child is this student and keeps a parent with a sibling", () => {
    const plan = planGuardians([guardian("solo", 1), guardian("shared", 2)]);
    expect(plan.remove.map((g) => g.id)).toEqual(["solo"]);
    expect(plan.keep.map((g) => g.id)).toEqual(["shared"]);
  });
});

describe("isDedicatedLogin", () => {
  it("accepts an account that only has the expected role", () => {
    expect(isDedicatedLogin({ role: "user" }, ["guardian"], "guardian")).toBe(true);
  });
  it("refuses an account that is also staff, in another school, or a platform admin", () => {
    expect(isDedicatedLogin({ role: "user" }, ["guardian", "admin"], "guardian")).toBe(false);
    expect(isDedicatedLogin({ role: "user" }, [], "guardian")).toBe(false);
    expect(isDedicatedLogin({ role: "superAdmin" }, ["guardian"], "guardian")).toBe(false);
    expect(isDedicatedLogin(null, ["guardian"], "guardian")).toBe(false);
  });
});
