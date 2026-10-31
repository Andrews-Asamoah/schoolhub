import { createHash } from "node:crypto";
import { Prisma, type AccountType } from "@prisma/client";

const zero = new Prisma.Decimal(0);
const debitNormal = (type: AccountType) => type === "ASSET" || type === "EXPENSE";

export type PeriodMovementInput = {
  accountId: string; code: string; name: string; accountType: AccountType;
  openingDebits: Prisma.Decimal; openingCredits: Prisma.Decimal;
  periodDebits: Prisma.Decimal; periodCredits: Prisma.Decimal;
};
export type PeriodSnapshotLineData = {
  accountId: string; code: string; name: string; accountType: AccountType;
  opening: string; debit: string; credit: string; closing: string;
};

/**
 * Sign conventions match the normal balance of an account.
 * A stable canonical hash permits I10 comparisons without relying on row order.
 * The caller must read the full ledger movement in one REPEATABLE READ snapshot.
 */
export function buildPeriodSnapshot(inputs: readonly PeriodMovementInput[], scope: {
  schoolId: string; startDate: string; endDate: string;
}) {
  if (!scope.schoolId.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(scope.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(scope.endDate) ||
      scope.startDate > scope.endDate) {
    throw new Error("A valid school and accounting-period scope are required to hash a snapshot.");
  }
  const ids = new Set<string>();
  const lines: PeriodSnapshotLineData[] = inputs.map(item => {
    if (ids.has(item.accountId)) throw new Error("A snapshot cannot contain duplicate chart accounts.");
    ids.add(item.accountId);
    const { openingDebits, openingCredits, periodDebits, periodCredits } = item;
    for (const amount of [openingDebits, openingCredits, periodDebits, periodCredits]) {
      if (!amount.isFinite() || amount.lt(zero) || amount.decimalPlaces() > 2) {
        throw new Error("Ledger movements must be finite, non-negative amounts with two decimals.");
      }
    }
    const normal = debitNormal(item.accountType);
    const opening = normal ? openingDebits.minus(openingCredits) : openingCredits.minus(openingDebits);
    const movement = normal ? periodDebits.minus(periodCredits) : periodCredits.minus(periodDebits);
    return {
      accountId: item.accountId, code: item.code, name: item.name,
      accountType: item.accountType, opening: opening.toFixed(2),
      debit: periodDebits.toFixed(2), credit: periodCredits.toFixed(2),
      closing: opening.plus(movement).toFixed(2),
    };
  }).sort((a, b) => a.code.localeCompare(b.code) || a.accountId.localeCompare(b.accountId));
  const openingDebit = inputs.reduce((sum, entry) => sum.plus(entry.openingDebits), zero);
  const openingCredit = inputs.reduce((sum, entry) => sum.plus(entry.openingCredits), zero);
  if (!openingDebit.eq(openingCredit)) throw new Error("An unbalanced opening ledger cannot be snapshotted.");
  const totalDebit = inputs.reduce((sum, entry) => sum.plus(entry.periodDebits), zero);
  const totalCredit = inputs.reduce((sum, entry) => sum.plus(entry.periodCredits), zero);
  if (!totalDebit.eq(totalCredit)) throw new Error("An unbalanced ledger cannot be snapshotted.");
  const canonical = JSON.stringify({ schemaVersion: 2, scope, lines });
  return {
    schemaVersion: 2 as const,
    scope,
    lines,
    totalDebits: totalDebit.toFixed(2),
    totalCredits: totalCredit.toFixed(2),
    contentHash: createHash("sha256").update(canonical).digest("hex"),
  };
}
