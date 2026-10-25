import { Injectable, NotFoundException } from "@nestjs/common";
import { NAME_LOCKED_ROLES, type UpdateMyProfileInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

const PROFILE_FIELDS = {
  firstName: true,
  lastName: true,
  otherNames: true,
  phone: true,
  alternatePhone: true,
  residentialAddress: true,
  city: true,
  region: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyRelationship: true,
} as const;

function splitName(full: string) {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { first, last: rest.join(" ") || first };


}


const SMALL_NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function integerToWords(value: bigint): string {
  if (value < 20n) return SMALL_NUMBER_WORDS[Number(value)]!;
  if (value < 100n) return `${TENS_WORDS[Number(value / 10n)]}${value % 10n ? `-${SMALL_NUMBER_WORDS[Number(value % 10n)]}` : ""}`;
  if (value < 1000n) return `${integerToWords(value / 100n)} hundred${value % 100n ? ` ${integerToWords(value % 100n)}` : ""}`;
  for (const [size, label] of [[1000000000n, "billion"], [1000000n, "million"], [1000n, "thousand"]] as const) {
    if (value >= size) return `${integerToWords(value / size)} ${label}${value / size > 1n ? "s" : ""}${value % size ? ` ${integerToWords(value % size)}` : ""}`;
  }
  return value.toString();
}

function amountInWords(amount: string): string {
  const [whole = "0", fraction = "00"] = new Prisma.Decimal(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2).split(".");
  return `${integerToWords(BigInt(whole))} Ghana cedis and ${integerToWords(BigInt(fraction))} pesewas only`;
}

/** A signed-in user's own basic details. Never touches email, role or anyone else's record. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  isNameLocked(role: string | undefined) {
    return (NAME_LOCKED_ROLES as readonly string[]).includes(role ?? "");
  }

  async getProfile(userId: string, role: string | undefined) {
    const db = this.prisma.client;
    const [user, profile, student] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true } }),
      db.userProfile.findUnique({ where: { userId }, select: PROFILE_FIELDS }),
      // Students sign in with a username; their email is a generated internal address.
      role === "student"
        ? db.student.findFirst({ where: { deletedAt: null, profile: { userId } }, select: { username: true } })
        : Promise.resolve(null),
    ]);
    if (!user) throw new NotFoundException("Account not found");
    const fallback = splitName(user.name);
    return {
      user,
      username: student?.username ?? null,
      profile: profile ?? {
        firstName: fallback.first,
        lastName: fallback.last,
        otherNames: null,
        phone: null,
        alternatePhone: null,
        residentialAddress: null,
        city: null,
        region: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyRelationship: null,
      },
      canEditName: !this.isNameLocked(role),
    };
  }

  async updateProfile(userId: string, role: string | undefined, input: UpdateMyProfileInput) {
    const db = this.prisma.client;
    const [user, existing] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true } }),
      db.userProfile.findUnique({ where: { userId }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    if (!user) throw new NotFoundException("Account not found");

    const lockName = this.isNameLocked(role);
    const fallback = splitName(user.name);
    const firstName = lockName ? existing?.firstName ?? fallback.first : input.firstName ?? existing?.firstName ?? fallback.first;
    const lastName = lockName ? existing?.lastName ?? fallback.last : input.lastName ?? existing?.lastName ?? fallback.last;

    // `undefined` leaves a field alone; `null` clears it.
    const details = {
      phone: input.phone,
      alternatePhone: input.alternatePhone,
      residentialAddress: input.residentialAddress,
      city: input.city,
      region: input.region,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      emergencyRelationship: input.emergencyRelationship,
    };
    const names = lockName ? {} : { firstName, lastName, otherNames: input.otherNames };

    await db.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, firstName, lastName, ...names, ...details },
        update: { ...names, ...details },
        select: { id: true },
      });
      if (!lockName) {
        await tx.user.update({ where: { id: userId }, data: { name: `${firstName} ${lastName}`.trim() } });
        // Teacher records keep their own copy of the name; keep it in step.
        await tx.teacher.updateMany({ where: { profileId: profile.id }, data: { firstName, lastName } });
      }
    });

    return this.getProfile(userId, role);
  }

  private async getPayrollIdentity(userId: string, schoolId: string) {
    const [staff, teacher] = await Promise.all([
      this.prisma.client.staff.findFirst({ where: { schoolId, deletedAt: null, profile: { userId } }, select: { id: true } }),
      this.prisma.client.teacher.findFirst({ where: { schoolId, deletedAt: null, profile: { userId } }, select: { id: true } }),
    ]);
    return { staffId: staff?.id ?? null, teacherId: teacher?.id ?? null };
  }

  private async filterPrivateContributionLines<T extends { code: string }>(
    schoolId: string,
    payslip: { staffId: string | null; teacherId: string | null; payrollRecord: { month: number; year: number }; lines: T[] },
  ): Promise<T[]> {
    const start = new Date(Date.UTC(payslip.payrollRecord.year, payslip.payrollRecord.month - 1, 1));
    const end = new Date(Date.UTC(payslip.payrollRecord.year, payslip.payrollRecord.month, 0));
    const enrolments = await this.prisma.client.staffContributionEnrolment.findMany({
      where: {
        ...(payslip.staffId ? { staffId: payslip.staffId } : payslip.teacherId ? { teacherId: payslip.teacherId } : {}),
        startsAt: { lte: end },
        OR: [{ endsAt: null }, { endsAt: { gte: start } }],
        scheme: { code: { in: ["TIER2", "TIER3"] }, schoolId },
      },
      select: { scheme: { select: { code: true } } },
    });
    const enrolledCodes = new Set(enrolments.map((row) => row.scheme.code));
    return payslip.lines.filter((line) => {
      if (line.code.startsWith("TIER2_")) return enrolledCodes.has("TIER2");
      if (line.code.startsWith("TIER3_")) return enrolledCodes.has("TIER3");
      return true;
    });
  }

  /** Own payslips only; draft and cancelled payroll runs are never exposed. */
  async getMyPayslips(userId: string, schoolId: string) {
    const identity = await this.getPayrollIdentity(userId, schoolId);
    if (!identity.staffId && !identity.teacherId) return { items: [] };
    const rows = await this.prisma.client.payslip.findMany({
      where: {
        schoolId,
        payrollRecord: { status: { in: ["APPROVED", "PAID"] } },
        OR: [
          ...(identity.staffId ? [{ staffId: identity.staffId }] : []),
          ...(identity.teacherId ? [{ teacherId: identity.teacherId }] : []),
        ],
      },
      include: { payrollRecord: { select: { id: true, month: true, year: true, status: true } }, lines: true },
      orderBy: [{ payrollRecord: { year: "desc" } }, { payrollRecord: { month: "desc" } }, { createdAt: "desc" }],
    });
    const items = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      month: row.payrollRecord.month,
      year: row.payrollRecord.year,
      status: row.payrollRecord.status,
      basicSalary: row.basicSalary.toFixed(2),
      grossSalary: row.grossSalary.toFixed(2),
      incomeTax: row.incomeTax.toFixed(2),
      netSalary: row.netSalary.toFixed(2),
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      lines: await this.filterPrivateContributionLines(schoolId, row),
    })));
    return { items };
  }

  /** A requested payslip is looked up by both ID and authenticated employee identity to prevent IDOR. */
  async getMyPayslip(userId: string, schoolId: string, payslipId: string) {
    const identity = await this.getPayrollIdentity(userId, schoolId);
    if (!identity.staffId && !identity.teacherId) throw new NotFoundException("Payslip not found.");
    const row = await this.prisma.client.payslip.findFirst({
      where: {
        id: payslipId,
        schoolId,
        payrollRecord: { status: { in: ["APPROVED", "PAID"] } },
        OR: [
          ...(identity.staffId ? [{ staffId: identity.staffId }] : []),
          ...(identity.teacherId ? [{ teacherId: identity.teacherId }] : []),
        ],
      },
      include: {
        payrollRecord: { select: { id: true, month: true, year: true, status: true } },
        lines: true,
        school: { select: { name: true, logo: true, address: true, phone: true, email: true } },
        staff: { select: { staffId: true, profile: { select: { firstName: true, lastName: true } }, payProfile: { select: { ssnitNumber: true, tin: true, gradeOrPosition: true, department: true, paymentMode: true } } } },
        teacher: { select: { teacherId: true, profile: { select: { firstName: true, lastName: true } }, payProfile: { select: { ssnitNumber: true, tin: true, gradeOrPosition: true, department: true, paymentMode: true } } } },
      },
    });
    if (!row) throw new NotFoundException("Payslip not found.");
    return {
      id: row.id,
      month: row.payrollRecord.month,
      year: row.payrollRecord.year,
      status: row.payrollRecord.status,
      school: row.school,
      employee: {
        name: [row.staff?.profile?.firstName ?? row.teacher?.profile?.firstName, row.staff?.profile?.lastName ?? row.teacher?.profile?.lastName].filter(Boolean).join(" "),
        identifier: row.staff?.staffId ?? row.teacher?.teacherId ?? "N/A",
        payProfile: row.staff?.payProfile ?? row.teacher?.payProfile ?? null,
      },
      basicSalary: row.basicSalary.toFixed(2),
      allowances: row.allowances.toFixed(2),
      grossSalary: row.grossSalary.toFixed(2),
      ssnitEmployee: row.ssnitEmployee.toFixed(2),
      ssnitEmployer: row.ssnitEmployer.toFixed(2),
      tier2Employee: row.tier2Employee.toFixed(2),
      tier2Employer: row.tier2Employer.toFixed(2),
      tier3Employee: row.tier3Employee.toFixed(2),
      tier3Employer: row.tier3Employer.toFixed(2),
      incomeTax: row.incomeTax.toFixed(2),
      otherDeductions: row.otherDeductions.toFixed(2),
      netSalary: row.netSalary.toFixed(2),
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      lines: await this.filterPrivateContributionLines(userId, schoolId, row),
    };
  }


  async getMyPayslipPdf(userId: string, schoolId: string, payslipId: string): Promise<Buffer> {
    const slip = await this.getMyPayslip(userId, schoolId, payslipId);
    const identity = await this.getPayrollIdentity(userId, schoolId);
    const rows = await this.prisma.client.payslip.findMany({
      where: {
        schoolId,
        payrollRecord: { year: slip.year, month: { lte: slip.month }, status: { in: ["APPROVED", "PAID"] } },
        OR: [
          ...(identity.staffId ? [{ staffId: identity.staffId }] : []),
          ...(identity.teacherId ? [{ teacherId: identity.teacherId }] : []),
        ],
      },
      select: {
        grossSalary: true, ssnitEmployee: true, ssnitEmployer: true, incomeTax: true,
        tier2Employee: true, tier2Employer: true, tier3Employee: true, tier3Employer: true,
      },
    });
    const sum = (field: "grossSalary" | "ssnitEmployee" | "ssnitEmployer" | "incomeTax" | "tier2Employee" | "tier2Employer" | "tier3Employee" | "tier3Employer") =>
      rows.reduce((total, row) => total.add(row[field]), new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const period = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(slip.year, slip.month - 1, 1)));
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setProperties({ title: `Confidential payslip — ${period}`, subject: "Employee payroll statement", creator: "SchoolHub" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(slip.school.name, 14, 16);
    doc.setFontSize(11);
    doc.text("CONFIDENTIAL PAYSLIP", 14, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(period, pageWidth - 14, 24, { align: "right" });
    const payProfile = slip.employee.payProfile;
    const employeeInfo = [
      [ "Employee", slip.employee.name || "Employee" ],
      [ "Staff ID", slip.employee.identifier ],
      [ "SSNIT No.", payProfile?.ssnitNumber || "Not recorded" ],
      [ "TIN", payProfile?.tin || "Not recorded" ],
      [ "Grade / Position", payProfile?.gradeOrPosition || "Not recorded" ],
      [ "Department", payProfile?.department || "Not recorded" ],
      [ "Payment mode", slip.paymentMethod || payProfile?.paymentMode || "Not recorded" ],
    ];
    autoTable(doc, {
      startY: 30,
      head: [["Employee details", "Value"]],
      body: employeeInfo,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 55, 80] },
      columnStyles: { 0: { cellWidth: 42, fontStyle: "bold" } },
      margin: { left: 14, right: 14 },
    });
    const lineRows = slip.lines.map((line) => [
      line.code,
      line.description,
      line.originalAmount?.toFixed(2) ?? "",
      line.kind === "EARNING" ? line.amount.toFixed(2) : "",
      line.kind === "DEDUCTION" ? line.amount.toFixed(2) : "",
      line.kind === "EMPLOYER_CONTRIBUTION" || line.kind === "MEMO" ? line.amount.toFixed(2) : "",
    ]);
    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 6 : 78,
      head: [["Code", "Description", "Original amount", "Earnings (GHS)", "Deductions (GHS)", "Employer / memo (GHS)"]],
      body: lineRows,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.7, overflow: "linebreak" },
      headStyles: { fillColor: [37, 55, 80] },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 52 }, 2: { cellWidth: 27 }, 3: { cellWidth: 26 }, 4: { cellWidth: 26 }, 5: { cellWidth: 26 } },
      margin: { left: 14, right: 14 },
    });
    let y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 160) + 8;
    if (y > doc.internal.pageSize.getHeight() - 48) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PAY SUMMARY", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 7;
    const summary = [
      `Basic salary: GHS ${slip.basicSalary}`,
      `Gross earnings: GHS ${slip.grossSalary}`,
      `PAYE: GHS ${slip.incomeTax}`,
      `Net pay: GHS ${slip.netSalary}`,
      `Net pay in words: ${amountInWords(slip.netSalary)}`,
      `Annualised basic salary: GHS ${new Prisma.Decimal(slip.basicSalary).mul(12).toFixed(2)}`,
      `YTD gross: GHS ${sum("grossSalary").toFixed(2)}`,
      `YTD employee SSNIT: GHS ${sum("ssnitEmployee").toFixed(2)}`,
      `YTD PAYE: GHS ${sum("incomeTax").toFixed(2)}`,
      `YTD employer SSNIT: GHS ${sum("ssnitEmployer").toFixed(2)}`,
      `Tier 2 employee / employer memo: GHS ${slip.tier2Employee} / GHS ${slip.tier2Employer}`,
      `Tier 3 employee / employer memo: GHS ${slip.tier3Employee} / GHS ${slip.tier3Employer}`,
    ];
    for (const line of summary) {
      doc.text(line, 14, y, { maxWidth: pageWidth - 62 });
      y += 5.5;
      if (y > doc.internal.pageSize.getHeight() - 28) {
        doc.addPage();
        y = 20;
      }
    }
    const signingKey = process.env.PAYSLIP_QR_SIGNING_KEY ?? process.env.BETTER_AUTH_SECRET;
    if (!signingKey) throw new NotFoundException("Payslip verification signing is not configured.");
    const signature = createHmac("sha256", signingKey).update(`schoolhub-private-payslip:${schoolId}:${slip.id}:${slip.year}-${String(slip.month).padStart(2, "0")}`).digest("hex");
    const qr = await QRCode.toDataURL(`schoolhub-private-payslip:${slip.id}:${signature}`, { errorCorrectionLevel: "M", margin: 1, width: 128 });
    if (y > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      y = 20;
    }
    doc.addImage(qr, "PNG", pageWidth - 38, y - 2, 24, 24);
    doc.setFontSize(7);
    doc.text("Private verification token — no public lookup endpoint", pageWidth - 42, y + 25, { maxWidth: 34 });
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
      doc.setPage(page);
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text("CONFIDENTIAL — for the named employee only", 14, height - 10);
      doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, pageWidth - 14, height - 10, { align: "right" });
    }
    return Buffer.from(doc.output("arraybuffer"));
  }

}
