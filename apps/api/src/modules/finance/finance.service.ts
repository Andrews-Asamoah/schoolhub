import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateExpenseInput, GenerateBillInput, RecordPaymentInput } from "@schoolhub/shared";
import { Prisma, type AccountCategory, type AccountType, type PaymentMethod, type TransactionCategory } from "@prisma/client";
import { canManageAcademicContext } from "../../common/academic-context.js";

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

  async generateBills(schoolId: string, input: GenerateBillInput) {
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
    if (
      input.academicYearId !== currentYear.id ||
      (input.termId && input.termId !== currentTerm.id)
    ) {
      throw new BadRequestException(
        "Bills can only be generated for the currently selected academic year and term.",
      );
    }

    if (input.classId) {
      const schoolClass = await this.prisma.client.class.findFirst({
        where: { id: input.classId, schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!schoolClass) {
        throw new NotFoundException("Class not found in this school.");
      }
    }

    const feeStructure = await this.prisma.client.feeStructure.findFirst({
      where: { id: input.feeStructureId, schoolId, isActive: true },
      include: { items: true, targetClasses: { select: { classId: true } } },
    });

    if (!feeStructure) {
      throw new NotFoundException("Fee structure not found");
    }

    if (feeStructure.items.length === 0) {
      throw new BadRequestException("Fee structure contains no billable items");
    }
    if (
      input.classId &&
      feeStructure.targetClasses.length > 0 &&
      !feeStructure.targetClasses.some((target) => target.classId === input.classId)
    ) {
      throw new BadRequestException("This fee structure is not assigned to the selected class.");
    }

    const totalAmount = feeStructure.items.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    // Target students: either specific student or all students in class
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
        throw new BadRequestException(
          "The selected student is not enrolled in the current term.",
        );
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

    const year = new Date().getFullYear();
    const createdBills = await this.prisma.client.$transaction(async (tx) => {
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

        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const billNumber = `INV-${year}-${randomNum}`;

        const bill = await tx.bill.create({
          data: {
            schoolId,
            studentId,
            academicYearId: currentYear.id,
            termId: currentTerm.id,
            feeStructureId: input.feeStructureId,
            classId: input.classId,
            billNumber,
            totalAmount: new Prisma.Decimal(totalAmount),
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: new Prisma.Decimal(totalAmount),
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            notes: input.notes,
            items: {
              create: feeStructure.items.map((item) => ({
                feeItemId: item.id,
                description: item.name,
                amount: item.amount,
                quantity: 1,
                totalAmount: item.amount,
                balanceAmount: item.amount,
              })),
            },
          },
        });

        // Increase student's outstanding balance
        await tx.student.update({
          where: { id: studentId },
          data: {
            outstandingBalance: {
              increment: new Prisma.Decimal(totalAmount),
            },
          },
        });

        results.push(bill);
      }
      return results;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      success: true,
      count: createdBills.length,
      totalBilled: totalAmount * createdBills.length,
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
      referenceType: string;
      referenceId: string;
      referenceNumber?: string;
      notes?: string;
    },
  ) {
    const cash = await this.ensureAccount(tx, input.schoolId, {
      accountType: "ASSET",
      category: "CASH",
      name: "Cash on Hand",
      code: "1000",
    });
    const revenue = await this.ensureAccount(tx, input.schoolId, {
      accountType: "REVENUE",
      category: "OTHER_INCOME",
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

    const year = new Date().getFullYear();
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const paymentNumber = `RCT-${year}-${randomNum}`;
    const paymentAmount = new Prisma.Decimal(input.amount);

    return this.prisma.client.$transaction(async (tx) => {
      // Validate the bill inside the transaction before writing anything. A bill
      // must belong to this tenant and student, and must not be overpaid.
      const bill = input.billId
        ? await tx.bill.findFirst({
            where: {
              id: input.billId,
              schoolId,
              studentId: input.studentId,
            },
            include: { items: true },
          })
        : null;

      if (input.billId && !bill) {
        throw new NotFoundException("Bill not found for this student.");
      }
      if (bill && ["CANCELLED", "WAIVED"].includes(bill.status)) {
        throw new BadRequestException("Payments cannot be recorded against a cancelled or waived bill.");
      }
      if (bill && input.amount > Number(bill.balanceAmount)) {
        throw new BadRequestException(
          `Payment exceeds the outstanding bill balance of ${Number(bill.balanceAmount).toFixed(2)}.`,
        );
      }

      // 1. Create payment record only after all tenant/bill checks pass.
      const payment = await tx.payment.create({
        data: {
          schoolId,
          studentId: input.studentId,
          billId: input.billId,
          paymentNumber,
          amount: paymentAmount,
          paymentMethod: input.paymentMethod,
          paymentDate: new Date(input.paymentDate),
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          recordedById,
        },
      });

      // 2. Update the already-validated bill atomically.
      if (bill) {
        const newPaid = Number(bill.paidAmount) + input.amount;
        const newBalance = Math.max(0, Number(bill.totalAmount) - newPaid);
        const status = newBalance === 0 ? "PAID" : "PARTIALLY_PAID";

        await tx.bill.update({
          where: { id: bill.id },
          data: {
            paidAmount: new Prisma.Decimal(newPaid),
            balanceAmount: new Prisma.Decimal(newBalance),
            status,
          },
        });
      }

      // 3. Allocate the payment to bill items in order, preserving the item ledger.
      if (bill) {
        let remaining = input.amount;
        for (const item of bill.items) {
          if (remaining <= 0) break;
          const itemBalance = Number(item.balanceAmount);
          if (itemBalance <= 0) continue;
          const applied = Math.min(remaining, itemBalance);
          const nextBalance = Math.max(0, itemBalance - applied);
          const nextPaid = Number(item.paidAmount) + applied;
          await tx.billItem.update({
            where: { id: item.id },
            data: {
              paidAmount: new Prisma.Decimal(nextPaid),
              balanceAmount: new Prisma.Decimal(nextBalance),
              status: nextBalance === 0 ? "FULLY_PAID" : "PARTIALLY_PAID",
            },
          });
          await tx.paymentItem.create({
            data: {
              paymentId: payment.id,
              billItemId: item.id,
              amount: new Prisma.Decimal(applied),
            },
          });
          remaining -= applied;
        }
      }

      // Keep the aggregate student balance from dropping below zero if older
      // records contain an out-of-sync aggregate balance.
      const currentStudent = await tx.student.findFirst({
        where: { id: input.studentId, schoolId, deletedAt: null },
        select: { id: true, outstandingBalance: true },
      });
      if (!currentStudent) throw new NotFoundException("Student not found.");
      await tx.student.update({
        where: { id: currentStudent.id },
        data: {
          outstandingBalance: new Prisma.Decimal(
            Math.max(0, Number(currentStudent.outstandingBalance) - input.amount),
          ),
        },
      });

      return payment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listBills(schoolId: string) {
    return this.prisma.client.bill.findMany({
      where: { schoolId },
      orderBy: { issuedAt: "desc" },
      take: 500,
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        class: { select: { id: true, name: true } },
        feeStructure: { select: { name: true } },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        items: {
          select: { id: true, description: true, amount: true, quantity: true, totalAmount: true, paidAmount: true, balanceAmount: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async listPayments(schoolId: string) {
    return this.prisma.client.payment.findMany({
      where: { schoolId },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        bill: { select: { id: true, billNumber: true } },
        recordedBy: { select: { name: true, email: true } },
      },
    });
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
          voucherNumber: input.voucherNumber || null,
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
        referenceNumber: input.voucherNumber || input.referenceNumber || undefined,
        notes: input.registryCategoryId ? "Expenditure category: " + input.registryCategoryId : undefined,
      });
      return expense;
    });
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
  ) {
    const db = this.prisma.client;
    const payroll = await db.payrollRecord.findFirst({
      where: { id: payrollRecordId, schoolId },
      include: { _count: { select: { payslips: true } } },
    });
    if (!payroll) throw new NotFoundException("Payroll run not found.");
    if (payroll.status === "DRAFT" && input.status === "APPROVED") {
      if (!payroll._count.payslips) throw new BadRequestException("A payroll run without payslips cannot be approved.");
      return db.payrollRecord.update({
        where: { id: payroll.id },
        data: { status: "APPROVED" },
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
