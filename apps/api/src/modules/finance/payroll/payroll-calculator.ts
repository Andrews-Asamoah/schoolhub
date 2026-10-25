import { Prisma } from "@prisma/client";

/**
 * Pure decimal-only payroll calculator. Rates are percentages (e.g. "5.5"),
 * monetary inputs are decimal strings, and each monetary output is rounded
 * half-up to two decimal places. The caller must supply an approved,
 * effective-dated configuration; this function does not decide legal policy.
 */
export type PayrollTaxBandInput = {
  order: number;
  width: string | null;
  rate: string;
};

export type PayrollEarningInput = {
  code: string;
  description: string;
  amount: string;
  taxable: boolean;
  pensionable: boolean;
};

export type PayrollDeductionInput = {
  code: string;
  description: string;
  amount: string;
};

export type PayrollCalculatorInput = {
  basicSalary: string;
  earnings?: PayrollEarningInput[];
  otherDeductions?: PayrollDeductionInput[];
  taxBands: PayrollTaxBandInput[];
  nonResidentFlatRate?: string | null;
  taxResident?: boolean;
  employeeSsnitRate: string;
  employerSsnitRate: string;
  ssnitBase?: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";
  tier2Base?: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";
  tier3Base?: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";
  insurableMinimum: string;
  insurableMaximum: string;
  tier2EmployeeRate?: string;
  tier2EmployerRate?: string;
  tier3EmployeeRate?: string;
  tier3ReliefCap?: string | null;
  employeeContributionTaxDeductible?: boolean;
  employerBearsEmployeeShare?: boolean;
  employerShareTaxable?: boolean;
  ssnitEmployerBearsEmployeeShare?: boolean;
  ssnitEmployerShareTaxable?: boolean;
  tier2EmployerBearsEmployeeShare?: boolean;
  tier2EmployerShareTaxable?: boolean;
  tier3EmployerBearsEmployeeShare?: boolean;
  tier3EmployerShareTaxable?: boolean;
  employeeSsnitFixedAmount?: string | null;
  tier2EmployeeFixedAmount?: string | null;
  tier3EmployeeFixedAmount?: string | null;
  tier2ContributionTaxDeductible?: boolean;
};

export type PayrollCalculation = {
  basicSalary: string;
  allowances: string;
  grossSalary: string;
  pensionableBase: string;
  ssnitEmployee: string;
  ssnitEmployer: string;
  tier2Employee: string;
  tier2Employer: string;
  tier3Employee: string;
  taxableBenefit: string;
  taxableIncome: string;
  incomeTax: string;
  otherDeductions: string;
  netSalary: string;
  totalEmployeeDeductions: string;
  totalEmployerContributions: string;
  lines: Array<{ kind: "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "MEMO"; code: string; description: string; amount: string; originalAmount: string; balance: string | null; memo: boolean }>;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const MONEY_SCALE = 2;

function decimal(value: string | null | undefined, label: string): Prisma.Decimal {
  if (value == null || value.trim() === "") return ZERO;
  let result: Prisma.Decimal;
  try {
    result = new Prisma.Decimal(value);
  } catch {
    throw new Error(`Invalid decimal value for ${label}.`);
  }
  if (!result.isFinite()) throw new Error(`Invalid decimal value for ${label}.`);
  return result;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

function percent(base: Prisma.Decimal, rate: Prisma.Decimal): Prisma.Decimal {
  return money(base.mul(rate).div(HUNDRED));
}

function nonNegative(value: Prisma.Decimal): Prisma.Decimal {
  return value.greaterThan(ZERO) ? value : ZERO;
}

function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.add(value), ZERO);
}

export function calculateProgressivePaye(
  taxableIncome: Prisma.Decimal,
  bands: PayrollTaxBandInput[],
): Prisma.Decimal {
  if (bands.length === 0) throw new Error("No PAYE tax bands are configured.");
  const ordered = [...bands].sort((a, b) => a.order - b.order);
  if (ordered[0]!.order !== 1 || !decimal(ordered[0]!.rate, "tax rate").equals(ZERO)) {
    throw new Error("The first PAYE band must have order 1 and a 0% rate.");
  }

  let remaining = nonNegative(taxableIncome);
  let tax = ZERO;
  for (let index = 0; index < ordered.length; index += 1) {
    const band = ordered[index]!;
    const rate = decimal(band.rate, "tax rate");
    if (rate.lessThan(ZERO) || rate.greaterThan(HUNDRED)) throw new Error("PAYE rates must be between 0 and 100 percent.");
    const width = band.width === null ? null : decimal(band.width, "tax band width");
    const last = index === ordered.length - 1;
    if (last !== (width === null)) throw new Error("Only the final PAYE band may be open-ended, and the final band must be open-ended.");
    if (width !== null && width.lessThanOrEqualTo(ZERO)) throw new Error("Finite PAYE band widths must be positive.");
    if (remaining.lessThanOrEqualTo(ZERO)) break;
    const inBand = width === null ? remaining : Prisma.Decimal.min(remaining, width);
    tax = tax.add(inBand.mul(rate).div(HUNDRED));
    remaining = remaining.sub(inBand);
  }
  return money(tax);
}

export function calculatePayroll(input: PayrollCalculatorInput): PayrollCalculation {
  const basic = money(decimal(input.basicSalary, "basic salary"));
  if (basic.lessThan(ZERO)) throw new Error("Basic salary cannot be negative.");

  const earnings = (input.earnings ?? []).map((line) => {
    const amount = money(decimal(line.amount, `earning ${line.code}`));
    if (amount.lessThan(ZERO)) throw new Error("Earnings cannot be negative.");
    return { ...line, amount };
  });
  const otherDeductions = (input.otherDeductions ?? []).map((line) => {
    const amount = money(decimal(line.amount, `deduction ${line.code}`));
    if (amount.lessThan(ZERO)) throw new Error("Deductions cannot be negative.");
    return { ...line, amount };
  });

  const gross = money(basic.add(sum(earnings.map((line) => line.amount))));
  const allowances = money(sum(earnings.map((line) => line.amount)));
  const pensionableItems = sum(earnings.filter((line) => line.pensionable).map((line) => line.amount));
  // Basic salary is pensionable by default; additional items are included only
  // when the caller's effective scheme marks them pensionable.
  const pensionableBase = basic.add(pensionableItems);
  const contributionBase = (base: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS" | undefined) =>
    base === "GROSS" ? gross : base === "PENSIONABLE_ITEMS" ? pensionableBase : basic;
  const ssnitContributionBase = contributionBase(input.ssnitBase);
  const tier2ContributionBase = contributionBase(input.tier2Base);
  const tier3ContributionBase = contributionBase(input.tier3Base);
  const minimum = decimal(input.insurableMinimum, "insurable minimum");
  const maximum = decimal(input.insurableMaximum, "insurable maximum");
  if (minimum.lessThan(ZERO) || maximum.lessThan(minimum)) throw new Error("Invalid insurable earnings range.");
  const insurableBase = Prisma.Decimal.min(maximum, Prisma.Decimal.max(minimum, ssnitContributionBase));
  const employeeRate = decimal(input.employeeSsnitRate, "employee SSNIT rate");
  const employerRate = decimal(input.employerSsnitRate, "employer SSNIT rate");
  const tier2EmployeeRate = decimal(input.tier2EmployeeRate, "Tier 2 employee rate");
  const tier2EmployerRate = decimal(input.tier2EmployerRate, "Tier 2 employer rate");
  const tier3EmployeeRate = decimal(input.tier3EmployeeRate, "Tier 3 employee rate");
  for (const [label, rate] of [["employee SSNIT", employeeRate], ["employer SSNIT", employerRate], ["Tier 2 employee", tier2EmployeeRate], ["Tier 2 employer", tier2EmployerRate], ["Tier 3 employee", tier3EmployeeRate]] as const) {
    if (rate.lessThan(ZERO) || rate.greaterThan(HUNDRED)) throw new Error(`${label} rate must be between 0 and 100 percent.`);
  }
  const employeeSsnit = input.employeeSsnitFixedAmount == null
    ? percent(insurableBase, employeeRate)
    : money(nonNegative(decimal(input.employeeSsnitFixedAmount, "fixed employee SSNIT")));
  const employerSsnit = percent(insurableBase, employerRate);
  const tier2Employee = input.tier2EmployeeFixedAmount == null
    ? percent(tier2ContributionBase, tier2EmployeeRate)
    : money(nonNegative(decimal(input.tier2EmployeeFixedAmount, "fixed Tier 2 employee contribution")));
  const tier2Employer = percent(tier2ContributionBase, tier2EmployerRate);
  const tier3Employee = input.tier3EmployeeFixedAmount == null
    ? percent(tier3ContributionBase, tier3EmployeeRate)
    : money(nonNegative(decimal(input.tier3EmployeeFixedAmount, "fixed Tier 3 employee contribution")));

  const ssnitShareBorne = input.ssnitEmployerBearsEmployeeShare ?? input.employerBearsEmployeeShare ?? false;
  const tier2ShareBorne = input.tier2EmployerBearsEmployeeShare ?? input.employerBearsEmployeeShare ?? false;
  const tier3ShareBorne = input.tier3EmployerBearsEmployeeShare ?? false;
  const ssnitShareTaxable = input.ssnitEmployerShareTaxable ?? input.employerShareTaxable ?? false;
  const tier2ShareTaxable = input.tier2EmployerShareTaxable ?? input.employerShareTaxable ?? false;
  const tier3ShareTaxable = input.tier3EmployerShareTaxable ?? false;
  const taxableBenefit = sum([
    ...(ssnitShareBorne && ssnitShareTaxable ? [employeeSsnit] : []),
    ...(tier2ShareBorne && tier2ShareTaxable ? [tier2Employee] : []),
    ...(tier3ShareBorne && tier3ShareTaxable ? [tier3Employee] : []),
  ]);
  const taxableEarnings = sum([
    ...(input.taxResident === false ? [] : [basic]),
    ...earnings.filter((line) => line.taxable).map((line) => line.amount),
    ...(input.taxResident === false ? [basic] : []),
  ]);
  const deductibleContributions = sum([
    ...(input.employeeContributionTaxDeductible === false ? [] : [employeeSsnit]),
    ...(input.tier2ContributionTaxDeductible === false ? [] : [tier2Employee]),
  ]);
  const reliefCap = input.tier3ReliefCap == null ? ZERO : nonNegative(decimal(input.tier3ReliefCap, "Tier 3 relief cap"));
  const tier3Relief = Prisma.Decimal.min(tier3Employee, reliefCap);
  const taxableIncome = money(nonNegative(taxableEarnings.add(taxableBenefit).sub(deductibleContributions).sub(tier3Relief)));
  if (input.taxResident === false && input.nonResidentFlatRate == null) {
    throw new Error("No verified non-resident flat tax rate is configured.");
  }
  const paye = input.taxResident === false
    ? percent(taxableIncome, decimal(input.nonResidentFlatRate, "non-resident flat rate"))
    : calculateProgressivePaye(taxableIncome, input.taxBands);

  const employeeSsnitDeduction = ssnitShareBorne ? ZERO : employeeSsnit;
  const tier2Deduction = tier2ShareBorne ? ZERO : tier2Employee;
  const tier3Deduction = tier3ShareBorne ? ZERO : tier3Employee;
  const totalEmployeeDeductions = money(sum([
    employeeSsnitDeduction,
    tier2Deduction,
    tier3Deduction,
    paye,
    ...otherDeductions.map((line) => line.amount),
  ]));
  const net = money(gross.sub(totalEmployeeDeductions));
  const totalEmployerContributions = money(sum([
    employerSsnit,
    tier2Employer,
    ...(ssnitShareBorne ? [employeeSsnit] : []),
    ...(tier2ShareBorne ? [tier2Employee] : []),
    ...(tier3ShareBorne ? [tier3Employee] : []),
  ]));

  const lines: PayrollCalculation["lines"] = [
    { kind: "EARNING", code: "BASIC", description: "Basic salary", amount: basic.toFixed(2), originalAmount: basic.toFixed(2), balance: null, memo: false },
    ...earnings.map((line) => ({ kind: "EARNING" as const, code: line.code, description: line.description, amount: line.amount.toFixed(2), originalAmount: line.amount.toFixed(2), balance: null, memo: false })),
    { kind: "DEDUCTION", code: "SSNIT_EMPLOYEE", description: "Employee SSNIT", amount: employeeSsnitDeduction.toFixed(2), originalAmount: employeeSsnit.toFixed(2), balance: null, memo: false },
    { kind: "DEDUCTION", code: "TIER2_EMPLOYEE", description: "Tier 2 employee contribution", amount: tier2Deduction.toFixed(2), originalAmount: tier2Employee.toFixed(2), balance: null, memo: false },
    { kind: "DEDUCTION", code: "TIER3_EMPLOYEE", description: "Tier 3 employee contribution", amount: tier3Deduction.toFixed(2), originalAmount: tier3Employee.toFixed(2), balance: null, memo: false },
    { kind: "DEDUCTION", code: "PAYE", description: "PAYE", amount: paye.toFixed(2), originalAmount: paye.toFixed(2), balance: null, memo: false },
    ...otherDeductions.map((line) => ({ kind: "DEDUCTION" as const, code: line.code, description: line.description, amount: line.amount.toFixed(2), originalAmount: line.amount.toFixed(2), balance: null, memo: false })),
    { kind: "EMPLOYER_CONTRIBUTION", code: "SSNIT_EMPLOYER", description: "Employer SSNIT", amount: employerSsnit.toFixed(2), originalAmount: employerSsnit.toFixed(2), balance: null, memo: true },
    { kind: "EMPLOYER_CONTRIBUTION", code: "TIER2_EMPLOYER", description: "Tier 2 employer contribution", amount: tier2Employer.toFixed(2), originalAmount: tier2Employer.toFixed(2), balance: null, memo: true },
  ];

  return {
    basicSalary: basic.toFixed(2),
    allowances: allowances.toFixed(2),
    grossSalary: gross.toFixed(2),
    pensionableBase: money(pensionableBase).toFixed(2),
    ssnitEmployee: employeeSsnit.toFixed(2),
    ssnitEmployer: employerSsnit.toFixed(2),
    tier2Employee: tier2Employee.toFixed(2),
    tier2Employer: tier2Employer.toFixed(2),
    tier3Employee: tier3Employee.toFixed(2),
    taxableBenefit: money(taxableBenefit).toFixed(2),
    taxableIncome: taxableIncome.toFixed(2),
    incomeTax: paye.toFixed(2),
    otherDeductions: money(sum(otherDeductions.map((line) => line.amount))).toFixed(2),
    netSalary: net.toFixed(2),
    totalEmployeeDeductions: totalEmployeeDeductions.toFixed(2),
    totalEmployerContributions: totalEmployerContributions.toFixed(2),
    lines,
  };
}
