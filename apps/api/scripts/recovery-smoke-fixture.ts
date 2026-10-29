/** Synthetic CI data only; never run against a production database. */
const url = process.env.TEST_DATABASE_URL;
if (!url || url !== process.env.DATABASE_URL || !/test/i.test(new URL(url).pathname)) throw new Error("Recovery fixtures require matching test database URLs.");
const { prisma } = await import("../src/prisma/prisma.client.js");
const { FinancePostingService } = await import("../src/modules/finance/finance-posting.service.js");
const { Prisma } = await import("@prisma/client");
const organizationId = "recovery-smoke-fixture";
try {
  if (process.argv.includes("--seed")) {
    await prisma.organization.create({ data: { id: organizationId, name: "Synthetic recovery fixture", slug: organizationId, subscriptionStatus: "ACTIVE" } });
    const school = await prisma.school.create({ data: { organizationId, code: "RECOVERY-SMOKE", name: "Synthetic recovery fixture", subdomain: organizationId } });
    const cash = await prisma.chartAccount.create({ data: { schoolId: school.id, name: "Fixture cash", code: "1000", accountType: "ASSET", category: "CASH" } });
    const income = await prisma.chartAccount.create({ data: { schoolId: school.id, name: "Fixture income", code: "4000", accountType: "REVENUE", category: "OTHER_INCOME" } });
    const posting = new FinancePostingService({ client: prisma } as never);
    await prisma.$transaction(tx => posting.post(tx, { schoolId: school.id, date: new Date(), description: "Synthetic recovery control",
      amount: new Prisma.Decimal("125.25"), debitAccountId: cash.id, creditAccountId: income.id, transactionType: "INCOME", referenceType: "RECOVERY_TEST", referenceId: organizationId }));
  } else if (process.argv.includes("--cleanup")) {
    const school = await prisma.school.findUnique({ where: { organizationId }, select: { id: true } });
    if (school) await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.finance_archive_purge', 'on', true)`;
      const entries = await tx.financeJournalEntry.findMany({ where: { schoolId: school.id }, select: { id: true } });
      await tx.financeJournalLine.deleteMany({ where: { entryId: { in: entries.map(entry => entry.id) } } });
      await tx.financeJournalEntry.deleteMany({ where: { schoolId: school.id } });
      await tx.transaction.deleteMany({ where: { schoolId: school.id } });
      await tx.chartAccount.deleteMany({ where: { schoolId: school.id } });
      await tx.school.delete({ where: { id: school.id } });
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  } else throw new Error("Use --seed or --cleanup");
} finally { await prisma.$disconnect(); }
