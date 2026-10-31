import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Webhook } from 'svix';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { NotificationDeliveryController } from './delivery.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { NotificationDeliveryService } from './delivery.service.js';
import { DurableJobsService } from '../../common/jobs/durable-jobs.service.js';
vi.mock('../../env.js', () => ({ env: { NODE_ENV: 'test' } }));
const url = process.env.TEST_DATABASE_URL ?? '';
const enabled = (() => {
  try {
    return /test/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
})();
describe.skipIf(!enabled)(
  'durable external notifications (PostgreSQL)',
  { timeout: 60000 },
  () => {
    let db: PrismaClient,
      service: NotificationDeliveryService,
      app: INestApplication,
      schoolId = '';
    const run = 'notify-' + Date.now().toString(36),
      userId = run + '-user';
    let seq = 0;
    const transport = {
      configured: vi.fn(() => true),
      send: vi.fn(),
      smsStatus: vi.fn(),
    };
    const secret =
      'whsec_' +
      Buffer.from('test-signing-key-not-a-real-credential').toString('base64');
    const delivery = async (channel = 'EMAIL') => {
      const note = await db.notification.create({
        data: {
          schoolId,
          userId,
          type: 'ANNOUNCEMENT',
          title: 'Private pupil information',
          message: 'Private fee amount',
        },
      });
      return db.notificationDelivery.findFirstOrThrow({
        where: { notificationId: note.id, channel },
      });
    };
    const accept = () =>
      transport.send.mockImplementation(async () => ({
        state: 'ACCEPTED',
        messageId: run + '-message-' + ++seq,
      }));
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      vi.stubEnv('WEB_ORIGIN', 'https://portal.example.test');
      vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
      vi.stubEnv('HUBTEL_SENDER_ID', 'SchoolHub');
      vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
      db = (await import('../../prisma/prisma.client.js')).prisma;
      await db.user.create({
        data: {
          id: userId,
          name: 'Recipient',
          email: userId + '@example.test',
          emailVerified: true,
          twoFactorEnabled: true,
        },
      });
      await db.organization.create({
        data: { id: run, name: run, slug: run, subscriptionStatus: 'ACTIVE' },
      });
      schoolId = (
        await db.school.create({
          data: { organizationId: run, name: run, code: run, subdomain: run },
        })
      ).id;
      await db.member.create({
        data: { id: run, userId, organizationId: run, role: 'owner' },
      });
      await db.userProfile.create({
        data: {
          userId,
          firstName: 'Test',
          lastName: 'User',
          phone: '0241234567',
        },
      });
      const prisma = { client: db } as never;
      service = new NotificationDeliveryService(
        prisma,
        new DurableJobsService(prisma),
        transport as never,
      );
      const module = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            { name: 'default', ttl: 60000, limit: 120 },
          ]),
        ],
        controllers: [NotificationDeliveryController],
        providers: [
          SchoolTenantGuard,
          RolesGuard,
          { provide: PrismaService, useValue: { client: db } },
          { provide: NotificationDeliveryService, useValue: service },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useLogger(false);
      app.use(async (req: any, _res: unknown, next: () => void) => {
        if (req.headers['x-test-user'])
          req.session = {
            user: await db.user.findUnique({ where: { id: userId } }),
            session: { activeOrganizationId: run },
          };
        next();
      });
      await app.init();
    });
    it('enforces authentication, school scope, admin roles, and bounded settings at HTTP routes', async () => {
      await request(app.getHttpServer())
        .get('/api/notifications/delivery/preferences')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/notifications/delivery/settings')
        .set('x-test-user', 'yes')
        .expect(200);
      await request(app.getHttpServer())
        .patch('/api/notifications/delivery/settings')
        .set('x-test-user', 'yes')
        .send({
          emailEnabled: true,
          smsEnabled: true,
          emailDailyLimit: -1,
          smsDailyLimit: 10,
        })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/notifications/delivery/settings')
        .set('x-test-user', 'yes')
        .set('x-school-subdomain', 'nonexistent-school')
        .expect(404);
      await db.member.update({
        where: { id: run },
        data: { role: 'guardian' },
      });
      await request(app.getHttpServer())
        .get('/api/notifications/delivery/preferences')
        .set('x-test-user', 'yes')
        .expect(200);
      for (const path of ['settings', 'school-history'])
        await request(app.getHttpServer())
          .get('/api/notifications/delivery/' + path)
          .set('x-test-user', 'yes')
          .expect(403);
      await request(app.getHttpServer())
        .post('/api/notifications/delivery/missing/retry')
        .set('x-test-user', 'yes')
        .send({ reason: 'Test retry permissions' })
        .expect(403);
      await db.member.update({ where: { id: run }, data: { role: 'owner' } });
    });
    it('does not backfill historical notifications or enqueue without both levels of consent', async () => {
      const note = await db.notification.create({
        data: {
          schoolId,
          userId,
          type: 'ANNOUNCEMENT',
          title: 'old',
          message: 'old',
        },
      });
      await service.setSettings(schoolId, userId, {
        emailEnabled: true,
        smsEnabled: true,
        emailDailyLimit: 100,
        smsDailyLimit: 100,
      });
      expect(
        await db.notificationDelivery.count({
          where: { notificationId: note.id },
        }),
      ).toBe(0);
      await service.setPreferences(schoolId, userId, {
        emailEnabled: true,
        smsEnabled: true,
      });
      expect(
        await db.notificationDelivery.count({
          where: { notificationId: note.id },
        }),
      ).toBe(0);
    });
    it('commits the notification, outbox and job together and rolls all three back on failure', async () => {
      let id = '';
      await expect(
        db.$transaction(async (tx) => {
          const n = await tx.notification.create({
            data: {
              schoolId,
              userId,
              type: 'ANNOUNCEMENT',
              title: 'rollback',
              message: 'test',
            },
          });
          id = n.id;
          expect(
            await tx.notificationDelivery.count({
              where: { notificationId: id },
            }),
          ).toBe(2);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await db.notification.count({ where: { id } })).toBe(0);
      expect(
        await db.notificationDelivery.count({ where: { notificationId: id } }),
      ).toBe(0);
      const row = await delivery();
      expect(
        await db.backgroundJob.findUnique({ where: { id: row.id } }),
      ).toMatchObject({ kind: 'notification-delivery', status: 'PENDING' });
    });
    it('reserves quota once, persists generic immutable payload, and avoids duplicate accepted sends', async () => {
      const row = await delivery();
      transport.send.mockResolvedValueOnce({
        state: 'RETRY',
        reason: 'PROVIDER_RATE_LIMIT',
      });
      await expect(service.dispatch(row.id)).rejects.toThrow();
      const prepared = await db.notificationDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      const before = await db.notificationDailyUsage.findFirstOrThrow({
        where: { schoolId, channel: 'EMAIL' },
      });
      accept();
      await service.dispatch(row.id);
      await service.dispatch(row.id);
      const after = await db.notificationDailyUsage.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(after.used).toBe(before.used);
      expect(JSON.stringify(prepared.payload)).not.toContain('Private');
      expect(
        await db.notificationDelivery.findUnique({ where: { id: row.id } }),
      ).toMatchObject({ status: 'ACCEPTED', attempts: 2 });
      await expect(
        db.notificationDelivery.update({
          where: { id: row.id },
          data: { payload: { text: 'changed' } },
        }),
      ).rejects.toThrow(/immutable/);
    });
    it('recovers crashed email with its stored payload but marks crashed SMS unknown', async () => {
      for (const channel of ['EMAIL', 'SMS']) {
        const row = await delivery(channel);
        await db.notificationDelivery.update({
          where: { id: row.id },
          data: { status: 'SENDING' },
        });
        transport.send.mockClear();
        accept();
        await service.dispatch(row.id);
        expect(
          (
            await db.notificationDelivery.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).status,
        ).toBe(channel === 'EMAIL' ? 'ACCEPTED' : 'UNKNOWN');
        expect(transport.send).toHaveBeenCalledTimes(
          channel === 'EMAIL' ? 1 : 0,
        );
      }
    });
    it('rechecks membership, consent and changed contacts immediately before sending', async () => {
      for (const kind of ['membership', 'consent', 'contact']) {
        const row = await delivery();
        if (kind === 'membership')
          await db.member.update({
            where: { id: run },
            data: { banned: true },
          });
        if (kind === 'consent')
          await service.setPreferences(schoolId, userId, {
            emailEnabled: false,
            smsEnabled: true,
          });
        if (kind === 'contact')
          await db.user.update({
            where: { id: userId },
            data: { email: 'changed@example.test' },
          });
        transport.send.mockClear();
        await service.dispatch(row.id);
        expect(transport.send).not.toHaveBeenCalled();
        expect(
          (
            await db.notificationDelivery.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).status,
        ).toBe('SUPPRESSED');
        await db.member.update({ where: { id: run }, data: { banned: false } });
        await service.setPreferences(schoolId, userId, {
          emailEnabled: true,
          smsEnabled: true,
        });
        await db.user.update({
          where: { id: userId },
          data: { email: userId + '@example.test' },
        });
      }
    });
    it('enforces hard daily quotas under concurrent reservations', async () => {
      const day = new Date(new Date().toISOString().slice(0, 10));
      const used = (
        await db.notificationDailyUsage.findUniqueOrThrow({
          where: { schoolId_day_channel: { schoolId, day, channel: 'EMAIL' } },
        })
      ).used;
      await service.setSettings(schoolId, userId, {
        emailEnabled: true,
        smsEnabled: true,
        emailDailyLimit: used + 1,
        smsDailyLimit: 100,
      });
      const rows = await Promise.all([delivery(), delivery()]);
      accept();
      await Promise.all(rows.map((row) => service.dispatch(row.id)));
      const statuses = (
        await db.notificationDelivery.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
        })
      )
        .map((row) => row.status)
        .sort();
      expect(statuses).toEqual(['ACCEPTED', 'SUPPRESSED']);
      await service.setSettings(schoolId, userId, {
        emailEnabled: true,
        smsEnabled: true,
        emailDailyLimit: 100,
        smsDailyLimit: 100,
      });
    });
    it('does not resend uncertain SMS or expose contacts and content in history', async () => {
      const row = await delivery('SMS');
      transport.send.mockResolvedValue({
        state: 'UNKNOWN',
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
      });
      await service.dispatch(row.id);
      transport.send.mockClear();
      await service.dispatch(row.id);
      expect(transport.send).not.toHaveBeenCalled();
      await expect(
        service.retryEmail(
          schoolId,
          userId,
          row.id,
          'Investigated provider timeout',
        ),
      ).rejects.toThrow();
      const history = JSON.stringify(
        await service.history(schoolId, userId, 1),
      );
      expect(history).not.toContain('recipient');
      expect(history).not.toContain('Private pupil');
      expect(history).not.toContain('0241234567');
    });
    function signed(
      messageId: string,
      type: string,
      id = run + '-event-' + ++seq,
      date = new Date(),
    ) {
      const raw = Buffer.from(
        JSON.stringify({
          type,
          created_at: new Date().toISOString(),
          data: { email_id: messageId },
        }),
      );
      return {
        raw,
        headers: {
          'svix-id': id,
          'svix-timestamp': String(Math.floor(date.getTime() / 1000)),
          'svix-signature': new Webhook(secret).sign(id, date, raw.toString()),
        },
      };
    }
    it('rejects forged, modified and stale signatures before persistence', async () => {
      const event = signed('missing', 'email.delivered');
      const count = await db.notificationProviderEvent.count();
      await expect(
        service.webhook(event.raw, {
          ...event.headers,
          'svix-signature': 'bad',
        }),
      ).rejects.toThrow(/signature/);
      await expect(
        service.webhook(Buffer.from('{}'), event.headers),
      ).rejects.toThrow(/signature/);
      const stale = signed(
        'missing',
        'email.delivered',
        run + '-stale',
        new Date(Date.now() - 600000),
      );
      await expect(service.webhook(stale.raw, stale.headers)).rejects.toThrow(
        /timestamp/,
      );
      expect(await db.notificationProviderEvent.count()).toBe(count);
    });
    it('deduplicates signed events, handles early receipts and prevents state downgrade', async () => {
      const row = await delivery();
      const messageId = run + '-early';
      const event = signed(messageId, 'email.delivered');
      await service.webhook(event.raw, event.headers);
      await service.webhook(event.raw, event.headers);
      transport.send.mockResolvedValue({ state: 'ACCEPTED', messageId });
      await service.dispatch(row.id);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('DELIVERED');
      const delayed = signed(messageId, 'email.delivery_delayed');
      await service.webhook(delayed.raw, delayed.headers);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('DELIVERED');
      expect(
        await db.notificationProviderEvent.count({
          where: { id: 'resend:' + event.headers['svix-id'] },
        }),
      ).toBe(1);
    });
    it('audits safe email replay, preserving payload/key and enforcing school scope', async () => {
      const row = await delivery();
      transport.send.mockResolvedValue({
        state: 'FAILED',
        reason: 'PROVIDER_REJECTED',
      });
      await service.dispatch(row.id);
      await db.backgroundJob.update({
        where: { id: row.id },
        data: { status: 'SUCCEEDED' },
      });
      await expect(
        service.retryEmail(
          'another-school',
          userId,
          row.id,
          'Fixed sender configuration',
        ),
      ).rejects.toThrow(/not found/);
      await service.retryEmail(
        schoolId,
        userId,
        row.id,
        'Fixed sender configuration',
      );
      accept();
      await service.dispatch(row.id);
      expect(
        await db.auditLog.count({
          where: {
            schoolId,
            entityId: row.id,
            entityType: 'NOTIFICATION_DELIVERY',
          },
        }),
      ).toBe(1);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).status,
      ).toBe('ACCEPTED');
    });
    it('suppresses future sends after a verified bounce and expires unsent old notifications', async () => {
      const row = await delivery();
      const messageId = run + '-bounce';
      transport.send.mockResolvedValue({ state: 'ACCEPTED', messageId });
      await service.dispatch(row.id);
      const event = signed(messageId, 'email.bounced');
      await service.webhook(event.raw, event.headers);
      const next = await delivery();
      transport.send.mockClear();
      await service.dispatch(next.id);
      expect(transport.send).not.toHaveBeenCalled();
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: next.id },
          })
        ).reason,
      ).toBe('CONTACT_SUPPRESSED');
      const old = await db.notification.create({
        data: {
          schoolId,
          userId,
          type: 'ANNOUNCEMENT',
          title: 'old',
          message: 'old',
          createdAt: new Date(Date.now() - 24 * 3600000),
        },
      });
      const expired = await db.notificationDelivery.findFirstOrThrow({
        where: { notificationId: old.id, channel: 'EMAIL' },
      });
      await service.dispatch(expired.id);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: expired.id },
          })
        ).status,
      ).toBe('EXPIRED');
    });
    afterAll(async () => {
      await app?.close();
      vi.unstubAllEnvs();
      if (!db) return;
      await db.$transaction(async (tx) => {
        await tx.notificationProviderEvent.deleteMany({
          where: { id: { startsWith: 'resend:' + run } },
        });
        const contacts = await tx.notificationDelivery.findMany({
          where: { schoolId },
          select: { recipientHash: true },
        });
        await tx.notificationSuppression.deleteMany({
          where: {
            recipientHash: {
              in: contacts.flatMap((row) =>
                row.recipientHash ? [row.recipientHash] : [],
              ),
            },
          },
        });
        await tx.backgroundJob.deleteMany({ where: { schoolId } });
        await tx.notificationDelivery.deleteMany({ where: { schoolId } });
        await tx.notificationDailyUsage.deleteMany({ where: { schoolId } });
        await tx.notificationPreference.deleteMany({ where: { schoolId } });
        await tx.schoolNotificationSettings.deleteMany({ where: { schoolId } });
        await tx.auditLog.deleteMany({ where: { schoolId } });
        await tx.notification.deleteMany({ where: { schoolId } });
        await tx.organization.delete({ where: { id: run } });
        await tx.user.delete({ where: { id: userId } });
      });
      await db.$disconnect();
    });
  },
);
