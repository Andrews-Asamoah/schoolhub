import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateExpenseInput, GenerateBillInput, RecordPaymentInput } from "@schoolhub/shared";
import { Prisma, type TransactionCategory } from "@prisma/client";
import { canManageAcademicContext } from "../../common/academic-context.js";

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
      accountType: "ASSET" | "REVENUE";
      category: "CASH" | "OTHER_INCOME";
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
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
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

    return this.prisma.client.expense.create({
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
  }

  async listPayrollRecords(schoolId: string) {
    return this.prisma.client.payrollRecord.findMany({
      where: { schoolId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 100,
      include: {
        payslips: {
          select: {
            id: true,
            staffId: true,
            teacherId: true,
            basicSalary: true,
            allowances: true,
            grossSalary: true,
            ssnitEmployee: true,
            incomeTax: true,
            otherDeductions: true,
            netSalary: true,
            paymentMethod: true,
            paymentStatus: true,
            paidAt: true,
          },
        },
      },
    });
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
