import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { Prisma, type School } from "@prisma/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { PrismaService } from "../../prisma/prisma.service.js";
import { buildFinanceWorkbook, type FinanceExportCell, type FinanceWorkbookInput } from "./finance-exports.helpers.js";

export interface FinanceExportFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

export interface FinanceExportContext {
  schoolId: string;
  actorId: string;
  ipAddress?: string;
  userAgent?: string;
  actorName?: string;
  from?: string;
  to?: string;
}

type ExportKind = "bills" | "payments" | "expenses" | "payroll";
type DateRange = { gte?: Date; lte?: Date };

const dayStart = (value: string) => new Date(value + "T00:00:00.000Z");
const dayEnd = (value: string) => new Date(value + "T23:59:59.999Z");
const isoDay = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : "";

function validateDate(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("Enter " + label + " as YYYY-MM-DD.");
  const parsed = dayStart(value);
  if (Number.isNaN(parsed.getTime()) || isoDay(parsed) !== value) throw new BadRequestException("Enter a valid " + label + ".");
  return parsed;
}
function dateRange(from?: string, to?: string, dateOnly = false): DateRange | undefined {
  const start = validateDate(from, "start date");
  const end = validateDate(to, "end date");
  if (start && end && start.getTime() > end.getTime()) throw new BadRequestException("Start date must be before or equal to end date.");
  if (!start && !end) return undefined;
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: dateOnly ? end : dayEnd(to!) } : {}),
  };
}
function asNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}
function studentName(student: { profile?: { firstName?: string | null; lastName?: string | null } | null; admissionNumber?: string | null } | null | undefined) {
  const name = [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(" ").trim();
  return name || student?.admissionNumber || "Unidentified student";
}
function formatMoney(value: Prisma.Decimal): string {
  const fixed = value.toFixed(2);
  const negative = fixed.startsWith("-");
  const absolute = negative ? fixed.slice(1) : fixed;
  const [whole = "0", fraction = "00"] = absolute.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "GHS " + (negative ? "-" : "") + grouped + "." + fraction;
}

const smallNumbers = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const tensWords = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function underThousand(value: number): string {
  const parts: string[] = [];
  if (value >= 100) {
    parts.push(smallNumbers[Math.floor(value / 100)] + " hundred");
    value %= 100;
  }
  if (value >= 20) {
    parts.push(tensWords[Math.floor(value / 10)] + (value % 10 ? "-" + smallNumbers[value % 10] : ""));
  } else if (value > 0) {
    parts.push(smallNumbers[value]);
  }
  return parts.join(" ");
}
function integerWords(input: bigint): string {
  if (input === 0n) return "zero";
  if (input < 0n) return "minus " + integerWords(-input);
  const scales = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion"];
  const parts: string[] = [];
  let value = input;
  let scaleIndex = 0;
  while (value > 0n) {
    const group = Number(value % 1000n);
    if (group) parts.unshift(underThousand(group) + (scales[scaleIndex] ? " " + scales[scaleIndex] : ""));
    value /= 1000n;
    scaleIndex += 1;
  }
  return parts.join(" ");
}
function amountInWords(value: Prisma.Decimal): string {
  const fixed = value.toFixed(2);
  const negative = fixed.startsWith("-");
  const absolute = negative ? fixed.slice(1) : fixed;
  const [whole = "0", fraction = "00"] = absolute.split(".");
  return (negative ? "minus " : "") + integerWords(BigInt(whole)) + " Ghana cedis and " + integerWords(BigInt(fraction)) + " pesewas";
}
function primaryRgb(color: string | null | undefined): [number, number, number] {
  const normalized = (color ?? "").trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
  if (!match) return [37, 99, 235];
  const hex = match[1]!;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

@Injectable()
export class FinanceExportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async school(schoolId: string): Promise<School> {
    const school = await this.prisma.client.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("School not found.");
    return school;
  }

  private async auditExport(context: FinanceExportContext, exportType: string, rowCount: number, filters: Record<string, string | undefined>) {
    // The export has already been generated successfully. Fail closed if this audit record cannot be persisted.
    await this.prisma.client.auditLog.create({
      data: {
        userId: context.actorId,
        schoolId: context.schoolId,
        action: "SCHOOL_ACCESSED",
        entityType: "FINANCE_EXPORT",
        entityId: exportType,
        newValues: {
          exportType,
          rowCount,
          filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)),
          generatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  }

  async exportExcel(context: FinanceExportContext, kind: ExportKind): Promise<FinanceExportFile> {
    const school = await this.school(context.schoolId);
    const issuedAt = new Date().toISOString();
    const period = (context.from ?? "All dates") + " to " + (context.to ?? "present");
    const reportInfo = {
      School: school.name,
      "School code": school.code,
      Period: period,
      "Generated by": context.actorName ?? context.actorId,
      "Generated at": issuedAt,
      ...(context.from ? { From: context.from } : {}),
      ...(context.to ? { To: context.to } : {}),
    };
    const generatedAt = new Date();
    let input: FinanceWorkbookInput;
    let fileName: string;
    let rowCount = 0;

    if (kind === "bills") {
      const range = dateRange(context.from, context.to);
      const records = await this.prisma.client.bill.findMany({
        where: { schoolId: context.schoolId, ...(range ? { issuedAt: range } : {}) },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        include: {
          student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          class: { select: { name: true } },
          academicYear: { select: { name: true } },
          term: { select: { name: true } },
        },
      });
      rowCount = records.length;
      input = {
        title: "Invoice register",
        headers: ["Invoice", "Student", "Admission number", "Class", "Academic year", "Term", "Issued", "Due date", "Gross (GHS)", "Discount (GHS)", "Total billed (GHS)", "Paid (GHS)", "Balance (GHS)", "Status"],
        columnTypes: ["text","text","text","text","text","text","date","date","money","money","money","money","money","text"],
        rows: records.map((row) => [
          row.billNumber, studentName(row.student), row.student.admissionNumber ?? "", row.class?.name ?? "",
          row.academicYear.name, row.term?.name ?? "", row.issuedAt, row.dueDate, asNumber(row.grossAmount), asNumber(row.discountAmount),
          asNumber(row.totalAmount), asNumber(row.paidAmount), asNumber(row.balanceAmount), row.status,
        ] as FinanceExportCell[]),
        totalColumns: [8,9,10,11,12],
        totalLabel: "Totals",
        reportInfo,
      };
      fileName = "schoolhub-invoice-register.xlsx";
    } else if (kind === "payments") {
      const range = dateRange(context.from, context.to, true);
      const records = await this.prisma.client.payment.findMany({
        where: { schoolId: context.schoolId, ...(range ? { paymentDate: range } : {}) },
        orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
        include: {
          student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          bill: { select: { billNumber: true } },
        },
      });
      rowCount = records.length;
      input = {
        title: "Payment register",
        headers: ["Receipt", "Date", "Student", "Admission number", "Invoice", "Method", "Reference", "Status", "Amount (GHS)"],
        columnTypes: ["text","date","text","text","text","text","text","text","money"],
        rows: records.map((row) => [row.paymentNumber, row.paymentDate, studentName(row.student), row.student.admissionNumber ?? "", row.bill?.billNumber ?? "Unallocated", row.paymentMethod, row.referenceNumber ?? "", row.status, asNumber(row.amount)] as FinanceExportCell[]),
        totalColumns: [8],
        totalLabel: "Totals",
        reportInfo,
      };
      fileName = "schoolhub-payment-register.xlsx";
    } else if (kind === "expenses") {
      const range = dateRange(context.from, context.to, true);
      const records = await this.prisma.client.expense.findMany({
        where: { schoolId: context.schoolId, ...(range ? { date: range } : {}) },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        include: {
          registryCategory: { select: { name: true } },
          customCategory: { select: { name: true } },
          recordedBy: { select: { name: true } },
        },
      });
      rowCount = records.length;
      input = {
        title: "Expense register",
        headers: ["Date", "Voucher", "Description", "Payee", "Expense category", "Accounting group", "Payment method", "Cheque", "Reference", "Amount (GHS)", "Recorded by"],
        columnTypes: ["date","text","text","text","text","text","text","text","text","money","text"],
        rows: records.map((row) => [
          row.date, row.voucherNumber ?? "", row.description, row.payee ?? "",
          row.registryCategory?.name ?? row.customCategory?.name ?? "Uncategorised", row.category ?? "",
          row.paymentMethod, row.checkNumber ?? "", row.referenceNumber ?? "", asNumber(row.amount), row.recordedBy?.name ?? "",
        ] as FinanceExportCell[]),
        totalColumns: [9],
        totalLabel: "Totals",
        reportInfo,
      };
      fileName = "schoolhub-expense-register.xlsx";
    } else {
      const periodFrom = validateDate(context.from, "start date");
      const periodTo = validateDate(context.to, "end date");
      if (periodFrom && periodTo && periodFrom.getTime() > periodTo.getTime()) {
        throw new BadRequestException("Start date must be before or equal to end date.");
      }
      const allRecords = await this.prisma.client.payrollRecord.findMany({
        where: { schoolId: context.schoolId },
        orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }],
        include: {
          payslips: {
            where: { schoolId: context.schoolId },
            include: {
              staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } } } },
              teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      });
      // Payroll periods are represented by month/year, not a timestamp. Filter against the run month rather than createdAt.
      const records = allRecords.filter((run) => {
        const monthStart = new Date(Date.UTC(run.year, run.month - 1, 1));
        const monthEnd = new Date(Date.UTC(run.year, run.month, 0, 23, 59, 59, 999));
        return (!periodFrom || monthEnd.getTime() >= periodFrom.getTime()) &&
          (!periodTo || monthStart.getTime() <= dayEnd(context.to!).getTime());
      });
      rowCount = records.reduce((count, record) => count + record.payslips.length, 0);
      input = {
        title: "Confidential payroll register",
        headers: ["Period", "Run status", "Employee", "Employee ID", "Basic (GHS)", "Allowances (GHS)", "Gross (GHS)", "Employee SSNIT (GHS)", "PAYE (GHS)", "Employer SSNIT (GHS)", "Other deductions (GHS)", "Net pay (GHS)", "Payment status"],
        columnTypes: ["text","text","text","text","money","money","money","money","money","money","money","money","text"],
        rows: records.flatMap((run) => run.payslips.map((slip) => [
          String(run.year) + "-" + String(run.month).padStart(2,"0"), run.status,
          studentName({ profile: slip.staff?.profile ?? slip.teacher?.profile, admissionNumber: slip.staff?.staffId ?? slip.teacher?.teacherId }),
          slip.staff?.staffId ?? slip.teacher?.teacherId ?? "",
          asNumber(slip.basicSalary), asNumber(slip.allowances), asNumber(slip.grossSalary), asNumber(slip.ssnitEmployee), asNumber(slip.incomeTax), asNumber(slip.ssnitEmployer), asNumber(slip.otherDeductions), asNumber(slip.netSalary), slip.paymentStatus,
        ] as FinanceExportCell[])),
        totalColumns: [4,5,6,7,8,9,10,11],
        totalLabel: "Totals",
        reportInfo: { ...reportInfo, Confidentiality: "Confidential payroll and salary information" },
      };
      fileName = "schoolhub-confidential-payroll-register.xlsx";
    }

    input.reportInfo = { ...input.reportInfo, "Generated at": generatedAt.toLocaleString("en-GH") };
    const buffer = await buildFinanceWorkbook(input);
    await this.auditExport(context, kind + ".xlsx", rowCount, { from: context.from, to: context.to });
    return {
      buffer,
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  private async pdfDocument(school: School, title: string, reference: string, kind: string) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const [red, green, blue] = primaryRgb(school.primaryColor);
    doc.setFillColor(red, green, blue);
    doc.rect(0, 0, pageWidth, 78, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(school.name, 36, 30, { maxWidth: pageWidth - 125 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const contact = [school.code, school.address, school.phone, school.email, school.website].filter(Boolean).join(" · ");
    doc.text(contact || "School finance office", 36, 47, { maxWidth: pageWidth - 125 });
    if (school.motto) doc.text(school.motto, 36, 62, { maxWidth: pageWidth - 125 });
    const qr = await QRCode.toDataURL("SCHOOLHUB|" + school.code + "|" + kind + "|" + reference, { errorCorrectionLevel: "M", margin: 1, width: 180 });
    doc.addImage(qr, "PNG", pageWidth - 82, 10, 48, 48);
    doc.setTextColor(25, 35, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, 36, 106, { maxWidth: pageWidth - 72 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Document reference: " + reference + " · Created " + new Date().toLocaleString("en-GH"), 36, 122, { maxWidth: pageWidth - 72 });
    return { doc, pageWidth };
  }

  private finishPdf(doc: jsPDF, kind: string, confidential = false, watermark?: "VOID" | "REVERSED") {
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      if (watermark) {
        doc.setTextColor(190, 35, 45);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.text(watermark, pageWidth / 2, pageHeight / 2, { align: "center", angle: 25 });
      }
      doc.setTextColor(100, 110, 120);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      if (confidential) doc.text("CONFIDENTIAL", 36, pageHeight - 18);
      doc.text("SchoolHub · " + kind + " · Page " + page + " of " + pageCount, pageWidth - 36, pageHeight - 18, { align: "right" });
    }
  }

  private pdfBuffer(doc: jsPDF): Buffer {
    return Buffer.from(doc.output("arraybuffer"));
  }

  private async findBill(schoolId: string, billId: string) {
    const bill = await this.prisma.client.bill.findFirst({
      where: { id: billId, schoolId },
      include: {
        student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
        class: { select: { name: true } },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        items: { orderBy: { createdAt: "asc" } },
        concessions: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!bill) throw new NotFoundException("Invoice not found.");
    return bill;
  }

  async invoicePdf(context: FinanceExportContext, billId: string): Promise<FinanceExportFile> {
    const school = await this.school(context.schoolId);
    const bill = await this.findBill(context.schoolId, billId);
    const { doc } = await this.pdfDocument(school, "Student invoice", bill.billNumber, "invoice");
    const student = studentName(bill.student);
    doc.setFontSize(10);
    doc.text("Student: " + student, 36, 150);
    doc.text("Admission number: " + (bill.student.admissionNumber ?? "—"), 36, 166);
    doc.text("Class: " + (bill.class?.name ?? "—"), 36, 182);
    doc.text("Academic period: " + bill.academicYear.name + (bill.term?.name ? " · " + bill.term.name : ""), 36, 198);
    doc.text("Issued: " + isoDay(bill.issuedAt) + "    Due date: " + isoDay(bill.dueDate), 36, 214);
    autoTable(doc, {
      startY: 230,
      head: [["Fee item", "Qty", "Unit amount", "Line total", "Discount"]],
      body: bill.items.map((item) => [
        item.description, String(item.quantity), formatMoney(item.amount), formatMoney(item.totalAmount), formatMoney(item.discountAmount),
      ]),
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: primaryRgb(school.primaryColor) },
      margin: { left: 36, right: 36, bottom: 46 },
    });
    let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240;
    y += 22;
    const totals = [
      ["Gross fees", formatMoney(bill.grossAmount)],
      ["Discounts and scholarships", formatMoney(bill.discountAmount)],
      ["Total billed", formatMoney(bill.totalAmount)],
      ["Payments recorded", formatMoney(bill.paidAmount)],
      ["Balance due", formatMoney(bill.balanceAmount)],
    ];
    autoTable(doc, { startY: y, body: totals, theme: "plain", styles: { fontSize: 9, cellPadding: 3 }, columnStyles: { 1: { halign: "right" } }, margin: { left: 210, right: 36, bottom: 46 } });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    doc.setFontSize(8);
    doc.text("Amount due in words: " + amountInWords(bill.balanceAmount), 36, y + 20, { maxWidth: 520 });
    doc.text("Status: " + bill.status, 36, y + 34);
    doc.text("Invoice reflects the saved SchoolHub billing records.", 36, y + 48, { maxWidth: 520 });
    this.finishPdf(doc, "Invoice", false, ["CANCELLED", "WAIVED"].includes(bill.status) ? "VOID" : undefined);
    const buffer = this.pdfBuffer(doc);
    await this.auditExport(context, "invoice.pdf", bill.items.length + 1, {});
    return { buffer, fileName: "invoice-" + bill.billNumber + ".pdf", contentType: "application/pdf" };
  }

  async receiptPdf(context: FinanceExportContext, paymentId: string): Promise<FinanceExportFile> {
    const school = await this.school(context.schoolId);
    const payment = await this.prisma.client.payment.findFirst({
      where: { id: paymentId, schoolId: context.schoolId },
      include: {
        student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
        bill: { select: { billNumber: true } },
        recordedBy: { select: { name: true, email: true } },
      },
    });
    if (!payment) throw new NotFoundException("Receipt not found.");
    const { doc } = await this.pdfDocument(school, "Payment receipt", payment.paymentNumber, "receipt");
    const fields = [
      ["Student", studentName(payment.student)],
      ["Admission number", payment.student.admissionNumber ?? "—"],
      ["Invoice", payment.bill?.billNumber ?? "Unallocated receipt"],
      ["Date", isoDay(payment.paymentDate)],
      ["Payment method", payment.paymentMethod.replaceAll("_", " ")],
      ["Transaction reference", payment.referenceNumber ?? "—"],
      ["Status", payment.status],
      ["Recorded by", payment.recordedBy?.name ?? payment.recordedBy?.email ?? "School accounts"],
      ["Amount received", formatMoney(payment.amount)],
      ["Amount in words", amountInWords(payment.amount)],
    ];
    autoTable(doc, { startY: 154, body: fields, theme: "plain", styles: { fontSize: 9, cellPadding: 6 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } }, margin: { left: 36, right: 36, bottom: 48 } });
    doc.setFontSize(8);
    doc.text("This document reflects the stored SchoolHub payment record; it does not independently verify an external bank or mobile-money transaction.", 36, ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220) + 24, { maxWidth: 520 });
    const watermark = payment.reversedAt || payment.status === "REFUNDED" ? "REVERSED" : payment.status === "CANCELLED" ? "VOID" : undefined;
    this.finishPdf(doc, "Receipt", false, watermark);
    const buffer = this.pdfBuffer(doc);
    await this.auditExport(context, "receipt.pdf", fields.length, {});
    return { buffer, fileName: "receipt-" + payment.paymentNumber + ".pdf", contentType: "application/pdf" };
  }

  async studentStatementPdf(context: FinanceExportContext, studentId: string): Promise<FinanceExportFile> {
    const school = await this.school(context.schoolId);
    const student = await this.prisma.client.student.findFirst({
      where: { id: studentId, schoolId: context.schoolId },
      select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException("Student not found.");
    const [bills, payments] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: { schoolId: context.schoolId, studentId },
        orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
        select: { billNumber: true, issuedAt: true, totalAmount: true, status: true, term: { select: { name: true } }, academicYear: { select: { name: true } } },
      }),
      this.prisma.client.payment.findMany({
        where: { schoolId: context.schoolId, studentId },
        orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { paymentNumber: true, paymentDate: true, amount: true, status: true, reversedAt: true, bill: { select: { billNumber: true } } },
      }),
    ]);
    type StatementEntry = { date: Date; reference: string; description: string; debit: Prisma.Decimal; credit: Prisma.Decimal; sort: number };
    const entries: StatementEntry[] = [];
    for (const bill of bills) {
      if (bill.status === "CANCELLED" || bill.status === "WAIVED") continue;
      entries.push({
        date: bill.issuedAt,
        reference: bill.billNumber,
        description: "Invoice" + (bill.academicYear?.name ? " · " + bill.academicYear.name : "") + (bill.term?.name ? " · " + bill.term.name : ""),
        debit: bill.totalAmount,
        credit: new Prisma.Decimal(0),
        sort: 0,
      });
    }
    for (const payment of payments) {
      const reversed = !!payment.reversedAt || payment.status === "REFUNDED" || payment.status === "CANCELLED";
      if (payment.status === "COMPLETED" || payment.reversedAt || payment.status === "REFUNDED") {
        entries.push({
          date: payment.paymentDate,
          reference: payment.paymentNumber,
          description: "Receipt" + (payment.bill?.billNumber ? " · " + payment.bill.billNumber : " · Unallocated"),
          debit: new Prisma.Decimal(0),
          credit: payment.amount,
          sort: 1,
        });
        if (reversed) {
          entries.push({
            date: payment.reversedAt ?? payment.paymentDate,
            reference: payment.paymentNumber,
            description: payment.status === "REFUNDED" ? "Refund / reversal" : "Voided receipt",
            debit: payment.amount,
            credit: new Prisma.Decimal(0),
            sort: 2,
          });
        }
      }
    }
    entries.sort((a,b) => a.date.getTime() - b.date.getTime() || a.sort - b.sort || a.reference.localeCompare(b.reference));
    let balance = new Prisma.Decimal(0);
    const rows = entries.map((entry) => {
      balance = balance.plus(entry.debit).minus(entry.credit);
      return [isoDay(entry.date), entry.reference, entry.description, formatMoney(entry.debit), formatMoney(entry.credit), formatMoney(balance)];
    });
    const { doc } = await this.pdfDocument(school, "Student statement of account", student.admissionNumber ?? student.id, "statement");
    doc.setFontSize(10);
    doc.text("Student: " + studentName(student), 36, 150);
    doc.text("Admission number: " + (student.admissionNumber ?? "—"), 36, 166);
    doc.setFontSize(8);
    doc.text("This statement is based on the available SchoolHub bill and payment history. No separate opening balance is stored in the current model.", 36, 184, { maxWidth: 520 });
    autoTable(doc, {
      startY: 198,
      head: [["Date", "Reference", "Description", "Debit", "Credit", "Running balance"]],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: primaryRgb(school.primaryColor) },
      columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 78 }, 2: { cellWidth: 150 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      margin: { left: 30, right: 30, bottom: 38 },
    });
    const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 230;
    autoTable(doc, { startY: y + 12, body: [["Closing balance", formatMoney(balance)]], theme: "plain", styles: { fontSize: 10, fontStyle: "bold" }, columnStyles: { 1: { halign: "right" } }, margin: { left: 320, right: 30 } });
    this.finishPdf(doc, "Student statement");
    const buffer = this.pdfBuffer(doc);
    await this.auditExport(context, "student-statement.pdf", entries.length, {});
    return { buffer, fileName: "student-statement-" + (student.admissionNumber ?? student.id) + ".pdf", contentType: "application/pdf" };
  }

  async payrollPdf(context: FinanceExportContext, recordId: string): Promise<FinanceExportFile> {
    const school = await this.school(context.schoolId);
    const run = await this.prisma.client.payrollRecord.findFirst({
      where: { id: recordId, schoolId: context.schoolId },
      include: {
        payslips: {
          where: { schoolId: context.schoolId },
          include: {
            staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } } } },
            teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
    if (!run) throw new NotFoundException("Payroll run not found.");
    const { doc } = await this.pdfDocument(school, "Payroll payslip schedule", String(run.year) + "-" + String(run.month).padStart(2,"0"), "payroll";
    autoTable(doc, {
      startY: 152,
      head: [["Employee", "Employee ID", "Basic", "Allowance", "Gross", "Employee SSNIT", "PAYE", "Employer SSNIT", "Other deductions", "Net pay"]],
      body: run.payslips.map((slip) => [
        studentName({ profile: slip.staff?.profile ?? slip.teacher?.profile, admissionNumber: slip.staff?.staffId ?? slip.teacher?.teacherId }),
        slip.staff?.staffId ?? slip.teacher?.teacherId ?? "",
        formatMoney(slip.basicSalary), formatMoney(slip.allowances), formatMoney(slip.grossSalary),
        formatMoney(slip.ssnitEmployee), formatMoney(slip.incomeTax), formatMoney(slip.ssnitEmployer),
        formatMoney(slip.otherDeductions), formatMoney(slip.netSalary),
      ]),
      styles: { fontSize: 6.5, cellPadding: 3 },
      headStyles: { fillColor: primaryRgb(school.primaryColor) },
      margin: { left: 20, right: 20, bottom: 48 },
    });
    const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
    autoTable(doc, {
      startY: y + 14,
      body: [
        ["Employees", String(run.payslips.length)],
        ["Gross payroll", formatMoney(run.totalGross)],
        ["PAYE", formatMoney(run.totalTax)],
        ["SSNIT total", formatMoney(run.totalSSNIT)],
        ["Net payroll", formatMoney(run.totalNet)],
        ["Run status", run.status],
      ],
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 300, right: 30 },
    });
    this.finishPdf(doc, "Payroll schedule", true, run.status === "CANCELLED" ? "VOID" : undefined);
    const buffer = this.pdfBuffer(doc);
    await this.auditExport(context, "payroll-payslips.pdf", run.payslips.length, { from: String(run.year), to: String(run.month) });
    return { buffer, fileName: "confidential-payslips-" + run.year + "-" + String(run.month).padStart(2,"0") + ".pdf", contentType: "application/pdf" };
  }
}
