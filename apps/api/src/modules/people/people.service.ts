import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateGuardianInput,
  CreateStaffInput,
  CreateTeacherInput,
} from '@schoolhub/shared';

interface ListPeopleParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

function pagination(params: ListPeopleParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  return { page, limit, skip: (page - 1) * limit };
}

function searchText(value?: string) {
  const text = value?.trim();
  return text ? { contains: text, mode: 'insensitive' as const } : undefined;
}

function newPublicId(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${randomUUID()
    .replaceAll('-', '')
    .slice(0, 8)
    .toUpperCase()}`;
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeachers(schoolId: string, params: ListPeopleParams) {
    const { page, limit, skip } = pagination(params);
    const search = searchText(params.search);
    const where = {
      schoolId,
      deletedAt: null,
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(search
        ? {
            OR: [
              { firstName: search },
              { lastName: search },
              { teacherId: search },
              { staffNumber: search },
              { invitationEmail: search },
              {
                profile: {
                  is: {
                    OR: [{ firstName: search }, { lastName: search }],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          department: { select: { id: true, name: true } },
          profile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              user: { select: { email: true } },
            },
          },
          _count: { select: { classTeacherAssignments: true, subjects: true } },
        },
      }),
      this.prisma.client.teacher.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createTeacher(schoolId: string, input: CreateTeacherInput) {
    await this.requireDepartment(schoolId, input.departmentId);
    return this.prisma.client.teacher.create({
      data: {
        schoolId,
        teacherId: newPublicId('TCH'),
        staffNumber: input.staffNumber?.trim() || null,
        invitationEmail: input.invitationEmail?.trim() || null,
        firstName: input.firstName,
        lastName: input.lastName,
        departmentId: input.departmentId,
        qualification: input.qualification || null,
        specialization: input.specialization || null,
        experience: input.experience,
        employmentType: input.employmentType,
        hireDate: new Date(`${input.hireDate}T00:00:00.000Z`),
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async setTeacherStatus(schoolId: string, id: string, isActive: boolean) {
    const result = await this.prisma.client.teacher.updateMany({
      where: { id, schoolId, deletedAt: null },
      data: { isActive },
    });
    if (!result.count) throw new NotFoundException('Teacher not found.');
    return this.prisma.client.teacher.findFirstOrThrow({
      where: { id, schoolId },
      select: { id: true, isActive: true },
    });
  }

  async listStaff(schoolId: string, params: ListPeopleParams) {
    const { page, limit, skip } = pagination(params);
    const search = searchText(params.search);
    const where = {
      schoolId,
      deletedAt: null,
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(search
        ? {
            OR: [
              { staffId: search },
              { staffNumber: search },
              { jobTitle: search },
              {
                profile: {
                  is: {
                    OR: [
                      { firstName: search },
                      { lastName: search },
                      { phone: search },
                      { user: { is: { email: search } } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { profile: { lastName: 'asc' } },
          { profile: { firstName: 'asc' } },
        ],
        include: {
          department: { select: { id: true, name: true } },
          profile: {
            include: { user: { select: { email: true } } },
          },
        },
      }),
      this.prisma.client.staff.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createStaff(schoolId: string, input: CreateStaffInput) {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'This email already belongs to a SchoolHub account. Linking an existing account to a staff record is not available here.',
      );
    }
    if (input.departmentId) {
      await this.requireDepartment(schoolId, input.departmentId);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          name: `${input.firstName} ${input.lastName}`.trim(),
          email,
          role: 'user',
        },
      });
      const profile = await tx.userProfile.create({
        data: {
          userId: user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender,
          dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
          phone: input.phone,
        },
      });
      return tx.staff.create({
        data: {
          schoolId,
          profileId: profile.id,
          staffId: input.staffId?.trim() || newPublicId('STF'),
          staffNumber: input.staffNumber?.trim() || null,
          staffType: input.staffType,
          departmentId: input.departmentId || null,
          jobTitle: input.jobTitle || null,
          employmentType: input.employmentType,
          hireDate: new Date(`${input.hireDate}T00:00:00.000Z`),
        },
        include: {
          department: { select: { id: true, name: true } },
          profile: { include: { user: { select: { email: true } } } },
        },
      });
    });
  }

  async setStaffStatus(schoolId: string, id: string, isActive: boolean) {
    const result = await this.prisma.client.staff.updateMany({
      where: { id, schoolId, deletedAt: null },
      data: { isActive },
    });
    if (!result.count) throw new NotFoundException('Staff member not found.');
    return this.prisma.client.staff.findFirstOrThrow({
      where: { id, schoolId },
      select: { id: true, isActive: true },
    });
  }

  async listGuardians(schoolId: string, params: ListPeopleParams) {
    const { page, limit, skip } = pagination(params);
    const search = searchText(params.search);
    const where = {
      schoolId,
      deletedAt: null,
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(search
        ? {
            OR: [
              { firstName: search },
              { lastName: search },
              { guardianId: search },
              { phone: search },
              { email: search },
              { students: { some: { student: { admissionNumber: search } } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.guardian.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          students: {
            where: { student: { schoolId, deletedAt: null } },
            include: {
              student: {
                select: {
                  id: true,
                  admissionNumber: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.client.guardian.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createGuardian(schoolId: string, input: CreateGuardianInput) {
    const uniqueStudentIds = [...new Set(input.studentIds)];
    if (uniqueStudentIds.length !== input.studentIds.length) {
      throw new BadRequestException('Each student can only be linked once.');
    }
    return this.prisma.client.$transaction(async (tx) => {
      const existingPrimaryStudentIds = new Set<string>();
      if (uniqueStudentIds.length) {
        const students = await tx.student.findMany({
          where: {
            id: { in: uniqueStudentIds },
            schoolId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (students.length !== uniqueStudentIds.length) {
          throw new BadRequestException(
            'One or more selected students are not active records in this school.',
          );
        }
        const existingPrimaryLinks = await tx.guardianStudent.findMany({
          where: {
            studentId: { in: uniqueStudentIds },
            isPrimary: true,
            guardian: { schoolId, deletedAt: null },
          },
          select: { studentId: true },
        });
        for (const relation of existingPrimaryLinks) {
          existingPrimaryStudentIds.add(relation.studentId);
        }
      }
      return tx.guardian.create({
        data: {
          schoolId,
          guardianId: newPublicId('GUA'),
          firstName: input.firstName,
          lastName: input.lastName,
          otherNames: input.otherNames || null,
          phone: input.phone,
          alternatePhone: input.alternatePhone || null,
          email: input.email?.trim().toLowerCase() || null,
          gender: input.gender,
          relationshipType: input.relationshipType,
          occupation: input.occupation || null,
          employer: input.employer || null,
          residentialAddress: input.residentialAddress || null,
          city: input.city || null,
          region: input.region || null,
          students: uniqueStudentIds.length
            ? {
                create: uniqueStudentIds.map((studentId) => ({
                  studentId,
                  isPrimary: !existingPrimaryStudentIds.has(studentId),
                })),
              }
            : undefined,
        },
        include: {
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  admissionNumber: true,
                  profile: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  async setGuardianStatus(schoolId: string, id: string, isActive: boolean) {
    const result = await this.prisma.client.guardian.updateMany({
      where: { id, schoolId, deletedAt: null },
      data: { isActive },
    });
    if (!result.count) throw new NotFoundException('Guardian not found.');
    return this.prisma.client.guardian.findFirstOrThrow({
      where: { id, schoolId },
      select: { id: true, isActive: true },
    });
  }

  private async requireDepartment(schoolId: string, departmentId: string) {
    const department = await this.prisma.client.department.findFirst({
      where: { id: departmentId, schoolId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new BadRequestException(
        'Choose an active department belonging to this school.',
      );
    }
  }
}
