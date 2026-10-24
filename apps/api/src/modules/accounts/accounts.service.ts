import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { School } from "@prisma/client";
import {
  studentLoginEmail,
  type ChangePasswordInput,
  type CredentialSubjectKind,
  type IssuedCredentials,
} from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  CredentialsService,
  toIssuedCredentials,
  type PreparedCredential,
  type ProvisionableRole,
} from "./credentials.service.js";
import { roleForStaffType } from "./staff-roles.js";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

@Injectable()
export class AccountsService {
  /** userId -> recent failed current-password attempts (in-memory, per instance). */
  private readonly failedAttempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  // --------------------------------------------------------------------------
  // Self-service: the account owner replaces a temporary / old password.
  // --------------------------------------------------------------------------
  async changeOwnPassword(
    user: { id: string },
    currentSessionToken: string,
    input: ChangePasswordInput,
  ) {
    this.assertNotLockedOut(user.id);

    const account = await this.prisma.client.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true, password: true },
    });
    if (!account?.password) {
      throw new BadRequestException("This account does not use a password.");
    }

    const valid = await verifyPassword({
      hash: account.password,
      password: input.currentPassword,
    });
    if (!valid) {
      this.recordFailure(user.id);
      // 400 (not 401) so the web client does not mistake it for an expired session.
      throw new BadRequestException("Your current password is incorrect.");
    }
    this.failedAttempts.delete(user.id);

    const passwordHash = await hashPassword(input.newPassword);
    const now = new Date();
    const school = await this.prisma.client.school.findFirst({
      where: { organization: { members: { some: { userId: user.id } } } },
      select: { id: true },
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { password: passwordHash, updatedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false, passwordChangedAt: now, updatedAt: now },
      });
      // Sign out every other device; keep the one making this request.
      await tx.session.deleteMany({
        where: { userId: user.id, token: { not: currentSessionToken } },
      });
      await this.credentials.audit(tx, {
        actorId: user.id,
        schoolId: school?.id,
        action: "PASSWORD_CHANGED",
        entityType: "USER",
        entityId: user.id,
      });
    });

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Administrator action: (re)issue a temporary password for a person record.
  // Works for brand-new logins on legacy records and for forgotten passwords.
  // --------------------------------------------------------------------------
  async issueCredentials(
    school: School,
    actor: { id: string; schoolRole?: string },
    kind: CredentialSubjectKind,
    recordId: string,
  ): Promise<IssuedCredentials> {
    const db = this.prisma.client;

    return db.$transaction(async (tx) => {
      // The default password depends on the role, which is only known once the
      // record has been loaded below.
      let credential: PreparedCredential;
      let userId: string;
      let email: string;
      let role: ProvisionableRole;
      let loginId: string | undefined;

      if (kind === "student") {
        const student = await tx.student.findFirst({
          where: { id: recordId, schoolId: school.id, deletedAt: null },
          include: { profile: { include: { user: true } } },
        });
        if (!student) throw new NotFoundException("Student not found.");
        userId = student.profile.userId;
        role = "student";
        credential = await this.credentials.prepare(role);
        // Students created with the username scheme sign in with it; older
        // records keep using their admission number.
        const studentLoginId = student.username ?? student.admissionNumber ?? student.studentId;
        loginId = studentLoginId;
        email = student.profile.user.email;
        if (email.endsWith("@student.schoolhub")) {
          // Legacy placeholder that is not a valid sign-in address.
          email = studentLoginEmail(studentLoginId, school.subdomain);
          await tx.user.update({ where: { id: userId }, data: { email } });
          await tx.userProfile.update({ where: { id: student.profileId }, data: { email } });
        }
      } else if (kind === "teacher") {
        const teacher = await tx.teacher.findFirst({
          where: { id: recordId, schoolId: school.id, deletedAt: null },
          include: { profile: { include: { user: true } } },
        });
        if (!teacher) throw new NotFoundException("Teacher not found.");
        role = "teacher";
        credential = await this.credentials.prepare(role);
        const displayName = `${teacher.firstName ?? ""} ${teacher.lastName ?? ""}`.trim();
        if (teacher.profile) {
          userId = teacher.profile.userId;
          email = teacher.profile.user.email;
        } else {
          if (!teacher.invitationEmail) {
            throw new BadRequestException("Add an email address for this teacher first.");
          }
          const created = await this.credentials.createLogin(tx, {
            name: displayName || teacher.invitationEmail,
            email: teacher.invitationEmail,
            role,
            organizationId: school.organizationId,
            credential,
            profile: { firstName: teacher.firstName ?? "", lastName: teacher.lastName ?? "" },
          });
          await tx.teacher.update({
            where: { id: teacher.id },
            data: { profileId: created.profileId },
          });
          await this.auditIssue(tx, actor.id, school.id, "CREDENTIALS_ISSUED", kind, teacher.id);
          return toIssuedCredentials(created.email, credential, role);
        }
      } else if (kind === "staff") {
        const staff = await tx.staff.findFirst({
          where: { id: recordId, schoolId: school.id, deletedAt: null },
          include: { profile: { include: { user: true } } },
        });
        if (!staff) throw new NotFoundException("Staff member not found.");
        userId = staff.profile.userId;
        email = staff.profile.user.email;
        role = roleForStaffType(staff.staffType);
        credential = await this.credentials.prepare(role);
        if (role === "admin" && actor.schoolRole === "headteacher") {
          throw new ForbiddenException("Only a school owner or administrator can manage administrator logins.");
        }
      } else {
        const guardian = await tx.guardian.findFirst({
          where: { id: recordId, schoolId: school.id, deletedAt: null },
          include: { profile: { include: { user: true } } },
        });
        if (!guardian) throw new NotFoundException("Guardian not found.");
        role = "guardian";
        credential = await this.credentials.prepare(role);
        const displayName = `${guardian.firstName} ${guardian.lastName}`.trim();
        if (guardian.profile) {
          userId = guardian.profile.userId;
          email = guardian.profile.user.email;
        } else {
          if (!guardian.email) {
            throw new BadRequestException("Add an email address for this guardian first.");
          }
          const created = await this.credentials.createLogin(tx, {
            name: displayName,
            email: guardian.email,
            role,
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
            where: { id: guardian.id },
            data: { profileId: created.profileId, canLogin: true },
          });
          await this.auditIssue(tx, actor.id, school.id, "CREDENTIALS_ISSUED", kind, guardian.id);
          return toIssuedCredentials(created.email, credential, role);
        }
      }

      if (userId === actor.id) {
        throw new ForbiddenException("Use “Change password” to update your own password.");
      }
      const target = await tx.member.findUnique({
        where: { userId },
        select: { role: true, roles: true },
      });
      const targetRoles = new Set([target?.role, ...(target?.roles ?? [])]);
      if (targetRoles.has("owner") && actor.schoolRole !== "owner") {
        throw new ForbiddenException("Only the school owner can reset the owner's password.");
      }

      await this.credentials.resetLogin(tx, {
        userId,
        role,
        organizationId: school.organizationId,
        credential,
      });
      if (kind === "guardian") {
        await tx.guardian.update({ where: { id: recordId }, data: { canLogin: true } });
      }
      await this.auditIssue(tx, actor.id, school.id, "PASSWORD_RESET", kind, recordId);
      return toIssuedCredentials(email, credential, role, loginId);
    });
  }

  private auditIssue(
    tx: Parameters<CredentialsService["audit"]>[0],
    actorId: string,
    schoolId: string,
    action: "CREDENTIALS_ISSUED" | "PASSWORD_RESET",
    kind: CredentialSubjectKind,
    entityId: string,
  ) {
    return this.credentials.audit(tx, {
      actorId,
      schoolId,
      action,
      entityType: kind.toUpperCase(),
      entityId,
    });
  }

  private assertNotLockedOut(userId: string) {
    const recent = (this.failedAttempts.get(userId) ?? []).filter(
      (at) => Date.now() - at < WINDOW_MS,
    );
    this.failedAttempts.set(userId, recent);
    if (recent.length >= MAX_ATTEMPTS) {
      throw new HttpException(
        "Too many incorrect attempts. Please wait a minute and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(userId: string) {
    const recent = this.failedAttempts.get(userId) ?? [];
    recent.push(Date.now());
    this.failedAttempts.set(userId, recent);
  }
}
