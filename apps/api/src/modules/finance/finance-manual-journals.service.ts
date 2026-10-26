import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type FinanceManualJournal, type FinanceManualJournalLine } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FinancePostingService } from "./finance-posting.service.js";
import { manualJournalHash, manualJournalPayload, pairManualJournal, prepareManualJournal, type JournalDraftLine } from "./finance-manual-journal.helpers.js";
import { withSerializableRetry } from "./finance.helpers.js";

type Loaded = FinanceManualJournal & { lines: FinanceManualJournalLine[] };
const day = (d: Date) => d.toISOString().slice(0, 10);
function postingDate(value: string): Date {
  const date = new Date(value + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || day(date) !== value || value > day(new Date())) {
    throw new BadRequestException("Enter a real posting date no later than today.");
  }
  return date;
}
function checkedPayload(journal: Loaded) {
  return manualJournalPayload(journal);
}

/**
 * Manual journals: draft -> submit -> independent owner/headteacher approval -> post.
 * Reversals are independently approved *new* journals; no posted Transaction is edited.
 * All money movements go through FinancePostingService in a serializable transaction.
 */
@Injectable()
export class FinanceManualJournalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: FinancePostingService,
  ) {}

  async list(schoolId: string) {
    return this.prisma.client.financeManualJournal.findMany({
      where: { schoolId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100, include: { lines: { orderBy: { position: "asc" } }, postings: true },
    });
  }

  async get(schoolId: string, journalId: string) {
    const journal = await this.prisma.client.financeManualJournal.findFirst({
      where: { id: journalId, schoolId },
      include: { lines: { orderBy: { position: "asc" } }, postings: true },
    });
    if (!journal) throw new NotFoundException("Manual journal not found.");
    return journal;
  }

  private async lock(tx: Prisma.TransactionClient, schoolId: string, journalId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext(${journalId}))`;
    const row = await tx.financeManualJournal.findFirst({
      where: { id: journalId, schoolId }, include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!row) throw new NotFoundException("Manual journal not found.");
    return row;
  }

  private async insertDraft(
    tx: Prisma.TransactionClient, schoolId: string, actorId: string,
    input: { postingDate: string; description: string; idempotencyKey: string; lines: readonly JournalDraftLine[];
      reversalOfId?: string; reason?: string },
  ) {
    const date = postingDate(input.postingDate);
    if (input.description.trim().length < 10) throw new BadRequestException("Describe the journal's purpose in at least 10 characters.");
    if (input.idempotencyKey.trim().length < 12) throw new BadRequestException("An idempotency key of at least 12 characters is required.");
    const { lines, total } = prepareManualJournal(input.lines);
    // Prevent duplicate-number allocation by competing accountants.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('manual-journal-number'))`;
    const existing = await tx.financeManualJournal.findFirst({
      where: { schoolId, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing) throw new ConflictException("Idempotency key already used; retrieve the existing journal rather than resubmitting.");
    const accounts = await tx.chartAccount.findMany({
      where: { schoolId, isActive: true, id: { in: [...new Set(lines.map(l => l.accountId))] } },
      select: { id: true },
    });
    if (accounts.length !== new Set(lines.map(l => l.accountId)).size) {
      throw new BadRequestException("Every journal account must be active and belong to this school.");
    }
    const prefix = "MJN-" + date.getUTCFullYear() + "-";
    const latest = await tx.financeManualJournal.findFirst({
      where: { schoolId, journalNumber: { startsWith: prefix } },
      orderBy: { journalNumber: "desc" }, select: { journalNumber: true },
    });
    const next = (latest ? Number(latest.journalNumber.slice(prefix.length)) : 0) + 1;
    if (!Number.isSafeInteger(next)) throw new ConflictException("Manual journal numbering must be reviewed.");
    return tx.financeManualJournal.create({
      data: {
        schoolId, createdById: actorId,
        journalNumber: prefix + String(next).padStart(6, "0"),
        postingDate: date, description: input.description.trim(), totalAmount: total,
        idempotencyKey: input.idempotencyKey.trim(),
        reversalOfId: input.reversalOfId ?? null, reason: input.reason ?? null,
        lines: {
          create: lines.map((line, position) => ({
            position, accountId: line.accountId, side: line.side, amount: line.amount,
          })),
        },
      },
      include: { lines: { orderBy: { position: "asc" } } },
    });
  }

  async create(schoolId: string, actorId: string, input: {
    postingDate: string; description: string; idempotencyKey: string; lines: JournalDraftLine[];
  }) {
    return withSerializableRetry(() => this.prisma.client.$transaction(
      tx => this.insertDraft(tx, schoolId, actorId, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
  }

  async submit(schoolId: string, actorId: string, journalId: string) {
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const journal = await this.lock(tx, schoolId, journalId);
      if (journal.status !== "DRAFT") throw new ConflictException("Only DRAFT journals can be submitted.");
      if (journal.createdById !== actorId) throw new ForbiddenException("Only the preparer may submit this journal.");
      const payload = checkedPayload(journal);
      if (!prepareManualJournal(journal.lines.map(l => ({
        accountId: l.accountId, side: l.side, amount: l.amount.toFixed(2),
      }))).total.eq(journal.totalAmount)) throw new ConflictException("The stored journal no longer balances.");
      const policy = await tx.financeApprovalPolicy.upsert({
        where: { schoolId_subject_minAmount: {
          schoolId, subject: "MANUAL_JOURNAL", minAmount: new Prisma.Decimal(0),
        } },
        create: {
          schoolId, subject: "MANUAL_JOURNAL", minAmount: new Prisma.Decimal(0),
          requiredApprovals: 1, approverPermission: "MANUAL_JOURNAL_APPROVE",
        },
        update: {},
      });
      const applicable = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId, subject: "MANUAL_JOURNAL", minAmount: { lte: journal.totalAmount } },
        orderBy: { minAmount: "desc" },
      });
      if (!applicable || applicable.requiredApprovals !== 1 || applicable.approverPermission !== "MANUAL_JOURNAL_APPROVE"
        || policy.requiredApprovals < 1) {
        throw new ConflictException("A supported independent manual-journal approval policy is required.");
      }
      const hash = manualJournalHash(payload);
      const approval = await tx.financeApprovalRequest.create({
        data: {
          schoolId, subject: "MANUAL_JOURNAL", entityType: "FINANCE_MANUAL_JOURNAL",
          entityId: journal.id, requestedById: journal.createdById,
          payloadHash: hash, amount: journal.totalAmount,
        },
      });
      await tx.financeManualJournal.update({
        where: { id: journalId }, data: { status: "PENDING_APPROVAL", approvalHash: hash, submittedAt: new Date() },
      });
      return { journalId, approvalRequestId: approval.id, status: "PENDING_APPROVAL" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async decide(schoolId: string, actorId: string, journalId: string,
    actorSchoolRole: string | undefined, isSuperAdmin: boolean,
    decision: "APPROVED" | "REJECTED", note: string,
  ) {
    if (note.trim().length < 10) throw new BadRequestException("Approval decisions require a reason of at least 10 characters.");
    if (!isSuperAdmin && actorSchoolRole !== "owner" && actorSchoolRole !== "headteacher") {
      throw new ForbiddenException("An owner or headteacher must independently decide manual journals.");
    }
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const journal = await this.lock(tx, schoolId, journalId);
      if (journal.status !== "PENDING_APPROVAL" || !journal.approvalHash) {
        throw new ConflictException("Journal is not pending approval.");
      }
      if (actorId === journal.createdById) throw new ForbiddenException("A journal preparer may never approve their own entry.");
      const hash = manualJournalHash(checkedPayload(journal));
      if (hash !== journal.approvalHash) throw new ConflictException("The submitted journal has changed.");
      const approval = await tx.financeApprovalRequest.findFirst({
        where: { schoolId, entityType: "FINANCE_MANUAL_JOURNAL", entityId: journalId,
          subject: "MANUAL_JOURNAL", status: "PENDING", payloadHash: hash },
      });
      if (!approval || approval.requestedById !== journal.createdById) {
        throw new ConflictException("A matching pending independent approval was not found.");
      }
      const policy = await tx.financeApprovalPolicy.findFirst({
        where: { schoolId, subject: "MANUAL_JOURNAL", minAmount: { lte: journal.totalAmount } },
        orderBy: { minAmount: "desc" },
      });
      if (policy?.requiredApprovals !== 1 || policy.approverPermission !== "MANUAL_JOURNAL_APPROVE") {
        throw new ForbiddenException("Journal approval policy is unavailable or unsupported.");
      }
      const updated = await tx.financeApprovalRequest.updateMany({
        where: { id: approval.id, schoolId, status: "PENDING" },
        data: { status: decision, decidedById: actorId, decidedAt: new Date(), decisionNote: note.trim() },
      });
      if (updated.count !== 1) throw new ConflictException("The approval was already decided.");
      await tx.financeManualJournal.update({
        where: { id: journalId },
        data: {
          status: decision, approvalNote: note.trim(),
          approvedById: decision === "APPROVED" ? actorId : null,
          approvedAt: decision === "APPROVED" ? new Date() : null,
        },
      });
      return { journalId, status: decision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async post(schoolId: string, actorId: string, journalId: string) {
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const journal = await this.lock(tx, schoolId, journalId);
      if (journal.status === "POSTED") {
        return { journalId, status: "POSTED" as const, alreadyPosted: true };
      }
      if (journal.status !== "APPROVED" || !journal.approvedById || !journal.approvalHash) {
        throw new ForbiddenException("An independently approved journal is required to post.");
      }
      if (actorId === journal.approvedById) {
        throw new ForbiddenException("The approver cannot also post the manual journal.");
      }
      const hash = manualJournalHash(checkedPayload(journal));
      if (hash !== journal.approvalHash) throw new ConflictException("Journal details no longer match the approved payload.");
      const approval = await tx.financeApprovalRequest.findFirst({
        where: { schoolId, entityType: "FINANCE_MANUAL_JOURNAL", entityId: journalId, status: "APPROVED",
          payloadHash: hash, decidedById: journal.approvedById },
      });
      if (!approval) throw new ConflictException("Approved journal lacks a matching approval record.");
      const { lines, total } = prepareManualJournal(journal.lines.map(l => ({
        accountId: l.accountId, side: l.side, amount: l.amount.toFixed(2),
      })));
      if (!total.eq(journal.totalAmount)) throw new ConflictException("Journal total changed before posting.");
      if (journal.reversalOfId) {
        const original = await this.lock(tx, schoolId, journal.reversalOfId);
        if (original.status !== "POSTED") throw new ConflictException("Only a posted, unreversed journal may be reversed.");
      }
      const postings = pairManualJournal(lines);
      for (const pair of postings) {
        const transaction = await this.posting.post(tx, {
          schoolId, date: journal.postingDate, description: journal.description,
          amount: pair.amount, debitAccountId: pair.debitAccountId, creditAccountId: pair.creditAccountId,
          transactionType: "ADJUSTMENT",
          referenceType: journal.reversalOfId ? "MANUAL_JOURNAL_REVERSAL" : "MANUAL_JOURNAL",
          referenceId: journal.id, referenceNumber: journal.journalNumber,
        });
        await tx.financeManualJournalPosting.create({
          data: { journalId: journal.id, transactionId: transaction.id },
        });
      }
      if (journal.reversalOfId) {
        await tx.financeManualJournal.update({
          where: { id: journal.reversalOfId }, data: { status: "REVERSED" },
        });
      }
      await tx.financeManualJournal.update({
        where: { id: journalId }, data: { status: "POSTED", postedAt: new Date(), postedById: actorId },
      });
      return { journalId, status: "POSTED" as const, alreadyPosted: false, postingCount: postings.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async requestReversal(schoolId: string, actorId: string, journalId: string,
    input: { postingDate: string; reason: string; idempotencyKey: string },
  ) {
    const date = postingDate(input.postingDate);
    if (input.reason.trim().length < 10) throw new BadRequestException("Describe why the posted journal needs to be reversed.");
    return withSerializableRetry(() => this.prisma.client.$transaction(async tx => {
      const original = await this.lock(tx, schoolId, journalId);
      if (original.status !== "POSTED" || original.reversalOfId) {
        throw new ConflictException("Only an original, posted and unreversed journal can be reversed.");
      }
      if (date < original.postingDate) throw new BadRequestException("A reversal cannot predate the original journal.");
      const existing = await tx.financeManualJournal.findFirst({
        where: { schoolId, reversalOfId: journalId }, select: { id: true },
      });
      if (existing) throw new ConflictException("A reversal draft already exists for this journal.");
      return this.insertDraft(tx, schoolId, actorId, {
        postingDate: input.postingDate, description: "Reversal: " + original.description,
        idempotencyKey: input.idempotencyKey, reversalOfId: original.id, reason: input.reason.trim(),
        lines: original.lines.map(line => ({
          accountId: line.accountId, side: line.side === "DEBIT" ? "CREDIT" : "DEBIT",
          amount: line.amount.toFixed(2),
        })),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }
}
