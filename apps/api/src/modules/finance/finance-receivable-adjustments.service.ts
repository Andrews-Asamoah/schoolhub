import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceBillAdjustment, type FinanceBillAdjustmentLine } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FinancePostingService } from "./finance-posting.service.js";
import { FinanceAccountPurposeService } from "./finance-account-purpose.service.js";
import { withSerializableRetry } from "./finance.helpers.js";

type Adjustment = FinanceBillAdjustment & { lines: FinanceBillAdjustmentLine[] };
const day = (value: Date) => value.toISOString().slice(0, 10);
const adjustmentSubject = (kind: string): "CREDIT_NOTE" | "WRITE_OFF" => {
  if (kind !== "CREDIT_NOTE" && kind !== "WRITE_OFF") {
    throw new BadRequestException("Only credit notes and bad-debt write-offs have approved ledger workflows at present.");
  }
  return kind;
};
function approvedPayload(item: Adjustment) {
  return {
    schoolId: item.schoolId, adjustmentId: item.id, billId: item.billId,
    studentId: item.studentId, kind: item.kind, amount: item.amount.toFixed(2),
    reasonCode: item.reasonCode, reason: item.reason,
    effectiveDate: day(item.effectiveDate),
    lines: [...item.lines].sort((a,b) => a.billItemId.localeCompare(b.billItemId)).map(line => ({
      billItemId: line.billItemId, amount: line.amount.toFixed(2),
    })),
  };
}
const hash = (item: Adjustment) => createHash("sha256")
  .update(JSON.stringify(approvedPayload(item))).digest("hex");

/**
 * Controlled P3 receivables: source invoice + bill items + student AR balance
 * + immutable adjusting journal are updated in one serializable transaction.
 * Requires independently verified revenue policy and account purpose mapping.
 */
@Injectable()
export class FinanceReceivableAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: FinancePostingService,
    private readonly purposes: FinanceAccountPurposeService,
  ) {}

  private async lock(tx: Prisma.TransactionClient, schoolId: string, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${id}))`;
    const item = await tx.financeBillAdjustment.findFirst({
      where: { schoolId, id }, include: { lines: true },
    });
    if (!item) throw new NotFoundException("Bill adjustment not found.");
    return item;
  }

  async submit(schoolId: string, actorId: string, id: string) {
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const item = await this.lock(tx, schoolId, id);
      if (item.status !== "DRAFT") throw new ConflictException("Only adjustment drafts can be submitted.");
      if (item.createdById !== actorId) throw new ForbiddenException("Only the preparer may submit this adjustment.");
      const subject = adjustmentSubject(item.kind);
      if (!item.lines.length || !item.lines.reduce((sum, l) => sum.plus(l.amount), new Prisma.Decimal(0)).eq(item.amount)) {
        throw new ConflictException("Adjustment lines no longer agree with the adjustment total.");
      }
      await tx.financeApprovalPolicy.upsert({
        where: { schoolId_subject_minAmount: {
          schoolId, subject, minAmount: new Prisma.Decimal(0),
        } },
        create: {
          schoolId, subject, minAmount: new Prisma.Decimal(0),
          requiredApprovals: 1, approverPermission: subject + "_APPROVE",
        },
        update: {},
      });
      const policy = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId, subject, minAmount: { lte: item.amount } },
        orderBy: { minAmount: "desc" },
      });
      if (policy?.requiredApprovals !== 1 || policy.approverPermission !== subject + "_APPROVE") {
        throw new ConflictException("A supported, independent adjustment approval policy is required.");
      }
      const approval = await tx.financeApprovalRequest.create({
        data: {
          schoolId, subject, entityType: "FINANCE_BILL_ADJUSTMENT",
          entityId: item.id, requestedById: item.createdById,
          amount: item.amount, payloadHash: hash(item),
        },
      });
      await tx.financeBillAdjustment.update({
        where: { id: item.id },
        data: { status: "PENDING_APPROVAL", approvalRequestId: approval.id },
      });
      return { adjustmentId: id, approvalRequestId: approval.id, status: "PENDING_APPROVAL" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async decide(schoolId: string, actorId: string, schoolRole: string | undefined,
    isSuperAdmin: boolean, id: string, decision: "APPROVED" | "REJECTED", note: string,
  ) {
    if (note.trim().length < 10) throw new BadRequestException("Explain the approval decision in at least 10 characters.");
    if (!isSuperAdmin && schoolRole !== "owner" && schoolRole !== "headteacher") {
      throw new ForbiddenException("A school owner or headteacher must authorise invoice adjustments.");
    }
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const item = await this.lock(tx, schoolId, id);
      if (item.status !== "PENDING_APPROVAL" || !item.approvalRequestId) {
        throw new ConflictException("Adjustment is not pending independent approval.");
      }
      if (item.createdById === actorId) throw new ForbiddenException("The preparer cannot approve their own adjustment.");
      const subject = adjustmentSubject(item.kind);
      const approval = await tx.financeApprovalRequest.findFirst({
        where: {
          id: item.approvalRequestId, schoolId, subject,
          entityType: "FINANCE_BILL_ADJUSTMENT", entityId: id, status: "PENDING",
        },
      });
      if (!approval || approval.requestedById !== item.createdById ||
        approval.payloadHash !== hash(item)) {
        throw new ConflictException("Adjustment content differs from the independently requested approval.");
      }
      const policy = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId, subject, minAmount: { lte: item.amount } },
        orderBy: { minAmount: "desc" },
      });
      if (policy?.requiredApprovals !== 1 || policy.approverPermission !== subject + "_APPROVE") {
        throw new ForbiddenException("The configured adjustment approval policy has changed.");
      }
      const changed = await tx.financeApprovalRequest.updateMany({
        where: { id: approval.id, schoolId, status: "PENDING" },
        data: { status: decision, decidedById: actorId, decidedAt: new Date(), decisionNote: note.trim() },
      });
      if (changed.count !== 1) throw new ConflictException("Approval was already decided.");
      await tx.financeBillAdjustment.update({ where: { id }, data: { status: decision } });
      return { adjustmentId: id, status: decision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async post(schoolId: string, actorId: string, id: string) {
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const item = await this.lock(tx, schoolId, id);
      if (item.status === "POSTED") return { adjustmentId: id, status: "POSTED" as const, alreadyPosted: true };
      if (item.status !== "APPROVED" || !item.approvalRequestId) {
        throw new ForbiddenException("An independently approved credit note or write-off is required.");
      }
      const subject = adjustmentSubject(item.kind);
      const approval = await tx.financeApprovalRequest.findFirst({
        where: {
          id: item.approvalRequestId, schoolId, subject, status: "APPROVED",
          entityType: "FINANCE_BILL_ADJUSTMENT", entityId: id, payloadHash: hash(item),
        },
      });
      if (!approval || approval.requestedById !== item.createdById || !approval.decidedById ||
        approval.decidedById === item.createdById || approval.decidedById === actorId) {
        throw new ForbiddenException("Approved adjustment must have an independent approver who does not post it.");
      }
      const settings = await tx.financeSettings.findUnique({ where: { schoolId } });
      if (!settings?.p3AdjustmentsEnabled || !settings.revenuePolicyApprovedAt) {
        throw new ConflictException("P3 adjustments require school-approved revenue policy and explicit activation.");
      }
      // Match the established lock ordering of receipt recording: accrual -> student -> bill.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('accrual-transition'))`;
      const accrual = await tx.financeAccrualState.findUnique({ where: { schoolId } });
      if (!accrual || item.effectiveDate < accrual.activatedAt && day(item.effectiveDate) < day(accrual.activatedAt)) {
        throw new ConflictException("Only accrual-period adjustments backed by the original invoice journal are supported.");
      }
      await tx.$executeRaw`SELECT id FROM students WHERE id = ${item.studentId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM bills WHERE id = ${item.billId} AND "schoolId" = ${schoolId} FOR UPDATE`;
      const bill = await tx.bill.findFirst({
        where: { schoolId, id: item.billId, studentId: item.studentId },
        include: { items: true },
      });
      if (!bill || bill.billType !== "INVOICE" || ["CANCELLED","WAIVED"].includes(bill.status)) {
        throw new ConflictException("A valid, active school invoice is required.");
      }
      const source = await tx.transaction.findFirst({
        where: { schoolId, referenceType: "BILL", referenceId: bill.id },
        orderBy: { createdAt: "asc" },
      });
      if (!source || !source.amount.eq(bill.totalAmount)) {
        throw new ConflictException("Original accrual invoice journal is missing or mismatched; reconcile first.");
      }
      const receivables = await this.purposes.resolve(tx, schoolId, "STUDENT_RECEIVABLE", item.effectiveDate);
      if (receivables.id !== source.debitAccountId) {
        throw new ConflictException("The verified AR control account differs from the source invoice posting.");
      }
      const debit = await this.purposes.resolve(
        tx, schoolId, subject === "CREDIT_NOTE" ? "FEE_REVENUE" : "BAD_DEBT_EXPENSE",
        item.effectiveDate,
      );
      if (subject === "CREDIT_NOTE" && debit.id !== source.creditAccountId) {
        throw new ConflictException("Credit notes must reverse the invoice's original revenue account.");
      }
      if (bill.balanceAmount.lt(item.amount)) {
        throw new ConflictException("Invoice outstanding balance has fallen below the approved adjustment.");
      }
      const itemsById = new Map(bill.items.map(row => [row.id, row]));
      const sum = item.lines.reduce((total, line) => total.plus(line.amount), new Prisma.Decimal(0));
      if (!sum.eq(item.amount) || item.lines.length === 0) {
        throw new ConflictException("Approved adjustment lines do not balance.");
      }
      for (const line of item.lines) {
        const billItem = itemsById.get(line.billItemId);
        if (!billItem || line.amount.lte(0) || line.amount.gt(billItem.balanceAmount)) {
          throw new ConflictException("The original billed item no longer has enough unadjusted receivables.");
        }
      }
      const transaction = await this.posting.post(tx, {
        schoolId, date: item.effectiveDate, amount: item.amount,
        description: subject === "CREDIT_NOTE" ? "Credit note for invoice " + bill.billNumber :
          "Approved bad-debt write-off for invoice " + bill.billNumber,
        debitAccountId: debit.id, creditAccountId: receivables.id,
        transactionType: "ADJUSTMENT", category: "SCHOOL_FEES",
        referenceType: subject, referenceId: item.id, referenceNumber: item.adjustmentNumber,
      });
      for (const line of item.lines) {
        const original = itemsById.get(line.billItemId)!;
        const remaining = original.balanceAmount.minus(line.amount);
        await tx.billItem.update({
          where: { id: original.id }, data: {
            balanceAmount: remaining,
            ...(subject === "CREDIT_NOTE"
              ? { creditedAmount: { increment: line.amount } }
              : { writtenOffAmount: { increment: line.amount } }),
            status: remaining.eq(0) ? "ADJUSTED" : original.paidAmount.gt(0) ? "PARTIALLY_PAID" : "UNPAID",
          },
        });
      }
      const remainingBill = bill.balanceAmount.minus(item.amount);
      await tx.bill.update({
        where: { id: bill.id }, data: {
          balanceAmount: remainingBill,
          ...(subject === "CREDIT_NOTE"
            ? { creditedAmount: { increment: item.amount } }
            : { writtenOffAmount: { increment: item.amount } }),
          status: remainingBill.eq(0) ? "ADJUSTED" : bill.paidAmount.gt(0) ? "PARTIALLY_PAID" : "PENDING",
        },
      });
      const totals = await tx.bill.aggregate({
        where: { schoolId, studentId: item.studentId, status: { notIn: ["CANCELLED", "WAIVED"] } },
        _sum: { balanceAmount: true },
      });
      await tx.student.update({ where: { id: item.studentId },
        data: { outstandingBalance: totals._sum.balanceAmount ?? new Prisma.Decimal(0) } });
      await tx.financeBillAdjustment.update({
        where: { id }, data: { status: "POSTED", postedAt: new Date(), postedTransactionId: transaction.id },
      });
      await tx.auditLog.create({
        data: {
          schoolId, userId: actorId, action: "UPDATE",
          entityType: "FINANCE_BILL_ADJUSTMENT", entityId: item.id,
          newValues: {
            kind: subject, amount: item.amount.toFixed(2),
            billId: bill.id, transactionId: transaction.id, approvalRequestId: approval.id,
          },
        },
      });
      return { adjustmentId: id, status: "POSTED" as const,
        transactionId: transaction.id, alreadyPosted: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
}
