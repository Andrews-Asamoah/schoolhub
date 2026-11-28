import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { assertValidTaxBands, resolvePayrollSettings } from "./payroll-settings.js";
import { GHANA_PAYE_2026, ghanaSchemeTemplates } from "./payroll-settings.templates.js";

export type TaxScheduleDraftInput = {
  name: string; effectiveFrom: string; effectiveTo?: string | null; nonResidentRate: string; sourceNote: string;
  bands: Array<{ width: string | null; rate: string }>;
};
export type ContributionSchemeDraftInput = {
  key: string; label: string; trustee?: string | null; base: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";
  employeeRate: string; employerRate: string; memoRate: string;
  insurableMin?: string | null; insurableMax?: string | null; employeeShareTaxDeductible: boolean;
  effectiveFrom: string; effectiveTo?: string | null; sourceNote: string;
};

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isExclusionViolation = (error: unknown) =>
  /exclusion constraint|23P01|no_overlap/i.test(JSON.stringify({ m: (error as { message?: string } | null)?.message, c: (error as { code?: string } | null)?.code, d: (error as { cause?: unknown } | null)?.cause }));

/**
 * School-scoped management of effective-dated payroll settings.
 * No rate is ever created ACTIVE here: an accountant drafts it with its official source,
 * and a different, authorised person activates it. Platform defaults (schoolId = null) are
 * read-only to schools.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string) {
    const db = this.prisma.client;
    const [taxSchedules, schemes] = await Promise.all([
      db.payrollTaxSchedule.findMany({ where: { OR: [{ schoolId }, { schoolId: null }] }, include: { bands: { orderBy: { position: "asc" } } }, orderBy: { effectiveFrom: "desc" }, take: 200 }),
      db.payrollContributionScheme.findMany({ where: { OR: [{ schoolId }, { schoolId: null }] }, orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }], take: 500 }),
    ]);
    return { taxSchedules, schemes };
  }


  /** Starter values an accountant can load into a draft. Nothing here is saved or approved. */
  templates() {
    return { taxSchedule: GHANA_PAYE_2026, schemes: ghanaSchemeTemplates(GHANA_PAYE_2026.effectiveFrom) };
  }

  /**
   * One-click setup: creates DRAFT rows from the Ghana templates for whatever the school is still missing.
   * Rows already present (any status) for the same key/start date are skipped, so it is safe to click twice.
   */
  async createStarterDrafts(schoolId: string) {
    const { taxSchedules, schemes } = await this.list(schoolId);
    const created = { taxSchedules: 0, schemes: 0 };
    const taxFrom = GHANA_PAYE_2026.effectiveFrom;
    if (!taxSchedules.some(row => row.schoolId === schoolId && row.effectiveFrom.toISOString().slice(0, 10) === taxFrom)) {
      await this.createTaxScheduleDraft(schoolId, GHANA_PAYE_2026);
      created.taxSchedules += 1;
    }
    for (const template of ghanaSchemeTemplates("2026-01-01")) {
      const exists = schemes.some(row => row.schoolId === schoolId && row.key === template.key);
      if (exists) continue;
      await this.createSchemeDraft(schoolId, template);
      created.schemes += 1;
    }
    return created;
  }

  /**
   * Tells the payroll page, before anyone clicks Generate, whether a draft can be calculated for the month
   * and, if not, exactly what is missing. Uses the same resolver as the generator, so the two never disagree.
   */
  async readiness(schoolId: string, month: number, year: number) {
    const periodEnd = new Date(Date.UTC(year, month, 0));
    const db = this.prisma.client;
    const scope = { OR: [{ schoolId }, { schoolId: null }] };
    const [taxRows, schemeRows, draftTax, draftSchemes] = await Promise.all([
      db.payrollTaxSchedule.findMany({ where: { ...scope, status: "ACTIVE", effectiveFrom: { lte: periodEnd } }, include: { bands: true } }),
      db.payrollContributionScheme.findMany({ where: { ...scope, status: "ACTIVE", effectiveFrom: { lte: periodEnd } } }),
      db.payrollTaxSchedule.count({ where: { schoolId, status: "DRAFT" } }),
      db.payrollContributionScheme.count({ where: { schoolId, status: "DRAFT" } }),
    ]);
    const problems: string[] = [];
    let resolved: ReturnType<typeof resolvePayrollSettings> | null = null;
    try {
      resolved = resolvePayrollSettings(schoolId, periodEnd, taxRows, schemeRows);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "Payroll settings could not be resolved.");
    }
    const pendingDrafts = draftTax + draftSchemes;
    if (problems.length && pendingDrafts) {
      problems.push(`${pendingDrafts} draft setting(s) are waiting for approval. Activate them from Payroll settings.`);
    }
    return {
      month, year, periodEnd: periodEnd.toISOString().slice(0, 10), ready: !!resolved, problems, pendingDrafts,
      taxScheduleId: resolved?.taxScheduleId ?? null,
      schemeKeys: resolved?.settings.schemes.map(s => s.key) ?? [],
    };
  }

  async createTaxScheduleDraft(schoolId: string, input: TaxScheduleDraftInput) {
    const bands = assertValidTaxBands(input.bands.map((b, i) => ({ position: i, width: b.width === null ? null : new Prisma.Decimal(b.width), rate: new Prisma.Decimal(b.rate) })));
    this.assertDates(input.effectiveFrom, input.effectiveTo);
    return this.prisma.client.payrollTaxSchedule.create({
      data: {
        schoolId, name: input.name, effectiveFrom: date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? date(input.effectiveTo) : null,
        nonResidentRate: new Prisma.Decimal(input.nonResidentRate), status: "DRAFT", sourceNote: input.sourceNote,
        bands: { create: bands.map(b => ({ position: b.position, width: b.width, rate: b.rate })) },
      },
      include: { bands: { orderBy: { position: "asc" } } },
    });
  }

  async createSchemeDraft(schoolId: string, input: ContributionSchemeDraftInput) {
    this.assertDates(input.effectiveFrom, input.effectiveTo);
    const min = input.insurableMin ? new Prisma.Decimal(input.insurableMin) : null;
    const max = input.insurableMax ? new Prisma.Decimal(input.insurableMax) : null;
    if (min && max && min.gt(max)) throw new BadRequestException("The insurable minimum cannot exceed the maximum.");
    return this.prisma.client.payrollContributionScheme.create({
      data: {
        schoolId, key: input.key, label: input.label, trustee: input.trustee ?? null, base: input.base,
        employeeRate: new Prisma.Decimal(input.employeeRate), employerRate: new Prisma.Decimal(input.employerRate),
        memoRate: new Prisma.Decimal(input.memoRate), insurableMin: min, insurableMax: max,
        employeeShareTaxDeductible: input.employeeShareTaxDeductible,
        effectiveFrom: date(input.effectiveFrom), effectiveTo: input.effectiveTo ? date(input.effectiveTo) : null,
        status: "DRAFT", sourceNote: input.sourceNote,
      },
    });
  }

  /** Only a school's own DRAFT can be edited or discarded; ACTIVE and RETIRED rows are history. */
  async deleteDraft(schoolId: string, kind: "tax" | "scheme", id: string) {
    const db = this.prisma.client;
    const result = kind === "tax"
      ? await db.payrollTaxSchedule.deleteMany({ where: { id, schoolId, status: "DRAFT" } })
      : await db.payrollContributionScheme.deleteMany({ where: { id, schoolId, status: "DRAFT" } });
    if (result.count !== 1) throw new NotFoundException("Draft setting not found, or it is no longer a draft.");
    return { id, deleted: true };
  }

  async activate(schoolId: string, kind: "tax" | "scheme", id: string, approverId: string) {
    const db = this.prisma.client;
    const data = { status: "ACTIVE" as const, approvedById: approverId };
    try {
      const result = kind === "tax"
        ? await db.payrollTaxSchedule.updateMany({ where: { id, schoolId, status: "DRAFT", sourceNote: { not: null } }, data })
        : await db.payrollContributionScheme.updateMany({ where: { id, schoolId, status: "DRAFT", sourceNote: { not: null } }, data });
      if (result.count !== 1) throw new NotFoundException("Draft setting not found, or it has no official source note.");
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isExclusionViolation(error)) {
        throw new ConflictException("An active setting already covers part of this period. Retire it, or set its end date, before activating this one.");
      }
      throw error;
    }
    return this.get(kind, id);
  }

  /**
   * Ends an active setting on a date. It stays ACTIVE (the resolver only reads ACTIVE rows),
   * so earlier periods still resolve to it and can be reproduced; only later periods stop matching.
   */
  async setEndDate(schoolId: string, kind: "tax" | "scheme", id: string, effectiveTo: string) {
    const end = date(effectiveTo);
    const db = this.prisma.client;
    const row = kind === "tax"
      ? await db.payrollTaxSchedule.findFirst({ where: { id, schoolId, status: "ACTIVE" } })
      : await db.payrollContributionScheme.findFirst({ where: { id, schoolId, status: "ACTIVE" } });
    if (!row) throw new NotFoundException("Active setting not found.");
    if (end < row.effectiveFrom) throw new BadRequestException("The end date cannot be before the effective start date.");
    if (kind === "tax") await db.payrollTaxSchedule.update({ where: { id }, data: { effectiveTo: end } });
    else await db.payrollContributionScheme.update({ where: { id }, data: { effectiveTo: end } });
    return this.get(kind, id);
  }

  private get(kind: "tax" | "scheme", id: string) {
    const db = this.prisma.client;
    return kind === "tax"
      ? db.payrollTaxSchedule.findUniqueOrThrow({ where: { id }, include: { bands: { orderBy: { position: "asc" } } } })
      : db.payrollContributionScheme.findUniqueOrThrow({ where: { id } });
  }

  private assertDates(from: string, to?: string | null) {
    if (to && date(to) < date(from)) throw new BadRequestException("The end date cannot be before the effective start date.");
  }
}
