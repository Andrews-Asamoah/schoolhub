import { BadRequestException } from "@nestjs/common";
import { Prisma, type FinanceJournalSide } from "@prisma/client";
import { createHash } from "node:crypto";

export type JournalDraftLine = { accountId: string; side: FinanceJournalSide; amount: string };
export type PreparedJournalLine = { accountId: string; side: FinanceJournalSide; amount: Prisma.Decimal };
const zero = new Prisma.Decimal(0);
const isPositiveMoney = (value: string) => /^\d{1,13}(?:\.\d{1,2})?$/.test(value) && new Prisma.Decimal(value).gt(zero);

/** Pure P2 safeguards: never post an unbalanced journal or a same-account pair. */
export function prepareManualJournal(lines: readonly JournalDraftLine[]) {
  if (lines.length < 2 || lines.length > 50) throw new BadRequestException("Supply 2 to 50 journal lines.");
  const prepared: PreparedJournalLine[] = lines.map(line => {
    if (!line.accountId.trim() || !["DEBIT", "CREDIT"].includes(line.side) || !isPositiveMoney(line.amount)) {
      throw new BadRequestException("Each journal line needs an account, a valid side and a positive two-decimal amount.");
    }
    return { accountId: line.accountId.trim(), side: line.side, amount: new Prisma.Decimal(line.amount) };
  });
  const debit = prepared.filter(line => line.side === "DEBIT");
  const credit = prepared.filter(line => line.side === "CREDIT");
  if (!debit.length || !credit.length) throw new BadRequestException("A journal needs debit and credit entries.");
  const debitTotal = debit.reduce((sum, line) => sum.plus(line.amount), zero);
  const creditTotal = credit.reduce((sum, line) => sum.plus(line.amount), zero);
  if (!debitTotal.eq(creditTotal)) throw new BadRequestException("Journal debits must exactly equal credits.");
  const debitIds = new Set(debit.map(line => line.accountId));
  if (credit.some(line => debitIds.has(line.accountId))) {
    throw new BadRequestException("An account cannot appear on both sides of the same manual journal.");
  }
  return { lines: prepared, total: debitTotal };
}

/** Decompose balanced multi-line journals into atomic paired postings for the legacy ledger. */
export function pairManualJournal(lines: readonly PreparedJournalLine[]) {
  const debit = lines.filter(l => l.side === "DEBIT").map(l => ({ ...l, left: l.amount }));
  const credit = lines.filter(l => l.side === "CREDIT").map(l => ({ ...l, left: l.amount }));
  const result: Array<{ debitAccountId: string; creditAccountId: string; amount: Prisma.Decimal }> = [];
  let i = 0; let j = 0;
  while (i < debit.length && j < credit.length) {
    const d = debit[i]!; const c = credit[j]!;
    if (d.accountId === c.accountId) throw new BadRequestException("Cannot post a same-account journal pair.");
    const amount = Prisma.Decimal.min(d.left, c.left);
    if (amount.lte(zero)) throw new BadRequestException("Journal contained an invalid residual amount.");
    result.push({ debitAccountId: d.accountId, creditAccountId: c.accountId, amount });
    d.left = d.left.minus(amount); c.left = c.left.minus(amount);
    if (d.left.eq(zero)) i++;
    if (c.left.eq(zero)) j++;
  }
  if (i !== debit.length || j !== credit.length) throw new BadRequestException("Journal pairing did not balance.");
  return result;
}

export function manualJournalPayload(journal: {
  schoolId: string; id: string; postingDate: Date; description: string;
  reversalOfId: string | null; lines: Array<{
    position: number; accountId: string; side: FinanceJournalSide; amount: Prisma.Decimal;
  }>;
}) {
  return {
    schoolId: journal.schoolId, journalId: journal.id,
    date: journal.postingDate.toISOString().slice(0, 10),
    description: journal.description, reversalOfId: journal.reversalOfId,
    lines: [...journal.lines].sort((a,b) => a.position - b.position).map(line => ({
      position: line.position, accountId: line.accountId, side: line.side,
      amount: line.amount.toFixed(2),
    })),
  };
}

export function manualJournalHash(payload: ReturnType<typeof manualJournalPayload>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
