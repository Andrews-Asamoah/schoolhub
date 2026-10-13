import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { BatchAttendanceInput } from "@schoolhub/shared";

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async batchRecordAttendance(
    _schoolId: string,
    markedById: string,
    input: BatchAttendanceInput,
  ) {
    const attendanceDate = new Date(input.date);

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

  async getClassAttendance(schoolId: string, classId: string, date: string) {
    const attendanceDate = new Date(date);

    const students = await this.prisma.client.student.findMany({
      where: { classId, schoolId, deletedAt: null },
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

  async getStudentAttendanceSummary(schoolId: string, studentId: string) {
    const records = await this.prisma.client.attendance.groupBy({
      by: ["status"],
      where: {
        studentId,
        student: { schoolId },
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
}
