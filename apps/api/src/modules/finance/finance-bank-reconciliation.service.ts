import { withSerializableRetry } from "./finance.helpers.js";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { decodeStatement, type StatementMapping } from "./statement-decoder.js";
import { previewStatement } from "./statement-import.js";
const date = (value: string) => new Date(value + "T00:00:00Z");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
@Injectable()
export class FinanceBankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}
  private transact<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, _options?: { isolationLevel: Prisma.TransactionIsolationLevel }) {
    return withSerializableRetry(() => this.prisma.client.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 }));
  }
  private async account(tx: Prisma.TransactionClient, schoolId: string, id: string) {
    const account = await tx.chartAccount.findFirst({ where: { id, schoolId, isActive: true, accountType: "ASSET", category: { in: ["BANK", "CASH"] } } });
    if (!account) throw new NotFoundException("Active school cash/bank account not found.");
    return account;
  }
  private async lock(tx: Prisma.TransactionClient, schoolId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-posting-boundary'))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-bank-reconciliation'))`;
  }
  private async audit(tx: Prisma.TransactionClient, schoolId: string, actorId: string, id: string, event: string) {
    await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "BANK_RECONCILIATION", entityId: id, newValues: { event } } });
  }
  async preview(schoolId: string, file: Express.Multer.File, input: { accountId: string; startDate: string; endDate: string; openingBalance: string; closingBalance: string; mapping: StatementMapping }) {
    await this.account(this.prisma.client, schoolId, input.accountId);
    if (input.endDate > new Date().toISOString().slice(0, 10)) throw new BadRequestException("Future statements cannot be reconciled.");
    const rows = await decodeStatement(file.buffer, file.originalname, input.mapping);
    return previewStatement({ ...input, schoolId, rows }, file.buffer);
  }
  async import(schoolId: string, actorId: string, file: Express.Multer.File, input: Parameters<FinanceBankReconciliationService["preview"]>[2] & { duplicateReviewReason?: string }) {
    const preview = await this.preview(schoolId, file, input);
    if (preview.requiresDuplicateReview && (input.duplicateReviewReason?.trim().length ?? 0) < 10) throw new BadRequestException("Explain the reviewed duplicate statement lines before importing.");
    return this.transact(async tx => {
      await this.lock(tx, schoolId); await this.account(tx, schoolId, input.accountId);
      const existing = await tx.financeBankStatement.findFirst({ where: { schoolId, accountId: input.accountId, OR: [{ fileHash: preview.fileHash }, { startDate: { lte: date(input.endDate) }, endDate: { gte: date(input.startDate) } }] } });
      if (existing) throw new ConflictException("An identical or overlapping statement already exists for this account.");
      const statement = await tx.financeBankStatement.create({ data: { schoolId, accountId: input.accountId, sourceBytes: new Uint8Array(file.buffer), fileName: file.originalname.slice(0,200), fileHash: preview.fileHash, startDate: date(input.startDate), endDate: date(input.endDate), openingBalance: preview.openingBalance, closingBalance: preview.closingBalance, mapping: input.mapping, duplicateReviewReason: input.duplicateReviewReason, createdById: actorId,
        lines: { create: preview.rows.map(row => ({ ...row, date: date(row.date) })) } } });
      const reconciliation = await tx.financeBankReconciliation.create({ data: { schoolId, accountId: input.accountId, statementId: statement.id, periodEnd: statement.endDate, createdById: actorId } });
      await this.audit(tx, schoolId, actorId, reconciliation.id, "IMPORTED"); return reconciliation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async journalAccounts(schoolId: string) {
    return this.prisma.client.chartAccount.findMany({ where: { schoolId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take: 1000 });
  }
  async accounts(schoolId: string) {
    return this.prisma.client.chartAccount.findMany({ where: { schoolId, isActive: true, accountType: "ASSET", category: { in: ["BANK", "CASH"] } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  }
  async candidates(schoolId: string, id: string, page: number) {
    const record = await this.record(this.prisma.client, schoolId, id);
    return this.prisma.client.transaction.findMany({ where: { schoolId, transactionDate: { lte: record.periodEnd }, OR: [{ debitAccountId: record.accountId }, { creditAccountId: record.accountId }] }, orderBy: [{ transactionDate: "desc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50, select: { id: true, transactionDate: true, transactionNumber: true, description: true, amount: true, debitAccountId: true } });
  }
  async source(schoolId: string, actorId: string, id: string) {
    const record = await this.record(this.prisma.client, schoolId, id);
    await this.audit(this.prisma.client, schoolId, actorId, id, "SOURCE_DOWNLOADED");
    return this.prisma.client.financeBankStatement.findUniqueOrThrow({ where: { id: record.statementId }, select: { sourceBytes: true, fileName: true } });
  }
  async amend(schoolId: string, actorId: string, id: string) {
    return this.transact(async tx => {
      await this.lock(tx, schoolId); const record = await this.record(tx, schoolId, id);
      if (record.status !== "APPROVED" || await tx.financeBankReconciliation.count({ where: { supersedesId: id } })) throw new ConflictException("Only the latest approved reconciliation may be amended.");
      const lock = await tx.financePeriodLock.findUnique({ where: { schoolId } });
      if (lock && lock.lockedThrough >= record.periodEnd) throw new ConflictException("Reopen the accounting period before amending its reconciliation.");
      const next = await tx.financeBankReconciliation.create({ data: { schoolId, accountId: record.accountId, statementId: record.statementId, periodEnd: record.periodEnd, version: record.version + 1, supersedesId: id, createdById: actorId } });
      const matches = await tx.financeBankMatch.findMany({ where: { reconciliationId: id } });
      await tx.financeBankMatch.createMany({ data: matches.map(match => ({ schoolId, accountId: record.accountId, reconciliationId: next.id, statementLineId: match.statementLineId, transactionId: match.transactionId, amount: match.amount, createdById: actorId })) });
      await this.audit(tx, schoolId, actorId, next.id, "AMENDMENT_CREATED"); return next;
    });
  }
  async revise(schoolId: string, actorId: string, id: string) {
    return this.transact(async tx => {
      await this.lock(tx, schoolId); const record = await this.record(tx, schoolId, id);
      if (record.status !== "REJECTED" || record.createdById !== actorId) throw new ForbiddenException("Only the preparer may revise a rejected reconciliation.");
      await tx.auditLog.create({ data: { schoolId, userId: actorId, action: "UPDATE", entityType: "BANK_RECONCILIATION_REVISION", entityId: id,
        oldValues: { snapshot: record.snapshot, contentHash: record.contentHash, decisionNote: record.decisionNote, decidedById: record.decidedById } as Prisma.InputJsonValue } });
      return tx.financeBankReconciliation.update({ where: { id }, data: { status: "DRAFT", submittedAt: null, decidedAt: null, decidedById: null, decisionNote: null, snapshot: Prisma.DbNull, contentHash: null } });
    });
  }
  async unmatch(schoolId: string, actorId: string, id: string, matchId: string) {
    return this.transact(async tx => {
      await this.lock(tx, schoolId); const record = await this.record(tx, schoolId, id);
      if (record.status !== "DRAFT") throw new ConflictException("Only draft matches can be removed.");
      const match = await tx.financeBankMatch.findFirst({ where: { id: matchId, schoolId, reconciliationId: id, statementLine: { statementId: record.statementId } } });
      if (!match) throw new NotFoundException("Match not found.");
      await tx.financeBankMatch.delete({ where: { id: matchId } });
      await this.audit(tx, schoolId, actorId, id, "UNMATCHED"); return { success: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async list(schoolId: string) {
    return this.prisma.client.financeBankReconciliation.findMany({ where: { schoolId, supersededBy: null }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 100 });
  }
  private async record(tx: Prisma.TransactionClient, schoolId: string, id: string) {
    const record = await tx.financeBankReconciliation.findFirst({ where: { id, schoolId } });
    if (!record) throw new NotFoundException("Reconciliation not found.");
    return record;
  }
  async detail(schoolId: string, id: string) {
    return this.transact(async tx => {
      const record = await this.record(tx, schoolId, id);
      const statement = await tx.financeBankStatement.findUniqueOrThrow({ where: { id: record.statementId }, include: { lines: { include: { matches: { where: { reconciliationId: id } } }, orderBy: { rowNumber: "asc" } } } });
      const { sourceBytes: _source, ...evidence } = statement;
      return { ...record, statement: evidence };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async match(schoolId: string, actorId: string, id: string, input: { statementLineId: string; transactionId: string; amount: string }) {
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw new BadRequestException("Enter a positive two-decimal match amount.");
    return this.transact(async tx => {
      await this.lock(tx, schoolId);
      const record = await this.record(tx, schoolId, id);
      if (record.status !== "DRAFT") throw new ConflictException("Only draft reconciliations can be matched.");
      const line = await tx.financeBankStatementLine.findFirst({ where: { id: input.statementLineId, statementId: record.statementId }, include: { matches: { where: { reconciliationId: id } } } });
      const posting = await tx.transaction.findFirst({ where: { id: input.transactionId, schoolId, transactionDate: { lte: record.periodEnd }, OR: [{ debitAccountId: record.accountId }, { creditAccountId: record.accountId }] } });
      if (!line || !posting) throw new NotFoundException("Statement line or school account posting not found.");
      const positive = posting.debitAccountId === record.accountId;
      if (line.amount.isPositive() !== positive) throw new ConflictException("Statement and ledger directions differ.");
      const allocated = await tx.financeBankMatch.aggregate({ where: { schoolId, accountId: record.accountId, transactionId: posting.id, reconciliation: { supersededBy: null } }, _sum: { amount: true } });
      if (line.matches.reduce((sum, item) => sum.plus(item.amount), amount).gt(line.amount.abs()) || amount.plus(allocated._sum.amount ?? 0).gt(posting.amount)) throw new ConflictException("Match exceeds the unallocated statement or ledger amount.");
      const match = await tx.financeBankMatch.create({ data: { schoolId, accountId: record.accountId, reconciliationId: id, statementLineId: line.id, transactionId: posting.id, amount, createdById: actorId } });
      await this.audit(tx, schoolId, actorId, id, "MATCHED"); return match;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async closeEvidence(tx: Prisma.TransactionClient, schoolId: string, id: string) {
    const record = await this.record(tx, schoolId, id);
    const statement = await tx.financeBankStatement.findUniqueOrThrow({ where: { id: record.statementId }, include: { lines: { include: { matches: { where: { reconciliationId: id } } } } } });
    if (statement.lines.some(line => !line.matches.reduce((sum, match) => sum.plus(match.amount), new Prisma.Decimal(0)).eq(line.amount.abs()))) throw new ConflictException("Every statement line must be fully matched before submission.");
    const earlier = await tx.financeBankReconciliation.findMany({ where: { schoolId, accountId: record.accountId, periodEnd: { lt: record.periodEnd }, supersededBy: null }, orderBy: { periodEnd: "desc" } });
    if (earlier.some(item => item.status !== "APPROVED")) throw new ConflictException("Earlier statements require approval before this reconciliation can be submitted.");
    if (earlier[0]) {
      const previous = await tx.financeBankStatement.findUniqueOrThrow({ where: { id: earlier[0].statementId } });
      if (previous.endDate.getTime() + 86400000 !== statement.startDate.getTime() || !previous.closingBalance.eq(statement.openingBalance)) throw new ConflictException("Statement dates and opening balance must continue from the previous approved statement.");
    }
    const postings = await tx.transaction.findMany({ where: { schoolId, transactionDate: { lte: record.periodEnd }, OR: [{ debitAccountId: record.accountId }, { creditAccountId: record.accountId }] }, orderBy: { id: "asc" } });
    const matches = await tx.financeBankMatch.findMany({ where: { schoolId, accountId: record.accountId, reconciliation: { supersededBy: null }, statementLine: { statement: { endDate: { lte: record.periodEnd } } } } });
    const allocatedByPosting = new Map<string, Prisma.Decimal>();
    for (const match of matches) allocatedByPosting.set(match.transactionId, (allocatedByPosting.get(match.transactionId) ?? new Prisma.Decimal(0)).plus(match.amount));
    let book = new Prisma.Decimal(0), outstanding = new Prisma.Decimal(0);
    const items = postings.map(posting => {
      const sign = posting.debitAccountId === record.accountId ? 1 : -1;
      const allocated = allocatedByPosting.get(posting.id) ?? new Prisma.Decimal(0);
      if (allocated.gt(posting.amount)) throw new ConflictException("Ledger entry is overallocated.");
      const remaining = posting.amount.minus(allocated).times(sign);
      book = book.plus(posting.amount.times(sign)); outstanding = outstanding.plus(remaining);
      return { transactionId: posting.id, outstanding: remaining.toFixed(2) };
    }).filter(item => item.outstanding !== "0.00");
    const difference = statement.closingBalance.plus(outstanding).minus(book);
    if (!difference.isZero()) throw new ConflictException("Statement and ledger bridge do not reconcile to zero.");
    return { statementId: statement.id, fileHash: statement.fileHash, periodEnd: record.periodEnd.toISOString().slice(0, 10), bookBalance: book.toFixed(2), statementBalance: statement.closingBalance.toFixed(2), outstandingItems: items, difference: difference.toFixed(2), matches: matches.map(match => ({ id: match.id, amount: match.amount.toFixed(2) })).sort((a,b) => a.id.localeCompare(b.id)) };
  }
  async submit(schoolId: string, actorId: string, id: string) {
    return this.transact(async tx => {
      await this.lock(tx, schoolId); const record = await this.record(tx, schoolId, id);
      if (record.status !== "DRAFT" || record.createdById !== actorId) throw new ForbiddenException("Only the preparer can submit a draft.");
      const snapshot = await this.closeEvidence(tx, schoolId, id);
      const result = await tx.financeBankReconciliation.update({ where: { id }, data: { status: "PENDING", submittedAt: new Date(), snapshot, contentHash: hash(snapshot) } });
      await this.audit(tx, schoolId, actorId, id, "SUBMITTED"); return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async decide(schoolId: string, actorId: string, role: string | undefined, id: string, approve: boolean, note: string) {
    if (!["owner", "headteacher"].includes(role ?? "")) throw new ForbiddenException("An owner or headteacher must review reconciliations.");
    if (note.trim().length < 10) throw new BadRequestException("Provide a decision reason of at least 10 characters.");
    return this.transact(async tx => {
      await this.lock(tx, schoolId); const record = await this.record(tx, schoolId, id);
      if (record.status !== "PENDING") throw new ConflictException("Reconciliation is not pending approval.");
      if (record.createdById === actorId) throw new ForbiddenException("The preparer cannot approve their own reconciliation.");
      if (approve && hash(await this.closeEvidence(tx, schoolId, id)) !== record.contentHash) throw new ConflictException("Ledger or matching changed after submission; reject and prepare again.");
      const result = await tx.financeBankReconciliation.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actorId, decidedAt: new Date(), decisionNote: note.trim() } });
      await this.audit(tx, schoolId, actorId, id, approve ? "APPROVED" : "REJECTED"); return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
