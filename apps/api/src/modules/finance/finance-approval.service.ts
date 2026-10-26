import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceApprovalSubject } from "@prisma/client";
import { createHash } from "node:crypto";
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
  }) {
    return this.prisma.client.$transaction(async tx => {
      const pending = await tx.financeApprovalRequest.findFirst({
        where: { schoolId: input.schoolId, entityType: input.entityType, entityId: input.entityId, status: "PENDING" },
      });
      if (pending) throw new ConflictException("This item already has a pending approval.");
      const policy = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId: input.schoolId, subject: input.subject, minAmount: { lte: input.amount ?? new Prisma.Decimal(0) } },
        orderBy: { minAmount: "desc" },
      });
      if (!policy) throw new ConflictException("No school approval policy configured for this operation.");
      if (policy.requiredApprovals !== 1) throw new ConflictException("Multi-approver policy is not yet supported; activation blocked.");
      return tx.financeApprovalRequest.create({
        data: { schoolId: input.schoolId, subject: input.subject, entityType: input.entityType,
          entityId: input.entityId, requestedById: input.requestedById,
          payloadHash: approvalPayloadHash(input.payload), amount: input.amount },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async decide(schoolId: string, requestId: string, actorId: string, status: "APPROVED" | "REJECTED", payload: unknown, note: string) {
    if (!note.trim()) throw new ConflictException("An approval decision requires a note.");
    return this.prisma.client.$transaction(async tx => {
      const approval = await tx.financeApprovalRequest.findFirst({ where: { id: requestId, schoolId, status: "PENDING" } });
      if (!approval) throw new NotFoundException("Pending approval not found.");
      const settings = await tx.financeSettings.findUnique({ where: { schoolId } });
      if (actorId === approval.requestedById && !settings?.allowSelfApproval) {
        throw new ForbiddenException("The requester cannot approve their own financial change.");
      }
      if (approval.payloadHash !== approvalPayloadHash(payload)) throw new ConflictException("The financial details changed since approval was requested.");
      const updated = await tx.financeApprovalRequest.updateMany({
        where: { id: requestId, schoolId, status: "PENDING" },
        data: { status, decidedById: actorId, decidedAt: new Date(), decisionNote: note.trim() },
      });
      if (updated.count !== 1) throw new ConflictException("This approval has already been decided.");
      return tx.financeApprovalRequest.findUniqueOrThrow({ where: { id: requestId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assertApproved(schoolId: string, entityType: string, entityId: string, payload: unknown) {
    const approved = await this.prisma.client.financeApprovalRequest.findFirst({
      where: { schoolId, entityType, entityId, status: "APPROVED", payloadHash: approvalPayloadHash(payload) },
    });
    if (!approved) throw new ForbiddenException("An independent approval is required.");
    return approved;
  }
}
