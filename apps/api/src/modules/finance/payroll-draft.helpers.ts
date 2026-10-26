import { BadRequestException } from "@nestjs/common";
import { Prisma, type PayrollResidency } from "@prisma/client";
import { calculatePayslip, type PayrollSettings } from "./payroll/payroll-calculator.js";

export type PayProfileForDraft = {
  id: string;
  basicSalary: Prisma.Decimal;
  residency: PayrollResidency;
  schemeKeys: string[];
  recurringItems: Array<{
    amount: Prisma.Decimal; earningTypeId: string | null; deductionTypeId: string | null;
    effectiveFrom: Date; effectiveTo: Date | null;
  }>;
  loans: Array<{
    id: string; principal: Prisma.Decimal; balance: Prisma.Decimal;
    instalment: Prisma.Decimal; startDate: Date; status: string;
  }>;
};

export type EarningTypeForDraft = {
  id: string; code: string; name: string; taxable: boolean; pensionable: boolean; isActive: boolean;
};
export type DeductionTypeForDraft = { id: string; code: string; name: string; isActive: boolean };

export type PayrollPersonForDraft = {
  teacherId: string | null; staffId: string | null;
  legacySalary: Prisma.Decimal | null;
  profile: PayProfileForDraft | null;
};

const zero = new Prisma.Decimal(0);
const appliesOn = (row: { effectiveFrom: Date; effectiveTo: Date | null }, date: Date) =>
  row.effectiveFrom <= date && (row.effectiveTo === null || row.effectiveTo >= date);

/**
 * Generate exact, self-contained payslip data. The historical salary register remains
 * a clearly identified transitional fallback until a school has backfilled profiles.
 * No statutory rates are sourced from the legacy register.
 */
export function preparePayrollPayslip(
  schoolId: string,
  person: PayrollPersonForDraft,
  settings: PayrollSettings,
  periodEnd: Date,
  earningTypes: readonly EarningTypeForDraft[],
  deductionTypes: readonly DeductionTypeForDraft[],
) {
  const profile = person.profile;
  const basic = profile?.basicSalary ?? person.legacySalary ?? zero;
  if (basic.lte(0)) return null;
  const earningById = new Map(earningTypes.map(type => [type.id, type]));
  const deductionById = new Map(deductionTypes.map(type => [type.id, type]));
  const earnings = [{
    code: "BASIC", description: "Basic salary", amount: basic.toFixed(2),
    taxable: true, pensionable: true, isBasic: true,
  }];
  const deductions: Array<{
    code: string; description: string; amount: string;
    originalAmount?: string; balance?: string;
  }> = [];
  let allowances = zero;
  for (const item of profile?.recurringItems ?? []) {
    if (!appliesOn(item, periodEnd)) continue;
    if (item.earningTypeId) {
      const type = earningById.get(item.earningTypeId);
      if (!type || !type.isActive) throw new BadRequestException("An earning type on a staff pay profile is unavailable.");
      earnings.push({ code: type.code, description: type.name, amount: item.amount.toFixed(2),
        taxable: type.taxable, pensionable: type.pensionable, isBasic: false });
      allowances = allowances.plus(item.amount);
    } else if (item.deductionTypeId) {
      const type = deductionById.get(item.deductionTypeId);
      if (!type || !type.isActive) throw new BadRequestException("A deduction type on a staff pay profile is unavailable.");
      deductions.push({ code: type.code, description: type.name, amount: item.amount.toFixed(2) });
    } else {
      throw new BadRequestException("A recurring payroll item must have an earning or deduction type.");
    }
  }
  // A StaffLoan alone is not evidence that a receivable was posted.
  // Do not quietly deduct it into the generic payroll-deductions payable account.
  // Loan recovery is enabled only with a loan-origination and control-account workflow.
  if ((profile?.loans ?? []).some(loan => loan.status === "ACTIVE" && loan.startDate <= periodEnd && loan.balance.gt(0))) {
    throw new BadRequestException("Active staff loans require an approved loan receivable and recovery posting workflow before payroll generation.");
  }
  const keys = profile?.schemeKeys ?? ["SSNIT_TIER1"];
  if (!keys.includes("SSNIT_TIER1")) {
    throw new BadRequestException("A pay profile must include the mandatory SSNIT_TIER1 contribution.");
  }
  const calculated = calculatePayslip(settings, {
    residency: profile?.residency ?? "RESIDENT",
    earnings, deductions,
    enrolments: keys.map(schemeKey => ({
      schemeKey, employerBearsEmployeeShare: false, employerShareTaxable: false,
    })),
  });
  if (new Prisma.Decimal(calculated.net).lt(0)) {
    throw new BadRequestException("Payroll deductions cannot exceed gross pay; review the pay profile and loans.");
  }
  // The existing payroll schema has a single pension payable. Do not silently mix
  // an additional cash-contribution scheme into that control account until its
  // own payable and remittance routing is configured.
  const extraCashScheme = calculated.schemes.find(s => s.key !== "SSNIT_TIER1" &&
    (new Prisma.Decimal(s.employee).gt(0) || new Prisma.Decimal(s.employer).gt(0)));
  if (extraCashScheme) {
    throw new BadRequestException("Pension scheme " + extraCashScheme.key +
      " requires its own payable/remittance account before payroll can be approved.");
  }
  const ssnit = calculated.schemes.find(s => s.key === "SSNIT_TIER1");
  if (!ssnit) throw new BadRequestException("Missing mandatory SSNIT_TIER1 scheme.");
  const lines = calculated.lines.map(line => ({
    kind: (line.kind === "EARNING" ? "EARNING"
      : line.code === "PAYE" ? "TAX"
      : line.kind === "EMPLOYER_CONTRIBUTION" || line.kind === "MEMO" || line.schemeKey ? "CONTRIBUTION"
      : "DEDUCTION") as "EARNING" | "DEDUCTION" | "CONTRIBUTION" | "TAX",
    code: line.kind === "MEMO" ? "MEMO:" + line.code : line.code,
    label: line.description,
    amount: new Prisma.Decimal(line.amount),
    taxable: line.kind === "EARNING" ? earnings.find(e => e.code === line.code)?.taxable ?? null : null,
  }));
  const calculationSnapshot = {
    settings, input: { residency: profile?.residency ?? "RESIDENT", earnings, deductions, schemeKeys: keys },
    result: calculated,
    source: profile ? "EFFECTIVE_DATED_PROFILE" : "LEGACY_SALARY_REGISTER_PENDING_BACKFILL",
    profileId: profile?.id ?? null,
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
  return {
    schoolId, teacherId: person.teacherId, staffId: person.staffId,
    basicSalary: basic, allowances, grossSalary: new Prisma.Decimal(calculated.gross),
    ssnitEmployee: new Prisma.Decimal(ssnit.employee), ssnitEmployer: new Prisma.Decimal(ssnit.employer),
    incomeTax: new Prisma.Decimal(calculated.paye),
    otherDeductions: new Prisma.Decimal(calculated.otherDeductions),
    netSalary: new Prisma.Decimal(calculated.net),
    residency: profile?.residency ?? "RESIDENT" as const,
    calculationSnapshot: calculationSnapshot as unknown as Prisma.InputJsonValue,
    lines: { create: lines },
    paymentMethod: "BANK_TRANSFER" as const, paymentStatus: "PENDING" as const,
  };
}
