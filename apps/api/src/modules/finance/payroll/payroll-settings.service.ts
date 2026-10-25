import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PayrollContributionCode } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { isPayrollSettingsApproverRole } from "../finance.permissions.js";

export type TaxBandDraft = { width: string | null; rate: string };
export type TaxScheduleDraft = {
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceNote: string;
  nonResidentFlatRate?: string | null;
  bands: TaxBandDraft[];
};
export type ContributionSchemeDraft = {
  code: PayrollContributionCode;
  label: string;
  trusteeName?: string | null;
  employeeRate: string;
  employerRate: string;
  base: "BASIC" | "GROSS" | "PENSIONABLE_ITEMS";
  insurableMinimum?: string | null;
  insurableMaximum?: string | null;
  whoPays: "EMPLOYEE" | "EMPLOYER" | "SHARED";
  employeeShareTaxDeductible: boolean;
  tier3ReliefCap?: string | null;
  carvedFromSchemeId?: string | null;
  carveType: "CARVED_FROM_SCHEME" | "ADDITIONAL";
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceNote: string;
};

function parseDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Enter ${label} as YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`Enter a valid ${label} date.`);
  return date;
}

function validateDateRange(from: Date, to: Date | null) {
  if (to && to < from) throw new BadRequestException("Effective end date cannot be before the start date.");
}

function decimalRate(value: string, label: string): Prisma.Decimal {
  let rate: Prisma.Decimal;
  try { rate = new Prisma.Decimal(value); } catch { throw new BadRequestException(`Enter a valid ${label}.`); }
  if (!rate.isFinite() || rate.lessThan(0) || rate.greaterThan(100)) throw new BadRequestException(`${label} must be between 0 and 100 percent.`);
  return rate;
}

function validateBands(bands: TaxBandDraft[]) {
  if (bands.length < 2) throw new BadRequestException("Add at least two PAYE bands.");
  if (new Prisma.Decimal(bands[0]!.rate).comparedTo(0) !== 0) throw new BadRequestException("The first PAYE band must have a 0% rate.");
  bands.forEach((band, index) => {
    decimalRate(band.rate, "PAYE rate");
    const last = index === bands.length - 1;
    if (last && band.width !== null) throw new BadRequestException("The final PAYE band must be open-ended.");
    if (!last && band.width === null) throw new BadRequestException("Only the final PAYE band may be open-ended.");
    if (band.width !== null) {
      let width: Prisma.Decimal;
      try { width = new Prisma.Decimal(band.width); } catch { throw new BadRequestException("Enter a valid PAYE band width."); }
      if (!width.isFinite() || width.lessThanOrEqualTo(0)) throw new BadRequestException("Finite PAYE band widths must be positive.");
    }
  });
}

@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async writeAudit(tx: Prisma.TransactionClient, actorId: string, schoolId: string, action: "CREATE" | "UPDATE", entityType: string, entityId: string, oldValues: unknown, newValues: unknown) {
    await tx.auditLog.create({
      data: {
        userId: actorId, schoolId, action, entityType, entityId,
        oldValues: oldValues === null ? Prisma.DbNull : oldValues as Prisma.InputJsonValue,
        newValues: newValues === null ? Prisma.DbNull : newValues as Prisma.InputJsonValue,
      },
    });
  }

  private async assertApprover(schoolId: string, actorId: string, proposerId: string, mustDiffer: boolean) {
    const db = this.prisma.client;
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { organizationId: true } });
    if (!school) throw new NotFoundException("School not found.");
    const [membership, actor] = await Promise.all([
      db.member.findFirst({ where: { organizationId: school.organizationId, userId: actorId }, select: { role: true } }),
      db.user.findUnique({ where: { id: actorId }, select: { twoFactorEnabled: true } }),
    ]);
    // Read the actual membership role. Never use the role guard's headteacher→admin alias here.
    if (!membership || !isPayrollSettingsApproverRole(membership.role)) {
      throw new ForbiddenException("Only a school owner or headteacher may verify or approve payroll statutory settings.");
    }
    if (mustDiffer && actorId === proposerId) throw new ForbiddenException("The person who proposed these settings cannot approve them.");
    if (!actor?.twoFactorEnabled) throw new ForbiddenException("Enable two-factor authentication before verifying or approving payroll statutory settings.");
  }

  async listSchedules(schoolId: string) {
    return this.prisma.client.payrollTaxSchedule.findMany({
      where: { schoolId }, include: { bands: { orderBy: { order: "asc" } } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    });
  }

  async createSchedule(schoolId: string, actorId: string, input: TaxScheduleDraft) {
    const effectiveFrom = parseDate(input.effectiveFrom, "effective start date");
    const effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo, "effective end date") : null;
    validateDateRange(effectiveFrom, effectiveTo);
    validateBands(input.bands);
    if (!input.sourceNote.trim()) throw new BadRequestException("Record the source for this tax schedule.");
    if (input.nonResidentFlatRate != null) decimalRate(input.nonResidentFlatRate, "non-resident flat rate");

    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.payrollTaxSchedule.findMany({ where: { schoolId, status: { in: ["PENDING_APPROVAL", "ACTIVE"] } }, select: { id: true, effectiveFrom: true, effectiveTo: true, status: true } });
      const overlaps = existing.some((row) => effectiveFrom <= (row.effectiveTo ?? new Date("9999-12-31T00:00:00.000Z")) && (effectiveTo ?? new Date("9999-12-31T00:00:00.000Z")) >= row.effectiveFrom);
      if (overlaps) throw new ConflictException("This schedule overlaps an existing non-archived schedule for the school.");
      const created = await tx.payrollTaxSchedule.create({
        data: {
          schoolId, name: input.name.trim(), effectiveFrom, effectiveTo,
          sourceNote: input.sourceNote.trim(), nonResidentFlatRate: input.nonResidentFlatRate == null ? null : new Prisma.Decimal(input.nonResidentFlatRate),
          createdById: actorId, needsVerification: true,
          verificationNotes: "Awaiting review against official statutory guidance.",
          bands: { create: input.bands.map((band, index) => ({ order: index + 1, width: band.width === null ? null : new Prisma.Decimal(band.width), rate: new Prisma.Decimal(band.rate) })) },
        },
        include: { bands: { orderBy: { order: "asc" } } },
      });
      await this.writeAudit(tx, actorId, schoolId, "CREATE", "PAYROLL_TAX_SCHEDULE", created.id, null, {
        name: created.name, effectiveFrom: created.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: created.effectiveTo?.toISOString().slice(0, 10) ?? null,
        status: created.status, needsVerification: created.needsVerification, bands: created.bands.map((band) => ({ order: band.order, width: band.width?.toFixed(2) ?? null, rate: band.rate.toFixed(4) })),
      });
      return created;
    });
  }

  async submitSchedule(schoolId: string, actorId: string, id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await tx.payrollTaxSchedule.findFirst({ where: { id, schoolId }, include: { bands: { orderBy: { order: "asc" } } } });
      if (!current) throw new NotFoundException("Payroll tax schedule not found.");
      if (current.status !== "DRAFT") throw new ConflictException("Only a draft tax schedule can be submitted.");
      validateBands(current.bands.map((band) => ({ width: band.width?.toFixed(2) ?? null, rate: band.rate.toFixed(4) })));
      const updated = await tx.payrollTaxSchedule.update({ where: { id }, data: { status: "PENDING_APPROVAL" }, include: { bands: { orderBy: { order: "asc" } } } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_TAX_SCHEDULE", id, { status: current.status }, { status: updated.status, needsVerification: updated.needsVerification });
      return updated;
    });
  }

  async verifySchedule(schoolId: string, actorId: string, id: string, notes: string) {
    const current = await this.prisma.client.payrollTaxSchedule.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Payroll tax schedule not found.");
    await this.assertApprover(schoolId, actorId, current.createdById, false);
    if (notes.trim().length < 10) throw new BadRequestException("Explain the official source verification (at least 10 characters).");
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.payrollTaxSchedule.update({ where: { id }, data: { needsVerification: false, verificationNotes: notes.trim() } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_TAX_SCHEDULE_VERIFICATION", id, { needsVerification: current.needsVerification, verificationNotes: current.verificationNotes }, { needsVerification: false, verificationNotes: notes.trim() });
      return updated;
    });
  }

  async approveSchedule(schoolId: string, actorId: string, id: string) {
    const current = await this.prisma.client.payrollTaxSchedule.findFirst({ where: { id, schoolId }, include: { bands: true } });
    if (!current) throw new NotFoundException("Payroll tax schedule not found.");
    await this.assertApprover(schoolId, actorId, current.createdById, true);
    if (current.status !== "PENDING_APPROVAL") throw new ConflictException("Only a submitted schedule can be approved.");
    if (current.needsVerification) throw new ConflictException("This schedule is unverified. Verify its official source before approval.");
    if (current.bands.length < 2 || current.bands.filter((band) => band.width === null).length !== 1) throw new BadRequestException("The schedule must have exactly one open-ended final band.");
    const peers = await this.prisma.client.payrollTaxSchedule.findMany({ where: { schoolId, id: { not: id }, status: { in: ["PENDING_APPROVAL", "ACTIVE"] } }, select: { effectiveFrom: true, effectiveTo: true } });
    const currentEnd = current.effectiveTo ?? new Date("9999-12-31T00:00:00.000Z");
    if (peers.some((row) => current.effectiveFrom <= (row.effectiveTo ?? new Date("9999-12-31T00:00:00.000Z")) && currentEnd >= row.effectiveFrom)) {
      throw new ConflictException("This schedule overlaps another pending or active schedule for the school.");
    }
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.payrollTaxSchedule.update({ where: { id }, data: { status: "ACTIVE", approvedById: actorId, approvedAt: new Date() } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_TAX_SCHEDULE", id, { status: current.status, needsVerification: current.needsVerification }, { status: updated.status, approvedById: actorId, approvedAt: updated.approvedAt?.toISOString() ?? null });
      return updated;
    });
  }

  async listSchemes(schoolId: string) {
    return this.prisma.client.payrollContributionScheme.findMany({ where: { schoolId }, include: { carvedFrom: { select: { id: true, code: true, label: true } } }, orderBy: [{ effectiveFrom: "desc" }, { code: "asc" }] });
  }

  async createScheme(schoolId: string, actorId: string, input: ContributionSchemeDraft) {
    const effectiveFrom = parseDate(input.effectiveFrom, "effective start date");
    const effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo, "effective end date") : null;
    validateDateRange(effectiveFrom, effectiveTo);
    decimalRate(input.employeeRate, "employee contribution rate");
    decimalRate(input.employerRate, "employer contribution rate");
    if (input.insurableMinimum != null && input.insurableMaximum != null && new Prisma.Decimal(input.insurableMinimum).greaterThan(new Prisma.Decimal(input.insurableMaximum))) throw new BadRequestException("Insurable minimum cannot exceed maximum.");
    if (!input.sourceNote.trim()) throw new BadRequestException("Record the source for this contribution scheme.");
    if (input.code === "TIER3" && input.tier3ReliefCap == null) throw new BadRequestException("Tier 3 remains unverified until its official relief cap is recorded.");
    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.payrollContributionScheme.create({
        data: {
          schoolId, code: input.code, label: input.label.trim(), trusteeName: input.trusteeName ?? null,
          employeeRate: new Prisma.Decimal(input.employeeRate), employerRate: new Prisma.Decimal(input.employerRate),
          base: input.base, insurableMinimum: input.insurableMinimum == null ? null : new Prisma.Decimal(input.insurableMinimum),
          insurableMaximum: input.insurableMaximum == null ? null : new Prisma.Decimal(input.insurableMaximum),
          whoPays: input.whoPays, employeeShareTaxDeductible: input.employeeShareTaxDeductible,
          tier3ReliefCap: input.tier3ReliefCap == null ? null : new Prisma.Decimal(input.tier3ReliefCap),
          carvedFromSchemeId: input.carvedFromSchemeId ?? null, carveType: input.carveType,
          effectiveFrom, effectiveTo, sourceNote: input.sourceNote.trim(), createdById: actorId,
          needsVerification: true, verificationNotes: "Awaiting review against official statutory guidance.",
        },
      });
      await this.writeAudit(tx, actorId, schoolId, "CREATE", "PAYROLL_CONTRIBUTION_SCHEME", created.id, null, {
        code: created.code, label: created.label, employeeRate: created.employeeRate.toFixed(4), employerRate: created.employerRate.toFixed(4),
        effectiveFrom: created.effectiveFrom.toISOString().slice(0, 10), status: created.status, needsVerification: created.needsVerification,
      });
      return created;
    });
  }

  async submitScheme(schoolId: string, actorId: string, id: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await tx.payrollContributionScheme.findFirst({ where: { id, schoolId } });
      if (!current) throw new NotFoundException("Contribution scheme not found.");
      if (current.status !== "DRAFT") throw new ConflictException("Only a draft contribution scheme can be submitted.");
      const updated = await tx.payrollContributionScheme.update({ where: { id }, data: { status: "PENDING_APPROVAL" } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_CONTRIBUTION_SCHEME", id, { status: current.status }, { status: updated.status, needsVerification: updated.needsVerification });
      return updated;
    });
  }

  async verifyScheme(schoolId: string, actorId: string, id: string, notes: string) {
    const current = await this.prisma.client.payrollContributionScheme.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Contribution scheme not found.");
    await this.assertApprover(schoolId, actorId, current.createdById, false);
    if (notes.trim().length < 10) throw new BadRequestException("Explain the official source verification (at least 10 characters).");
    if (current.code === "TIER3" && current.tier3ReliefCap == null) throw new ConflictException("Tier 3 cannot be verified without an officially confirmed relief cap.");
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.payrollContributionScheme.update({ where: { id }, data: { needsVerification: false, verificationNotes: notes.trim() } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_CONTRIBUTION_SCHEME_VERIFICATION", id, { needsVerification: current.needsVerification, verificationNotes: current.verificationNotes }, { needsVerification: false, verificationNotes: notes.trim() });
      return updated;
    });
  }

  async approveScheme(schoolId: string, actorId: string, id: string) {
    const current = await this.prisma.client.payrollContributionScheme.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Contribution scheme not found.");
    await this.assertApprover(schoolId, actorId, current.createdById, true);
    if (current.status !== "PENDING_APPROVAL") throw new ConflictException("Only a submitted contribution scheme can be approved.");
    if (current.needsVerification) throw new ConflictException("This contribution scheme is unverified. Verify its official source before approval.");
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.payrollContributionScheme.update({ where: { id }, data: { status: "ACTIVE", approvedById: actorId, approvedAt: new Date() } });
      await this.writeAudit(tx, actorId, schoolId, "UPDATE", "PAYROLL_CONTRIBUTION_SCHEME", id, { status: current.status, needsVerification: current.needsVerification }, { status: updated.status, approvedById: actorId, approvedAt: updated.approvedAt?.toISOString() ?? null });
      return updated;
    });
  }
}
