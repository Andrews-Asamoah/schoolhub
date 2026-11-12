/** Real Better Auth + migrated PostgreSQL; synthetic accounts only. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SchoolTenantGuard } from '../src/common/guards/school-tenant.guard.js';
import { SyncDeviceService } from '../src/modules/sync/sync-device.service.js';
import { SuperAdminGuard } from '../src/common/guards/super-admin.guard.js';

const database = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const password = 'D3sktop-Synthetic!Pass';
const version = '0.1.0';

describe.skipIf(!database)(
  'desktop session and entitlement (real database)',
  () => {
    let prisma: any;
    let auth: any;
    let userId: string;
    let orgId: string;
    let schoolId: string;
    let planId: string;
    let token: string;
    const email = `desktop-${suffix}@synthetic.test`;
    let counter = 10;

    async function call(
      path: string,
      body?: unknown,
      desktop = true,
      clientVersion = version,
      bearer?: string,
    ) {
      const headers = new Headers({
        'content-type': 'application/json',
        'x-forwarded-for': `10.40.0.${++counter}`,
      });
      if (desktop) {
        headers.set('x-schoolhub-client', 'desktop');
        headers.set('x-schoolhub-client-version', clientVersion);
      }
      if (bearer) headers.set('authorization', `Bearer ${bearer}`);
      return auth.handler(
        new Request(`http://localhost:3001/api/auth${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    }
    async function session(bearer = token) {
      const response = await call(
        '/get-session',
        undefined,
        false,
        version,
        bearer,
      );
      expect(response.status).toBe(200);
      return response.json();
    }
    function context(identity: any, headers: Record<string, string> = {}) {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            session: identity,
            headers: {
              'x-school-subdomain': `desktop-${suffix}`,
              'x-schoolhub-client-version': version,
              ...headers,
            },
          }),
        }),
        getHandler: () => context,
      } as unknown as ExecutionContext;
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = database!;
      process.env.BETTER_AUTH_SECRET =
        'desktop-e2e-only-secret-not-for-production-123456';
      process.env.BETTER_AUTH_URL = 'http://localhost:3001';
      process.env.WEB_ORIGIN = 'http://localhost:5173';
      process.env.NODE_ENV = 'test';
      process.env.DESKTOP_MIN_VERSION = version;
      ({ prisma } = await import('../src/prisma/prisma.client.js'));
      const { createAuth } = await import('../src/auth/auth.factory.js');
      const { hashPassword } = await import('better-auth/crypto');
      auth = createAuth(prisma);
      userId = randomUUID();
      orgId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Synthetic Desktop Teacher',
          email,
          emailVerified: true,
          role: 'user',
        },
      });
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(password),
        },
      });
      await prisma.organization.create({
        data: {
          id: orgId,
          name: 'Synthetic Desktop School',
          slug: `desktop-${suffix}`,
          subscriptionStatus: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const school = await prisma.school.create({
        data: {
          organizationId: orgId,
          name: 'Synthetic Desktop School',
          code: `DESK-${suffix}`,
          subdomain: `desktop-${suffix}`,
        },
      });
      schoolId = school.id;
      await prisma.member.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          userId,
          role: 'teacher',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const plan = await prisma.subscriptionPlan.create({
        data: {
          code: `DESK-${suffix}`,
          name: 'Synthetic Desktop',
          features: [],
        },
      });
      planId = plan.id;
      await prisma.subscription.create({ data: { schoolId, planId } });
    }, 30000);

    afterAll(async () => {
      if (!prisma) return;
      if (schoolId) await prisma.school.deleteMany({ where: { id: schoolId } });
      if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      if (planId)
        await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
      await prisma.$disconnect();
    });

    it('marks the session in the database despite a forged body channel', async () => {
      const response = await call('/sign-in/email', {
        email,
        password,
        clientPlatform: 'web',
      });
      expect(response.status).toBe(200);
      token = response.headers.get('set-auth-token')!;
      expect(token).toBeTruthy();
      const identity = await session();
      const stored = await prisma.session.findUnique({
        where: { id: identity.session.id },
      });
      expect(stored.clientPlatform).toBe('desktop');
      expect(identity.session.clientPlatform).toBe('desktop');
    });

    it('checks plan changes and school overrides on the persisted desktop session', async () => {
      const guard = new SchoolTenantGuard(
        { client: prisma } as never,
        new Reflector(),
      );
      const identity = await session();
      await expect(
        guard.canActivate(context(identity, { 'x-schoolhub-client': 'web' })),
      ).rejects.toMatchObject({
        response: { error: 'DESKTOP_ACCESS_DISABLED' },
      });
      await prisma.subscriptionPlan.update({
        where: { id: planId },
        data: { features: ['desktop'] },
      });
      await expect(guard.canActivate(context(identity))).resolves.toBe(true);
      await prisma.subscription.update({
        where: { schoolId },
        data: { settings: { desktopEnabled: false } },
      });
      await expect(guard.canActivate(context(identity))).rejects.toThrow(
        /not enabled/,
      );
      await prisma.subscription.update({
        where: { schoolId },
        data: { settings: { desktopEnabled: true } },
      });
      await expect(guard.canActivate(context(identity))).resolves.toBe(true);
    });

    it('rejects outdated native login but preserves normal browser login', async () => {
      expect(
        (await call('/sign-in/email', { email, password }, true, '0.0.1'))
          .status,
      ).toBe(426);
      const web = await call('/sign-in/email', { email, password }, false);
      expect(web.status).toBe(200);
      const identity = await session(web.headers.get('set-auth-token')!);
      const stored = await prisma.session.findUnique({
        where: { id: identity.session.id },
      });
      expect(stored.clientPlatform).toBe('web');
    });

    async function deviceSession(desktop = true) {
      const response = await call(
        '/sign-in/email',
        { email, password, desktopDeviceId: randomUUID() },
        desktop,
      );
      expect(response.status).toBe(200);
      const bearer = response.headers.get('set-auth-token')!;
      const identity = await session(bearer);
      expect(identity.session.desktopDeviceId).toBeFalsy();
      return {
        bearer,
        access: {
          schoolId,
          actor: { id: userId, ipAddress: null, userAgent: null },
          role: 'teacher',
          sessionId: identity.session.id,
        },
      };
    }
    const installation = () => ({
      installationId: randomUUID(),
      name: 'Synthetic staff PC',
      platform: 'windows' as const,
    });
    const service = () => new SyncDeviceService({ client: prisma } as never);

    it('registers once under concurrent retries and binds the persisted session', async () => {
      const { access } = await deviceSession();
      const input = installation();
      const [first, second] = await Promise.all([
        service().register(access, input, version),
        service().register(access, input, version),
      ]);
      expect(first.id).toBe(second.id);
      expect(
        await prisma.syncDevice.count({
          where: { schoolId, installationId: input.installationId },
        }),
      ).toBe(1);
      expect(
        (await service().requireBoundDevice(schoolId, userId, access.sessionId))
          .id,
      ).toBe(first.id);
      expect(
        await prisma.auditLog.count({
          where: { entityType: 'sync.device.register', entityId: first.id },
        }),
      ).toBe(1);
      await expect(
        service().register(access, installation(), version),
      ).rejects.toThrow(/another installation/);
      expect(
        await prisma.syncDevice.count({ where: { schoolId, userId } }),
      ).toBe(1);
    });

    it('refuses browser sessions even when the client claims to be desktop', async () => {
      const { access } = await deviceSession(false);
      await expect(
        service().register(access, installation(), version),
      ).rejects.toThrow(/desktop session/);
      await expect(
        service().requireBoundDevice(schoolId, userId, access.sessionId),
      ).rejects.toThrow(/Register an active installation/);
    });

    it('scopes management to the account or an explicit owner/admin role', async () => {
      const { access } = await deviceSession();
      const device = await service().register(access, installation(), version);
      const query = { scope: 'mine' as const, page: 1, limit: 25 };
      const list = await service().list(access, query);
      expect(list.items.find((row) => row.id === device.id)).toMatchObject({
        current: true,
      });
      expect(JSON.stringify(list)).not.toMatch(
        /installationId|sessionId|token|revocationReason/,
      );
      expect(
        (
          await service().list(
            { ...access, actor: { ...access.actor, id: randomUUID() } },
            query,
          )
        ).items,
      ).toEqual([]);
      await expect(
        service().list(
          { ...access, role: 'headteacher' },
          { ...query, scope: 'school' },
        ),
      ).rejects.toThrow(/owners and administrators/);
      await expect(
        service().revoke(
          { ...access, actor: { ...access.actor, id: randomUUID() } },
          device.id,
          'Lost installation',
        ),
      ).rejects.toThrow(/not found/);
      await expect(
        service().revoke(
          { ...access, schoolId: randomUUID(), role: 'admin' },
          device.id,
          'Wrong school',
        ),
      ).rejects.toThrow(/not found/);
      await expect(
        service().requireBoundDevice(randomUUID(), userId, access.sessionId),
      ).rejects.toThrow(/Register an active installation/);
      expect(
        (
          await service().list(
            { ...access, role: 'admin' },
            { ...query, scope: 'school' },
          )
        ).total,
      ).toBeGreaterThan(0);
    });

    it('revokes all bound sessions, preserves browser sign-in and refuses re-registration', async () => {
      const first = await deviceSession();
      const second = await deviceSession();
      const web = await deviceSession(false);
      const input = installation();
      const device = await service().register(first.access, input, version);
      expect((await service().register(second.access, input, version)).id).toBe(
        device.id,
      );
      await service().revoke(
        { ...web.access, role: 'admin' },
        device.id,
        'Reported lost by teacher',
      );
      expect(await session(first.bearer)).toBeNull();
      expect(await session(second.bearer)).toBeNull();
      expect((await session(web.bearer)).user.id).toBe(userId);
      await expect(
        service().requireBoundDevice(schoolId, userId, first.access.sessionId),
      ).rejects.toThrow(/Sign in again/);
      const fresh = await deviceSession();
      await expect(
        service().register(fresh.access, input, version),
      ).rejects.toMatchObject({ response: { error: 'SYNC_DEVICE_REVOKED' } });
      const revokedAt = (
        await prisma.syncDevice.findUnique({ where: { id: device.id } })
      ).revokedAt;
      await service().revoke(web.access, device.id, 'Repeated request');
      expect(
        (await prisma.syncDevice.findUnique({ where: { id: device.id } }))
          .revokedAt,
      ).toEqual(revokedAt);
      expect(
        await prisma.auditLog.count({
          where: { entityType: 'sync.device.revoke', entityId: device.id },
        }),
      ).toBe(1);
    });

    it('serializes revocation against registration without leaving a live bound session', async () => {
      const original = await deviceSession();
      const retry = await deviceSession();
      const input = installation();
      const device = await service().register(original.access, input, version);
      const results = await Promise.allSettled([
        service().register(retry.access, input, version),
        service().revoke(original.access, device.id, 'Concurrency test'),
      ]);
      expect(results[1].status).toBe('fulfilled');
      expect(
        (await prisma.syncDevice.findUnique({ where: { id: device.id } }))
          .revokedAt,
      ).toBeTruthy();
      expect(
        await prisma.session.count({ where: { desktopDeviceId: device.id } }),
      ).toBe(0);
      await expect(
        service().register(retry.access, input, version),
      ).rejects.toThrow();
    });

    it('rejects SuperAdmin access from a desktop session without trusting the channel header', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'superAdmin', twoFactorEnabled: true },
      });
      const identity = await session();
      expect(identity.user.role).toBe('superAdmin');
      expect(() =>
        new SuperAdminGuard().canActivate(
          context(identity, { 'x-schoolhub-client': 'web' }),
        ),
      ).toThrow(/web portal/);
      // Test actual session issuance too; no credentials or challenges are fabricated.
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false },
      });
      expect((await call('/sign-in/email', { email, password })).status).toBe(
        403,
      );
    });
  },
);
