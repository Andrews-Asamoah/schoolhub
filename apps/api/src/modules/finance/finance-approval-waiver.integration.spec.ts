import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceBankReconciliationService } from "./finance-bank-reconciliation.service.js";
import type { FinanceCloseService } from "./finance-close.service.js";
import type { FinanceApprovalSettingsService } from "./finance-approval-settings.service.js";

vi.mock("../../env.js", () => ({ env: {} }));
const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();

/**
 * A school that has never saved an approval setting has second approval switched off: the
 * accountant's own submission completes the approval step, and the record shows it.
 */
describe.skipIf(!enabled)("finance approvals switched off (PostgreSQL)", { timeout: 60000 }, () => {
  let db: PrismaClient;
  let reconciliations: FinanceBankReconciliationService;
  let close: FinanceCloseService;
  let settings: FinanceApprovalSettingsService;
  let schoolId = "", bankId = "", revenueId = "";
  const run = "waive-" + Date.now().toString(36);
  const accountant = run + "-accountant", owner = run + "-owner";
  const actor = (id: string) => ({ id, ipAddress: null, userAgent: null });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("../../prisma/prisma.client.js")).prisma;
    const { FinanceBankReconciliationService: Reconciliations } = await import("./finance-bank-reconciliation.service.js");
    const { FinanceCloseService: Close } = await import("./finance-close.service.js");
    const { FinancePeriodPreparationService } = await import("./finance-period-preparation.service.js");
    const { FinanceLedgerIntegrityService } = await import("./finance-ledger-integrity.service.js");
    const { FinanceApprovalSettingsService: Settings } = await import("./finance-approval-settings.service.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    reconciliations = new Reconciliations({ client: db } as never);
    settings = new Settings({ client: db } as never);
    await db.user.createMany({ data: [accountant, owner].map(id => ({ id, name: id, email: id + "@test.invalid", emailVerified: true })) });
    await db.organization.create({ data: { id: run, slug: run, name: run } });
    schoolId = (await db.school.create({ data: { organizationId: run, name: run, subdomain: run, code: run.toUpperCase() } })).id;
    bankId = (await db.chartAccount.create({ data: { schoolId, code: "1000", name: "Bank", accountType: "ASSET", category: "BANK" } })).id;
    revenueId = (await db.chartAccount.create({ data: { schoolId, code: "4000", name: "Fees", accountType: "REVENUE", category: "OTHER_INCOME" } })).id;
    await db.chartAccount.create({ data: { schoolId, code: "1200", name: "Student receivables", accountType: "ASSET", category: "ACCOUNTS_RECEIVABLE" } });
    await db.$transaction(tx => new FinancePostingService({ client: db } as never).post(tx, {
      schoolId, date: new Date("2026-09-02"), description: "Bank receipt", amount: new Prisma.Decimal(10),
      debitAccountId: bankId, creditAccountId: revenueId, transactionType: "INCOME",
    }));
    const finance = {
      getHistoricalReceivables: async () => ({ complete: true, outstanding: "0.00" }),
      getReceivablesCloseReadiness: async () => ({ closeReady: true }),
    };
    const preparation = new FinancePeriodPreparationService(
      { client: db } as never, new FinanceLedgerIntegrityService({ client: db } as never), finance as never);
    close = new Close({ client: db } as never, preparation, finance as never, reconciliations);
    await db.financePeriodLock.create({ data: { schoolId, lockedThrough: new Date("2026-08-31"), updatedById: accountant, reason: "Earlier close boundary" } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.financeApprovalSetting.deleteMany({ where: { schoolId } });
    await db.$disconnect();
  });

  it("defaults every control to no second approver for a school with no saved setting", async () => {
    const all = await settings.list(schoolId);
    expect(all).toHaveLength(6);
    for (const item of all) expect(item).toMatchObject({ required: false, approverRoles: [], configured: false });
  });

  it("completes a bank reconciliation on submit and records that it was waived", async () => {
    const { POLICY_WAIVER_NOTE } = await import("./finance-approval-settings.js");
    const file = { buffer: Buffer.from("Date,Description,Amount\n2026-09-02,Fees,10.00"), originalname: "bank.csv" } as Express.Multer.File;
    const record = await reconciliations.import(schoolId, accountant, file, {
      accountId: bankId, startDate: "2026-09-01", endDate: "2026-09-30", openingBalance: "0", closingBalance: "10",
      mapping: { date: "Date", description: "Description", amount: "Amount" },
    });
    const detail = await reconciliations.detail(schoolId, record.id);
    const transaction = await db.transaction.findFirstOrThrow({ where: { schoolId } });
    await reconciliations.match(schoolId, accountant, record.id, {
      statementLineId: detail.statement.lines[0]!.id, transactionId: transaction.id, amount: "10.00",
    });
    const submitted = await reconciliations.submit(schoolId, accountant, record.id);
    expect(submitted).toMatchObject({ status: "APPROVED", decidedById: accountant, waivedByPolicy: true });
    expect(submitted.decisionNote).toBe(POLICY_WAIVER_NOTE);
    expect(submitted.contentHash).toHaveLength(64);
    // Approved evidence is frozen exactly as when an independent approver decides.
    await expect(db.financeBankReconciliation.update({ where: { id: record.id }, data: { status: "DRAFT" } }))
      .rejects.toThrow(/immutable|append-only/);
  });

  it("closes and reopens a period on request without a second approver, marking both requests", async () => {
    const { POLICY_WAIVER_NOTE } = await import("./finance-approval-settings.js");
    const request = await close.request(schoolId, accountant, 2026, 9, "September accounts reviewed");
    expect(request).toMatchObject({ status: "APPROVED", waivedByPolicy: true, decidedById: accountant });
    expect(request.decisionNote).toBe(POLICY_WAIVER_NOTE);
    const period = await db.financeAccountingPeriod.findFirstOrThrow({ where: { schoolId, status: "CLOSED" } });
    expect(await db.financePeriodSnapshot.count({ where: { periodId: period.id } })).toBe(1);
    const lock = await db.financePeriodLock.findUniqueOrThrow({ where: { schoolId } });
    expect(lock.lockedThrough.toISOString().slice(0, 10)).toBe("2026-09-30");

    const reopen = await close.reopen(schoolId, accountant, period.id, "Correction review requested");
    expect(reopen).toMatchObject({ status: "APPROVED", waivedByPolicy: true });
    expect((await db.financeAccountingPeriod.findUniqueOrThrow({ where: { id: period.id } })).reopenCount).toBe(1);
  });

  it("only the owner or admin can change the setting, and each change is audited", async () => {
    await expect(settings.update(schoolId, actor(accountant), "accountant", false, "MANUAL_JOURNAL",
      { required: true, approverRoles: ["owner"] })).rejects.toThrow(/owner or an administrator/);
    // RolesGuard treats a headteacher as an admin, so the service must refuse them explicitly.
    await expect(settings.update(schoolId, actor(accountant), "headteacher", false, "MANUAL_JOURNAL",
      { required: true, approverRoles: ["owner"] })).rejects.toThrow(/owner or an administrator/);

    const saved = await settings.update(schoolId, actor(owner), "owner", false, "MANUAL_JOURNAL",
      { required: true, approverRoles: ["headteacher", "owner", "owner"] });
    expect(saved).toMatchObject({ control: "MANUAL_JOURNAL", required: true, approverRoles: ["headteacher", "owner"], configured: true });
    await settings.update(schoolId, actor(owner), "admin", false, "MANUAL_JOURNAL", { required: false, approverRoles: ["owner"] });
    const off = (await settings.list(schoolId)).find(item => item.control === "MANUAL_JOURNAL")!;
    expect(off).toMatchObject({ required: false, approverRoles: [], configured: true });

    const audits = await db.auditLog.findMany({
      where: { schoolId, entityType: "finance.approval-setting.update", entityId: "MANUAL_JOURNAL" }, orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
    expect(audits[0]!.oldValues).toMatchObject({ required: false, configured: false });
    expect(audits[1]!.oldValues).toMatchObject({ required: true });
  });
});
