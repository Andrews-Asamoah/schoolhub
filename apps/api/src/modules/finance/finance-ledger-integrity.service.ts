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
    // I3: every paired source row must have precisely one journal header and
    // the matching debit/credit lines. A historical invalid row remains
    // unmirrored and fails this invariant until it is independently reviewed.
    const [journalRow] = await db.$queryRaw<Array<{
      sourceCount: bigint; journalCount: bigint; invalidCount: bigint;
    }>>`
      SELECT
        (SELECT COUNT(*)::bigint FROM "transactions"
          WHERE "schoolId" = ${schoolId}) AS "sourceCount",
        (SELECT COUNT(*)::bigint FROM "finance_journal_entries"
          WHERE "schoolId" = ${schoolId}) AS "journalCount",
        (SELECT COUNT(*)::bigint
           FROM "transactions" t
           LEFT JOIN "finance_journal_entries" e
             ON e."transactionId" = t."id" AND e."schoolId" = t."schoolId"
           LEFT JOIN LATERAL (
             SELECT
               COUNT(*)::int AS line_count,
               COUNT(*) FILTER (WHERE l."side" = 'DEBIT'
                 AND l."accountId" = t."debitAccountId"
                 AND l."amount" = t."amount")::int AS debit_matches,
               COUNT(*) FILTER (WHERE l."side" = 'CREDIT'
                 AND l."accountId" = t."creditAccountId"
                 AND l."amount" = t."amount")::int AS credit_matches
             FROM "finance_journal_lines" l
             WHERE l."entryId" = e."id"
           ) lines ON TRUE
           WHERE t."schoolId" = ${schoolId}
             AND (
               e."id" IS NULL
               OR e."postedDate" <> t."transactionDate"
               OR lines.line_count <> 2
               OR lines.debit_matches <> 1
               OR lines.credit_matches <> 1
             )
        ) AS "invalidCount"
    `;
    const sourceCount = Number(journalRow?.sourceCount ?? 0n);
    const journalCount = Number(journalRow?.journalCount ?? 0n);
    const invalidJournalPairs = Number(journalRow?.invalidCount ?? 0n);
    return {
      schoolId, basis: "ALL_POSTED_PAIRED_TRANSACTIONS",
      I1: {
        status: debits.eq(credits) && orphanAccounts.length === 0 && invalidAmounts === 0 && selfPairedTransactions === 0 ? "PASS" : "FAIL",
        debits: debits.toFixed(2), credits: credits.toFixed(2), orphanAccounts,
        invalidAmounts, selfPairedTransactions,
      },
      I2: { status: discrepancies.length === 0 && orphanAccounts.length === 0 ? "PASS" : "FAIL", discrepancies },
      I3: {
        status: sourceCount === journalCount && invalidJournalPairs === 0 ? "PASS" : "FAIL",
        sourceCount, journalCount, invalidJournalPairs,
      },
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
        if (report.I1.status !== "PASS" || report.I2.status !== "PASS" || report.I3.status !== "PASS") failing.push({ schoolId: id, report });
      } catch (error) {
        failing.push({ schoolId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { checkedAt: new Date().toISOString(), schoolsChecked: schools.length, failing };
  }
}
