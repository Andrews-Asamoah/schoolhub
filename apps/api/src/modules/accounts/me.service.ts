import { Injectable, NotFoundException } from "@nestjs/common";
import { NAME_LOCKED_ROLES, type UpdateMyProfileInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";

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

  private async filterPrivateContributionLines(
    userId: string,
    schoolId: string,
    payslip: { staffId: string | null; teacherId: string | null; payrollRecord: { month: number; year: number }; lines: Array<{ code: string }> },
  ) {
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
      lines: await this.filterPrivateContributionLines(userId, schoolId, row),
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
      },
    });
    if (!row) throw new NotFoundException("Payslip not found.");
    return {
      id: row.id,
      month: row.payrollRecord.month,
      year: row.payrollRecord.year,
      status: row.payrollRecord.status,
      school: row.school,
      basicSalary: row.basicSalary.toFixed(2),
      allowances: row.allowances.toFixed(2),
      grossSalary: row.grossSalary.toFixed(2),
      ssnitEmployee: row.ssnitEmployee.toFixed(2),
      ssnitEmployer: row.ssnitEmployer.toFixed(2),
      tier2Employee: row.tier2Employee.toFixed(2),
      tier2Employer: row.tier2Employer.toFixed(2),
      tier3Employee: row.tier3Employee.toFixed(2),
      incomeTax: row.incomeTax.toFixed(2),
      otherDeductions: row.otherDeductions.toFixed(2),
      netSalary: row.netSalary.toFixed(2),
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      paidAt: row.paidAt,
      lines: await this.filterPrivateContributionLines(userId, schoolId, row),
    };
  }

}
