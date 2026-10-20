import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateClassInput,
  CreateClassTeacherAssignmentInput,
  CreateClubInput,
  CreateDepartmentInput,
  CreateEnrollmentInput,
  CreateHouseInput,
  CreateSubjectInput,
  AddClubMemberInput,
  UpdateClassInput,
  UpdateClubInput,
  UpdateHouseInput,
} from '@schoolhub/shared';
import type { Prisma } from '@prisma/client';
import { canManageAcademicContext } from '../../common/academic-context.js';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(
    schoolId: string,
    academicYearId?: string,
    termId?: string,
    role?: string,
    scopeClassIds?: string[],
  ) {
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const { academicYear, term } =
      academicYearId || termId
        ? await this.resolveAcademicTerm(schoolId, academicYearId, termId, role)
        : await this.prisma.client.academicYear
            .findFirst({
              where: { schoolId, isCurrent: true },
              include: { terms: { where: { isCurrent: true }, take: 1 } },
            })
            .then((year) => ({
              academicYear: year,
              term: year?.terms[0] ?? null,
            }));
    const classes = await this.prisma.client.class.findMany({
      where: {
        schoolId,
        deletedAt: null,
        ...(scopeClassIds ? { id: { in: scopeClassIds } } : {}),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        department: { select: { id: true, name: true, code: true } },
        classTeacherAssignments: {
          where: {
            effectiveFrom: { lte: today },
            schoolId,
            teacher: { schoolId },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: {
            teacher: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    const enrollmentCounts =
      academicYear && term
        ? await this.prisma.client.enrollment.groupBy({
            by: ['classId'],
            where: {
              academicYearId: academicYear.id,
              termId: term.id,
              status: 'ACTIVE',
              student: { deletedAt: null },
            },
            _count: { _all: true },
          })
        : [];
    const countByClassId = new Map(
      enrollmentCounts.map((entry) => [entry.classId, entry._count._all]),
    );

    return classes.map(({ classTeacherAssignments, ...schoolClass }) => {
      const assignment = classTeacherAssignments[0];
      return {
        ...schoolClass,
        _count: { students: countByClassId.get(schoolClass.id) ?? 0 },
        classTeacherId: assignment?.teacherId ?? null,
        classTeacher: assignment?.teacher ?? null,
      };
    });
  }

  async listClassTeachers(schoolId: string) {
    const teachers = await this.prisma.client.teacher.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        profile: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return teachers.map((teacher) => ({
      id: teacher.id,
      firstName: teacher.profile?.firstName ?? teacher.firstName ?? '',
      lastName: teacher.profile?.lastName ?? teacher.lastName ?? '',
      isActive: teacher.isActive,
    }));
  }

  async createClass(schoolId: string, input: CreateClassInput) {
    const duplicate = await this.prisma.client.class.findFirst({
      where: {
        schoolId,
        deletedAt: null,
        name: { equals: input.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'A class with this name already exists in this school',
      );
    }

    await this.validateClassReferences(schoolId, input);

    return this.prisma.client.class.create({
      data: {
        schoolId,
        name: input.name,
        level: input.level,
        capacity: input.capacity,
        departmentId: input.departmentId,
        isGraduatingClass: input.isGraduatingClass,
        isActive: input.isActive,
        order: input.order,
      },
      include: { department: { select: { id: true, name: true, code: true } } },
    });
  }

  async updateClass(
    schoolId: string,
    classId: string,
    input: UpdateClassInput,
  ) {
    const existing = await this.prisma.client.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    if (input.name) {
      const duplicate = await this.prisma.client.class.findFirst({
        where: {
          id: { not: classId },
          schoolId,
          deletedAt: null,
          name: { equals: input.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'A class with this name already exists in this school',
        );
      }
    }

    await this.validateClassReferences(schoolId, input);

    return this.prisma.client.class.update({
      where: { id: classId },
      data: {
        name: input.name,
        level: input.level,
        capacity: input.capacity,
        departmentId: input.departmentId,
        isGraduatingClass: input.isGraduatingClass,
        isActive: input.isActive,
        order: input.order,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    });
  }

  private async validateClassReferences(
    schoolId: string,
    input: Pick<UpdateClassInput, 'departmentId'>,
  ) {
    if (input.departmentId) {
      const department = await this.prisma.client.department.findFirst({
        where: { id: input.departmentId, schoolId, isActive: true },
        select: { id: true },
      });
      if (!department) {
        throw new BadRequestException(
          'Choose an active department belonging to this school',
        );
      }
    }
  }

  async listClassTeacherAssignments(schoolId: string, classId: string) {
    await this.requireClass(schoolId, classId);
    return this.prisma.client.classTeacherAssignment.findMany({
      where: { schoolId, classId, teacher: { schoolId } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: {
        teacher: {
          include: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  async assignClassTeacher(
    schoolId: string,
    classId: string,
    input: CreateClassTeacherAssignmentInput,
  ) {
    const effectiveFrom = this.parseDate(input.effectiveFrom, 'effectiveFrom');
    const classEntity = await this.requireClass(schoolId, classId);
    const teacher = await this.prisma.client.teacher.findFirst({
      where: { id: input.teacherId, schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!teacher) {
      throw new BadRequestException(
        'Choose an active teacher belonging to this school',
      );
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        const existingAssignments = await tx.classTeacherAssignment.findMany({
          where: {
            schoolId,
            classId,
            OR: [
              {
                effectiveFrom: { gte: effectiveFrom },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: effectiveFrom } },
                ],
              },
              {
                effectiveFrom: { lt: effectiveFrom },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: effectiveFrom } },
                ],
              },
            ],
          },
          orderBy: { effectiveFrom: 'desc' },
        });
        const current = existingAssignments.find(
          (assignment) => assignment.effectiveFrom < effectiveFrom,
        );
        const startsOnDate = existingAssignments.find(
          (assignment) =>
            assignment.effectiveFrom.getTime() === effectiveFrom.getTime(),
        );
        const future = existingAssignments.find(
          (assignment) => assignment.effectiveFrom > effectiveFrom,
        );

        if (startsOnDate) {
          if (startsOnDate.teacherId === teacher.id) return startsOnDate;
          throw new ConflictException(
            'A class teacher assignment already starts on this date',
          );
        }
        if (future) {
          throw new ConflictException(
            'This change would overlap a scheduled class teacher assignment',
          );
        }

        if (
          current &&
          current.teacherId === teacher.id &&
          (!current.effectiveTo || current.effectiveTo >= effectiveFrom)
        ) {
          return current;
        }
        if (current) {
          await tx.classTeacherAssignment.update({
            where: { id: current.id },
            data: { effectiveTo: effectiveFrom },
          });
        }

        return tx.classTeacherAssignment.create({
          data: {
            schoolId,
            classId: classEntity.id,
            teacherId: teacher.id,
            effectiveFrom,
          },
          include: {
            teacher: {
              include: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async listEnrollments(
    schoolId: string,
    academicYearId: string | undefined,
    termId?: string,
    classId?: string,
    role?: string,
    scopeClassIds?: string[],
  ) {
    const { academicYear, term } = await this.resolveAcademicTerm(
      schoolId,
      academicYearId,
      termId,
      role,
    );
    if (classId) await this.requireClass(schoolId, classId);
    // Teachers only see rosters of classes they teach.
    if (scopeClassIds && classId && !scopeClassIds.includes(classId)) {
      throw new ForbiddenException('You do not teach this class.');
    }

    return this.prisma.client.enrollment.findMany({
      where: {
        academicYearId: academicYear.id,
        termId: term.id,
        ...(classId
          ? { classId }
          : scopeClassIds
            ? { classId: { in: scopeClassIds } }
            : {}),
        status: { in: ['ACTIVE', 'COMPLETED'] },
        student: { schoolId, deletedAt: null },
        class: { schoolId },
      },
      orderBy: [
        { term: { termNumber: 'desc' } },
        { class: { name: 'asc' } },
        { student: { profile: { lastName: 'asc' } } },
        { student: { profile: { firstName: 'asc' } } },
      ],
      include: {
        student: {
          include: { profile: true },
        },
        class: { select: { id: true, name: true, level: true } },
        academicYear: { select: { id: true, name: true } },
        term: { select: { id: true, name: true, termNumber: true } },
      },
    });
  }

  async listEligibleStudents(
    schoolId: string,
    academicYearId: string,
    termId: string,
    search?: string,
    role?: string,
  ) {
    const { academicYear, term } = await this.resolveAcademicTerm(
      schoolId,
      academicYearId,
      termId,
      role,
    );
    return this.prisma.client.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: 'ACTIVE',
        enrollments: {
          none: { academicYearId: academicYear.id, termId: term.id },
        },
        ...(search
          ? {
              OR: [
                { admissionNumber: { contains: search, mode: 'insensitive' } },
                { studentId: { contains: search, mode: 'insensitive' } },
                {
                  profile: {
                    firstName: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  profile: {
                    lastName: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { profile: { lastName: 'asc' } },
        { profile: { firstName: 'asc' } },
      ],
      take: 100,
      include: {
        profile: {
          select: { firstName: true, lastName: true, otherNames: true },
        },
        class: { select: { id: true, name: true } },
      },
    });
  }

  async createEnrollments(
    schoolId: string,
    input: CreateEnrollmentInput,
    role?: string,
  ) {
    return this.prisma.client.$transaction(
      async (tx) => {
        const classEntity = await tx.class.findFirst({
          where: {
            id: input.classId,
            schoolId,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, capacity: true },
        });
        if (!classEntity) throw new NotFoundException('Active class not found');

        const { academicYear, term } = await this.resolveAcademicTerm(
          schoolId,
          input.academicYearId,
          input.termId,
          role,
          tx,
        );
        const students = await tx.student.findMany({
          where: {
            id: { in: input.studentIds },
            schoolId,
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (students.length !== input.studentIds.length) {
          throw new BadRequestException(
            'One or more selected students are not active students in this school',
          );
        }

        const priorEnrollments = await tx.enrollment.findMany({
          where: {
            studentId: { in: input.studentIds },
            academicYearId: academicYear.id,
            termId: term.id,
          },
          select: { studentId: true },
        });
        if (priorEnrollments.length) {
          throw new ConflictException(
            'One or more students already have a class placement for this term',
          );
        }

        if (classEntity.capacity !== null) {
          const existingCount = await tx.enrollment.count({
            where: {
              classId: classEntity.id,
              academicYearId: academicYear.id,
              termId: term.id,
              status: 'ACTIVE',
            },
          });
          if (existingCount + students.length > classEntity.capacity) {
            throw new ConflictException(
              `This enrollment would exceed the class capacity of ${classEntity.capacity}`,
            );
          }
        }

        await tx.enrollment.createMany({
          data: students.map((student) => ({
            studentId: student.id,
            classId: classEntity.id,
            academicYearId: academicYear.id,
            termId: term.id,
            status: 'ACTIVE' as const,
          })),
        });

        if (academicYear.isCurrent && term.isCurrent) {
          await tx.student.updateMany({
            where: { id: { in: input.studentIds }, schoolId },
            data: { classId: classEntity.id },
          });
        }

        return { enrolledCount: students.length };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async requireClass(
    schoolId: string,
    classId: string,
    client: Prisma.TransactionClient = this.prisma.client,
  ) {
    const classEntity = await client.class.findFirst({
      where: { id: classId, schoolId, deletedAt: null },
      select: { id: true, isActive: true, capacity: true },
    });
    if (!classEntity) throw new NotFoundException('Class not found');
    return classEntity;
  }

  private async resolveAcademicTerm(
    schoolId: string,
    academicYearId?: string,
    termId?: string,
    role?: string,
    client: Prisma.TransactionClient | typeof this.prisma.client = this.prisma
      .client,
  ) {
    if (Boolean(academicYearId) !== Boolean(termId)) {
      throw new BadRequestException(
        'Academic year and term must be supplied together.',
      );
    }
    const currentYear = await client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!currentYear || !currentTerm) {
      throw new BadRequestException(
        'This school has not selected a current academic year and term.',
      );
    }

    const selectedYearId = academicYearId ?? currentYear.id;
    const selectedTermId = termId ?? currentTerm.id;
    const selected = await client.term.findFirst({
      where: {
        id: selectedTermId,
        academicYearId: selectedYearId,
        academicYear: { schoolId },
      },
      include: { academicYear: true },
    });
    if (!selected) {
      throw new BadRequestException(
        'Choose a term belonging to an academic year in this school.',
      );
    }
    if (
      !canManageAcademicContext(role) &&
      (selected.academicYearId !== currentYear.id ||
        selected.id !== currentTerm.id)
    ) {
      throw new ForbiddenException(
        'Only the current academic year and term are available for your role.',
      );
    }
    return { academicYear: selected.academicYear, term: selected };
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        `${fieldName} must be a valid date in YYYY-MM-DD format`,
      );
    }
    return date;
  }

  async listDepartments(schoolId: string) {
    return this.prisma.client.department.findMany({
      where: { schoolId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { classes: { where: { deletedAt: null } } },
        },
      },
    });
  }

  async createDepartment(schoolId: string, input: CreateDepartmentInput) {
    return this.prisma.client.department.create({
      data: {
        schoolId,
        name: input.name,
        code: input.code,
        description: input.description || null,
      },
    });
  }

  async listHouses(schoolId: string) {
    return this.prisma.client.house.findMany({
      where: { schoolId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        houseTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
    });
  }

  async createHouse(schoolId: string, input: CreateHouseInput) {
    await this.validateHouseFields(schoolId, input);
    await this.ensureHouseNameAndCodeAvailable(
      schoolId,
      input.name,
      input.code,
    );

    return this.prisma.client.house.create({
      data: {
        schoolId,
        name: input.name,
        code: input.code,
        description: input.description || null,
        color: input.color || null,
        motto: input.motto || null,
        houseTeacherId: input.houseTeacherId || null,
        isActive: input.isActive,
      },
      include: {
        houseTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    });
  }

  async updateHouse(
    schoolId: string,
    houseId: string,
    input: UpdateHouseInput,
  ) {
    const existing = await this.prisma.client.house.findFirst({
      where: { id: houseId, schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('House not found');

    await this.validateHouseFields(schoolId, input);
    await this.ensureHouseNameAndCodeAvailable(
      schoolId,
      input.name,
      input.code,
      houseId,
    );

    return this.prisma.client.house.update({
      where: { id: houseId },
      data: {
        name: input.name,
        code: input.code,
        description:
          input.description === undefined
            ? undefined
            : input.description || null,
        color: input.color === undefined ? undefined : input.color || null,
        motto: input.motto === undefined ? undefined : input.motto || null,
        houseTeacherId:
          input.houseTeacherId === undefined
            ? undefined
            : input.houseTeacherId || null,
        isActive: input.isActive,
      },
      include: {
        houseTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    });
  }

  private async validateHouseFields(
    schoolId: string,
    input: Pick<UpdateHouseInput, 'houseTeacherId'>,
  ) {
    if (input.houseTeacherId) {
      const teacher = await this.prisma.client.teacher.findFirst({
        where: {
          id: input.houseTeacherId,
          schoolId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!teacher) {
        throw new BadRequestException(
          'Choose an active teacher belonging to this school.',
        );
      }
    }
  }

  private async ensureHouseNameAndCodeAvailable(
    schoolId: string,
    name?: string,
    code?: string,
    houseId?: string,
  ) {
    if (!name && !code) return;
    const duplicate = await this.prisma.client.house.findFirst({
      where: {
        schoolId,
        ...(houseId ? { id: { not: houseId } } : {}),
        OR: [
          ...(name
            ? [{ name: { equals: name, mode: 'insensitive' as const } }]
            : []),
          ...(code
            ? [{ code: { equals: code, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'A house with this name or code already exists in this school.',
      );
    }
  }

  async getClassStudents(
    schoolId: string,
    classId: string,
    academicYearId: string | undefined,
    termId?: string,
    role?: string,
    scopeClassIds?: string[],
  ) {
    const enrollments = await this.listEnrollments(
      schoolId,
      academicYearId,
      termId,
      classId,
      role,
      scopeClassIds,
    );
    const latestPlacementByStudent = new Map<
      string,
      (typeof enrollments)[number]
    >();
    for (const enrollment of enrollments) {
      if (!latestPlacementByStudent.has(enrollment.studentId)) {
        latestPlacementByStudent.set(enrollment.studentId, enrollment);
      }
    }
    return [...latestPlacementByStudent.values()].map((enrollment) => ({
      ...enrollment.student,
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      term: enrollment.term,
    }));
  }

  async listSubjects(schoolId: string) {
    return this.prisma.client.subject.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
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

  async listClubs(schoolId: string) {
    return this.prisma.client.club.findMany({
      where: { schoolId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        teacherInCharge: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: {
          select: { members: true },
        },
        members: {
          include: {
            student: {
              select: {
                id: true,
                studentId: true,
                admissionNumber: true,
                profile: {
                  select: { firstName: true, lastName: true, gender: true },
                },
                house: {
                  select: { id: true, name: true, color: true },
                },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
  }

  async getClub(schoolId: string, clubId: string) {
    const club = await this.prisma.client.club.findFirst({
      where: { id: clubId, schoolId },
      include: {
        teacherInCharge: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { members: true } },
        members: {
          include: {
            student: {
              select: {
                id: true,
                studentId: true,
                admissionNumber: true,
                profile: {
                  select: { firstName: true, lastName: true, gender: true },
                },
                house: {
                  select: { id: true, name: true, color: true },
                },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  async createClub(schoolId: string, input: CreateClubInput) {
    const existing = await this.prisma.client.club.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' }, schoolId },
    });
    if (existing) {
      throw new ConflictException('A club with this name already exists.');
    }
    if (input.teacherInChargeId) {
      const teacher = await this.prisma.client.teacher.findFirst({
        where: { id: input.teacherInChargeId, schoolId, isActive: true },
      });
      if (!teacher) {
        throw new BadRequestException('Choose an active teacher in this school.');
      }
    }
    return this.prisma.client.club.create({
      data: {
        schoolId,
        name: input.name,
        description: input.description || null,
        teacherInChargeId: input.teacherInChargeId || null,
        isActive: input.isActive ?? true,
      },
      include: {
        teacherInCharge: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { members: true } },
      },
    });
  }

  async updateClub(schoolId: string, clubId: string, input: UpdateClubInput) {
    const existing = await this.prisma.client.club.findFirst({
      where: { id: clubId, schoolId },
    });
    if (!existing) throw new NotFoundException('Club not found');

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.prisma.client.club.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          schoolId,
          id: { not: clubId },
        },
      });
      if (duplicate) {
        throw new ConflictException('A club with this name already exists.');
      }
    }

    if (input.teacherInChargeId) {
      const teacher = await this.prisma.client.teacher.findFirst({
        where: { id: input.teacherInChargeId, schoolId, isActive: true },
      });
      if (!teacher) {
        throw new BadRequestException('Choose an active teacher in this school.');
      }
    }

    return this.prisma.client.club.update({
      where: { id: clubId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.teacherInChargeId !== undefined ? { teacherInChargeId: input.teacherInChargeId || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        teacherInCharge: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { members: true } },
      },
    });
  }

  async deleteClub(schoolId: string, clubId: string) {
    const existing = await this.prisma.client.club.findFirst({
      where: { id: clubId, schoolId },
    });
    if (!existing) throw new NotFoundException('Club not found');
    await this.prisma.client.club.delete({ where: { id: clubId } });
    return { success: true };
  }

  async addClubMember(schoolId: string, clubId: string, input: AddClubMemberInput) {
    const club = await this.prisma.client.club.findFirst({
      where: { id: clubId, schoolId },
    });
    if (!club) throw new NotFoundException('Club not found');

    const student = await this.prisma.client.student.findFirst({
      where: { id: input.studentId, schoolId, deletedAt: null },
    });
    if (!student) throw new NotFoundException('Student not found');

    const existingMember = await this.prisma.client.clubMember.findUnique({
      where: { clubId_studentId: { clubId, studentId: input.studentId } },
    });
    if (existingMember) {
      throw new ConflictException('This student is already a member of this club.');
    }

    return this.prisma.client.clubMember.create({
      data: {
        clubId,
        studentId: input.studentId,
        role: input.role || 'Member',
      },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            admissionNumber: true,
            profile: { select: { firstName: true, lastName: true } },
            house: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async removeClubMember(schoolId: string, clubId: string, studentId: string) {
    const member = await this.prisma.client.clubMember.findUnique({
      where: { clubId_studentId: { clubId, studentId } },
      include: { club: { select: { schoolId: true } } },
    });
    if (!member || member.club.schoolId !== schoolId) {
      throw new NotFoundException('Club membership not found');
    }
    await this.prisma.client.clubMember.delete({
      where: { clubId_studentId: { clubId, studentId } },
    });
    return { success: true };
  }
}
