import ExcelJS from "exceljs";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FinanceExportsService } from "./finance-exports.service.js";

function buildService() {
  const client = {
    school: { findUnique: vi.fn().mockResolvedValue({ id: "school-a", name: "School A", code: "SCH-A", primaryColor: "#2563eb" }) },
    bill: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    student: { findFirst: vi.fn().mockResolvedValue(null) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  return { service: new FinanceExportsService({ client } as never), client };
}

const context = { schoolId: "school-a", actorId: "user-a", actorName: "Accountant A" };

describe("FinanceExportsService tenant scoping and audit", () => {
  it("scopes invoice lookup by the active school and hides cross-school IDs", async () => {
    const { service, client } = buildService();
    await expect(service.invoicePdf(context, "bill-from-school-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(client.bill.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bill-from-school-b", schoolId: "school-a" },
    }));
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("scopes statement access by school before reading statement rows", async () => {
    const { service, client } = buildService();
    await expect(service.studentStatementPdf(context, "student-from-school-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(client.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "student-from-school-b", schoolId: "school-a" },
    }));
    expect(client.payment.findMany).not.toHaveBeenCalled();
    expect(client.bill.findMany).not.toHaveBeenCalled();
  });

  it("exports every school bill without a fixed take limit and audits row count", async () => {
    const { service, client } = buildService();
    const file = await service.exportExcel(context, "bills");

    expect(file.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(client.bill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school-a" },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
    }));
    const query = client.bill.findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query).not.toHaveProperty("take");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(file.buffer).buffer as ArrayBuffer);
    expect(workbook.getWorksheet("Invoice register")!.getCell("A1").value).toBe("Invoice");

    expect(client.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        schoolId: "school-a",
        userId: "user-a",
        entityType: "FINANCE_EXPORT",
        entityId: "bills.xlsx",
        newValues: expect.objectContaining({ exportType: "bills.xlsx", rowCount: 0 }),
      }),
    }));
  });
});
