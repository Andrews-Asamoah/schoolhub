import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { assertValidTaxBands } from "./payroll-settings.js";

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
