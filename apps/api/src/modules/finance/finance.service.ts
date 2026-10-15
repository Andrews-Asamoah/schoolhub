import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { GenerateBillInput, RecordPaymentInput } from "@schoolhub/shared";
import { Prisma } from "@prisma/client";
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

    const feeStructure = await this.prisma.client.feeStructure.findFirst({
      where: { id: input.feeStructureId, schoolId, isActive: true },
      include: { items: true },
    });

    if (!feeStructure) {
      throw new NotFoundException("Fee structure not found");
    }

    if (feeStructure.items.length === 0) {
      throw new BadRequestException("Fee structure contains no billable items");
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
      // 1. Create payment record
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

      // 2. If attached to a bill, update bill status and balance
      if (input.billId) {
        const bill = await tx.bill.findUnique({
          where: { id: input.billId },
        });

        if (bill) {
          const newPaid = Number(bill.paidAmount) + input.amount;
          const newBalance = Math.max(0, Number(bill.totalAmount) - newPaid);
          const status = newBalance === 0 ? "PAID" : "PARTIALLY_PAID";

          await tx.bill.update({
            where: { id: input.billId },
            data: {
              paidAmount: new Prisma.Decimal(newPaid),
              balanceAmount: new Prisma.Decimal(newBalance),
              status,
            },
          });
        }
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
