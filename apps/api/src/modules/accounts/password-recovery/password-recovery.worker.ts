import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DurableJobsService } from '../../../common/jobs/durable-jobs.service.js';
import { RecoveryTransport } from './recovery-transport.js';
import { openRecovery, recoveryHash } from './recovery-crypto.js';
@Injectable()
export class PasswordRecoveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PasswordRecoveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DurableJobsService,
    private readonly transport: RecoveryTransport,
  ) {}
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const poll = () => {
      void this.tick().catch(() =>
        this.logger.error('password.recovery.poll.failed'),
      );
    };
    this.timer = setInterval(poll, 10000);
    this.timer.unref();
    poll();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.client.passwordRecoveryRequest.updateMany({
        where: {
          status: 'PENDING',
          OR: [{ consumedAt: { not: null } }, { revokedAt: { not: null } }],
        },
        data: { status: 'SUPPRESSED', encryptedPayload: null },
      });
      await this.prisma.client.passwordRecoveryRequest.updateMany({
        where: { expiresAt: { lte: now }, encryptedPayload: { not: null } },
        data: { status: 'EXPIRED', encryptedPayload: null },
      });
      await this.prisma.client
        .$executeRaw`UPDATE password_recovery_requests r SET status='DEAD',"encryptedPayload"=NULL,"updatedAt"=CURRENT_TIMESTAMP FROM background_jobs j WHERE j.id=r.id AND j.kind='password-recovery' AND j.status='DEAD' AND r.status='PENDING'`;
      // Retain quota/replay evidence for 24 hours, never long-lived bearer payloads.
      const old = await this.prisma.client.passwordRecoveryRequest.findMany({
        where: { createdAt: { lt: new Date(now.getTime() - 86400000) } },
        take: 100,
        select: { id: true },
      });
      if (old.length)
        await this.prisma.client.$transaction(async (tx) => {
          const ids = old.map((row) => row.id);
          await tx.backgroundJob.deleteMany({
            where: {
              id: { in: ids },
              kind: 'password-recovery',
              status: { not: 'RUNNING' },
            },
          });
          const active = await tx.backgroundJob.findMany({
            where: { id: { in: ids }, status: 'RUNNING' },
            select: { id: true },
          });
          await tx.passwordRecoveryRequest.deleteMany({
            where: { id: { in: ids, notIn: active.map((row) => row.id) } },
          });
        });
      if (!this.transport.configured('EMAIL')) return;
      const pending = await this.prisma.client.backgroundJob.findMany({
        where: {
          kind: 'password-recovery',
          nextAttempt: { lte: now },
          OR: [
            { status: 'PENDING' },
            { status: 'RUNNING', leaseUntil: { lt: now } },
          ],
        },
        orderBy: [{ nextAttempt: 'asc' }, { id: 'asc' }],
        take: 25,
        select: { id: true },
      });
      for (const job of pending)
        await this.jobs.run(job.id, () => this.dispatch(job.id), now);
    } finally {
      this.running = false;
    }
  }
  async dispatch(id: string) {
    const row = await this.prisma.client.passwordRecoveryRequest.findUnique({
      where: { id },
    });
    if (!row || row.status !== 'PENDING') return;
    const current = await this.prisma.client.user.findUnique({
      where: { id: row.userId },
      select: { banned: true, email: true, emailVerified: true },
    });
    const credentials=await this.prisma.client.account.findMany({where:{userId:row.userId,providerId:"credential"},take:2,select:{password:true}});
    // Leave enough time for the bounded HTTP request and opening the email.
    if (
      credentials.length!==1||!credentials[0]?.password||recoveryHash(credentials[0].password)!==row.credentialFingerprint||
      row.consumedAt ||
      row.revokedAt ||
      !current ||
      current.banned ||
      !current.emailVerified ||
      recoveryHash(current.email.trim().toLowerCase()) !== row.recipientHash
    ) {
      await this.prisma.client.passwordRecoveryRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'SUPPRESSED', encryptedPayload: null },
      });
      return;
    }
    if (row.expiresAt.getTime() - Date.now() < 60000 || !row.encryptedPayload) {
      await this.prisma.client.passwordRecoveryRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'EXPIRED', encryptedPayload: null },
      });
      return;
    }
    if (!this.transport.configured('EMAIL'))
      throw new Error('Recovery delivery not configured');
    const payload = openRecovery(
      id,
      row.encryptedPayload,
      process.env.BETTER_AUTH_SECRET!,
    );
    const result = await this.transport.send('EMAIL', id, payload);
    if (result.state === 'ACCEPTED') {
      await this.prisma.client.passwordRecoveryRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'ACCEPTED',
          providerMessageId: result.messageId,
          encryptedPayload: null,
        },
      });
      return;
    }
    // Resend has a stable payload/key; ambiguous outcomes retry only inside the token window.
    if (result.state === 'RETRY')
      throw new Error('Retryable recovery delivery failure');
    await this.prisma.client.passwordRecoveryRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'DEAD', encryptedPayload: null },
    });
  }
}
