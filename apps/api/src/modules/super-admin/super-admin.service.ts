import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { generateId } from "better-auth";
import { Prisma } from "@prisma/client";
import { CredentialsService, toIssuedCredentials } from "../accounts/credentials.service.js";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import {
  evaluateSubscriptionAccess,
  SUBSCRIPTION_TRIAL_DAYS,
  type AddSchoolAdminInput,
  type EnrollSchoolInput,
  type SetSchoolAdminBannedInput,
  type SuperAdminAuditQuery,
  type SuperAdminSchoolsQuery,
  type SuperAdminUsersQuery,
  type UpdateSchoolInput,
  type UpdateSubscriptionInput,
} from "@schoolhub/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 14;

/** A date-only value ("2027-01-31") means "through the end of that day" (UTC). */
function parseExpiry(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999Z`)
    : new Date(value);
}

/** Prisma's SubscriptionStatus enum spells it CANCELED; the platform value is CANCELLED. */
function toSubscriptionEnum(status: string) {
  return (status === "CANCELLED" ? "CANCELED" : status) as
    | "ACTIVE"
    | "TRIALING"
    | "PAST_DUE"
    | "CANCELED"
    | "SUSPENDED";
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const paginate = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  async listSchools(query: SuperAdminSchoolsQuery) {
    const { page, limit, q, status, expiry } = query;
    const now = new Date();
    const organization: Prisma.organizationWhereInput = {};
    if (status) organization.subscriptionStatus = status;
    if (expiry === "expiring") {
      organization.expiresAt = { gt: now, lte: new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS) };
    } else if (expiry === "lapsed") {
      organization.expiresAt = { lte: now };
    }

    const where: Prisma.SchoolWhereInput = {
      ...(Object.keys(organization).length ? { organization } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { subdomain: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [schools, total] = await Promise.all([
      this.prisma.client.school.findMany({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          subdomain: true,
          email: true,
          createdAt: true,
          organization: {
            select: { subscriptionStatus: true, expiresAt: true, metadata: true },
          },
          _count: { select: { students: true, teachers: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.school.count({ where }),
    ]);

    return { data: schools, meta: paginate(total, page, limit) };
  }

  async listSchoolOptions() {
    return this.prisma.client.school.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
  }

  async listUsers(query: SuperAdminUsersQuery) {
    const { page, limit, q, schoolId, role } = query;
    const memberFilter: Prisma.memberWhereInput = {
      ...(schoolId ? { organization: { school: { id: schoolId } } } : {}),
      ...(role ? { OR: [{ role }, { roles: { has: role } }] } : {}),
    };
    const where: Prisma.userWhereInput = {
      role: { not: "superAdmin" },
      members: { some: memberFilter },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
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
          twoFactorEnabled: true,
          createdAt: true,
          members: {
            select: {
              role: true,
              roles: true,
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

    return { data: users, meta: paginate(total, page, limit) };
  }

  async listAuditLogs(query: SuperAdminAuditQuery) {
    const { page, limit, action, schoolId, actorId, from, to, q } = query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
      throw new BadRequestException("Enter valid from/to dates");
    }
    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(to!)) toDate.setUTCHours(23, 59, 59, 999);

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action: action as Prisma.AuditLogWhereInput["action"] } : {}),
      ...(schoolId ? { schoolId } : {}),
      ...(actorId ? { userId: actorId } : {}),
      ...(fromDate || toDate
        ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
      ...(q ? { entityType: { contains: q, mode: "insensitive" } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          oldValues: true,
          newValues: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, role: true } },
          school: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return { data: rows, meta: paginate(total, page, limit) };
  }

  async getSchool(id: string) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: {
        organization: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, banned: true, twoFactorEnabled: true } },
              },
            },
          },
        },
        _count: { select: { students: true, teachers: true } },
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

  async updateSchool(id: string, input: UpdateSchoolInput, actor: AuditActor) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: { organization: true, _count: { select: { students: true } } },
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
    // Student sign-in emails embed the subdomain, so renaming it after students
    // exist would silently break their logins.
    if (input.subdomain !== school.subdomain && school._count.students > 0) {
      throw new ConflictException(
        "The subdomain cannot be changed once students have been enrolled, because student login emails are derived from it.",
      );
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = school.organization.metadata
        ? (JSON.parse(school.organization.metadata) as Record<string, unknown>)
        : {};
    } catch {
      metadata = {};
    }

    const next = {
      name: input.schoolName,
      code: input.schoolCode,
      subdomain: input.subdomain,
      email: input.schoolEmail || null,
      phone: input.schoolPhone || null,
      address: input.schoolAddress || null,
    };

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.school.update({ where: { id }, data: next });
        await tx.organization.update({
          where: { id: school.organizationId },
          data: {
            name: input.schoolName,
            slug: input.subdomain,
            metadata: JSON.stringify({ ...metadata, schoolCode: input.schoolCode }),
          },
        });
        await writeAudit(tx, actor, {
          action: "UPDATE",
          entityType: "super-admin.school.update",
          entityId: id,
          schoolId: id,
          oldValues: {
            name: school.name,
            code: school.code,
            subdomain: school.subdomain,
            email: school.email,
            phone: school.phone,
            address: school.address,
          },
          newValues: next,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("That school code or subdomain was just taken by another school");
      }
      throw error;
    }

    return this.getSchool(id);
  }

  async addSchoolAdmin(id: string, input: AddSchoolAdminInput, actor: AuditActor) {
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
      const otherSchoolMembership = await this.prisma.client.member.findFirst({
        where: { userId: existingUser.id },
        select: { organization: { select: { name: true } } },
      });
      if (otherSchoolMembership) {
        throw new ConflictException(
          "This account already belongs to another school. Use different credentials for each school.",
        );
      }
    }

    const userId = existingUser?.id ?? generateId();
    const memberId = generateId();
    const now = new Date();
    // A random one-time password (never the guessable role default); the admin
    // is forced to replace it at first sign-in.
    const credential = existingUser ? null : await this.credentials.prepareRandom();

    let admin;
    try {
      admin = await this.prisma.client.$transaction(async (transaction) => {
        if (!existingUser) {
          if (!credential) {
            throw new Error("Expected a prepared credential when creating a new admin account");
          }
          await transaction.user.create({
            data: {
              id: userId,
              name: input.name,
              email: input.email,
              emailVerified: false,
              role: "user",
              mustChangePassword: true,
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
              password: credential.passwordHash,
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

        await writeAudit(transaction, actor, {
          action: existingUser ? "ACCESS_CHANGED" : "CREDENTIALS_ISSUED",
          entityType: "super-admin.school-admin.add",
          entityId: userId,
          schoolId: id,
          newValues: { email: input.email, role: "admin", createdAccount: !existingUser },
        });

        return member.user;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("That email address was just registered by someone else");
      }
      throw error;
    }

    return {
      admin: { ...admin, role: "admin" },
      createdAccount: !existingUser,
      // Shown once to the super admin to hand over; the admin must change it at first sign-in.
      credentials: credential ? toIssuedCredentials(input.email, credential, "admin") : null,
    };
  }

  async setSchoolAdminBanned(
    id: string,
    userId: string,
    banned: SetSchoolAdminBannedInput["banned"],
    actor: AuditActor,
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
            throw new BadRequestException("The school must have at least one active administrator");
          }
        }

        await transaction.member.update({
          where: { id: member.id },
          data: {
            banned,
            banReason: banned ? "Suspended by platform super admin" : null,
          },
        });
        if (banned) {
          // Cut off any session already open for the suspended administrator.
          await transaction.session.deleteMany({ where: { userId } });
        }
        await writeAudit(transaction, actor, {
          action: "ACCESS_CHANGED",
          entityType: banned ? "super-admin.school-admin.ban" : "super-admin.school-admin.unban",
          entityId: userId,
          schoolId: id,
          oldValues: { banned: member.banned },
          newValues: { banned },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return { success: true, banned };
  }

  async removeSchoolAdmin(id: string, userId: string, actor: AuditActor) {
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
          throw new BadRequestException("The school must have at least one active administrator");
        }

        await transaction.member.delete({ where: { id: member.id } });
        await transaction.session.deleteMany({ where: { userId } });
        await writeAudit(transaction, actor, {
          action: "DELETE",
          entityType: "super-admin.school-admin.remove",
          entityId: userId,
          schoolId: id,
          oldValues: { role: member.role },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return { success: true };
  }

  /**
   * Recovery for a school administrator who lost both their authenticator and
   * their backup codes. Removes the second factor and ends every session, so
   * the administrator must sign in again (password only) and set it up afresh.
   * Audited; only reachable by a (two-factor-protected) platform super admin.
   */
  async resetSchoolAdminTwoFactor(id: string, userId: string, actor: AuditActor) {
    const member = await this.findSchoolAdminMembership(id, userId);
    await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      });
      await tx.twoFactor.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
      await tx.session.deleteMany({ where: { userId } });
      await writeAudit(tx, actor, {
        action: "ACCESS_CHANGED",
        entityType: "super-admin.school-admin.reset-two-factor",
        entityId: userId,
        schoolId: id,
        oldValues: { twoFactorEnabled: user?.twoFactorEnabled ?? false, role: member.role },
        newValues: { twoFactorEnabled: false },
      });
    });
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

  async enrollSchool(input: EnrollSchoolInput, actor: AuditActor) {
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
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + SUBSCRIPTION_TRIAL_DAYS * DAY_MS);

    // Random one-time password: a guessable default would let anyone who knows
    // the owner's email take the account before its real owner signs in.
    const credential = await this.credentials.prepareRandom();

    try {
      const { school, adminUser } = await this.prisma.client.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: orgId,
            name: input.schoolName,
            slug: input.subdomain.toLowerCase(),
            metadata: JSON.stringify({
              region: input.region ?? null,
              schoolCode: input.schoolCode,
            }),
            subscriptionStatus: "TRIALING",
            expiresAt: trialEndsAt,
            createdAt: now,
            updatedAt: now,
          },
        });
        const adminUser = await tx.user.create({
          data: {
            id: userId,
            name: input.adminName,
            email: input.adminEmail,
            emailVerified: false,
            role: "owner",
            mustChangePassword: true,
            createdAt: now,
            updatedAt: now,
          },
        });
        await tx.account.create({
          data: {
            id: generateId(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: credential.passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        });
        await tx.member.create({
          data: {
            id: generateId(),
            organizationId: orgId,
            userId,
            role: "owner",
            createdAt: now,
            updatedAt: now,
          },
        });
        const school = await tx.school.create({
          data: {
            organizationId: orgId,
            name: input.schoolName,
            code: input.schoolCode,
            subdomain: input.subdomain,
            email: input.schoolEmail,
            phone: input.schoolPhone,
            address: input.schoolAddress,
          },
        });
        await tx.subscription.create({
          data: {
            schoolId: school.id,
            status: "TRIALING",
            isOnTrial: true,
            trialStartsAt: now,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
          },
        });
        await writeAudit(tx, actor, {
          action: "CREATE",
          entityType: "super-admin.school.enroll",
          entityId: school.id,
          schoolId: school.id,
          newValues: {
            name: school.name,
            code: school.code,
            subdomain: school.subdomain,
            ownerEmail: input.adminEmail,
            trialEndsAt,
          },
        });
        await writeAudit(tx, actor, {
          action: "CREDENTIALS_ISSUED",
          entityType: "super-admin.school-owner.credentials",
          entityId: userId,
          schoolId: school.id,
          newValues: { email: input.adminEmail, role: "owner" },
        });
        return { school, adminUser };
      });

      return {
        school,
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
        },
        credentials: toIssuedCredentials(adminUser.email, credential, "owner"),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "That school code, subdomain or admin email was just taken. Check the values and try again.",
        );
      }
      throw error;
    }
  }

  async updateSubscription(id: string, input: UpdateSubscriptionInput, actor: AuditActor) {
    const school = await this.prisma.client.school.findUnique({
      where: { id },
      include: { organization: { select: { id: true, subscriptionStatus: true, expiresAt: true } } },
    });

    if (!school) {
      throw new NotFoundException(`School with id "${id}" not found`);
    }

    // undefined = leave unchanged, null = clear, string = set
    const nextExpiry =
      input.expiresAt === undefined
        ? school.organization.expiresAt
        : input.expiresAt === null
          ? null
          : parseExpiry(input.expiresAt);

    // Refuse a change that would lock the school out the moment it is saved.
    if (
      ["TRIALING", "ACTIVE", "PAST_DUE"].includes(input.status) &&
      !evaluateSubscriptionAccess(input.status, nextExpiry).allowed
    ) {
      throw new BadRequestException(
        "That expiry date has already passed, so the school would be locked out immediately. Choose a future date, or leave the expiry empty.",
      );
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: school.organizationId },
        data: { subscriptionStatus: input.status, expiresAt: nextExpiry },
      });

      // Keep the billing record in step with the access-control record.
      const subscriptionStatus = toSubscriptionEnum(input.status);
      const common = {
        status: subscriptionStatus,
        isOnTrial: input.status === "TRIALING",
        currentPeriodEnd: nextExpiry,
        trialEndsAt: input.status === "TRIALING" ? nextExpiry : null,
        canceledAt: input.status === "CANCELLED" ? new Date() : null,
        cancelAtPeriodEnd: false,
      };
      await tx.subscription.upsert({
        where: { schoolId: id },
        update: common,
        create: { schoolId: id, ...common },
      });

      await writeAudit(tx, actor, {
        action: "SUBSCRIPTION_CHANGED",
        entityType: "super-admin.subscription.update",
        entityId: id,
        schoolId: id,
        oldValues: {
          status: school.organization.subscriptionStatus,
          expiresAt: school.organization.expiresAt,
        },
        newValues: { status: input.status, expiresAt: nextExpiry, note: input.note ?? null },
      });
    });

    return this.getSchool(id);
  }

  async getPlatformStats() {
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
    const [totalSchools, totalStudents, totalTeachers, byStatus, expiringSoon, lapsed] =
      await Promise.all([
        this.prisma.client.school.count(),
        this.prisma.client.student.count(),
        this.prisma.client.teacher.count(),
        this.prisma.client.organization.groupBy({
          by: ["subscriptionStatus"],
          where: { school: { isNot: null } },
          _count: { _all: true },
        }),
        this.prisma.client.organization.count({
          where: {
            school: { isNot: null },
            subscriptionStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
            expiresAt: { gt: now, lte: soon },
          },
        }),
        this.prisma.client.organization.count({
          where: {
            school: { isNot: null },
            subscriptionStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
            expiresAt: { lte: now },
          },
        }),
      ]);

    const counts = Object.fromEntries(
      byStatus.map((row) => [row.subscriptionStatus, row._count._all]),
    ) as Record<string, number>;

    return {
      totalSchools,
      totalStudents,
      totalTeachers,
      activeSubscriptions: counts.ACTIVE ?? 0,
      trialing: counts.TRIALING ?? 0,
      pastDue: counts.PAST_DUE ?? 0,
      suspended: counts.SUSPENDED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
      expiringSoon,
      lapsed,
    };
  }
}
