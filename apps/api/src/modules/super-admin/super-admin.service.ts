import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import type {
  AddSchoolAdminInput,
  EnrollSchoolInput,
  SetSchoolAdminBannedInput,
  UpdateSchoolInput,
  UpdateSubscriptionInput,
} from "@schoolhub/shared";

const SCHOOL_ADMIN_DEFAULT_PASSWORD = "Admin@123";

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listSchools(page: number, limit: number) {
    const [schools, total] = await Promise.all([
      this.prisma.client.school.findMany({
        include: {
          organization: {
            include: { members: true },
          },
          students: { select: { id: true } },
          teachers: { select: { id: true } },
          subscription: true,
          academicYears: { where: { isCurrent: true }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.school.count(),
    ]);

    return {
      data: schools,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listUsers(page: number, limit: number) {
    const where = {
      role: { not: "superAdmin" },
      members: { some: {} },
    };
    const [users, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          banned: true,
          createdAt: true,
          members: {
            select: {
              role: true,
              banned: true,
              organization: {
                select: {
                  name: true,
                  school: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSchool(id: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              include: { user: true },
            },
          },
        },
        students: { select: { id: true } },
        teachers: { select: { id: true } },
        subscription: true,
        academicYears: {
          where: { isCurrent: true },
          take: 1,
          include: { terms: true },
        },
      },
    });

    if (!school) {
      throw new NotFoundException(`School with id "${id}" not found`);
    }

    return school;
  }

  async updateSchool(id: string, input: UpdateSchoolInput) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!school) {
      throw new NotFoundException(`School with id "${id}" not found`);
    }

    const [existingCode, existingSubdomain] = await Promise.all([
      this.prisma.client.school.findFirst({
        where: { code: input.schoolCode, id: { not: id } },
        select: { id: true },
      }),
      this.prisma.client.school.findFirst({
        where: { subdomain: input.subdomain, id: { not: id } },
        select: { id: true },
      }),
    ]);

    if (existingCode) {
      throw new ConflictException(`School code "${input.schoolCode}" is already in use`);
    }
    if (existingSubdomain) {
      throw new ConflictException(`Subdomain "${input.subdomain}" is already in use`);
    }

    const metadata = school.organization.metadata
      ? (JSON.parse(school.organization.metadata) as Record<string, unknown>)
      : {};

    await this.prisma.client.$transaction([
      this.prisma.client.school.update({
        where: { id },
        data: {
          name: input.schoolName,
          code: input.schoolCode,
          subdomain: input.subdomain,
          email: input.schoolEmail || null,
          phone: input.schoolPhone || null,
          address: input.schoolAddress || null,
        },
      }),
      this.prisma.client.organization.update({
        where: { id: school.organizationId },
        data: {
          name: input.schoolName,
          slug: input.subdomain,
          metadata: JSON.stringify({
            ...metadata,
            schoolCode: input.schoolCode,
          }),
        },
      }),
    ]);

    return this.getSchool(id);
  }

  async addSchoolAdmin(id: string, input: AddSchoolAdminInput) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!school) {
      throw new NotFoundException(`School with id "${id}" not found`);
    }

    const existingUser = await this.prisma.client.user.findUnique({
      where: { email: input.email },
    });
    if (existingUser?.role === "superAdmin") {
      throw new ConflictException("A platform super admin cannot be added as a school admin");
    }
    if (existingUser?.banned) {
      throw new ConflictException("This user account is banned and cannot be added");
    }
    if (existingUser) {
      const existingMember = await this.prisma.client.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId: school.organizationId,
            userId: existingUser.id,
          },
        },
      });
      if (existingMember) {
        throw new ConflictException("This user is already a member of the school");
      }
    }

    const userId = existingUser?.id ?? generateId();
    const memberId = generateId();
    const now = new Date();
    const hashedPassword = existingUser
      ? null
      : await hashPassword(SCHOOL_ADMIN_DEFAULT_PASSWORD);

    const admin = await this.prisma.client.$transaction(async (transaction) => {
      if (!existingUser) {
        if (!hashedPassword) {
          throw new Error("Expected a hashed password when creating a new admin account");
        }
        await transaction.user.create({
          data: {
            id: userId,
            name: input.name,
            email: input.email,
            emailVerified: true,
            role: "user",
            createdAt: now,
            updatedAt: now,
          },
        });
        await transaction.account.create({
          data: {
            id: generateId(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: hashedPassword,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      const member = await transaction.member.create({
        data: {
          id: memberId,
          organizationId: school.organizationId,
          userId,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return member.user;
    });

    return {
      admin: { ...admin, role: "admin" },
      createdAccount: !existingUser,
    };
  }

  async setSchoolAdminBanned(
    id: string,
    userId: string,
    banned: SetSchoolAdminBannedInput["banned"],
  ) {
    const member = await this.findSchoolAdminMembership(id, userId);
    await this.prisma.client.$transaction(
      async (transaction) => {
        if (banned && !member.banned) {
          const anotherAdmin = await transaction.member.findFirst({
            where: {
              organizationId: member.organizationId,
              userId: { not: userId },
              role: { in: ["owner", "admin"] },
              banned: false,
              user: { banned: false },
            },
            select: { id: true },
          });
          if (!anotherAdmin) {
            throw new BadRequestException(
              "The school must have at least one active administrator",
            );
          }
        }

        await transaction.member.update({
          where: { id: member.id },
          data: {
            banned,
            banReason: banned ? "Suspended by platform super admin" : null,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return { success: true, banned };
  }

  async removeSchoolAdmin(id: string, userId: string) {
    const member = await this.findSchoolAdminMembership(id, userId);
    await this.prisma.client.$transaction(
      async (transaction) => {
        const anotherAdmin = await transaction.member.findFirst({
          where: {
            organizationId: member.organizationId,
            userId: { not: userId },
            role: { in: ["owner", "admin"] },
            banned: false,
            user: { banned: false },
          },
          select: { id: true },
        });
        if (!anotherAdmin) {
          throw new BadRequestException(
            "The school must have at least one active administrator",
          );
        }

        await transaction.member.delete({ where: { id: member.id } });
      },
      { isolationLevel: "Serializable" },
    );
    return { success: true };
  }

  private async findSchoolAdminMembership(schoolId: string, userId: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id: schoolId },
      select: { organizationId: true },
    });
    if (!school) {
      throw new NotFoundException(`School with id "${schoolId}" not found`);
    }

    const member = await this.prisma.client.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: school.organizationId,
          userId,
        },
      },
    });
    if (!member || !["owner", "admin"].includes(member.role)) {
      throw new NotFoundException("School administrator membership not found");
    }

    return member;
  }

  async enrollSchool(input: EnrollSchoolInput) {
    // Check uniqueness constraints
    const [existingCode, existingSubdomain, existingAdmin] = await Promise.all([
      this.prisma.client.school.findUnique({ where: { code: input.schoolCode } }),
      this.prisma.client.school.findUnique({ where: { subdomain: input.subdomain } }),
      this.prisma.client.user.findUnique({ where: { email: input.adminEmail } }),
    ]);

    if (existingCode) {
      throw new ConflictException(`School code "${input.schoolCode}" is already in use`);
    }
    if (existingSubdomain) {
      throw new ConflictException(`Subdomain "${input.subdomain}" is already in use`);
    }
    if (existingAdmin) {
      throw new ConflictException(`Admin email "${input.adminEmail}" is already registered`);
    }

    const orgId = generateId();
    const userId = generateId();
    const accountId = generateId();
    const memberId = generateId();
    const now = new Date();

    const hashedPassword = await hashPassword(SCHOOL_ADMIN_DEFAULT_PASSWORD);

    const [, adminUser, , , school] = await this.prisma.client.$transaction([
      // 1. Create organization
      this.prisma.client.organization.create({
        data: {
          id: orgId,
          name: input.schoolName,
          slug: input.subdomain.toLowerCase(),
          metadata: JSON.stringify({
            region: input.region ?? null,
            schoolCode: input.schoolCode,
          }),
          createdAt: now,
          updatedAt: now,
        },
      }),
      // 2. Create admin user
      this.prisma.client.user.create({
        data: {
          id: userId,
          name: input.adminName,
          email: input.adminEmail,
          emailVerified: true,
          role: "owner",
          createdAt: now,
          updatedAt: now,
        },
      }),
      // 3. Create account for admin
      this.prisma.client.account.create({
        data: {
          id: accountId,
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        },
      }),
      // 4. Create member record linking user to org
      this.prisma.client.member.create({
        data: {
          id: memberId,
          organizationId: orgId,
          userId,
          role: "owner",
          createdAt: now,
          updatedAt: now,
        },
      }),
      // 5. Create school record
      this.prisma.client.school.create({
        data: {
          organizationId: orgId,
          name: input.schoolName,
          code: input.schoolCode,
          subdomain: input.subdomain,
          email: input.schoolEmail,
          phone: input.schoolPhone,
          address: input.schoolAddress,
        },
      }),
    ]);

    return {
      school,
      admin: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    };
  }

  async updateSubscription(id: string, input: UpdateSubscriptionInput) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: { organization: true, subscription: true },
    });

    if (!school) {
      throw new NotFoundException(`School with id "${id}" not found`);
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;

    await this.prisma.client.organization.update({
      where: { id: school.organizationId },
      data: {
        subscriptionStatus: input.status,
        ...(expiresAt ? { expiresAt } : {}),
      },
    });

    return this.getSchool(id);
  }

  async getPlatformStats() {
    const [totalSchools, totalStudents, totalTeachers, activeSubscriptions] =
      await Promise.all([
        this.prisma.client.school.count(),
        this.prisma.client.student.count(),
        this.prisma.client.teacher.count(),
        this.prisma.client.organization.count({
          where: { subscriptionStatus: "ACTIVE" },
        }),
      ]);

    return { totalSchools, totalStudents, totalTeachers, activeSubscriptions };
  }
}
