import { evaluateSubscriptionAccess } from '@schoolhub/shared';
import {
  BadRequestException,
  NotFoundException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Webhook } from 'svix';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DurableJobsService } from '../../common/jobs/durable-jobs.service.js';
import {
  advancesDelivery,
  DeliveryProvider,
  deliveryPayload,
  deliveryStateForEvent,
  ghanaPhone,
  type DeliveryPayload,
} from './delivery-provider.js';
const contactHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class NotificationTransport extends DeliveryProvider {
  constructor() {
    super();
  }
}
@Injectable()
export class NotificationDeliveryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationDeliveryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: DurableJobsService,
    private readonly transport: NotificationTransport,
  ) {}
  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NOTIFICATION_DELIVERY_ENABLED !== 'true'
    )
      return;
    const poll = () => {
      void this.tick().catch(() =>
        this.logger.error('notification.delivery.poll.failed'),
      );
    };
    this.timer = setInterval(poll, 30000);
    this.timer.unref();
    poll();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(now = new Date()) {
    if (this.running || process.env.NOTIFICATION_DELIVERY_ENABLED !== 'true')
      return;
    this.running = true;
    try {
      const channels = ['EMAIL', 'SMS'].filter((channel) =>
        this.transport.configured(channel),
      );
      const pending = channels.length
        ? await this.prisma.client.$queryRaw<
            Array<{ id: string }>
          >`SELECT j.id FROM background_jobs j JOIN notification_deliveries d ON d.id=j.id WHERE j.kind='notification-delivery' AND j."nextAttempt"<=${now} AND (j.status='PENDING' OR (j.status='RUNNING' AND j."leaseUntil"<${now})) AND d.channel IN (${Prisma.join(channels)}) ORDER BY j."nextAttempt",j.id LIMIT 25`
        : [];
      for (const job of pending) {
        const delivery =
          await this.prisma.client.notificationDelivery.findUnique({
            where: { id: job.id },
            select: { channel: true },
          });
        if (!delivery || !this.transport.configured(delivery.channel)) continue;
        await this.jobs.run(job.id, async () => this.dispatch(job.id), now);
      }
      const dead = await this.prisma.client.$queryRaw<
        Array<{ id: string }>
      >`SELECT d.id FROM notification_deliveries d JOIN background_jobs j ON j.id=d.id WHERE j.kind='notification-delivery' AND j.status='DEAD' AND d.status IN ('PENDING','SENDING') LIMIT 100`;
      if (dead.length) {
        await this.prisma.client.notificationDelivery.updateMany({
          where: { id: { in: dead.map((job) => job.id) }, status: 'PENDING' },
          data: { status: 'DEAD', reason: 'RETRY_LIMIT' },
        });
        await this.prisma.client.notificationDelivery.updateMany({
          where: { id: { in: dead.map((job) => job.id) }, status: 'SENDING' },
          data: { status: 'UNKNOWN', reason: 'WORKER_OUTCOME_UNKNOWN' },
        });
      }
      await this.processEvents();
      if (this.transport.configured('SMS')) {
        const accepted = await this.prisma.client.notificationDelivery.findMany(
          {
            where: {
              provider: 'HUBTEL',
              status: 'ACCEPTED',
              nextPollAt: { lte: now },
              providerMessageId: { not: null },
            },
            orderBy: { nextPollAt: 'asc' },
            take: 25,
          },
        );
        for (const row of accepted) {
          if (
            row.acceptedAt &&
            now.getTime() - row.acceptedAt.getTime() > 7 * 86400000
          ) {
            await this.prisma.client.notificationDelivery.updateMany({
              where: { id: row.id, status: 'ACCEPTED' },
              data: {
                status: 'UNKNOWN',
                reason: 'DELIVERY_RECEIPT_TIMEOUT',
                nextPollAt: null,
              },
            });
            continue;
          }
          const state = await this.transport.smsStatus(row.providerMessageId!);
          await this.prisma.client.notificationDelivery.updateMany({
            where: { id: row.id, status: 'ACCEPTED' },
            data: {
              status: state === 'UNKNOWN' ? 'ACCEPTED' : state,
              deliveredAt: state === 'DELIVERED' ? now : undefined,
              nextPollAt: new Date(now.getTime() + 300000),
              reason: state === 'UNKNOWN' ? 'STATUS_NOT_CONFIRMED' : null,
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
  async dispatch(id: string) {
    const existing = await this.prisma.client.notificationDelivery.findUnique({
      where: { id },
    });
    if (!existing) return;
    if (existing.status === 'SENDING') {
      if (existing.channel === 'SMS' || existing.expiresAt <= new Date()) {
        await this.prisma.client.notificationDelivery.update({
          where: { id },
          data: { status: 'UNKNOWN', reason: 'WORKER_OUTCOME_UNKNOWN' },
        });
        return;
      }
      await this.prisma.client.notificationDelivery.update({
        where: { id },
        data: { status: 'PENDING', reason: 'RECOVERED_WITH_IDEMPOTENCY_KEY' },
      });
    }
    const prepared = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM notification_deliveries WHERE id=${id} FOR UPDATE`;
      const row = await tx.notificationDelivery.findUniqueOrThrow({
        where: { id },
      });
      if (row.status !== 'PENDING') return null;
      if (row.expiresAt <= new Date()) {
        await tx.notificationDelivery.update({
          where: { id },
          data: { status: 'EXPIRED', reason: 'DELIVERY_WINDOW_ENDED' },
        });
        return null;
      }
      const [school, user, preference, settings, profile] = await Promise.all([
        tx.school.findUnique({
          where: { id: row.schoolId },
          include: { organization: true },
        }),
        tx.user.findUnique({ where: { id: row.userId } }),
        tx.notificationPreference.findUnique({
          where: {
            schoolId_userId: { schoolId: row.schoolId, userId: row.userId },
          },
        }),
        tx.schoolNotificationSettings.findUnique({
          where: { schoolId: row.schoolId },
        }),
        tx.userProfile.findUnique({
          where: { userId: row.userId },
          select: { phone: true },
        }),
      ]);
      const membership = school
        ? await tx.member.findFirst({
            where: {
              organizationId: school.organizationId,
              userId: row.userId,
              banned: false,
            },
          })
        : null;
      const email = row.channel === 'EMAIL',
        recipient = email
          ? row.recipient.trim().toLowerCase()
          : ghanaPhone(row.recipient);
      let reason: string | null = null;
      if (
        !school ||
        !user ||
        user.banned ||
        !membership ||
        !evaluateSubscriptionAccess(
          school.organization.subscriptionStatus,
          school.organization.expiresAt,
        ).allowed
      )
        reason = 'MEMBERSHIP_OR_SCHOOL_INACTIVE';
      else if (
        email
          ? !preference?.emailEnabled || !settings?.emailEnabled
          : !preference?.smsEnabled || !settings?.smsEnabled
      )
        reason = 'CHANNEL_DISABLED_OR_CONSENT_WITHDRAWN';
      else if (
        !recipient ||
        (email
          ? !user.emailVerified ||
            !z.email().safeParse(recipient).success ||
            user.email.trim().toLowerCase() !== recipient
          : ghanaPhone(profile?.phone ?? '') !== recipient)
      )
        reason = 'CONTACT_INVALID_OR_CHANGED';
      const recipientHash = recipient ? contactHash(recipient) : null;
      if (
        !reason &&
        recipientHash &&
        (await tx.notificationSuppression.count({
          where: { channel: row.channel, recipientHash },
        }))
      )
        reason = 'CONTACT_SUPPRESSED';
      if (reason) {
        await tx.notificationDelivery.update({
          where: { id },
          data: { status: 'SUPPRESSED', reason },
        });
        return null;
      }
      if (!this.transport.configured(row.channel))
        throw new Error('Provider not configured');
      const today = new Date(new Date().toISOString().slice(0, 10));
      if (!row.quotaDay || row.quotaDay.getTime() !== today.getTime()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${row.schoolId}),hashtext(${'notification-quota:' + row.channel + today.toISOString()}))`;
        await tx.notificationDailyUsage.createMany({
          data: [{ schoolId: row.schoolId, day: today, channel: row.channel }],
          skipDuplicates: true,
        });
        const limit = email
          ? settings!.emailDailyLimit
          : settings!.smsDailyLimit;
        const reserved = await tx.notificationDailyUsage.updateMany({
          where: {
            schoolId: row.schoolId,
            day: today,
            channel: row.channel,
            used: { lt: limit },
          },
          data: { used: { increment: 1 } },
        });
        if (!reserved.count) {
          await tx.notificationDelivery.update({
            where: { id },
            data: { status: 'SUPPRESSED', reason: 'DAILY_QUOTA_REACHED' },
          });
          return null;
        }
      }
      const payload =
        (row.payload as DeliveryPayload | null) ??
        deliveryPayload(
          row.channel,
          recipient!,
          email
            ? process.env.RESEND_FROM_EMAIL!
            : process.env.HUBTEL_SENDER_ID!,
          process.env.WEB_ORIGIN!,
        );
      await tx.notificationDelivery.update({
        where: { id },
        data: {
          status: 'SENDING',
          attempts: { increment: 1 },
          payload: payload as unknown as Prisma.InputJsonValue,
          recipientHash,
          quotaDay: today,
          reason: null,
        },
      });
      return { channel: row.channel, payload };
    });
    if (!prepared) return;
    const result = await this.transport.send(
      prepared.channel,
      id,
      prepared.payload,
    );
    if (result.state === 'ACCEPTED') {
      await this.prisma.client.notificationDelivery.updateMany({
        where: { id, status: 'SENDING' },
        data: {
          status: 'ACCEPTED',
          providerMessageId: result.messageId,
          acceptedAt: new Date(),
          nextPollAt: new Date(Date.now() + 60000),
          reason: null,
        },
      });
      await this.processEvents();
      return;
    }
    await this.prisma.client.notificationDelivery.updateMany({
      where: { id, status: 'SENDING' },
      data: {
        status: result.state === 'RETRY' ? 'PENDING' : result.state,
        reason: result.reason,
      },
    });
    if (result.state === 'RETRY')
      throw new Error('Retryable notification delivery failure');
  }
  async webhook(
    raw: Buffer | undefined,
    headers: Record<string, string | undefined>,
  ) {
    if (!process.env.RESEND_WEBHOOK_SECRET)
      throw new BadRequestException('Webhook not configured.');
    if (!raw || raw.length > 128 * 1024)
      throw new BadRequestException('Invalid webhook payload.');
    let event: unknown;
    try {
      new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(
        raw.toString('utf8'),
        headers as Record<string, string>,
      );
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook signature or timestamp.');
    }
    const parsed = z
      .object({
        type: z.string(),
        created_at: z.iso.datetime(),
        data: z.object({ email_id: z.string().min(1).max(200) }),
      })
      .safeParse(event);
    const eventId = headers['svix-id'];
    if (!parsed.success || !eventId || eventId.length > 200)
      throw new BadRequestException('Invalid delivery event.');
    if (!deliveryStateForEvent[parsed.data.type]) return { received: true };
    await this.prisma.client.notificationProviderEvent.createMany({
      data: [
        {
          id: 'resend:' + eventId,
          provider: 'RESEND',
          messageId: parsed.data.data.email_id,
          kind: parsed.data.type,
          eventAt: new Date(parsed.data.created_at),
        },
      ],
      skipDuplicates: true,
    });
    await this.processEvents();
    return { received: true };
  }
  async processEvents() {
    const events = await this.prisma.client.$queryRaw<
      Array<{ id: string; messageId: string; kind: string; eventAt: Date }>
    >`SELECT e.id,e."messageId",e.kind,e."eventAt" FROM notification_provider_events e JOIN notification_deliveries d ON d.provider=e.provider AND d."providerMessageId"=e."messageId" WHERE e."processedAt" IS NULL AND e.provider='RESEND' ORDER BY e."eventAt",e.id LIMIT 100`;
    for (const event of events)
      await this.prisma.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('notification-event'),hashtext(${event.messageId}))`;
        const fresh = await tx.notificationProviderEvent.findUniqueOrThrow({
          where: { id: event.id },
        });
        if (fresh.processedAt) return;
        const delivery = await tx.notificationDelivery.findUnique({
          where: {
            provider_providerMessageId: {
              provider: 'RESEND',
              providerMessageId: event.messageId,
            },
          },
        });
        if (!delivery) return;
        const next = deliveryStateForEvent[event.kind];
        if (advancesDelivery(delivery.status, next))
          await tx.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: next,
              deliveredAt: next === 'DELIVERED' ? event.eventAt : undefined,
              reason: next === 'BOUNCED' || next === 'COMPLAINED' ? next : null,
            },
          });
        if (
          ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(next) &&
          delivery.recipientHash
        )
          await tx.notificationSuppression.createMany({
            data: [
              {
                channel: 'EMAIL',
                recipientHash: delivery.recipientHash,
                reason: next,
              },
            ],
            skipDuplicates: true,
          });
        await tx.notificationProviderEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
      });
  }
  async preferences(schoolId: string, userId: string) {
    return (
      (await this.prisma.client.notificationPreference.findUnique({
        where: { schoolId_userId: { schoolId, userId } },
      })) ?? { emailEnabled: false, smsEnabled: false }
    );
  }
  async setPreferences(
    schoolId: string,
    userId: string,
    input: { emailEnabled: boolean; smsEnabled: boolean },
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const result = await tx.notificationPreference.upsert({
        where: { schoolId_userId: { schoolId, userId } },
        create: { schoolId, userId, ...input },
        update: { ...input, consentAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          userId,
          action: 'UPDATE',
          entityType: 'NOTIFICATION_PREFERENCES',
          entityId: result.id,
          newValues: input,
        },
      });
      return result;
    });
  }
  async settings(schoolId: string) {
    return {
      ...((await this.prisma.client.schoolNotificationSettings.findUnique({
        where: { schoolId },
      })) ?? {
        emailEnabled: false,
        smsEnabled: false,
        emailDailyLimit: 0,
        smsDailyLimit: 0,
      }),
      providers: {
        resend: this.transport.configured('EMAIL'),
        hubtel: this.transport.configured('SMS'),
      },
    };
  }
  async setSettings(
    schoolId: string,
    actorId: string,
    input: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      emailDailyLimit: number;
      smsDailyLimit: number;
    },
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const settings = await tx.schoolNotificationSettings.upsert({
        where: { schoolId },
        create: { schoolId, ...input },
        update: input,
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          userId: actorId,
          action: 'UPDATE',
          entityType: 'NOTIFICATION_SETTINGS',
          entityId: schoolId,
          newValues: input,
        },
      });
      return settings;
    });
  }
  async retryEmail(
    schoolId: string,
    actorId: string,
    id: string,
    reason: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM notification_deliveries WHERE id=${id} FOR UPDATE`;
      const row = await tx.notificationDelivery.findFirst({
        where: { id, schoolId },
      });
      if (!row) throw new NotFoundException('Delivery not found.');
      if (
        row.channel !== 'EMAIL' ||
        !['DEAD', 'FAILED'].includes(row.status) ||
        row.providerMessageId ||
        row.expiresAt <= new Date()
      )
        throw new BadRequestException(
          'Only unaccepted failed email within its original delivery window can be retried.',
        );
      const job = await tx.backgroundJob.updateMany({
        where: { id, status: { in: ['DEAD', 'SUCCEEDED'] } },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttempt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
          completedAt: null,
        },
      });
      if (!job.count)
        throw new BadRequestException('Delivery is still being processed.');
      await tx.notificationDelivery.update({
        where: { id },
        data: { status: 'PENDING', reason: 'ADMIN_RETRY' },
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          userId: actorId,
          action: 'UPDATE',
          entityType: 'NOTIFICATION_DELIVERY',
          entityId: id,
          newValues: { action: 'RETRY_EMAIL', reason },
        },
      });
      return { success: true };
    });
  }
  async history(schoolId: string, userId: string | undefined, page: number) {
    const where = { schoolId, ...(userId ? { userId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.client.notificationDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 25,
        take: 25,
        select: {
          id: true,
          channel: true,
          provider: true,
          status: true,
          attempts: true,
          reason: true,
          createdAt: true,
          updatedAt: true,
          acceptedAt: true,
          deliveredAt: true,
        },
      }),
      this.prisma.client.notificationDelivery.count({ where }),
    ]);
    return { items, total, page, limit: 25 };
  }
}
