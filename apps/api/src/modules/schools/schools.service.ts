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
  type SetAcademicContextInput,
  type UpdateSchoolMemberRolesInput,
} from "@schoolhub/shared";
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
}
