import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PayrollSettings } from "./payroll/payroll-calculator.js";

type TaxScheduleRow = {
  id: string; schoolId: string | null; status: string; effectiveFrom: Date; effectiveTo: Date | null;
  nonResidentRate: Prisma.Decimal; sourceNote: string | null; approvedById: string | null;
  bands: Array<{ position: number; width: Prisma.Decimal | null; rate: Prisma.Decimal }>;
};
type SchemeRow = {
  id: string; schoolId: string | null; key: string; label: string; trustee: string | null; base: string;
  status: string; effectiveFrom: Date; effectiveTo: Date | null;
  employeeRate: Prisma.Decimal; employerRate: Prisma.Decimal; memoRate: Prisma.Decimal;
  insurableMin: Prisma.Decimal | null; insurableMax: Prisma.Decimal | null;
  employeeShareTaxDeductible: boolean; sourceNote: string | null; approvedById: string | null;
};
const day = (value: Date) => value.toISOString().slice(0, 10);
const applies = (r: { effectiveFrom: Date; effectiveTo: Date | null }, date: Date) =>
  day(r.effectiveFrom) <= day(date) && (r.effectiveTo === null || day(r.effectiveTo) >= day(date));

/** Bands must be contiguous, every band but the last bounded, the last open-ended, rates 0-100. */
export function assertValidTaxBands<T extends { position: number; width: Prisma.Decimal | null; rate: Prisma.Decimal }>(input: readonly T[]): T[] {
  const bands = [...input].sort((a, b) => a.position - b.position);
  const first = bands[0];
  const invalid = !first || (first.position !== 0 && first.position !== 1)
    || bands.some((band, i) =>
      band.position !== first.position + i || band.rate.lt(0) || band.rate.gt(100)
      || (i < bands.length - 1 && (band.width === null || band.width.lte(0))))
    || bands[bands.length - 1]!.width !== null;
  if (invalid) throw new BadRequestException("PAYE tax schedule has invalid bands: they must be contiguous, bounded except the last, with rates between 0 and 100.");
  return bands;
}

/** Fails closed if a period lacks accountant-approved statutory data or has ambiguous overlaps. */
export function resolvePayrollSettings(
  schoolId: string, periodEnd: Date, taxRows: readonly TaxScheduleRow[], schemeRows: readonly SchemeRow[],
): { settings: PayrollSettings; taxScheduleId: string; schemeIds: string[] } {
  function choose<T extends { schoolId: string | null; status: string; effectiveFrom: Date; effectiveTo: Date | null; approvedById: string | null; sourceNote: string | null }>(
    rows: readonly T[], label: string,
  ): T {
    const active = rows.filter(r => r.status === "ACTIVE" && !!r.approvedById && !!r.sourceNote && applies(r, periodEnd));
    const local = active.filter(r => r.schoolId === schoolId);
    const platform = active.filter(r => r.schoolId === null);
    const selected = local.length ? local : platform;
    if (selected.length !== 1) throw new BadRequestException(
      `Missing or overlapping approved ${label} for ${day(periodEnd)}. Ask your accountant to configure and approve an effective-dated schedule.`,
    );
    return selected[0]!;
  }
  const tax = choose(taxRows, "PAYE tax schedule");
  const bands = assertValidTaxBands(tax.bands);
  // Optional schemes still in DRAFT, RETIRED or outside this period must not
  // prevent every employee from running the mandatory Tier 1 calculation.
  // A staff member enrolled in an unavailable scheme is rejected by the calculator.
  const keys = [...new Set(schemeRows
    .filter(row => row.status === "ACTIVE" && !!row.approvedById && !!row.sourceNote && applies(row, periodEnd))
    .map(row => row.key))];
  if (!keys.length) throw new BadRequestException("No payroll contribution schemes configured.");
  const selected = keys.map(key => choose(schemeRows.filter(row => row.key === key), `contribution scheme ${key}`));
  if (!selected.some(s => s.key === "SSNIT_TIER1")) throw new BadRequestException("Approved SSNIT_TIER1 contribution scheme is missing.");
  return {
    taxScheduleId: tax.id,
    schemeIds: selected.map(s => s.id),
    settings: {
      rounding: "HALF_UP",
      taxSchedule: {
        nonResidentRate: tax.nonResidentRate.toString(),
        bands: bands.map(b => ({ width: b.width?.toString() ?? null, rate: b.rate.toString() })),
      },
      schemes: selected.map(s => ({
        key: s.key, label: s.label, trustee: s.trustee, base: s.base as "BASIC" | "GROSS" | "PENSIONABLE_ITEMS",
        employeeRate: s.employeeRate.toString(), employerRate: s.employerRate.toString(),
        memoRate: s.memoRate.toString(), insurableMin: s.insurableMin?.toString() ?? null,
        insurableMax: s.insurableMax?.toString() ?? null, employeeShareTaxDeductible: s.employeeShareTaxDeductible,
      })),
    },
  };
}
