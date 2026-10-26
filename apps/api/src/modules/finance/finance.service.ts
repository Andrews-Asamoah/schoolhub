import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateExpenseInput, GenerateBillInput, RecordPaymentInput, StudentStatementResponse } from "@schoolhub/shared";
import { calculatePayslip, type PayrollSettings } from "./payroll/payroll-calculator.js";
import { Prisma, type AccountCategory, type AccountType, type AuditAction, type PaymentMethod, type TransactionCategory } from "@prisma/client";
import { canManageAcademicContext } from "../../common/academic-context.js";
import { createSequence, isIdempotencyRace, isSerializationFailure, postingDateProblem, withSerializableRetry } from "./finance.helpers.js";
import { buildFinanceAuditWhere, categoryOf, clampPageSize, describeFinanceAudit, type FinanceAuditQuery } from "./finance-audit.helpers.js";
import { buildRunningStatement, daysPastDue, type StatementEvent } from "./finance-reporting.helpers.js";

// Transitional statutory profile: existing draft fields cannot yet hold individual
// contributions or persist versioned settings. Do not silently apply it to later years.
// Future school-specific settings must be effective-dated and snapshotted per run.
const PAYROLL_PROFILE_2026: PayrollSettings = {
  rounding: "HALF_UP",
  taxSchedule: {
    bands: [
      { width: "588", rate: "0" },
      { width: "80", rate: "5" },
      { width: "100", rate: "10" },
      { width: "2900", rate: "17.5" },
      { width: "16000", rate: "25" },
      { width: "30332", rate: "30" },
      { width: null, rate: "35" },
    ],
    nonResidentRate: "25",
  },
  schemes: [{
    key: "SSNIT_TIER1",
    label: "SSNIT (existing payroll profile)",
    base: "BASIC",
    employeeRate: "5.5",
    employerRate: "13",
    memoRate: "0",
    insurableMin: "587.80",
    insurableMax: "69000",
    employeeShareTaxDeductible: true,
  }],
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type FinanceListQuery = {
  cursor?: string;
  limit?: string | number;
  search?: string;
  status?: string;
  classId?: string;
  paymentMethod?: string;
  from?: string;
  to?: string;
  studentId?: string;
  outstanding?: string;
  overdue?: string;
  yearId?: string;
  termId?: string;
};

type StudentStatementQuery = {
  scope?: "term" | "year" | "all";
  from?: string;
  to?: string;
  yearId?: string;
  termId?: string;
};

const BILL_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "WAIVED"] as const;
const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "CARD", "ONLINE", "OTHER"] as const;

function parseIsoDate(value: string | undefined, label: string, endOfDay = false): Date | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`Enter a valid ${label} in YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`Enter a valid ${label} date.`);
  }
  return date;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function moneyString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
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

  /** Post cash received as school income using double-entry bookkeeping. */
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

  /** Post an expense using double-entry bookkeeping. */
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
    grossAmount: Prisma.Decimal,
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
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const details: {
      type: "SCHOLARSHIP" | "SIBLING_DISCOUNT";
      label: string;
      amount: Prisma.Decimal;
      scholarshipId?: string;
      policyId?: string;
    }[] = [];
    let remaining = grossAmount;
    const round = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    for (const scholarship of scholarships) {
      if (remaining.lte(0)) break;
      const requested = scholarship.valueType === "PERCENTAGE"
        ? round(grossAmount.mul(scholarship.value).div(100))
        : scholarship.value;
      const amount = Prisma.Decimal.min(remaining, Prisma.Decimal.max(0, requested));
      if (amount.gt(0)) {
        details.push({ type: "SCHOLARSHIP", label: scholarship.name, amount, scholarshipId: scholarship.id });
        remaining = round(remaining.minus(amount));
      }
    }

    const guardianLinks = await tx.guardianStudent.findMany({
      where: { studentId, guardian: { schoolId, isActive: true, deletedAt: null } },
      select: { guardianId: true },
    });
    const guardianIds = [...new Set(guardianLinks.map((link) => link.guardianId))];
    if (remaining.gt(0) && guardianIds.length) {
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
          ? round(remaining.mul(policy.value).div(100))
          : policy.value;
        const amount = Prisma.Decimal.min(remaining, Prisma.Decimal.max(0, requested));
        if (amount.gt(0)) details.push({ type: "SIBLING_DISCOUNT", label: policy.name, amount, policyId: policy.id });
      }
    }
    const totalDiscount = details.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    return { details, totalDiscount: round(totalDiscount) };
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
    if (input.academicYearId !== currentYear.id || (input.termId && input.termId !== currentTerm.id)) {
      throw new BadRequestException("Bills can only be generated for the currently selected academic year and term.");
    }
    if (input.classId) {
      const schoolClass = await this.prisma.client.class.findFirst({
        where: { id: input.classId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!schoolClass) throw new NotFoundException("Class not found in this school.");
    }

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
      if (!enrollment) throw new BadRequestException("The selected student is not enrolled in the current term.");
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
    if (studentIds.length === 0) return { success: true, count: 0, totalBilled: "0.00", message: "No active students to bill" };
    studentIds.sort();

    const year = new Date().getUTCFullYear();
    const billingResult = await withSerializableRetry(() => this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${input.feeStructureId}))`;
      const feeStructure = await tx.feeStructure.findFirst({
        where: { id: input.feeStructureId, schoolId, isActive: true },
        include: { items: true, targetClasses: { select: { classId: true } } },
      });
      if (!feeStructure) throw new NotFoundException("Fee structure not found.");
      if (!feeStructure.items.length) throw new BadRequestException("Fee structure contains no billable items.");

      const optionalIds = new Set(input.optionalItemIds ?? []);
      const optionalItems = feeStructure.items.filter((item) => item.isOptional);
      const optionalItemsById = new Map(optionalItems.map((item) => [item.id, item]));
      for (const optionalId of optionalIds) {
        if (!optionalItemsById.has(optionalId)) {
          throw new BadRequestException("Every optionalItemId must identify an optional item in this fee structure.");
        }
      }
      const billableItems = feeStructure.items.filter((item) => !item.isOptional || optionalIds.has(item.id));
      if (billableItems.length === 0) throw new BadRequestException("Select at least one fee item to generate this bill.");
      if (
        input.classId &&
        feeStructure.targetClasses.length > 0 &&
        !feeStructure.targetClasses.some((target) => target.classId === input.classId)
      ) {
        throw new BadRequestException("This fee structure is not assigned to the selected class.");
      }

      const billNumbers = await this.createNumberSequence(tx, schoolId, "bill", `INV-${year}-`);
      const totalAmount = billableItems.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const previousBills = await tx.bill.findMany({
        where: {
          schoolId,
          studentId: { in: studentIds },
          balanceAmount: { gt: new Prisma.Decimal(0) },
          status: { notIn: ["CANCELLED", "WAIVED"] },
        },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        include: {
          academicYear: { select: { id: true, name: true, startDate: true } },
          term: { select: { id: true, name: true, startDate: true } },
        },
      });
      const carryForwardsByStudent = new Map<string, typeof previousBills>();
      for (const previousBill of previousBills) {
        if (previousBill.academicYearId === currentYear.id && previousBill.termId === currentTerm.id) continue;
        const termStart = previousBill.term?.startDate ?? previousBill.academicYear.startDate;
        if (termStart >= currentTerm.startDate) continue;
        const list = carryForwardsByStudent.get(previousBill.studentId) ?? [];
        list.push(previousBill);
        carryForwardsByStudent.set(previousBill.studentId, list);
      }

      const schoolSettingsRow = await tx.school.findFirst({ where: { id: schoolId }, select: { settings: true } });
      const schoolSettings = schoolSettingsRow?.settings && typeof schoolSettingsRow.settings === "object" && !Array.isArray(schoolSettingsRow.settings)
        ? schoolSettingsRow.settings as Record<string, unknown>
        : {};
      const rawLateFeePolicy = schoolSettings.lateFeePolicy && typeof schoolSettings.lateFeePolicy === "object" && !Array.isArray(schoolSettings.lateFeePolicy)
        ? schoolSettings.lateFeePolicy as Record<string, unknown>
        : {};
      const lateFeeMode = rawLateFeePolicy.mode === "PERCENTAGE" ? "PERCENTAGE" as const : "FIXED" as const;
      let lateFeeValue = new Prisma.Decimal(0);
      try {
        lateFeeValue = new Prisma.Decimal(String(rawLateFeePolicy.value ?? "0.00"));
        if (!lateFeeValue.isFinite() || lateFeeValue.lt(0) || (lateFeeMode === "PERCENTAGE" && lateFeeValue.gt(100))) {
          lateFeeValue = new Prisma.Decimal(0);
        }
      } catch {
        lateFeeValue = new Prisma.Decimal(0);
      }
      const lateFeeEnabled = rawLateFeePolicy.enabled === true && lateFeeValue.gt(0);
      const rawGraceDays = Number.isInteger(rawLateFeePolicy.graceDays) ? Number(rawLateFeePolicy.graceDays) : 0;
      const lateFeeGraceDays = Math.min(3650, Math.max(0, rawGraceDays));
      const priorBillIds = previousBills.map((bill) => bill.id);
      const existingLateFeeAssessments = priorBillIds.length
        ? await tx.lateFeeAssessment.findMany({
            where: { schoolId, sourceBillId: { in: priorBillIds } },
            select: { sourceBillId: true },
          })
        : [];
      const assessedSourceBillIds = new Set(existingLateFeeAssessments.map((row) => row.sourceBillId));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const lateFeeSourcesByStudent = new Map<string, Array<{ bill: (typeof previousBills)[number]; amount: Prisma.Decimal }>>();
      if (lateFeeEnabled) {
        for (const previousBill of previousBills) {
          const termStart = previousBill.term?.startDate ?? previousBill.academicYear.startDate;
          if (termStart >= currentTerm.startDate || assessedSourceBillIds.has(previousBill.id) || !previousBill.dueDate) continue;
          if (daysPastDue(previousBill.dueDate, today) <= lateFeeGraceDays) continue;
          const amount = lateFeeMode === "PERCENTAGE"
            ? previousBill.balanceAmount.mul(lateFeeValue).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            : lateFeeValue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          if (amount.lte(0)) continue;
          const current = lateFeeSourcesByStudent.get(previousBill.studentId) ?? [];
          current.push({ bill: previousBill, amount });
          lateFeeSourcesByStudent.set(previousBill.studentId, current);
        }
      }

      const results: Array<{ id: string; billNumber: string; totalAmount: Prisma.Decimal }> = [];
      for (const studentId of studentIds) {
        const existingBill = await tx.bill.findFirst({
          where: {
            schoolId, studentId, academicYearId: currentYear.id, termId: currentTerm.id,
            feeStructureId: input.feeStructureId, status: { notIn: ["CANCELLED", "WAIVED"] },
          },
          select: { id: true },
        });
        if (existingBill) continue;

        const concessions = await this.calculateStudentConcessions(
          tx, schoolId, studentId, currentYear.id, currentTerm.id, totalAmount,
        );
        const round = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const netTotal = Prisma.Decimal.max(0, round(totalAmount.minus(concessions.totalDiscount)));
        const lateFeeSources = lateFeeSourcesByStudent.get(studentId) ?? [];
        const lateFeeTotal = lateFeeSources.reduce((sum, source) => sum.plus(source.amount), new Prisma.Decimal(0));
        const billTotal = netTotal.plus(lateFeeTotal);
        let allocatedDiscount = new Prisma.Decimal(0);
        const billItems: Array<{
          feeItemId: string | null;
          description: string;
          amount: Prisma.Decimal;
          quantity: number;
          totalAmount: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          balanceAmount: Prisma.Decimal;
          status: "FULLY_PAID" | "UNPAID";
        }> = billableItems.map((item, index) => {
          const grossLine = item.amount;
          const lineDiscount = index === billableItems.length - 1
            ? round(concessions.totalDiscount.minus(allocatedDiscount))
            : round(concessions.totalDiscount.mul(grossLine).div(totalAmount.eq(0) ? 1 : totalAmount));
          allocatedDiscount = allocatedDiscount.plus(lineDiscount);
          const netLine = Prisma.Decimal.max(0, round(grossLine.minus(lineDiscount)));
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
        billItems.push(...lateFeeSources.map((source) => ({
          feeItemId: null,
          description: `Late fee on invoice ${source.bill.billNumber}`,
          amount: source.amount,
          quantity: 1,
          totalAmount: source.amount,
          discountAmount: new Prisma.Decimal(0),
          balanceAmount: source.amount,
          status: "UNPAID" as const,
        })));

        const alreadySnapshotted = await tx.bill.findFirst({
          where: {
            schoolId,
            studentId,
            academicYearId: currentYear.id,
            termId: currentTerm.id,
            carryForwardSnapshotCreated: true,
          },
          select: { id: true },
        });
        const carryForwardRows = alreadySnapshotted ? [] : (carryForwardsByStudent.get(studentId) ?? []);
        const billNumber = billNumbers.next();
        const bill = await tx.bill.create({
          data: {
            schoolId,
            studentId,
            academicYearId: currentYear.id,
            termId: currentTerm.id,
            feeStructureId: input.feeStructureId,
            classId: input.classId,
            carryForwardSnapshotCreated: true,
            billNumber,
            grossAmount: totalAmount.plus(lateFeeTotal),
            discountAmount: concessions.totalDiscount,
            totalAmount: billTotal,
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: billTotal,
            status: billTotal.eq(0) ? "PAID" : "PENDING",
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            notes: input.notes,
            items: { create: billItems },
            concessions: {
              create: concessions.details.map((detail) => ({
                type: detail.type,
                label: detail.label,
                amount: detail.amount,
                siblingDiscountPolicyId: detail.policyId,
                studentScholarshipId: detail.scholarshipId,
              })),
            },
            // Snapshot only. These rows describe earlier debts, never add them to totalAmount.
            carryForwards: {
              create: carryForwardRows.map((previous) => ({
                schoolId,
                sourceBillId: previous.id,
                sourceBillNumber: previous.billNumber,
                sourceAcademicYearName: previous.academicYear.name,
                sourceTermName: previous.term?.name ?? null,
                amount: previous.balanceAmount,
              })),
            },
          },
          select: { id: true, billNumber: true, totalAmount: true },
        });
        if (lateFeeSources.length) {
          await tx.lateFeeAssessment.createMany({
            data: lateFeeSources.map((source) => ({
              schoolId,
              sourceBillId: source.bill.id,
              targetBillId: bill.id,
              amount: source.amount,
              mode: lateFeeMode,
              value: lateFeeValue,
              graceDays: lateFeeGraceDays,
              createdBy: actorId,
            })),
          });
        }
        await tx.student.update({
          where: { id: studentId },
          data: { outstandingBalance: { increment: billTotal } },
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
          optionalItemIds: [...optionalIds],
          lateFeesEnabled: lateFeeEnabled,
          lateFeeCount: lateFeeSourcesByStudent.size,
          totalBilled: results.reduce((sum, bill) => sum.plus(bill.totalAmount), new Prisma.Decimal(0)).toFixed(2),
        },
      });
      return { bills: results };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), {
      onExhausted: () => new ConflictException("The system is busy generating other bills. Please try again in a moment."),
    });

    return {
      success: true,
      count: billingResult.bills.length,
      totalBilled: billingResult.bills.reduce((sum, bill) => sum.plus(bill.totalAmount), new Prisma.Decimal(0)).toFixed(2),
    };
  }

  async recordPayment(
    schoolId: string,
    recordedById: string,
    input: RecordPaymentInput,
  ) {
    const student = await this.prisma.client.student.findFirst({
      where: { id: input.studentId, schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Student not found.");

    const paymentAmount = new Prisma.Decimal(String(input.amount));
    if (!paymentAmount.isFinite() || paymentAmount.lte(0)) {
      throw new BadRequestException("The payment amount must be greater than zero.");
    }
    if (paymentAmount.decimalPlaces() > 2) {
      throw new BadRequestException("The payment amount can have at most two decimal places.");
    }
    const paymentDate = new Date(input.paymentDate);
    if (Number.isNaN(paymentDate.getTime()) || paymentDate.toISOString().slice(0, 10) !== input.paymentDate) {
      throw new BadRequestException("Enter a valid payment date.");
    }
    const year = paymentDate.getUTCFullYear();

    return withSerializableRetry(() => this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM students WHERE id = ${input.studentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      // Lock all bills for the student in deterministic issue-date order. This
      // serialises two receipts which may spill across the same set of invoices.
      await tx.$executeRaw`
        SELECT id FROM bills
        WHERE "schoolId" = ${schoolId} AND "studentId" = ${input.studentId}
        ORDER BY "issuedAt" ASC, id ASC FOR UPDATE
      `;

      if (input.idempotencyKey) {
        const existing = await tx.payment.findFirst({
          where: { schoolId, idempotencyKey: input.idempotencyKey },
          include: { billAllocations: true, paymentItems: true },
        });
        if (existing) {
          const sameCoreRequest =
            existing.studentId === input.studentId &&
            existing.amount.eq(paymentAmount) &&
            existing.paymentMethod === input.paymentMethod &&
            existing.paymentDate.toISOString().slice(0, 10) === input.paymentDate;
          if (!sameCoreRequest) {
            throw new ConflictException("This idempotency key was already used for a different payment.");
          }
          if (input.allocations?.length) {
            const stored = new Map(existing.paymentItems.map((item) => [item.billItemId, item.amount.toFixed(2)]));
            const requested = new Map(input.allocations.map((item) => [item.billItemId, new Prisma.Decimal(String(item.amount)).toFixed(2)]));
            if (stored.size !== requested.size || [...stored].some(([id, amount]) => requested.get(id) !== amount)) {
              throw new ConflictException("This idempotency key was already used with different bill-item allocations.");
            }
          }
          return existing;
        }
      }

      await this.assertPostingDate(tx, schoolId, paymentDate);
      const allBills = await tx.bill.findMany({
        where: { schoolId, studentId: input.studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        include: { items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      if (input.billId) {
        const selectedBill = await tx.bill.findFirst({
          where: { id: input.billId, schoolId, studentId: input.studentId },
          select: { id: true, status: true, balanceAmount: true },
        });
        if (!selectedBill) throw new NotFoundException("Bill not found for this student.");
        if (["CANCELLED", "WAIVED"].includes(selectedBill.status)) {
          throw new BadRequestException("Payments cannot be recorded against a cancelled or waived bill.");
        }
        if (selectedBill.balanceAmount.lte(0)) {
          throw new BadRequestException("The selected bill is already settled.");
        }
      }

      const openBills = allBills.filter((bill) => bill.balanceAmount.gt(0));
      if (openBills.length === 0) {
        throw new BadRequestException("There are no open bills for this student. Surplus payments will be supported with credit balances in a later phase.");
      }
      const totalOpen = openBills.reduce((sum, bill) => sum.plus(bill.balanceAmount), new Prisma.Decimal(0));
      if (paymentAmount.gt(totalOpen)) {
        throw new BadRequestException(
          `Payment exceeds the student's total open balance of ${totalOpen.toFixed(2)}. Credit/prepayment balances are not enabled yet.`,
        );
      }

      const billById = new Map(openBills.map((bill) => [bill.id, bill]));
      const itemAllocations: { billId: string; billItemId: string; amount: Prisma.Decimal }[] = [];
      const billAmounts = new Map<string, Prisma.Decimal>();

      if (input.allocations?.length) {
        if (!input.billId) throw new BadRequestException("Explicit fee-component allocations require a billId.");
        const bill = billById.get(input.billId);
        if (!bill) throw new BadRequestException("The selected bill has no outstanding balance.");
        const seen = new Set<string>();
        let allocatedTotal = new Prisma.Decimal(0);
        for (const allocation of input.allocations) {
          if (seen.has(allocation.billItemId)) throw new BadRequestException("Each bill component can only be selected once.");
          seen.add(allocation.billItemId);
          const item = bill.items.find((candidate) => candidate.id === allocation.billItemId);
          if (!item) throw new BadRequestException("One or more selected components do not belong to this bill.");
          const amount = new Prisma.Decimal(String(allocation.amount));
          if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2 || amount.gt(item.balanceAmount)) {
            throw new BadRequestException(`Allocation for "${item.description}" must be a positive amount to two decimal places and not exceed ${item.balanceAmount.toFixed(2)}.`);
          }
          itemAllocations.push({ billId: bill.id, billItemId: item.id, amount });
          allocatedTotal = allocatedTotal.plus(amount);
        }
        if (!allocatedTotal.eq(paymentAmount)) {
          throw new BadRequestException("The payment amount must equal the sum of the selected fee-component allocations.");
        }
        billAmounts.set(bill.id, allocatedTotal);
      } else {
        let remaining = paymentAmount;
        for (const bill of openBills) {
          for (const item of bill.items) {
            if (remaining.lte(0)) break;
            if (item.balanceAmount.lte(0)) continue;
            const applied = Prisma.Decimal.min(remaining, item.balanceAmount);
            if (applied.gt(0)) {
              itemAllocations.push({ billId: bill.id, billItemId: item.id, amount: applied });
              billAmounts.set(bill.id, (billAmounts.get(bill.id) ?? new Prisma.Decimal(0)).plus(applied));
              remaining = remaining.minus(applied);
            }
          }
          if (remaining.lte(0)) break;
        }
        if (remaining.gt(0)) {
          throw new ConflictException(
            "The saved bill items do not reconcile to the outstanding bill balances. No receipt was recorded; the account needs reconciliation.",
          );
        }
      }

      const billAllocated = [...billAmounts.values()].reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0));
      if (!billAllocated.eq(paymentAmount)) {
        throw new ConflictException("The receipt could not be fully allocated to open bills. Nothing was recorded.");
      }
      const allocationsByItem = new Map<string, Prisma.Decimal>();
      for (const allocation of itemAllocations) {
        allocationsByItem.set(
          allocation.billItemId,
          (allocationsByItem.get(allocation.billItemId) ?? new Prisma.Decimal(0)).plus(allocation.amount),
        );
      }
      for (const [billId, billAmount] of billAmounts) {
        const bill = billById.get(billId)!;
        const itemBalance = bill.items.reduce((sum, item) => sum.plus(item.balanceAmount), new Prisma.Decimal(0));
        if (!itemBalance.eq(bill.balanceAmount) && !input.allocations?.length) {
          throw new ConflictException(`Bill ${bill.billNumber} has a mismatch between its item balances and bill balance. No receipt was recorded.`);
        }
        if (billAmount.gt(bill.balanceAmount)) {
          throw new ConflictException("A receipt allocation exceeds its bill balance. No receipt was recorded.");
        }
      }

      const paymentNumbers = await this.createNumberSequence(tx, schoolId, "payment", `RCT-${year}-`);
      const paymentNumber = paymentNumbers.next();
      const firstBillId = itemAllocations[0]?.billId ?? null;
      const created = await tx.payment.create({
        data: {
          schoolId,
          studentId: input.studentId,
          billId: firstBillId,
          paymentNumber,
          amount: paymentAmount,
          paymentMethod: input.paymentMethod,
          paymentDate,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          recordedById,
          idempotencyKey: input.idempotencyKey,
        },
      });

      // Persist a bill-level allocation ledger in addition to per-item allocation
      // rows. This explicitly represents one receipt clearing several invoices.
      await tx.paymentBillAllocation.createMany({
        data: [...billAmounts.entries()].map(([billId, amount]) => ({
          schoolId, paymentId: created.id, billId, amount,
        })),
      });

      for (const allocation of itemAllocations) {
        const bill = billById.get(allocation.billId)!;
        const item = bill.items.find((candidate) => candidate.id === allocation.billItemId)!;
        const itemApplied = allocationsByItem.get(item.id)!;
        const itemBalance = item.balanceAmount.minus(itemApplied);
        const itemPaid = item.paidAmount.plus(itemApplied);
        await tx.billItem.update({
          where: { id: item.id },
          data: {
            paidAmount: itemPaid,
            balanceAmount: itemBalance,
            status: itemBalance.eq(0) ? "FULLY_PAID" : itemPaid.gt(0) ? "PARTIALLY_PAID" : "UNPAID",
          },
        });
        await tx.paymentItem.create({
          data: { paymentId: created.id, billItemId: item.id, amount: allocation.amount },
        });
      }

      for (const [billId, amount] of billAmounts) {
        const bill = billById.get(billId)!;
        const paid = bill.paidAmount.plus(amount);
        const balance = bill.balanceAmount.minus(amount);
        await tx.bill.update({
          where: { id: bill.id },
          data: {
            paidAmount: paid,
            balanceAmount: balance,
            status: balance.eq(0) ? "PAID" : paid.gt(0) ? "PARTIALLY_PAID" : "PENDING",
          },
        });
      }

      const updatedStudentBalance = await tx.bill.aggregate({
        where: { schoolId, studentId: input.studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
        _sum: { balanceAmount: true },
      });
      await tx.student.update({
        where: { id: input.studentId },
        data: { outstandingBalance: updatedStudentBalance._sum.balanceAmount ?? new Prisma.Decimal(0) },
      });

      const ledger = await this.postIncome(tx, {
        schoolId,
        amount: paymentAmount,
        date: paymentDate,
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

      await this.writeAudit(tx, {
        actorId: recordedById,
        schoolId,
        action: "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: payment.id,
        newValues: {
          paymentNumber,
          studentId: input.studentId,
          billId: firstBillId,
          allocations: [...billAmounts.entries()].map(([billId, amount]) => ({ billId, amount: amount.toFixed(2) })),
          amount: paymentAmount.toFixed(2),
          paymentMethod: input.paymentMethod,
          ledgerTransactionId: ledger.id,
        },
      });
      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }), {
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
        include: { paymentItems: { include: { billItem: { select: { id: true, billId: true } } } }, billAllocations: true, transaction: true },
      });
      if (!payment) throw new NotFoundException("Payment not found.");
      if (payment.reversedAt || payment.status !== "COMPLETED") {
        throw new BadRequestException("This payment has already been reversed or is not a completed payment.");
      }

      // Reversals are new postings, not backdated edits. Never post one into
      // a closed accounting period, even when the original receipt predates it.
      await this.assertPostingDate(tx, schoolId, new Date());
      await tx.$executeRaw`SELECT id FROM students WHERE id = ${payment.studentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      const billAmounts = new Map<string, Prisma.Decimal>();
      for (const allocation of payment.billAllocations) {
        billAmounts.set(allocation.billId, (billAmounts.get(allocation.billId) ?? new Prisma.Decimal(0)).plus(allocation.amount));
      }
      // Legacy receipts predate bill-level allocation rows. Recover the actual
      // bill targets from saved item allocations before falling back to billId.
      if (billAmounts.size === 0) {
        for (const allocation of payment.paymentItems) {
          const billId = allocation.billItem.billId;
          billAmounts.set(billId, (billAmounts.get(billId) ?? new Prisma.Decimal(0)).plus(allocation.amount));
        }
        if (billAmounts.size === 0 && payment.billId) billAmounts.set(payment.billId, payment.amount);
      }
      // Reconcile the original receipt before touching any balance. A mismatch
      // indicates corrupt/partial allocation history; never silently clamp it.
      const appliedToBills = [...billAmounts.values()].reduce(
        (total, value) => total.plus(value), new Prisma.Decimal(0),
      );
      if (billAmounts.size === 0 || !appliedToBills.eq(payment.amount)) {
        throw new ConflictException("Receipt allocations do not reconcile to the payment amount. No reversal was applied.");
      }
      if (payment.paymentItems.length) {
        const appliedToItems = payment.paymentItems.reduce(
          (total, item) => total.plus(item.amount), new Prisma.Decimal(0),
        );
        if (!appliedToItems.eq(appliedToBills)) {
          throw new ConflictException("Receipt item allocations do not match its bill allocations. No reversal was applied.");
        }
      }
      if (payment.transaction && !payment.transaction.amount.eq(payment.amount)) {
        throw new ConflictException("The receipt and its accounting entry have different amounts. No reversal was applied.");
      }
      const billIds = [...billAmounts.keys()].sort();
      if (billIds.length) {
        await tx.$executeRaw`
          SELECT id FROM bills
          WHERE "schoolId" = ${schoolId} AND id IN (${Prisma.join(billIds)})
          ORDER BY id ASC FOR UPDATE
        `;
      }
      const bills = await tx.bill.findMany({
        where: { schoolId, id: { in: billIds } },
        include: { items: true },
      });
      const billsById = new Map(bills.map((bill) => [bill.id, bill]));

      const itemAmounts = new Map<string, Prisma.Decimal>();
      for (const allocation of payment.paymentItems) {
        itemAmounts.set(
          allocation.billItem.id,
          (itemAmounts.get(allocation.billItem.id) ?? new Prisma.Decimal(0)).plus(allocation.amount),
        );
      }
      for (const [billItemId, allocatedAmount] of itemAmounts) {
        const item = await tx.billItem.findFirst({
          where: { id: billItemId, bill: { schoolId, studentId: payment.studentId } },
        });
        if (!item) throw new ConflictException("The original bill-item allocation is missing. No reversal was applied.");
        if (item.paidAmount.lt(allocatedAmount)) {
          throw new ConflictException("Bill item has less paid value than the receipt being reversed.");
        }
        const nextPaid = item.paidAmount.minus(allocatedAmount);
        const netTotal = item.totalAmount.minus(item.discountAmount);
        if (item.balanceAmount.plus(allocatedAmount).gt(netTotal)) {
          throw new ConflictException("Reversal would exceed the bill item's net amount.");
        }
        const nextBalance = item.balanceAmount.plus(allocatedAmount);
        await tx.billItem.update({
          where: { id: item.id },
          data: {
            paidAmount: nextPaid,
            balanceAmount: nextBalance,
            status: nextPaid.eq(0) ? "UNPAID" : nextBalance.eq(0) ? "FULLY_PAID" : "PARTIALLY_PAID",
          },
        });
      }
      for (const [billId, allocatedAmount] of billAmounts) {
        const bill = billsById.get(billId);
        if (!bill) throw new ConflictException("The original bill allocation is missing. No reversal was applied.");
        if (bill.paidAmount.lt(allocatedAmount)) {
          throw new ConflictException("Bill has less paid value than the receipt being reversed.");
        }
        const paid = bill.paidAmount.minus(allocatedAmount);
        if (bill.balanceAmount.plus(allocatedAmount).gt(bill.totalAmount)) {
          throw new ConflictException("Reversal would exceed the billed amount.");
        }
        const balance = bill.balanceAmount.plus(allocatedAmount);
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
      const remainingBalance = await tx.bill.aggregate({
        where: { schoolId, studentId: payment.studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
        _sum: { balanceAmount: true },
      });
      await tx.student.update({
        where: { id: payment.studentId },
        data: { outstandingBalance: remainingBalance._sum.balanceAmount ?? new Prisma.Decimal(0) },
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

  private async resolveAcademicFilter(schoolId: string, yearId?: string, termId?: string) {
    let resolvedYearId = yearId;
    if (resolvedYearId) {
      const year = await this.prisma.client.academicYear.findFirst({
        where: { id: resolvedYearId, schoolId },
        select: { id: true },
      });
      if (!year) throw new BadRequestException("The selected academic year does not belong to this school.");
    }
    if (termId) {
      const term = await this.prisma.client.term.findFirst({
        where: {
          id: termId,
          academicYear: { schoolId },
          ...(resolvedYearId ? { academicYearId: resolvedYearId } : {}),
        },
        select: { id: true, academicYearId: true },
      });
      if (!term) throw new BadRequestException("The selected term does not belong to this school or academic year.");
      if (resolvedYearId && term.academicYearId !== resolvedYearId) {
        throw new BadRequestException("The selected term belongs to a different academic year.");
      }
      resolvedYearId ??= term.academicYearId;
    }
    return { yearId: resolvedYearId, termId };
  }

  async getArrearsPolicy(schoolId: string) {
    const school = await this.prisma.client.school.findFirst({
      where: { id: schoolId },
      select: { settings: true },
    });
    if (!school) throw new NotFoundException("School not found.");
    const settings = school.settings && typeof school.settings === "object" && !Array.isArray(school.settings)
      ? school.settings as Record<string, unknown>
      : {};
    const candidate = settings.arrearsPolicy;
    return { arrearsPolicy: candidate === "BLOCK_CLEARANCE_UNTIL_PAID" ? candidate : "SHOW_ONLY" as const };
  }

  async setArrearsPolicy(
    schoolId: string,
    actorId: string,
    arrearsPolicy: "SHOW_ONLY" | "BLOCK_CLEARANCE_UNTIL_PAID",
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const school = await tx.school.findFirst({ where: { id: schoolId }, select: { id: true, settings: true } });
      if (!school) throw new NotFoundException("School not found.");
      const previousSettings = school.settings && typeof school.settings === "object" && !Array.isArray(school.settings)
        ? school.settings as Record<string, unknown>
        : {};
      const previousPolicy = previousSettings.arrearsPolicy === "BLOCK_CLEARANCE_UNTIL_PAID"
        ? "BLOCK_CLEARANCE_UNTIL_PAID"
        : "SHOW_ONLY";
      const nextSettings = { ...previousSettings, arrearsPolicy };
      await tx.school.update({
        where: { id: schoolId },
        data: { settings: nextSettings as Prisma.InputJsonValue },
      });
      await this.writeAudit(tx, {
        actorId,
        schoolId,
        action: "UPDATE",
        entityType: "FINANCE_ARREARS_POLICY",
        entityId: schoolId,
        oldValues: { arrearsPolicy: previousPolicy },
        newValues: { arrearsPolicy },
      });
      return { arrearsPolicy };
    });
  }

  async getLateFeePolicy(schoolId: string) {
    const school = await this.prisma.client.school.findFirst({ where: { id: schoolId }, select: { settings: true } });
    if (!school) throw new NotFoundException("School not found.");
    const settings = school.settings && typeof school.settings === "object" && !Array.isArray(school.settings)
      ? school.settings as Record<string, unknown>
      : {};
    const stored = settings.lateFeePolicy && typeof settings.lateFeePolicy === "object" && !Array.isArray(settings.lateFeePolicy)
      ? settings.lateFeePolicy as Record<string, unknown>
      : {};
    const mode = stored.mode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
    let value = new Prisma.Decimal(0);
    try {
      value = new Prisma.Decimal(String(stored.value ?? "0.00"));
      if (!value.isFinite() || value.lt(0)) value = new Prisma.Decimal(0);
      if (mode === "PERCENTAGE" && value.gt(100)) value = new Prisma.Decimal(0);
    } catch {
      value = new Prisma.Decimal(0);
    }
    const rawGrace = Number.isInteger(stored.graceDays) ? Number(stored.graceDays) : 0;
    return {
      enabled: stored.enabled === true,
      mode,
      value: value.toFixed(2),
      graceDays: Math.min(3650, Math.max(0, rawGrace)),
    };
  }

  async setLateFeePolicy(
    schoolId: string,
    actorId: string,
    policy: { enabled: boolean; mode: "PERCENTAGE" | "FIXED"; value: string; graceDays: number },
  ) {
    const value = new Prisma.Decimal(policy.value);
    if (!value.isFinite() || value.lt(0) || value.decimalPlaces() > 2) {
      throw new BadRequestException("Late-fee value must be a non-negative amount with no more than two decimal places.");
    }
    if (policy.mode === "PERCENTAGE" && value.gt(100)) {
      throw new BadRequestException("A percentage late-fee rate cannot exceed 100 percent.");
    }
    if (!Number.isInteger(policy.graceDays) || policy.graceDays < 0 || policy.graceDays > 3650) {
      throw new BadRequestException("Grace days must be a whole number from 0 to 3650.");
    }
    return this.prisma.client.$transaction(async (tx) => {
      const school = await tx.school.findFirst({ where: { id: schoolId }, select: { id: true, settings: true } });
      if (!school) throw new NotFoundException("School not found.");
      const settings = school.settings && typeof school.settings === "object" && !Array.isArray(school.settings)
        ? school.settings as Record<string, unknown>
        : {};
      const old = settings.lateFeePolicy ?? { enabled: false, mode: "FIXED", value: "0.00", graceDays: 0 };
      const saved = {
        enabled: policy.enabled,
        mode: policy.mode,
        value: value.toFixed(2),
        graceDays: policy.graceDays,
      };
      await tx.school.update({
        where: { id: schoolId },
        data: { settings: { ...settings, lateFeePolicy: saved } as Prisma.InputJsonValue },
      });
      await this.writeAudit(tx, {
        actorId, schoolId, action: "UPDATE", entityType: "FINANCE_LATE_FEE_POLICY", entityId: schoolId,
        oldValues: { lateFeePolicy: old },
        newValues: { lateFeePolicy: saved },
      });
      return saved;
    });
  }

  /**
   * Reconstruct receivables as of a UTC calendar date from dated invoices,
   * receipt allocations and dated voids/refunds. Never use today's bill.balanceAmount
   * as a historical balance. Historical cancellation/waiver timing is not present
   * in legacy records; exclude those invoices from authoritative totals and flag
   * the report as incomplete instead of silently backdating adjustments.
   */
  async getHistoricalReceivables(schoolId: string, asOfDate: string) {
    const start = parseIsoDate(asOfDate, "as-of date");
    if (!start || start.toISOString().slice(0, 10) !== asOfDate) {
      throw new BadRequestException("Provide a valid as-of date (YYYY-MM-DD).");
    }
    const today = new Date();
    const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 23, 59, 59, 999));
    if (end > todayEnd) throw new BadRequestException("Historical receivables cannot be calculated for a future date.");

    const [bills, payments] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: { schoolId, issuedAt: { lte: end } },
        orderBy: [{ studentId: "asc" }, { issuedAt: "asc" }, { id: "asc" }],
        select: {
          id: true, studentId: true, billNumber: true, issuedAt: true,
          dueDate: true, totalAmount: true, discountAmount: true, status: true,
          student: { select: { admissionNumber: true } },
        },
      }),
      this.prisma.client.payment.findMany({
        where: { schoolId, paymentDate: { lte: end } },
        select: {
          id: true, studentId: true, billId: true, paymentNumber: true,
          paymentDate: true, reversedAt: true, status: true, amount: true,
          billAllocations: { select: { billId: true, amount: true } },
          paymentItems: { select: { amount: true, billItem: { select: { billId: true } } } },
        },
      }),
    ]);

    const zero = () => new Prisma.Decimal(0);
    const byBill = new Map(bills.map((bill) => [bill.id, {
      bill,
      applied: zero(),
    }]));
    const exceptions: Array<{ reference: string; issue: string }> = [];
    for (const bill of bills) {
      if (bill.status === "CANCELLED" || bill.status === "WAIVED") {
        exceptions.push({
          reference: bill.billNumber,
          issue: "The original cancellation/waiver effective date is not recorded; historical balance needs an adjustment posting.",
        });
      }
    }

    for (const payment of payments) {
      // Reversal is a dated positive event; later reversals do not rewrite history.
      const activeAtCutoff = payment.status === "COMPLETED" ||
        (payment.reversedAt !== null && payment.reversedAt > end);
      if (!activeAtCutoff) continue;
      const allocated = new Map<string, Prisma.Decimal>();
      if (payment.billAllocations.length) {
        for (const row of payment.billAllocations) {
          allocated.set(row.billId, (allocated.get(row.billId) ?? zero()).plus(row.amount));
        }
      } else if (payment.paymentItems.length) {
        for (const row of payment.paymentItems) {
          allocated.set(row.billItem.billId, (allocated.get(row.billItem.billId) ?? zero()).plus(row.amount));
        }
      } else if (payment.billId) {
        allocated.set(payment.billId, payment.amount);
      }
      const allocatedTotal = [...allocated.values()].reduce((sum, value) => sum.plus(value), zero());
      if (!allocatedTotal.eq(payment.amount)) {
        exceptions.push({ reference: payment.paymentNumber, issue: "Receipt amount does not equal its saved invoice allocations." });
        continue;
      }
      for (const [billId, value] of allocated) {
        const entry = byBill.get(billId);
        if (!entry || entry.bill.studentId !== payment.studentId) {
          exceptions.push({ reference: payment.paymentNumber, issue: "Receipt allocation references an unavailable or different student's invoice." });
          continue;
        }
        entry.applied = entry.applied.plus(value);
      }
    }

    const asOfDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const ageing = { notDue: zero(), days0To30: zero(), days31To60: zero(), days61To90: zero(), days90Plus: zero() };
    const byStudent = new Map<string, { studentId: string; admissionNumber: string | null; total: Prisma.Decimal; invoices: number }>();
    const rows: Array<{ billId: string; billNumber: string; studentId: string; admissionNumber: string | null; issuedAt: string; dueDate: string | null; billed: string; collected: string; outstanding: string; daysOverdue: number | null }> = [];
    let billedTotal = zero();
    let appliedTotal = zero();
    let outstanding = zero();
    for (const { bill, applied } of byBill.values()) {
      if (["CANCELLED", "WAIVED"].includes(bill.status)) continue;
      const due = bill.dueDate ? daysPastDue(bill.dueDate, asOfDay) : null;
      const balance = bill.totalAmount.minus(applied);
      if (balance.lt(0)) {
        exceptions.push({ reference: bill.billNumber, issue: "Historical allocations exceed the invoice's net amount." });
        continue;
      }
      billedTotal = billedTotal.plus(bill.totalAmount);
      appliedTotal = appliedTotal.plus(applied);
      outstanding = outstanding.plus(balance);
      if (balance.gt(0)) {
        if (due === null || due <= 0) ageing.notDue = ageing.notDue.plus(balance);
        else if (due <= 30) ageing.days0To30 = ageing.days0To30.plus(balance);
        else if (due <= 60) ageing.days31To60 = ageing.days31To60.plus(balance);
        else if (due <= 90) ageing.days61To90 = ageing.days61To90.plus(balance);
        else ageing.days90Plus = ageing.days90Plus.plus(balance);
      }
      const student = byStudent.get(bill.studentId) ?? {
        studentId: bill.studentId,
        admissionNumber: bill.student.admissionNumber,
        total: zero(),
        invoices: 0,
      };
      student.total = student.total.plus(balance);
      student.invoices += 1;
      byStudent.set(bill.studentId, student);
      rows.push({
        billId: bill.id, billNumber: bill.billNumber, studentId: bill.studentId,
        admissionNumber: bill.student.admissionNumber,
        issuedAt: bill.issuedAt.toISOString().slice(0, 10),
        dueDate: bill.dueDate?.toISOString().slice(0, 10) ?? null,
        billed: bill.totalAmount.toFixed(2), collected: applied.toFixed(2),
        outstanding: balance.toFixed(2), daysOverdue: due,
      });
    }
    const bucketTotal = Object.values(ageing).reduce((sum, value) => sum.plus(value), zero());
    if (!bucketTotal.eq(outstanding)) {
      exceptions.push({ reference: "AGEING", issue: "Historical ageing buckets do not reconcile to outstanding invoices." });
    }
    return {
      asOf: asOfDate,
      basis: "DATED_INVOICE_RECEIPT_REVERSAL_EVENTS" as const,
      complete: exceptions.length === 0,
      warning: exceptions.length
        ? "Historical totals are provisional because some source events cannot be reliably reconstructed. Do not use for audited closing balances."
        : null,
      billed: billedTotal.toFixed(2),
      collected: appliedTotal.toFixed(2),
      outstanding: outstanding.toFixed(2),
      ageing: Object.fromEntries(Object.entries(ageing).map(([key, amount]) => [key, amount.toFixed(2)])),
      exceptions,
      students: [...byStudent.values()].map((entry) => ({
        studentId: entry.studentId, admissionNumber: entry.admissionNumber,
        balance: entry.total.toFixed(2), invoiceCount: entry.invoices,
      })),
      invoices: rows,
    };
  }

  async getTermEndReview(schoolId: string, yearId: string, termId: string) {
    if (!yearId || !termId) throw new BadRequestException("Choose an academic year and term for the term-end review.");
    const term = await this.prisma.client.term.findFirst({
      where: { id: termId, academicYearId: yearId, academicYear: { schoolId } },
      select: { id: true, name: true, startDate: true, academicYear: { select: { id: true, name: true } } },
    });
    if (!term) throw new BadRequestException("The selected term does not belong to this school and academic year.");

    const bills = await this.prisma.client.bill.findMany({
      where: {
        schoolId,
        status: { notIn: ["CANCELLED", "WAIVED"] },
        balanceAmount: { gt: new Prisma.Decimal(0) },
        AND: [{
          OR: [
            { term: { startDate: { lt: term.startDate } } },
            { termId: null, academicYear: { startDate: { lt: term.startDate } } },
          ],
        }],
      },
      orderBy: [{ studentId: "asc" }, { issuedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        billNumber: true,
        issuedAt: true,
        dueDate: true,
        balanceAmount: true,
        academicYear: { select: { id: true, name: true, startDate: true } },
        term: { select: { id: true, name: true, startDate: true } },
        student: {
          select: {
            id: true,
            admissionNumber: true,
            status: true,
            profile: { select: { firstName: true, otherNames: true, lastName: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    });
    const grouped = new Map<string, {
      studentId: string;
      admissionNumber: string | null;
      name: string;
      studentStatus: string;
      className: string | null;
      formerStudent: boolean;
      totalArrears: Prisma.Decimal;
      bills: Array<{ billId: string; billNumber: string; academicYear: string; term: string | null; dueDate: string | null; balance: string; issuedAt: string }>;
    }>();
    for (const bill of bills) {
      const student = bill.student;
      const existing = grouped.get(student.id) ?? {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        name: [student.profile.firstName, student.profile.otherNames, student.profile.lastName].filter(Boolean).join(" ").trim() || student.admissionNumber || "Student",
        studentStatus: student.status,
        className: student.class?.name ?? null,
        formerStudent: student.status !== "ACTIVE",
        totalArrears: new Prisma.Decimal(0),
        bills: [],
      };
      existing.totalArrears = existing.totalArrears.plus(bill.balanceAmount);
      existing.bills.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        academicYear: bill.academicYear.name,
        term: bill.term?.name ?? null,
        dueDate: bill.dueDate?.toISOString().slice(0, 10) ?? null,
        balance: bill.balanceAmount.toFixed(2),
        issuedAt: bill.issuedAt.toISOString().slice(0, 10),
      });
      grouped.set(student.id, existing);
    }
    const students = [...grouped.values()]
      .sort((a, b) => b.totalArrears.comparedTo(a.totalArrears) || a.name.localeCompare(b.name))
      .map(({ totalArrears, ...student }) => ({ ...student, totalArrears: totalArrears.toFixed(2) }));
    return {
      target: { yearId: term.academicYear.id, academicYear: term.academicYear.name, termId: term.id, term: term.name, startDate: term.startDate.toISOString().slice(0, 10) },
      studentCount: students.length,
      totalArrears: students.reduce((sum, student) => sum.plus(student.totalArrears), new Prisma.Decimal(0)).toFixed(2),
      students,
    };
  }

  async getFormerStudentsWithBalances(schoolId: string) {
    const bills = await this.prisma.client.bill.findMany({
      where: {
        schoolId,
        status: { notIn: ["CANCELLED", "WAIVED"] },
        balanceAmount: { gt: new Prisma.Decimal(0) },
        student: { schoolId, status: { not: "ACTIVE" }, deletedAt: null },
      },
      orderBy: [{ studentId: "asc" }, { issuedAt: "asc" }, { id: "asc" }],
      select: {
        id: true, billNumber: true, issuedAt: true, dueDate: true, balanceAmount: true,
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        student: {
          select: {
            id: true, admissionNumber: true, status: true,
            profile: { select: { firstName: true, otherNames: true, lastName: true } },
            class: { select: { name: true } },
          },
        },
      },
    });
    const grouped = new Map<string, { studentId: string; admissionNumber: string | null; name: string; status: string; className: string | null; totalBalance: Prisma.Decimal; bills: Array<{ billNumber: string; academicYear: string; term: string | null; balance: string; dueDate: string | null }> }>();
    for (const bill of bills) {
      const s = bill.student;
      const row = grouped.get(s.id) ?? {
        studentId: s.id,
        admissionNumber: s.admissionNumber,
        name: [s.profile.firstName, s.profile.otherNames, s.profile.lastName].filter(Boolean).join(" ").trim() || s.admissionNumber || "Student",
        status: s.status,
        className: s.class?.name ?? null,
        totalBalance: new Prisma.Decimal(0),
        bills: [],
      };
      row.totalBalance = row.totalBalance.plus(bill.balanceAmount);
      row.bills.push({
        billNumber: bill.billNumber,
        academicYear: bill.academicYear.name,
        term: bill.term?.name ?? null,
        balance: bill.balanceAmount.toFixed(2),
        dueDate: bill.dueDate?.toISOString().slice(0, 10) ?? null,
      });
      grouped.set(s.id, row);
    }
    return [...grouped.values()]
      .sort((a, b) => b.totalBalance.comparedTo(a.totalBalance) || a.name.localeCompare(b.name))
      .map(({ totalBalance, ...row }) => ({ ...row, totalBalance: totalBalance.toFixed(2) }));
  }

  async markFormerStudents(
    schoolId: string,
    actorId: string,
    studentIds: string[],
    reason: string,
  ) {
    const uniqueIds = [...new Set(studentIds)];
    if (uniqueIds.length === 0 || uniqueIds.length > 200) {
      throw new BadRequestException("Select between 1 and 200 students to mark as former students.");
    }
    if (reason.trim().length < 10) throw new BadRequestException("Provide a reason of at least 10 characters.");

    return this.prisma.client.$transaction(async (tx) => {
      const students = await tx.student.findMany({
        where: { schoolId, id: { in: uniqueIds }, deletedAt: null },
        select: { id: true, admissionNumber: true, status: true },
      });
      if (students.length !== uniqueIds.length) {
        throw new NotFoundException("One or more selected students do not belong to this school.");
      }
      const studentsWithArrears = await tx.bill.groupBy({
        by: ["studentId"],
        where: {
          schoolId,
          studentId: { in: uniqueIds },
          status: { notIn: ["CANCELLED", "WAIVED"] },
          balanceAmount: { gt: new Prisma.Decimal(0) },
        },
        _sum: { balanceAmount: true },
      });
      const hasOpenArrears = new Set(studentsWithArrears.filter((row) => (row._sum.balanceAmount ?? new Prisma.Decimal(0)).gt(0)).map((row) => row.studentId));
      if (uniqueIds.some((studentId) => !hasOpenArrears.has(studentId))) {
        throw new BadRequestException("Only students with outstanding bills may be marked as former in the term-end review.");
      }
      const updated: string[] = [];
      for (const student of students) {
        if (student.status !== "ACTIVE") continue;
        await tx.student.update({ where: { id: student.id }, data: { status: "WITHDRAWN" } });
        await this.writeAudit(tx, {
          actorId,
          schoolId,
          action: "STUDENT_MARKED_FORMER_WITH_ARREARS",
          entityType: "STUDENT",
          entityId: student.id,
          oldValues: { status: student.status },
          newValues: { status: "WITHDRAWN", reason: reason.trim(), admissionNumber: student.admissionNumber },
        });
        updated.push(student.id);
      }
      return { updatedCount: updated.length, studentIds: updated, status: "WITHDRAWN" as const };
    });
  }

  /**
   * Journal-only trial balance for the existing double-entry transaction table.
   * This is deliberately NOT labelled an accrual-basis set of accounts:
   * historical invoice receivables and opening balances have not been posted.
   */
  async getJournalTrialBalance(schoolId: string, asOfDate?: string) {
    const parsed = asOfDate ? parseIsoDate(asOfDate, "as-of date", true) : null;
    if (asOfDate && !parsed) throw new BadRequestException("Enter a valid as-of date.");
    const today = new Date();
    const cutoff = parsed ?? today;
    if (cutoff.getTime() > today.getTime() && asOfDate !== today.toISOString().slice(0, 10)) {
      throw new BadRequestException("Trial balance date cannot be in the future.");
    }
    const [accounts, postings] = await Promise.all([
      this.prisma.client.chartAccount.findMany({
        where: { schoolId },
        select: { id: true, code: true, name: true, accountType: true, balance: true, isActive: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
      }),
      this.prisma.client.$queryRaw<Array<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>>(Prisma.sql`
        SELECT movements."accountId",
          COALESCE(SUM(movements.debit), 0)::numeric AS "debit",
          COALESCE(SUM(movements.credit), 0)::numeric AS "credit"
        FROM (
          SELECT t."debitAccountId" AS "accountId", t.amount AS debit, 0::numeric AS credit
          FROM transactions t WHERE t."schoolId" = ${schoolId} AND t."transactionDate" <= ${cutoff}
          UNION ALL
          SELECT t."creditAccountId" AS "accountId", 0::numeric AS debit, t.amount AS credit
          FROM transactions t WHERE t."schoolId" = ${schoolId} AND t."transactionDate" <= ${cutoff}
        ) movements GROUP BY movements."accountId"
      `),
    ]);
    const zero = new Prisma.Decimal(0);
    const postingMap = new Map(postings.map((row) => [row.accountId, row]));
    let totalDebits = zero;
    let totalCredits = zero;
    const rows = accounts.map((account) => {
      const posting = postingMap.get(account.id);
      const debitMovement = posting?.debit ?? zero;
      const creditMovement = posting?.credit ?? zero;
      const net = debitMovement.minus(creditMovement);
      const debit = Prisma.Decimal.max(net, zero);
      const credit = Prisma.Decimal.max(net.negated(), zero);
      const naturalBalance = ["ASSET", "EXPENSE"].includes(account.accountType)
        ? net : net.negated();
      const discrepancy = account.balance.minus(naturalBalance);
      totalDebits = totalDebits.plus(debit);
      totalCredits = totalCredits.plus(credit);
      return {
        accountId: account.id, code: account.code, name: account.name,
        accountType: account.accountType, isActive: account.isActive,
        debit: debit.toFixed(2), credit: credit.toFixed(2),
        postedBalance: naturalBalance.toFixed(2),
        cachedBalance: account.balance.toFixed(2),
        discrepancy: discrepancy.toFixed(2),
      };
    });
    const orphanAccounts = postings.filter((row) => !accounts.some((account) => account.id === row.accountId));
    const differences = rows.filter((row) => row.discrepancy !== "0.00");
    const journalDifference = totalDebits.minus(totalCredits);
    return {
      asOf: cutoff.toISOString().slice(0, 10),
      basis: "POSTED_JOURNAL_ONLY" as const,
      accrualComplete: false,
      warning: "This trial balance covers posted journal transactions only. Legacy student receivables, deferred tuition income and opening balances have not been backfilled. Cached chart balances are present-day values, so differences against an earlier as-of date may be expected.",
      totalDebits: totalDebits.toFixed(2),
      totalCredits: totalCredits.toFixed(2),
      difference: journalDifference.toFixed(2),
      balanced: journalDifference.eq(0) && orphanAccounts.length === 0,
      cachedAccountMismatchCount: asOfDate ? null : differences.length,
      orphanAccountCount: orphanAccounts.length,
      accounts: rows,
    };
  }

  async getFinanceSummary(
    schoolId: string,
    query: Pick<FinanceListQuery, "from" | "to" | "yearId" | "termId"> = {},
  ) {
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);
    const { yearId, termId } = await this.resolveAcademicFilter(schoolId, query.yearId, query.termId);
    const academicYear = yearId
      ? await this.prisma.client.academicYear.findFirst({
          where: { id: yearId, schoolId },
          select: { startDate: true, endDate: true },
        })
      : null;
    const term = termId
      ? await this.prisma.client.term.findFirst({
          where: { id: termId, academicYear: { schoolId } },
          select: { startDate: true, endDate: true },
        })
      : null;
    const periodStart = term?.startDate ?? academicYear?.startDate ?? null;
    const periodEnd = term?.endDate ?? academicYear?.endDate ?? null;
    if ((yearId || termId) && (!periodStart || !periodEnd)) {
      throw new BadRequestException("The selected academic period needs valid start and end dates before financial reporting.");
    }
    const requestedFrom = parseIsoDate(query.from, "start date");
    const fromDate = periodStart && requestedFrom
      ? new Date(Math.max(periodStart.getTime(), requestedFrom.getTime()))
      : requestedFrom ?? periodStart ?? undefined;
    const requestedTo = parseIsoDate(query.to, "end date", true);
    const selectedEnd = periodEnd
      ? new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate(), 23, 59, 59, 999))
      : null;
    const toDate = new Date(Math.min(
      requestedTo?.getTime() ?? Number.POSITIVE_INFINITY,
      selectedEnd?.getTime() ?? Number.POSITIVE_INFINITY,
      today.getTime(),
    ));
    if (Number.isNaN(toDate.getTime()) || (fromDate && fromDate > toDate)) {
      throw new BadRequestException("The reporting period has no dates on or before today.");
    }
    // Receivables are stored as CURRENT balances. A prior report end cannot
    // be presented as a historical balance snapshot without reconstructing
    // invoice/payment/reversal events. Keep the balance date explicit.
    const asOf = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const effectiveFrom = fromDate?.toISOString().slice(0, 10) ?? null;
    const effectiveTo = toDate.toISOString().slice(0, 10);
    const issuedAt: Prisma.DateTimeFilter = {};
    if (fromDate) issuedAt.gte = fromDate;
    issuedAt.lte = toDate;
    const paymentDate: Prisma.DateTimeFilter = {};
    if (fromDate) paymentDate.gte = fromDate;
    paymentDate.lte = toDate;

    const activeBillFilter: Prisma.BillWhereInput = {
      schoolId,
      status: { notIn: ["CANCELLED", "WAIVED"] },
    };
    const billedWhere: Prisma.BillWhereInput = {
      ...activeBillFilter,
      issuedAt,
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(termId ? { termId } : {}),
    };
    // Outstanding and ageing are point-in-time receivables. Earlier-term debt
    // remains visible when the report is scoped to a newer academic term.
    const openWhere: Prisma.BillWhereInput = {
      ...activeBillFilter,
      balanceAmount: { gt: new Prisma.Decimal(0) },
    };
    const overdueWhere: Prisma.BillWhereInput = {
      ...openWhere,
      dueDate: { lt: asOf },
    };
    const collectedWhere: Prisma.PaymentWhereInput = { schoolId, status: "COMPLETED", paymentDate };

    const [billedAgg, openAgg, overdueAgg, billedClasses, openClasses, classes] = await Promise.all([
      this.prisma.client.bill.aggregate({ where: billedWhere, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.prisma.client.bill.aggregate({ where: openWhere, _sum: { balanceAmount: true }, _count: { _all: true } }),
      this.prisma.client.bill.aggregate({ where: overdueWhere, _sum: { balanceAmount: true }, _count: { _all: true } }),
      this.prisma.client.bill.groupBy({
        by: ["classId"], where: billedWhere, _sum: { totalAmount: true }, _count: { _all: true },
      }),
      this.prisma.client.bill.groupBy({
        by: ["classId"], where: openWhere, _sum: { balanceAmount: true }, _count: { _all: true },
      }),
      this.prisma.client.class.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);

    let collected = new Prisma.Decimal(0);
    let receiptCount = 0;
    let paidMethods: Array<{ paymentMethod: (typeof PAYMENT_METHODS)[number]; amount: Prisma.Decimal; receiptCount: number }> = [];
    if (yearId || termId) {
      // A receipt may clear several bills, possibly in different terms. Count
      // only the portion allocated to the selected academic context.
      const allocationFilters: Prisma.Sql[] = [
        Prisma.sql`p."schoolId" = ${schoolId}`,
        Prisma.sql`b."schoolId" = ${schoolId}`,
        Prisma.sql`p."status" = 'COMPLETED'`,
        Prisma.sql`p."paymentDate" <= ${toDate}`,
      ];
      if (fromDate) allocationFilters.push(Prisma.sql`p."paymentDate" >= ${fromDate}`);
      if (yearId) allocationFilters.push(Prisma.sql`b."academicYearId" = ${yearId}`);
      if (termId) allocationFilters.push(Prisma.sql`b."termId" = ${termId}`);
      const [totals, methods] = await Promise.all([
        this.prisma.client.$queryRaw<Array<{ amount: Prisma.Decimal; receiptCount: number }>>(
          Prisma.sql`
            SELECT COALESCE(SUM(pba."amount"), 0)::numeric AS "amount",
                   COUNT(DISTINCT p."id")::int AS "receiptCount"
            FROM "payment_bill_allocations" pba
            INNER JOIN "payments" p ON p."id" = pba."paymentId"
            INNER JOIN "bills" b ON b."id" = pba."billId"
            WHERE ${Prisma.join(allocationFilters, " AND ")}
          `,
        ),
        this.prisma.client.$queryRaw<Array<{ method: (typeof PAYMENT_METHODS)[number]; amount: Prisma.Decimal; receiptCount: number }>>(
          Prisma.sql`
            SELECT p."paymentMethod" AS "method",
                   COALESCE(SUM(pba."amount"), 0)::numeric AS "amount",
                   COUNT(DISTINCT p."id")::int AS "receiptCount"
            FROM "payment_bill_allocations" pba
            INNER JOIN "payments" p ON p."id" = pba."paymentId"
            INNER JOIN "bills" b ON b."id" = pba."billId"
            WHERE ${Prisma.join(allocationFilters, " AND ")}
            GROUP BY p."paymentMethod"
          `,
        ),
      ]);
      collected = totals[0]?.amount ?? new Prisma.Decimal(0);
      receiptCount = totals[0]?.receiptCount ?? 0;
      paidMethods = methods.map((row) => ({ paymentMethod: row.method, amount: row.amount, receiptCount: row.receiptCount }));
    } else {
      const [collectedAgg, methods] = await Promise.all([
        this.prisma.client.payment.aggregate({ where: collectedWhere, _sum: { amount: true }, _count: { _all: true } }),
        this.prisma.client.payment.groupBy({
          by: ["paymentMethod"], where: collectedWhere, _sum: { amount: true }, _count: { _all: true },
        }),
      ]);
      collected = collectedAgg._sum.amount ?? new Prisma.Decimal(0);
      receiptCount = collectedAgg._count._all;
      paidMethods = methods.map((row) => ({
        paymentMethod: row.paymentMethod,
        amount: row._sum.amount ?? new Prisma.Decimal(0),
        receiptCount: row._count._all,
      }));
    }

    const ageingRanges = [
      { key: "days0To30", from: addUtcDays(asOf, -30), to: asOf },
      { key: "days31To60", from: addUtcDays(asOf, -60), to: addUtcDays(asOf, -30) },
      { key: "days61To90", from: addUtcDays(asOf, -90), to: addUtcDays(asOf, -60) },
      { key: "days90Plus", from: null, to: addUtcDays(asOf, -90) },
    ] as const;
    const [ageingResults, notDueAgg] = await Promise.all([
      Promise.all(ageingRanges.map((range) => this.prisma.client.bill.aggregate({
        where: {
          ...openWhere,
          dueDate: { lt: range.to, ...(range.from ? { gte: range.from } : {}) },
        },
        _sum: { balanceAmount: true },
      }))),
      this.prisma.client.bill.aggregate({
        where: { ...openWhere, OR: [{ dueDate: null }, { dueDate: { gte: asOf } }] },
        _sum: { balanceAmount: true },
      }),
    ]);

    // Reconcile live invoice-level, student-level and allocation balances.
    // All computations are performed as PostgreSQL numeric / Prisma.Decimal.
    const [itemMismatchRows, studentMismatchRows, paymentMismatchRows, ledgerMismatchRows] = await Promise.all([
      this.prisma.client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "bills" b
        LEFT JOIN (
          SELECT bi."billId", COALESCE(SUM(bi."balanceAmount"), 0) AS balance
          FROM "bill_items" bi GROUP BY bi."billId"
        ) items ON items."billId" = b.id
        WHERE b."schoolId" = ${schoolId} AND b.status NOT IN ('CANCELLED', 'WAIVED')
          AND b."balanceAmount" <> COALESCE(items.balance, 0)
      `),
      this.prisma.client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "students" st
        LEFT JOIN (
          SELECT "studentId", COALESCE(SUM("balanceAmount"), 0) AS balance
          FROM "bills"
          WHERE "schoolId" = ${schoolId} AND status NOT IN ('CANCELLED', 'WAIVED')
          GROUP BY "studentId"
        ) invoices ON invoices."studentId" = st.id
        WHERE st."schoolId" = ${schoolId}
          AND st."outstandingBalance" <> COALESCE(invoices.balance, 0)
      `),
      this.prisma.client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "payments" p
        LEFT JOIN (
          SELECT "paymentId", COALESCE(SUM(amount), 0) AS allocated
          FROM "payment_bill_allocations" GROUP BY "paymentId"
        ) allocations ON allocations."paymentId" = p.id
        WHERE p."schoolId" = ${schoolId} AND p.status = 'COMPLETED'
          AND p.amount <> COALESCE(allocations.allocated, 0)
      `),
      this.prisma.client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "payments" p
        LEFT JOIN "transactions" t ON t.id = p."transactionId" AND t."schoolId" = p."schoolId"
        WHERE p."schoolId" = ${schoolId} AND p.status = 'COMPLETED'
          AND (p."transactionId" IS NULL OR t.id IS NULL OR t.amount <> p.amount)
      `),
    ]);
    const reconciliation = {
      invoiceItemMismatchCount: Number(itemMismatchRows[0]?.count ?? 0n),
      studentBalanceMismatchCount: Number(studentMismatchRows[0]?.count ?? 0n),
      receiptAllocationMismatchCount: Number(paymentMismatchRows[0]?.count ?? 0n),
      ledgerMismatchCount: Number(ledgerMismatchRows[0]?.count ?? 0n),
    };

    const classCollectionFilters: Prisma.Sql[] = [
      Prisma.sql`p."schoolId" = ${schoolId}`,
      Prisma.sql`b."schoolId" = ${schoolId}`,
      Prisma.sql`p."status" = 'COMPLETED'`,
      Prisma.sql`p."paymentDate" <= ${toDate}`,
    ];
    if (fromDate) classCollectionFilters.push(Prisma.sql`p."paymentDate" >= ${fromDate}`);
    if (yearId) classCollectionFilters.push(Prisma.sql`b."academicYearId" = ${yearId}`);
    if (termId) classCollectionFilters.push(Prisma.sql`b."termId" = ${termId}`);
    const classCollections = await this.prisma.client.$queryRaw<Array<{ classId: string | null; collected: Prisma.Decimal }>>(
      Prisma.sql`
        SELECT b."classId" AS "classId", COALESCE(SUM(pba."amount"), 0)::numeric AS "collected"
        FROM "payment_bill_allocations" pba
        INNER JOIN "bills" b ON b."id" = pba."billId"
        INNER JOIN "payments" p ON p."id" = pba."paymentId"
        WHERE ${Prisma.join(classCollectionFilters, " AND ")}
        GROUP BY b."classId"
      `,
    );

    const classNames = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass.name]));
    const classTotals = new Map<string, { classId: string | null; className: string; billed: Prisma.Decimal; collected: Prisma.Decimal; outstanding: Prisma.Decimal; billCount: number }>();
    const keyFor = (classId: string | null) => classId ?? "__unassigned";
    for (const row of billedClasses) {
      const key = keyFor(row.classId);
      classTotals.set(key, {
        classId: row.classId,
        className: row.classId ? classNames.get(row.classId) ?? "Unrecognised class" : "Class not recorded",
        billed: row._sum.totalAmount ?? new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
        billCount: row._count._all,
      });
    }
    for (const row of openClasses) {
      const key = keyFor(row.classId);
      const entry = classTotals.get(key) ?? {
        classId: row.classId,
        className: row.classId ? classNames.get(row.classId) ?? "Unrecognised class" : "Class not recorded",
        billed: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
        billCount: 0,
      };
      entry.outstanding = row._sum.balanceAmount ?? new Prisma.Decimal(0);
      classTotals.set(key, entry);
    }
    for (const row of classCollections) {
      const key = keyFor(row.classId);
      const entry = classTotals.get(key) ?? {
        classId: row.classId,
        className: row.classId ? classNames.get(row.classId) ?? "Unrecognised class" : "Class not recorded",
        billed: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
        outstanding: new Prisma.Decimal(0),
        billCount: 0,
      };
      entry.collected = row.collected ?? new Prisma.Decimal(0);
      classTotals.set(key, entry);
    }

    const billed = billedAgg._sum.totalAmount ?? new Prisma.Decimal(0);
    const outstanding = openAgg._sum.balanceAmount ?? new Prisma.Decimal(0);
    const overdue = overdueAgg._sum.balanceAmount ?? new Prisma.Decimal(0);
    const collectionRate = billed.gt(0) ? collected.div(billed).mul(100).toDecimalPlaces(1).toFixed(1) : null;
    const ageing: Record<string, string> = {};
    ageingRanges.forEach((range, index) => { ageing[range.key] = moneyString(ageingResults[index]?._sum.balanceAmount); });
    ageing.notDue = moneyString(notDueAgg._sum.balanceAmount);
    const ageingTotal = Object.values(ageing).reduce(
      (total, value) => total.plus(new Prisma.Decimal(value)),
      new Prisma.Decimal(0),
    );
    const ageingDifference = outstanding.minus(ageingTotal);
    const ageingReconciled = ageingDifference.eq(0);
    const reconciliationStatus = ageingReconciled &&
      Object.values(reconciliation).every((count) => count === 0) ? "RECONCILED" : "DISCREPANCY";

    return {
      asOf: asOf.toISOString().slice(0, 10),
      period: { from: effectiveFrom, to: effectiveTo, yearId: yearId ?? null, termId: termId ?? null, basis: "ISSUE_AND_PAYMENT_DATE" },
      balanceAsOf: asOf.toISOString().slice(0, 10),
      balanceBasis: "CURRENT" as const,
      billed: moneyString(billed),
      billedCount: billedAgg._count._all,
      collected: moneyString(collected),
      receiptCount,
      outstanding: moneyString(outstanding),
      outstandingBillCount: openAgg._count._all,
      overdue: moneyString(overdue),
      overdueBillCount: overdueAgg._count._all,
      collectionRate,
      byMethod: paidMethods.map((row) => ({
        method: row.paymentMethod,
        amount: moneyString(row.amount),
        receiptCount: row.receiptCount,
      })),
      byClass: [...classTotals.values()]
        .sort((a, b) => b.billed.comparedTo(a.billed))
        .map((row) => ({
          classId: row.classId,
          className: row.className,
          billed: moneyString(row.billed),
          collected: moneyString(row.collected),
          outstanding: moneyString(row.outstanding),
          billCount: row.billCount,
        })),
      ageing,
      reconciliation: {
        ...reconciliation,
        ageingTotal: ageingTotal.toFixed(2),
        ageingDifference: ageingDifference.toFixed(2),
        ageingReconciled,
        status: reconciliationStatus,
      },
    };
  }

  async getStudentStatement(
    schoolId: string,
    studentId: string,
    role: string | undefined,
    query: StudentStatementQuery = {},
    guardianAuthorized = false,
  ): Promise<StudentStatementResponse> {
    const scope = query.scope ?? "term";
    if (!["term", "year", "all"].includes(scope)) throw new BadRequestException("Choose term, year or all-time statement scope.");

    const student = await this.prisma.client.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: {
        id: true,
        admissionNumber: true,
        profile: { select: { firstName: true, otherNames: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found.");

    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    let selectedYearId: string | undefined;
    let selectedTermId: string | undefined;
    let yearLabel: string | null = null;
    let termLabel: string | null = null;
    let periodStart: Date | undefined;
    let periodEnd: Date | undefined;

    if (scope === "term") {
      if (Boolean(query.yearId) !== Boolean(query.termId)) {
        throw new BadRequestException("Academic year and term must be supplied together.");
      }
      selectedYearId = query.yearId ?? currentYear?.id;
      selectedTermId = query.termId ?? currentTerm?.id;
      if (!selectedYearId || !selectedTermId) throw new BadRequestException("This school has not selected a current academic year and term.");
      const term = await this.prisma.client.term.findFirst({
        where: { id: selectedTermId, academicYearId: selectedYearId, academicYear: { schoolId } },
        include: { academicYear: { select: { id: true, name: true, startDate: true, endDate: true } } },
      });
      if (!term) throw new BadRequestException("Choose a term belonging to an academic year in this school.");
      if (!guardianAuthorized && !canManageAcademicContext(role) && (selectedYearId !== currentYear?.id || selectedTermId !== currentTerm?.id)) {
        throw new ForbiddenException("Only the current academic year and term are available for your role.");
      }
      yearLabel = term.academicYear.name;
      termLabel = term.name;
      periodStart = term.startDate;
      periodEnd = term.endDate;
    } else if (scope === "year") {
      if (!guardianAuthorized && !canManageAcademicContext(role)) throw new ForbiddenException("Only finance and school management roles may view a full-year statement.");
      selectedYearId = query.yearId ?? currentYear?.id;
      if (!selectedYearId) throw new BadRequestException("Choose an academic year.");
      const year = await this.prisma.client.academicYear.findFirst({
        where: { id: selectedYearId, schoolId },
        select: { id: true, name: true, startDate: true, endDate: true },
      });
      if (!year) throw new BadRequestException("The selected academic year does not belong to this school.");
      yearLabel = year.name;
      periodStart = year.startDate;
      periodEnd = year.endDate;
    } else {
      if (!guardianAuthorized && !canManageAcademicContext(role)) throw new ForbiddenException("Only finance and school management roles may view an all-time statement.");
    }

    const explicitFrom = parseIsoDate(query.from, "start date");
    const explicitToStart = parseIsoDate(query.to, "end date");
    const explicitTo = parseIsoDate(query.to, "end date", true);
    if (explicitFrom) periodStart = explicitFrom;
    if (explicitTo) periodEnd = explicitTo;
    if (periodStart && explicitToStart && periodStart > explicitToStart) {
      throw new BadRequestException("The statement start date must be on or before its end date.");
    }
    const maxDate = periodEnd ?? new Date();
    const minDate = periodStart;

    const [bills, payments, currentOpenBills] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: { schoolId, studentId, issuedAt: { lte: maxDate } },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        include: {
          academicYear: { select: { id: true, name: true } },
          term: { select: { id: true, name: true } },
          carryForwards: { orderBy: { createdAt: "asc" } },
        },
      }),
      this.prisma.client.payment.findMany({
        where: { schoolId, studentId, paymentDate: { lte: maxDate } },
        orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          bill: { select: { id: true, billNumber: true, academicYearId: true, termId: true, academicYear: { select: { name: true } }, term: { select: { name: true } } } },
          billAllocations: {
            include: {
              bill: { select: { id: true, billNumber: true, academicYearId: true, termId: true, academicYear: { select: { name: true } }, term: { select: { name: true } } } },
            },
          },
          paymentItems: {
            select: {
              amount: true,
              billItem: {
                select: {
                  billId: true,
                  bill: {
                    select: {
                      id: true,
                      billNumber: true,
                      academicYearId: true,
                      termId: true,
                      academicYear: { select: { name: true } },
                      term: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.client.bill.findMany({
        where: {
          schoolId,
          studentId,
          status: { notIn: ["CANCELLED", "WAIVED"] },
          balanceAmount: { gt: new Prisma.Decimal(0) },
        },
        select: { dueDate: true, balanceAmount: true },
      }),
    ]);

    const allEvents: StatementEvent[] = [];
    const billPeriod = new Map<string, { academicYearId: string; termId: string | null }>();
    for (const bill of bills) {
      billPeriod.set(bill.id, { academicYearId: bill.academicYearId, termId: bill.termId });
      const gross = bill.grossAmount.gt(0) ? bill.grossAmount : bill.totalAmount.plus(bill.discountAmount);
      allEvents.push({
        id: `${bill.id}:invoice`,
        date: bill.issuedAt.toISOString().slice(0, 10),
        type: "INVOICE",
        reference: bill.billNumber,
        description: `Invoice ${bill.billNumber}${bill.carryForwards.length ? " — includes a previous-balance snapshot (not a second charge)" : ""}`,
        academicYear: bill.academicYear.name,
        term: bill.term?.name ?? null,
        billId: bill.id,
        amount: gross,
      });
      if (bill.discountAmount.gt(0)) {
        allEvents.push({
          id: `${bill.id}:discount`,
          date: bill.issuedAt.toISOString().slice(0, 10),
          type: "DISCOUNT",
          reference: bill.billNumber,
          description: `Discount on invoice ${bill.billNumber}`,
          academicYear: bill.academicYear.name,
          term: bill.term?.name ?? null,
          billId: bill.id,
          amount: bill.discountAmount.negated(),
        });
      }
      if (["CANCELLED", "WAIVED"].includes(bill.status)) {
        allEvents.push({
          id: `${bill.id}:adjustment`,
          date: bill.issuedAt.toISOString().slice(0, 10),
          type: "ADJUSTMENT",
          reference: bill.billNumber,
          description: `${bill.status === "WAIVED" ? "Waiver" : "Cancellation"} of invoice ${bill.billNumber}`,
          academicYear: bill.academicYear.name,
          term: bill.term?.name ?? null,
          billId: bill.id,
          amount: bill.totalAmount.negated(),
        });
      }
    }

    let unallocatedCredit = new Prisma.Decimal(0);
    for (const payment of payments) {
      const paymentDate = payment.paymentDate.toISOString().slice(0, 10);
      const reversedBeforeEnd = payment.reversedAt !== null && payment.reversedAt <= maxDate;
      const reversedAfterEnd = payment.reversedAt !== null && payment.reversedAt > maxDate;
      const wasCompletedAtEnd = payment.status === "COMPLETED" || reversedAfterEnd;

      let paymentAllocations: Array<{
        billId: string;
        billNumber: string;
        amount: Prisma.Decimal;
        academicYearId: string;
        termId: string | null;
        academicYearName: string | null;
        termName: string | null;
      }> = payment.billAllocations.map((allocation) => ({
        billId: allocation.billId,
        billNumber: allocation.bill.billNumber,
        amount: allocation.amount,
        academicYearId: allocation.bill.academicYearId,
        termId: allocation.bill.termId,
        academicYearName: allocation.bill.academicYear?.name ?? null,
        termName: allocation.bill.term?.name ?? null,
      }));
      // Compatibility with pre-migration records: derive bill-level allocation
      // totals from item allocations, then from billId if no item rows exist.
      if (paymentAllocations.length === 0 && payment.paymentItems.length) {
        const grouped = new Map<string, { amount: Prisma.Decimal; bill: typeof payment.paymentItems[number]["billItem"]["bill"] }>();
        for (const item of payment.paymentItems) {
          const current = grouped.get(item.billItem.billId);
          grouped.set(item.billItem.billId, {
            amount: (current?.amount ?? new Prisma.Decimal(0)).plus(item.amount),
            bill: item.billItem.bill,
          });
        }
        paymentAllocations = [...grouped.entries()].map(([billId, row]) => ({
          billId,
          billNumber: row.bill.billNumber,
          amount: row.amount,
          academicYearId: row.bill.academicYearId,
          termId: row.bill.termId,
          academicYearName: row.bill.academicYear?.name ?? null,
          termName: row.bill.term?.name ?? null,
        }));
      }
      if (paymentAllocations.length === 0 && payment.bill) {
        paymentAllocations = [{
          billId: payment.bill.id,
          billNumber: payment.bill.billNumber,
          amount: payment.amount,
          academicYearId: payment.bill.academicYearId,
          termId: payment.bill.termId,
          academicYearName: payment.bill.academicYear?.name ?? null,
          termName: payment.bill.term?.name ?? null,
        }];
      }
      const applied = paymentAllocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
      if (wasCompletedAtEnd) {
        const unallocated = Prisma.Decimal.max(0, payment.amount.minus(applied));
        unallocatedCredit = unallocatedCredit.plus(unallocated);
      }

      if (wasCompletedAtEnd && applied.gt(0)) {
        for (const allocation of paymentAllocations) {
          allEvents.push({
            id: `${payment.id}:receipt:${allocation.billId}`,
            date: paymentDate,
            type: "RECEIPT",
            reference: payment.paymentNumber,
            description: `Receipt ${payment.paymentNumber} allocated to invoice ${allocation.billNumber}`,
            academicYear: allocation.academicYearName,
            term: allocation.termName,
            billId: allocation.billId,
            paymentId: payment.id,
            amount: allocation.amount.negated(),
          });
        }
      }
      if (payment.reversedAt && reversedBeforeEnd && applied.gt(0)) {
        for (const allocation of paymentAllocations) {
          allEvents.push({
            id: `${payment.id}:reversal:${allocation.billId}`,
            date: payment.reversedAt.toISOString().slice(0, 10),
            type: payment.status === "REFUNDED" ? "REFUND" : "REVERSAL",
            reference: payment.paymentNumber,
            description: `${payment.status === "REFUNDED" ? "Refund" : "Void"} of receipt ${payment.paymentNumber} against invoice ${allocation.billNumber}: ${payment.reversalReason ?? "No reason recorded"}`,
            academicYear: allocation.academicYearName,
            term: allocation.termName,
            billId: allocation.billId,
            paymentId: payment.id,
            amount: allocation.amount,
          });
        }
      }
    }

    const statementEnd = maxDate.getTime();
    const withinPeriod = (event: StatementEvent) => {
      const date = new Date(`${event.date}T00:00:00.000Z`);
      if (date.getTime() > statementEnd) return false;
      if (minDate && date < minDate) return false;
      if ((event.type === "INVOICE" || event.type === "DISCOUNT" || event.type === "ADJUSTMENT") && event.billId) {
        const bill = billPeriod.get(event.billId);
        if (scope === "term" && bill?.termId !== selectedTermId) return false;
        if (scope === "year" && bill?.academicYearId !== selectedYearId) return false;
      }
      return true;
    };
    const beforePeriod = minDate
      ? allEvents.filter((event) => new Date(`${event.date}T00:00:00.000Z`) < minDate)
      : [];
    const inPeriod = allEvents.filter((event) => withinPeriod(event));
    const openingBalance = buildRunningStatement(new Prisma.Decimal(0), beforePeriod).closingBalance;
    const calculated = buildRunningStatement(openingBalance, inPeriod);

    const today = new Date();
    const ageing = {
      days0To30: new Prisma.Decimal(0),
      days31To60: new Prisma.Decimal(0),
      days61To90: new Prisma.Decimal(0),
      days90Plus: new Prisma.Decimal(0),
      notDue: new Prisma.Decimal(0),
    };
    for (const bill of currentOpenBills) {
      if (!bill.dueDate) {
        ageing.notDue = ageing.notDue.plus(bill.balanceAmount);
        continue;
      }
      const overdueDays = daysPastDue(bill.dueDate, today);
      if (overdueDays <= 0) ageing.notDue = ageing.notDue.plus(bill.balanceAmount);
      else if (overdueDays <= 30) ageing.days0To30 = ageing.days0To30.plus(bill.balanceAmount);
      else if (overdueDays <= 60) ageing.days31To60 = ageing.days31To60.plus(bill.balanceAmount);
      else if (overdueDays <= 90) ageing.days61To90 = ageing.days61To90.plus(bill.balanceAmount);
      else ageing.days90Plus = ageing.days90Plus.plus(bill.balanceAmount);
    }

    const studentName = [student.profile.firstName, student.profile.otherNames, student.profile.lastName].filter(Boolean).join(" ").trim();
    return {
      student: { id: student.id, admissionNumber: student.admissionNumber, name: studentName || student.admissionNumber || "Student" },
      scope,
      period: {
        from: minDate?.toISOString().slice(0, 10) ?? null,
        to: periodEnd?.toISOString().slice(0, 10) ?? null,
        academicYear: yearLabel,
        term: termLabel,
      },
      openingBalance: openingBalance.toFixed(2),
      entries: calculated.entries,
      closingBalance: calculated.closingBalance.toFixed(2),
      ageing: {
        days0To30: ageing.days0To30.toFixed(2),
        days31To60: ageing.days31To60.toFixed(2),
        days61To90: ageing.days61To90.toFixed(2),
        days90Plus: ageing.days90Plus.toFixed(2),
        notDue: ageing.notDue.toFixed(2),
      },
      unallocatedCredit: unallocatedCredit.toFixed(2),
      dataSource: "bills_and_payments" as const,
    };
  }

  async listBills(schoolId: string, query: FinanceListQuery = {}) {
    const limit = clampPageSize(query.limit);
    const from = parseIsoDate(query.from, "start date");
    const toStart = parseIsoDate(query.to, "end date");
    const to = parseIsoDate(query.to, "end date", true);
    if (from && toStart && from > toStart) throw new BadRequestException("The start date must be on or before the end date.");
    if (query.status && !BILL_STATUSES.includes(query.status as (typeof BILL_STATUSES)[number])) {
      throw new BadRequestException("Choose a valid bill status.");
    }
    if (query.classId) {
      const schoolClass = await this.prisma.client.class.findFirst({ where: { id: query.classId, schoolId }, select: { id: true } });
      if (!schoolClass) throw new NotFoundException("Class not found in this school.");
    }
    const { yearId, termId } = await this.resolveAcademicFilter(schoolId, query.yearId, query.termId);
    const issuedAt: Prisma.DateTimeFilter = {};
    if (from) issuedAt.gte = from;
    if (to) issuedAt.lte = to;
    const asOfSource = toStart ?? new Date();
    const asOf = new Date(`${asOfSource.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const filters: Prisma.BillWhereInput[] = [];
    if (query.status) filters.push({ status: query.status as (typeof BILL_STATUSES)[number] });
    if (query.outstanding === "true" || query.overdue === "true") {
      filters.push({ balanceAmount: { gt: new Prisma.Decimal(0) }, status: { notIn: ["CANCELLED", "WAIVED"] } });
    }
    if (query.overdue === "true") filters.push({ dueDate: { lt: asOf } });
    if (query.search?.trim()) {
      const term = query.search.trim();
      filters.push({ OR: [
        { billNumber: { contains: term, mode: "insensitive" } },
        { student: { admissionNumber: { contains: term, mode: "insensitive" } } },
        { student: { profile: { firstName: { contains: term, mode: "insensitive" } } } },
        { student: { profile: { lastName: { contains: term, mode: "insensitive" } } } },
        { class: { name: { contains: term, mode: "insensitive" } } },
      ] });
    }
    const where: Prisma.BillWhereInput = {
      schoolId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(termId ? { termId } : {}),
      ...(from || to ? { issuedAt } : {}),
      ...(filters.length ? { AND: filters } : {}),
    };
    if (query.cursor) {
      const cursorRow = await this.prisma.client.bill.findFirst({ where: { id: query.cursor, schoolId }, select: { id: true } });
      if (!cursorRow) throw new BadRequestException("The bill page cursor is invalid for this school.");
    }
    const [rows, total] = await Promise.all([
      this.prisma.client.bill.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          class: { select: { id: true, name: true } },
          feeStructure: { select: { name: true } },
          academicYear: { select: { id: true, name: true } },
          term: { select: { id: true, name: true } },
          items: {
            select: { id: true, description: true, amount: true, quantity: true, totalAmount: true, discountAmount: true, paidAmount: true, balanceAmount: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          concessions: { select: { id: true, type: true, label: true, amount: true }, orderBy: { createdAt: "asc" } },
          carryForwards: { orderBy: { createdAt: "asc" } },
        },
      }),
      this.prisma.client.bill.count({ where }),
    ]);
    const items = rows.slice(0, limit).map((bill) => {
      const previousBalanceTotal = bill.carryForwards.reduce(
        (sum, snapshot) => sum.plus(snapshot.amount),
        new Prisma.Decimal(0),
      );
      const overdueDays = bill.dueDate ? daysPastDue(bill.dueDate, asOf) : null;
      return {
        ...bill,
        previousBalanceTotal: previousBalanceTotal.toFixed(2),
        totalDueAtIssue: bill.totalAmount.plus(previousBalanceTotal).toFixed(2),
        overdueDays: bill.balanceAmount.gt(0) && overdueDays !== null && overdueDays > 0 ? overdueDays : null,
      };
    });
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]?.id ?? null : null, total };
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
        // Admission numbers are nullable in the database; keep the API's
        // selector contract string-safe for students without one.
        admissionNumber: bill.student.admissionNumber ?? "",
        profile: bill.student.profile,
        classes: new Map<string, { id: string; name: string }>(),
        outstandingBalance: 0,
      };
      if (bill.class) existing.classes.set(bill.class.id, bill.class);
      existing.outstandingBalance = roundMoney(
        existing.outstandingBalance + Number(bill.balanceAmount),
      );
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

  async listPayments(schoolId: string, query: FinanceListQuery = {}) {
    const limit = clampPageSize(query.limit);
    const from = parseIsoDate(query.from, "start date");
    const toStart = parseIsoDate(query.to, "end date");
    const to = parseIsoDate(query.to, "end date", true);
    if (from && toStart && from > toStart) throw new BadRequestException("The start date must be on or before the end date.");
    if (query.status && !["COMPLETED", "PENDING", "FAILED", "CANCELLED", "REFUNDED"].includes(query.status)) {
      throw new BadRequestException("Choose a valid payment status.");
    }
    if (query.paymentMethod && !PAYMENT_METHODS.includes(query.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
      throw new BadRequestException("Choose a valid payment method.");
    }
    if (query.classId) {
      const schoolClass = await this.prisma.client.class.findFirst({ where: { id: query.classId, schoolId }, select: { id: true } });
      if (!schoolClass) throw new NotFoundException("Class not found in this school.");
    }
    const { yearId, termId } = await this.resolveAcademicFilter(schoolId, query.yearId, query.termId);
    const paymentDate: Prisma.DateTimeFilter = {};
    if (from) paymentDate.gte = from;
    if (to) paymentDate.lte = to;
    const filters: Prisma.PaymentWhereInput[] = [];
    if (query.status) filters.push({ status: query.status as "COMPLETED" | "PENDING" | "FAILED" | "CANCELLED" | "REFUNDED" });
    if (query.paymentMethod) filters.push({ paymentMethod: query.paymentMethod as (typeof PAYMENT_METHODS)[number] });
    if (from || to) filters.push({ paymentDate });
    if (yearId || termId) {
      const academicBillWhere: Prisma.BillWhereInput = {
        schoolId,
        ...(yearId ? { academicYearId: yearId } : {}),
        ...(termId ? { termId } : {}),
      };
      filters.push({ OR: [
        { billAllocations: { some: { schoolId, bill: academicBillWhere } } },
        { bill: academicBillWhere },
        { paymentItems: { some: { billItem: { bill: academicBillWhere } } } },
      ] });
    }
    if (query.classId) {
      filters.push({ OR: [
        { bill: { schoolId, classId: query.classId } },
        { billAllocations: { some: { schoolId, bill: { schoolId, classId: query.classId } } } },
        { paymentItems: { some: { billItem: { bill: { schoolId, classId: query.classId } } } } },
      ] });
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      filters.push({ OR: [
        { paymentNumber: { contains: term, mode: "insensitive" } },
        { referenceNumber: { contains: term, mode: "insensitive" } },
        { student: { admissionNumber: { contains: term, mode: "insensitive" } } },
        { student: { profile: { firstName: { contains: term, mode: "insensitive" } } } },
        { student: { profile: { lastName: { contains: term, mode: "insensitive" } } } },
      ] });
    }
    const where: Prisma.PaymentWhereInput = {
      schoolId,
      ...(filters.length ? { AND: filters } : {}),
    };
    if (query.cursor) {
      const cursorRow = await this.prisma.client.payment.findFirst({ where: { id: query.cursor, schoolId }, select: { id: true } });
      if (!cursorRow) throw new BadRequestException("The payment page cursor is invalid for this school.");
    }
    const [rows, total] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: {
          student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          bill: { select: { id: true, billNumber: true, classId: true, class: { select: { id: true, name: true } }, academicYearId: true, termId: true } },
          billAllocations: {
            include: { bill: { select: { id: true, billNumber: true, classId: true, academicYearId: true, termId: true } } },
          },
          paymentItems: {
            include: {
              billItem: {
                include: {
                  bill: { select: { id: true, billNumber: true, classId: true, academicYearId: true, termId: true } },
                  feeItem: { include: { customCategory: { select: { name: true } }, registryItem: { select: { name: true } } } },
                },
              },
            },
          },
          recordedBy: { select: { name: true, email: true } },
        },
      }),
      this.prisma.client.payment.count({ where }),
    ]);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]?.id ?? null : null, total };
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
        basicSalary: person.monthlySalary!.toFixed(2),
      })),
      ...staff.filter((person) => Number(person.monthlySalary ?? 0) > 0).map((person) => ({
        teacherId: null as string | null,
        staffId: person.id,
        basicSalary: person.monthlySalary!.toFixed(2),
      })),
    ];
    if (!eligible.length) {
      throw new BadRequestException("No active teachers or staff have a positive monthly salary. Add salary details before generating payroll.");
    }

    const payslips = eligible.map((person) => {
      // SSNIT 2026 insurable earnings range: GHS 587.80–69,000.
      const calculated = calculatePayslip(PAYROLL_PROFILE_2026, {
        residency: "RESIDENT",
        earnings: [{ code: "BASIC", description: "Basic salary", amount: person.basicSalary, taxable: true, pensionable: true, isBasic: true }],
        deductions: [],
        enrolments: [{ schemeKey: "SSNIT_TIER1", employerBearsEmployeeShare: false, employerShareTaxable: false }],
      });
      const ssnitEmployee = new Prisma.Decimal(calculated.schemes[0]!.employee);
      const ssnitEmployer = new Prisma.Decimal(calculated.schemes[0]!.employer);
      const grossSalary = new Prisma.Decimal(calculated.gross);
      const incomeTax = new Prisma.Decimal(calculated.paye);
      const netSalary = new Prisma.Decimal(calculated.net);
      return {
        schoolId,
        teacherId: person.teacherId,
        staffId: person.staffId,
        basicSalary: new Prisma.Decimal(person.basicSalary),
        allowances: new Prisma.Decimal(0),
        grossSalary,
        ssnitEmployee,
        ssnitEmployer,
        incomeTax,
        otherDeductions: new Prisma.Decimal(0),
        netSalary,
        paymentMethod: "BANK_TRANSFER" as const,
        paymentStatus: "PENDING" as const,
      };
    });
    const sum = (key: "grossSalary" | "netSalary" | "incomeTax" | "ssnitEmployee" | "ssnitEmployer") =>
      payslips.reduce((total, slip) => total.plus(slip[key]), new Prisma.Decimal(0));

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
          totalGross: sum("grossSalary"),
          totalNet: sum("netSalary"),
          totalTax: sum("incomeTax"),
          totalSSNIT: sum("ssnitEmployee").plus(sum("ssnitEmployer")),
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

        // Money must remain Decimal throughout payroll reconciliation and posting.
        const sum = (field: "grossSalary" | "netSalary" | "incomeTax" | "ssnitEmployee" | "ssnitEmployer" | "otherDeductions") =>
          current.payslips.reduce((total, slip) => total.plus(slip[field]), new Prisma.Decimal(0));
        const gross = sum("grossSalary");
        const net = sum("netSalary");
        const paye = sum("incomeTax");
        const employeeSsnit = sum("ssnitEmployee");
        const employerSsnit = sum("ssnitEmployer");
        const otherDeductions = sum("otherDeductions");
        if (!gross.eq(net.plus(paye).plus(employeeSsnit).plus(otherDeductions))) {
          throw new BadRequestException(
            "This payroll does not reconcile exactly: gross pay must equal net pay plus PAYE, employee SSNIT and other deductions. Review the payslips before confirming payment.",
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
          amountValue: Prisma.Decimal,
          debitAccount: { id: string; accountType: AccountType },
          creditAccount: { id: string; accountType: AccountType },
          transactionType: "EXPENSE" | "TRANSFER",
          notes: string,
        ) => {
          if (amountValue.lte(0)) return;
          const decimalAmount = amountValue;
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
