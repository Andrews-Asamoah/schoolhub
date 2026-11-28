import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { FinanceExportsService } from "./finance-exports.service.js";

vi.mock("../../env.js", () => ({ env: {} }));

function buildService() {
  const client = {
    school: { findUnique: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ id: "school-a", name: "School A", code: "SCH-A", primaryColor: "#2563eb" }) },
    bill: { findFirst: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    student: { findFirst: vi.fn().mockResolvedValue(null) },
    payment: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const r2 = { keyFromUrl: vi.fn(), keys: { schoolPrefix: (id: string) => `schools/${id}/` }, read: vi.fn() };
  return { service: new FinanceExportsService({ client } as never, r2 as never), client, r2 };
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

  it("embeds the school's uploaded WebP logo and full student name on a single-page invoice", async () => {
    const { service, client, r2 } = buildService();
    const key = "schools/school-a/images/logo/badge.webp";
    client.school.findUnique.mockResolvedValue({
      id: "school-a", name: "School A", code: "SCH-A", primaryColor: "#2563eb",
      logo: "https://assets.example.invalid/" + key,
    });
    r2.keyFromUrl.mockReturnValue(key);
    r2.read.mockResolvedValue(await sharp({
      create: { width: 64, height: 32, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 0.9 } },
    }).webp().toBuffer());
    const charge = new Prisma.Decimal(250);
    const zero = new Prisma.Decimal(0);
    client.bill.findFirst.mockResolvedValue({
      billNumber: "INV-001", issuedAt: new Date("2026-09-01"), dueDate: new Date("2026-09-30"),
      student: { admissionNumber: "0004", profile: { firstName: "Ama", otherNames: "Efua Esi", lastName: "Mensah" } },
      class: { name: "Grade 5" }, academicYear: { name: "2026/2027" }, term: { name: "Term 1" },
      items: [{ description: "Tuition", quantity: 1, amount: charge, totalAmount: charge, discountAmount: zero }],
      grossAmount: charge, discountAmount: zero, totalAmount: charge, paidAmount: zero, balanceAmount: charge, status: "PENDING",
    });

    const file = await service.invoicePdf(context, "bill-a");
    const pdfText = file.buffer.toString("latin1");
    expect(r2.read).toHaveBeenCalledWith(key, expect.any(Number));
    expect(pdfText).toContain("/Subtype /Image");
    expect(pdfText).toContain("Ama Efua Esi Mensah");
    expect((await PDFDocument.load(file.buffer)).getPageCount()).toBe(1);

    r2.read.mockClear();
    r2.keyFromUrl.mockReturnValue("schools/school-b/images/logo/badge.webp");
    const unbranded = await service.invoicePdf(context, "bill-a");
    expect(r2.read).not.toHaveBeenCalled();
    expect(unbranded.buffer.toString("latin1")).not.toContain("/Subtype /Image");
  });

  it("shows the student's full recorded name on a receipt PDF", async () => {
    const { service, client } = buildService();
    client.payment.findFirst.mockResolvedValue({
      paymentNumber: "REC-001", student: {
        admissionNumber: "0004", profile: { firstName: "Kofi", otherNames: "Yaw", lastName: "Owusu" },
      },
      bill: { billNumber: "INV-001" }, paymentDate: new Date("2026-09-10"),
      paymentMethod: "CASH", status: "COMPLETED", amount: new Prisma.Decimal(250),
    });
    const file = await service.receiptPdf(context, "payment-a");
    expect(file.buffer.toString("latin1")).toContain("Kofi Yaw Owusu");
    expect((await PDFDocument.load(file.buffer)).getPageCount()).toBe(1);
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
