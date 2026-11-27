import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FinanceService } from "./finance.service.js";
import type { FinanceExportsService } from "./finance-exports.service.js";

vi.mock("../../env.js", () => ({ env: {} }));
const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => { try { return /test/i.test(new URL(url).pathname); } catch { return false; } })();

describe.skipIf(!enabled)("payroll salary register and Tier 2 on PostgreSQL", { timeout: 60_000 }, () => {
  let db: PrismaClient;
  let service: FinanceService;
  let exports: FinanceExportsService;
  let schoolId: string;
  let staffId: string;
  let teacherId: string;
  const key = "payroll-" + randomUUID();
  const maker = key + "-maker";
  const checker = key + "-checker";

  beforeAll(async () => {
    vi.stubEnv("PAYROLL_DETAILS_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    process.env.DATABASE_URL = url;
    db = (await import("../../prisma/prisma.client.js")).prisma;
    const { FinanceService: Finance } = await import("./finance.service.js");
    const { FinancePostingService } = await import("./finance-posting.service.js");
    const { FinanceApprovalService } = await import("./finance-approval.service.js");
    const { FinanceExportsService: Exports } = await import("./finance-exports.service.js");
    const prisma = { client: db } as never;
    service = new Finance(prisma, new FinancePostingService(prisma), new FinanceApprovalService(prisma));
    exports = new Exports(prisma, {} as never);
    await db.user.createMany({ data: [maker, checker].map(id => ({ id, name: id, email: id + "@test.invalid" })) });
    const organization = await db.organization.create({ data: { id: key, slug: key, name: key } });
    const school = await db.school.create({ data: { organizationId: organization.id, code: key, subdomain: key, name: key } });
    schoolId = school.id;
    const department = await db.department.create({ data: { schoolId, code: "ACA", name: "Academics" } });
    teacherId = (await db.teacher.create({
      data: { schoolId, departmentId: department.id, teacherId: "0001", firstName: "Payroll", lastName: "Teacher", monthlySalary: 2000 },
    })).id;
    staffId = (await db.staff.create({ data: {
      school: { connect: { id: schoolId } }, staffId: "0001", staffType: "LIBRARIAN", monthlySalary: 1000,
      profile: { create: { userId: maker, firstName: "Payroll", lastName: "Staff" } },
    } })).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.$disconnect();
  });

  it("validates typed employee IDs, rejects stale previews and saves the whole salary batch", async () => {
    const rows = [
      { row: 2, kind: "STAFF" as const, employeeCode: "0001", monthlySalary: "1250.75" },
      { row: 3, kind: "TEACHER" as const, employeeCode: "0001", monthlySalary: "2250.5" },
    ];
    const preview = await service.importPayrollSalaries(schoolId, maker, { mode: "preview", rows });
    if (!("rows" in preview)) throw new Error("Expected a preview");
    expect(preview.issues).toEqual([]);
    expect(preview.rows.map(row => row.employeeId)).toEqual([staffId, teacherId]);
    const bad = await service.importPayrollSalaries(schoolId, maker, {
      mode: "preview", rows: [...rows, { ...rows[0]!, row: 4 }, { ...rows[1]!, row: 5, employeeCode: "1" }],
    });
    expect(bad).toMatchObject({ issues: [{ row: 4 }, { row: 5 }] });
    await service.updatePayrollSalary(schoolId, "TEACHER", teacherId, 2300, maker);
    await expect(service.importPayrollSalaries(schoolId, maker, { mode: "apply", rows: preview.rows }))
      .rejects.toThrow(/register changed/);
    expect((await db.staff.findUniqueOrThrow({ where: { id: staffId } })).monthlySalary?.toFixed(2)).toBe("1000.00");
    const updated = await service.importPayrollSalaries(schoolId, maker, { mode: "preview", rows });
    if (!("rows" in updated)) throw new Error("Expected a preview");
    await expect(service.importPayrollSalaries(schoolId, maker, { mode: "apply", rows: updated.rows }))
      .resolves.toEqual({ updatedCount: 2 });
    const register = await service.listPayrollSalaryRegister(schoolId);
    expect(register.map(employee => employee.monthlySalary).sort((a, b) => Number(a) - Number(b))).toEqual([1250.75, 2250.5]);
  });

  it("encrypts payment details and uses saved Tier 2 values for Excel and ledger posting", async () => {
    const bank = { name: "Test bank", branch: "", accountName: "Payroll Staff", accountNumber: "000012345678" };
    await service.updatePayrollPaymentDetails(schoolId, "STAFF", staffId, maker,
      { version: null, ssnitNumber: "00001111", tier2MemberNumber: "T2001", tin: "", bank });
    const details = await service.getPayrollPaymentDetails(schoolId, "STAFF", staffId, maker);
    expect(details).toMatchObject({ ssnitNumber: "00001111", tier2MemberNumber: "T2001", tin: "", bank });
    expect((await db.payrollPaymentDetails.findUniqueOrThrow({ where: { staffId } })).encryptedData).not.toContain(bank.accountNumber);
    await expect(service.getPayrollPaymentDetails("other-school", "STAFF", staffId, maker)).rejects.toThrow(/not found/);
    await expect(service.updatePayrollPaymentDetails(schoolId, "STAFF", staffId, maker,
      { ...details, version: null })).rejects.toThrow(/details changed/);

    const setting = { schoolId, status: "ACTIVE" as const, approvedById: checker,
      effectiveFrom: new Date("2026-01-01"), sourceNote: "Synthetic rates for payroll integration testing" };
    await db.payrollTaxSchedule.create({
      data: { ...setting, name: "Synthetic PAYE", nonResidentRate: 25, bands: { create: { position: 0, rate: 10 } } },
    });
    await db.payrollContributionScheme.createMany({ data: [
      { ...setting, key: "SSNIT_TIER2", label: "Tier 2", base: "BASIC", employeeRate: 0, employerRate: 0, memoRate: 5 },
      { ...setting, key: "SSNIT_TIER1", label: "Combined SSNIT", base: "BASIC", employeeRate: 5.5, employerRate: 13 },
    ] });
    const period = { month: 7, year: 2026, confirmResidentTaxTreatment: true as const };
    const first = await service.generatePayrollDraft(schoolId, maker, period);
    await service.transitionPayroll(schoolId, first.payrollRecord.id, { status: "CANCELLED" }, maker);
    const replacement = await service.generatePayrollDraft(schoolId, maker, period);
    const recordId = replacement.payrollRecord.id;
    expect(replacement.payrollRecord.runNumber).toBe(2);
    await expect(service.transitionPayroll(schoolId, recordId, { status: "APPROVED" }, maker)).rejects.toThrow(/cannot approve/);
    expect(await db.financeApprovalRequest.count({ where: { schoolId, entityId: recordId } })).toBe(0);
    await service.transitionPayroll(schoolId, recordId, { status: "APPROVED" }, checker);

    const context = { schoolId, actorId: maker };
    await expect(exports.payrollTier2Excel(context, recordId)).rejects.toThrow(/missing a number/);
    await service.updatePayrollPaymentDetails(schoolId, "TEACHER", teacherId, maker,
      { version: null, ssnitNumber: "00002222", tier2MemberNumber: "", tin: "", bank: null });
    const file = await exports.payrollTier2Excel(context, recordId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Tier 2 contributions")!;
    const staffRow = [sheet.getRow(2), sheet.getRow(3)].find(row => row.getCell(4).value === "00001111")!;
    const slip = await db.payslip.findFirstOrThrow({ where: { schoolId, payrollRecordId: recordId, staffId } });
    expect(staffRow.getCell(5).value).toBe("T2001");
    expect(staffRow.getCell(7).value).toBe(Number(slip.tier2Contribution));
    expect(slip.tier2Contribution?.toFixed(2)).toBe(slip.basicSalary.mul(0.05).toFixed(2));
    expect(slip.ssnitEmployee.toFixed(2)).toBe(slip.basicSalary.mul(0.055).toFixed(2));

    await service.transitionPayroll(schoolId, recordId, { status: "PAID", paymentMethod: "BANK_TRANSFER" }, maker);
    const posting = await db.transaction.findFirstOrThrow({ where: { schoolId, referenceId: recordId, description: "Allocate Tier 2 pension contributions" } });
    const savedSlips = await db.payslip.aggregate({ where: { schoolId, payrollRecordId: recordId }, _sum: { tier2Contribution: true } });
    expect(posting.amount.toFixed(2)).toBe(savedSlips._sum.tier2Contribution?.toFixed(2));
    const audits = await db.auditLog.findMany({ where: { schoolId, entityType: { startsWith: "PAYROLL_PAYMENT_DETAILS" } } });
    expect(JSON.stringify(audits)).not.toContain(bank.accountNumber);
    expect(JSON.stringify(audits)).not.toContain("00001111");
  });
});
