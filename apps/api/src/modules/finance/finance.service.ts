import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { GenerateBillInput, RecordPaymentInput } from "@schoolhub/shared";
import { Prisma } from "@prisma/client";

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
      studentIds = [input.studentId];
    } else if (input.classId) {
      const students = await this.prisma.client.student.findMany({
        where: { schoolId, classId: input.classId, deletedAt: null, status: "ACTIVE" },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
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
            academicYearId: input.academicYearId,
            termId: input.termId,
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

  async getStudentLedger(schoolId: string, studentId: string) {
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
        where: { studentId, schoolId },
        orderBy: { issuedAt: "desc" },
        include: { items: true },
      }),
      this.prisma.client.payment.findMany({
        where: { studentId, schoolId },
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    return {
      student,
      currentBalance: student.outstandingBalance,
      bills,
      payments,
    };
  }
}
