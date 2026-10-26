import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, type TransactionCategory } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

export type PostingInput = {
  schoolId: string; date: Date; description: string; amount: Prisma.Decimal;
  debitAccountId: string; creditAccountId: string;
  transactionType: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT";
  category?: TransactionCategory | null;
  referenceType?: string | null; referenceId?: string | null;
  referenceNumber?: string | null; notes?: string | null;
};

/**
 * The single P0 write path for paired journal transactions.
 * Caller provides the current database transaction, so business rows and postings
 * either commit together or all roll back.
 */
@Injectable()
export class FinancePostingService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Prisma.TransactionClient, input: PostingInput) {
    if (!input.amount.isFinite() || input.amount.lte(0) || input.amount.decimalPlaces() > 2) {
      throw new BadRequestException("Posting amount must be a positive two-decimal amount.");
    }
    if (input.debitAccountId === input.creditAccountId) throw new BadRequestException("Debit and credit accounts must differ.");
    const [debit, credit, lock] = await Promise.all([
      tx.chartAccount.findFirst({ where: { id: input.debitAccountId, schoolId: input.schoolId, isActive: true } }),
      tx.chartAccount.findFirst({ where: { id: input.creditAccountId, schoolId: input.schoolId, isActive: true } }),
      tx.financePeriodLock.findUnique({ where: { schoolId: input.schoolId } }),
    ]);
    if (!debit || !credit) throw new BadRequestException("Accounts must be active and belong to this school.");
    if (lock && input.date <= lock.lockedThrough) throw new BadRequestException("Posting date is in a closed accounting period.");
    const prefix = `TXN-${input.date.getUTCFullYear()}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.schoolId}), hashtext(${prefix}))`;
    const previous = await tx.transaction.findFirst({
      where: { schoolId: input.schoolId, transactionNumber: { startsWith: prefix } },
      orderBy: { transactionNumber: "desc" }, select: { transactionNumber: true },
    });
    const number = previous ? Number(previous.transactionNumber.slice(prefix.length)) + 1 : 1;
    const posting = await tx.transaction.create({
      data: {
        schoolId: input.schoolId, transactionNumber: prefix + String(number).padStart(5, "0"),
        transactionDate: input.date, description: input.description, amount: input.amount,
        debitAccountId: debit.id, creditAccountId: credit.id,
        transactionType: input.transactionType, category: input.category,
        referenceType: input.referenceType, referenceId: input.referenceId,
        referenceNumber: input.referenceNumber, notes: input.notes,
      },
    });
    const increaseDebit = debit.accountType === "ASSET" || debit.accountType === "EXPENSE";
    const increaseCredit = credit.accountType === "LIABILITY" || credit.accountType === "EQUITY" || credit.accountType === "REVENUE";
    await tx.chartAccount.update({ where: { id: debit.id }, data: { balance: increaseDebit ? { increment: input.amount } : { decrement: input.amount } } });
    await tx.chartAccount.update({ where: { id: credit.id }, data: { balance: increaseCredit ? { increment: input.amount } : { decrement: input.amount } } });
    return posting;
  }
}
