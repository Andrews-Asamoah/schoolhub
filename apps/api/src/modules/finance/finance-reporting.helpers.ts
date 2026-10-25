import { Prisma } from "@prisma/client";
import type { StudentStatementEntry, StudentStatementEntryType } from "@schoolhub/shared";

export interface StatementEvent {
  id: string;
  date: string;
  type: StudentStatementEntryType;
  reference: string;
  description: string;
  academicYear?: string | null;
  term?: string | null;
  billId?: string | null;
  paymentId?: string | null;
  amount: Prisma.Decimal;
}

const TYPE_ORDER: Record<StudentStatementEntryType, number> = {
  INVOICE: 1,
  DISCOUNT: 2,
  RECEIPT: 3,
  REVERSAL: 4,
  REFUND: 4,
  ADJUSTMENT: 5,
};

/** Build a chronological running balance without converting money to JS numbers. */
export function buildRunningStatement(
  openingBalance: Prisma.Decimal,
  input: readonly StatementEvent[],
): { entries: StudentStatementEntry[]; closingBalance: Prisma.Decimal } {
  const events = [...input].sort((a, b) =>
    a.date.localeCompare(b.date) ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
    a.id.localeCompare(b.id),
  );
  let balance = openingBalance;
  const entries = events.map((event) => {
    balance = balance.plus(event.amount);
    return {
      id: event.id,
      date: event.date,
      type: event.type,
      reference: event.reference,
      description: event.description,
      academicYear: event.academicYear ?? null,
      term: event.term ?? null,
      billId: event.billId ?? null,
      paymentId: event.paymentId ?? null,
      amount: event.amount.toFixed(2),
      runningBalance: balance.toFixed(2),
    };
  });
  return { entries, closingBalance: balance };
}

/** Whole calendar days overdue based on UTC date parts, not the browser timezone. */
export function daysPastDue(dueDate: Date, asOf: Date): number {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const end = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.floor((end - due) / 86_400_000);
}
