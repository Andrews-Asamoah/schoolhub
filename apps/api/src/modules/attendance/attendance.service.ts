import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { BatchAttendanceInput } from "@schoolhub/shared";
import { canManageAcademicContext } from "../../common/academic-context.js";

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async batchRecordAttendance(
    schoolId: string,
    markedById: string,
    input: BatchAttendanceInput,
    _role?: string,
  ) {
    const attendanceDate = new Date(input.date);
    const { academicYear, term } =
      await this.resolveAcademicContext(schoolId);
    this.assertCurrentTermDate(input.date, term.startDate, term.endDate);
    const studentIds = input.records.map((record) => record.studentId);
    const placements = await this.prisma.client.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId: academicYear.id,
        termId: term.id,
        status: "ACTIVE",
        student: { schoolId, deletedAt: null },
      },
      select: { studentId: true },
    });
    if (placements.length !== studentIds.length) {
      throw new ForbiddenException(
        "Attendance can only be recorded for students enrolled in the current term.",
      );
    }

    const operations = input.records.map((record) =>
      this.prisma.client.attendance.upsert({
        where: {
          studentId_date: {
            studentId: record.studentId,
            date: attendanceDate,
          },
        },
        update: {
          status: record.status,
          remarks: record.remarks,
          markedById,
          markedAt: new Date(),
        },
        create: {
          studentId: record.studentId,
          date: attendanceDate,
          status: record.status,
          remarks: record.remarks,
          markedById,
          markedAt: new Date(),
        },
      }),
    );

    const results = await this.prisma.client.$transaction(operations);

    return {
      success: true,
      count: results.length,
      date: input.date,
    };
  }

  async getClassAttendance(
    schoolId: string,
    classId: string,
    requestedDate?: string,
    role?: string,
    academicYearId?: string,
    termId?: string,
  ) {
    const { academicYear, term } = await this.resolveAcademicContext(
      schoolId,
      academicYearId,
      termId,
      role,
    );
    const today = new Date().toISOString().slice(0, 10);
    const date =
      requestedDate ??
      (academicYear.isCurrent && term.isCurrent
        ? today
        : term.startDate.toISOString().slice(0, 10));
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);
    if (requestedDate) {
      this.assertCurrentTermDate(requestedDate, term.startDate, term.endDate);
    }

    const students = await this.prisma.client.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        enrollments: {
          some: {
            classId,
            academicYearId: academicYear.id,
            termId: term.id,
            status: "ACTIVE",
          },
        },
      },
      orderBy: { profile: { lastName: "asc" } },
      include: {
        profile: { select: { firstName: true, lastName: true, otherNames: true } },
        attendances: {
          where: { date: attendanceDate },
          take: 1,
        },
      },
    });

    return students.map((s) => ({
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      name: `${s.profile.firstName} ${s.profile.lastName}`,
      attendance: s.attendances[0] ?? null,
    }));
  }

  async getStudentAttendanceSummary(
    schoolId: string,
    studentId: string,
    role?: string,
    academicYearId?: string,
    termId?: string,
  ) {
    const { academicYear, term } = await this.resolveAcademicContext(
      schoolId,
      academicYearId,
      termId,
      role,
    );
    const records = await this.prisma.client.attendance.groupBy({
      by: ["status"],
      where: {
        studentId,
        student: {
          schoolId,
          enrollments: {
            some: {
              academicYearId: academicYear.id,
              termId: term.id,
              status: "ACTIVE",
            },
          },
        },
        date: { gte: term.startDate, lte: term.endDate },
      },
      _count: true,
    });

    const summary: Record<string, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
      SICK: 0,
      PERMISSION: 0,
    };

    records.forEach((r) => {
      summary[r.status] = r._count;
    });

    const totalDays = Object.values(summary).reduce((a, b) => a + b, 0);
    const attendanceRate =
      totalDays > 0
        ? Math.round(((summary.PRESENT! + summary.LATE!) / totalDays) * 100)
        : 100;

    return {
      summary,
      totalDays,
      attendanceRate,
    };
  }

  async getMyAttendanceSummary(
    schoolId: string,
    userId: string,
    academicYearId?: string,
    termId?: string,
  ) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');
    const { academicYear, term } = await this.resolveAcademicContext(
      schoolId,
      academicYearId,
      termId,
      'student',
    );
    const summaryData = await this.getStudentAttendanceSummary(
      schoolId,
      student.id,
      'student',
      academicYear.id,
      term.id,
    );
    const recentRecords = await this.prisma.client.attendance.findMany({
      where: {
        studentId: student.id,
        date: { gte: term.startDate, lte: term.endDate },
      },
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        id: true,
        date: true,
        status: true,
        remarks: true,
      },
    });
    return {
      ...summaryData,
      academicYear: { id: academicYear.id, name: academicYear.name },
      term: { id: term.id, name: term.name },
      recentRecords,
    };
  }

  private async resolveAcademicContext(
    schoolId: string,
    academicYearId?: string,
    termId?: string,
    role?: string,
  ) {
    if (Boolean(academicYearId) !== Boolean(termId)) {
      throw new BadRequestException(
        "Academic year and term must be supplied together.",
      );
    }
    const academicYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const term = academicYear?.terms[0];
    if (!academicYear || !term) {
      throw new BadRequestException(
        "This school has not selected a current academic year and term.",
      );
    }
    if (!academicYearId || !termId) return { academicYear, term };

    const selectedTerm = await this.prisma.client.term.findFirst({
      where: {
        id: termId,
        academicYearId,
        academicYear: { schoolId },
      },
      include: { academicYear: true },
    });
    if (!selectedTerm) {
      throw new BadRequestException(
        "Choose a term belonging to an academic year in this school.",
      );
    }
    if (
      !canManageAcademicContext(role) &&
      (selectedTerm.academicYearId !== academicYear.id ||
        selectedTerm.id !== term.id)
    ) {
      throw new ForbiddenException(
        "Only the current academic year and term are available for your role.",
      );
    }
    return { academicYear: selectedTerm.academicYear, term: selectedTerm };
  }

  private assertCurrentTermDate(
    value: string,
    startDate: Date,
    endDate: Date,
  ) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      date < startDate ||
      date > endDate
    ) {
      throw new BadRequestException(
        "Attendance date must fall within the currently selected term.",
      );
    }
  }
}
