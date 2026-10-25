import { describe, expect, it } from "vitest";
import {
  calculatePayslip,
  type ContributionSchemeInput,
  type EnrolmentInput,
  type PayrollSettings,
  type PayslipInput,
} from "./payroll-calculator.js";
import { PayrollCalculationError, applyRate, parseRate, type RoundingMode } from "./payroll-money.js";

// Monthly resident bands that mirror the values currently hard-coded in finance.service.ts.
// They are test data here, not statutory truth: real schedules come from the database.
const LEGACY_BANDS = [
  { width: "588", rate: "0" },
  { width: "80", rate: "5" },
  { width: "100", rate: "10" },
  { width: "2900", rate: "17.5" },
  { width: "16000", rate: "25" },
  { width: "30332", rate: "30" },
  { width: null, rate: "35" },
];

const SSNIT: ContributionSchemeInput = {
  key: "SSNIT_TIER1",
  label: "SSNIT",
  base: "BASIC",
  employeeRate: "5.5",
  employerRate: "13",
  memoRate: "0",
  insurableMin: "587.80",
  insurableMax: "69000",
  employeeShareTaxDeductible: true,
};

const TIER2_CARVED: ContributionSchemeInput = {
  key: "TIER2",
  label: "Tier 2",
  trustee: "Example Trustee",
  base: "BASIC",
  employeeRate: "0",
  employerRate: "0",
  memoRate: "5",
  employeeShareTaxDeductible: false,
};

const TIER3: ContributionSchemeInput = {
  key: "TIER3",
  label: "Tier 3",
  base: "BASIC",
  employeeRate: "0",
  employerRate: "0",
  memoRate: "0",
  employeeShareTaxDeductible: true,
  reliefCapRate: "16.5",
};

function settings(overrides: Partial<PayrollSettings> = {}): PayrollSettings {
  return {
    rounding: "HALF_UP",
    taxSchedule: { bands: LEGACY_BANDS, nonResidentRate: "25" },
    schemes: [SSNIT, TIER2_CARVED, TIER3],
    ...overrides,
  };
}

function enrol(schemeKey: string, extra: Partial<EnrolmentInput> = {}): EnrolmentInput {
  return { schemeKey, employerBearsEmployeeShare: false, employerShareTaxable: false, ...extra };
}

function payslip(basic: string, extra: Partial<PayslipInput> = {}): PayslipInput {
  return {
    residency: "RESIDENT",
    earnings: [{ code: "BASIC", description: "Basic salary", amount: basic, taxable: true, pensionable: true, isBasic: true }],
    deductions: [],
    enrolments: [enrol("SSNIT_TIER1")],
    ...extra,
  };
}

describe("reference payslip (anonymised numbers)", () => {
  // Basic 4,845.25 plus a taxable, non-pensionable allowance of 726.79 → gross 5,572.04.
  const input = payslip("4845.25", {
    earnings: [
      { code: "BASIC", description: "Basic salary", amount: "4845.25", taxable: true, pensionable: true, isBasic: true },
      { code: "RETENTION", description: "Retention premium", amount: "726.79", taxable: true, pensionable: false },
    ],
    enrolments: [enrol("SSNIT_TIER1"), enrol("TIER2")],
    deductions: [
      { code: "UNION", description: "Union dues", amount: "105.00" },
      { code: "LOAN", description: "Loan deduction", amount: "866.67", originalAmount: "13866.62", balance: "13000.00" },
    ],
  });
  const result = calculatePayslip(settings(), input);

  it("adds earnings to gross", () => {
    expect(result.gross).toBe("5572.04");
  });

  it("calculates SSNIT on the basic salary only, not on the allowance", () => {
    const ssnit = result.schemes.find((scheme) => scheme.key === "SSNIT_TIER1")!;
    expect(ssnit.contributionBase).toBe("4845.25");
    expect(ssnit.employee).toBe("266.49");
    expect(ssnit.employer).toBe("629.88");
  });

  it("shows Tier 2 as a memo line that changes nobody's cash", () => {
    const tier2 = result.schemes.find((scheme) => scheme.key === "TIER2")!;
    expect(tier2.memo).toBe("242.26");
    expect(result.lines.find((line) => line.code === "TIER2")?.kind).toBe("MEMO");
    expect(result.employerContributions).toBe("629.88");
  });

  it("taxes gross less the employee SSNIT share (hand-calculated: 930.89)", () => {
    // 5,572.04 − 266.49 = 5,305.55 → 0 + 4.00 + 10.00 + 507.50 + 25% × 1,637.55 (409.3875) = 930.8875
    expect(result.chargeableIncome).toBe("5305.55");
    expect(result.paye).toBe("930.89");
  });

  it("reconciles net pay and carries loan balances onto the payslip", () => {
    expect(result.totalDeductions).toBe("2169.05"); // 266.49 + 930.89 + 105.00 + 866.67
    expect(result.net).toBe("3402.99"); // 5,572.04 − 2,169.05
    const loan = result.lines.find((line) => line.code === "LOAN")!;
    expect(loan.originalAmount).toBe("13866.62");
    expect(loan.balance).toBe("13000.00");
  });
});

describe("rounding is an explicit rule", () => {
  it("rounds 13% of 4,845.25 (629.8825) per the chosen mode", () => {
    const cases: Array<[RoundingMode, string]> = [
      ["HALF_UP", "629.88"],
      ["HALF_EVEN", "629.88"],
      ["DOWN", "629.88"],
      ["UP", "629.89"],
    ];
    for (const [rounding, expected] of cases) {
      const result = calculatePayslip(settings({ rounding }), payslip("4845.25"));
      expect(result.schemes[0]!.employer, rounding).toBe(expected);
    }
  });

  it("documents that no single rounding mode reproduces all three figures on the reference slip", () => {
    // Reference slip figures for a basic of 4,845.25: employee 266.49, Tier 2 242.26, employer 629.89.
    const reference = ["266.49", "242.26", "629.89"];
    const modes: RoundingMode[] = ["HALF_UP", "HALF_EVEN", "UP", "DOWN"];
    const matches = modes.filter((rounding) => {
      const result = calculatePayslip(settings({ rounding }), payslip("4845.25", { enrolments: [enrol("SSNIT_TIER1"), enrol("TIER2")] }));
      const [ssnit, tier2] = [result.schemes[0]!, result.schemes[1]!];
      return [ssnit.employee, tier2.memo, ssnit.employer].join() === reference.join();
    });
    expect(matches).toEqual([]);
  });

  it("applies HALF_EVEN only on exact halves", () => {
    expect(applyRate(250n, parseRate("1"), "HALF_EVEN")).toBe(2n); // 2.5 → 2
    expect(applyRate(350n, parseRate("1"), "HALF_EVEN")).toBe(4n); // 3.5 → 4
    expect(applyRate(250n, parseRate("1"), "HALF_UP")).toBe(3n);
  });
});

describe("PAYE bands", () => {
  const taxAt = (chargeable: string) => {
    // A single taxable, non-pensionable earning and no contributions isolates the bands.
    const result = calculatePayslip(settings(), {
      residency: "RESIDENT",
      earnings: [{ code: "PAY", description: "Pay", amount: chargeable, taxable: true, pensionable: false }],
      deductions: [],
      enrolments: [],
    });
    return result.paye;
  };

  it("is exact at each band edge", () => {
    expect(taxAt("0.00")).toBe("0.00");
    expect(taxAt("588.00")).toBe("0.00");
    expect(taxAt("668.00")).toBe("4.00");
    expect(taxAt("768.00")).toBe("14.00");
    expect(taxAt("3668.00")).toBe("521.50");
    expect(taxAt("19668.00")).toBe("4521.50");
    expect(taxAt("50000.00")).toBe("13621.10");
    expect(taxAt("50001.00")).toBe("13621.45");
  });

  it("rounds the tax once at the end, not band by band", () => {
    // 0.01 above 588 is 0.0005 of tax, which rounds to 0.00 — it must not be rounded up per band.
    expect(taxAt("588.01")).toBe("0.00");
  });

  it("uses a flat rate for non-residents", () => {
    const result = calculatePayslip(settings(), { ...payslip("1000.00"), residency: "NON_RESIDENT", enrolments: [] });
    expect(result.paye).toBe("250.00");
  });

  it("refuses a schedule with no open-ended top band", () => {
    const closed = settings({ taxSchedule: { bands: [{ width: "100", rate: "0" }], nonResidentRate: "25" } });
    expect(() => calculatePayslip(closed, payslip("1000.00", { enrolments: [] }))).toThrow(PayrollCalculationError);
  });
});

describe("contribution schemes", () => {
  it("clamps the contribution base to the insurable range", () => {
    const high = calculatePayslip(settings(), payslip("80000.00"));
    expect(high.schemes[0]!.contributionBase).toBe("69000.00");
    expect(high.schemes[0]!.employee).toBe("3795.00");
    expect(high.warnings.some((warning) => warning.includes("insurable range"))).toBe(true);

    const low = calculatePayslip(settings(), payslip("500.00"));
    expect(low.schemes[0]!.contributionBase).toBe("587.80");
    expect(low.schemes[0]!.employee).toBe("32.33");
  });

  it("does not deduct the employee share when the school bears it, and counts it as employer cost", () => {
    const standard = calculatePayslip(settings(), payslip("4845.25"));
    const borne = calculatePayslip(settings(), payslip("4845.25", { enrolments: [enrol("SSNIT_TIER1", { employerBearsEmployeeShare: true })] }));
    expect(standard.employeeContributionsDeducted).toBe("266.49");
    expect(borne.employeeContributionsDeducted).toBe("0.00");
    expect(borne.employerContributions).toBe("896.37"); // 629.88 + 266.49
    expect(Number(borne.net)).toBeGreaterThan(Number(standard.net));
    expect(borne.lines.some((line) => line.description.includes("paid by school"))).toBe(true);
  });

  it("taxes a borne share only through the benefit switch, and only when the scheme is not deductible", () => {
    // SSNIT is deductible, so benefit and relief cancel out: the switch changes nothing.
    const a = calculatePayslip(settings(), payslip("4845.25", { enrolments: [enrol("SSNIT_TIER1", { employerBearsEmployeeShare: true, employerShareTaxable: false })] }));
    const b = calculatePayslip(settings(), payslip("4845.25", { enrolments: [enrol("SSNIT_TIER1", { employerBearsEmployeeShare: true, employerShareTaxable: true })] }));
    expect(a.chargeableIncome).toBe("4845.25");
    expect(b.chargeableIncome).toBe("4845.25");

    // A non-deductible scheme paid by the school adds to chargeable income only when marked taxable.
    const custom: ContributionSchemeInput = { ...TIER3, key: "WELFARE", label: "Welfare", employeeRate: "2", employeeShareTaxDeductible: false, reliefCapRate: null };
    const base = settings({ schemes: [SSNIT, custom] });
    const notTaxable = calculatePayslip(base, payslip("1000.00", { enrolments: [enrol("WELFARE", { employerBearsEmployeeShare: true })] }));
    const taxable = calculatePayslip(base, payslip("1000.00", { enrolments: [enrol("WELFARE", { employerBearsEmployeeShare: true, employerShareTaxable: true })] }));
    expect(notTaxable.chargeableIncome).toBe("1000.00");
    expect(taxable.chargeableIncome).toBe("1020.00");
  });

  it("supports a fixed Tier 3 amount and caps the tax relief", () => {
    const within = calculatePayslip(settings(), payslip("4845.25", { enrolments: [enrol("SSNIT_TIER1"), enrol("TIER3", { employeeFixed: "300.00" })] }));
    expect(within.schemes.find((scheme) => scheme.key === "TIER3")!.employee).toBe("300.00");
    expect(within.chargeableIncome).toBe("4278.76"); // 4,845.25 − 266.49 − 300.00

    // 16.5% of gross 4,845.25 is 799.47, so a 1,000.00 contribution only gets relief on 799.47.
    const capped = calculatePayslip(settings(), payslip("4845.25", { enrolments: [enrol("TIER3", { employeeFixed: "1000.00" })] }));
    expect(capped.chargeableIncome).toBe("4045.78");
    expect(capped.warnings.some((warning) => warning.includes("tax relief limited"))).toBe(true);
    expect(capped.employeeContributionsDeducted).toBe("1000.00");
  });

  it("applies per-employee rate overrides", () => {
    const result = calculatePayslip(settings(), payslip("1000.00", { enrolments: [enrol("SSNIT_TIER1", { employeeRate: "3", employerRate: "10" })] }));
    expect(result.schemes[0]!.employee).toBe("30.00");
    expect(result.schemes[0]!.employer).toBe("100.00");
  });

  it("rejects bad enrolments and bad input", () => {
    expect(() => calculatePayslip(settings(), payslip("1000.00", { enrolments: [enrol("NOPE")] }))).toThrow(/not an active scheme/);
    expect(() => calculatePayslip(settings(), payslip("1000.00", { enrolments: [enrol("SSNIT_TIER1"), enrol("SSNIT_TIER1")] }))).toThrow(/more than once/);
    expect(() =>
      calculatePayslip(settings(), { ...payslip("1000.00"), earnings: [{ code: "X", description: "x", amount: "1000.00", taxable: true, pensionable: true }] }),
    ).toThrow(/marked as basic/);
    expect(() => calculatePayslip(settings(), payslip("1000.005"))).toThrow(/2 decimal places/);
    expect(() => calculatePayslip(settings(), payslip("-5.00"))).toThrow(PayrollCalculationError);
    expect(() => calculatePayslip(settings(), payslip("1e3"))).toThrow(PayrollCalculationError);
  });

  it("warns when deductions exceed gross", () => {
    const result = calculatePayslip(settings(), payslip("1000.00", { deductions: [{ code: "LOAN", description: "Loan", amount: "5000.00" }] }));
    expect(Number(result.net)).toBeLessThan(0);
    expect(result.warnings.some((warning) => warning.includes("negative"))).toBe(true);
  });
});

describe("properties over many salaries", () => {
  it("always reconciles gross = net + deductions and never produces negative tax", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    let previousTax = -1;
    for (let i = 0; i < 400; i += 1) {
      const pesewas = 100_00 + (next() % 9_000_000); // 100.00 to 90,100.00
      const amount = `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, "0")}`;
      const result = calculatePayslip(settings(), payslip(amount));
      expect(Number(result.paye)).toBeGreaterThanOrEqual(0);
      const gross = Math.round(Number(result.gross) * 100);
      const net = Math.round(Number(result.net) * 100);
      const deductions = Math.round(Number(result.totalDeductions) * 100);
      expect(gross).toBe(net + deductions);
    }
    // Tax never decreases as income rises.
    for (let pay = 0; pay <= 60_000; pay += 250) {
      const result = calculatePayslip(settings(), {
        residency: "RESIDENT",
        earnings: [{ code: "PAY", description: "Pay", amount: `${pay}.00`, taxable: true, pensionable: false }],
        deductions: [],
        enrolments: [],
      });
      const tax = Math.round(Number(result.paye) * 100);
      expect(tax).toBeGreaterThanOrEqual(previousTax);
      previousTax = tax;
    }
  });
});

describe("parity with the payroll formula currently hard-coded in finance.service.ts", () => {
  // Re-implementation of the existing float-based logic, kept here only to prove the new engine
  // reproduces today's numbers when it is seeded with today's constants.
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const bands = [
    { limit: 588, rate: 0 },
    { limit: 80, rate: 0.05 },
    { limit: 100, rate: 0.1 },
    { limit: 2_900, rate: 0.175 },
    { limit: 16_000, rate: 0.25 },
    { limit: 30_332, rate: 0.3 },
    { limit: Number.POSITIVE_INFINITY, rate: 0.35 },
  ];
  function legacy(basic: number) {
    const insurable = Math.min(69_000, Math.max(587.8, basic));
    const employee = roundMoney(insurable * 0.055);
    const employer = roundMoney(insurable * 0.13);
    let remaining = Math.max(0, basic - employee);
    let tax = 0;
    for (const band of bands) {
      if (remaining <= 0) break;
      const portion = Math.min(remaining, band.limit);
      tax += portion * band.rate;
      remaining -= portion;
    }
    const paye = roundMoney(tax);
    return { employee, employer, paye, net: roundMoney(Math.max(0, basic - employee - paye)) };
  }

  // Exact PAYE arithmetic in pesewas, independent of the engine, used to recognise exact half-pesewa cases.
  const exactBands: Array<[bigint | null, bigint]> = [
    [58_800n, 0n], [8_000n, 50_000n], [10_000n, 100_000n], [290_000n, 175_000n], [1_600_000n, 250_000n], [3_033_200n, 300_000n], [null, 350_000n],
  ];
  function remainderOfExactTax(chargeablePesewas: bigint): bigint {
    let remaining = chargeablePesewas;
    let weighted = 0n;
    for (const [width, rate] of exactBands) {
      if (remaining <= 0n) break;
      const portion = width === null || remaining < width ? remaining : width;
      weighted += portion * rate;
      remaining -= portion;
    }
    return weighted % 1_000_000n;
  }
  const toPesewas = (value: string) => BigInt(value.replace(".", ""));

  it("matches for a wide grid of salaries, except where the old float code rounds an exact half-pesewa down", () => {
    let compared = 0;
    let legacyRoundedHalfDown = 0;
    const unexplained: string[] = [];
    for (let pesewas = 10_000; pesewas <= 9_000_000; pesewas += 4_999) {
      compared += 1;
      const amount = `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, "0")}`;
      const old = legacy(Number(amount));
      const next = calculatePayslip(settings(), payslip(amount));
      const got = { employee: Number(next.schemes[0]!.employee), employer: Number(next.schemes[0]!.employer), paye: Number(next.paye), net: Number(next.net) };
      if (got.employee === old.employee && got.employer === old.employer && got.paye === old.paye && got.net === old.net) continue;
      const exactHalf = remainderOfExactTax(toPesewas(next.chargeableIncome)) === 500_000n;
      const explained =
        exactHalf &&
        got.employee === old.employee &&
        got.employer === old.employer &&
        Math.round((got.paye - old.paye) * 100) === 1 &&
        Math.round((old.net - got.net) * 100) === 1;
      if (explained) legacyRoundedHalfDown += 1;
      else unexplained.push(`${amount}: old ${JSON.stringify(old)} new ${JSON.stringify(got)}`);
    }
    expect(unexplained).toEqual([]);
    // Documents the size of the difference so it is a known, bounded change rather than a surprise.
    expect(legacyRoundedHalfDown).toBeLessThan(compared * 0.03);
  });
});
