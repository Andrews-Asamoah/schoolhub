import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CredentialsService,
  toIssuedCredentials,
} from '../accounts/credentials.service.js';
import { roleForStaffType } from '../accounts/staff-roles.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

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

  async createTeacher(
    school: { id: string; organizationId: string },
    actorId: string,
    input: CreateTeacherInput,
  ) {
    await this.requireDepartment(school.id, input.departmentId);
    const credential = await this.credentials.prepare('teacher');
    const teacherId = newPublicId('TCH');

    const teacher = await this.prisma.client.$transaction(async (tx) => {
      const login = await this.credentials.createLogin(tx, {
        name: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email,
        role: 'teacher',
        organizationId: school.organizationId,
        credential,
        profile: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || null,
          gender: input.gender ?? null,
          dateOfBirth: input.dateOfBirth
            ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
            : null,
        },
      });
      const created = await tx.teacher.create({
        data: {
          schoolId: school.id,
          profileId: login.profileId,
          teacherId,
          staffNumber: input.staffNumber?.trim() || null,
          invitationEmail: login.email,
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
      await this.credentials.audit(tx, {
        actorId,
        schoolId: school.id,
        action: 'CREDENTIALS_ISSUED',
        entityType: 'TEACHER',
        entityId: created.id,
      });
      return { record: created, loginEmail: login.email };
    });

    return {
      ...teacher.record,
      credentials: toIssuedCredentials(teacher.loginEmail, credential, 'teacher'),
    };
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

  async createStaff(
    school: { id: string; organizationId: string },
    actor: { id: string; schoolRole?: string },
    input: CreateStaffInput,
  ) {
    const role = roleForStaffType(input.staffType);
    // Administrator accounts can manage every other login, so a headmistress
    // (who is an administrator for most routes) may not mint new ones.
    if (role === 'admin' && actor.schoolRole === 'headmistress') {
      throw new ForbiddenException(
        'Only a school owner or administrator can create an administrator account.',
      );
    }
    if (input.departmentId) {
      await this.requireDepartment(school.id, input.departmentId);
    }
    const credential = await this.credentials.prepare(role);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const login = await this.credentials.createLogin(tx, {
        name: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email,
        role,
        organizationId: school.organizationId,
        credential,
        profile: {
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender,
          dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
          phone: input.phone,
        },
      });
      const staff = await tx.staff.create({
        data: {
          schoolId: school.id,
          profileId: login.profileId!,
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
      await this.credentials.audit(tx, {
        actorId: actor.id,
        schoolId: school.id,
        action: 'CREDENTIALS_ISSUED',
        entityType: 'STAFF',
        entityId: staff.id,
        details: { role },
      });
      return { staff, loginEmail: login.email };
    });

    return {
      ...result.staff,
      credentials: toIssuedCredentials(result.loginEmail, credential, role),
    };
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

  async createGuardian(
    school: { id: string; organizationId: string },
    actorId: string,
    input: CreateGuardianInput,
  ) {
    const schoolId = school.id;
    const email = input.email?.trim().toLowerCase() || null;
    if (input.createLogin && !email) {
      throw new BadRequestException(
        'An email address is required to create a parent-portal login.',
      );
    }
    const credential = input.createLogin ? await this.credentials.prepare('guardian') : null;
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
      const login =
        credential && email
          ? await this.credentials.createLogin(tx, {
              name: `${input.firstName} ${input.lastName}`.trim(),
              email,
              role: 'guardian',
              organizationId: school.organizationId,
              credential,
              profile: {
                firstName: input.firstName,
                lastName: input.lastName,
                otherNames: input.otherNames || null,
                phone: input.phone,
                gender: input.gender ?? null,
              },
            })
          : null;
      const guardian = await tx.guardian.create({
        data: {
          profileId: login?.profileId ?? null,
          canLogin: Boolean(login),
          schoolId,
          guardianId: newPublicId('GUA'),
          firstName: input.firstName,
          lastName: input.lastName,
          otherNames: input.otherNames || null,
          phone: input.phone,
          alternatePhone: input.alternatePhone || null,
          email,
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
      if (login) {
        await this.credentials.audit(tx, {
          actorId,
          schoolId,
          action: 'CREDENTIALS_ISSUED',
          entityType: 'GUARDIAN',
          entityId: guardian.id,
        });
      }
      return {
        ...guardian,
        credentials:
          login && credential
            ? toIssuedCredentials(login.email, credential, 'guardian')
            : null,
      };
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
