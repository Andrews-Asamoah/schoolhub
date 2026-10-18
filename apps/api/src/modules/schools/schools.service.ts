import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  ROLES,
  type CreateAcademicYearInput,
  type CreateTermInput,
  type UpdateAcademicYearInput,
  type UpdateTermInput,
  type SetAcademicContextInput,
  type UpdateSchoolMemberRolesInput,
} from "@schoolhub/shared";
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

  async updateSchool(
    schoolId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      motto?: string;
      website?: string;
      primaryColor?: string;
      secondaryColor?: string;
    },
  ) {
    return this.prisma.client.school.update({
      where: { id: schoolId },
      data,
    });
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

    if (!input.roles.includes(target.role as (typeof ROLES)[number])) {
      throw new BadRequestException(
        "The membership's primary role must remain assigned.",
      );
    }
    if (input.roles.includes("owner") && target.role !== "owner") {
      throw new BadRequestException(
        "Owner access cannot be granted as an additional role.",
      );
    }
    const existingRoles = new Set([target.role, ...target.roles]);
    const addsAdministratorAccess = input.roles.some(
      (role) =>
        (role === "admin" || role === "headmistress") &&
        !existingRoles.has(role),
    );
    if (addsAdministratorAccess && actor.role !== "owner") {
      throw new ForbiddenException(
        "Only the school owner can grant administrator or headmistress access.",
      );
    }

    const roles = [...new Set(input.roles)].filter(
      (role) => role !== target.role,
    );
    const updated = await this.prisma.client.member.update({
      where: { id: target.id },
      data: { roles },
      select: {
        userId: true,
        role: true,
        roles: true,
        user: { select: { name: true, email: true } },
      },
    });

    return {
      userId: updated.userId,
      name: updated.user.name,
      email: updated.user.email,
      primaryRole: updated.role,
      roles: [...new Set([updated.role, ...updated.roles])],
    };
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
