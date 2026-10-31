import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DurableJobsService } from '../../common/jobs/durable-jobs.service.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { NotificationDeliveryAdminGuard } from './delivery-admin.guard.js';
import { SchoolSmsService } from './school-sms.service.js';
import {
  SchoolSmsController,
  SuperAdminSchoolSmsController,
} from './school-sms.controller.js';
import { NotificationDeliveryService } from './delivery.service.js';
import { SuperAdminService } from '../super-admin/super-admin.service.js';
import { CredentialsService } from '../accounts/credentials.service.js';
vi.mock('../../env.js', () => ({ env: { NODE_ENV: 'test' } }));
const url = process.env.TEST_DATABASE_URL ?? '',
  enabled = (() => {
    try {
      return /test/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  })();
describe.skipIf(!enabled)(
  'school-funded SMS isolation (PostgreSQL)',
  { timeout: 60000 },
  () => {
    const run = 'schoolsms-' + Date.now().toString(36),
      key = Buffer.alloc(32, 8).toString('base64'),
      ownerA = run + '-a',
      ownerB = run + '-b',
      reader = run + '-reader',
      platform = run + '-platform';
    const configA = {
        clientId: 'school-a-client',
        clientSecret: 'school-a-synthetic-secret',
        senderId: 'CampusA',
        apiBaseUrl: 'https://sms.hubtel.com/v1/messages' as const,
      },
      configB = {
        clientId: 'school-b-client',
        clientSecret: 'school-b-synthetic-secret',
        senderId: 'CampusB',
        apiBaseUrl: 'https://sms.hubtel.com/v1/messages' as const,
      };
    let db: PrismaClient,
      sms: SchoolSmsService,
      delivery: NotificationDeliveryService,
      app: INestApplication,
      schoolA = '',
      schoolB = '',
      acceptedA = '',
      acceptedB = '',
      oldA = '';
    let seq = 0;
    const transport = {
      configured: vi.fn(
        (channel: string, auth?: unknown) => channel === 'EMAIL' || !!auth,
      ),
      send: vi.fn().mockImplementation(async () => ({
        state: 'ACCEPTED',
        messageId: 'sms-' + ++seq,
      })),
      smsStatus: vi.fn().mockResolvedValue('DELIVERED'),
    };
    const actor = (id: string) => ({ id, ipAddress: null, userAgent: null });
    async function notification(schoolId: string, userId: string) {
      const n = await db.notification.create({
        data: {
          schoolId,
          userId,
          type: 'ANNOUNCEMENT',
          title: 'School update',
          message: 'Private pupil details',
        },
      });
      return db.notificationDelivery.findFirst({
        where: { notificationId: n.id, channel: 'SMS' },
      });
    }
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', key);
      vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'true');
      vi.stubEnv('WEB_ORIGIN', 'https://portal.example.test');
      vi.stubEnv('NODE_ENV', 'test');
      db = (await import('../../prisma/prisma.client.js')).prisma;
      await db.user.createMany({
        data: [ownerA, ownerB, reader, platform].map((id) => ({
          id,
          name: id,
          email: id + '@example.test',
          emailVerified: true,
          twoFactorEnabled: true,
          role: id === platform ? 'superAdmin' : 'user',
        })),
      });
      for (const [suffix, userId] of [
        ['a', ownerA],
        ['b', ownerB],
      ]) {
        const org = run + '-' + suffix;
        await db.organization.create({
          data: { id: org, slug: org, name: org, subscriptionStatus: 'ACTIVE' },
        });
        const school = await db.school.create({
          data: { organizationId: org, name: org, code: org, subdomain: org },
        });
        if (suffix === 'a') schoolA = school.id;
        else schoolB = school.id;
        await db.member.create({
          data: { id: org, userId, organizationId: org, role: 'owner' },
        });
        await db.userProfile.create({
          data: {
            userId,
            firstName: 'Owner',
            lastName: suffix,
            phone: suffix === 'a' ? '0241234567' : '0541234567',
          },
        });
      }
      await db.member.create({
        data: {
          id: reader,
          userId: reader,
          organizationId: run + '-a',
          role: 'headteacher',
        },
      });
      const prisma = { client: db } as never;
      sms = new SchoolSmsService(prisma);
      delivery = new NotificationDeliveryService(
        prisma,
        new DurableJobsService(prisma),
        transport as never,
        sms,
      );
      const module = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            { name: 'default', limit: 100, ttl: 60000 },
          ]),
        ],
        controllers: [SchoolSmsController, SuperAdminSchoolSmsController],
        providers: [
          SchoolTenantGuard,
          RolesGuard,
          SuperAdminGuard,
          NotificationDeliveryAdminGuard,
          { provide: PrismaService, useValue: { client: db } },
          { provide: SchoolSmsService, useValue: sms },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useLogger(false);
      app.use(async (req: any, _res: unknown, next: () => void) => {
        const id = req.headers['x-test-user'];
        if (typeof id === 'string')
          req.session = {
            user: await db.user.findUnique({ where: { id } }),
            session: {
              activeOrganizationId: id === ownerB ? run + '-b' : run + '-a',
            },
          };
        next();
      });
      await app.init();
    });
    it('requires a school account and never enables SMS against platform credentials', async () => {
      expect((await sms.status(schoolA)).configured).toBe(false);
      await expect(
        delivery.setSettings(schoolA, ownerA, {
          emailEnabled: false,
          smsEnabled: true,
          emailDailyLimit: 0,
          smsDailyLimit: 100,
        }),
      ).rejects.toThrow(/Connect/);
      await delivery.setPreferences(schoolA, ownerA, {
        emailEnabled: false,
        smsEnabled: true,
      });
      expect(await notification(schoolA, ownerA)).toBeNull();
    });
    it('stores encrypted school keys and returns only masked metadata, with audited connection changes', async () => {
      const response = await request(app.getHttpServer())
        .put(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .set('x-test-user', ownerA)
        .send(configA)
        .expect(200);
      expect(response.body).toMatchObject({
        configured: true,
        ready: true,
        senderId: 'CampusA',
        billing: 'SCHOOL_HUBTEL_ACCOUNT',
      });
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(configA.clientId);
      expect(serialized).not.toContain(configA.clientSecret);
      expect(serialized).not.toContain('encryptedCredentials');
      const settings = await db.schoolNotificationSettings.findUniqueOrThrow({
        where: { schoolId: schoolA },
      });
      oldA = settings.smsConnectionId!;
      const stored = await db.schoolSmsConnection.findUniqueOrThrow({
        where: { id: oldA },
      });
      expect(stored.encryptedCredentials).not.toContain(configA.clientSecret);
      expect(stored.encryptedCredentials).not.toContain(configA.clientId);
      expect(settings.smsEnabled).toBe(false);
      expect(await sms.resolve(schoolB, oldA)).toBeNull();
      const audits = await db.auditLog.findMany({
        where: { schoolId: schoolA, entityType: 'school.sms.connected' },
      });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits)).not.toContain(configA.clientSecret);
      await sms.save(schoolB, actor(ownerB), configB);
      await delivery.setPreferences(schoolB, ownerB, {
        emailEnabled: false,
        smsEnabled: true,
      });
      for (const [schoolId, userId] of [
        [schoolA, ownerA],
        [schoolB, ownerB],
      ])
        await delivery.setSettings(schoolId, userId, {
          emailEnabled: false,
          smsEnabled: true,
          emailDailyLimit: 0,
          smsDailyLimit: 100,
        });
    });
    it('blocks cross-school, unauthenticated, headteacher and forged administrative access', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .expect(401);
      await request(app.getHttpServer())
        .get(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .set('x-test-user', reader)
        .expect(403);
      await request(app.getHttpServer())
        .put(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .set('x-test-user', reader)
        .send(configA)
        .expect(403);
      await request(app.getHttpServer())
        .get(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .set('x-test-user', ownerA)
        .set('x-school-subdomain', run + '-b')
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/super-admin/schools/${schoolB}/sms`)
        .set('x-test-user', ownerA)
        .send(configA)
        .expect(403);
      const result = await request(app.getHttpServer())
        .get(`/api/super-admin/schools/${schoolB}/sms`)
        .set('x-test-user', platform)
        .expect(200);
      expect(result.body.senderId).toBe('CampusB');
      expect(JSON.stringify(result.body)).not.toContain(configB.clientSecret);
      await request(app.getHttpServer())
        .get('/api/super-admin/schools/missing/sms')
        .set('x-test-user', platform)
        .expect(404);
      await request(app.getHttpServer())
        .get(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-a',
        )
        .set('x-test-user', reader)
        .set('x-school-role', 'admin')
        .expect(403);
    });
    it('rejects stale account forms even when the same user owns both schools', async () => {
      const member = run + '-multi';
      await db.member.create({
        data: {
          id: member,
          userId: ownerA,
          organizationId: run + '-b',
          role: 'owner',
        },
      });
      try {
        for (const method of ['get', 'put', 'delete'] as const) {
          let req = request(app.getHttpServer())
            [method](
              '/api/notifications/delivery/sms-account?organizationId=' +
                run +
                '-a',
            )
            .set('x-test-user', ownerA)
            .set('x-school-subdomain', run + '-b');
          if (method === 'put') req = req.send(configA);
          await req.expect(403);
        }
        const response = await request(app.getHttpServer())
          .get(
            '/api/notifications/delivery/sms-account?organizationId=' +
              run +
              '-b',
          )
          .set('x-test-user', ownerA)
          .set('x-school-subdomain', run + '-b')
          .expect(200);
        expect(response.body.senderId).toBe('CampusB');
      } finally {
        await db.member.delete({ where: { id: member } });
      }
    });
    it('pins each delivery to its school account, brands the sender and permits account-local provider IDs', async () => {
      const a = (await notification(schoolA, ownerA))!,
        b = (await notification(schoolB, ownerB))!;
      acceptedA = a.id;
      acceptedB = b.id;
      expect(a.smsConnectionId).toBe(oldA);
      transport.send
        .mockResolvedValueOnce({
          state: 'ACCEPTED',
          messageId: 'same-account-local-id',
        })
        .mockResolvedValueOnce({
          state: 'ACCEPTED',
          messageId: 'same-account-local-id',
        });
      await delivery.dispatch(a.id);
      await delivery.dispatch(b.id);
      const calls = transport.send.mock.calls;
      expect(calls[calls.length - 2]![3]).toMatchObject(configA);
      expect(calls[calls.length - 1]![3]).toMatchObject(configB);
      expect(calls[calls.length - 2]![2].from).toBe('CampusA');
      expect(calls[calls.length - 1]![2].from).toBe('CampusB');
      const rows = await db.notificationDelivery.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      expect(rows.every((row) => row.status === 'ACCEPTED')).toBe(true);
      expect(rows[0]!.providerScope).not.toBe(rows[1]!.providerScope);
      expect(JSON.stringify(rows)).not.toContain(configA.clientSecret);
      expect(JSON.stringify(rows)).not.toContain(configB.clientSecret);
      expect(JSON.stringify(rows[0]!.payload)).not.toContain('Private pupil');
      await expect(
        db.notificationDelivery.update({
          where: { id: a.id },
          data: { smsConnectionId: b.smsConnectionId },
        }),
      ).rejects.toThrow(/immutable/);
    });
    it('suppresses queued work after account replacement and polls accepted messages with their original account', async () => {
      const queued = (await notification(schoolA, ownerA))!;
      await sms.save(schoolA, actor(ownerA), {
        ...configA,
        clientId: 'replacement-client',
        clientSecret: 'replacement-synthetic-secret',
        senderId: 'NewCampusA',
      });
      expect(
        (
          await db.schoolNotificationSettings.findUniqueOrThrow({
            where: { schoolId: schoolA },
          })
        ).smsEnabled,
      ).toBe(false);
      await delivery.setSettings(schoolA, ownerA, {
        emailEnabled: false,
        smsEnabled: true,
        emailDailyLimit: 0,
        smsDailyLimit: 100,
      });
      transport.send.mockClear();
      await delivery.dispatch(queued.id);
      expect(transport.send).not.toHaveBeenCalled();
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: queued.id },
          })
        ).status,
      ).toBe('SUPPRESSED');
      await db.notificationDelivery.updateMany({
        where: { id: { in: [acceptedA, acceptedB] } },
        data: { nextPollAt: new Date(Date.now() - 1000) },
      });
      await delivery.tick();
      const statuses = transport.smsStatus.mock.calls;
      expect(
        statuses.some((call) => call[1]?.clientId === configA.clientId),
      ).toBe(true);
      expect(
        statuses.some((call) => call[1]?.clientId === configB.clientId),
      ).toBe(true);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: acceptedA },
          })
        ).status,
      ).toBe('DELIVERED');
    });
    it('disconnects only the selected school, erases its versions and stops pending sends', async () => {
      const queued = (await notification(schoolB, ownerB))!;
      await request(app.getHttpServer())
        .delete(
          '/api/notifications/delivery/sms-account?organizationId=' +
            run +
            '-b',
        )
        .set('x-test-user', ownerB)
        .expect(200);
      expect((await sms.status(schoolB)).configured).toBe(false);
      expect((await sms.status(schoolA)).configured).toBe(true);
      expect(
        await db.schoolSmsConnection.count({
          where: { schoolId: schoolB, encryptedCredentials: { not: null } },
        }),
      ).toBe(0);
      expect(
        (
          await db.notificationDelivery.findUniqueOrThrow({
            where: { id: queued.id },
          })
        ).status,
      ).toBe('SUPPRESSED');
      await expect(
        delivery.setSettings(schoolB, ownerB, {
          emailEnabled: false,
          smsEnabled: true,
          emailDailyLimit: 0,
          smsDailyLimit: 100,
        }),
      ).rejects.toThrow(/Connect/);
    });
    it('fails closed on missing encryption keys and enrolls a school plus optional SMS settings atomically', async () => {
      const service = new SuperAdminService(
          { client: db } as never,
          new CredentialsService(),
        ),
        input = {
          schoolName: 'Campus C',
          schoolCode: (run + '-C').toUpperCase(),
          subdomain: run + '-c',
          adminName: 'Owner C',
          adminEmail: run + '-newowner@example.test',
          smsConnection: { ...configA, senderId: 'CampusC' },
        };
      vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', '');
      await expect(
        service.enrollSchool(input, actor(platform)),
      ).rejects.toThrow(/encryption/);
      expect(
        await db.school.count({ where: { subdomain: input.subdomain } }),
      ).toBe(0);
      expect(await db.user.count({ where: { email: input.adminEmail } })).toBe(
        0,
      );
      vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', key);
      const result = await service.enrollSchool(input, actor(platform));
      expect((await sms.status(result.school.id)).senderId).toBe('CampusC');
      expect(
        (
          await db.schoolNotificationSettings.findUniqueOrThrow({
            where: { schoolId: result.school.id },
          })
        ).smsEnabled,
      ).toBe(false);
      expect(JSON.stringify(result)).not.toContain(configA.clientSecret);
    });
    it('erases retired secrets after the receipt retention window while keeping active keys', async () => {
      await db.schoolSmsConnection.update({
        where: { id: oldA },
        data: { retiredAt: new Date(Date.now() - 9 * 86400000) },
      });
      await sms.eraseRetired();
      expect(
        (
          await db.schoolSmsConnection.findUniqueOrThrow({
            where: { id: oldA },
          })
        ).encryptedCredentials,
      ).toBeNull();
      expect((await sms.status(schoolA)).ready).toBe(true);
    });
    afterAll(async () => {
      await app?.close();
      vi.unstubAllEnvs();
      if (!db) return;
      const schools = await db.school.findMany({
          where: { subdomain: { startsWith: run } },
          select: { id: true, organizationId: true },
        }),
        ids = schools.map((row) => row.id);
      const users = await db.user.findMany({
        where: {
          OR: [{ id: { startsWith: run } }, { email: { startsWith: run } }],
        },
        select: { id: true },
      });
      await db.$transaction(async (tx) => {
        await tx.backgroundJob.deleteMany({ where: { schoolId: { in: ids } } });
        await tx.notificationDelivery.deleteMany({
          where: { schoolId: { in: ids } },
        });
        await tx.notificationPreference.deleteMany({
          where: { schoolId: { in: ids } },
        });
        await tx.notificationDailyUsage.deleteMany({
          where: { schoolId: { in: ids } },
        });
        await tx.schoolNotificationSettings.deleteMany({
          where: { schoolId: { in: ids } },
        });
        await tx.schoolSmsConnection.deleteMany({
          where: { schoolId: { in: ids } },
        });
        await tx.auditLog.deleteMany({ where: { schoolId: { in: ids } } });
        await tx.notification.deleteMany({ where: { schoolId: { in: ids } } });
        await tx.organization.deleteMany({
          where: { id: { in: schools.map((row) => row.organizationId) } },
        });
        await tx.user.deleteMany({
          where: { id: { in: users.map((user) => user.id) } },
        });
      });
      await db.$disconnect();
    });
  },
);
