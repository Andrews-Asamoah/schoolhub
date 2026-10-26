import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { preparePayrollPayslip, type PayrollPersonForDraft } from "./payroll-draft.helpers.js";
import type { PayrollSettings } from "./payroll/payroll-calculator.js";

const D = (value: string) => new Prisma.Decimal(value);
const periodEnd = new Date("2027-01-31T00:00:00.000Z");
const settings: PayrollSettings = {
  rounding: "HALF_UP",
  taxSchedule: { bands: [{ width: "1000", rate: "0" }, { width: null, rate: "20" }], nonResidentRate: "25" },
  schemes: [{ key: "SSNIT_TIER1", label: "SSNIT Tier 1", base: "BASIC",
    employeeRate: "5.5", employerRate: "13", memoRate: "0", employeeShareTaxDeductible: true }],
};
const profile = {
  id: "profile-1", basicSalary: D("2000.00"), residency: "RESIDENT" as const,
  schemeKeys: ["SSNIT_TIER1"], recurringItems: [], loans: [],
};
const person: PayrollPersonForDraft = {
  teacherId: "teacher-1", staffId: null, legacySalary: D("1800"), profile,
};

describe("P1 persisted payslip preparation", () => {
  it("uses the effective profile rather than stale legacy salary and persists exact lines and settings", () => {
    const result = preparePayrollPayslip("school-1", person, settings, periodEnd, [], []);
    expect(result?.basicSalary.toFixed(2)).toBe("2000.00");
    expect(result?.residency).toBe("RESIDENT");
    expect(result?.lines.create.some(l => l.kind === "EARNING" && l.code === "BASIC")).toBe(true);
    expect(result?.lines.create.some(l => l.kind === "TAX" && l.code === "PAYE")).toBe(true);
    const snap = result?.calculationSnapshot as unknown as Record<string, unknown>;
    expect(snap.source).toBe("EFFECTIVE_DATED_PROFILE");
    expect(snap.profileId).toBe("profile-1");
  });

  it("applies taxable allowances and deductions by effective dates", () => {
    const item = { effectiveFrom: new Date("2027-01-01T00:00:00Z"), effectiveTo: null };
    const result = preparePayrollPayslip("school-1", {
      ...person, profile: { ...profile, recurringItems: [
        { ...item, earningTypeId: "earning-1", deductionTypeId: null, amount: D("100.25") },
        { ...item, earningTypeId: null, deductionTypeId: "deduction-1", amount: D("50.00") },
        { ...item, earningTypeId: null, deductionTypeId: "deduction-1",
          amount: D("500.00"), effectiveFrom: new Date("2027-02-01T00:00:00Z") },
      ] },
    }, settings, periodEnd,
    [{ id: "earning-1", code: "TRANSPORT", name: "Transport allowance", taxable: true, pensionable: false, isActive: true }],
    [{ id: "deduction-1", code: "UNION", name: "Union dues", isActive: true }]);
    expect(result?.grossSalary.toFixed(2)).toBe("2100.25");
    expect(result?.allowances.toFixed(2)).toBe("100.25");
    expect(result?.otherDeductions.toFixed(2)).toBe("50.00");
    expect(result?.lines.create.some(l => l.code === "UNION")).toBe(true);
  });

  it("honours non-resident profiles", () => {
    const result = preparePayrollPayslip("school-1", {
      ...person, profile: { ...profile, residency: "NON_RESIDENT" },
    }, settings, periodEnd, [], []);
    expect(result?.incomeTax.toFixed(2)).toBe("472.50"); // (2000 - 110) x 25%
  });

  it("identifies transitional salary-register payslips without guessing rates", () => {
    const result = preparePayrollPayslip("school-1", { ...person, profile: null }, settings, periodEnd, [], []);
    const snap = result?.calculationSnapshot as unknown as Record<string, unknown>;
    expect(snap.source).toBe("LEGACY_SALARY_REGISTER_PENDING_BACKFILL");
    expect(result?.basicSalary.toFixed(2)).toBe("1800.00");
  });

  it("refuses unsafe active loans until a loan receivable is posted", () => {
    expect(() => preparePayrollPayslip("school-1", {
      ...person, profile: { ...profile, loans: [
        { id: "loan-1", principal: D("1000"), instalment: D("100"), balance: D("500"),
          startDate: new Date("2026-12-01T00:00:00Z"), status: "ACTIVE" },
      ] },
    }, settings, periodEnd, [], [])).toThrow(/approved loan receivable/);
  });

  it("does not silently credit Tier 3 deductions to the SSNIT payable", () => {
    const extra = { key: "SSNIT_TIER3", label: "Tier 3", base: "BASIC" as const,
      employeeRate: "2", employerRate: "0", memoRate: "0", employeeShareTaxDeductible: true };
    expect(() => preparePayrollPayslip("school-1", {
      ...person, profile: { ...profile, schemeKeys: ["SSNIT_TIER1", "SSNIT_TIER3"] },
    }, { ...settings, schemes: [...settings.schemes, extra] }, periodEnd, [], [])).toThrow(/own payable/);
  });
});
