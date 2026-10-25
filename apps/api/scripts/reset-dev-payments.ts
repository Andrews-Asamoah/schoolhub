/**
 * DEVELOPMENT ONLY: wipe every recorded fee payment and put bills, students and
 * ledger balances back to "nothing has been paid yet".
 *
 * What it does, per school, in one database transaction:
 *   1. Undoes the ledger balances of fee-receipt postings (PAYMENT) and their
 *      reversals (PAYMENT_REVERSAL), then deletes those ledger transactions.
 *   2. Deletes all payments (their allocations cascade).
 *   3. Resets every bill and bill item to unpaid (cancelled/waived bills are left alone).
 *   4. Recomputes each student's outstanding balance from their bills.
 *
 * Bills, fee structures, expenses, payroll, admission-fee income and audit logs are NOT touched.
 *
 * Usage (from apps/api):
 *   ALLOW_DEV_RESET=true pnpm finance:reset-payments                       # dry run
 *   ALLOW_DEV_RESET=true pnpm finance:reset-payments -- --yes              # apply, all schools
 *   ALLOW_DEV_RESET=true pnpm finance:reset-payments -- --yes --school achimota   # one school
 *
 * Requires explicit ALLOW_DEV_RESET=true and a local or clearly labelled dev/test database.
 * Refuses to run when NODE_ENV=production or the database target appears production-labelled.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { getDevResetSafetyError } from "../src/common/dev-reset-safety.js";

const safetyError = getDevResetSafetyError({
  allowDevReset: process.env.ALLOW_DEV_RESET,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
});
if (safetyError) {
  console.error(safetyError);
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const schoolFlag = args.indexOf("--school");
const subdomain = schoolFlag >= 0 ? args[schoolFlag + 1] : undefined;

if (schoolFlag >= 0 && !subdomain) {
  console.error("--school needs a subdomain, e.g. --school achimota");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const schools = await prisma.school.findMany({
    where: subdomain ? { subdomain } : {},
    select: { id: true, name: true, subdomain: true },
  });
  if (!schools.length) {
    console.error(subdomain ? `No school with subdomain "${subdomain}".` : "No schools found.");
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Database host: ${host}`);
  console.log(confirmed ? "MODE: APPLY (changes will be written)\n" : "MODE: dry run (nothing will change; add --yes to apply)\n");

  for (const school of schools) {
    const [payments, ledger, bills] = await Promise.all([
      prisma.payment.count({ where: { schoolId: school.id } }),
      prisma.transaction.count({ where: { schoolId: school.id, referenceType: { in: ["PAYMENT", "PAYMENT_REVERSAL"] } } }),
      prisma.bill.count({ where: { schoolId: school.id, status: { notIn: ["CANCELLED", "WAIVED"] } } }),
    ]);
    console.log(`${school.name} (${school.subdomain}): ${payments} payments, ${ledger} ledger entries, ${bills} bills to reset`);
    if (!confirmed) continue;

    await prisma.$transaction(
      async (tx) => {
        // 1. Undo ledger balances, then remove the entries. Fee receipts raised both
        // accounts (debit cash/bank, credit revenue); reversals lowered both.
        const entries = await tx.transaction.findMany({
          where: { schoolId: school.id, referenceType: { in: ["PAYMENT", "PAYMENT_REVERSAL"] } },
        });
        for (const entry of entries) {
          const change = entry.referenceType === "PAYMENT"
            ? { decrement: entry.amount }
            : { increment: entry.amount };
          await tx.chartAccount.update({ where: { id: entry.debitAccountId }, data: { balance: change } });
          await tx.chartAccount.update({ where: { id: entry.creditAccountId }, data: { balance: change } });
        }

        // Bill-level allocations are derived from saved receipts. Remove these
        // development-only reset records before deleting payments (FK is restrictive).
        await tx.paymentBillAllocation.deleteMany({ where: { schoolId: school.id } });
        // Payments first (their item allocations cascade).
        await tx.payment.deleteMany({ where: { schoolId: school.id } });
        if (entries.length) {
          await tx.transaction.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
        }

        // 3 + 4. Reset bills and rebuild each student's outstanding balance.
        const billRows = await tx.bill.findMany({
          where: { schoolId: school.id, status: { notIn: ["CANCELLED", "WAIVED"] } },
          include: { items: true },
        });
        const outstanding = new Map<string, Prisma.Decimal>();
        for (const bill of billRows) {
          for (const item of bill.items) {
            const net = item.totalAmount.minus(item.discountAmount);
            await tx.billItem.update({
              where: { id: item.id },
              data: {
                paidAmount: new Prisma.Decimal(0),
                balanceAmount: net,
                status: net.lte(0) ? "FULLY_PAID" : "UNPAID",
              },
            });
          }
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paidAmount: new Prisma.Decimal(0),
              balanceAmount: bill.totalAmount,
              status: bill.totalAmount.lte(0) ? "PAID" : "PENDING",
            },
          });
          outstanding.set(bill.studentId, (outstanding.get(bill.studentId) ?? new Prisma.Decimal(0)).plus(bill.totalAmount));
        }
        await tx.student.updateMany({ where: { schoolId: school.id }, data: { outstandingBalance: new Prisma.Decimal(0) } });
        for (const [studentId, amount] of outstanding) {
          await tx.student.update({ where: { id: studentId }, data: { outstandingBalance: amount } });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`  done: ${school.subdomain} reset.`);
  }
  console.log(confirmed ? "\nFinished." : "\nDry run only. Re-run with --yes to apply.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
