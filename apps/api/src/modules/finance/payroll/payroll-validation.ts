/**
 * Validation for statutory payroll settings an accountant enters in the portal.
 * Errors block saving or submitting for approval; warnings are shown but allowed.
 */
import { PayrollCalculationError, parseMoney, parseRate, ROUNDING_MODES } from "./payroll-money.js";
import type { ContributionSchemeInput, TaxScheduleInput } from "./payroll-calculator.js";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function attempt(errors: string[], run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof PayrollCalculationError) errors.push(error.message);
    else throw error;
  }
}

export function validateTaxSchedule(schedule: TaxScheduleInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!schedule.bands.length) {
    errors.push("Add at least one tax band.");
    return { errors, warnings };
  }
  schedule.bands.forEach((band, index) => {
    const label = `Band ${index + 1}`;
    const isLast = index === schedule.bands.length - 1;
    attempt(errors, () => parseRate(band.rate, `${label} rate`));
    if (band.width === null) {
      if (!isLast) errors.push(`${label} has no width, but only the last band can be open-ended.`);
    } else {
      attempt(errors, () => {
        if (parseMoney(band.width!, `${label} width`) <= 0n) throw new PayrollCalculationError(`${label} width must be greater than 0.`);
      });
      if (isLast) errors.push(`${label} is the last band, so it must be open-ended (leave the width empty).`);
    }
  });
  attempt(errors, () => parseRate(schedule.nonResidentRate, "Non-resident rate"));
  try {
    if (parseRate(schedule.bands[0]!.rate) !== 0n) warnings.push("The first band is normally 0%. Check this against the GRA notice.");
  } catch {
    // already reported above
  }
  return { errors, warnings };
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export function validateContributionScheme(scheme: ContributionSchemeInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!KEY_PATTERN.test(scheme.key)) errors.push("Scheme code must be 2–40 characters: capital letters, numbers and underscores, starting with a letter.");
  if (!scheme.label.trim()) errors.push("Give the scheme a name.");
  if (!["BASIC", "GROSS", "PENSIONABLE_ITEMS"].includes(scheme.base)) errors.push("Choose what the contribution is calculated on.");
  attempt(errors, () => parseRate(scheme.employeeRate, "Employee rate"));
  attempt(errors, () => parseRate(scheme.employerRate, "Employer rate"));
  attempt(errors, () => parseRate(scheme.memoRate, "Memo rate"));
  if (scheme.reliefCapRate) attempt(errors, () => parseRate(scheme.reliefCapRate!, "Tax relief cap"));
  let min: bigint | null = null;
  let max: bigint | null = null;
  if (scheme.insurableMin) attempt(errors, () => (min = parseMoney(scheme.insurableMin!, "Insurable minimum")));
  if (scheme.insurableMax) attempt(errors, () => (max = parseMoney(scheme.insurableMax!, "Insurable maximum")));
  if (min !== null && max !== null && (min as bigint) > (max as bigint)) errors.push("The insurable minimum cannot be above the insurable maximum.");
  if (!errors.length && parseRate(scheme.employeeRate) === 0n && parseRate(scheme.employerRate) === 0n && parseRate(scheme.memoRate) === 0n) {
    warnings.push("All rates are 0%, so this scheme will not produce any contribution unless an employee has a fixed amount.");
  }
  return { errors, warnings };
}

export function validateRounding(value: string): ValidationResult {
  return ROUNDING_MODES.includes(value as never)
    ? { errors: [], warnings: [] }
    : { errors: [`Rounding must be one of: ${ROUNDING_MODES.join(", ")}.`], warnings: [] };
}

/* ---------- Effective dating ---------- */

export interface EffectiveRange {
  id: string;
  /** First day it applies, YYYY-MM-DD. */
  effectiveFrom: string;
  /** Last day it applies, YYYY-MM-DD, or null while open-ended. */
  effectiveTo: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the ids of every pair of ranges that overlap. */
export function findOverlaps(ranges: EffectiveRange[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      const aEnd = a.effectiveTo ?? "9999-12-31";
      const bEnd = b.effectiveTo ?? "9999-12-31";
      if (a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}

export function validateEffectiveRange(range: Pick<EffectiveRange, "effectiveFrom" | "effectiveTo">): string[] {
  const errors: string[] = [];
  if (!ISO_DATE.test(range.effectiveFrom)) errors.push("Enter the start date as YYYY-MM-DD.");
  if (range.effectiveTo !== null && !ISO_DATE.test(range.effectiveTo)) errors.push("Enter the end date as YYYY-MM-DD.");
  if (!errors.length && range.effectiveTo !== null && range.effectiveTo < range.effectiveFrom) errors.push("The end date cannot be before the start date.");
  return errors;
}

/** The setting that applies on a given payroll day (use the last day of the payroll month). */
export function pickEffective<T extends EffectiveRange>(items: T[], day: string): T | undefined {
  const matches = items.filter((item) => item.effectiveFrom <= day && (item.effectiveTo === null || day <= item.effectiveTo));
  if (matches.length > 1) throw new PayrollCalculationError("More than one setting applies on the same day. Fix the effective dates first.");
  return matches[0];
}

export function payrollMonthEnd(year: number, month: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new PayrollCalculationError("Enter a valid payroll month and year.");
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
