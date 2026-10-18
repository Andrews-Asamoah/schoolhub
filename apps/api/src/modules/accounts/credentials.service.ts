import { ConflictException, Injectable } from "@nestjs/common";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import type { AuditAction, Prisma } from "@prisma/client";
import type { IssuedCredentials, Role } from "@schoolhub/shared";

/** Roles an administrator may provision. "owner" is only created at school enrolment. */
export type ProvisionableRole = Exclude<Role, "owner">;

export interface PreparedCredential {
  temporaryPassword: string;
  passwordHash: string;
}

/**
 * Role-based default passwords. They are intentionally predictable so staff
 * can hand them over easily, which is exactly why every account created with
 * one is flagged `mustChangePassword`: the API refuses all other requests
 * until the owner replaces it (see password-change.ts).
 */
export const DEFAULT_PASSWORDS: Record<ProvisionableRole | "owner", string> = {
  owner: "Owner@123",
  admin: "Admin@123",
  headmistress: "Headteacher@123",
  teacher: "Teacher@123",
  accountant: "Accountant@123",
  staff: "Staff@123",
  student: "Student@123",
  guardian: "Guardian@123",
};

export function toIssuedCredentials(
  loginEmail: string,
  credential: PreparedCredential,
  role: Role,
  loginId?: string,
): IssuedCredentials {
  return {
    loginEmail,
    ...(loginId ? { loginId } : {}),
    temporaryPassword: credential.temporaryPassword,
    role,
    mustChangePassword: true,
  };
}

interface CreateLoginInput {
  name: string;
  email: string;
  role: ProvisionableRole;
  organizationId: string;
  credential: PreparedCredential;
  profile?: Omit<Prisma.UserProfileUncheckedCreateInput, "userId" | "id">;
}

interface ResetLoginInput {
  userId: string;
  role: ProvisionableRole;
  organizationId: string;
  credential: PreparedCredential;
}

@Injectable()
export class CredentialsService {
  /**
   * Look up the role's default password and hash it (fresh random salt each
   * time). Done *before* opening a database transaction because scrypt is
   * deliberately slow and would otherwise hold the transaction open.
   */
  async prepare(role: Role): Promise<PreparedCredential> {
    const temporaryPassword = DEFAULT_PASSWORDS[role];
    return { temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
  }

  /** Create user + credential account + school membership (+ optional profile). */
  async createLogin(tx: Prisma.TransactionClient, input: CreateLoginInput) {
    const email = input.email.trim().toLowerCase();
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException(
        `The email ${email} already belongs to a SchoolHub account. Use a different email, or reset that person's existing login.`,
      );
    }

    const userId = generateId();
    const now = new Date();
    await tx.user.create({
      data: {
        id: userId,
        name: input.name,
        email,
        emailVerified: false,
        role: "user", // platform-level role; school access comes from `member`
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
        password: input.credential.passwordHash,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.member.create({
      data: {
        id: generateId(),
        organizationId: input.organizationId,
        userId,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      },
    });
    const profile = input.profile
      ? await tx.userProfile.create({ data: { ...input.profile, userId } })
      : null;

    return { userId, email, profileId: profile?.id ?? null };
  }

  /**
   * Issue a fresh temporary password for an existing user: creates the
   * credential account / membership if they are missing (legacy records),
   * flags the account for a forced change, and signs the user out everywhere.
   */
  async resetLogin(tx: Prisma.TransactionClient, input: ResetLoginInput) {
    const now = new Date();
    const account = await tx.account.findFirst({
      where: { userId: input.userId, providerId: "credential" },
      select: { id: true },
    });
    if (account) {
      await tx.account.update({
        where: { id: account.id },
        data: { password: input.credential.passwordHash, updatedAt: now },
      });
    } else {
      await tx.account.create({
        data: {
          id: generateId(),
          accountId: input.userId,
          providerId: "credential",
          userId: input.userId,
          password: input.credential.passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const membership = await tx.member.findUnique({
      where: { userId: input.userId },
      select: { organizationId: true },
    });
    if (!membership) {
      await tx.member.create({
        data: {
          id: generateId(),
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else if (membership.organizationId !== input.organizationId) {
      throw new ConflictException("This account belongs to a different school.");
    }

    await tx.user.update({
      where: { id: input.userId },
      data: { mustChangePassword: true, passwordChangedAt: null, updatedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: input.userId } });
  }

  /** Audit entry. Never include passwords or hashes in `details`. */
  async audit(
    tx: Prisma.TransactionClient,
    entry: {
      actorId: string;
      schoolId?: string;
      action: AuditAction;
      entityType: string;
      entityId: string;
      details?: Prisma.InputJsonValue;
    },
  ) {
    await tx.auditLog.create({
      data: {
        userId: entry.actorId,
        schoolId: entry.schoolId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        newValues: entry.details,
      },
    });
  }
}
