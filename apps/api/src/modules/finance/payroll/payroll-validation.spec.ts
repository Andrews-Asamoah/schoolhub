import { describe, expect, it } from "vitest";
import { findOverlaps, payrollMonthEnd, pickEffective, validateContributionScheme, validateEffectiveRange, validateRounding, validateTaxSchedule } from "./payroll-validation.js";
import { PayrollCalculationError } from "./payroll-money.js";

const goodBands = [
  { width: "588", rate: "0" },
  { width: "80", rate: "5" },
  { width: null, rate: "35" },
];

describe("validateTaxSchedule", () => {
  it("accepts a normal schedule", () => {
    expect(validateTaxSchedule({ bands: goodBands, nonResidentRate: "25" })).toEqual({ errors: [], warnings: [] });
  });
  it("requires bands and an open-ended last band", () => {
    expect(validateTaxSchedule({ bands: [], nonResidentRate: "25" }).errors).toHaveLength(1);
    expect(validateTaxSchedule({ bands: [{ width: "100", rate: "0" }], nonResidentRate: "25" }).errors[0]).toMatch(/open-ended/);
  });
  it("rejects an open-ended band that is not last, zero widths and bad rates", () => {
    const result = validateTaxSchedule({ bands: [{ width: null, rate: "0" }, { width: "0", rate: "101" }, { width: null, rate: "5" }], nonResidentRate: "abc" });
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
  it("warns when the first band is not 0%", () => {
    expect(validateTaxSchedule({ bands: [{ width: "100", rate: "5" }, { width: null, rate: "10" }], nonResidentRate: "25" }).warnings).toHaveLength(1);
  });
});

describe("validateContributionScheme", () => {
  const scheme = { key: "TIER2", label: "Tier 2", base: "BASIC" as const, employeeRate: "0", employerRate: "0", memoRate: "5", employeeShareTaxDeductible: false };
  it("accepts a carved-out Tier 2", () => {
    expect(validateContributionScheme(scheme).errors).toEqual([]);
  });
  it("rejects a bad code, rate and insurable range", () => {
    const result = validateContributionScheme({ ...scheme, key: "bad key", employeeRate: "150", insurableMin: "100", insurableMax: "50" });
    expect(result.errors).toHaveLength(3);
  });
  it("warns when every rate is zero", () => {
    expect(validateContributionScheme({ ...scheme, memoRate: "0" }).warnings).toHaveLength(1);
  });
});

describe("validateRounding", () => {
  it("accepts known modes only", () => {
    expect(validateRounding("HALF_UP").errors).toEqual([]);
    expect(validateRounding("NEAREST").errors).toHaveLength(1);
  });
});

describe("effective dating", () => {
  const ranges = [
    { id: "old", effectiveFrom: "2024-01-01", effectiveTo: "2026-08-31" },
    { id: "new", effectiveFrom: "2026-09-01", effectiveTo: null },
  ];
  it("finds no overlap for back-to-back ranges and flags real overlaps", () => {
    expect(findOverlaps(ranges)).toEqual([]);
    expect(findOverlaps([...ranges, { id: "bad", effectiveFrom: "2026-06-01", effectiveTo: "2026-12-31" }])).toEqual([["old", "bad"], ["new", "bad"]]);
  });
  it("picks the setting in force on a day", () => {
    expect(pickEffective(ranges, "2026-08-31")?.id).toBe("old");
    expect(pickEffective(ranges, "2026-09-30")?.id).toBe("new");
    expect(pickEffective(ranges, "2023-12-31")).toBeUndefined();
  });
  it("refuses ambiguity", () => {
    expect(() => pickEffective([ranges[1]!, { id: "dup", effectiveFrom: "2026-09-01", effectiveTo: null }], "2026-10-31")).toThrow(PayrollCalculationError);
  });
  it("validates ranges and month ends", () => {
    expect(validateEffectiveRange({ effectiveFrom: "2026-09-01", effectiveTo: null })).toEqual([]);
    expect(validateEffectiveRange({ effectiveFrom: "2026-09-01", effectiveTo: "2026-08-01" })).toHaveLength(1);
    expect(payrollMonthEnd(2026, 2)).toBe("2026-02-28");
    expect(payrollMonthEnd(2028, 2)).toBe("2028-02-29");
    expect(payrollMonthEnd(2026, 12)).toBe("2026-12-31");
    expect(() => payrollMonthEnd(2026, 13)).toThrow(PayrollCalculationError);
  });
});
