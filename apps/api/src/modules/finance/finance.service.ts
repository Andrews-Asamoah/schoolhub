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

  async listFeeStructures(schoolId: string) {
    return this.prisma.client.feeStructure.findMany({
      where: { schoolId, isActive: true },
      include: {
        items: true,
        targetClasses: { include: { class: { select: { id: true, name: true } } } },
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
    });

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

      // 3. Decrement student outstanding balance
      await tx.student.update({
        where: { id: input.studentId },
        data: {
          outstandingBalance: {
            decrement: paymentAmount,
          },
        },
      });

      return payment;
    });
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

  async listExpenses(schoolId: string) {
    return this.prisma.client.expense.findMany({
      where: { schoolId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: {
        customCategory: { select: { name: true } },
        registryCategory: { select: { name: true } },
      },
    });
  }

  async createExpense(schoolId: string, recordedById: string, input: CreateExpenseInput) {
    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Enter a valid expense date.");
    }
    return this.prisma.client.expense.create({
      data: {
        schoolId,
        date,
        amount: new Prisma.Decimal(input.amount),
        description: input.description,
        payee: input.payee || null,
        category: input.category,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber || null,
        recordedById,
      },
      include: {
        customCategory: { select: { name: true } },
        registryCategory: { select: { name: true } },
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
