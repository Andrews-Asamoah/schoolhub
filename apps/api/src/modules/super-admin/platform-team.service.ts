import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PLATFORM_STAFF_ROLE, type PlatformSchoolRole } from "@schoolhub/shared";
import { generateId } from "better-auth";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import { desktopEntitled, desktopOverride, withDesktopOverride } from "../../common/desktop-policy.js";
import { temporaryPasswordExpiry } from "../../common/guards/password-change.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CredentialsService } from "../accounts/credentials.service.js";

@Injectable()
export class PlatformTeamService {
  constructor(private readonly prisma: PrismaService, private readonly credentials: CredentialsService) {}

  async invite(input: { name: string; email: string }, actor: AuditActor) {
    const credential = await this.credentials.prepareRandom();
    const id = generateId();
    const now = new Date();
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.user.create({ data: {
          id, ...input, role: PLATFORM_STAFF_ROLE, mustChangePassword: true,
          temporaryPasswordExpiresAt: temporaryPasswordExpiry(now),
          accounts: { create: { id: generateId(), accountId: id, providerId: "credential",
            password: credential.passwordHash, createdAt: now, updatedAt: now } },
        } });
        await writeAudit(tx, actor, {
          action: "CREDENTIALS_ISSUED", entityType: "platform-staff", entityId: id, newValues: { email: input.email },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An account already uses this email. Choose a separate platform work email.");
      }
      throw error;
    }
    return { name: input.name, credentials: { loginEmail: input.email, temporaryPassword: credential.temporaryPassword } };
  }

  async setSuspended(userId: string, banned: boolean, actor: AuditActor) {
    await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: userId, role: PLATFORM_STAFF_ROLE }, data: { banned } });
      if (!changed.count) throw new NotFoundException("Platform employee not found.");
      if (banned) await tx.session.deleteMany({ where: { userId } });
      await writeAudit(tx, actor, {
        action: "ACCESS_CHANGED", entityType: "platform-staff.status", entityId: userId, newValues: { banned },
      });
    });
  }

  async setSchoolRole(userId: string, schoolId: string, role: PlatformSchoolRole | null, actor: AuditActor) {
    await this.prisma.client.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({ where: { id: userId, role: PLATFORM_STAFF_ROLE }, select: { id: true } });
      if (!employee) throw new NotFoundException("Platform employee not found.");
      const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true } });
      if (!school) throw new NotFoundException("School not found.");
      if (role) {
        await tx.platformSchoolGrant.upsert({
          where: { userId_schoolId: { userId, schoolId } },
          create: { userId, schoolId, role }, update: { role },
        });
      } else {
        await tx.platformSchoolGrant.deleteMany({ where: { userId, schoolId } });
      }
      await writeAudit(tx, actor, {
        action: "ACCESS_CHANGED", entityType: "platform-staff.school-role", entityId: userId, schoolId, newValues: { role },
      });
    });
  }

  async assignedSchools(userId: string) {
    const grants = await this.prisma.client.platformSchoolGrant.findMany({
      where: { userId, user: { role: PLATFORM_STAFF_ROLE, banned: false } },
      orderBy: { school: { name: "asc" } },
      select: {
        role: true,
        school: { select: {
          id: true, name: true, subdomain: true,
          organization: { select: { subscriptionStatus: true, expiresAt: true } },
          subscription: { select: { settings: true, plan: { select: { features: true } } } },
        } },
      },
    });
    return grants.map(({ role, school: { subscription, organization, ...school } }) => ({
      ...school, role, ...organization, desktopEnabled: !!subscription && desktopEntitled(subscription.plan?.features, subscription.settings),
    }));
  }

  async setDesktopAccess(schoolId: string, enabled: boolean | null, actor: AuditActor) {
    await this.prisma.client.$transaction(async (tx) => {
      // Serialize with role revocation, account suspension and changes to subscription settings.
      const permitted = await tx.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM users u JOIN platform_school_grants g ON g."userId" = u.id
        WHERE u.id = ${actor.id} AND u.role = ${PLATFORM_STAFF_ROLE} AND NOT u.banned
          AND g."schoolId" = ${schoolId} AND g.role = 'DESKTOP_ACCESS'
        FOR UPDATE OF u, g
      `;
      if (!permitted.length) throw new ForbiddenException("You cannot manage desktop access for this school.");
      const billing = await tx.$queryRaw<{ settings: Prisma.JsonValue }[]>`
        SELECT settings FROM subscriptions WHERE "schoolId" = ${schoolId} FOR UPDATE
      `;
      if (!billing[0]) throw new NotFoundException("This school does not have a subscription.");
      const previous = billing[0].settings;
      await tx.subscription.update({ where: { schoolId },
        data: { settings: withDesktopOverride(previous, enabled) as Prisma.InputJsonValue },
      });
      await writeAudit(tx, actor, { action: "ACCESS_CHANGED", entityType: "platform-staff.desktop-access",
        entityId: schoolId, schoolId,
        oldValues: { desktopEnabled: desktopOverride(previous) }, newValues: { desktopEnabled: enabled } });
    });
  }
}
