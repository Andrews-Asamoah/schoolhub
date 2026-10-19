import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  studentLoginEmail,
  type CreateStudentInput,
  type IssuedCredentials,
  type UpdateStudentInput,
} from '@schoolhub/shared';
import type { Prisma, School, StudentStatus } from '@prisma/client';
import { canManageAcademicContext } from '../../common/academic-context.js';
import {
  CredentialsService,
  toIssuedCredentials,
  type PreparedCredential,
} from '../accounts/credentials.service.js';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  async listStudents(
    schoolId: string,
    params: {
      page?: number;
      limit?: number;
      classId?: string;
      academicYearId?: string;
      termId?: string;
      search?: string;
      status?: StudentStatus;
      role?: string;
      /** When set (teachers), only students enrolled in these classes are returned. */
      scopeClassIds?: string[];
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    let academicYearId = params.academicYearId;
    let termId = params.termId;
    const hasRequestedPeriod = Boolean(academicYearId && termId);
    if (Boolean(academicYearId) !== Boolean(termId)) {
      throw new BadRequestException(
        'Academic year and term must both be supplied for historical class filtering',
      );
    }
    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!hasRequestedPeriod) {
      academicYearId = currentYear?.id;
      termId = currentTerm?.id;
    } else {
      if (
        !canManageAcademicContext(params.role) &&
        (academicYearId !== currentYear?.id || termId !== currentTerm?.id)
      ) {
        throw new ForbiddenException(
          'Only the current academic year and term are available for your role.',
        );
      }
      const term = await this.prisma.client.term.findFirst({
        where: {
          id: termId,
          academicYearId,
          academicYear: { schoolId },
        },
        select: { id: true },
      });
      if (!term) {
        throw new BadRequestException(
          'Choose a term belonging to an academic year in this school.',
        );
      }
    }

    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
    };

    // Teachers are limited to the classes they teach; others may filter freely.
    if (
      params.scopeClassIds &&
      params.classId &&
      !params.scopeClassIds.includes(params.classId)
    ) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }
    const classFilter: string | { in: string[] } | undefined =
      params.classId ??
      (params.scopeClassIds ? { in: params.scopeClassIds } : undefined);
    if (classFilter) {
      if (!academicYearId || !termId) {
        if (params.scopeClassIds && !params.classId) {
          return {
            data: [],
            meta: { page, limit, total: 0, totalPages: 0 },
          };
        }
        throw new BadRequestException(
          'Select a current academic year and term before filtering by class.',
        );
      }
      where.enrollments = {
        some: {
          academicYearId,
          termId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          classId: classFilter,
        },
      };
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { admissionNumber: { contains: params.search, mode: 'insensitive' } },
        { studentId: { contains: params.search, mode: 'insensitive' } },
        {
          profile: {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { otherNames: { contains: params.search, mode: 'insensitive' } },
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
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          class: { select: { id: true, name: true, level: true } },
          house: { select: { id: true, name: true, color: true } },
          guardians: {
            where: { isPrimary: true },
            take: 1,
            include: {
              guardian: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.client.student.count({ where }),
    ]);

    let data = students;
    if (academicYearId && termId) {
      const enrollments = await this.prisma.client.enrollment.findMany({
        where: {
          studentId: { in: students.map((student) => student.id) },
          academicYearId,
          termId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          ...(classFilter ? { classId: classFilter } : {}),
          student: { schoolId, deletedAt: null },
          class: { schoolId },
        },
        orderBy: { enrolledAt: 'desc' },
        include: { class: { select: { id: true, name: true, level: true } } },
      });
      const enrollmentByStudent = new Map(
        enrollments.map((enrollment) => [enrollment.studentId, enrollment]),
      );
      data = students.map((student) => {
        const enrollment = enrollmentByStudent.get(student.id);
        return {
          ...student,
          currentClass: enrollment?.class ?? null,
          class: enrollment?.class ?? null,
          enrollment: enrollment ?? null,
        };
      });
    } else {
      data = students.map((student) => ({
        ...student,
        currentClass: null,
        class: null,
        enrollment: null,
      }));
    }

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStudentById(
    schoolId: string,
    id: string,
    role?: string,
    requestedAcademicYearId?: string,
    requestedTermId?: string,
    scopeClassIds?: string[],
  ) {
    const currentOnly = !canManageAcademicContext(role);
    if (Boolean(requestedAcademicYearId) !== Boolean(requestedTermId)) {
      throw new BadRequestException(
        'Academic year and term must be supplied together.',
      );
    }
    let academicYearId = requestedAcademicYearId;
    let termId = requestedTermId;
    if (!currentOnly && academicYearId && termId) {
      const selectedTerm = await this.prisma.client.term.findFirst({
        where: {
          id: termId,
          academicYearId,
          academicYear: { schoolId },
        },
        select: { id: true },
      });
      if (!selectedTerm) {
        throw new BadRequestException(
          'Choose a term belonging to an academic year in this school.',
        );
      }
    } else {
      const currentYear = await this.prisma.client.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        include: { terms: { where: { isCurrent: true }, take: 1 } },
      });
      academicYearId ??= currentYear?.id;
      termId ??= currentYear?.terms[0]?.id;
    }
    const student = await this.prisma.client.student.findFirst({
      where: {
        id,
        schoolId,
        deletedAt: null,
        // A teacher can only open students in classes they teach; anyone else
        // gets the same "not found" so the record's existence is not leaked.
        ...(scopeClassIds
          ? {
              enrollments: {
                some: {
                  academicYearId,
                  termId,
                  status: { in: ['ACTIVE', 'COMPLETED'] },
                  classId: { in: scopeClassIds },
                },
              },
            }
          : {}),
      },
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
          ...(academicYearId && termId
            ? { where: { academicYearId, termId } }
            : currentOnly
              ? {
                  where: {
                    term: {
                      isCurrent: true,
                      academicYear: { isCurrent: true, schoolId },
                    },
                  },
                }
              : {}),
          orderBy: { enrolledAt: 'desc' },
          take: 5,
          include: { class: true, academicYear: true, term: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const viewedEnrollment = await this.prisma.client.enrollment.findFirst({
      where: {
        studentId: student.id,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        ...(academicYearId && termId
          ? { academicYearId, termId }
          : {
              term: {
                isCurrent: true,
                academicYear: { isCurrent: true, schoolId },
              },
            }),
      },
      orderBy: { enrolledAt: 'desc' },
      include: {
        class: { select: { id: true, name: true, level: true } },
        academicYear: { select: { id: true, name: true } },
        term: { select: { id: true, name: true, termNumber: true } },
      },
    });

    return {
      ...student,
      currentClass: viewedEnrollment?.class ?? null,
      class: viewedEnrollment?.class ?? null,
      currentEnrollment: viewedEnrollment,
    };
  }

  async createStudent(
    school: Pick<School, 'id' | 'organizationId' | 'subdomain'>,
    actorId: string,
    input: CreateStudentInput,
    options: {
      role?: string;
      /** Runs inside the same transaction (used by admissions to link the application). */
      afterCreate?: (
        tx: Prisma.TransactionClient,
        student: { id: string; admissionNumber: string | null },
      ) => Promise<void>;
    } = {},
  ) {
    const schoolId = school.id;

    // Validate guardian login requests and hash every temporary password
    // BEFORE opening the transaction (hashing is deliberately slow).
    const guardianPlans = await Promise.all(
      input.guardians.map(async (guardian) => {
        const email = guardian.email?.trim().toLowerCase() || null;
        if (guardian.createLogin && !email) {
          throw new BadRequestException(
            `An email address is required to create a login for ${guardian.firstName} ${guardian.lastName}.`,
          );
        }
        return {
          guardian,
          email,
          credential: guardian.createLogin ? await this.credentials.prepare('guardian') : null,
        };
      }),
    );
    const studentCredential = await this.credentials.prepare('student');

    const created = await this.prisma.client.$transaction(async (tx) => {
      const schoolRow = await tx.school.findUnique({
        where: { id: schoolId },
        select: { code: true },
      });
      if (!schoolRow) {
        throw new NotFoundException('School not found.');
      }

      if (input.houseId) {
        const house = await tx.house.findFirst({
          where: { id: input.houseId, schoolId, isActive: true },
          select: { id: true },
        });
        if (!house) {
          throw new BadRequestException(
            'Choose an active house belonging to this school.',
          );
        }
      }

      let departmentId = input.departmentId;
      if (departmentId) {
        const department = await tx.department.findFirst({
          where: { id: departmentId, schoolId, isActive: true },
          select: { id: true },
        });
        if (!department) {
          throw new BadRequestException(
            'Choose an active department belonging to this school.',
          );
        }
      }

      // Class placement (optional): validated BEFORE any account is created.
      const placement = input.classId
        ? await this.resolvePlacement(tx, schoolId, input, options.role)
        : null;
      if (placement) {
        const classDepartmentId = placement.class.departmentId;
        if (departmentId && classDepartmentId && classDepartmentId !== departmentId) {
          throw new BadRequestException(
            'The selected class belongs to a different department.',
          );
        }
        // A class that sits in a department puts its students there too.
        departmentId ??= classDepartmentId ?? undefined;
      }

      const admissionYear = new Date().getUTCFullYear();
      // pg_advisory_xact_lock() returns Postgres `void`, which Prisma cannot
      // deserialize through $queryRaw (it failed every student creation with
      // P2010). $executeRaw never reads result columns, so it is safe.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${schoolId}),
          hashtext(${String(admissionYear)})
        )
      `;

      const schoolPrefix =
        schoolRow.code
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .slice(0, 8) || 'SCH';
      const admissionPrefix = `${schoolPrefix}${String(admissionYear).slice(-2)}`;
      const existingNumbers = await tx.student.findMany({
        where: {
          schoolId,
          admissionNumber: { startsWith: admissionPrefix },
        },
        select: { admissionNumber: true },
      });
      const lastSequence = existingNumbers.reduce((max, student) => {
        const sequencePart = student.admissionNumber?.slice(
          admissionPrefix.length,
        );
        if (!sequencePart || !/^\d{4}$/.test(sequencePart)) return max;
        return Math.max(max, Number(sequencePart));
      }, 0);
      if (lastSequence >= 9999) {
        throw new ConflictException(
          'This school has reached the 9,999 admission numbers available for the current two-digit year code.',
        );
      }
      const admissionNumber = `${admissionPrefix}${String(lastSequence + 1).padStart(4, '0')}`;
      const studentId = `ID-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;

      // Student login: <admission number>@students.<school>.schoolhub.gh.
      // The sign-in page also accepts just the admission number.
      const loginEmail = studentLoginEmail(admissionNumber, school.subdomain);
      const studentLogin = await this.credentials.createLogin(tx, {
        name: `${input.firstName} ${input.lastName}`,
        email: loginEmail,
        role: 'student',
        organizationId: school.organizationId,
        credential: studentCredential,
        profile: {
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

      const student = await tx.student.create({
        data: {
          schoolId,
          profileId: studentLogin.profileId!,
          studentId,
          admissionNumber,
          departmentId: departmentId ?? null,
          classId: placement?.isCurrentPeriod ? placement.class.id : null,
          houseId: input.houseId || null,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies,
          medicalConditions: input.medicalConditions,
        },
      });

      if (placement) {
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            classId: placement.class.id,
            academicYearId: placement.academicYearId,
            termId: placement.termId,
            status: 'ACTIVE',
          },
        });
      }

      const guardianCredentials: Array<{
        guardianId: string;
        name: string;
        credentials: IssuedCredentials | null;
        linkedExisting: boolean;
      }> = [];

      for (const plan of guardianPlans) {
        const { guardian, email, credential } = plan;
        const name = `${guardian.firstName} ${guardian.lastName}`.trim();

        // A parent with several children is ONE guardian record (matched by
        // email within the school) so they get one login, not one per child.
        const existing = email
          ? await tx.guardian.findFirst({
              where: { schoolId, email, deletedAt: null },
            })
          : null;

        let guardianRecordId: string;
        let issued: IssuedCredentials | null = null;
        let linkedExisting = false;

        if (existing) {
          guardianRecordId = existing.id;
          linkedExisting = true;
          if (credential && !existing.profileId) {
            issued = await this.provisionGuardianLogin(
              tx,
              school,
              existing.id,
              { ...guardian, email: email! },
              credential,
            );
          }
        } else {
          const record = await tx.guardian.create({
            data: {
              schoolId,
              guardianId: `GUA-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
              firstName: guardian.firstName,
              lastName: guardian.lastName,
              otherNames: guardian.otherNames,
              phone: guardian.phone,
              alternatePhone: guardian.alternatePhone,
              email,
              gender: guardian.gender,
              relationshipType: guardian.relationshipType,
              occupation: guardian.occupation,
              employer: guardian.employer,
              residentialAddress: guardian.residentialAddress,
              city: guardian.city,
              region: guardian.region,
            },
          });
          guardianRecordId = record.id;
          if (credential) {
            issued = await this.provisionGuardianLogin(
              tx,
              school,
              record.id,
              { ...guardian, email: email! },
              credential,
            );
          }
        }

        await tx.guardianStudent.create({
          data: {
            guardianId: guardianRecordId,
            studentId: student.id,
            isPrimary: guardian.isPrimary,
          },
        });
        guardianCredentials.push({
          guardianId: guardianRecordId,
          name,
          credentials: issued,
          linkedExisting,
        });
      }

      await this.credentials.audit(tx, {
        actorId,
        schoolId,
        action: 'CREDENTIALS_ISSUED',
        entityType: 'STUDENT',
        entityId: student.id,
        details: {
          guardianLoginsIssued: guardianCredentials.filter((g) => g.credentials)
            .length,
        },
      });

      await options.afterCreate?.(tx, {
        id: student.id,
        admissionNumber: student.admissionNumber,
      });

      const full = await tx.student.findUniqueOrThrow({
        where: { id: student.id },
        include: {
          profile: true,
          class: true,
          department: true,
          guardians: { include: { guardian: true } },
        },
      });
      return {
        student: full,
        guardianCredentials,
        subjects: placement
          ? await this.subjectsForClass(tx, placement.class.id)
          : [],
      };
    });

    return {
      ...created.student,
      credentials: toIssuedCredentials(
        studentLoginEmail(created.student.admissionNumber!, school.subdomain),
        studentCredential,
        'student',
        created.student.admissionNumber ?? undefined,
      ),
      guardianCredentials: created.guardianCredentials,
      // Subjects are inherited from the class (see subjectsForClass).
      subjects: created.subjects,
    };
  }

  /**
   * Validate the class (and the academic term) a new student is placed in.
   * Mirrors AcademicsService.createEnrollments so both paths follow the
   * same rules: active class of this school, current-term-only for roles that
   * cannot manage the academic context, and the class capacity limit.
   */
  private async resolvePlacement(
    tx: Prisma.TransactionClient,
    schoolId: string,
    input: Pick<CreateStudentInput, 'classId' | 'academicYearId' | 'termId'>,
    role?: string,
  ) {
    if (Boolean(input.academicYearId) !== Boolean(input.termId)) {
      throw new BadRequestException(
        'Academic year and term must be supplied together.',
      );
    }
    const klass = await tx.class.findFirst({
      where: { id: input.classId, schoolId, isActive: true, deletedAt: null },
      select: { id: true, name: true, capacity: true, departmentId: true },
    });
    if (!klass) {
      throw new BadRequestException(
        'Choose an active class belonging to this school.',
      );
    }

    const currentYear = await tx.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];
    if (!currentYear || !currentTerm) {
      throw new BadRequestException(
        'Set a current academic year and term (Academic years) before placing a student in a class.',
      );
    }
    const academicYearId = input.academicYearId ?? currentYear.id;
    const termId = input.termId ?? currentTerm.id;
    const term = await tx.term.findFirst({
      where: { id: termId, academicYearId, academicYear: { schoolId } },
      select: { id: true },
    });
    if (!term) {
      throw new BadRequestException(
        'Choose a term belonging to an academic year in this school.',
      );
    }
    const isCurrentPeriod =
      academicYearId === currentYear.id && termId === currentTerm.id;
    if (!isCurrentPeriod && !canManageAcademicContext(role)) {
      throw new ForbiddenException(
        'Only the current academic year and term are available for your role.',
      );
    }

    if (klass.capacity !== null) {
      const taken = await tx.enrollment.count({
        where: { classId: klass.id, academicYearId, termId, status: 'ACTIVE' },
      });
      if (taken + 1 > klass.capacity) {
        throw new ConflictException(
          `${klass.name} is full (capacity ${klass.capacity}).`,
        );
      }
    }
    return { class: klass, academicYearId, termId, isCurrentPeriod };
  }

  /**
   * Subjects a student inherits: everything linked to their class
   * (ClassSubject). The same subject can be linked to many classes, each with
   * its own teacher, so the teacher shown is the one for THIS class.
   */
  async subjectsForClass(
    client: Prisma.TransactionClient | PrismaService['client'],
    classId: string,
  ) {
    const rows = await client.classSubject.findMany({
      where: {
        classId,
        subject: { deletedAt: null, isActive: true },
      },
      orderBy: { subject: { name: 'asc' } },
      include: {
        subject: {
          select: { id: true, name: true, code: true, periodsPerWeek: true },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      subjectId: row.subject.id,
      name: row.subject.name,
      code: row.subject.code,
      periodsPerWeek: row.subject.periodsPerWeek,
      isCompulsory: row.isCompulsory,
      teacherId: row.teacherId,
      teacherName: row.teacher
        ? `${row.teacher.firstName ?? row.teacher.profile?.firstName ?? ''} ${row.teacher.lastName ?? row.teacher.profile?.lastName ?? ''}`.trim() ||
          null
        : null,
    }));
  }

  /** The signed-in student's own subjects (student portal). */
  async getMySubjects(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');
    return this.getStudentSubjects(schoolId, student.id);
  }

  /** Subjects for a student in the viewed (default: current) academic term. */
  async getStudentSubjects(
    schoolId: string,
    studentId: string,
    options: {
      academicYearId?: string;
      termId?: string;
      scopeClassIds?: string[];
    } = {},
  ) {
    let { academicYearId, termId } = options;
    if (!academicYearId || !termId) {
      const year = await this.prisma.client.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        include: { terms: { where: { isCurrent: true }, take: 1 } },
      });
      academicYearId = year?.id;
      termId = year?.terms[0]?.id;
    }
    const enrollment = await this.prisma.client.enrollment.findFirst({
      where: {
        studentId,
        academicYearId,
        termId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        student: { schoolId, deletedAt: null },
        class: { schoolId },
        ...(options.scopeClassIds
          ? { classId: { in: options.scopeClassIds } }
          : {}),
      },
      include: { class: { select: { id: true, name: true, level: true } } },
    });
    if (!enrollment) {
      return { class: null, subjects: [] };
    }
    return {
      class: enrollment.class,
      subjects: await this.subjectsForClass(
        this.prisma.client,
        enrollment.classId,
      ),
    };
  }

  private async provisionGuardianLogin(
    tx: Prisma.TransactionClient,
    school: Pick<School, 'id' | 'organizationId'>,
    guardianRecordId: string,
    guardian: {
      firstName: string;
      lastName: string;
      otherNames?: string;
      phone: string;
      gender?: 'MALE' | 'FEMALE' | 'OTHER';
      email: string;
    },
    credential: PreparedCredential,
  ): Promise<IssuedCredentials> {
    const login = await this.credentials.createLogin(tx, {
      name: `${guardian.firstName} ${guardian.lastName}`.trim(),
      email: guardian.email,
      role: 'guardian',
      organizationId: school.organizationId,
      credential,
      profile: {
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        otherNames: guardian.otherNames,
        phone: guardian.phone,
        gender: guardian.gender,
      },
    });
    await tx.guardian.update({
      where: { id: guardianRecordId },
      data: { profileId: login.profileId, canLogin: true },
    });
    return toIssuedCredentials(login.email, credential, 'guardian');
  }

  async updateStudent(schoolId: string, id: string, input: UpdateStudentInput) {
    const existing = await this.prisma.client.student.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.client.$transaction(async (tx) => {
      if (input.houseId) {
        const house = await tx.house.findFirst({
          where: { id: input.houseId, schoolId },
          select: { id: true, isActive: true },
        });
        if (!house || (!house.isActive && input.houseId !== existing.houseId)) {
          throw new BadRequestException(
            'Choose an active house belonging to this school.',
          );
        }
      }

      if (input.departmentId) {
        const department = await tx.department.findFirst({
          where: { id: input.departmentId, schoolId },
          select: { id: true, isActive: true },
        });
        if (
          !department ||
          (!department.isActive && input.departmentId !== existing.departmentId)
        ) {
          throw new BadRequestException(
            'Choose an active department belonging to this school.',
          );
        }
      }

      if (existing.profileId) {
        await tx.userProfile.update({
          where: { id: existing.profileId },
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            otherNames: input.otherNames,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth
              ? new Date(input.dateOfBirth)
              : undefined,
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
          departmentId: input.departmentId,
          houseId: input.houseId || null,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies,
          medicalConditions: input.medicalConditions,
          status: input.status,
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
      throw new NotFoundException('Student not found');
    }

    await this.prisma.client.student.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'WITHDRAWN',
      },
    });

    return { success: true, message: 'Student deleted successfully' };
  }
}
