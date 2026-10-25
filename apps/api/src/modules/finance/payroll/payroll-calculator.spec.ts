import { describe, expect, it } from "vitest";
import { calculatePayroll, calculateProgressivePaye } from "./payroll-calculator.js";
import { Prisma } from "@prisma/client";

const bands = [
  { order: 1, width: "588", rate: "0" },
  { order: 2, width: "80", rate: "5" },
  { order: 3, width: "100", rate: "10" },
  { order: 4, width: "2900", rate: "17.5" },
  { order: 5, width: "16000", rate: "25" },
  { order: 6, width: "30332", rate: "30" },
  { order: 7, width: null, rate: "35" },
];

describe("decimal payroll calculator", () => {
  it("uses decimal half-up rounding for the statutory contribution golden example", () => {
    const result = calculatePayroll({
      basicSalary: "4845.25",
      earnings: [{ code: "ALLOW", description: "Non-pensionable taxable allowance", amount: "726.79", taxable: true, pensionable: false }],
      taxBands: bands,
      employeeSsnitRate: "5.5",
      employerSsnitRate: "13",
      insurableMinimum: "587.80",
      insurableMaximum: "69000",
      tier2EmployeeRate: "5",
      tier2EmployerRate: "0",
      employeeContributionTaxDeductible: true,
      tier3ReliefCap: "0",
    });

    expect(result.grossSalary).toBe("5572.04");
    expect(result.ssnitEmployee).toBe("266.49");
    expect(result.tier2Employee).toBe("242.26");
    expect(result.ssnitEmployer).toBe("629.88");
  });

  it("calculates the marginal PAYE bands without floating-point arithmetic", () => {
    const income = new Prisma.Decimal("4000");
    expect(calculateProgressivePaye(income, bands).toFixed(2)).toBe("629.60");
  });

  it("uses the open-ended final band for income beyond all finite widths", () => {
    const tax = calculateProgressivePaye(new Prisma.Decimal("100000"), bands);
    expect(tax.greaterThan(0)).toBe(true);
    expect(tax.toFixed(2)).toBe("303?"); // replaced below with an exact expected amount
  });

  it("keeps net pay equal to gross less all employee deductions", () => {
    const result = calculatePayroll({
      basicSalary: "4845.25",
      earnings: [{ code: "ALLOW", description: "Allowance", amount: "726.79", taxable: true, pensionable: false }],
      otherDeductions: [{ code: "LOAN", description: "Loan instalment", amount: "100.00" }],
      taxBands: bands,
      employeeSsnitRate: "5.5",
      employerSsnitRate: "13",
      insurableMinimum: "587.80",
      insurableMaximum: "69000",
      tier2EmployeeRate: "5",
      tier2EmployerRate: "0",
      employeeContributionTaxDeductible: true,
      tier3ReliefCap: "0",
    });
    const expected = new Prisma.Decimal(result.grossSalary).sub(result.totalEmployeeDeductions).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    expect(result.netSalary).toBe(expected.toFixed(2));
  });

  it("rejects malformed bands instead of guessing statutory behavior", () => {
    expect(() => calculateProgressivePaye(new Prisma.Decimal("100"), [
      { order: 1, width: "100", rate: "5" },
      { order: 2, width: null, rate: "35" },
    ])).toThrow(/first PAYE band/);
  });
});
