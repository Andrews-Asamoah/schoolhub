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

    if (params.classId) {
      if (!academicYearId || !termId) {
        throw new BadRequestException(
          'Select a current academic year and term before filtering by class.',
        );
      }
      where.enrollments = {
        some: {
          academicYearId,
          termId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          ...(params.classId ? { classId: params.classId } : {}),
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
          ...(params.classId ? { classId: params.classId } : {}),
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

      const admissionYear = new Date().getUTCFullYear();
      await tx.$queryRaw`
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
          departmentId: input.departmentId,
          houseId: input.houseId || null,
          bloodGroup: input.bloodGroup,
          allergies: input.allergies,
          medicalConditions: input.medicalConditions,
        },
      });

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

      const full = await tx.student.findUniqueOrThrow({
        where: { id: student.id },
        include: {
          profile: true,
          class: true,
          guardians: { include: { guardian: true } },
        },
      });
      return { student: full, guardianCredentials };
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
