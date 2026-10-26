import { Injectable } from "@nestjs/common";
import { Prisma, type AccountType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

const zero = new Prisma.Decimal(0);
function debitSign(type: AccountType) { return type === "ASSET" || type === "EXPENSE" ? 1 : -1; }

/** Read-only P0 ledger diagnostics; scoped to one tenant, no ledger mutation. */
@Injectable()
export class FinanceLedgerIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async check(schoolId: string) {
    const db = this.prisma.client;
    const [accountRows, debitRows, creditRows] = await Promise.all([
      db.chartAccount.findMany({ where: { schoolId }, select: { id: true, accountType: true, balance: true } }),
      db.transaction.groupBy({ by: ["debitAccountId"], where: { schoolId }, _sum: { amount: true } }),
      db.transaction.groupBy({ by: ["creditAccountId"], where: { schoolId }, _sum: { amount: true } }),
    ]);
    const totals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    const add = (id: string, side: "debit" | "credit", amount: Prisma.Decimal) => {
      const row = totals.get(id) ?? { debit: zero, credit: zero };
      row[side] = row[side].plus(amount);
      totals.set(id, row);
    };
    for (const row of debitRows) add(row.debitAccountId, "debit", row._sum.amount ?? zero);
    for (const row of creditRows) add(row.creditAccountId, "credit", row._sum.amount ?? zero);
    const control = new Map(accountRows.map(a => [a.id, a]));
    const orphanAccounts = [...totals.keys()].filter(id => !control.has(id));
    const discrepancies = accountRows.flatMap(a => {
      const movement = totals.get(a.id) ?? { debit: zero, credit: zero };
      const derived = movement.debit.minus(movement.credit).mul(debitSign(a.accountType));
      return derived.eq(a.balance) ? [] : [{
        accountId: a.id, cachedBalance: a.balance.toFixed(2),
        derivedBalance: derived.toFixed(2), difference: derived.minus(a.balance).toFixed(2),
      }];
    });
    const debits = debitRows.reduce((sum, r) => sum.plus(r._sum.amount ?? zero), zero);
    const credits = creditRows.reduce((sum, r) => sum.plus(r._sum.amount ?? zero), zero);
    return {
      schoolId, basis: "ALL_POSTED_PAIRED_TRANSACTIONS",
      I1: { status: debits.eq(credits) && orphanAccounts.length === 0 ? "PASS" : "FAIL", debits: debits.toFixed(2), credits: credits.toFixed(2), orphanAccounts },
      I2: { status: discrepancies.length === 0 && orphanAccounts.length === 0 ? "PASS" : "FAIL", discrepancies },
    };
  }
}
