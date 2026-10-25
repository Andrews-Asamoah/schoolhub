import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateExpenseInput, FinancePage, FinanceSummaryResponse, GenerateBillInput, RecordPaymentInput, StudentStatementResponse, StudentStatementScope } from "@schoolhub/shared";
import { Prisma, type AccountCategory, type AccountType, type AuditAction, type PaymentMethod, type TransactionCategory } from "@prisma/client";
import { canManageAcademicContext } from "../../common/academic-context.js";
import { createSequence, isIdempotencyRace, isSerializationFailure, postingDateProblem, withSerializableRetry } from "./finance.helpers.js";
import { buildFinanceAuditWhere, categoryOf, clampPageSize, describeFinanceAudit, type FinanceAuditQuery } from "./finance-audit.helpers.js";
import { buildRunningStatementEntries, decodeReportingCursor, encodeReportingCursor, parseReportingDate, type StatementLedgerEvent } from "./finance-reporting.helpers.js";

const PAYE_MONTHLY_BANDS_2026 = [
  { limit: 588, rate: 0 },
  { limit: 80, rate: 0.05 },
  { limit: 100, rate: 0.10 },
  { limit: 2_900, rate: 0.175 },
  { limit: 16_000, rate: 0.25 },
  { limit: 30_332, rate: 0.30 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.35 },
] as const;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateResidentPaye2026(chargeableIncome: number) {
  let remaining = Math.max(0, chargeableIncome);
  let tax = 0;
  for (const band of PAYE_MONTHLY_BANDS_2026) {
    if (remaining <= 0) break;
    const taxableInBand = Math.min(remaining, band.limit);
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
  }
  return roundMoney(tax);
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rejects future dates and dates inside a closed period. Call inside the posting transaction. */
  private async assertPostingDate(
    db: Pick<Prisma.TransactionClient, "financePeriodLock">,
    schoolId: string,
    date: Date,
  ) {
    const lock = await db.financePeriodLock.findUnique({ where: { schoolId }, select: { lockedThrough: true } });
    const problem = postingDateProblem(date, lock?.lockedThrough ?? null);
    if (problem) throw new BadRequestException(problem);
  }

  /** Newest-first page of this school's finance audit entries. */
  async listFinanceAudit(schoolId: string, query: FinanceAuditQuery) {
    let where;
    try {
      where = buildFinanceAuditWhere(schoolId, query);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const take = clampPageSize(query.limit);
    const rows = await this.prisma.client.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((row) => {
        const details = (row.newValues ?? null) as Record<string, unknown> | null;
        return {
          id: row.id,
          createdAt: row.createdAt,
          actor: row.user,
          category: categoryOf(row.entityType, row.action),
          title: describeFinanceAudit(row.entityType, row.action),
          entityType: row.entityType,
          entityId: row.entityId,
          oldValues: row.oldValues,
          newValues: row.newValues,
          actedAsSuperAdmin: details?.actedAsSuperAdmin === true,
          supportReason: typeof details?.supportReason === "string" ? details.supportReason : null,
          ipAddress: row.ipAddress,
        };
      }),
      nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
    };
  }

  async getPeriodLock(schoolId: string) {
    const lock = await this.prisma.client.financePeriodLock.findUnique({ where: { schoolId } });
    return {
      lockedThrough: lock ? lock.lockedThrough.toISOString().slice(0, 10) : null,
      reason: lock?.reason ?? null,
      updatedAt: lock?.updatedAt ?? null,
    };
  }

  /**
   * Close the books through a date (or reopen them with null). Closing is a
   * normal accountant action. Reopening, or moving the date earlier, undoes a
   * close, so only a platform administrator may do it. Every change is audited.
   */
  async setPeriodLock(
    schoolId: string,
    actorId: string,
    actorIsSuperAdmin: boolean,
    input: { lockedThrough: string | null; reason: string },
  ) {
    let next: Date | null = null;
    if (input.lockedThrough) {
      next = new Date(`${input.lockedThrough}T00:00:00.000Z`);
      if (Number.isNaN(next.getTime()) || next.toISOString().slice(0, 10) !== input.lockedThrough) {
        throw new BadRequestException("Enter a valid date to close the books through.");
      }
      if (next.getTime() > Date.now()) {
        throw new BadRequestException("You cannot close the books through a date in the future.");
      }
    }
    await this.prisma.client.$transaction(async (tx) => {
      const current = await tx.financePeriodLock.findUnique({ where: { schoolId } });
      const reopening = !!current && (!next || next.getTime() < current.lockedThrough.getTime());
      if (reopening && !actorIsSuperAdmin) {
        throw new ForbiddenException("Only a platform administrator can reopen a closed period.");
      }
      if (next) {
        await tx.financePeriodLock.upsert({
          where: { schoolId },
          create: { schoolId, lockedThrough: next, updatedById: actorId, reason: input.reason },
          update: { lockedThrough: next, updatedById: actorId, reason: input.reason },
        });
      } else if (current) {
        await tx.financePeriodLock.delete({ where: { schoolId } });
      }
      await this.writeAudit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "FINANCE_PERIOD_LOCK",
        entityId: current?.id ?? schoolId,
        oldValues: { lockedThrough: current?.lockedThrough.toISOString().slice(0, 10) ?? null },
        newValues: { lockedThrough: next ? next.toISOString().slice(0, 10) : null, reason: input.reason },
      });
    });
    return this.getPeriodLock(schoolId);
  }

  /**
   * Separation of duties: the person who prepared a payroll run cannot approve
   * it, and the approver cannot be the one who confirms it paid. A different
   * accountant or a platform administrator completes the step. Single-person
   * schools and local development can set FINANCE_ALLOW_SELF_APPROVAL=true.
   */
  private assertSeparationOfDuties(actorId: string, earlierActorId: string | null | undefined, step: "approved" | "marked as paid") {
    if (process.env.FINANCE_ALLOW_SELF_APPROVAL === "true") return;
    if (earlierActorId && earlierActorId === actorId) {
      throw new ForbiddenException(
        `A payroll run cannot be ${step} by the same person who ${step === "approved" ? "prepared" : "approved"} it. Ask another accountant or the platform administrator.`,
      );
    }
  }

  /** Audit entry written inside the caller's transaction so it commits (or rolls back) with the change. */
  private async writeAudit(
    db: Pick<Prisma.TransactionClient, "auditLog">,
    entry: {
      actorId: string;
      schoolId: string;
      action: AuditAction;
      entityType: string;
      entityId: string;
      oldValues?: Prisma.InputJsonValue;
      newValues?: Prisma.InputJsonValue;
    },
  ) {
    await db.auditLog.create({
      data: {
        userId: entry.actorId,
        schoolId: entry.schoolId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues,
        newValues: entry.newValues,
      },
    });
  }

  /**
   * Sequential, school-scoped numbering (RCT-2026-00001, INV-2026-00001).
   * Takes a per-school advisory lock for the rest of the transaction, so
   * concurrent requests can never be issued the same number.
   */
  private async createNumberSequence(
    tx: Prisma.TransactionClient,
    schoolId: string,
    kind: "payment" | "bill",
    prefix: string,
  ) {
    const lockKey = `${kind}-number`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${lockKey}))`;
    const existing =
      kind === "payment"
        ? (await tx.payment.findMany({ where: { schoolId, paymentNumber: { startsWith: prefix } }, select: { paymentNumber: true } })).map((row) => row.paymentNumber)
        : (await tx.bill.findMany({ where: { schoolId, billNumber: { startsWith: prefix } }, select: { billNumber: true } })).map((row) => row.billNumber);
    return createSequence(existing, prefix);
  }

  async listFeeStructures(schoolId: string, includeArchived = false) {
    return this.prisma.client.feeStructure.findMany({
      where: includeArchived ? { schoolId } : { schoolId, isActive: true },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        items: true,
        targetClasses: { include: { class: { select: { id: true, name: true } } } },
        _count: { select: { bills: true } },
      },
    });
  }

  async listFeeItemRegistry(schoolId: string) {
    return this.prisma.client.feeItemRegistry.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
    });
  }

  async createFeeItemRegistry(schoolId: string, input: { name: string; description?: string | null }) {
    const name = input.name.trim();
    const duplicate = await this.prisma.client.feeItemRegistry.findFirst({
      where: { schoolId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException("A fee item category with that name already exists.");
    return this.prisma.client.feeItemRegistry.create({
      data: { schoolId, name, description: input.description?.trim() || null },
    });
  }

  async updateFeeItemRegistry(schoolId: string, itemId: string, input: { name: string; description?: string | null }) {
    const existing = await this.prisma.client.feeItemRegistry.findFirst({
      where: { id: itemId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Fee item category not found.");
    const name = input.name.trim();
    const duplicate = await this.prisma.client.feeItemRegistry.findFirst({
      where: { schoolId, id: { not: itemId }, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException("A fee item category with that name already exists.");
    return this.prisma.client.feeItemRegistry.update({
      where: { id: itemId },
      data: { name, description: input.description?.trim() || null },
    });
  }

  async createFeeStructure(
    schoolId: string,
    input: {
      name: string;
      description?: string | null;
      classLevel?: string | null;
      termBased: boolean;
      targetClassIds: string[];
      items: { registryItemId?: string | null; name: string; amount: number; isOptional: boolean; description?: string | null }[];
    },
  ) {
    const classIds = [...new Set(input.targetClassIds)];
    const registryIds = [...new Set(input.items.map((item) => item.registryItemId).filter((id): id is string => Boolean(id)))];
    const [classes, registryItems] = await Promise.all([
      classIds.length
        ? this.prisma.client.class.findMany({
            where: { id: { in: classIds }, schoolId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([]),
      registryIds.length
        ? this.prisma.client.feeItemRegistry.findMany({
            where: { id: { in: registryIds }, schoolId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    if (classes.length !== classIds.length) {
      throw new BadRequestException("One or more selected classes do not belong to this school.");
    }
    if (registryItems.length !== registryIds.length) {
      throw new BadRequestException("One or more fee item categories are invalid for this school.");
    }

    return this.prisma.client.feeStructure.create({
      data: {
        schoolId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        classLevel: input.classLevel?.trim() || null,
        termBased: input.termBased,
        targetClasses: {
          create: classIds.map((classId) => ({ classId })),
        },
        items: {
          create: input.items.map((item) => {
            const registryItem = registryItems.find((candidate) => candidate.id === item.registryItemId);
            return {
              name: item.name.trim() || registryItem?.name || "Fee item",
              amount: new Prisma.Decimal(item.amount),
              isOptional: item.isOptional,
              description: item.description?.trim() || null,
              registryItemId: item.registryItemId || null,
            };
          }),
        },
      },
      include: {
        items: true,
        targetClasses: { include: { class: { select: { id: true, name: true } } } },
        _count: { select: { bills: true } },
      },
    });
  }

  async updateFeeStructure(
    schoolId: string,
    feeStructureId: string,
    input: {
      name: string;
      description?: string | null;
      classLevel?: string | null;
      termBased: boolean;
      targetClassIds: string[];
      items: { registryItemId?: string | null; name: string; amount: number; isOptional: boolean; description?: string | null }[];
    },
  ) {
    const classIds = [...new Set(input.targetClassIds)];
    const registryIds = [...new Set(input.items.map((item) => item.registryItemId).filter((id): id is string => Boolean(id)))];

    return this.prisma.client.$transaction(async (tx) => {
      // Share the same advisory lock with bill generation so an edit cannot
      // race with a bill that is being created from this template.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${feeStructureId}))`;
      const existing = await tx.feeStructure.findFirst({
        where: { id: feeStructureId, schoolId },
        include: { _count: { select: { bills: true } } },
      });
      if (!existing) throw new NotFoundException("Fee structure not found.");
      if (existing._count.bills > 0) {
        throw new ConflictException(
          "This fee structure has already been used to generate student bills and is locked. Duplicate it to create an editable version.",
        );
      }

      const [classes, registryItems] = await Promise.all([
        classIds.length
          ? tx.class.findMany({
              where: { id: { in: classIds }, schoolId, deletedAt: null },
              select: { id: true },
            })
          : Promise.resolve([]),
        registryIds.length
          ? tx.feeItemRegistry.findMany({
              where: { id: { in: registryIds }, schoolId },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
      ]);
      if (classes.length !== classIds.length) {
        throw new BadRequestException("One or more selected classes do not belong to this school.");
      }
      if (registryItems.length !== registryIds.length) {
        throw new BadRequestException("One or more fee item categories are invalid for this school.");
      }

      // No bill has ever been generated from this structure, so replacing
      // the template's item and class rows is safe. The operation is atomic.
      await tx.feeStructureClass.deleteMany({ where: { feeStructureId } });
      await tx.feeItem.deleteMany({ where: { feeStructureId } });
      return tx.feeStructure.update({
        where: { id: feeStructureId },
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          classLevel: input.classLevel?.trim() || null,
          termBased: input.termBased,
          targetClasses: { create: classIds.map((classId) => ({ classId })) },
          items: {
            create: input.items.map((item) => {
              const registryItem = registryItems.find((candidate) => candidate.id === item.registryItemId);
              return {
                name: item.name.trim() || registryItem?.name || "Fee item",
                amount: new Prisma.Decimal(item.amount),
                isOptional: item.isOptional,
                description: item.description?.trim() || null,
                registryItemId: item.registryItemId || null,
              };
            }),
          },
        },
        include: {
          items: true,
          targetClasses: { include: { class: { select: { id: true, name: true } } } },
          _count: { select: { bills: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setFeeStructureActive(schoolId: string, feeStructureId: string, isActive: boolean) {
    const existing = await this.prisma.client.feeStructure.findFirst({
      where: { id: feeStructureId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Fee structure not found.");
    return this.prisma.client.feeStructure.update({
      where: { id: feeStructureId },
      data: { isActive },
      include: {
        items: true,
        targetClasses: { include: { class: { select: { id: true, name: true } } } },
        _count: { select: { bills: true } },
      },
    });
  }


  async listConcessions(schoolId: string) {
    const [siblingPolicies, scholarships] = await Promise.all([
      this.prisma.client.siblingDiscountPolicy.findMany({
        where: { schoolId },
        orderBy: [{ isActive: "desc" }, { minimumWardCount: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.client.studentScholarship.findMany({
        where: { schoolId },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        take: 500,
      }),
    ]);
    return { siblingPolicies, scholarships };
  }

  async createSiblingDiscountPolicy(
    schoolId: string,
    createdById: string,
    input: { name: string; minimumWardCount: number; valueType: "PERCENTAGE" | "FIXED"; value: number },
  ) {
    const name = input.name.trim();
    const existingThreshold = await this.prisma.client.siblingDiscountPolicy.findFirst({
      where: { schoolId, minimumWardCount: input.minimumWardCount, isActive: true },
      select: { id: true },
    });
    if (existingThreshold) throw new ConflictException("An active rule already exists for this number of linked wards. Deactivate it before replacing it.");
    const existing = await this.prisma.client.siblingDiscountPolicy.findFirst({
      where: { schoolId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A sibling discount policy with this name already exists.");
    if (input.valueType === "PERCENTAGE" && input.value > 100) {
      throw new BadRequestException("Percentage discounts cannot exceed 100%.");
    }
    if (input.value <= 0 || input.minimumWardCount < 2) {
      throw new BadRequestException("Enter a positive discount and a minimum of at least two linked wards.");
    }
    return this.prisma.client.siblingDiscountPolicy.create({
      data: {
        schoolId, createdById, name, minimumWardCount: input.minimumWardCount,
        valueType: input.valueType, value: new Prisma.Decimal(input.value),
      },
    });
  }

  async setSiblingDiscountPolicyActive(schoolId: string, policyId: string, isActive: boolean) {
    const policy = await this.prisma.client.siblingDiscountPolicy.findFirst({
      where: { id: policyId, schoolId }, select: { id: true, minimumWardCount: true },
    });
    if (!policy) throw new NotFoundException("Sibling discount policy not found.");
    if (isActive) {
      const duplicateThreshold = await this.prisma.client.siblingDiscountPolicy.findFirst({
        where: { schoolId, minimumWardCount: policy.minimumWardCount, isActive: true, id: { not: policyId } },
        select: { id: true },
      });
      if (duplicateThreshold) throw new ConflictException("Another active rule already exists for this number of linked wards.");
    }
    return this.prisma.client.siblingDiscountPolicy.update({ where: { id: policyId }, data: { isActive } });
  }

  async createStudentScholarship(
    schoolId: string,
    createdById: string,
    input: {
      studentId: string; name: string; valueType: "PERCENTAGE" | "FIXED"; value: number;
      reason?: string; academicYearId?: string; termId?: string; startDate?: string; endDate?: string;
    },
  ) {
    const [student, academicYear, term] = await Promise.all([
      this.prisma.client.student.findFirst({
        where: { id: input.studentId, schoolId, deletedAt: null, status: "ACTIVE" },
        select: { id: true },
      }),
      input.academicYearId
        ? this.prisma.client.academicYear.findFirst({ where: { id: input.academicYearId, schoolId }, select: { id: true } })
        : Promise.resolve(null),
      input.termId
        ? this.prisma.client.term.findFirst({ where: { id: input.termId, academicYear: { schoolId } }, select: { id: true, academicYearId: true } })
        : Promise.resolve(null),
    ]);
    if (!student) throw new NotFoundException("Active student not found in this school.");
    if (input.academicYearId && !academicYear) throw new BadRequestException("The selected academic year does not belong to this school.");
    if (input.termId && !term) throw new BadRequestException("The selected term does not belong to this school.");
    if (term && input.academicYearId && term.academicYearId !== input.academicYearId) {
      throw new BadRequestException("The selected term belongs to a different academic year.");
    }
    if (input.valueType === "PERCENTAGE" && input.value > 100) throw new BadRequestException("Scholarship percentage cannot exceed 100%.");
    if (input.value <= 0) throw new BadRequestException("Scholarship value must be greater than zero.");
    if (input.startDate && input.endDate && input.startDate > input.endDate) {
      throw new BadRequestException("The scholarship end date must be on or after its start date.");
    }
    return this.prisma.client.studentScholarship.create({
      data: {
        schoolId, createdById, studentId: student.id, name: input.name.trim(),
        valueType: input.valueType, value: new Prisma.Decimal(input.value),
        reason: input.reason?.trim() || null, academicYearId: academicYear?.id ?? term?.academicYearId ?? null,
        termId: term?.id ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
      include: {
        student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async setStudentScholarshipActive(schoolId: string, scholarshipId: string, isActive: boolean) {
    const scholarship = await this.prisma.client.studentScholarship.findFirst({
      where: { id: scholarshipId, schoolId }, select: { id: true },
    });
    if (!scholarship) throw new NotFoundException("Student scholarship not found.");
    return this.prisma.client.studentScholarship.update({ where: { id: scholarshipId }, data: { isActive } });
  }

  private async calculateStudentConcessions(
    tx: Prisma.TransactionClient,
    schoolId: string,
    studentId: string,
    academicYearId: string,
    termId: string,
    grossAmount: number,
  ) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const scholarships = await tx.studentScholarship.findMany({
      where: {
        schoolId, studentId, isActive: true,
        AND: [
          { OR: [{ academicYearId: null }, { academicYearId }] },
          { OR: [{ termId: null }, { termId }] },
          { OR: [{ startDate: null }, { startDate: { lte: today } }] },
          { OR: [{ endDate: null }, { endDate: { gte: today } }] },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    const details: { type: "SCHOLARSHIP" | "SIBLING_DISCOUNT"; label: string; amount: number; scholarshipId?: string; policyId?: string }[] = [];
    let remaining = grossAmount;
    for (const scholarship of scholarships) {
      if (remaining <= 0) break;
      const requested = scholarship.valueType === "PERCENTAGE"
        ? roundMoney(grossAmount * Number(scholarship.value) / 100)
        : Number(scholarship.value);
      const amount = roundMoney(Math.min(remaining, Math.max(0, requested)));
      if (amount > 0) {
        details.push({ type: "SCHOLARSHIP", label: scholarship.name, amount, scholarshipId: scholarship.id });
        remaining = roundMoney(remaining - amount);
      }
    }

    const guardianLinks = await tx.guardianStudent.findMany({
      where: { studentId, guardian: { schoolId, isActive: true, deletedAt: null } },
      select: { guardianId: true },
    });
    const guardianIds = [...new Set(guardianLinks.map((link) => link.guardianId))];
    if (remaining > 0 && guardianIds.length) {
      const linkedStudents = await tx.guardianStudent.findMany({
        where: {
          guardianId: { in: guardianIds },
          student: { schoolId, status: "ACTIVE", deletedAt: null },
          guardian: { schoolId, isActive: true, deletedAt: null },
        },
        select: { studentId: true },
      });
      const wardCount = new Set(linkedStudents.map((link) => link.studentId)).size;
      const policy = await tx.siblingDiscountPolicy.findFirst({
        where: { schoolId, isActive: true, minimumWardCount: { lte: wardCount } },
        orderBy: [{ minimumWardCount: "desc" }, { createdAt: "desc" }],
      });
      if (policy) {
        const requested = policy.valueType === "PERCENTAGE"
          ? roundMoney(remaining * Number(policy.value) / 100)
          : Number(policy.value);
        const amount = roundMoney(Math.min(remaining, Math.max(0, requested)));
        if (amount > 0) details.push({ type: "SIBLING_DISCOUNT", label: policy.name, amount, policyId: policy.id });
      }
    }
    return { details, totalDiscount: roundMoney(details.reduce((sum, item) => sum + item.amount, 0)) };
  }

  async generateBills(schoolId: string, input: GenerateBillInput, actorId: string) {
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!currentYear || !currentTerm) {
      throw new BadRequestException("This school has not selected a current academic year and term.");
    }
    if (
      input.academicYearId !== currentYear.id ||
      (input.termId && input.termId !== currentTerm.id)
    ) {
      throw new BadRequestException("Bills can only be generated for the currently selected academic year and term.");
    }

    if (input.classId) {
      const schoolClass = await this.prisma.client.class.findFirst({
        where: { id: input.classId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!schoolClass) throw new NotFoundException("Class not found in this school.");
    }

    // Target students: either a single currently enrolled student or all
    // currently enrolled students in the selected class.
    let studentIds: string[] = [];
    if (input.studentId) {
      const enrollment = await this.prisma.client.enrollment.findFirst({
        where: {
          studentId: input.studentId,
          academicYearId: currentYear.id,
          termId: currentTerm.id,
          status: "ACTIVE",
          student: { schoolId, deletedAt: null, status: "ACTIVE" },
        },
        select: { studentId: true },
      });
      if (!enrollment) {
        throw new BadRequestException("The selected student is not enrolled in the current term.");
      }
      studentIds = [enrollment.studentId];
    } else if (input.classId) {
      const students = await this.prisma.client.enrollment.findMany({
        where: {
          classId: input.classId,
          academicYearId: currentYear.id,
          termId: currentTerm.id,
          status: "ACTIVE",
          student: { schoolId, deletedAt: null, status: "ACTIVE" },
        },
        select: { studentId: true },
      });
      studentIds = students.map((enrollment) => enrollment.studentId);
    } else {
      throw new BadRequestException("Either classId or studentId must be provided");
    }
    if (studentIds.length === 0) {
      return { success: true, count: 0, message: "No active students to bill" };
    }
    // Always touch students in the same order, so two bill runs over the same class can never deadlock.
    studentIds.sort();

    const year = new Date().getFullYear();
    const billingResult = await withSerializableRetry(() => this.prisma.client.$transaction(async (tx) => {
      // Runs at READ COMMITTED: the statements after this lock wait see what the
      // previous holder committed, so a repeated or overlapping run skips students
      // that were just billed. (Under SERIALIZABLE the snapshot is taken before the
      // wait, which made overlapping runs for different structures fail with "busy".)
      // Editing a structure and generating bills share this lock. The template
      // and fee items are re-read after acquiring it, so bills always snapshot
      // one consistent version of the structure.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${input.feeStructureId}))`;
      const feeStructure = await tx.feeStructure.findFirst({
        where: { id: input.feeStructureId, schoolId, isActive: true },
        include: { items: true, targetClasses: { select: { classId: true } } },
      });
      if (!feeStructure) throw new NotFoundException("Fee structure not found.");
      const selectedOptionalIds = new Set(input.optionalItemIds ?? []);
      const optionalItems = feeStructure.items.filter((item) => item.isOptional);
      const knownOptionalIds = new Set(optionalItems.map((item) => item.id));
      for (const selectedId of selectedOptionalIds) {
        if (!knownOptionalIds.has(selectedId)) {
          throw new BadRequestException("Select optional fee items from the chosen fee structure only.");
        }
      }
      const billableItems = feeStructure.items.filter((item) => !item.isOptional || selectedOptionalIds.has(item.id));
      if (!billableItems.length) throw new BadRequestException("Fee structure contains no selected billable items.");
      if (
        input.classId &&
        feeStructure.targetClasses.length > 0 &&
        !feeStructure.targetClasses.some((target) => target.classId === input.classId)
      ) {
        throw new BadRequestException("This fee structure is not assigned to the selected class.");
      }

      const billNumbers = await this.createNumberSequence(tx, schoolId, "bill", `INV-${year}-`);
      const totalAmountDecimal = billableItems.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const totalAmount = Number(totalAmountDecimal.toFixed(2));
      const results = [];
      for (const studentId of studentIds) {
        // Avoid issuing the same fee structure twice for a student in the same term.
        const existingBill = await tx.bill.findFirst({
          where: {
            schoolId,
            studentId,
            academicYearId: currentYear.id,
            termId: currentTerm.id,
            feeStructureId: input.feeStructureId,
            status: { notIn: ["CANCELLED", "WAIVED"] },
          },
          select: { id: true },
        });
        if (existingBill) continue;

        const concessions = await this.calculateStudentConcessions(
          tx, schoolId, studentId, currentYear.id, currentTerm.id, totalAmountDecimal.toNumber(),
        );
        const totalDiscountDecimal = new Prisma.Decimal(concessions.totalDiscount.toFixed(2));
        const netTotalDecimal = Prisma.Decimal.max(0, totalAmountDecimal.minus(totalDiscountDecimal));
        let allocatedDiscountDecimal = new Prisma.Decimal(0);
        const billItems = billableItems.map((item, index) => {
          const grossLine = item.amount;
          const lineDiscount = index === billableItems.length - 1
            ? totalDiscountDecimal.minus(allocatedDiscountDecimal)
            : (totalAmountDecimal.gt(0)
              ? totalDiscountDecimal.mul(grossLine).div(totalAmountDecimal).toDecimalPlaces(2)
              : new Prisma.Decimal(0));
          allocatedDiscountDecimal = allocatedDiscountDecimal.plus(lineDiscount);
          const netLine = Prisma.Decimal.max(0, grossLine.minus(lineDiscount));
          return {
            feeItemId: item.id,
            description: item.name,
            amount: grossLine,
            quantity: 1,
            totalAmount: grossLine,
            discountAmount: lineDiscount,
            balanceAmount: netLine,
            status: netLine.eq(0) ? "FULLY_PAID" as const : "UNPAID" as const,
          };
        });
        const billNumber = billNumbers.next();
        const bill = await tx.bill.create({
          data: {
            schoolId,
            studentId,
            academicYearId: currentYear.id,
            termId: currentTerm.id,
            feeStructureId: input.feeStructureId,
            classId: input.classId,
            billNumber,
            grossAmount: totalAmountDecimal,
            discountAmount: totalDiscountDecimal,
            totalAmount: netTotalDecimal,
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: netTotalDecimal,
            status: netTotalDecimal.eq(0) ? "PAID" : "PENDING",
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            notes: input.notes,
            items: { create: billItems },
            concessions: {
              create: concessions.details.map((detail) => ({
                type: detail.type,
                label: detail.label,
                amount: new Prisma.Decimal(detail.amount.toFixed(2)),
                siblingDiscountPolicyId: detail.policyId,
                studentScholarshipId: detail.scholarshipId,
              })),
            },
          },
        });

        // Snapshot only outstanding balances from genuinely earlier terms. These
        // rows are for invoice display and do not change the new bill's amount.
        const earlierOpenBills = await tx.bill.findMany({
          where: {
            schoolId,
            studentId,
            balanceAmount: { gt: 0 },
            status: { notIn: ["CANCELLED", "WAIVED"] },
            OR: [
              { academicYear: { endDate: { lt: currentTerm.startDate } } },
              { academicYearId: currentYear.id, term: { endDate: { lt: currentTerm.startDate } } },
            ],
          },
          select: {
            id: true,
            billNumber: true,
            balanceAmount: true,
            academicYear: { select: { name: true } },
            term: { select: { name: true } },
          },
          orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        });
        if (earlierOpenBills.length) {
          await tx.billArrearsSnapshot.createMany({
            data: earlierOpenBills.map((source) => ({
              schoolId,
              billId: bill.id,
              sourceBillId: source.id,
              sourceBillNumber: source.billNumber,
              sourceAcademicYear: source.academicYear.name,
              sourceTerm: source.term?.name ?? null,
              amountAtGeneration: source.balanceAmount,
            })),
            skipDuplicates: true,
          });
        }
        await tx.student.update({
          where: { id: studentId },
          data: { outstandingBalance: { increment: new Prisma.Decimal(netTotal) } },
        });
        results.push(bill);
      }
      await this.writeAudit(tx, {
        actorId,
        schoolId,
        action: "BILL_GENERATED",
        entityType: "FEE_STRUCTURE",
        entityId: input.feeStructureId,
        newValues: {
          billCount: results.length,
          firstBillNumber: results[0]?.billNumber ?? null,
          lastBillNumber: results[results.length - 1]?.billNumber ?? null,
          classId: input.classId ?? null,
          studentId: input.studentId ?? null,
          termId: currentTerm.id,
        },
      });
      return { bills: results, totalAmount: Number(totalAmountDecimal.toFixed(2)) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), {
      onExhausted: () => new ConflictException("The system is busy generating other bills. Please try again in a moment."),
    });

    return {
      success: true,
      count: billingResult.bills.length,
      totalBilled: Number(billingResult.bills.reduce((sum, bill) => sum.plus(bill.totalAmount), new Prisma.Decimal(0)).toFixed(2)),
    };
  }

  /**
   * Find (or lazily create) a ledger account. Schools start with an empty
   * chart of accounts, so system postings provision what they need.
   */
  private async ensureAccount(
    tx: Prisma.TransactionClient,
    schoolId: string,
    spec: {
      accountType: AccountType;
      category: AccountCategory;
      name: string;
      code: string;
    },
  ) {
    // Two payments arriving together for a school with no ledger yet must not both create "Cash on Hand".
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('chart-accounts'))`;
    const existing = await tx.chartAccount.findFirst({
      where:
        spec.category === "CASH"
          ? { schoolId, accountType: spec.accountType, category: spec.category, isActive: true }
          : { schoolId, accountType: spec.accountType, category: spec.category, name: spec.name },
      orderBy: { code: "asc" },
    });
    if (existing) return existing;
    // The school may already use our preferred code for something else.
    for (const code of [spec.code, `${spec.code}-1`, `${spec.code}-2`, `${spec.code}-3`]) {
      const taken = await tx.chartAccount.findUnique({
        where: { code_schoolId: { code, schoolId } },
        select: { id: true },
      });
      if (!taken) {
        return tx.chartAccount.create({
          data: {
            schoolId,
            code,
            name: spec.name,
            accountType: spec.accountType,
            category: spec.category,
          },
        });
      }
    }
    throw new BadRequestException(
      `Could not create the “${spec.name}” account: its code is already in use. Create it manually in the chart of accounts.`,
    );
  }

  /**
   * Post cash received as school income (double entry: debit cash on hand,
   * credit a revenue account) and raise both account balances. Runs inside the
   * caller's transaction so the income and the business record it relates to
   * (e.g. an admission-fee receipt) are saved - or rolled back - together.
   */
  async postIncome(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      amount: Prisma.Decimal;
      date: Date;
      description: string;
      category: TransactionCategory;
      revenueAccount: { name: string; code: string };
      /** Defaults to OTHER_INCOME. */
      revenueCategory?: AccountCategory;
      /** Electronic methods debit the bank account; omitted or CASH debits cash on hand. */
      paymentMethod?: PaymentMethod;
      referenceType: string;
      referenceId: string;
      referenceNumber?: string;
      notes?: string;
    },
  ) {
    const usesBank = input.paymentMethod
      ? ["BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE"].includes(input.paymentMethod)
      : false;
    const cash = await this.ensureAccount(tx, input.schoolId, usesBank
      ? { accountType: "ASSET", category: "BANK", name: "Bank & Electronic Payments", code: "1010" }
      : { accountType: "ASSET", category: "CASH", name: "Cash on Hand", code: "1000" });
    const revenue = await this.ensureAccount(tx, input.schoolId, {
      accountType: "REVENUE",
      category: input.revenueCategory ?? "OTHER_INCOME",
      name: input.revenueAccount.name,
      code: input.revenueAccount.code,
    });

    const prefix = `TXN-${input.date.getUTCFullYear()}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.schoolId}), hashtext(${prefix}))`;
    const last = await tx.transaction.findFirst({
      where: { schoolId: input.schoolId, transactionNumber: { startsWith: prefix } },
      orderBy: { transactionNumber: "desc" },
      select: { transactionNumber: true },
    });
    const seq = last ? Number(last.transactionNumber.slice(prefix.length)) + 1 : 1;

    const transaction = await tx.transaction.create({
      data: {
        schoolId: input.schoolId,
        transactionNumber: `${prefix}${String(seq).padStart(5, "0")}`,
        transactionDate: input.date,
        description: input.description,
        amount: input.amount,
        debitAccountId: cash.id,
        creditAccountId: revenue.id,
        transactionType: "INCOME",
        category: input.category,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      },
    });
    await tx.chartAccount.update({ where: { id: cash.id }, data: { balance: { increment: input.amount } } });
    await tx.chartAccount.update({ where: { id: revenue.id }, data: { balance: { increment: input.amount } } });
    return transaction;
  }
  /**
   * Post an expense using double-entry bookkeeping: debit the matching
   * expense account and credit cash. The source expense and ledger entry
   * are written inside the same database transaction.
   */
  async postExpense(
    tx: Prisma.TransactionClient,
    input: {
      schoolId: string;
      amount: Prisma.Decimal;
      date: Date;
      description: string;
      category: TransactionCategory;
      paymentMethod: PaymentMethod;
      referenceType: string;
      referenceId: string;
      referenceNumber?: string;
      notes?: string;
    },
  ) {
    const accountByCategory: Record<string, { name: string; code: string; category: AccountCategory }> = {
      SALARY: { name: "Salaries & Wages", code: "6000", category: "SALARY_WAGES" },
      UTILITIES: { name: "Utilities", code: "6100", category: "UTILITIES" },
      SUPPLIES: { name: "School Supplies", code: "6200", category: "SUPPLIES" },
      MAINTENANCE: { name: "Repairs & Maintenance", code: "6300", category: "MAINTENANCE" },
      TRANSPORT: { name: "Transport", code: "6400", category: "TRANSPORT" },
      RENT: { name: "Rent", code: "6500", category: "RENT" },
      INSURANCE: { name: "Insurance", code: "6600", category: "INSURANCE" },
      TAXES: { name: "Taxes", code: "6700", category: "TAXES" },
    };
    const accountSpec = accountByCategory[input.category] ?? {
      name: "Other Operating Expenses",
      code: "6900",
      category: "OTHER_EXPENSE" as AccountCategory,
    };
    const paymentUsesBank = ["BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE"].includes(input.paymentMethod);
    const paymentAccount = await this.ensureAccount(tx, input.schoolId, paymentUsesBank
      ? { accountType: "ASSET", category: "BANK", name: "Bank & Electronic Payments", code: "1010" }
      : { accountType: "ASSET", category: "CASH", name: "Cash on Hand", code: "1000" });
    const expenseAccount = await this.ensureAccount(tx, input.schoolId, {
      accountType: "EXPENSE",
      category: accountSpec.category,
      name: accountSpec.name,
      code: accountSpec.code,
    });

    const prefix = "TXN-" + input.date.getUTCFullYear() + "-";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.schoolId}), hashtext(${prefix}))`;
    const last = await tx.transaction.findFirst({
      where: { schoolId: input.schoolId, transactionNumber: { startsWith: prefix } },
      orderBy: { transactionNumber: "desc" },
      select: { transactionNumber: true },
    });
    const seq = last ? Number(last.transactionNumber.slice(prefix.length)) + 1 : 1;
    const transaction = await tx.transaction.create({
      data: {
        schoolId: input.schoolId,
        transactionNumber: prefix + String(seq).padStart(5, "0"),
        transactionDate: input.date,
        description: input.description,
        amount: input.amount,
        debitAccountId: expenseAccount.id,
        creditAccountId: paymentAccount.id,
        transactionType: "EXPENSE",
        category: input.category,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNumber: input.referenceNumber,
        notes: [input.notes, "Payment method: " + input.paymentMethod].filter(Boolean).join(" · "),
      },
    });
    await tx.chartAccount.update({
      where: { id: expenseAccount.id },
      data: { balance: { increment: input.amount } },
    });
    await tx.chartAccount.update({
      where: { id: paymentAccount.id },
      data: { balance: { decrement: input.amount } },
    });
    return transaction;
  }

  async recordPayment(
    schoolId: string,
    recordedById: string,
    input: RecordPaymentInput,
  ) {
    const student = await this.prisma.client.student.findFirst({
      where: { id: input.studentId, schoolId, deletedAt: null },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    // Money is handled as Decimal end to end. Reject sub-cent input instead of silently rounding it.
    const toMoney = (value: number, label: string) => {
      if (Math.abs(roundMoney(value) - value) > 1e-7) {
        throw new BadRequestException(`${label} can have at most two decimal places.`);
      }
      return new Prisma.Decimal(roundMoney(value).toFixed(2));
    };
    const paymentAmount = toMoney(input.amount, "The payment amount");
    const year = new Date().getFullYear();

    return withSerializableRetry(() => this.prisma.client.$transaction(async (tx) => {
      // This runs at READ COMMITTED on purpose. Every statement after a lock
      // wait sees what the previous holder committed, so concurrent payments
      // simply queue here (student row, then bill row, always in this order) and
      // each one reads the up-to-date balance. Under SERIALIZABLE the snapshot is
      // taken before the wait, so queued payments were aborted for no reason.
      await tx.$executeRaw`SELECT id FROM students WHERE id = ${input.studentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      if (input.billId) {
        await tx.$executeRaw`SELECT id FROM bills WHERE id = ${input.billId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      } else {
        // Lock all open student bills in deterministic ID order before reading balances.
        await tx.$executeRaw`SELECT id FROM bills
          WHERE "schoolId" = ${schoolId} AND "studentId" = ${input.studentId}
            AND "balanceAmount" > 0 AND status NOT IN ('CANCELLED', 'WAIVED')
          ORDER BY id FOR UPDATE`;
      }

      // Idempotency: a retried request (double click, flaky network) carrying the
      // same key returns the receipt already recorded instead of creating a second one.
      // The student row is locked above, so concurrent retries queue up behind each other.
      if (input.idempotencyKey) {
        const existing = await tx.payment.findFirst({ where: { schoolId, idempotencyKey: input.idempotencyKey } });
        if (existing) {
          if (
            existing.studentId !== input.studentId ||
            (input.billId ? existing.billId !== input.billId : false) ||
            !existing.amount.eq(paymentAmount)
          ) {
            throw new ConflictException("This idempotency key was already used for a different payment.");
          }
          return existing;
        }
      }

      await this.assertPostingDate(tx, schoolId, new Date(input.paymentDate));

      // Receipts must clear open receivables. Without an explicit bill, allocate
      // oldest-first and spill across bills; unsupported surplus remains rejected
      // until the credit/prepayment model is added in Phase 5.
      const candidateBills = input.billId
        ? await tx.bill.findMany({
            where: { id: input.billId, schoolId, studentId: input.studentId },
            include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
            take: 1,
          })
        : await tx.bill.findMany({
            where: { schoolId, studentId: input.studentId, balanceAmount: { gt: 0 }, status: { notIn: ["CANCELLED", "WAIVED"] } },
            orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
            include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
          });

      if (input.billId && candidateBills.length === 0) {
        throw new NotFoundException("Bill not found for this student.");
      }
      if (candidateBills.some((row) => ["CANCELLED", "WAIVED"].includes(row.status))) {
        throw new BadRequestException("Payments cannot be recorded against a cancelled or waived bill.");
      }
      if (!candidateBills.length) {
        throw new BadRequestException("This student has no open bill to allocate this receipt to. Prepayments and credits are not enabled yet.");
      }

      const totalOpen = candidateBills.reduce((sum, row) => sum.plus(row.balanceAmount), new Prisma.Decimal(0));
      if (paymentAmount.gt(totalOpen)) {
        throw new BadRequestException(
          `Payment exceeds open receivables of ${totalOpen.toFixed(2)}. Credit balances and prepayments are not enabled yet.`,
        );
      }
      if (input.billId && paymentAmount.gt(candidateBills[0].balanceAmount)) {
        throw new BadRequestException(
          `Payment exceeds the outstanding bill balance of ${candidateBills[0].balanceAmount.toFixed(2)}.`,
        );
      }

      const selectedBillId = candidateBills[0].id;
      const itemAllocations: { billId: string; billItemId: string; amount: Prisma.Decimal }[] = [];
      if (!input.billId && input.allocations?.length) {
        throw new BadRequestException("Explicit fee-component allocations require selecting a bill.");
      }

      if (input.billId && input.allocations) {
        const bill = candidateBills[0];
        const seenItemIds = new Set<string>();
        let allocatedTotal = new Prisma.Decimal(0);
        for (const allocation of input.allocations) {
          if (seenItemIds.has(allocation.billItemId)) throw new BadRequestException("Each bill component can only be selected once.");
          seenItemIds.add(allocation.billItemId);
          const item = bill.items.find((candidate) => candidate.id === allocation.billItemId);
          if (!item) throw new BadRequestException("One or more selected components do not belong to this bill.");
          const amount = toMoney(allocation.amount, "A component allocation");
          if (amount.lte(0) || amount.gt(item.balanceAmount)) {
            throw new BadRequestException(
              `Allocation for "${item.description}" must be greater than zero and no more than ${item.balanceAmount.toFixed(2)}.`,
            );
          }
          itemAllocations.push({ billId: bill.id, billItemId: item.id, amount });
          allocatedTotal = allocatedTotal.plus(amount);
        }
        if (!allocatedTotal.eq(paymentAmount)) {
          throw new BadRequestException("The payment amount must equal the sum of the selected fee-component allocations.");
        }
      } else {
        let remaining = paymentAmount;
        for (const bill of candidateBills) {
          if (remaining.lte(0)) break;
          if (bill.balanceAmount.lte(0)) continue;
          const billApplied = Prisma.Decimal.min(remaining, bill.balanceAmount);
          let billItemRemaining = billApplied;
          for (const item of bill.items) {
            if (billItemRemaining.lte(0)) break;
            if (item.balanceAmount.lte(0)) continue;
            const applied = Prisma.Decimal.min(billItemRemaining, item.balanceAmount);
            if (applied.gt(0)) itemAllocations.push({ billId: bill.id, billItemId: item.id, amount: applied });
            billItemRemaining = billItemRemaining.minus(applied);
          }
          if (billItemRemaining.gt(0)) {
            throw new ConflictException(`Bill ${bill.billNumber} does not reconcile to its open component balances. No receipt was recorded.`);
          }
          remaining = remaining.minus(billApplied);
        }
        if (remaining.gt(0)) throw new ConflictException("The receipt could not be fully allocated to open bills.");
      }

      // Receipt numbers are sequential per school and year, issued under a
      // lock inside this transaction (no random numbers, no collisions).
      const paymentNumbers = await this.createNumberSequence(tx, schoolId, "payment", `RCT-${year}-`);
      const paymentNumber = paymentNumbers.next();

      // 1. Create payment record only after all tenant/bill/allocation checks pass.
      const created = await tx.payment.create({
        data: {
          schoolId,
          studentId: input.studentId,
          billId: selectedBillId,
          paymentNumber,
          amount: paymentAmount,
          paymentMethod: input.paymentMethod,
          paymentDate: new Date(input.paymentDate),
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          recordedById,
          idempotencyKey: input.idempotencyKey,
        },
      });

      // 2. Post the receipt to the general ledger (debit cash/bank, credit
      // school-fees income) and link it, so financial reports include fees.
      const ledger = await this.postIncome(tx, {
        schoolId,
        amount: paymentAmount,
        date: new Date(input.paymentDate),
        description: `School fees receipt ${paymentNumber}`,
        category: "SCHOOL_FEES",
        revenueAccount: { name: "School Fees Income", code: "4000" },
        revenueCategory: "SCHOOL_FEES",
        paymentMethod: input.paymentMethod,
        referenceType: "PAYMENT",
        referenceId: created.id,
        referenceNumber: paymentNumber,
        notes: input.notes,
      });
      const payment = await tx.payment.update({
        where: { id: created.id },
        data: { transactionId: ledger.id },
      });

      // Update every bill touched by this receipt; its allocation rows may span bills.
      const appliedByBill = new Map<string, Prisma.Decimal>();
      for (const allocation of itemAllocations) {
        appliedByBill.set(
          allocation.billId,
          (appliedByBill.get(allocation.billId) ?? new Prisma.Decimal(0)).plus(allocation.amount),
        );
      }
      for (const bill of candidateBills) {
        const applied = appliedByBill.get(bill.id) ?? new Prisma.Decimal(0);
        if (applied.lte(0)) continue;
        if (applied.gt(bill.balanceAmount)) throw new ConflictException("A bill balance changed before allocation.");
        const nextBalance = bill.balanceAmount.minus(applied);
        const nextPaid = bill.paidAmount.plus(applied);
        await tx.bill.update({
          where: { id: bill.id },
          data: { paidAmount: nextPaid, balanceAmount: nextBalance, status: nextBalance.eq(0) ? "PAID" : nextPaid.gt(0) ? "PARTIALLY_PAID" : "PENDING" },
        });
      }

      const itemById = new Map(candidateBills.flatMap((bill) => bill.items.map((item) => [item.id, item] as const)));
      for (const allocation of itemAllocations) {
        const item = itemById.get(allocation.billItemId);
        if (!item || allocation.amount.gt(item.balanceAmount)) {
          throw new ConflictException("A bill component balance changed before allocation.");
        }
        const nextBalance = item.balanceAmount.minus(allocation.amount);
        const nextPaid = item.paidAmount.plus(allocation.amount);
        await tx.billItem.update({
          where: { id: item.id },
          data: { paidAmount: nextPaid, balanceAmount: nextBalance, status: nextBalance.eq(0) ? "FULLY_PAID" : "PARTIALLY_PAID" },
        });
        await tx.paymentItem.create({ data: { paymentId: payment.id, billItemId: item.id, amount: allocation.amount } });
      }

      // Keep the aggregate student balance from dropping below zero if older
      // records contain an out-of-sync aggregate balance (row is locked above).
      const currentStudent = await tx.student.findFirst({
        where: { id: input.studentId, schoolId, deletedAt: null },
        select: { id: true, outstandingBalance: true },
      });
      if (!currentStudent) throw new NotFoundException("Student not found.");
      await tx.student.update({
        where: { id: currentStudent.id },
        data: { outstandingBalance: Prisma.Decimal.max(0, currentStudent.outstandingBalance.minus(paymentAmount)) },
      });

      await this.writeAudit(tx, {
        actorId: recordedById,
        schoolId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: payment.id,
        newValues: {
          paymentNumber,
          studentId: input.studentId,
          billId: selectedBillId,
          allocatedBillIds: [...appliedByBill.keys()],
          amount: paymentAmount.toFixed(2),
          paymentMethod: input.paymentMethod,
          ledgerTransactionId: ledger.id,
        },
      });

      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), {
      // Two requests with the same new idempotency key can both pass the replay check;
      // the unique index stops the second, which then retries and returns the first receipt.
      retryIf: (error) => isSerializationFailure(error) || isIdempotencyRace(error),
      onExhausted: () => new ConflictException("The system is busy recording other payments. Nothing was saved; please try again."),
    });
  }

  /**
   * Void or refund a receipt. The original payment is never deleted: it is
   * marked reversed (with who, when and why), its allocations are taken back
   * off the bill, and a balancing ledger entry is posted.
   */
  async reversePayment(
    schoolId: string,
    actorId: string,
    paymentId: string,
    input: { kind: "VOID" | "REFUND"; reason: string },
  ) {
    return withSerializableRetry(() => this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM payments WHERE id = ${paymentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, schoolId },
        include: { paymentItems: true, transaction: true },
      });
      if (!payment) throw new NotFoundException("Payment not found.");
      if (payment.reversedAt || payment.status !== "COMPLETED") {
        throw new BadRequestException("This payment has already been reversed or is not a completed payment.");
      }

      await tx.$executeRaw`SELECT id FROM students WHERE id = ${payment.studentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      if (payment.billId) {
        await tx.$executeRaw`SELECT id FROM bills WHERE id = ${payment.billId} AND "schoolId" = ${schoolId} FOR UPDATE`;
        const bill = await tx.bill.findFirst({ where: { id: payment.billId, schoolId }, include: { items: true } });
        if (bill) {
          for (const allocation of payment.paymentItems) {
            const item = bill.items.find((candidate) => candidate.id === allocation.billItemId);
            if (!item) continue;
            const nextPaid = Prisma.Decimal.max(0, item.paidAmount.minus(allocation.amount));
            const netTotal = item.totalAmount.minus(item.discountAmount);
            const nextBalance = Prisma.Decimal.min(netTotal, item.balanceAmount.plus(allocation.amount));
            await tx.billItem.update({
              where: { id: item.id },
              data: {
                paidAmount: nextPaid,
                balanceAmount: nextBalance,
                status: nextPaid.eq(0) ? "UNPAID" : nextBalance.eq(0) ? "FULLY_PAID" : "PARTIALLY_PAID",
              },
            });
          }
          const paid = Prisma.Decimal.max(0, bill.paidAmount.minus(payment.amount));
          const balance = Prisma.Decimal.min(bill.totalAmount, bill.balanceAmount.plus(payment.amount));
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paidAmount: paid,
              balanceAmount: balance,
              status: ["CANCELLED", "WAIVED"].includes(bill.status)
                ? bill.status
                : paid.eq(0) ? "PENDING" : balance.eq(0) ? "PAID" : "PARTIALLY_PAID",
            },
          });
        }
      }
      await tx.student.update({
        where: { id: payment.studentId },
        data: { outstandingBalance: { increment: payment.amount } },
      });

      // Balancing ledger entry (only fee receipts that were posted to the ledger have one).
      let reversalTransactionId: string | null = null;
      if (payment.transaction) {
        const original = payment.transaction;
        const date = new Date();
        const prefix = `TXN-${date.getUTCFullYear()}-`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${prefix}))`;
        const issued = await tx.transaction.findMany({
          where: { schoolId, transactionNumber: { startsWith: prefix } },
          select: { transactionNumber: true },
        });
        const number = createSequence(issued.map((row) => row.transactionNumber), prefix).next();
        const reversal = await tx.transaction.create({
          data: {
            schoolId,
            transactionNumber: number,
            transactionDate: date,
            description: `${input.kind === "REFUND" ? "Refund" : "Void"} of receipt ${payment.paymentNumber}: ${input.reason}`,
            amount: original.amount,
            // Income postings debit cash/bank and credit revenue, and both
            // balances rise. The reversal swaps the sides and lowers both.
            debitAccountId: original.creditAccountId,
            creditAccountId: original.debitAccountId,
            transactionType: "ADJUSTMENT",
            category: original.category,
            referenceType: "PAYMENT_REVERSAL",
            referenceId: payment.id,
            referenceNumber: payment.paymentNumber,
          },
        });
        await tx.chartAccount.update({ where: { id: original.debitAccountId }, data: { balance: { decrement: original.amount } } });
        await tx.chartAccount.update({ where: { id: original.creditAccountId }, data: { balance: { decrement: original.amount } } });
        reversalTransactionId = reversal.id;
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: input.kind === "REFUND" ? "REFUNDED" : "CANCELLED",
          reversedAt: new Date(),
          reversedById: actorId,
          reversalReason: input.reason,
          reversalTransactionId,
        },
      });
      await this.writeAudit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "PAYMENT_REVERSAL",
        entityId: payment.id,
        oldValues: { status: payment.status, amount: payment.amount.toFixed(2) },
        newValues: { status: updated.status, kind: input.kind, reason: input.reason, reversalTransactionId },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), {
      onExhausted: () => new ConflictException("The system is busy. Nothing was changed; please try again."),
    });
  }

  private async resolveFinancePeriod(schoolId: string, yearId?: string, termId?: string) {
    if (termId) {
      const term = await this.prisma.client.term.findFirst({
        where: {
          id: termId,
          academicYear: { schoolId, ...(yearId ? { id: yearId } : {}) },
        },
        include: { academicYear: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } } },
      });
      if (!term) throw new BadRequestException("Choose a term belonging to an academic year in this school.");
      return { year: term.academicYear, term };
    }
    if (yearId) {
      const year = await this.prisma.client.academicYear.findFirst({
        where: { id: yearId, schoolId },
        select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true },
      });
      if (!year) throw new BadRequestException("Choose an academic year belonging to this school.");
      return { year, term: null };
    }
    return { year: null, term: null };
  }

  private dateFilters(from?: string, to?: string) {
    const start = parseReportingDate(from, "start date");
    const end = parseReportingDate(to, "end date", true);
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException("Start date must be before or equal to end date.");
    }
    return { start, end };
  }

  async getFinanceSummary(
    schoolId: string,
    query: { from?: string; to?: string; yearId?: string; termId?: string },
  ): Promise<FinanceSummaryResponse> {
    const period = await this.resolveFinancePeriod(schoolId, query.yearId, query.termId);
    const dates = this.dateFilters(query.from, query.to);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const billWhere: Prisma.BillWhereInput = {
      schoolId,
      status: { notIn: ["CANCELLED", "WAIVED"] },
      ...(period.year ? { academicYearId: period.year.id } : {}),
      ...(period.term ? { termId: period.term.id } : {}),
      ...(dates.start || dates.end ? { issuedAt: { ...(dates.start ? { gte: dates.start } : {}), ...(dates.end ? { lte: dates.end } : {}) } } : {}),
    };

    const periodFrom = dates.start ?? period.term?.startDate ?? period.year?.startDate;
    const periodTo = dates.end ?? period.term?.endDate ?? period.year?.endDate;
    const paymentWhere: Prisma.PaymentWhereInput = {
      schoolId,
      status: "COMPLETED",
      reversedAt: null,
      ...(period.term || period.year
        ? {
            OR: [
              { bill: { schoolId, ...(period.year ? { academicYearId: period.year.id } : {}), ...(period.term ? { termId: period.term.id } : {}) } },
              ...(periodFrom || periodTo
                ? [{ billId: null, paymentDate: { ...(periodFrom ? { gte: periodFrom } : {}), ...(periodTo ? { lte: periodTo } : {}) } }]
                : []),
            ],
          }
        : {}),
      ...(dates.start || dates.end
        ? { paymentDate: { ...(dates.start ? { gte: dates.start } : {}), ...(dates.end ? { lte: dates.end } : {}) } }
        : {}),
    };

    const overdueWhere: Prisma.BillWhereInput = {
      ...billWhere,
      balanceAmount: { gt: 0 },
      dueDate: { lt: dayStart },
    };

    const [billedAggregate, outstandingAggregate, overdueAggregate, methodGroups, classGroups, ageingBills, paymentByBill] = await Promise.all([
      this.prisma.client.bill.aggregate({ where: billWhere, _sum: { totalAmount: true } }),
      this.prisma.client.bill.aggregate({ where: { ...billWhere, balanceAmount: { gt: 0 } }, _sum: { balanceAmount: true } }),
      this.prisma.client.bill.aggregate({ where: overdueWhere, _sum: { balanceAmount: true } }),
      this.prisma.client.payment.groupBy({
        by: ["paymentMethod"],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.client.bill.groupBy({
        by: ["classId"],
        where: billWhere,
        _sum: { totalAmount: true, balanceAmount: true },
        _count: { _all: true },
      }),
      this.prisma.client.bill.findMany({
        where: overdueWhere,
        select: { id: true, dueDate: true, balanceAmount: true },
      }),
      this.prisma.client.payment.groupBy({
        by: ["billId"],
        where: { ...paymentWhere, billId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const asNumber = (amount: Prisma.Decimal | null | undefined) => amount ? Number(amount.toFixed(2)) : 0;
    const ageing = [
      { bucket: "0-30" as const, amount: new Prisma.Decimal(0), count: 0 },
      { bucket: "31-60" as const, amount: new Prisma.Decimal(0), count: 0 },
      { bucket: "61-90" as const, amount: new Prisma.Decimal(0), count: 0 },
      { bucket: "90+" as const, amount: new Prisma.Decimal(0), count: 0 },
    ];
    for (const bill of ageingBills) {
      if (!bill.dueDate || bill.balanceAmount.lte(0)) continue;
      const days = Math.max(0, Math.floor((dayStart.getTime() - bill.dueDate.getTime()) / 86_400_000));
      const index = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      ageing[index].amount = ageing[index].amount.plus(bill.balanceAmount);
      ageing[index].count += 1;
    }

    const paymentBillIds = paymentByBill.map((group) => group.billId).filter((id): id is string => Boolean(id));
    const [paymentBills, schoolClasses] = await Promise.all([
      paymentBillIds.length
        ? this.prisma.client.bill.findMany({ where: { schoolId, id: { in: paymentBillIds } }, select: { id: true, classId: true } })
        : Promise.resolve([]),
      classGroups.some((group) => group.classId)
        ? this.prisma.client.class.findMany({ where: { schoolId, id: { in: classGroups.map((group) => group.classId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const classNames = new Map(schoolClasses.map((row) => [row.id, row.name]));
    const billClass = new Map(paymentBills.map((row) => [row.id, row.classId]));
    const classCollected = new Map<string | null, Prisma.Decimal>();
    const paymentSums = new Map(paymentByBill.map((row) => [row.billId, row._sum.amount ?? new Prisma.Decimal(0)]));
    for (const [billId, amount] of paymentSums) {
      const classId = billClass.get(billId ?? "") ?? null;
      classCollected.set(classId, (classCollected.get(classId) ?? new Prisma.Decimal(0)).plus(amount));
    }

    return {
      scope: {
        from: query.from ?? (period.term?.startDate.toISOString().slice(0, 10) ?? period.year?.startDate.toISOString().slice(0, 10) ?? null),
        to: query.to ?? (period.term?.endDate.toISOString().slice(0, 10) ?? period.year?.endDate.toISOString().slice(0, 10) ?? null),
        academicYearId: period.year?.id ?? null,
        academicYearName: period.year?.name ?? null,
        termId: period.term?.id ?? null,
        termName: period.term?.name ?? null,
      },
      billed: asNumber(billedAggregate._sum.totalAmount),
      collected: methodGroups.reduce((sum, group) => sum + asNumber(group._sum.amount), 0),
      outstanding: asNumber(outstandingAggregate._sum.balanceAmount),
      overdue: asNumber(overdueAggregate._sum.balanceAmount),
      byPaymentMethod: methodGroups.map((group) => ({
        method: group.paymentMethod,
        amount: asNumber(group._sum.amount),
        count: group._count._all,
      })),
      byClass: classGroups.map((group) => ({
        classId: group.classId,
        className: group.classId ? classNames.get(group.classId) ?? "Class not found" : "Unassigned class",
        billed: asNumber(group._sum.totalAmount),
        outstanding: asNumber(group._sum.balanceAmount),
        collected: asNumber(classCollected.get(group.classId) ?? new Prisma.Decimal(0)),
        billCount: group._count._all,
      })),
      ageing: ageing.map((row) => ({ bucket: row.bucket, amount: asNumber(row.amount), count: row.count })),
    };
  }

  async listBills(
    schoolId: string,
    input: {
      cursor?: string; limit?: number; search?: string; status?: string; studentId?: string;
      classId?: string; from?: string; to?: string; yearId?: string; termId?: string;
    } = {},
): Promise<FinancePage<Record<string, unknown>>> {
    const pageSize = Math.min(100, Math.max(1, input.limit ?? 50));
    const period = await this.resolveFinancePeriod(schoolId, input.yearId, input.termId);
    const dates = this.dateFilters(input.from, input.to);
    if (input.classId) {
      const exists = await this.prisma.client.class.findFirst({ where: { id: input.classId, schoolId, deletedAt: null }, select: { id: true } });
      if (!exists) throw new BadRequestException("Choose a class belonging to this school.");
    }
    const status = input.status && input.status !== "ALL" ? input.status : undefined;
    const billStatuses = ["PENDING", "PARTIALLY_PAID", "PAID", "CANCELLED", "WAIVED"];
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    if (status && status !== "OVERDUE" && !billStatuses.includes(status)) throw new BadRequestException("Unsupported bill status filter.");
    const search = input.search?.trim();
    const baseWhere: Prisma.BillWhereInput = {
      schoolId,
      ...(input.studentId ? { studentId: input.studentId } : {}),
      ...(input.classId ? { classId: input.classId } : {}),
      ...(period.year ? { academicYearId: period.year.id } : {}),
      ...(period.term ? { termId: period.term.id } : {}),
      ...(dates.start || dates.end ? { issuedAt: { ...(dates.start ? { gte: dates.start } : {}), ...(dates.end ? { lte: dates.end } : {}) } } : {}),
      ...(status === "OVERDUE"
        ? { balanceAmount: { gt: 0 }, dueDate: { lt: dayStart }, status: { notIn: ["CANCELLED", "WAIVED"] } }
        : status ? { status } : {}),
      ...(search ? { OR: [
        { billNumber: { contains: search, mode: "insensitive" } },
        { student: { admissionNumber: { contains: search, mode: "insensitive" } } },
        { student: { profile: { firstName: { contains: search, mode: "insensitive" } } } },
        { student: { profile: { lastName: { contains: search, mode: "insensitive" } } } },
      ] } : {}),
    };
    const cursor = decodeReportingCursor(input.cursor);
    if (cursor) {
      const ownedCursor = await this.prisma.client.bill.findFirst({ where: { id: cursor.id, schoolId }, select: { id: true } });
      if (!ownedCursor) throw new BadRequestException("The page cursor does not belong to this school.");
    }
    const where: Prisma.BillWhereInput = cursor
      ? { AND: [baseWhere, { OR: [{ issuedAt: { lt: new Date(cursor.timestamp) } }, { issuedAt: new Date(cursor.timestamp), id: { lt: cursor.id } }] }] }
      : baseWhere;
    const [rows, total] = await Promise.all([
      this.prisma.client.bill.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        include: {
          student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          class: { select: { id: true, name: true } },
          feeStructure: { select: { name: true } },
          academicYear: { select: { id: true, name: true } },
          term: { select: { id: true, name: true } },
          items: { select: { id: true, description: true, amount: true, quantity: true, totalAmount: true, discountAmount: true, paidAmount: true, balanceAmount: true }, orderBy: { createdAt: "asc" } },
          concessions: { select: { id: true, type: true, label: true, amount: true }, orderBy: { createdAt: "asc" } },
          arrearsSnapshots: { select: { id: true, sourceBillNumber: true, sourceAcademicYear: true, sourceTerm: true, amountAtGeneration: true, capturedAt: true }, orderBy: { capturedAt: "asc" } },
        },
      }),
      this.prisma.client.bill.count({ where: baseWhere }),
    ]);
    const hasMore = rows.length > pageSize;
    const items = (hasMore ? rows.slice(0, pageSize) : rows) as unknown as Record<string, unknown>[];
    const last = hasMore ? rows[pageSize - 1] : undefined;
    return { items, nextCursor: last ? encodeReportingCursor({ id: last.id, timestamp: last.issuedAt.toISOString() }) : null, total };
  }

  async listOutstandingStudents(schoolId: string) {
    const bills = await this.prisma.client.bill.findMany({
      where: {
        schoolId,
        balanceAmount: { gt: 0 },
        status: { notIn: ["CANCELLED", "WAIVED"] },
      },
      select: {
        studentId: true,
        balanceAmount: true,
        student: {
          select: {
            id: true,
            admissionNumber: true,
            status: true,
            deletedAt: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        class: { select: { id: true, name: true } },
      },
    });

    const byStudent = new Map<string, {
      id: string;
      admissionNumber: string;
      profile: { firstName: string; lastName: string } | null;
      classes: Map<string, { id: string; name: string }>;
      outstandingBalance: number;
    }>();
    for (const bill of bills) {
      if (bill.student.deletedAt || bill.student.status !== "ACTIVE") continue;
      const existing = byStudent.get(bill.studentId) ?? {
        id: bill.student.id,
        admissionNumber: bill.student.admissionNumber ?? "",
        profile: bill.student.profile,
        classes: new Map<string, { id: string; name: string }>(),
        outstandingBalance: 0,
      };
      if (bill.class) existing.classes.set(bill.class.id, bill.class);
      existing.outstandingBalance = roundMoney(existing.outstandingBalance + Number(bill.balanceAmount));
      byStudent.set(bill.studentId, existing);
    }
    return [...byStudent.values()]
      .map((student) => ({
        id: student.id,
        admissionNumber: student.admissionNumber,
        profile: student.profile,
        classes: [...student.classes.values()].sort((a, b) => a.name.localeCompare(b.name)),
        outstandingBalance: student.outstandingBalance,
      }))
      .sort((a, b) => {
        const aName = [a.profile?.firstName, a.profile?.lastName].filter(Boolean).join(" ") || a.admissionNumber;
        const bName = [b.profile?.firstName, b.profile?.lastName].filter(Boolean).join(" ") || b.admissionNumber;
        return aName.localeCompare(bName);
      });
  }

  async listPayments(
    schoolId: string,
    input: {
      cursor?: string; limit?: number; search?: string; status?: string; studentId?: string;
      classId?: string; method?: string; from?: string; to?: string; yearId?: string; termId?: string;
    } = {},
): Promise<FinancePage<Record<string, unknown>>> {
    const pageSize = Math.min(100, Math.max(1, input.limit ?? 50));
    const period = await this.resolveFinancePeriod(schoolId, input.yearId, input.termId);
    const dates = this.dateFilters(input.from, input.to);
    if (input.classId) {
      const exists = await this.prisma.client.class.findFirst({ where: { id: input.classId, schoolId, deletedAt: null }, select: { id: true } });
      if (!exists) throw new BadRequestException("Choose a class belonging to this school.");
    }
    const paymentStatuses = ["PENDING", "COMPLETED", "FAILED", "REFUNDED", "CANCELLED"];
    if (input.status && input.status !== "ALL" && !paymentStatuses.includes(input.status)) throw new BadRequestException("Unsupported payment status filter.");
    const search = input.search?.trim();
    const scopeStart = dates.start ?? period.term?.startDate ?? period.year?.startDate;
    const scopeEnd = dates.end ?? period.term?.endDate ?? period.year?.endDate;
    const baseWhere: Prisma.PaymentWhereInput = {
      schoolId,
      ...(input.studentId ? { studentId: input.studentId } : {}),
      ...(input.method ? { paymentMethod: input.method as PaymentMethod } : {}),
      ...(input.status && input.status !== "ALL" ? { status: input.status as "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CANCELLED" } : {}),
      ...(input.classId ? { bill: { schoolId, classId: input.classId } } : {}),
      ...(dates.start || dates.end ? { paymentDate: { ...(dates.start ? { gte: dates.start } : {}), ...(dates.end ? { lte: dates.end } : {}) } } : {}),
      ...(period.year || period.term
        ? {
            OR: [
              { bill: { schoolId, ...(period.year ? { academicYearId: period.year.id } : {}), ...(period.term ? { termId: period.term.id } : {}), ...(input.classId ? { classId: input.classId } : {}) } },
              ...(scopeStart || scopeEnd
                ? [{ billId: null, paymentDate: { ...(scopeStart ? { gte: scopeStart } : {}), ...(scopeEnd ? { lte: scopeEnd } : {}) } }]
                : []),
            ],
          }
        : {}),
      ...(search ? { OR: [
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { student: { admissionNumber: { contains: search, mode: "insensitive" } } },
        { student: { profile: { firstName: { contains: search, mode: "insensitive" } } } },
        { student: { profile: { lastName: { contains: search, mode: "insensitive" } } },
      ] } : {}),
    };
    const cursor = decodeReportingCursor(input.cursor);
    if (cursor) {
      const ownedCursor = await this.prisma.client.payment.findFirst({ where: { id: cursor.id, schoolId }, select: { id: true } });
      if (!ownedCursor) throw new BadRequestException("The page cursor does not belong to this school.");
    }
    const where: Prisma.PaymentWhereInput = cursor
      ? { AND: [baseWhere, { OR: [{ paymentDate: { lt: new Date(cursor.timestamp) } }, { paymentDate: new Date(cursor.timestamp), id: { lt: cursor.id } }] }] }
      : baseWhere;
    const [rows, total] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        include: {
          student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          bill: { select: { id: true, billNumber: true, class: { select: { id: true, name: true } } } },
          paymentItems: { include: { billItem: { include: { feeItem: { include: { customCategory: { select: { name: true } }, registryItem: { select: { name: true } } } } } } },
          recordedBy: { select: { name: true, email: true } },
        },
      }),
      this.prisma.client.payment.count({ where: baseWhere }),
    ]);
    const hasMore = rows.length > pageSize;
    const items = (hasMore ? rows.slice(0, pageSize) : rows) as unknown as Record<string, unknown>[];
    const last = hasMore ? rows[pageSize - 1] : undefined;
    return { items, nextCursor: last ? encodeReportingCursor({ id: last.id, timestamp: last.paymentDate.toISOString() }) : null, total };
  }

  async listExpenses(schoolId: string, fromDate?: string, toDate?: string) {
    const parseBoundary = (value: string | undefined, label: string) => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`Enter ${label} as YYYY-MM-DD.`);
      }
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException(`Enter a valid ${label.toLowerCase()}.`);
      }
      return parsed;
    };
    const startDate = parseBoundary(fromDate, "start date");
    const endDate = parseBoundary(toDate, "end date");
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException("Start date must be before or equal to end date.");
    }
    return this.prisma.client.expense.findMany({
      where: {
        schoolId,
        ...(startDate || endDate ? {
          date: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        customCategory: { select: { name: true } },
        registryCategory: { select: { id: true, name: true, description: true } },
        recordedBy: { select: { name: true } },
      },
    });
  }

  async listExpenditureCategories(schoolId: string) {
    return this.prisma.client.expenditureCategoryRegistry.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
    });
  }

  async createExpenditureCategory(schoolId: string, input: { name: string; description?: string | null }) {
    const name = input.name.trim();
    const duplicate = await this.prisma.client.expenditureCategoryRegistry.findFirst({
      where: { schoolId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException("An expenditure category with that name already exists.");
    return this.prisma.client.expenditureCategoryRegistry.create({
      data: { schoolId, name, description: input.description?.trim() || null },
    });
  }

  async updateExpenditureCategory(schoolId: string, categoryId: string, input: { name: string; description?: string | null }) {
    const existing = await this.prisma.client.expenditureCategoryRegistry.findFirst({
      where: { id: categoryId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Expenditure category not found.");
    const name = input.name.trim();
    const duplicate = await this.prisma.client.expenditureCategoryRegistry.findFirst({
      where: { schoolId, id: { not: categoryId }, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException("An expenditure category with that name already exists.");
    return this.prisma.client.expenditureCategoryRegistry.update({
      where: { id: categoryId },
      data: { name, description: input.description?.trim() || null },
    });
  }

  async createExpense(schoolId: string, recordedById: string, input: CreateExpenseInput) {
    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) {
      throw new BadRequestException("Enter a valid expense date.");
    }
    if (input.registryCategoryId) {
      const category = await this.prisma.client.expenditureCategoryRegistry.findFirst({
        where: { id: input.registryCategoryId, schoolId },
        select: { id: true },
      });
      if (!category) throw new BadRequestException("The selected expenditure category does not belong to this school.");
    }

    const academicYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = academicYear?.terms[0];

    return this.prisma.client.$transaction(async (tx) => {
      await this.assertPostingDate(tx, schoolId, date);
      const requestedVoucher = input.voucherNumber?.trim() || undefined;
      const voucherPrefix = `PV-${date.getUTCFullYear()}-`;
      // Serialize voucher allocation per school to avoid duplicate numbers
      // when two accountants record expenses at the same time.
      const voucherLockKey = "expense-voucher";
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${voucherLockKey}))`;
      let voucherNumber = requestedVoucher;
      if (voucherNumber) {
        const existing = await tx.expense.findFirst({
          where: { schoolId, voucherNumber: { equals: voucherNumber, mode: "insensitive" } },
          select: { id: true },
        });
        if (existing) throw new BadRequestException("That voucher number is already used by another expense in this school.");
      } else {
        const existingVouchers = await tx.expense.findMany({
          where: { schoolId, voucherNumber: { startsWith: voucherPrefix } },
          select: { voucherNumber: true },
        });
        const lastSequence = existingVouchers.reduce((highest, expense) => {
          const suffix = expense.voucherNumber?.slice(voucherPrefix.length) ?? "";
          if (!/^\d+$/.test(suffix)) return highest;
          return Math.max(highest, Number(suffix));
        }, 0);
        voucherNumber = voucherPrefix + String(lastSequence + 1).padStart(5, "0");
      }
      const expense = await tx.expense.create({
        data: {
          schoolId,
          date,
          amount: new Prisma.Decimal(input.amount),
          description: input.description,
          payee: input.payee || null,
          category: input.category,
          paymentMethod: input.paymentMethod,
          registryCategoryId: input.registryCategoryId || null,
          checkNumber: input.checkNumber || null,
          voucherNumber,
          referenceNumber: input.referenceNumber || null,
          recordedById,
          academicYearId: academicYear?.id ?? null,
          termId: currentTerm?.id ?? null,
        },
        include: {
          customCategory: { select: { name: true } },
          registryCategory: { select: { id: true, name: true, description: true } },
          recordedBy: { select: { name: true } },
        },
      });
      await this.postExpense(tx, {
        schoolId,
        amount: new Prisma.Decimal(input.amount),
        date,
        description: input.description,
        category: input.category,
        paymentMethod: input.paymentMethod,
        referenceType: "EXPENSE",
        referenceId: expense.id,
        referenceNumber: voucherNumber || input.referenceNumber || undefined,
        notes: input.registryCategoryId ? "Expenditure category: " + input.registryCategoryId : undefined,
      });
      await this.writeAudit(tx, {
        actorId: recordedById,
        schoolId,
        action: "CREATE",
        entityType: "EXPENSE",
        entityId: expense.id,
        newValues: { amount: input.amount, voucherNumber, category: input.category ?? null, paymentMethod: input.paymentMethod, payee: input.payee ?? null },
      });
      return expense;
    });
  }

  async listPayrollSalaryRegister(schoolId: string) {
    const db = this.prisma.client;
    const [teachers, staff] = await Promise.all([
      db.teacher.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: {
          id: true,
          teacherId: true,
          staffNumber: true,
          firstName: true,
          lastName: true,
          monthlySalary: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      }),
      db.staff.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: {
          id: true,
          staffId: true,
          staffNumber: true,
          monthlySalary: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    return [
      ...teachers.map((person) => ({
        id: person.id,
        type: "TEACHER" as const,
        identifier: person.staffNumber || person.teacherId,
        name: [person.profile?.firstName || person.firstName, person.profile?.lastName || person.lastName].filter(Boolean).join(" ").trim() || person.teacherId,
        monthlySalary: person.monthlySalary == null ? null : Number(person.monthlySalary),
      })),
      ...staff.map((person) => ({
        id: person.id,
        type: "STAFF" as const,
        identifier: person.staffNumber || person.staffId,
        name: [person.profile.firstName, person.profile.lastName].filter(Boolean).join(" ").trim() || person.staffId,
        monthlySalary: person.monthlySalary == null ? null : Number(person.monthlySalary),
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  async updatePayrollSalary(schoolId: string, kind: string, personId: string, monthlySalary: number, actorId: string) {
    if (kind !== "TEACHER" && kind !== "STAFF") {
      throw new BadRequestException("Choose a valid payroll person type.");
    }
    const next = new Prisma.Decimal(monthlySalary);
    await this.prisma.client.$transaction(async (tx) => {
      // The change and its audit entry (old and new salary) commit together.
      let previous: Prisma.Decimal | null;
      if (kind === "TEACHER") {
        const current = await tx.teacher.findFirst({
          where: { id: personId, schoolId, deletedAt: null },
          select: { monthlySalary: true },
        });
        if (!current) throw new NotFoundException("Teacher not found.");
        previous = current.monthlySalary;
        await tx.teacher.updateMany({ where: { id: personId, schoolId, deletedAt: null }, data: { monthlySalary: next } });
      } else {
        const current = await tx.staff.findFirst({
          where: { id: personId, schoolId, deletedAt: null },
          select: { monthlySalary: true },
        });
        if (!current) throw new NotFoundException("Staff member not found.");
        previous = current.monthlySalary;
        await tx.staff.updateMany({ where: { id: personId, schoolId, deletedAt: null }, data: { monthlySalary: next } });
      }
      await this.writeAudit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: `PAYROLL_SALARY_${kind}`,
        entityId: personId,
        oldValues: { monthlySalary: previous?.toFixed(2) ?? null },
        newValues: { monthlySalary: next.toFixed(2) },
      });
    });
    return { id: personId, type: kind, monthlySalary };
  }

  async generatePayrollDraft(
    schoolId: string,
    processedById: string,
    input: { month: number; year: number; confirmResidentTaxTreatment: true },
  ) {
    // GRA's 2026 monthly resident bands took effect on 1 September 2026.
    // Refuse to silently apply these rules to historical periods.
    if (input.year !== 2026 || input.month < 9) {
      throw new BadRequestException(
        "Automatic draft generation currently supports September–December 2026 only. Configure the applicable historical tax rules before generating an earlier period.",
      );
    }
    const db = this.prisma.client;
    const existing = await db.payrollRecord.findUnique({
      where: { schoolId_month_year: { schoolId, month: input.month, year: input.year } },
      select: { id: true },
    });
    if (existing) throw new BadRequestException("A payroll run already exists for this month and year.");

    const [teachers, staff, currentYear] = await Promise.all([
      db.teacher.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: { id: true, monthlySalary: true },
      }),
      db.staff.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: { id: true, monthlySalary: true },
      }),
      db.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        include: { terms: { where: { isCurrent: true }, take: 1 } },
      }),
    ]);
    const eligible = [
      ...teachers.filter((person) => Number(person.monthlySalary ?? 0) > 0).map((person) => ({
        teacherId: person.id,
        staffId: null as string | null,
        basicSalary: Number(person.monthlySalary),
      })),
      ...staff.filter((person) => Number(person.monthlySalary ?? 0) > 0).map((person) => ({
        teacherId: null as string | null,
        staffId: person.id,
        basicSalary: Number(person.monthlySalary),
      })),
    ];
    if (!eligible.length) {
      throw new BadRequestException("No active teachers or staff have a positive monthly salary. Add salary details before generating payroll.");
    }

    const payslips = eligible.map((person) => {
      // SSNIT 2026 insurable earnings range: GHS 587.80–69,000.
      const insurableSalary = Math.min(69_000, Math.max(587.80, person.basicSalary));
      const ssnitEmployee = roundMoney(insurableSalary * 0.055);
      const ssnitEmployer = roundMoney(insurableSalary * 0.13);
      const grossSalary = roundMoney(person.basicSalary);
      const incomeTax = calculateResidentPaye2026(Math.max(0, grossSalary - ssnitEmployee));
      const netSalary = roundMoney(Math.max(0, grossSalary - ssnitEmployee - incomeTax));
      return {
        schoolId,
        teacherId: person.teacherId,
        staffId: person.staffId,
        basicSalary: new Prisma.Decimal(roundMoney(person.basicSalary)),
        allowances: new Prisma.Decimal(0),
        grossSalary: new Prisma.Decimal(grossSalary),
        ssnitEmployee: new Prisma.Decimal(ssnitEmployee),
        ssnitEmployer: new Prisma.Decimal(ssnitEmployer),
        incomeTax: new Prisma.Decimal(incomeTax),
        otherDeductions: new Prisma.Decimal(0),
        netSalary: new Prisma.Decimal(netSalary),
        paymentMethod: "BANK_TRANSFER" as const,
        paymentStatus: "PENDING" as const,
      };
    });
    const sum = (key: "grossSalary" | "netSalary" | "incomeTax" | "ssnitEmployee" | "ssnitEmployer") =>
      roundMoney(payslips.reduce((total, slip) => total + Number(slip[key]), 0));

    const payrollRecord = await db.$transaction(async (tx) => {
      const duplicate = await tx.payrollRecord.findUnique({
        where: { schoolId_month_year: { schoolId, month: input.month, year: input.year } },
        select: { id: true },
      });
      if (duplicate) throw new BadRequestException("A payroll run already exists for this month and year.");
      return tx.payrollRecord.create({
        data: {
          schoolId,
          month: input.month,
          year: input.year,
          status: "DRAFT",
          totalGross: new Prisma.Decimal(sum("grossSalary")),
          totalNet: new Prisma.Decimal(sum("netSalary")),
          totalTax: new Prisma.Decimal(sum("incomeTax")),
          totalSSNIT: new Prisma.Decimal(roundMoney(sum("ssnitEmployee") + sum("ssnitEmployer"))),
          processedById,
          academicYearId: currentYear?.id ?? null,
          termId: currentYear?.terms[0]?.id ?? null,
          payslips: { create: payslips },
        },
        include: {
          _count: { select: { payslips: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      payrollRecord,
      includedCount: eligible.length,
      excludedCount: teachers.length + staff.length - eligible.length,
    };
  }

  async transitionPayroll(
    schoolId: string,
    payrollRecordId: string,
    input: { status: "APPROVED" | "PAID" | "CANCELLED"; paymentMethod?: string },
    actorId: string,
  ) {
    const db = this.prisma.client;
    const payroll = await db.payrollRecord.findFirst({
      where: { id: payrollRecordId, schoolId },
      include: { _count: { select: { payslips: true } } },
    });
    if (!payroll) throw new NotFoundException("Payroll run not found.");
    if (payroll.status === "DRAFT" && input.status === "APPROVED") {
      if (!payroll._count.payslips) throw new BadRequestException("A payroll run without payslips cannot be approved.");
      this.assertSeparationOfDuties(actorId, payroll.processedById, "approved");
      return db.payrollRecord.update({
        where: { id: payroll.id },
        data: { status: "APPROVED", approvedById: actorId },
        include: {
          payslips: { include: { staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } } } }, teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } } } } } },
          _count: { select: { payslips: true } },
        },
      });
    }
    if (payroll.status === "DRAFT" && input.status === "CANCELLED") {
      return db.payrollRecord.update({
        where: { id: payroll.id },
        data: { status: "CANCELLED" },
        include: { payslips: true, _count: { select: { payslips: true } } },
      });
    }
    if (payroll.status === "APPROVED" && input.status === "PAID") {
      this.assertSeparationOfDuties(actorId, payroll.approvedById, "marked as paid");
      const paymentMethod = input.paymentMethod;
      if (!paymentMethod || !["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"].includes(paymentMethod)) {
        throw new BadRequestException("Choose a valid payment method before confirming payroll disbursement.");
      }

      return db.$transaction(async (tx) => {
        const current = await tx.payrollRecord.findFirst({
          where: { id: payroll.id, schoolId },
          include: {
            payslips: {
              select: {
                grossSalary: true,
                netSalary: true,
                incomeTax: true,
                ssnitEmployee: true,
                ssnitEmployer: true,
                otherDeductions: true,
              },
            },
          },
        });
        if (!current) throw new NotFoundException("Payroll run not found.");
        if (current.status !== "APPROVED") {
          throw new BadRequestException("Only an approved payroll run can be marked paid.");
        }
        if (!current.payslips.length) throw new BadRequestException("A payroll run without payslips cannot be marked paid.");

        const sum = (field: "grossSalary" | "netSalary" | "incomeTax" | "ssnitEmployee" | "ssnitEmployer" | "otherDeductions") =>
          current.payslips.reduce((total, slip) => total + Number(slip[field]), 0);
        const gross = roundMoney(sum("grossSalary"));
        const net = roundMoney(sum("netSalary"));
        const paye = roundMoney(sum("incomeTax"));
        const employeeSsnit = roundMoney(sum("ssnitEmployee"));
        const employerSsnit = roundMoney(sum("ssnitEmployer"));
        const otherDeductions = roundMoney(sum("otherDeductions"));
        const unreconciled = roundMoney(gross - net - paye - employeeSsnit - otherDeductions);
        if (Math.abs(unreconciled) > 0.02) {
          throw new BadRequestException(
            "This payroll does not reconcile: gross pay must equal net pay plus PAYE, employee SSNIT and other deductions. Review the payslips before confirming payment.",
          );
        }

        const paidAt = new Date();
        const referenceNumber = `${current.year}-${String(current.month).padStart(2, "0")}`;
        const paymentUsesBank = ["BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE"].includes(paymentMethod);
        const salaryExpense = await this.ensureAccount(tx, schoolId, {
          accountType: "EXPENSE",
          category: "SALARY_WAGES",
          name: "Salaries & Wages",
          code: "6000",
        });
        const payrollPayable = await this.ensureAccount(tx, schoolId, {
          accountType: "LIABILITY",
          category: "ACCOUNTS_PAYABLE",
          name: "Payroll Payable",
          code: "2100",
        });
        const paymentAccount = await this.ensureAccount(tx, schoolId, paymentUsesBank
          ? { accountType: "ASSET", category: "BANK", name: "Bank & Electronic Payments", code: "1010" }
          : { accountType: "ASSET", category: "CASH", name: "Cash on Hand", code: "1000" });
        const employerSsnitExpense = await this.ensureAccount(tx, schoolId, {
          accountType: "EXPENSE",
          category: "SALARY_WAGES",
          name: "Employer SSNIT Contributions",
          code: "6010",
        });
        const payePayable = await this.ensureAccount(tx, schoolId, {
          accountType: "LIABILITY",
          category: "TAXES",
          name: "PAYE Tax Payable",
          code: "2200",
        });
        const ssnitPayable = await this.ensureAccount(tx, schoolId, {
          accountType: "LIABILITY",
          category: "ACCOUNTS_PAYABLE",
          name: "SSNIT Payable",
          code: "2210",
        });
        const otherDeductionPayable = await this.ensureAccount(tx, schoolId, {
          accountType: "LIABILITY",
          category: "ACCOUNTS_PAYABLE",
          name: "Other Payroll Deductions Payable",
          code: "2220",
        });

        const postLedgerEntry = async (
          description: string,
          amountValue: number,
          debitAccount: { id: string; accountType: AccountType },
          creditAccount: { id: string; accountType: AccountType },
          transactionType: "EXPENSE" | "TRANSFER",
          notes: string,
        ) => {
          const amount = roundMoney(amountValue);
          if (amount <= 0) return;
          const decimalAmount = new Prisma.Decimal(amount);
          const prefix = `TXN-${paidAt.getUTCFullYear()}-`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${prefix}))`;
          const last = await tx.transaction.findFirst({
            where: { schoolId, transactionNumber: { startsWith: prefix } },
            orderBy: { transactionNumber: "desc" },
            select: { transactionNumber: true },
          });
          const seq = last ? Number(last.transactionNumber.slice(prefix.length)) + 1 : 1;
          await tx.transaction.create({
            data: {
              schoolId,
              transactionNumber: prefix + String(seq).padStart(5, "0"),
              transactionDate: paidAt,
              description,
              amount: decimalAmount,
              debitAccountId: debitAccount.id,
              creditAccountId: creditAccount.id,
              transactionType,
              category: "SALARY",
              referenceType: "PAYROLL",
              referenceId: current.id,
              referenceNumber,
              notes: `Payroll posting · ${notes} · Disbursement method: ${paymentMethod}`,
            },
          });
          const debitNaturalBalanceIncreases = debitAccount.accountType === "ASSET" || debitAccount.accountType === "EXPENSE";
          const creditNaturalBalanceIncreases = creditAccount.accountType === "LIABILITY" || creditAccount.accountType === "EQUITY" || creditAccount.accountType === "REVENUE";
          await tx.chartAccount.update({
            where: { id: debitAccount.id },
            data: { balance: debitNaturalBalanceIncreases ? { increment: decimalAmount } : { decrement: decimalAmount } },
          });
          await tx.chartAccount.update({
            where: { id: creditAccount.id },
            data: { balance: creditNaturalBalanceIncreases ? { increment: decimalAmount } : { decrement: decimalAmount } },
          });
        };

        // Accrue gross salary and employer pension cost, then allocate the
        // payable to actual net disbursement and statutory/other withholdings.
        await postLedgerEntry("Gross payroll accrual", gross, salaryExpense, payrollPayable, "EXPENSE", "Gross employee pay");
        await postLedgerEntry("Employer SSNIT contribution", employerSsnit, employerSsnitExpense, ssnitPayable, "EXPENSE", "Employer contribution");
        await postLedgerEntry("Net salary disbursement", net, payrollPayable, paymentAccount, "TRANSFER", "Net salaries confirmed paid");
        await postLedgerEntry("PAYE withheld from payroll", paye, payrollPayable, payePayable, "TRANSFER", "PAYE liability recognised");
        await postLedgerEntry("Employee SSNIT withheld from payroll", employeeSsnit, payrollPayable, ssnitPayable, "TRANSFER", "Employee SSNIT liability recognised");
        await postLedgerEntry("Other payroll deductions withheld", otherDeductions, payrollPayable, otherDeductionPayable, "TRANSFER", "Other deductions liability recognised");

        await tx.payslip.updateMany({
          where: { payrollRecordId: payroll.id, schoolId },
          data: { paymentStatus: "COMPLETED", paymentMethod: paymentMethod as PaymentMethod, paidAt },
        });
        const transition = await tx.payrollRecord.updateMany({
          where: { id: payroll.id, schoolId, status: "APPROVED" },
          data: { status: "PAID" },
        });
        if (transition.count !== 1) {
          throw new BadRequestException("Payroll status changed while it was being processed. Refresh and review the run before retrying.");
        }
        await this.writeAudit(tx, {
          actorId,
          schoolId,
          action: "UPDATE",
          entityType: "PAYROLL_RECORD",
          entityId: payroll.id,
          oldValues: { status: "APPROVED" },
          newValues: { status: "PAID", paymentMethod, totalNet: net.toFixed(2), totalGross: gross.toFixed(2) },
        });
        return tx.payrollRecord.findFirstOrThrow({
          where: { id: payroll.id, schoolId },
          include: {
            payslips: { include: { staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } } } }, teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } } } } } },
            _count: { select: { payslips: true } },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    throw new BadRequestException(`Payroll cannot move from ${payroll.status} to ${input.status}.`);
  }

  async listPayrollRecords(schoolId: string) {
    return this.prisma.client.payrollRecord.findMany({
      where: { schoolId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 100,
      include: {
        payslips: {
          include: {
            staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } } } },
            teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
        _count: { select: { payslips: true } },
      },
    });
  }

  async listFeeReminderSchedules(schoolId: string) {
    return this.prisma.client.feeReminderSchedule.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      include: {
        installments: { orderBy: { dueDate: "asc" } },
        createdBy: { select: { name: true } },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        _count: { select: { logs: true } },
      },
    });
  }

  async createFeeReminderSchedule(
    schoolId: string,
    createdById: string,
    input: {
      name: string;
      description?: string;
      messageTemplate: string;
      minimumOutstanding: number;
      installment?: { label: string; dueDate: string; sendDate: string };
    },
  ) {
    const name = input.name.trim();
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    const installment = input.installment;
    const parseDate = (value: string, field: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Enter ${field} as YYYY-MM-DD.`);
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException(`Enter a valid ${field.toLowerCase()}.`);
      }
      return date;
    };
    const dueDate = installment ? parseDate(installment.dueDate, "due date") : undefined;
    const sendDate = installment ? parseDate(installment.sendDate, "send date") : undefined;
    if (dueDate && sendDate && sendDate > dueDate) {
      throw new BadRequestException("The reminder send date must be on or before the due date.");
    }

    return this.prisma.client.feeReminderSchedule.create({
      data: {
        schoolId,
        name,
        description: input.description?.trim() || null,
        isActive: true,
        sendSms: false,
        sendEmail: false,
        sendInApp: true,
        targetOutstandingOnly: true,
        minimumOutstanding: new Prisma.Decimal(input.minimumOutstanding),
        messageTemplate: input.messageTemplate.trim(),
        academicYearId: currentYear?.id ?? null,
        termId: currentTerm?.id ?? null,
        createdById,
        ...(installment && dueDate && sendDate ? {
          installments: { create: { label: installment.label.trim(), dueDate, sendDate } },
        } : {}),
      },
      include: {
        installments: { orderBy: { dueDate: "asc" } },
        createdBy: { select: { name: true } },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        _count: { select: { logs: true } },
      },
    });
  }

  async setFeeReminderScheduleActive(schoolId: string, scheduleId: string, isActive: boolean) {
    const existing = await this.prisma.client.feeReminderSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Fee reminder schedule not found.");
    return this.prisma.client.feeReminderSchedule.update({
      where: { id: scheduleId },
      data: { isActive },
      include: {
        installments: { orderBy: { dueDate: "asc" } },
        createdBy: { select: { name: true } },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        _count: { select: { logs: true } },
      },
    });
  }

  async addFeeReminderInstallment(
    schoolId: string,
    scheduleId: string,
    input: { label: string; dueDate: string; sendDate: string },
  ) {
    const schedule = await this.prisma.client.feeReminderSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      select: { id: true },
    });
    if (!schedule) throw new NotFoundException("Fee reminder schedule not found.");
    const parseDate = (value: string, field: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`Enter ${field} as YYYY-MM-DD.`);
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`Enter a valid ${field.toLowerCase()}.`);
      return date;
    };
    const dueDate = parseDate(input.dueDate, "due date");
    const sendDate = parseDate(input.sendDate, "send date");
    if (sendDate > dueDate) throw new BadRequestException("The reminder send date must be on or before the due date.");
    return this.prisma.client.feeReminderInstallment.create({
      data: { scheduleId, label: input.label.trim(), dueDate, sendDate },
    });
  }
  private async collectFeeReminderTargets(
    schoolId: string,
    minimumOutstanding: number,
    academicYearId?: string | null,
    termId?: string | null,
  ) {
    const bills = await this.prisma.client.bill.findMany({
      where: {
        schoolId,
        status: { notIn: ["PAID", "CANCELLED", "WAIVED"] },
        balanceAmount: { gt: 0 },
        ...(academicYearId ? { academicYearId } : {}),
        ...(termId ? { termId } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, otherNames: true } },
            guardians: {
              where: { receiveAlerts: true },
              include: {
                guardian: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    otherNames: true,
                    phone: true,
                    email: true,
                    canLogin: true,
                    isActive: true,
                    deletedAt: true,
                    profile: { select: { userId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    type GuardianTarget = {
      id: string;
      userId: string | null;
      name: string;
      phone: string | null;
      email: string | null;
    };
    type StudentTarget = {
      studentId: string;
      name: string;
      balance: number;
      earliestDueDate: Date | null;
      guardians: Map<string, GuardianTarget>;
    };
    const targets = new Map<string, StudentTarget>();
    for (const bill of bills) {
      const student = bill.student;
      const studentName = [student.profile.firstName, student.profile.otherNames, student.profile.lastName].filter(Boolean).join(" ").trim() || "Student";
      let target = targets.get(student.id);
      if (!target) {
        target = { studentId: student.id, name: studentName, balance: 0, earliestDueDate: bill.dueDate, guardians: new Map() };
        targets.set(student.id, target);
      }
      target.balance += Number(bill.balanceAmount);
      if (bill.dueDate && (!target.earliestDueDate || bill.dueDate < target.earliestDueDate)) target.earliestDueDate = bill.dueDate;
      for (const link of student.guardians) {
        const guardian = link.guardian;
        if (!guardian.isActive || guardian.deletedAt) continue;
        const guardianName = [guardian.firstName, guardian.otherNames, guardian.lastName].filter(Boolean).join(" ").trim() || "Parent/guardian";
        target.guardians.set(guardian.id, {
          id: guardian.id,
          userId: guardian.canLogin ? guardian.profile?.userId ?? null : null,
          name: guardianName,
          phone: guardian.phone ?? null,
          email: guardian.email ?? null,
        });
      }
    }
    return [...targets.values()].filter((target) => target.balance > 0 && target.balance >= minimumOutstanding);
  }

  async previewFeeReminder(schoolId: string, scheduleId: string) {
    const schedule = await this.prisma.client.feeReminderSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      select: { id: true, minimumOutstanding: true, academicYearId: true, termId: true },
    });
    if (!schedule) throw new NotFoundException("Fee reminder schedule not found.");
    const targets = await this.collectFeeReminderTargets(
      schoolId,
      Number(schedule.minimumOutstanding),
      schedule.academicYearId,
      schedule.termId,
    );
    const recipientTargets = targets.flatMap((target) => [...target.guardians.values()]);
    return {
      studentCount: targets.length,
      guardianCount: recipientTargets.filter((guardian) => Boolean(guardian.userId)).length,
      guardiansWithoutPortal: recipientTargets.filter((guardian) => !guardian.userId).length,
      totalOutstanding: targets.reduce((sum, target) => sum + target.balance, 0),
      sampleStudents: targets.slice(0, 5).map((target) => ({ name: target.name, balance: target.balance })),
    };
  }

  async sendFeeReminderInApp(schoolId: string, scheduleId: string) {
    const db = this.prisma.client;
    const schedule = await db.feeReminderSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      include: { installments: { orderBy: { sendDate: "asc" } } },
    });
    if (!schedule) throw new NotFoundException("Fee reminder schedule not found.");
    if (!schedule.isActive) throw new BadRequestException("Activate this schedule before sending reminders.");
    if (!schedule.sendInApp) throw new BadRequestException("In-app reminders are not enabled for this schedule.");

    const installment = schedule.installments.find((item) => !item.sent);
    if (schedule.installments.length > 0 && !installment) {
      throw new BadRequestException("All configured reminder dates have already been sent. Add a new reminder date before sending again.");
    }
    const targets = await this.collectFeeReminderTargets(
      schoolId,
      Number(schedule.minimumOutstanding),
      schedule.academicYearId,
      schedule.termId,
    );
    if (!targets.length) {
      throw new BadRequestException("No students currently meet this schedule's outstanding-balance threshold.");
    }

    const alreadySent = await db.feeReminderLog.findMany({
      where: { scheduleId, installmentId: installment?.id ?? null, channel: "IN_APP", status: "SENT" },
      select: { studentId: true, guardianPhone: true, guardianEmail: true, guardianName: true },
    });
    const sentKeys = new Set(alreadySent.map((log) => `${log.studentId}|${log.guardianPhone ?? ""}|${log.guardianEmail ?? ""}|${log.guardianName}`));
    let inAppSent = 0;
    let skippedNoLogin = 0;
    let failed = 0;
    let alreadySentCount = 0;
    const today = new Date();

    for (const target of targets) {
      const balanceText = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(target.balance);
      const dueDateText = target.earliestDueDate
        ? target.earliestDueDate.toISOString().slice(0, 10)
        : "not specified";
      for (const guardian of target.guardians.values()) {
        const key = `${target.studentId}|${guardian.phone ?? ""}|${guardian.email ?? ""}|${guardian.name}`;
        if (sentKeys.has(key)) {
          alreadySentCount++;
          continue;
        }
        const message = schedule.messageTemplate
          .replaceAll("{{studentName}}", target.name)
          .replaceAll("{{guardianName}}", guardian.name)
          .replaceAll("{{outstandingBalance}}", `GHS ${balanceText}`)
          .replaceAll("{{dueDate}}", dueDateText)
          .replaceAll("{{installmentLabel}}", installment?.label ?? "school fees")
          .slice(0, 2000);
        if (!guardian.userId) {
          skippedNoLogin++;
          await db.feeReminderLog.create({
            data: {
              scheduleId,
              installmentId: installment?.id ?? null,
              guardianPhone: guardian.phone,
              guardianEmail: guardian.email,
              guardianName: guardian.name,
              studentName: target.name,
              studentId: target.studentId,
              outstandingBalance: new Prisma.Decimal(target.balance),
              channel: "IN_APP",
              status: "SKIPPED",
              error: "Guardian has no linked portal login.",
            },
          });
          continue;
        }
        try {
          await db.$transaction(async (tx) => {
            await tx.notification.create({
              data: {
                schoolId,
                userId: guardian.userId!,
                type: "FEE_REMINDER",
                title: `Fee reminder for ${target.name}`,
                message,
                link: "/guardian-fees",
                academicYearId: schedule.academicYearId,
                termId: schedule.termId,
              },
            });
            await tx.feeReminderLog.create({
              data: {
                scheduleId,
                installmentId: installment?.id ?? null,
                guardianPhone: guardian.phone,
                guardianEmail: guardian.email,
                guardianName: guardian.name,
                studentName: target.name,
                studentId: target.studentId,
                outstandingBalance: new Prisma.Decimal(target.balance),
                channel: "IN_APP",
                status: "SENT",
              },
            });
          });
          inAppSent++;
        } catch (error) {
          failed++;
          await db.feeReminderLog.create({
            data: {
              scheduleId,
              installmentId: installment?.id ?? null,
              guardianPhone: guardian.phone,
              guardianEmail: guardian.email,
              guardianName: guardian.name,
              studentName: target.name,
              studentId: target.studentId,
              outstandingBalance: new Prisma.Decimal(target.balance),
              channel: "IN_APP",
              status: "FAILED",
              error: error instanceof Error ? error.message.slice(0, 500) : "Could not create notification.",
            },
          });
        }
      }
    }
    if (installment && failed === 0) {
      await db.feeReminderInstallment.update({
        where: { id: installment.id },
        data: { sent: true, sentAt: new Date() },
      });
    }
    return { studentCount: targets.length, inAppSent, skippedNoLogin, failed, alreadySent: alreadySentCount };
  }

  async getStudentStatement(
    schoolId: string,
    studentId: string,
    role: string | undefined,
    query: { scope: StudentStatementScope; from?: string; to?: string; yearId?: string; termId?: string },
  ): Promise<StudentStatementResponse> {
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!currentYear || !currentTerm) throw new BadRequestException("This school has not selected a current academic year and term.");

    if (query.scope === "term" && Boolean(query.yearId) !== Boolean(query.termId)) {
      throw new BadRequestException("Academic year and term must be supplied together.");
    }
    if (query.scope === "all" && (query.yearId || query.termId)) {
      throw new BadRequestException("Do not specify an academic year or term when requesting an all-time statement.");
    }
    if (query.scope === "year" && query.termId) {
      throw new BadRequestException("A year statement cannot be restricted to one term.");
    }

    let periodYear = currentYear;
    let periodTerm = currentTerm;
    if (query.scope === "term") {
      const period = await this.resolveFinancePeriod(schoolId, query.yearId ?? currentYear.id, query.termId ?? currentTerm.id);
      if (!period.term) throw new BadRequestException("Choose a valid term.");
      periodYear = period.year as typeof currentYear;
      periodTerm = period.term as typeof currentTerm;
      if (
        !canManageAcademicContext(role) &&
        (periodYear.id !== currentYear.id || periodTerm.id !== currentTerm.id)
      ) throw new ForbiddenException("Only the current academic year and term are available for your role.");
    } else if (query.scope === "year") {
      const period = await this.resolveFinancePeriod(schoolId, query.yearId ?? currentYear.id);
      if (!period.year) throw new BadRequestException("Choose a valid academic year.");
      periodYear = period.year as typeof currentYear;
      if (!canManageAcademicContext(role) && periodYear.id !== currentYear.id) {
        throw new ForbiddenException("Only the current academic year is available for your role.");
      }
    } else if (!canManageAcademicContext(role)) {
      throw new ForbiddenException("All-time statements require a role with historical academic access.");
    }

    const from = parseReportingDate(query.from, "start date");
    const to = parseReportingDate(query.to, "end date", true);
    if (from && to && from.getTime() > to.getTime()) throw new BadRequestException("Start date must be before or equal to end date.");
    const displayFrom = from ?? (query.scope === "term" ? periodTerm.startDate : query.scope === "year" ? periodYear.startDate : undefined);
    const displayTo = to ?? (query.scope === "term" ? periodTerm.endDate : query.scope === "year" ? periodYear.endDate : undefined);

    const student = await this.prisma.client.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: {
        id: true,
        admissionNumber: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found in this school.");

    const [bills, payments, schoolPolicy] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: { schoolId, studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        select: {
          id: true, billNumber: true, academicYearId: true, termId: true, grossAmount: true,
          totalAmount: true, discountAmount: true, balanceAmount: true, dueDate: true, issuedAt: true,
          status: true,
        },
      }),
      this.prisma.client.payment.findMany({
        where: { schoolId, studentId },
        orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
        select: {
          id: true, billId: true, paymentNumber: true, amount: true, paymentMethod: true,
          paymentDate: true, status: true, referenceNumber: true, reversedAt: true,
          reversalReason: true, notes: true,
        },
      }),
      this.prisma.client.school.findFirst({ where: { id: schoolId }, select: { arrearsPolicy: true } }),
    ]);

    const billsById = new Map(bills.map((bill) => [bill.id, bill]));
    const sourceEvents: StatementLedgerEvent[] = [];
    for (const bill of bills) {
      const gross = bill.grossAmount.gt(0) ? bill.grossAmount : bill.totalAmount.plus(bill.discountAmount);
      sourceEvents.push({
        id: `bill:${bill.id}`,
        date: bill.issuedAt,
        type: "INVOICE",
        reference: bill.billNumber,
        description: `Invoice ${bill.billNumber}`,
        debit: gross,
        credit: new Prisma.Decimal(0),
        billId: bill.id,
      });
      if (bill.discountAmount.gt(0)) {
        sourceEvents.push({
          id: `discount:${bill.id}`,
          date: bill.issuedAt,
          type: "DISCOUNT",
          reference: bill.billNumber,
          description: `Discount on invoice ${bill.billNumber}`,
          debit: new Prisma.Decimal(0),
          credit: bill.discountAmount,
          billId: bill.id,
        });
      }
    }
    for (const payment of payments) {
      const validReceipt = payment.status === "COMPLETED" || Boolean(payment.reversedAt);
      if (!validReceipt) continue;
      sourceEvents.push({
        id: `receipt:${payment.id}`,
        date: payment.paymentDate,
        type: "RECEIPT",
        reference: payment.paymentNumber,
        description: `Receipt ${payment.paymentNumber} (${payment.paymentMethod.replaceAll("_", " ").toLowerCase()})`,
        debit: new Prisma.Decimal(0),
        credit: payment.amount,
        billId: payment.billId,
        paymentId: payment.id,
      });
      if (payment.reversedAt) {
        sourceEvents.push({
          id: `reversal:${payment.id}`,
          date: payment.reversedAt,
          type: payment.status === "REFUNDED" ? "REFUND" : "REVERSAL",
          reference: payment.paymentNumber,
          description: `${payment.status === "REFUNDED" ? "Refund" : "Reversal"} of receipt ${payment.paymentNumber}${payment.reversalReason ? `: ${payment.reversalReason}` : ""}`,
          debit: payment.amount,
          credit: new Prisma.Decimal(0),
          billId: payment.billId,
          paymentId: payment.id,
        });
      }
    }

    const eventInScope = (event: StatementLedgerEvent) => {
      if (query.scope === "all") return true;
      if (event.billId) {
        const bill = billsById.get(event.billId);
        // Receipt/reversal rows are date-scoped below; they need not be in the
        // same term as the bill when a later receipt clears an older receivable.
        if (event.type === "INVOICE" || event.type === "DISCOUNT") {
          return query.scope === "term"
            ? bill?.academicYearId === periodYear.id && bill.termId === periodTerm.id
            : bill?.academicYearId === periodYear.id;
        }
      }
      return true;
    };

    const eventDateInRange = (date: Date) =>
      (!displayFrom || date.getTime() >= displayFrom.getTime()) &&
      (!displayTo || date.getTime() <= displayTo.getTime());

    let openingBalance = new Prisma.Decimal(0);
    if (displayFrom) {
      for (const event of sourceEvents) {
        if (event.date.getTime() < displayFrom.getTime()) {
          openingBalance = openingBalance.plus(event.debit).minus(event.credit);
        }
      }
    }
    const visibleEvents = sourceEvents.filter((event) => eventInScope(event) && eventDateInRange(event.date));
    const entries = buildRunningStatementEntries(openingBalance, visibleEvents);
    const closingBalance = entries.length ? entries[entries.length - 1].balance : Number(openingBalance.toFixed(2));

    const scopeBills = bills.filter((bill) => {
      if (query.scope === "term") return bill.academicYearId === periodYear.id && bill.termId === periodTerm.id;
      if (query.scope === "year") return bill.academicYearId === periodYear.id;
      return true;
    });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const ageingTotals = new Map<"not-due" | "0-30" | "31-60" | "61-90" | "90+", Prisma.Decimal>([
      ["not-due", new Prisma.Decimal(0)],
      ["0-30", new Prisma.Decimal(0)],
      ["31-60", new Prisma.Decimal(0)],
      ["61-90", new Prisma.Decimal(0)],
      ["90+", new Prisma.Decimal(0)],
    ]);
    for (const bill of scopeBills) {
      if (bill.balanceAmount.lte(0)) continue;
      const bucket = !bill.dueDate || bill.dueDate.getTime() >= today.getTime()
        ? "not-due"
        : Math.floor((today.getTime() - bill.dueDate.getTime()) / 86_400_000) <= 30
          ? "0-30"
          : Math.floor((today.getTime() - bill.dueDate.getTime()) / 86_400_000) <= 60
            ? "31-60"
            : Math.floor((today.getTime() - bill.dueDate.getTime()) / 86_400_000) <= 90
              ? "61-90" : "90+";
      ageingTotals.set(bucket, ageingTotals.get(bucket)!.plus(bill.balanceAmount));
    }

    const paymentIds = payments.map((payment) => payment.id);
    const allocatedByPayment = paymentIds.length
      ? await this.prisma.client.paymentItem.groupBy({
          by: ["paymentId"],
          where: { paymentId: { in: paymentIds }, payment: { schoolId, studentId } },
          _sum: { amount: true },
        })
      : [];
    const allocationSums = new Map(allocatedByPayment.map((row) => [row.paymentId, row._sum.amount ?? new Prisma.Decimal(0)]));
    let unallocatedCredit = new Prisma.Decimal(0);
    for (const payment of payments) {
      if (payment.status !== "COMPLETED" || payment.reversedAt) continue;
      if (payment.billId && !billsById.has(payment.billId)) continue;
      if (query.scope === "term" && payment.billId && !scopeBills.some((bill) => bill.id === payment.billId) && !eventDateInRange(payment.paymentDate)) continue;
      if (query.scope === "year" && payment.billId && !scopeBills.some((bill) => bill.id === payment.billId) && !eventDateInRange(payment.paymentDate)) continue;
      if (!eventDateInRange(payment.paymentDate)) continue;
      const allocated = allocationSums.get(payment.id) ?? new Prisma.Decimal(0);
      const remaining = payment.amount.minus(allocated);
      if (remaining.gt(0)) unallocatedCredit = unallocatedCredit.plus(remaining);
    }

    const periodLabel = query.scope === "term"
      ? `${periodYear.name} — ${periodTerm.name}`
      : query.scope === "year" ? periodYear.name : "All time";
    return {
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.profile?.firstName ?? null,
        lastName: student.profile?.lastName ?? null,
      },
      scope: query.scope,
      period: {
        label: periodLabel,
        from: displayFrom?.toISOString().slice(0, 10) ?? null,
        to: displayTo?.toISOString().slice(0, 10) ?? null,
        academicYearId: query.scope === "all" ? null : periodYear.id,
        termId: query.scope === "term" ? periodTerm.id : null,
      },
      openingBalance: Number(openingBalance.toFixed(2)),
      entries,
      closingBalance,
      ageing: [...ageingTotals.entries()].map(([bucket, amount]) => ({ bucket, amount: Number(amount.toFixed(2)) })),
      unallocatedCredit: Number(unallocatedCredit.toFixed(2)),
      arrearsPolicy: schoolPolicy?.arrearsPolicy ?? "SHOW_ONLY",
    };
  }

  async getStudentLedger(
    schoolId: string,
    studentId: string,
    role?: string,
    academicYearId?: string,
    termId?: string,
  ) {
    if (Boolean(academicYearId) !== Boolean(termId)) {
      throw new BadRequestException(
        "Academic year and term must be supplied together.",
      );
    }
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!currentYear || !currentTerm) {
      throw new BadRequestException(
        "This school has not selected a current academic year and term.",
      );
    }
    const selectedYearId = academicYearId ?? currentYear.id;
    const selectedTermId = termId ?? currentTerm.id;
    const selectedTerm = await this.prisma.client.term.findFirst({
      where: {
        id: selectedTermId,
        academicYearId: selectedYearId,
        academicYear: { schoolId },
      },
      include: { academicYear: { select: { id: true, name: true } } },
    });
    if (!selectedTerm) {
      throw new BadRequestException(
        "Choose a term belonging to an academic year in this school.",
      );
    }
    if (
      !canManageAcademicContext(role) &&
      (selectedYearId !== currentYear.id || selectedTermId !== currentTerm.id)
    ) {
      throw new ForbiddenException(
        "Only the current academic year and term are available for your role.",
      );
    }

    const student = await this.prisma.client.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: {
        id: true,
        admissionNumber: true,
        outstandingBalance: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    const [bills, payments] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: {
          studentId,
          schoolId,
          academicYearId: selectedYearId,
          termId: selectedTermId,
        },
        orderBy: { issuedAt: "desc" },
        include: { items: true },
      }),
      this.prisma.client.payment.findMany({
        where: {
          studentId,
          schoolId,
          OR: [
            { bill: { academicYearId: selectedYearId, termId: selectedTermId } },
            {
              billId: null,
              paymentDate: { gte: selectedTerm.startDate, lte: selectedTerm.endDate },
            },
          ],
        },
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    return {
      student,
      academicYear: selectedTerm.academicYear,
      term: { id: selectedTerm.id, name: selectedTerm.name },
      currentBalance: bills.reduce(
        (balance, bill) => balance + Number(bill.balanceAmount),
        0,
      ),
      bills,
      payments,
    };
  }
}
