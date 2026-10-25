import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  guardianEmailDomain,
  studentEmailDomain,
  studentUsernameBase,
  studentUsernameCandidate,
  type CreateStudentInput,
  type IssuedCredentials,
  type UpdateStudentInput,
} from '@schoolhub/shared';
import type { Prisma, School, StudentStatus } from '@prisma/client';
import { canManageAcademicContext } from '../../common/academic-context.js';
import { FinanceService } from '../finance/finance.service.js';
import {
  CredentialsService,
  toIssuedCredentials,
  type PreparedCredential,
  newGuardianLoginEmail,
} from '../accounts/credentials.service.js';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    @Optional() private readonly financeService?: FinanceService,
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
      /** Keep the number an existing student already has (importing), instead of generating one. */
      admissionNumber?: string;
      /** When an existing student joined (importing). Defaults to today. */
      admissionDate?: string;
      /** Runs inside the same transaction (used by admissions to link the application). */
      afterCreate?: (
        tx: Prisma.TransactionClient,
        student: { id: string; admissionNumber: string | null },
      ) => Promise<void>;
    } = {},
  ) {
    const schoolId = school.id;

    // Resolve the school's own domain before preparing guardian credentials.
    // Public email providers fall back to the school's SchoolHub subdomain.
    const schoolEmailInfo = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      select: { email: true },
    });
    const guardianDomain = guardianEmailDomain(schoolEmailInfo?.email, school.subdomain);

    // Validate guardian login requests and hash every temporary password
    // BEFORE opening the transaction (hashing is deliberately slow).
    const guardianPlans = await Promise.all(
      input.guardians.map(async (guardian) => {
        const contactEmail = guardian.email?.trim().toLowerCase() || null;
        const loginEmail =
          contactEmail ||
          (guardian.createLogin
            ? newGuardianLoginEmail(
                `${guardian.firstName ?? ""} ${guardian.lastName ?? ""}`.trim(),
                guardianDomain,
              )
            : null);
        return {
          guardian,
          contactEmail,
          loginEmail,
          credential: guardian.createLogin ? await this.credentials.prepare('guardian') : null,
        };
      }),
    );
    const studentCredential = await this.credentials.prepare('student');

    const created = await this.prisma.client.$transaction(async (tx) => {
      const schoolRow = await tx.school.findUnique({
        where: { id: schoolId },
        select: { code: true, email: true },
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

      let admissionNumber: string;
      if (options.admissionNumber) {
        const taken = await tx.student.findFirst({
          where: { schoolId, admissionNumber: options.admissionNumber },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException(
            `Admission number ${options.admissionNumber} is already in use.`,
          );
        }
        admissionNumber = options.admissionNumber;
      } else {
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
        admissionNumber = `${admissionPrefix}${String(lastSequence + 1).padStart(4, '0')}`;
      }
      const studentId = `ID-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;

      // Student login: username = first initial + "." + surname
      // (Andrews Asamoah -> a.asamoah); email = username@st.<school domain>.
      // A taken name gets 1, 2, 3 ... appended. Still inside the advisory lock
      // taken above, so two simultaneous registrations cannot pick the same name.
      const usernameBase = studentUsernameBase(input.firstName, input.lastName);
      if (!usernameBase) {
        throw new BadRequestException(
          'The first name and surname must contain letters so a username can be generated.',
        );
      }
      const emailDomain = studentEmailDomain(schoolRow.email, school.subdomain);
      const [takenUsernames, takenEmails] = await Promise.all([
        tx.student.findMany({
          where: { schoolId, username: { startsWith: usernameBase } },
          select: { username: true },
        }),
        // Emails are unique across the whole platform, not just this school.
        tx.user.findMany({
          where: { email: { startsWith: usernameBase, endsWith: `@${emailDomain}` } },
          select: { email: true },
        }),
      ]);
      const usedUsernames = new Set(
        takenUsernames.map((row) => row.username?.toLowerCase()),
      );
      const usedEmails = new Set(takenEmails.map((row) => row.email.toLowerCase()));
      let attempt = 0;
      let username = studentUsernameCandidate(usernameBase, attempt);
      while (
        usedUsernames.has(username) ||
        usedEmails.has(`${username}@${emailDomain}`)
      ) {
        attempt += 1;
        if (attempt > 9999) {
          throw new ConflictException(
            'Too many students share this name; ask an administrator to create this login manually.',
          );
        }
        username = studentUsernameCandidate(usernameBase, attempt);
      }
      const loginEmail = `${username}@${emailDomain}`;

      const studentLogin = await this.credentials.createLogin(tx, {
        name: `${input.firstName} ${input.lastName}`,
        email: loginEmail,
        role: 'student',
        organizationId: school.organizationId,
        credential: studentCredential,
        profile: {
          // The generated login email is kept on the student's profile.
          email: loginEmail,
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
          ...(options.admissionDate ? { admissionDate: new Date(options.admissionDate) } : {}),
          username,
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
        /** The guardian's email already had an account here, which now also has the guardian role. */
        accountLinked: boolean;
      }> = [];

      for (const plan of guardianPlans) {
        const { guardian, contactEmail, loginEmail, credential } = plan;
        const name = `${guardian.firstName} ${guardian.lastName}`.trim();

        // A parent with several children is ONE guardian record (matched by
        // contact email or, when absent, matching name and phone.
        const existing = contactEmail
          ? await tx.guardian.findFirst({
              where: { schoolId, email: contactEmail, deletedAt: null },
            })
          : guardian.createLogin
            ? await tx.guardian.findFirst({
                where: {
                  schoolId,
                  firstName: guardian.firstName,
                  lastName: guardian.lastName,
                  phone: guardian.phone,
                  email: null,
                  deletedAt: null,
                },
              })
            : null;

        let guardianRecordId: string;
        let issued: IssuedCredentials | null = null;
        let accountLinked = false;
        let linkedExisting = false;

        if (existing) {
          guardianRecordId = existing.id;
          linkedExisting = true;
          if (credential && !existing.profileId) {
            const login = await this.provisionGuardianLogin(
              tx,
              school,
              existing.id,
              { ...guardian, email: loginEmail! },
              credential,
            );
            issued = login.credentials;
            accountLinked = login.linked;
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
              email: contactEmail,
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
            const login = await this.provisionGuardianLogin(
              tx,
              school,
              record.id,
              { ...guardian, email: loginEmail! },
              credential,
            );
            issued = login.credentials;
            accountLinked = login.linked;
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
          accountLinked,
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
        loginEmail,
        username,
        guardianCredentials,
        subjects: placement
          ? await this.subjectsForClass(tx, placement.class.id)
          : [],
      };
    });

    return {
      ...created.student,
      credentials: toIssuedCredentials(
        created.loginEmail,
        studentCredential,
        'student',
        created.username,
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

  /**
   * Teachers need to know who a student is, not what the family owes: the
   * fee balance is removed from anything a teacher receives.
   */
  withoutFinancials<T extends { outstandingBalance?: unknown }>(row: T) {
    const { outstandingBalance: _omitted, ...rest } = row;
    return rest;
  }

  /** Curated profile used by the parent and student portals (no internal fields). */
  private async profileView(
    schoolId: string,
    studentId: string,
    options: { viewerGuardianId?: string } = {},
  ) {
    const db = this.prisma.client;
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        profile: true,
        house: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        guardians: {
          include: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                relationshipType: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrollment = await db.enrollment.findFirst({
      where: {
        studentId: student.id,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        term: { isCurrent: true, academicYear: { isCurrent: true, schoolId } },
      },
      orderBy: { enrolledAt: 'desc' },
      include: { class: { select: { id: true, name: true, level: true } } },
    });
    const subjects = enrollment
      ? await this.subjectsForClass(db, enrollment.classId)
      : [];

    const p = student.profile;
    return {
      id: student.id,
      studentId: student.studentId,
      admissionNumber: student.admissionNumber,
      username: student.username,
      loginEmail: p.email,
      status: student.status,
      admissionDate: student.admissionDate,
      profile: {
        firstName: p.firstName,
        lastName: p.lastName,
        otherNames: p.otherNames,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        nationality: p.nationality,
        residentialAddress: p.residentialAddress,
        city: p.city,
        region: p.region,
        email: p.email,
        emergencyContactName: p.emergencyContactName,
        emergencyContactPhone: p.emergencyContactPhone,
        emergencyRelationship: p.emergencyRelationship,
      },
      class: enrollment?.class ?? null,
      department: student.department,
      house: student.house,
      previousSchool: student.previousSchool,
      previousClass: student.previousClass,
      health: {
        bloodGroup: student.bloodGroup,
        allergies: student.allergies,
        medicalConditions: student.medicalConditions,
      },
      // A parent sees who else is linked to the child, but contact details
      // only for themselves.
      guardians: student.guardians.map((link) => ({
        id: link.guardian.id,
        name: `${link.guardian.firstName} ${link.guardian.lastName}`.trim(),
        relationshipType: link.guardian.relationshipType,
        isPrimary: link.isPrimary,
        ...(!options.viewerGuardianId || link.guardian.id === options.viewerGuardianId
          ? { phone: link.guardian.phone, email: link.guardian.email }
          : {}),
      })),
      subjects,
    };
  }

  /**
   * Profile view for staff and teachers. A teacher only gets students in
   * classes they teach (same rule as the student list); no fee balance.
   */
  async getProfileView(schoolId: string, studentId: string, scopeClassIds?: string[]) {
    if (scopeClassIds) {
      const visible = await this.prisma.client.student.findFirst({
        where: {
          id: studentId,
          schoolId,
          deletedAt: null,
          enrollments: { some: { classId: { in: scopeClassIds } } },
        },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException('Student not found');
    }
    return this.profileView(schoolId, studentId);
  }

  private async requireGuardian(schoolId: string, userId: string) {
    const guardian = await this.prisma.client.guardian.findFirst({
      where: { schoolId, deletedAt: null, isActive: true, profile: { userId } },
      select: { id: true },
    });
    if (!guardian) throw new NotFoundException('Guardian record not found');
    return guardian;
  }

  /** Children linked to the signed-in parent. */
  async getMyWards(schoolId: string, userId: string) {
    const guardian = await this.requireGuardian(schoolId, userId);
    const links = await this.prisma.client.guardianStudent.findMany({
      where: { guardianId: guardian.id, student: { schoolId, deletedAt: null } },
      select: { studentId: true },
    });
    return Promise.all(
      links.map((link) =>
        this.profileView(schoolId, link.studentId, { viewerGuardianId: guardian.id }),
      ),
    );
  }

  /** One linked child. Anyone else's child looks like "not found". */
  async getMyWard(schoolId: string, userId: string, studentId: string) {
    const guardian = await this.requireGuardian(schoolId, userId);
    const link = await this.prisma.client.guardianStudent.findFirst({
      where: { guardianId: guardian.id, studentId, student: { schoolId, deletedAt: null } },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Student not found');
    return this.profileView(schoolId, studentId, { viewerGuardianId: guardian.id });
  }

  /** Fees statement for a linked ward only. The guardian link is checked here, not trusted from the route. */
  async getMyWardFees(
    schoolId: string,
    userId: string,
    studentId: string,
    query: { scope?: 'term' | 'year' | 'all'; from?: string; to?: string; yearId?: string; termId?: string } = {},
  ) {
    const guardian = await this.requireGuardian(schoolId, userId);
    const link = await this.prisma.client.guardianStudent.findFirst({
      where: {
        guardianId: guardian.id,
        studentId,
        guardian: { schoolId, deletedAt: null, isActive: true },
        student: { schoolId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Student not found');
    if (!this.financeService) throw new NotFoundException('Fee statements are temporarily unavailable.');
    return this.financeService.getStudentStatement(schoolId, studentId, 'guardian', query, true);
  }

  /** The signed-in student's own profile (shows their username and login email). */
  async getMyProfile(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');
    return this.profileView(schoolId, student.id);
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

  /** Classmates for the signed-in student (in the current academic term). */
  async getMyClassmates(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');

    const enrollment = await this.prisma.client.enrollment.findFirst({
      where: {
        studentId: student.id,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        term: { isCurrent: true, academicYear: { isCurrent: true, schoolId } },
      },
      orderBy: { enrolledAt: 'desc' },
      select: {
        classId: true,
        academicYearId: true,
        termId: true,
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
    });

    if (!enrollment) {
      return { class: null, classmates: [] };
    }

    const enrollments = await this.prisma.client.enrollment.findMany({
      where: {
        classId: enrollment.classId,
        academicYearId: enrollment.academicYearId,
        termId: enrollment.termId,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        student: { schoolId, deletedAt: null },
      },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            admissionNumber: true,
            profile: { select: { firstName: true, lastName: true, gender: true } },
            house: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: [{ student: { profile: { lastName: 'asc' } } }],
    });

    return {
      class: enrollment.class,
      classmates: enrollments.map((e) => ({
        id: e.student.id,
        isSelf: e.student.id === student.id,
        studentId: e.student.studentId,
        admissionNumber: e.student.admissionNumber,
        name: `${e.student.profile.firstName} ${e.student.profile.lastName}`.trim(),
        firstName: e.student.profile.firstName,
        lastName: e.student.profile.lastName,
        house: e.student.house?.name ?? 'No House',
        houseColor: e.student.house?.color ?? '#2563EB',
        gender: e.student.profile.gender ?? null,
      })),
    };
  }

  /** Joined clubs for the signed-in student. */
  async getMyClubs(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student record not found');

    const clubMemberships = await this.prisma.client.clubMember.findMany({
      where: { studentId: student.id, club: { schoolId } },
      include: {
        club: {
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
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return clubMemberships.map((cm) => ({
      membershipId: cm.id,
      role: cm.role ?? 'Member',
      joinedAt: cm.joinedAt,
      club: cm.club,
    }));
  }

  /**
   * Fee payment status badge for the student.
   * Full fee breakdown and balances are strictly hidden from students and only
   * visible to guardians/accountants. Students only see a status badge:
   * FULLY_PAID, PARTIALLY_PAID, or YET_TO_PAY.
   */
  async getMyFeeStatus(schoolId: string, userId: string) {
    const student = await this.prisma.client.student.findFirst({
      where: { schoolId, deletedAt: null, profile: { userId } },
      select: { id: true, outstandingBalance: true },
    });
    if (!student) throw new NotFoundException('Student record not found');

    const currentYear = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { terms: { where: { isCurrent: true }, take: 1 } },
    });
    const currentTerm = currentYear?.terms[0];

    const [bills, payments] = await Promise.all([
      this.prisma.client.bill.findMany({
        where: {
          studentId: student.id,
          schoolId,
          ...(currentYear && currentTerm
            ? { academicYearId: currentYear.id, termId: currentTerm.id }
            : {}),
        },
        select: { id: true, totalAmount: true, balanceAmount: true },
      }),
      this.prisma.client.payment.findMany({
        where: {
          studentId: student.id,
          schoolId,
        },
        select: { id: true, amount: true },
      }),
    ]);

    const totalBilled = bills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    const totalRemaining = bills.reduce((sum, b) => sum + Number(b.balanceAmount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    let status: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'YET_TO_PAY';
    let label: string;
    let description: string;

    if (totalBilled > 0 && totalRemaining <= 0) {
      status = 'FULLY_PAID';
      label = 'Fully Paid';
      description = 'All required school fees have been cleared. Examination hall pass is approved.';
    } else if (totalPaid > 0 && totalRemaining > 0) {
      status = 'PARTIALLY_PAID';
      label = 'Partially Paid';
      description = 'A partial payment has been recorded. Please have your parent or guardian complete the remaining balance on their portal.';
    } else if (totalBilled > 0) {
      status = 'YET_TO_PAY';
      label = 'Yet to Make Payment';
      description = 'Term fees are currently pending payment. Please remind your parent or guardian to make payment via the parent portal.';
    } else {
      status = 'FULLY_PAID';
      label = 'Fully Paid';
      description = 'Your student account is in good standing with no pending fee obligations.';
    }

    return {
      status,
      label,
      description,
      academicYear: currentYear?.name ?? null,
      term: currentTerm?.name ?? null,
    };
  }

  /**
   * Gives a guardian record a portal login. When the email already belongs to
   * someone in this school (staff, an administrator, ...) that account is
   * reused and simply gains the guardian role, so no new password is issued.
   */
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
  ): Promise<{ credentials: IssuedCredentials | null; linked: boolean }> {
    const login = await this.credentials.createOrLinkLogin(tx, {
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
    return {
      credentials: login.linked
        ? null
        : toIssuedCredentials(login.email, credential, 'guardian'),
      linked: login.linked,
    };
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
