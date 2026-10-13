import {
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import type { EnrollSchoolInput, UpdateSubscriptionInput } from "@schoolhub/shared";

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

    const hashedPassword = await hashPassword(input.adminPassword);

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
