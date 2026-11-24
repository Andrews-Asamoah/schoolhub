import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { evaluateSubscriptionAccess } from '@schoolhub/shared';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DurableJobsService } from '../../common/jobs/durable-jobs.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const receiptDelay = 15 * 60_000;
const maxPushAge = 24 * 60 * 60_000;
const jobKinds = ['mobile-push', 'mobile-push-receipt'];
const registrationId = z.string().regex(/^[a-f0-9]{64}$/);
const pushPayload = z.object({
  registrationId,
  notificationId: z.string().min(1),
});
const receiptPayload = z.object({
  registrationId,
  ticketId: z.string().min(1),
});
const ticketSchema = z.object({
  status: z.enum(['ok', 'error']),
  id: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});

export const mobileDeviceSchema = z
  .object({
    token: z
      .string()
      .max(200)
      .regex(/^(?:Expo|Exponent)PushToken\[[\w-]+\]$/),
  })
  .strict();
export const mobileDeviceIdSchema = z.object({ registrationId }).strict();

type Binding = {
  schoolId: string;
  userId: string;
  sessionId: string;
  role: string;
};

@Injectable()
export class MobilePushService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MobilePushService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DurableJobsService,
  ) {}

  async register(binding: Binding, input: z.infer<typeof mobileDeviceSchema>) {
    if (!process.env.EXPO_PUSH_ACCESS_TOKEN?.trim())
      throw new ServiceUnavailableException(
        'Mobile push is unavailable for this deployment.',
      );
    const id = createHash('sha256')
      .update(
        JSON.stringify([
          binding.schoolId,
          binding.userId,
          binding.sessionId,
          binding.role,
          input.token,
        ]),
      )
      .digest('hex');
    const data = { ...input, ...binding, registrationId: id };
    await this.prisma.client.deviceToken.upsert({
      where: { token: input.token },
      create: data,
      update: data,
    });
    return { registrationId: id };
  }

  async remove(binding: Binding, id: string) {
    await this.prisma.client.deviceToken.deleteMany({
      where: { ...binding, registrationId: id },
    });
    return { success: true };
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const poll = () =>
      void this.tick().catch(() =>
        this.logger.error('mobile.push.poll.failed'),
      );
    this.timer = setInterval(poll, 30_000);
    this.timer.unref();
    poll();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.polling || !process.env.EXPO_PUSH_ACCESS_TOKEN?.trim()) return;
    this.polling = true;
    try {
      const jobs = await this.prisma.client.backgroundJob.findMany({
        where: {
          kind: { in: jobKinds },
          nextAttempt: { lte: now },
          OR: [
            { status: 'PENDING' },
            { status: 'RUNNING', leaseUntil: { lt: now } },
          ],
        },
        select: { id: true, kind: true },
        orderBy: [{ nextAttempt: 'asc' }, { id: 'asc' }],
        take: 25,
      });
      for (const job of jobs) {
        await this.jobs.run(
          job.id,
          async (payload) => {
            if (job.kind === 'mobile-push')
              await this.dispatch(job.id, pushPayload.parse(payload), now);
            else await this.checkReceipt(receiptPayload.parse(payload));
          },
          now,
        );
      }
    } finally {
      this.polling = false;
    }
  }

  private async dispatch(
    jobId: string,
    input: z.infer<typeof pushPayload>,
    now: Date,
  ) {
    const device = await this.prisma.client.deviceToken.findUnique({
      where: { registrationId: input.registrationId },
      include: {
        session: { select: { expiresAt: true } },
        user: { select: { banned: true, mustChangePassword: true } },
        school: {
          select: {
            organizationId: true,
            organization: {
              select: { subscriptionStatus: true, expiresAt: true },
            },
          },
        },
      },
    });
    if (
      !device ||
      device.session.expiresAt <= now ||
      device.user.banned ||
      device.user.mustChangePassword
    )
      return;
    const { organizationId, organization } = device.school;
    if (
      !evaluateSubscriptionAccess(
        organization.subscriptionStatus,
        organization.expiresAt,
        now,
      ).allowed
    )
      return;
    const [membership, notification] = await Promise.all([
      this.prisma.client.member.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: device.userId },
        },
        select: { role: true, roles: true, banned: true },
      }),
      this.prisma.client.notification.findFirst({
        where: {
          id: input.notificationId,
          schoolId: device.schoolId,
          userId: device.userId,
          isRead: false,
          createdAt: { gt: new Date(now.getTime() - maxPushAge) },
        },
        select: { id: true, link: true },
      }),
    ]);
    if (
      !membership ||
      membership.banned ||
      ![membership.role, ...membership.roles].includes(device.role)
    )
      return;
    if (!notification || /external-exam|bece/i.test(notification.link ?? ''))
      return;
    const receiptJobId = `${jobId}:receipt`;
    if (
      await this.prisma.client.backgroundJob.findUnique({
        where: { id: receiptJobId },
        select: { id: true },
      })
    )
      return;
    const result = await this.expo('send', {
      to: device.token,
      title: 'SchoolHub',
      body: 'You have a new school update.',
      channelId: 'schoolhub-updates',
      ttl: Math.floor(maxPushAge / 1000),
      data: { screen: 'school-updates', registrationId: device.registrationId },
    });
    const ticket = z.object({ data: ticketSchema }).parse(result).data;
    if (ticket.status === 'error') {
      if (
        await this.removeInvalidDevice(
          device.registrationId,
          ticket.details?.error,
        )
      )
        return;
      throw new Error('Expo rejected the push ticket.');
    }
    const ticketId = ticket.id;
    if (!ticketId) throw new Error('Expo did not return a push receipt ID.');
    await this.prisma.client.$transaction(async (tx) => {
      await this.jobs.enqueue(
        receiptJobId,
        'mobile-push-receipt',
        device.schoolId,
        {
          registrationId: device.registrationId,
          ticketId,
        },
        tx,
      );
      await tx.backgroundJob.update({
        where: { id: receiptJobId },
        data: { nextAttempt: new Date(now.getTime() + receiptDelay) },
      });
    });
  }

  private async checkReceipt(input: z.infer<typeof receiptPayload>) {
    const result = await this.expo('getReceipts', { ids: [input.ticketId] });
    const receipt = z
      .object({ data: z.record(z.string(), ticketSchema) })
      .parse(result).data[input.ticketId];
    if (!receipt)
      throw new Error('Expo has not returned the push receipt yet.');
    if (
      receipt.status === 'error' &&
      !(await this.removeInvalidDevice(
        input.registrationId,
        receipt.details?.error,
      ))
    )
      throw new Error('Expo could not deliver the push notification.');
  }

  private async removeInvalidDevice(id: string, code: string | undefined) {
    if (code !== 'DeviceNotRegistered') return false;
    await this.prisma.client.deviceToken.deleteMany({
      where: { registrationId: id },
    });
    return true;
  }

  private async expo(
    action: 'send' | 'getReceipts',
    payload: object,
  ): Promise<unknown> {
    const response = await fetch(`https://exp.host/--/api/v2/push/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN!.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Expo push is unavailable.');
    return response.json();
  }
}
