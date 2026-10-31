import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export type StatementCandidate = {
  id: string;
  schoolId: string;
  financeAccountId: string;
  amount: Prisma.Decimal;
  date: string; // YYYY-MM-DD
  reference?: string | null;
  unmatchedAmount: Prisma.Decimal;
};

export type StatementMovement = {
  schoolId: string;
  financeAccountId: string;
  amount: Prisma.Decimal; // positive: deposit, negative: withdrawal
  date: string;
  reference?: string | null;
  description: string;
};

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal.Value) => {
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.decimalPlaces() > 2) {
    throw new Error("Reconciliation amounts must be finite currency values with at most two decimal places");
  }
  return amount;
};

/** Deterministic file fingerprint for exact duplicate-file rejection (hash raw bytes before decoding). */
export function statementFileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Canonical reference; absence is not an exact-reference match. */
export function normaliseBankReference(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function dateDistanceDays(a: string, b: string): number {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(a) || !iso.test(b)) throw new Error("Invalid statement date");
  const first = Date.parse(a + "T00:00:00Z");
  const second = Date.parse(b + "T00:00:00Z");
  if (!Number.isFinite(first) || !Number.isFinite(second)
    || new Date(first).toISOString().slice(0, 10) !== a
    || new Date(second).toISOString().slice(0, 10) !== b) throw new Error("Invalid statement date");
  return Math.abs(first - second) / 86400000;
}

export type SuggestedMatch = { candidateId: string; confidence: Prisma.Decimal; reason: "EXACT_REFERENCE" | "AMOUNT_AND_DATE" };

/**
 * Candidate generation only; no funds are marked cleared and no journal is posted.
 * Scope, sign, amount and available balance are mandatory before scoring.
 * Any ambiguous high-scoring candidates still require human review.
 */
export function suggestStatementMatches(
  line: StatementMovement,
  candidates: readonly StatementCandidate[],
  windowDays = 3,
): SuggestedMatch[] {
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 31) throw new Error("Invalid matching window");
  if (money(line.amount).isZero()) return [];
  const reference = normaliseBankReference(line.reference);
  return candidates.flatMap((candidate) => {
    if (candidate.schoolId !== line.schoolId || candidate.financeAccountId !== line.financeAccountId) return [];
    if (!money(candidate.amount).eq(money(line.amount))) return [];
    if (money(candidate.unmatchedAmount).abs().lt(money(line.amount).abs())) return [];
    const dateDelta = dateDistanceDays(candidate.date, line.date);
    const referenceEqual = reference.length > 0 && reference === normaliseBankReference(candidate.reference);
    if (!referenceEqual && dateDelta > windowDays) return [];
    return [{
      candidateId: candidate.id,
      confidence: new Prisma.Decimal(referenceEqual ? "0.990" : "0.750"),
      reason: referenceEqual ? "EXACT_REFERENCE" as const : "AMOUNT_AND_DATE" as const,
    }];
  }).sort((a, b) => b.confidence.comparedTo(a.confidence) || a.candidateId.localeCompare(b.candidateId));
}

export type ReconcilingItem = { amount: Prisma.Decimal; kind: "UNCLEARED_RECEIPT" | "UNPRESENTED_PAYMENT" };

/**
 * Book balance = statement + deposits in transit - unpresented payments.
 * Values are signed *positive magnitudes*; corrections are separate postings.
 */
export function calculateBankReconciliation(
  statementBalance: Prisma.Decimal.Value,
  bookBalance: Prisma.Decimal.Value,
  items: readonly ReconcilingItem[],
) {
  let outstandingReceipts = ZERO;
  let outstandingPayments = ZERO;
  for (const item of items) {
    const amount = money(item.amount);
    if (!amount.isFinite() || amount.lte(0)) throw new Error("Reconciling amounts must be positive");
    if (item.kind === "UNCLEARED_RECEIPT") outstandingReceipts = outstandingReceipts.plus(amount);
    else if (item.kind === "UNPRESENTED_PAYMENT") outstandingPayments = outstandingPayments.plus(amount);
    else throw new Error("Unknown reconciling item");
  }
  const adjustedStatementBalance = money(statementBalance).plus(outstandingReceipts).minus(outstandingPayments);
  const difference = adjustedStatementBalance.minus(money(bookBalance));
  return { outstandingReceipts, outstandingPayments, adjustedStatementBalance, difference, canSubmit: difference.isZero() };
}
