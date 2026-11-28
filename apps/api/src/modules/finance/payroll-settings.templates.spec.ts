import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculatePayslip } from "./payroll/payroll-calculator.js";
import { assertValidTaxBands } from "./payroll-settings.js";
import { GHANA_PAYE_2026, ghanaSchemeTemplates } from "./payroll-settings.templates.js";

const settings = {
  rounding: "HALF_UP" as const,
  taxSchedule: { nonResidentRate: GHANA_PAYE_2026.nonResidentRate, bands: GHANA_PAYE_2026.bands },
  schemes: [],
};
const paye = (gross: string) => calculatePayslip(settings, {
  residency: "RESIDENT",
  earnings: [{ code: "BASIC", description: "Basic", amount: gross, taxable: true, pensionable: true, isBasic: true }],
  deductions: [], enrolments: [],
} as never) as unknown as { paye: string };

describe("Ghana starter payroll templates", () => {
  it("has contiguous, valid bands", () => {
    const bands = GHANA_PAYE_2026.bands.map((b, i) => ({ position: i, width: b.width === null ? null : new Prisma.Decimal(b.width), rate: new Prisma.Decimal(b.rate) }));
    expect(() => assertValidTaxBands(bands)).not.toThrow();
  });
  it.each([["588", "0.00"], ["1000", "54.60"], ["3000", "404.60"], ["5000", "854.50"]])("taxes GHS %s monthly at %s", (gross, expected) => {
    expect(paye(gross).paye).toBe(expected);
  });
  it("keeps Tier 2 as a memo-only scheme and every template sourced", () => {
    const [tier1, tier2] = ghanaSchemeTemplates("2026-01-01");
    expect(tier1!.key).toBe("SSNIT_TIER1");
    expect([tier2!.employeeRate, tier2!.employerRate, tier2!.memoRate]).toEqual(["0", "0", "5"]);
    expect(GHANA_PAYE_2026.sourceNote.length).toBeGreaterThan(20);
  });
});
