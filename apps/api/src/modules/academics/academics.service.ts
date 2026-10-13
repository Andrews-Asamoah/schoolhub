import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateClassInput, CreateSubjectInput } from "@schoolhub/shared";

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(schoolId: string, academicYearId?: string) {
    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
    };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }

    return this.prisma.client.class.findMany({
      where,
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        academicYear: { select: { id: true, name: true, isCurrent: true } },
        classTeacher: {
          include: { profile: { select: { firstName: true, lastName: true } } },
        },
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
    });
  }

  async createClass(schoolId: string, input: CreateClassInput) {
    return this.prisma.client.class.create({
      data: {
        schoolId,
        name: input.name,
        level: input.level,
        academicYearId: input.academicYearId,
        capacity: input.capacity,
        classTeacherId: input.classTeacherId,
        departmentId: input.departmentId,
        isGraduatingClass: input.isGraduatingClass,
        order: input.order,
      },
      include: {
        academicYear: true,
      },
    });
  }

  async getClassStudents(schoolId: string, classId: string) {
    const classEntity = await this.prisma.client.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null },
    });

    if (!classEntity) {
      throw new NotFoundException("Class not found");
    }

    return this.prisma.client.student.findMany({
      where: {
        classId,
        schoolId,
        deletedAt: null,
      },
      orderBy: [
        { profile: { lastName: "asc" } },
        { profile: { firstName: "asc" } },
      ],
      include: {
        profile: true,
      },
    });
  }

  async listSubjects(schoolId: string) {
    return this.prisma.client.subject.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async createSubject(schoolId: string, input: CreateSubjectInput) {
    return this.prisma.client.subject.create({
      data: {
        schoolId,
        name: input.name,
        code: input.code,
        description: input.description,
        periodsPerWeek: input.periodsPerWeek,
      },
    });
  }
}
