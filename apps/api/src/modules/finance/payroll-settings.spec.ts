import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resolvePayrollSettings } from "./payroll-settings.js";

const D = (value: string) => new Prisma.Decimal(value);
const tax = {
  id: "t", schoolId: null, status: "ACTIVE", effectiveFrom: new Date("2026-09-01T00:00:00Z"),
  effectiveTo: null, approvedById: "reviewer", sourceNote: "Official schedule, accountant verified",
  nonResidentRate: D("25"), bands: [
    { position: 0, width: D("588"), rate: D("0") }, { position: 1, width: null, rate: D("25") },
  ],
};
const tier = {
  id: "s", schoolId: null, key: "SSNIT_TIER1", label: "Tier 1", trustee: null, base: "BASIC",
  status: "ACTIVE", effectiveFrom: new Date("2026-09-01T00:00:00Z"), effectiveTo: null,
  approvedById: "reviewer", sourceNote: "Official source",
  employeeRate: D("5.5"), employerRate: D("13"), memoRate: D("0"),
  insurableMin: D("587.80"), insurableMax: D("69000"), employeeShareTaxDeductible: true,
};

describe("P1 approved payroll settings resolution", () => {
  it("rejects an uncovered period rather than reusing last year's bands", () => {
    expect(() => resolvePayrollSettings("school", new Date("2026-08-31T00:00:00Z"), [tax], [tier])).toThrow(/Missing/);
  });
  it("returns a documented approved version and exact strings", () => {
    const result = resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [tax], [tier]);
    expect(result.taxScheduleId).toBe("t");
    expect(result.settings.schemes[0]?.employeeRate).toBe("5.5");
  });
  it("blocks draft and undocumented settings", () => {
    expect(() => resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [{ ...tax, status: "DRAFT" }], [tier])).toThrow();
    expect(() => resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [tax], [{ ...tier, sourceNote: null }])).toThrow();
  });
  it("ignores optional schemes that are draft, retired or outside the period", () => {
    const tier3 = { ...tier, id: "draft-tier3", key: "SSNIT_TIER3", status: "DRAFT" };
    const result = resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [tax], [tier, tier3]);
    expect(result.schemeIds).toEqual(["s"]);
    expect(result.settings.schemes.map(s => s.key)).toEqual(["SSNIT_TIER1"]);
  });

  it("blocks overlapping school-specific schedules", () => {
    const local = { ...tax, schoolId: "school" };
    expect(() => resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [tax, local, { ...local, id: "dup" }], [tier])).toThrow(/overlapping/);
  });
  it("prefers an approved school-specific override", () => {
    const result = resolvePayrollSettings("school", new Date("2027-01-31T00:00:00Z"), [tax, { ...tax, id: "local", schoolId: "school" }], [tier]);
    expect(result.taxScheduleId).toBe("local");
  });
});
