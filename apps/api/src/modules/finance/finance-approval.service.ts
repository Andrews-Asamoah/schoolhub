import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceApprovalSubject } from "@prisma/client";
import { createHash } from "node:crypto";
import { loadApprovalSetting, POLICY_WAIVER_NOTE } from "./finance-approval-settings.js";
import { PrismaService } from "../../prisma/prisma.service.js";

export function approvalPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** P0 foundation: atomic, tenant-scoped approval records with payload binding. */
@Injectable()
export class FinanceApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async request(input: {
    schoolId: string; subject: FinanceApprovalSubject; entityType: string;
    entityId: string; requestedById: string; payload: unknown; amount?: Prisma.Decimal;
  }, db?: Prisma.TransactionClient) {
    const create = async (tx: Prisma.TransactionClient) => {
      const pending = await tx.financeApprovalRequest.findFirst({
        where: { schoolId: input.schoolId, entityType: input.entityType, entityId: input.entityId, status: "PENDING" },
      });
      if (pending) throw new ConflictException("This item already has a pending approval.");
      let policy = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId: input.schoolId, subject: input.subject, minAmount: { lte: input.amount ?? new Prisma.Decimal(0) } },
        orderBy: { minAmount: "desc" },
      });
      // Payroll uses one decision record even when the school waives a second reviewer.
      // Other subjects stay fail-closed until a policy exists.
      if (!policy && input.subject === "PAYROLL_RUN") {
        policy = await tx.financeApprovalPolicy.upsert({
          where: { schoolId_subject_minAmount: { schoolId: input.schoolId, subject: "PAYROLL_RUN", minAmount: new Prisma.Decimal(0) } },
          create: { schoolId: input.schoolId, subject: "PAYROLL_RUN", minAmount: new Prisma.Decimal(0), requiredApprovals: 1, approverPermission: "PAYROLL_APPROVE" },
          update: {},
        });
      }
      if (!policy) throw new ConflictException("No school approval policy configured for this operation.");
      if (policy.requiredApprovals !== 1) throw new ConflictException("Multi-approver policy is not yet supported; activation blocked.");
      return tx.financeApprovalRequest.create({
        data: { schoolId: input.schoolId, subject: input.subject, entityType: input.entityType,
          entityId: input.entityId, requestedById: input.requestedById,
          payloadHash: approvalPayloadHash(input.payload), amount: input.amount },
      });
    };
    return db ? create(db) : this.prisma.client.$transaction(create, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async decide(schoolId: string, requestId: string, actorId: string, status: "APPROVED" | "REJECTED", payload: unknown, note: string, db?: Prisma.TransactionClient, options?: { waivePayrollReview: boolean }) {
    if (!note.trim()) throw new ConflictException("An approval decision requires a note.");
    const decide = async (tx: Prisma.TransactionClient) => {
      const approval = await tx.financeApprovalRequest.findFirst({ where: { id: requestId, schoolId, status: "PENDING" } });
      if (!approval) throw new NotFoundException("Pending approval not found.");
      const waivedByPolicy = options?.waivePayrollReview === true
        && approval.subject === "PAYROLL_RUN" && status === "APPROVED"
        && !(await loadApprovalSetting(tx, schoolId, "PAYROLL_RUN")).required;
      if (actorId === approval.requestedById && !waivedByPolicy) {
        throw new ForbiddenException("The requester cannot approve their own financial change.");
      }
      if (approval.payloadHash !== approvalPayloadHash(payload)) throw new ConflictException("The financial details changed since approval was requested.");
      const updated = await tx.financeApprovalRequest.updateMany({
        where: { id: requestId, schoolId, status: "PENDING" },
        data: { status, decidedById: actorId, decidedAt: new Date(), decisionNote: waivedByPolicy ? POLICY_WAIVER_NOTE : note.trim(), waivedByPolicy },
      });
      if (updated.count !== 1) throw new ConflictException("This approval has already been decided.");
      return tx.financeApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
    };
    return db ? decide(db) : this.prisma.client.$transaction(decide, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assertApproved(schoolId: string, entityType: string, entityId: string, payload: unknown) {
    const approved = await this.prisma.client.financeApprovalRequest.findFirst({
      where: { schoolId, entityType, entityId, status: "APPROVED", payloadHash: approvalPayloadHash(payload) },
    });
    if (!approved || !approved.decidedById || approved.decidedById === approved.requestedById) {
      throw new ForbiddenException("A distinct reviewer must approve this financial change.");
    }
    return approved;
  }
}
