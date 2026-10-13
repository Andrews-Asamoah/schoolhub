import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateStudentInput, UpdateStudentInput } from "@schoolhub/shared";
import type { StudentStatus } from "@prisma/client";

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listStudents(
    schoolId: string,
    params: {
      page?: number;
      limit?: number;
      classId?: string;
      search?: string;
      status?: StudentStatus;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
    };

    if (params.classId) {
      where.classId = params.classId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { admissionNumber: { contains: params.search, mode: "insensitive" } },
        { studentId: { contains: params.search, mode: "insensitive" } },
        {
          profile: {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" } },
              { lastName: { contains: params.search, mode: "insensitive" } },
              { otherNames: { contains: params.search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const [students, total] = await Promise.all([
      this.prisma.client.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          profile: true,
          class: { select: { id: true, name: true, level: true } },
          house: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.client.student.count({ where }),
    ]);

    return {
      data: students,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStudentById(schoolId: string, id: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: {
        profile: true,
        class: true,
        house: true,
        department: true,
        guardians: {
          include: {
            guardian: { include: { profile: true } },
          },
        },
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          take: 5,
          include: { class: true, academicYear: true, term: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    return student;
  }

  async createStudent(schoolId: string, input: CreateStudentInput) {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const admissionNumber =
      input.admissionNumber || `STU/${year}/${randomSuffix}`;
    const studentId = `ID-${Date.now().toString().slice(-6)}`;

    // Create a student user account and associated profile in a transaction
    return this.prisma.client.$transaction(async (tx) => {
      // Create student user entity
      const user = await tx.user.create({
        data: {
          id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: `${input.firstName} ${input.lastName}`,
          email: `${admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.schoolhub`,
          role: "student",
        },
      });

      // Create student user profile
      const profile = await tx.userProfile.create({
        data: {
          userId: user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          otherNames: input.otherNames,
          gender: input.gender,
          dateOfBirth: new Date(input.dateOfBirth),
          nationality: input.nationality,
          residentialAddress: input.residentialAddress,
          city: input.city,
          region: input.region,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          emergencyRelationship: input.emergencyRelationship,
        },
      });

      // Create student record
      const student = await tx.student.create({
        data: {
          schoolId,
          profileId: profile.id,
          studentId,
          admissionNumber,
          classId: input.classId,
          departmentId: input.departmentId,
          houseId: input.houseId,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies,
          medicalConditions: input.medicalConditions,
        },
        include: {
          profile: true,
          class: true,
        },
      });

      return student;
    });
  }

  async updateStudent(
    schoolId: string,
    id: string,
    input: UpdateStudentInput,
  ) {
    const existing = await this.prisma.client.student.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundException("Student not found");
    }

    return this.prisma.client.$transaction(async (tx) => {
      if (existing.profileId) {
        await tx.userProfile.update({
          where: { id: existing.profileId },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            otherNames: input.otherNames,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
            residentialAddress: input.residentialAddress,
            city: input.city,
            region: input.region,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            emergencyRelationship: input.emergencyRelationship,
          },
        });
      }

      const updated = await tx.student.update({
        where: { id },
        data: {
          classId: input.classId,
          departmentId: input.departmentId,
          houseId: input.houseId,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies,
          medicalConditions: input.medicalConditions,
        },
        include: {
          profile: true,
          class: true,
        },
      });

      return updated;
    });
  }

  async deleteStudent(schoolId: string, id: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { id, schoolId, deletedAt: null },
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    await this.prisma.client.student.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "WITHDRAWN",
      },
    });

    return { success: true, message: "Student deleted successfully" };
  }
}
