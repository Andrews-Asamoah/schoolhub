import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DurableJobsService } from '../../common/jobs/durable-jobs.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  MobilePushService,
  mobileDeviceSchema,
} from './mobile-push.service.js';

const url = process.env.TEST_DATABASE_URL ?? '';
const isTestDatabase = /\/[^/?]*test[^/?]*(?:\?|$)/i.test(url);

describe.skipIf(!isTestDatabase)('mobile push outbox (PostgreSQL)', () => {
  const key = 'push-' + randomUUID();
  const userId = key + '-user';
  const sessionId = key + '-session';
  const schoolId = key + '-school';
  const binding = { schoolId, userId, sessionId, role: 'teacher' };
  const installation = { token: `ExpoPushToken[${key}]` };
  let db: PrismaClient;
  let push: MobilePushService;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('EXPO_PUSH_ACCESS_TOKEN', 'test-expo-access-key');
    db = (await import('../../prisma/prisma.client.js')).prisma;
    const prisma = { client: db } as PrismaService;
    push = new MobilePushService(prisma, new DurableJobsService(prisma));
    await db.user.create({
      data: {
        id: userId,
        name: 'Fixture user',
        email: `${userId}@example.test`,
      },
    });
    await db.session.create({
      data: {
        id: sessionId,
        userId,
        token: key + '-bearer',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.organization.create({
      data: {
        id: key,
        slug: key,
        name: 'Fixture school',
        subscriptionStatus: 'ACTIVE',
      },
    });
    await db.school.create({
      data: {
        id: schoolId,
        organizationId: key,
        subdomain: key,
        code: key,
        name: 'Fixture school',
      },
    });
    await db.member.create({
      data: {
        id: key,
        organizationId: key,
        userId,
        role: 'teacher',
        roles: ['guardian'],
      },
    });
  });

  afterAll(async () => {
    if (db) {
      await db.backgroundJob.deleteMany({ where: { schoolId } });
      await db.school.deleteMany({ where: { id: schoolId } });
      await db.organization.deleteMany({ where: { id: key } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects an invalid token without accepting a body-supplied identity', () => {
    expect(mobileDeviceSchema.safeParse({ token: 'invalid' }).success).toBe(
      false,
    );
    expect(
      mobileDeviceSchema.safeParse({ ...installation, schoolId }).success,
    ).toBe(false);
  });

  it('delivers tenant-scoped generic alerts and removes a retired provider token', async () => {
    const { registrationId } = await push.register(binding, installation);
    expect(await push.register(binding, installation)).toEqual({
      registrationId,
    });
    await push.remove({ ...binding, role: 'guardian' }, registrationId);
    expect(await db.deviceToken.count({ where: { registrationId } })).toBe(1);

    const createNotification = (
      id: string,
      link: string | null,
      tx: Pick<PrismaClient, 'notification'> = db,
    ) =>
      tx.notification.create({
        data: {
          id,
          schoolId,
          userId,
          link,
          type: 'GENERAL',
          title: 'Private pupil details',
          message: 'Private message',
        },
      });
    await expect(
      db.$transaction(async (tx) => {
        await createNotification(key + '-rolled-back', null, tx);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await createNotification(key + '-external', '/external-exams');
    await createNotification(key + '-send', '/announcements');
    expect(await db.backgroundJob.count({ where: { schoolId } })).toBe(1);

    const expo = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { status: 'ok', id: 'test-ticket' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            'test-ticket': {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        }),
      );
    vi.stubGlobal('fetch', expo);
    await push.tick();
    expect(expo).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(expo.mock.calls[0]![1].body);
    expect(payload).toEqual({
      to: installation.token,
      title: 'SchoolHub',
      body: 'You have a new school update.',
      channelId: 'schoolhub-updates',
      ttl: 86400,
      data: { screen: 'school-updates', registrationId },
    });
    await push.tick(new Date(Date.now() + 16 * 60_000));
    expect(expo).toHaveBeenCalledTimes(2);
    expect(await db.deviceToken.count({ where: { registrationId } })).toBe(0);
  });

  it('keeps old queued alerts from following a token into a changed role or expired session', async () => {
    const first = await push.register(binding, installation);
    await db.notification.create({
      data: {
        schoolId,
        userId,
        type: 'GENERAL',
        title: 'Private',
        message: 'Private',
      },
    });
    const second = await push.register(
      { ...binding, role: 'guardian' },
      installation,
    );
    expect(second.registrationId).not.toBe(first.registrationId);
    await push.remove(binding, first.registrationId);
    expect(
      await db.deviceToken.count({
        where: { registrationId: second.registrationId },
      }),
    ).toBe(1);
    const expo = vi.fn();
    vi.stubGlobal('fetch', expo);
    await push.tick();
    expect(expo).not.toHaveBeenCalled();

    await db.session.delete({ where: { id: sessionId } });
    expect(
      await db.deviceToken.count({
        where: { registrationId: second.registrationId },
      }),
    ).toBe(0);
  });
});
