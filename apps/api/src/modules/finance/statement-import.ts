import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { dateDistanceDays, statementFileHash } from "./bank-reconciliation.helpers.js";

export type StatementRow = { date: string; amount: string; reference?: string; description: string };
const decimal = (value: string) => {
  if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException("Statement amounts require signed decimal currency values with at most two decimals.");
  const amount = new Prisma.Decimal(value);
  if (amount.isZero()) throw new BadRequestException("Statement movements cannot be zero.");
  return amount;
};

/** Validate a mapped statement before persistence. Never creates ledger postings. */
export function previewStatement(input: {
  schoolId: string; accountId: string; startDate: string; endDate: string;
  openingBalance: string; closingBalance: string; rows: StatementRow[];
}, source: Uint8Array) {
  if (!input.schoolId.trim() || !input.accountId.trim()) throw new BadRequestException("School and account scope are required.");
  if (!source.length || source.length > 5 * 1024 * 1024) throw new BadRequestException("Statement files must be between 1 byte and 5 MB.");
  try { dateDistanceDays(input.startDate, input.endDate); } catch { throw new BadRequestException("Invalid statement dates."); }
  if (input.startDate > input.endDate) throw new BadRequestException("Statement dates are reversed.");
  if (input.rows.length > 5000) throw new BadRequestException("Statements cannot exceed 5000 movements.");
  const balance = (value: string) => {
    if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(value)) throw new BadRequestException("Invalid statement balance.");
    return new Prisma.Decimal(value);
  };
  const opening = balance(input.openingBalance), closing = balance(input.closingBalance);
  const seen = new Set<string>();
  const duplicateRows: number[] = [];
  const rows = input.rows.map((row, index) => {
    try { dateDistanceDays(row.date, row.date); } catch { throw new BadRequestException(`Invalid date at row ${index + 1}.`); }
    if (row.date < input.startDate || row.date > input.endDate) throw new BadRequestException(`Row ${index + 1} is outside the statement period.`);
    if (!row.description.trim() || row.description.length > 500 || (row.reference?.length ?? 0) > 200) throw new BadRequestException(`Invalid description or reference at row ${index + 1}.`);
    const amount = decimal(row.amount).toFixed(2);
    const item = { rowNumber: index + 1, date: row.date, amount, reference: row.reference?.trim() || null, description: row.description.trim() };
    const key = JSON.stringify([item.date, item.amount, item.reference, item.description]);
    if (seen.has(key)) duplicateRows.push(index + 1);
    seen.add(key);
    return item;
  });
  const movement = rows.reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
  const calculatedClosing = opening.plus(movement);
  if (!calculatedClosing.eq(closing)) throw new BadRequestException("Statement opening balance plus movements does not equal its closing balance.");
  return { schoolId: input.schoolId, accountId: input.accountId, fileHash: statementFileHash(source),
    openingBalance: opening.toFixed(2), closingBalance: closing.toFixed(2), movement: movement.toFixed(2), rows,
    duplicateRows, requiresDuplicateReview: duplicateRows.length > 0 };
}
