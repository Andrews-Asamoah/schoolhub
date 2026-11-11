/** Real PostgreSQL tests for independently verified school-specific posting accounts. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FinanceAccountPurposeService as ServiceType } from "./finance-account-purpose.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10);

describe.skipIf(!enabled)("P2 verified account purposes (PostgreSQL)", { timeout: 60000 }, () => {
  let db: PrismaClient;
  let service: ServiceType;
  const run = "purpose-" + Date.now().toString(36);
  let schoolId = "", arAccountId = "", otherArAccountId = "", cashAccountId = "";
  let mappingId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { FinanceAccountPurposeService } = await import("./finance-account-purpose.service.js");
    db = prisma;
    service = new FinanceAccountPurposeService({ client: db } as never);
    await db.organization.create({ data: { id: run + "-org", name: run, slug: run } });
    schoolId = (await db.school.create({
      data: { organizationId: run + "-org", name: run, code: run.toUpperCase(), subdomain: run },
    })).id;
    await db.financeApprovalSetting.createMany({ data: ["PAYROLL_SETTINGS","BANK_RECONCILIATION","PERIOD_CONTROL","MANUAL_JOURNAL","INVOICE_ADJUSTMENT","ACCOUNT_MAPPING"].map(control => ({ schoolId, control: control as never, required: true, approverRoles: ["owner","headteacher"] })) });
    arAccountId = (await db.chartAccount.create({
      data: { schoolId, name: "Student receivables", code: "1200",
        accountType: "ASSET", category: "ACCOUNTS_RECEIVABLE" },
    })).id;
    otherArAccountId = (await db.chartAccount.create({
      data: { schoolId, name: "Additional receivables", code: "1201",
        accountType: "ASSET", category: "ACCOUNTS_RECEIVABLE" },
    })).id;
    cashAccountId = (await db.chartAccount.create({
      data: { schoolId, name: "Cash", code: "1000", accountType: "ASSET", category: "CASH" },
    })).id;
  });

  afterAll(async () => {
    if (!db || !schoolId) return;
    try {
      await db.financeAccountMapping.deleteMany({ where: { schoolId } });
      await db.chartAccount.deleteMany({ where: { schoolId } });
      await db.school.deleteMany({ where: { id: schoolId } });
      await db.organization.deleteMany({ where: { id: run + "-org" } });
    } finally { await db.$disconnect(); }
  });

  it("rejects incorrectly typed or categorised system account assignments", async () => {
    await expect(service.propose(schoolId, "accountant", {
      purpose: "FEE_REVENUE", accountId: arAccountId,
      effectiveFrom: day(), sourceNote: "Account must be of revenue type",
    })).rejects.toThrow(/Account type/);
    await expect(service.propose(schoolId, "accountant", {
      purpose: "STUDENT_RECEIVABLE", accountId: cashAccountId,
      effectiveFrom: day(), sourceNote: "Cash cannot be treated as receivable",
    })).rejects.toThrow(/receivable control account/i);
  });

  it("prevents self-approval and requires a verified account for posting", async () => {
    const draft = await service.propose(schoolId, "accountant", {
      purpose: "STUDENT_RECEIVABLE", accountId: arAccountId,
      effectiveFrom: day(), sourceNote: "Owner confirmed source ledger account",
    });
    mappingId = draft.id;
    await expect(db.$transaction(tx => service.resolve(tx, schoolId, "STUDENT_RECEIVABLE", new Date())))
      .rejects.toThrow(/independently approved/);
    await expect(service.approve(schoolId, "accountant", mappingId, "accountant", false))
      .rejects.toThrow(/approver chosen by the school/);
    await expect(service.approve(schoolId, "accountant", mappingId, "owner", false))
      .rejects.toThrow(/preparer cannot approve/);
    const mapping = await service.approve(schoolId, "owner", mappingId, "owner", false);
    expect(mapping.status).toBe("ACTIVE");
    const account = await db.$transaction(tx => service.resolve(tx, schoolId, "STUDENT_RECEIVABLE", new Date()));
    expect(account.id).toBe(arAccountId);
  });

  it("rejects a second ACTIVE effective-date interval for the same school and purpose", async () => {
    const next = await service.propose(schoolId, "accountant", {
      purpose: "STUDENT_RECEIVABLE", accountId: otherArAccountId,
      effectiveFrom: day(1), sourceNote: "Replacement should not overlap open-ended assignment",
    });
    await expect(service.approve(schoolId, "owner", next.id, "owner", false)).rejects.toThrow(/already covers/);
    expect((await db.financeAccountMapping.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("DRAFT");
  });

  it("lets the accountant verify a mapping only when the school does not require a second approver", async () => {
    const revenueId = (await db.chartAccount.create({
      data: { schoolId, name: "Fee revenue", code: "4000", accountType: "REVENUE", category: "SCHOOL_FEES" },
    })).id;
    const draft = await service.propose(schoolId, "accountant", {
      purpose: "FEE_REVENUE", accountId: revenueId,
      effectiveFrom: day(), sourceNote: "Revenue account confirmed from the chart of accounts",
    });
    await expect(service.approve(schoolId, "accountant", draft.id, "accountant", false))
      .rejects.toThrow(/approver chosen by the school/);
    await db.financeApprovalSetting.update({
      where: { schoolId_control: { schoolId, control: "ACCOUNT_MAPPING" } },
      data: { required: false, approverRoles: [] },
    });
    // Only the accountant role may complete the step on its own; other staff still cannot.
    await expect(service.approve(schoolId, "teacher", draft.id, "teacher", false))
      .rejects.toThrow(/approver chosen by the school/);
    const mapping = await service.approve(schoolId, "accountant", draft.id, "accountant", false);
    expect(mapping.status).toBe("ACTIVE");
  });
});
