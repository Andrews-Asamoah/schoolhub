import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { passwordSchema } from '@schoolhub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { originPolicy } from '../../../common/origin-policy.js';
import { DurableJobsService } from '../../../common/jobs/durable-jobs.service.js';
import { RecoveryTransport } from './recovery-transport.js';
import { recoveryHash, sealRecovery } from './recovery-crypto.js';
export const RECOVERY_RESPONSE = {
  success: true,
  message:
    'If this address belongs to an eligible account, a reset link will arrive shortly. Otherwise, contact your school administrator.',
};
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DurableJobsService,
    private readonly transport: RecoveryTransport,
  ) {}
  async request(email: string, origin?: string, school?: string) {
    const started = Date.now();
    try {
      if (!originPolicy(process.env).allows(origin))
        throw new ForbiddenException('Untrusted recovery origin.');
      if (!this.transport.configured('EMAIL'))
        throw new ServiceUnavailableException(
          'Password recovery is unavailable. Contact your school administrator.',
        );
      const address = email.trim().toLowerCase(),
        user = await this.prisma.client.user.findUnique({
          where: { email: address },
          select: { id: true },
        });
      if (!user) return RECOVERY_RESPONSE;
      await this.prisma.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('password-recovery'),hashtext(${user.id}))`;
        const current = await tx.user.findUnique({
          where: { id: user.id },
          select: { banned: true, email: true, emailVerified: true },
        });
        const credentials=await tx.account.findMany({where:{userId:user.id,providerId:"credential"},take:2,select:{password:true}});
        if (
          !current ||
          current.banned ||
          !current.emailVerified ||
          current.email.trim().toLowerCase() !== address ||
          credentials.length !== 1 || !credentials[0]?.password
        )
          return;
        if (
          (await tx.passwordRecoveryRequest.count({
            where: {
              userId: user.id,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
          })) >= 3
        )
          return;
        const token = randomBytes(32).toString('base64url'),
          id = 'recovery_' + randomUUID(),
          expiresAt = new Date(Date.now() + 15 * 60000);
        const link = new URL(
          '/reset-password',
          origin ?? process.env.WEB_ORIGIN!,
        );
        if (school) link.searchParams.set('school', school);
        link.hash = new URLSearchParams({ token }).toString();
        const payload = {
          from: process.env.RESEND_FROM_EMAIL!,
          to: address,
          subject: 'Reset your SchoolHub password',
          text: `Reset your SchoolHub password using the link below. This single-use link expires 15 minutes after the request. Only the most recent link works. Your authenticator and backup codes are still required if two-factor authentication is enabled. If you did not request this, ignore this email.\n\n${link.href}`,
        };
        // Invalidate earlier links and erase unsent bearer material atomically.
        await tx.passwordRecoveryRequest.updateMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date(), encryptedPayload: null },
        });
        await tx.passwordRecoveryRequest.create({
          data: {
            id,
            userId: user.id,
            tokenHash: recoveryHash(token),
            credentialFingerprint: recoveryHash(credentials[0]!.password!),
            recipientHash: recoveryHash(address),
            encryptedPayload: sealRecovery(
              id,
              payload,
              process.env.BETTER_AUTH_SECRET!,
            ),
            expiresAt,
          },
        });
        await this.jobs.enqueue(
          id,
          'password-recovery',
          null,
          { requestId: id },
          tx,
        );
        const membership = await tx.member.findFirst({
          where: { userId: user.id },
          select: {
            organization: { select: { school: { select: { id: true } } } },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            schoolId: membership?.organization.school?.id,
            action: 'ACCESS_CHANGED',
            entityType: 'auth.password.recovery.requested',
            entityId: id,
          },
        });
      });
      return RECOVERY_RESPONSE;
    } finally {
      const delay = 500 - (Date.now() - started);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  async complete(
    token: string,
    newPassword: string,
    actor: { ip?: string; userAgent?: string } = {},
  ) {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues[0]?.message ??
          'Password does not meet requirements.',
      );
    const tokenHash = recoveryHash(token),
      candidate = await this.prisma.client.passwordRecoveryRequest.findUnique({
        where: { tokenHash },
      });
    const invalid = () =>
      new BadRequestException(
        'This reset link is invalid or expired. Request a new link.',
      );
    if (
      !candidate ||
      candidate.consumedAt ||
      candidate.revokedAt ||
      candidate.expiresAt <= new Date()
    )
      throw invalid();
    const password = await hashPassword(parsed.data);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('password-recovery'),hashtext(${candidate.userId}))`;
      const row = await tx.passwordRecoveryRequest.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const user = await tx.user.findUnique({ where: { id: row.userId } });
      if (
        row.consumedAt ||
        row.revokedAt ||
        row.expiresAt <= new Date() ||
        !user ||
        user.banned ||
        !user.emailVerified ||
        recoveryHash(user.email.trim().toLowerCase()) !== row.recipientHash
      )
        throw invalid();
      const credentials=await tx.account.findMany({where:{userId:user.id,providerId:"credential"},take:2,select:{id:true,password:true}});
      if(credentials.length!==1||!credentials[0]?.password||recoveryHash(credentials[0].password)!==row.credentialFingerprint)throw invalid();
      const accounts = await tx.account.updateMany({
        where: { id: credentials[0].id, password:credentials[0].password },
        data: { password },
      });
      if (accounts.count !== 1) throw invalid();
      await tx.user.update({
        where: { id: user.id },
        data: {
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          passwordChangedAt: new Date(),
        },
      });
      const sessions = await tx.session.deleteMany({
        where: { userId: user.id },
      });
      const challenges = await tx.verification.findMany({
        where: { value: user.id, identifier: { startsWith: '2fa-' } },
        select: { identifier: true },
      });
      await tx.verification.deleteMany({
        where: {
          OR: [
            { value: user.id, identifier: { startsWith: 'trust-device-' } },
            { value: user.id, identifier: { startsWith: '2fa-' } },
            {
              identifier: {
                in: challenges.map((item) => '2fa-attempts-' + item.identifier),
              },
            },
          ],
        },
      });
      await tx.passwordRecoveryRequest.update({
        where: { id: row.id },
        data: { consumedAt: new Date(), encryptedPayload: null },
      });
      await tx.passwordRecoveryRequest.updateMany({
        where: {
          userId: user.id,
          id: { not: row.id },
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), encryptedPayload: null },
      });
      const membership = await tx.member.findFirst({
        where: { userId: user.id },
        select: {
          organization: { select: { school: { select: { id: true } } } },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          schoolId: membership?.organization.school?.id,
          action: 'ACCESS_CHANGED',
          entityType: 'auth.password.reset',
          entityId: user.id,
          ipAddress: actor.ip,
          userAgent: actor.userAgent?.slice(0, 300),
          newValues: { sessionsRevoked: sessions.count },
        },
      });
    });
    return { success: true };
  }
}
