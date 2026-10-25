/**
 * Pure payslip calculation engine.
 *
 * Nothing in here reads a database or a constant tax table: the caller passes in
 * the tax schedule, contribution schemes and rounding rule that apply to the
 * payroll month. That is what lets an accountant change SSNIT, Tier 2/3 and
 * PAYE settings from the portal without a code change.
 *
 * Order of calculation
 *   1. gross = all earnings
 *   2. for every scheme the employee is enrolled in: contribution base (clamped
 *      to the insurable range), employee share, employer share, memo allocation
 *   3. chargeable income = taxable earnings + taxable employer-paid benefits
 *      − deductible employee contributions (Tier 3 relief optionally capped)
 *   4. PAYE from the effective bands (resident) or a flat rate (non-resident)
 *   5. net = gross − employee contributions deducted − PAYE − other deductions
 */
import {
  PayrollCalculationError,
  applyRate,
  divideRounded,
  formatMoney,
  maxBig,
  minBig,
  parseMoney,
  parseRate,
  RATE_DENOMINATOR,
  type RoundingMode,
} from "./payroll-money.js";

export type ContributionBase = "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";

export interface PayrollEarningInput {
  code: string;
  description: string;
  /** Money string with at most 2 decimals, e.g. "4845.25". */
  amount: string;
  taxable: boolean;
  pensionable: boolean;
  /** Exactly one earning should be the basic salary when a scheme uses base BASIC. */
  isBasic?: boolean;
}

export interface PayrollDeductionInput {
  code: string;
  description: string;
  amount: string;
  /** Loans: original amount and balance after this instalment, shown on the payslip. */
  originalAmount?: string;
  balance?: string;
}

export interface TaxBandInput {
  /** Monthly width of the band; null means open-ended (must be the last band). */
  width: string | null;
  /** Percentage, e.g. "17.5". */
  rate: string;
}

export interface TaxScheduleInput {
  bands: TaxBandInput[];
  /** Flat percentage applied to non-residents. */
  nonResidentRate: string;
}

export interface ContributionSchemeInput {
  /** Stable key, e.g. "SSNIT_TIER1", "TIER2", "TIER3". */
  key: string;
  label: string;
  trustee?: string | null;
  base: ContributionBase;
  employeeRate: string;
  employerRate: string;
  /**
   * Informational allocation that changes nobody's cash. Used for Tier 2 when it is
   * carved out of the SSNIT contribution (the payslip shows it, nobody pays extra).
   */
  memoRate: string;
  insurableMin?: string | null;
  insurableMax?: string | null;
  employeeShareTaxDeductible: boolean;
  /** Caps the deductible employee share at this % of gross earnings (e.g. Tier 3 relief). */
  reliefCapRate?: string | null;
}

export interface EnrolmentInput {
  schemeKey: string;
  employeeRate?: string | null;
  employerRate?: string | null;
  /** Fixed monthly amounts replace the percentage (typical for Tier 3). */
  employeeFixed?: string | null;
  employerFixed?: string | null;
  /** The school pays the employee's share instead of deducting it from pay. */
  employerBearsEmployeeShare: boolean;
  /** Only matters when the employer bears the share: count it as a taxable benefit. */
  employerShareTaxable: boolean;
}

export interface PayrollSettings {
  rounding: RoundingMode;
  taxSchedule: TaxScheduleInput;
  schemes: ContributionSchemeInput[];
}

export interface PayslipInput {
  residency: "RESIDENT" | "NON_RESIDENT";
  earnings: PayrollEarningInput[];
  deductions: PayrollDeductionInput[];
  enrolments: EnrolmentInput[];
}

export type PayslipLineKind = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "MEMO";

export interface PayslipLineOutput {
  kind: PayslipLineKind;
  code: string;
  description: string;
  amount: string;
  originalAmount?: string;
  balance?: string;
  schemeKey?: string;
}

export interface SchemeResult {
  key: string;
  label: string;
  trustee: string | null;
  contributionBase: string;
  employee: string;
  employer: string;
  memo: string;
  employeeShareBornByEmployer: boolean;
}

export interface PayslipResult {
  gross: string;
  taxableEarnings: string;
  chargeableIncome: string;
  paye: string;
  employeeContributionsDeducted: string;
  otherDeductions: string;
  totalDeductions: string;
  net: string;
  employerContributions: string;
  schemes: SchemeResult[];
  lines: PayslipLineOutput[];
  warnings: string[];
}

function sumBig(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function calculatePaye(chargeable: bigint, schedule: TaxScheduleInput, residency: PayslipInput["residency"], mode: RoundingMode): bigint {
  if (chargeable <= 0n) return 0n;
  if (residency === "NON_RESIDENT") {
    return applyRate(chargeable, parseRate(schedule.nonResidentRate, "Non-resident tax rate"), mode);
  }
  if (!schedule.bands.length) throw new PayrollCalculationError("The tax schedule has no bands.");
  let remaining = chargeable;
  let weighted = 0n; // sum of pesewas × rateScaled, rounded once at the end
  for (const [index, band] of schedule.bands.entries()) {
    if (remaining <= 0n) break;
    const portion = band.width === null ? remaining : minBig(remaining, parseMoney(band.width, `Band ${index + 1} width`));
    weighted += portion * parseRate(band.rate, `Band ${index + 1} rate`);
    remaining -= portion;
  }
  if (remaining > 0n) throw new PayrollCalculationError("The tax schedule has no open-ended top band, so part of the income cannot be taxed.");
  return divideRounded(weighted, RATE_DENOMINATOR, mode);
}

export function calculatePayslip(settings: PayrollSettings, input: PayslipInput): PayslipResult {
  const mode = settings.rounding;
  const warnings: string[] = [];
  const lines: PayslipLineOutput[] = [];

  // 1. Earnings ---------------------------------------------------------------
  if (!input.earnings.length) throw new PayrollCalculationError("A payslip needs at least one earning.");
  const earnings = input.earnings.map((item) => ({ ...item, pesewas: parseMoney(item.amount, `Earning "${item.code}"`) }));
  const gross = sumBig(earnings.map((item) => item.pesewas));
  const basic = sumBig(earnings.filter((item) => item.isBasic).map((item) => item.pesewas));
  const pensionable = sumBig(earnings.filter((item) => item.pensionable).map((item) => item.pesewas));
  const taxableEarnings = sumBig(earnings.filter((item) => item.taxable).map((item) => item.pesewas));
  const hasBasic = earnings.some((item) => item.isBasic);
  for (const item of earnings) {
    lines.push({ kind: "EARNING", code: item.code, description: item.description, amount: formatMoney(item.pesewas) });
  }

  // 2. Contribution schemes -----------------------------------------------------
  const schemesByKey = new Map(settings.schemes.map((scheme) => [scheme.key, scheme]));
  const enrolled = new Set<string>();
  for (const enrolment of input.enrolments) {
    if (!schemesByKey.has(enrolment.schemeKey)) {
      throw new PayrollCalculationError(`The employee is enrolled in "${enrolment.schemeKey}", which is not an active scheme.`);
    }
    if (enrolled.has(enrolment.schemeKey)) {
      throw new PayrollCalculationError(`The employee is enrolled in "${enrolment.schemeKey}" more than once.`);
    }
    enrolled.add(enrolment.schemeKey);
  }

  const schemeResults: SchemeResult[] = [];
  let employeeDeducted = 0n;
  let employerTotal = 0n;
  let taxableBenefit = 0n;
  let deductibleTotal = 0n;

  for (const scheme of settings.schemes) {
    const enrolment = input.enrolments.find((item) => item.schemeKey === scheme.key);
    if (!enrolment) continue;

    let base: bigint;
    switch (scheme.base) {
      case "BASIC":
        if (!hasBasic) throw new PayrollCalculationError(`Scheme "${scheme.key}" uses the basic salary, but no earning is marked as basic.`);
        base = basic;
        break;
      case "GROSS":
        base = gross;
        break;
      case "PENSIONABLE_ITEMS":
        base = pensionable;
        break;
    }
    const unclamped: bigint = base;
    if (scheme.insurableMax) base = minBig(base, parseMoney(scheme.insurableMax, `${scheme.key} insurable maximum`));
    if (scheme.insurableMin) base = maxBig(base, parseMoney(scheme.insurableMin, `${scheme.key} insurable minimum`));
    if (base !== unclamped) warnings.push(`${scheme.label}: contribution base adjusted to the insurable range (${formatMoney(unclamped)} → ${formatMoney(base)}).`);

    const employeeAmount = enrolment.employeeFixed
      ? parseMoney(enrolment.employeeFixed, `${scheme.key} fixed employee amount`)
      : applyRate(base, parseRate(enrolment.employeeRate ?? scheme.employeeRate, `${scheme.key} employee rate`), mode);
    const employerAmount = enrolment.employerFixed
      ? parseMoney(enrolment.employerFixed, `${scheme.key} fixed employer amount`)
      : applyRate(base, parseRate(enrolment.employerRate ?? scheme.employerRate, `${scheme.key} employer rate`), mode);
    const memoAmount = applyRate(base, parseRate(scheme.memoRate, `${scheme.key} memo rate`), mode);

    const bornByEmployer = enrolment.employerBearsEmployeeShare;
    if (!bornByEmployer) employeeDeducted += employeeAmount;
    employerTotal += employerAmount + (bornByEmployer ? employeeAmount : 0n);

    if (bornByEmployer && enrolment.employerShareTaxable) taxableBenefit += employeeAmount;
    if (scheme.employeeShareTaxDeductible && (!bornByEmployer || enrolment.employerShareTaxable)) {
      const cap = scheme.reliefCapRate ? applyRate(gross, parseRate(scheme.reliefCapRate, `${scheme.key} relief cap`), mode) : null;
      const deductible = cap === null ? employeeAmount : minBig(employeeAmount, cap);
      if (cap !== null && employeeAmount > cap) warnings.push(`${scheme.label}: tax relief limited to ${formatMoney(cap)}.`);
      deductibleTotal += deductible;
    }

    if (!bornByEmployer && employeeAmount > 0n) {
      lines.push({ kind: "DEDUCTION", code: scheme.key, description: `${scheme.label} (employee)`, amount: formatMoney(employeeAmount), schemeKey: scheme.key });
    }
    if (employerAmount > 0n) {
      lines.push({ kind: "EMPLOYER_CONTRIBUTION", code: scheme.key, description: `${scheme.label} (employer)`, amount: formatMoney(employerAmount), schemeKey: scheme.key });
    }
    if (bornByEmployer && employeeAmount > 0n) {
      lines.push({ kind: "EMPLOYER_CONTRIBUTION", code: scheme.key, description: `${scheme.label} (employee share paid by school)`, amount: formatMoney(employeeAmount), schemeKey: scheme.key });
    }
    if (memoAmount > 0n) {
      lines.push({ kind: "MEMO", code: scheme.key, description: `${scheme.label} contribution`, amount: formatMoney(memoAmount), schemeKey: scheme.key });
    }

    schemeResults.push({
      key: scheme.key,
      label: scheme.label,
      trustee: scheme.trustee ?? null,
      contributionBase: formatMoney(base),
      employee: formatMoney(employeeAmount),
      employer: formatMoney(employerAmount),
      memo: formatMoney(memoAmount),
      employeeShareBornByEmployer: bornByEmployer,
    });
  }

  // 3–4. Chargeable income and PAYE ------------------------------------------------
  const chargeable = maxBig(0n, taxableEarnings + taxableBenefit - deductibleTotal);
  const paye = calculatePaye(chargeable, settings.taxSchedule, input.residency, mode);
  if (paye > 0n) {
    lines.push({ kind: "DEDUCTION", code: "PAYE", description: "Income tax (PAYE)", amount: formatMoney(paye) });
  }

  // 5. Other deductions and net pay ------------------------------------------------
  let otherDeductions = 0n;
  for (const item of input.deductions) {
    const amount = parseMoney(item.amount, `Deduction "${item.code}"`);
    otherDeductions += amount;
    lines.push({
      kind: "DEDUCTION",
      code: item.code,
      description: item.description,
      amount: formatMoney(amount),
      ...(item.originalAmount ? { originalAmount: formatMoney(parseMoney(item.originalAmount, `Deduction "${item.code}" original amount`)) } : {}),
      ...(item.balance ? { balance: formatMoney(parseMoney(item.balance, `Deduction "${item.code}" balance`)) } : {}),
    });
  }

  const totalDeductions = employeeDeducted + paye + otherDeductions;
  const net = gross - totalDeductions;
  if (net < 0n) warnings.push("Deductions exceed gross pay; net pay is negative and must be reviewed before approval.");

  return {
    gross: formatMoney(gross),
    taxableEarnings: formatMoney(taxableEarnings),
    chargeableIncome: formatMoney(chargeable),
    paye: formatMoney(paye),
    employeeContributionsDeducted: formatMoney(employeeDeducted),
    otherDeductions: formatMoney(otherDeductions),
    totalDeductions: formatMoney(totalDeductions),
    net: formatMoney(net),
    employerContributions: formatMoney(employerTotal),
    schemes: schemeResults,
    lines,
    warnings,
  };
}
