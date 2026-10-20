import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma, School } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  studentEmailDomain,
  type CreateAcademicYearInput,
  type CreateTermInput,
  type UpdateAcademicYearInput,
  type UpdateTermInput,
  type SetAcademicContextInput,
  type UpdateSchoolMemberRolesInput,
  type UpdateSchoolSettingsInput,
} from "@schoolhub/shared";
import { checkRoleChange } from "./member-roles.js";
import {
  findOverlappingTerm,
  termProblemWithinYear,
  termsOutsideYear,
  toIsoDate,
} from "./academic-calendar.js";
import { canManageAcademicContext } from "../../common/academic-context.js";

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly resolveHits = new Map<string, number[]>();

  /**
   * Turns what a person typed in the sign-in box into the email to sign in
   * with. A student types their username (a.asamoah) or, for older records,
   * their admission number; anything containing "@" is used as given.
   * Unknown names get a plausible address back, so the response never reveals
   * whether a username exists - the sign-in itself then simply fails.
   */
  async resolveLoginIdentifier(subdomain: string, identifier: string, ip: string) {
    const now = Date.now();
    const recent = (this.resolveHits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 60) {
      throw new HttpException("Too many attempts. Please wait a few minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.resolveHits.set(ip, recent);

    const id = identifier.trim().toLowerCase();
    if (!id || id.length > 120) throw new BadRequestException("Enter your username or email.");
    if (id.includes("@")) return { email: id };

    const school = await this.prisma.client.school.findUnique({
      where: { subdomain: subdomain.toLowerCase().trim() },
      select: { id: true, email: true, subdomain: true },
    });
    if (!school) throw new NotFoundException("School not found.");
    const student = await this.prisma.client.student.findFirst({
      where: {
        schoolId: school.id,
        deletedAt: null,
        OR: [{ username: id }, { admissionNumber: { equals: id, mode: "insensitive" } }],
      },
      select: { profile: { select: { user: { select: { email: true } } } } },
    });
    return {
      email:
        student?.profile.user.email ??
        `${id}@${studentEmailDomain(school.email, school.subdomain)}`,
    };
  }

  async getCurrentSchool(schoolId: string, role?: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      include: {
        academicYears: {
          where: canManageAcademicContext(role)
            ? undefined
            : { isCurrent: true },
          orderBy: { startDate: "desc" },
          take: canManageAcademicContext(role) ? 5 : 1,
          include: {
            terms: {
              where: canManageAcademicContext(role) ? undefined : { isCurrent: true },
              orderBy: { termNumber: "asc" },
            },
          },
        },
      },
    });

    if (!school) {
      throw new NotFoundException("School not found");
    }

    return school;
  }

  async getPublicSchoolBySubdomain(subdomain: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { subdomain: subdomain.toLowerCase().trim() },
      select: {
        id: true,
        organizationId: true,
        name: true,
        code: true,
        subdomain: true,
        logo: true,
        motto: true,
        primaryColor: true,
        secondaryColor: true,
        currency: true,
        email: true,
        phone: true,
        address: true,
      },
    });

    if (!school) {
      throw new NotFoundException(`School with subdomain "${subdomain}" not found`);
    }

    return school;
  }

  async updateSchool(school: School, data: UpdateSchoolSettingsInput) {
    const client = this.prisma.client;
    // The organization mirrors the school's display name (as it does the logo).
    const [updated] = await client.$transaction([
      client.school.update({ where: { id: school.id }, data }),
      ...(data.name && data.name !== school.name
        ? [client.organization.update({ where: { id: school.organizationId }, data: { name: data.name } })]
        : []),
    ]);
    return updated;
  }

  async getAcademicYears(schoolId: string, role?: string) {
    const canViewHistory = canManageAcademicContext(role);
    return this.prisma.client.academicYear.findMany({
      where: {
        schoolId,
        ...(canViewHistory ? {} : { isCurrent: true }),
      },
      orderBy: { startDate: "desc" },
      include: {
        terms: {
          where: canViewHistory ? undefined : { isCurrent: true },
          orderBy: { termNumber: "asc" },
        },
      },
    });
  }

  async getCurrentAcademicContext(schoolId: string) {
    const year = await this.prisma.client.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: {
        terms: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });
    const term = year?.terms[0];
    if (!year || !term) return null;

    const { terms: _terms, ...academicYear } = year;
    return { academicYear, term };
  }

  async setCurrentAcademicContext(
    schoolId: string,
    actorId: string,
    input: SetAcademicContextInput,
  ) {
    return this.prisma.client.$transaction(async (transaction) => {
      const previousYear = await transaction.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        include: { terms: { where: { isCurrent: true }, take: 1 } },
      });
      const previousTerm = previousYear?.terms[0];
      const selectedTerm = await transaction.term.findFirst({
        where: {
          id: input.termId,
          academicYearId: input.academicYearId,
          academicYear: { schoolId },
        },
        select: { id: true },
      });
      if (!selectedTerm) {
        throw new BadRequestException(
          "Choose a term belonging to an academic year in this school.",
        );
      }

      await transaction.academicYear.updateMany({
        where: { schoolId, isCurrent: true },
        data: { isCurrent: false },
      });
      await transaction.term.updateMany({
        where: { academicYear: { schoolId }, isCurrent: true },
        data: { isCurrent: false },
      });
      await transaction.academicYear.update({
        where: { id: input.academicYearId },
        data: { isCurrent: true },
      });
      await transaction.term.update({
        where: { id: input.termId },
        data: { isCurrent: true },
      });
      if (
        previousYear?.id !== input.academicYearId ||
        previousTerm?.id !== input.termId
      ) {
        await transaction.auditLog.create({
          data: {
            userId: actorId,
            schoolId,
            action: "UPDATE",
            entityType: "AcademicContext",
            entityId: input.academicYearId,
            oldValues: previousYear
              ? {
                  academicYearId: previousYear.id,
                  academicYearName: previousYear.name,
                  termId: previousTerm?.id ?? null,
                  termName: previousTerm?.name ?? null,
                }
              : undefined,
            newValues: {
              academicYearId: input.academicYearId,
              termId: input.termId,
            },
          },
        });
      }

      const academicYear = await transaction.academicYear.findUniqueOrThrow({
        where: { id: input.academicYearId },
      });
      const term = await transaction.term.findUniqueOrThrow({
        where: { id: input.termId },
      });
      return { academicYear, term };
    }, { isolationLevel: "Serializable" });
  }

  async getMemberRoles(schoolId: string, userId: string) {
    const member = await this.prisma.client.member.findFirst({
      where: { userId, organization: { school: { id: schoolId } } },
      select: { role: true, roles: true },
    });
    if (!member) {
      throw new ForbiddenException("You are not a member of this school.");
    }

    return {
      primaryRole: member.role,
      roles: [...new Set([member.role, ...member.roles])],
    };
  }

  async listSchoolMembers(schoolId: string) {
    const members = await this.prisma.client.member.findMany({
      where: { organization: { school: { id: schoolId } }, banned: false },
      select: {
        userId: true,
        role: true,
        roles: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    return members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      primaryRole: member.role,
      roles: [...new Set([member.role, ...member.roles])],
    }));
  }

  async updateMemberRoles(
    schoolId: string,
    actorId: string,
    targetUserId: string,
    input: UpdateSchoolMemberRolesInput,
  ) {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    });
    if (!school) throw new NotFoundException("School not found.");

    const [actor, target] = await Promise.all([
      this.prisma.client.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: school.organizationId,
            userId: actorId,
          },
        },
        select: { role: true },
      }),
      this.prisma.client.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: school.organizationId,
            userId: targetUserId,
          },
        },
      }),
    ]);
    if (!actor || !target) {
      throw new NotFoundException("School membership not found.");
    }

    const change = checkRoleChange({
      actorRole: actor.role,
      target: { role: target.role, roles: target.roles },
      requested: input.roles,
    });
    if (!change.ok) {
      throw change.kind === "forbidden"
        ? new ForbiddenException(change.message)
        : new BadRequestException(change.message);
    }
    const roles = change.roles;
    const hadTeacher = target.role === "teacher" || target.roles.includes("teacher");
    const wantsTeacher = target.role === "teacher" || roles.includes("teacher");
    const hadGuardian = target.role === "guardian" || target.roles.includes("guardian");
    const wantsGuardian = target.role === "guardian" || roles.includes("guardian");
    const updated = await this.prisma.client.$transaction(async (tx) => {
      // The teacher role is only useful once there is a teacher record to
      // assign to classes and subjects, so keep the two in step.
      if (wantsTeacher && target.role !== "teacher") {
        await this.ensureTeacherRecord(tx, schoolId, target.userId, input.teacherDepartmentId);
      } else if (hadTeacher && !wantsTeacher) {
        // Keep history (past classes, subjects) but stop offering them as a teacher.
        await tx.teacher.updateMany({
          where: { schoolId, profile: { userId: target.userId } },
          data: { isActive: false },
        });
      }
      // Same for parents: an administrator or staff member can also be a guardian.
      if (wantsGuardian && target.role !== "guardian") {
        await this.ensureGuardianRecord(tx, schoolId, target.userId, input.guardianPhone);
      } else if (hadGuardian && !wantsGuardian) {
        await tx.guardian.updateMany({
          where: { schoolId, profile: { userId: target.userId } },
          data: { isActive: false },
        });
      }
      return tx.member.update({
        where: { id: target.id },
        data: { roles },
        select: {
          userId: true,
          role: true,
          roles: true,
          user: { select: { name: true, email: true } },
        },
      });
    });

    return {
      userId: updated.userId,
      name: updated.user.name,
      email: updated.user.email,
      primaryRole: updated.role,
      roles: [...new Set([updated.role, ...updated.roles])],
    };
  }

  /** Creates (or reactivates) the teacher record for an existing school account. */
  private async ensureTeacherRecord(
    tx: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
    departmentId?: string,
  ) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const [firstName = user.name, ...rest] = user.name.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";
    const profile =
      (await tx.userProfile.findUnique({ where: { userId } })) ??
      (await tx.userProfile.create({ data: { userId, firstName, lastName } }));

    const existing = await tx.teacher.findFirst({
      where: { schoolId, profileId: profile.id },
      select: { id: true },
    });
    if (existing) {
      await tx.teacher.update({
        where: { id: existing.id },
        data: { isActive: true, deletedAt: null },
      });
      return;
    }

    if (!departmentId) {
      throw new BadRequestException("Choose a department for this teacher.");
    }
    const department = await tx.department.findFirst({
      where: { id: departmentId, schoolId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new BadRequestException("Choose an active department belonging to this school.");
    }
    await tx.teacher.create({
      data: {
        schoolId,
        profileId: profile.id,
        teacherId: `TCH-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        invitationEmail: user.email,
        firstName,
        lastName,
        departmentId: department.id,
      },
    });
  }

  /** Creates (or reactivates) the guardian record for an existing school account. */
  private async ensureGuardianRecord(
    tx: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
    phone?: string,
  ) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const [firstName = user.name, ...rest] = user.name.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";
    let profile = await tx.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await tx.userProfile.create({ data: { userId, firstName, lastName, phone } });
    } else if (!profile.phone && phone) {
      profile = await tx.userProfile.update({ where: { id: profile.id }, data: { phone } });
    }

    const own = await tx.guardian.findFirst({
      where: { schoolId, profileId: profile.id },
      select: { id: true },
    });
    if (own) {
      await tx.guardian.update({
        where: { id: own.id },
        data: { isActive: true, deletedAt: null, canLogin: true },
      });
      return;
    }
    // A guardian record may already exist for this email (added by the office
    // before the person had an account): connect it instead of duplicating it.
    const byEmail = await tx.guardian.findFirst({
      where: { schoolId, email: user.email.toLowerCase(), deletedAt: null, profileId: null },
      select: { id: true },
    });
    if (byEmail) {
      await tx.guardian.update({
        where: { id: byEmail.id },
        data: { profileId: profile.id, canLogin: true, isActive: true },
      });
      return;
    }

    const contactPhone = profile.phone ?? phone;
    if (!contactPhone) {
      throw new BadRequestException("Enter a phone number for this parent.");
    }
    await tx.guardian.create({
      data: {
        schoolId,
        profileId: profile.id,
        canLogin: true,
        guardianId: `GUA-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        firstName,
        lastName,
        phone: contactPhone,
        email: user.email.toLowerCase(),
        relationshipType: "GUARDIAN",
      },
    });
  }

  async createAcademicYear(schoolId: string, input: CreateAcademicYearInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const hasCurrentTerm = input.terms?.some((term) => term.isCurrent) ?? false;
      const isCurrent = input.isCurrent || hasCurrentTerm;
      if (isCurrent && !input.terms?.length) {
        throw new BadRequestException(
          "A current academic year must include at least one term.",
        );
      }
      const currentTermNumber = input.terms?.find((term) => term.isCurrent)
        ?.termNumber ?? (input.isCurrent ? input.terms?.[0]?.termNumber : undefined);

      if (isCurrent) {
        await transaction.academicYear.updateMany({
          where: { schoolId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      if (isCurrent) {
        await transaction.term.updateMany({
          where: { academicYear: { schoolId }, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return transaction.academicYear.create({
        data: {
          schoolId,
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isCurrent,
          terms: input.terms
            ? {
                create: input.terms.map((term) => ({
                  name: term.name,
                  termNumber: term.termNumber,
                  startDate: new Date(term.startDate),
                  endDate: new Date(term.endDate),
                  isCurrent: isCurrent && term.termNumber === currentTermNumber,
                })),
              }
            : undefined,
        },
        include: { terms: { orderBy: { termNumber: "asc" } } },
      });
    });
  }

  // --------------------------------------------------------------------------
  // Editing existing academic years and adding / editing their terms
  // --------------------------------------------------------------------------

  private asRange(row: { startDate: Date; endDate: Date }) {
    return { startDate: toIsoDate(row.startDate), endDate: toIsoDate(row.endDate) };
  }

  private async requireYear(schoolId: string, id: string) {
    const year = await this.prisma.client.academicYear.findFirst({
      where: { id, schoolId },
      include: { terms: { orderBy: { termNumber: "asc" } } },
    });
    if (!year) throw new NotFoundException("Academic year not found.");
    return year;
  }

  async updateAcademicYear(schoolId: string, id: string, input: UpdateAcademicYearInput) {
    const year = await this.requireYear(schoolId, id);
    const range = {
      startDate: input.startDate ?? toIsoDate(year.startDate),
      endDate: input.endDate ?? toIsoDate(year.endDate),
    };
    if (range.endDate <= range.startDate) {
      throw new BadRequestException("The academic year must end after it starts.");
    }
    const outside = termsOutsideYear(
      year.terms.map((term) => ({ ...this.asRange(term), name: term.name })),
      range,
    );
    if (outside.length) {
      throw new BadRequestException(
        `These terms would fall outside the new dates: ${outside
          .map((term) => term.name)
          .join(", ")}. Edit the terms first.`,
      );
    }
    if (input.isCurrent === true && year.terms.length === 0) {
      throw new BadRequestException("Add at least one term before making this the current year.");
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (input.isCurrent === true) {
          await tx.academicYear.updateMany({
            where: { schoolId, isCurrent: true, NOT: { id } },
            data: { isCurrent: false },
          });
          await tx.term.updateMany({
            where: { academicYear: { schoolId }, isCurrent: true, NOT: { academicYearId: id } },
            data: { isCurrent: false },
          });
          // A current year always has a current term.
          if (!year.terms.some((term) => term.isCurrent)) {
            await tx.term.update({
              where: { id: year.terms[0]!.id },
              data: { isCurrent: true },
            });
          }
        }
        if (input.isCurrent === false) {
          await tx.term.updateMany({ where: { academicYearId: id }, data: { isCurrent: false } });
        }
        return tx.academicYear.update({
          where: { id },
          data: {
            name: input.name,
            startDate: input.startDate ? new Date(input.startDate) : undefined,
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            isCurrent: input.isCurrent,
          },
          include: { terms: { orderBy: { termNumber: "asc" } } },
        });
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        throw new BadRequestException("Another academic year already uses that name.");
      }
      throw error;
    }
  }

  async createTerm(schoolId: string, yearId: string, input: CreateTermInput) {
    const year = await this.requireYear(schoolId, yearId);
    if (year.terms.length >= 3) {
      throw new BadRequestException("An academic year can have at most three terms.");
    }
    if (year.terms.some((term) => term.termNumber === input.termNumber)) {
      throw new BadRequestException(`Term ${input.termNumber} already exists in this academic year.`);
    }
    const problem = termProblemWithinYear(this.asRange(year), input);
    if (problem) throw new BadRequestException(problem);
    const overlap = findOverlappingTerm(
      year.terms.map((term) => ({ ...this.asRange(term), name: term.name })),
      input,
    );
    if (overlap) {
      throw new BadRequestException(`These dates overlap ${overlap.name}.`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const makeCurrent = input.isCurrent && year.isCurrent;
      if (input.isCurrent && !year.isCurrent) {
        throw new BadRequestException("Make the academic year current before choosing a current term.");
      }
      if (makeCurrent) {
        await tx.term.updateMany({
          where: { academicYear: { schoolId }, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.term.create({
        data: {
          academicYearId: yearId,
          name: input.name,
          termNumber: input.termNumber,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          // The first term added to the current year becomes its current term.
          isCurrent: makeCurrent || (year.isCurrent && year.terms.length === 0),
        },
      });
    });
  }

  async updateTerm(schoolId: string, termId: string, input: UpdateTermInput) {
    const term = await this.prisma.client.term.findFirst({
      where: { id: termId, academicYear: { schoolId } },
      include: { academicYear: { include: { terms: true } } },
    });
    if (!term) throw new NotFoundException("Term not found.");
    const range = {
      startDate: input.startDate ?? toIsoDate(term.startDate),
      endDate: input.endDate ?? toIsoDate(term.endDate),
    };
    const problem = termProblemWithinYear(this.asRange(term.academicYear), range);
    if (problem) throw new BadRequestException(problem);
    const overlap = findOverlappingTerm(
      term.academicYear.terms.map((other) => ({
        id: other.id,
        name: other.name,
        ...this.asRange(other),
      })),
      { id: term.id, ...range },
    );
    if (overlap) throw new BadRequestException(`These dates overlap ${overlap.name}.`);
    if (input.isCurrent === true && !term.academicYear.isCurrent) {
      throw new BadRequestException("Make the academic year current before choosing a current term.");
    }
    if (input.isCurrent === false && term.isCurrent && term.academicYear.isCurrent) {
      throw new BadRequestException("The current year needs a current term. Choose another term instead.");
    }

    return this.prisma.client.$transaction(async (tx) => {
      if (input.isCurrent === true) {
        await tx.term.updateMany({
          where: { academicYear: { schoolId }, isCurrent: true, NOT: { id: termId } },
          data: { isCurrent: false },
        });
      }
      return tx.term.update({
        where: { id: termId },
        data: {
          name: input.name,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          isCurrent: input.isCurrent,
        },
      });
    });
  }
}
