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
    // Every component of I1/I2 must reflect the same committed posting snapshot.
    // Reading balances and postings on separate connections can falsely report failure
    // while a concurrent posting transaction commits between reads.
    return this.prisma.client.$transaction(async db => {
    const [accountRows, debitRows, creditRows, invalidAmounts, selfPairRows] = await Promise.all([
      db.chartAccount.findMany({ where: { schoolId }, select: { id: true, accountType: true, balance: true } }),
      db.transaction.groupBy({ by: ["debitAccountId"], where: { schoolId }, _sum: { amount: true } }),
      db.transaction.groupBy({ by: ["creditAccountId"], where: { schoolId }, _sum: { amount: true } }),
      // Paired debit/credit rows trivially sum to equal totals, even if a historic
      // import contains a zero/negative amount or posts an account to itself.
      db.transaction.count({ where: { schoolId, amount: { lte: zero } } }),
      db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count" FROM "transactions"
        WHERE "schoolId" = ${schoolId} AND "debitAccountId" = "creditAccountId"`,
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
    const selfPairedTransactions = selfPairRows[0]?.count ?? 0;
    return {
      schoolId, basis: "ALL_POSTED_PAIRED_TRANSACTIONS",
      I1: {
        status: debits.eq(credits) && orphanAccounts.length === 0 && invalidAmounts === 0 && selfPairedTransactions === 0 ? "PASS" : "FAIL",
        debits: debits.toFixed(2), credits: credits.toFixed(2), orphanAccounts,
        invalidAmounts, selfPairedTransactions,
      },
      I2: { status: discrepancies.length === 0 && orphanAccounts.length === 0 ? "PASS" : "FAIL", discrepancies },
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** Runs the suite for every school. A school that cannot be checked is reported, never skipped. */
  async checkAllSchools() {
    const schools = await this.prisma.client.school.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    const failing: Array<{ schoolId: string; report?: Awaited<ReturnType<FinanceLedgerIntegrityService["check"]>>; error?: string }> = [];
    for (const { id } of schools) {
      try {
        const report = await this.check(id);
        if (report.I1.status !== "PASS" || report.I2.status !== "PASS") failing.push({ schoolId: id, report });
      } catch (error) {
        failing.push({ schoolId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { checkedAt: new Date().toISOString(), schoolsChecked: schools.length, failing };
  }
}
