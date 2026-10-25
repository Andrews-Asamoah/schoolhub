import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export interface ReportingCursor {
  id: string;
  timestamp: string;
}

export function encodeReportingCursor(cursor: ReportingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeReportingCursor(cursor: string | undefined): ReportingCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ReportingCursor>;
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.timestamp !== "string" ||
      Number.isNaN(new Date(parsed.timestamp).getTime())
    ) throw new Error("invalid cursor");
    return { id: parsed.id, timestamp: new Date(parsed.timestamp).toISOString() };
  } catch {
    throw new BadRequestException("The page cursor is invalid. Refresh the list and try again.");
  }
}

export function parseReportingDate(value: string | undefined, label: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    throw new BadRequestException(`Enter ${label} as YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`Enter a valid ${label.toLowerCase()}.`);
  }
  return date;
}

export interface StatementLedgerEvent {
  id: string;
  date: Date;
  type: "INVOICE" | "DISCOUNT" | "RECEIPT" | "REVERSAL" | "REFUND" | "ADJUSTMENT";
  reference: string;
  description: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  billId?: string | null;
  paymentId?: string | null;
}

const EVENT_ORDER: Record<StatementLedgerEvent["type"], number> = {
  INVOICE: 0,
  DISCOUNT: 1,
  RECEIPT: 2,
  REVERSAL: 3,
  REFUND: 3,
  ADJUSTMENT: 4,
};

/** Sorts and calculates a statement with decimal-only balance arithmetic. */
export function buildRunningStatementEntries(
  openingBalance: Prisma.Decimal,
  source: StatementLedgerEvent[],
) {
  let balance = openingBalance;
  const ordered = [...source].sort((a, b) =>
    a.date.getTime() - b.date.getTime() ||
    EVENT_ORDER[a.type] - EVENT_ORDER[b.type] ||
    a.id.localeCompare(b.id),
  );
  return ordered.map((entry) => {
    balance = balance.plus(entry.debit).minus(entry.credit);
    return {
      id: entry.id,
      date: entry.date.toISOString(),
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      debit: Number(entry.debit.toFixed(2)),
      credit: Number(entry.credit.toFixed(2)),
      balance: Number(balance.toFixed(2)),
      billId: entry.billId ?? null,
      paymentId: entry.paymentId ?? null,
    };
  });
}
