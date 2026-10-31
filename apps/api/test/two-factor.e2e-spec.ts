/**
 * End-to-end test of two-factor authentication against a REAL PostgreSQL
 * database, the real Better Auth instance and the real guards.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/schoolhub_test \
 *     pnpm --filter @schoolhub/api exec vitest run --config vitest.config.e2e.ts test/two-factor.e2e-spec.ts
 *
 * The database must already have every migration applied. The test creates
 * its own uniquely-named rows and removes them afterwards.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Str0ngPassw0rd!x';
const RUN = randomBytes(4).toString('hex');

// ---- independent RFC 6238 TOTP (proves interoperability with real authenticator apps) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase())
    bits += B32.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretBase32: string, offsetSteps = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32))
    .update(buffer)
    .digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}
const secretFromUri = (uri: string) => new URL(uri).searchParams.get('secret')!;

describe.skipIf(!DB)('two-factor authentication (real database)', () => {
  let app: INestApplication;
  let prisma: any;
  let ipCounter = 10;
  // A fresh client IP per step keeps the (intentionally strict) rate limiter out of unrelated tests.
  const nextIp = () =>
    `10.20.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

  const ids = { admin: '', owner: '', school: '', org: '' };
  const emails = {
    admin: `sa-${RUN}@e2e.test`,
    owner: `owner-${RUN}@e2e.test`,
    teacher: `multi-${RUN}@e2e.test`,
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB!;
    process.env.BETTER_AUTH_SECRET =
      'e2e-secret-e2e-secret-e2e-secret-1234567890';
    process.env.BETTER_AUTH_URL = 'http://localhost:3001';
    process.env.WEB_ORIGIN = ORIGIN;
    process.env.NODE_ENV = 'test';

    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module.js');
    ({ prisma } = await import('../src/prisma/prisma.client.js'));
    const { hashPassword } = await import('better-auth/crypto');
    const { generateId } = await import('better-auth');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    await app.init();

    const hash = await hashPassword(PASSWORD);
    const now = new Date();
    const makeUser = async (email: string, role: string) => {
      const id = generateId();
      await prisma.user.create({
        data: {
          id,
          name: email.split('@')[0],
          email,
          emailVerified: true,
          role,
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.account.create({
        data: {
          id: generateId(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: hash,
          createdAt: now,
          updatedAt: now,
        },
      });
      return id;
    };

    ids.admin = await makeUser(emails.admin, 'superAdmin');
    ids.owner = await makeUser(emails.owner, 'user');
    const multi = await makeUser(emails.teacher, 'user');

    ids.org = generateId();
    await prisma.organization.create({
      data: {
        id: ids.org,
        name: `E2E ${RUN}`,
        slug: `e2e-${RUN}`,
        subscriptionStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    const school = await prisma.school.create({
      data: {
        organizationId: ids.org,
        name: `E2E ${RUN}`,
        code: `E2E-${RUN}`,
        subdomain: `e2e-${RUN}`,
      },
    });
    ids.school = school.id;
    await prisma.member.create({
      data: {
        id: generateId(),
        organizationId: ids.org,
        userId: ids.owner,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    });
    // an account that is BOTH owner and teacher: must not dodge the policy by asking to act as a teacher
    const org2 = generateId();
    await prisma.organization.create({
      data: {
        id: org2,
        name: `E2E2 ${RUN}`,
        slug: `e2e2-${RUN}`,
        subscriptionStatus: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.school.create({
      data: {
        organizationId: org2,
        name: `E2E2 ${RUN}`,
        code: `E2E2-${RUN}`,
        subdomain: `e2e2-${RUN}`,
      },
    });
    await prisma.member.create({
      data: {
        id: generateId(),
        organizationId: org2,
        userId: multi,
        role: 'admin',
        roles: ['teacher'],
        createdAt: now,
        updatedAt: now,
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { email: { endsWith: `${RUN}@e2e.test` } },
        select: { id: true },
      });
      const userIds = users.map((u: { id: string }) => u.id);
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.member.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.school.deleteMany({
        where: { code: { startsWith: 'E2E' }, subdomain: { contains: RUN } },
      });
      await prisma.organization.deleteMany({
        where: { slug: { contains: RUN } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  // ---------- helpers ----------
  const agent = () => request.agent(app.getHttpServer());
  type Agent = ReturnType<typeof agent>;
  const post = (
    a: Agent,
    path: string,
    body: object,
    ip = nextIp(),
    extra: Record<string, string> = {},
  ) =>
    a
      .post(`/api${path}`)
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', ip)
      .set(extra)
      .send(body);
  const get = (a: Agent, path: string, extra: Record<string, string> = {}) =>
    a.get(`/api${path}`).set('Origin', ORIGIN).set(extra);

  const signIn = (a: Agent, email: string, ip = nextIp()) =>
    post(a, '/auth/sign-in/email', { email, password: PASSWORD }, ip);

  /** Enrol an account in TOTP end to end and return what the user would save. */
  async function enrol(email: string) {
    const a = agent();
    expect((await signIn(a, email)).status).toBe(200);
    const enable = await post(a, '/auth/two-factor/enable', {
      password: PASSWORD,
    });
    expect(enable.status).toBe(200);
    const secret = secretFromUri(enable.body.totpURI);
    const verify = await post(a, '/auth/two-factor/verify-totp', {
      code: totp(secret),
    });
    expect(verify.status).toBe(200);
    return {
      agent: a,
      secret,
      backupCodes: enable.body.backupCodes as string[],
      totpURI: enable.body.totpURI as string,
    };
  }

  // ======================================================================
  describe('enforcement for platform super-admins', () => {
    let secret = '';
    let backupCodes: string[] = [];

    it('blocks every /super-admin route until a second factor is enrolled, with a machine-readable reason', async () => {
      const a = agent();
      expect((await signIn(a, emails.admin)).status).toBe(200);
      const res = await get(a, '/super-admin/stats');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('TWO_FACTOR_REQUIRED');
      // the account endpoints needed to finish setup stay reachable
      expect((await get(a, '/auth/get-session')).body.user.email).toBe(
        emails.admin,
      );
    });

    it('enrols: secret is shown once, is not stored in readable form, and 2FA only turns on after a valid code', async () => {
      const a = agent();
      await signIn(a, emails.admin);

      const wrongPassword = await post(a, '/auth/two-factor/enable', {
        password: 'not-the-password',
      });
      expect(wrongPassword.status).toBe(400);

      const enable = await post(a, '/auth/two-factor/enable', {
        password: PASSWORD,
      });
      expect(enable.status).toBe(200);
      expect(enable.body.totpURI).toMatch(/^otpauth:\/\/totp\/SchoolHub:/);
      expect(enable.body.backupCodes).toHaveLength(10);
      secret = secretFromUri(enable.body.totpURI);
      backupCodes = enable.body.backupCodes;

      // not active yet: setup is unconfirmed
      let user = await prisma.user.findUnique({
        where: { id: ids.admin },
        select: { twoFactorEnabled: true },
      });
      expect(user.twoFactorEnabled).toBe(false);
      const row = await prisma.twoFactor.findFirst({
        where: { userId: ids.admin },
      });
      expect(row.secret).not.toContain(secret); // encrypted at rest
      expect(row.backupCodes).not.toContain(backupCodes[0]);

      const bad = await post(a, '/auth/two-factor/verify-totp', {
        code: '000000',
      });
      expect(bad.status).toBe(401);
      user = await prisma.user.findUnique({
        where: { id: ids.admin },
        select: { twoFactorEnabled: true },
      });
      expect(user.twoFactorEnabled).toBe(false);

      const ok = await post(a, '/auth/two-factor/verify-totp', {
        code: totp(secret),
      });
      expect(ok.status).toBe(200);
      user = await prisma.user.findUnique({
        where: { id: ids.admin },
        select: { twoFactorEnabled: true },
      });
      expect(user.twoFactorEnabled).toBe(true);

      // and the super-admin API now opens for this (re-issued) session
      expect((await get(a, '/super-admin/stats')).status).toBe(200);
    });

    it('writes an audit entry when 2FA is enabled', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { userId: ids.admin, entityType: 'auth.two-factor.enabled' },
      });
      expect(entry).toBeTruthy();
      expect(entry.action).toBe('ACCESS_CHANGED');
    });

    it('sign-in with only the password no longer yields a session', async () => {
      const a = agent();
      const res = await signIn(a, emails.admin);
      expect(res.status).toBe(200);
      expect(res.body.twoFactorRedirect).toBe(true);
      expect(res.body.token).toBeUndefined();
      expect((await get(a, '/auth/get-session')).body).toBeNull();
      expect((await get(a, '/super-admin/stats')).status).toBe(401);
    });

    it('rejects a wrong code, then accepts the right one and opens the console', async () => {
      const a = agent();
      await signIn(a, emails.admin);
      expect(
        (await post(a, '/auth/two-factor/verify-totp', { code: '123456' }))
          .status,
      ).toBe(401);
      const ok = await post(a, '/auth/two-factor/verify-totp', {
        code: totp(secret),
      });
      expect(ok.status).toBe(200);
      expect((await get(a, '/super-admin/stats')).status).toBe(200);
    });

    it('lets a SuperAdmin trust a device for 30 days and revoke that trust server-side', async () => {
      const a = agent();
      await signIn(a, emails.admin);
      const verified = await post(a, '/auth/two-factor/verify-totp', {
        code: totp(secret),
        trustDevice: true,
      });
      expect(verified.status).toBe(200);
      expect((await get(a, '/super-admin/stats')).status).toBe(200);

      const listed = await get(a, '/account/security/trusted-devices');
      expect(listed.status).toBe(200);
      expect(listed.body.data.length).toBeGreaterThan(0);

      await post(a, '/auth/sign-out', {});
      const trustedSignIn = await signIn(a, emails.admin);
      expect(trustedSignIn.body.twoFactorRedirect).toBeUndefined();
      expect((await get(a, '/super-admin/stats')).status).toBe(200);

      const revoked = await a
        .delete('/api/account/security/trusted-devices/revoke-all')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', nextIp());
      expect(revoked.status).toBe(200);
      expect(revoked.body.revoked).toBeGreaterThan(0);

      await post(a, '/auth/sign-out', {});
      const signInAfterRevocation = await signIn(a, emails.admin);
      expect(signInAfterRevocation.body.twoFactorRedirect).toBe(true);
      expect((await get(a, '/super-admin/stats')).status).toBe(401);
    });

    it('keeps unused plugin endpoints switched off (they would leak the secret or probe an unconfigured flow)', async () => {
      const a = agent();
      await signIn(a, emails.admin);
      await post(a, '/auth/two-factor/verify-totp', { code: totp(secret) });
      expect(
        (await post(a, '/auth/two-factor/get-totp-uri', { password: PASSWORD }))
          .status,
      ).toBe(404);
      expect((await post(a, '/auth/two-factor/send-otp', {})).status).toBe(404);
      expect(
        (await post(a, '/auth/two-factor/verify-otp', { code: '123456' }))
          .status,
      ).toBe(404);
    });

    it('accepts a backup code exactly once', async () => {
      const code = backupCodes[0]!;
      const first = agent();
      await signIn(first, emails.admin);
      expect(
        (await post(first, '/auth/two-factor/verify-backup-code', { code }))
          .status,
      ).toBe(200);
      expect((await get(first, '/super-admin/stats')).status).toBe(200);

      const second = agent();
      await signIn(second, emails.admin);
      expect(
        (await post(second, '/auth/two-factor/verify-backup-code', { code }))
          .status,
      ).toBe(401);
    });

    it('rate-limits code guessing per client (6th attempt within a minute is refused)', async () => {
      // failures from earlier tests also count toward the account lock; start clean to test the limiter alone
      await prisma.twoFactor.updateMany({
        where: { userId: ids.admin },
        data: { lockedUntil: null, failedVerificationCount: 0 },
      });
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const a = agent();
        await signIn(a, emails.admin, nextIp());
        const r = await post(
          a,
          '/auth/two-factor/verify-totp',
          { code: '111111' },
          ip,
        );
        statuses.push(r.status);
        if (r.status === 429) expect(r.headers['x-retry-after']).toBeDefined(); // the limiter, not the account lock
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
    });

    it("locks the account's second factor after repeated failures, even from other addresses", async () => {
      // earlier tests already recorded failures; fail until the lock engages
      let locked = false;
      for (let i = 0; i < 12 && !locked; i += 1) {
        const a = agent();
        await signIn(a, emails.admin, nextIp());
        const res = await post(
          a,
          '/auth/two-factor/verify-totp',
          { code: '222222' },
          nextIp(),
        );
        locked = res.status === 429;
      }
      expect(locked).toBe(true);

      // while locked even the CORRECT code is refused
      const a = agent();
      await signIn(a, emails.admin, nextIp());
      const res = await post(
        a,
        '/auth/two-factor/verify-totp',
        { code: totp(secret) },
        nextIp(),
      );
      expect(res.status).toBe(429);

      // clear the lock so later tests are unaffected
      await prisma.twoFactor.updateMany({
        where: { userId: ids.admin },
        data: { lockedUntil: null, failedVerificationCount: 0 },
      });
    });

    it('disabling requires the password and is audited; the console then locks again', async () => {
      const a = agent();
      await signIn(a, emails.admin, nextIp());
      await post(
        a,
        '/auth/two-factor/verify-totp',
        { code: totp(secret), trustDevice: true },
        nextIp(),
      );
      expect(
        (
          await post(a, '/auth/two-factor/disable', {
            password: 'wrong-password',
          })
        ).status,
      ).toBe(400);
      expect(
        (await post(a, '/auth/two-factor/disable', { password: PASSWORD }))
          .status,
      ).toBe(200);
      expect(
        await prisma.verification.count({
          where: {
            value: ids.admin,
            identifier: { startsWith: 'trust-device-' },
          },
        }),
      ).toBe(0);
      const entry = await prisma.auditLog.findFirst({
        where: { userId: ids.admin, entityType: 'auth.two-factor.disabled' },
      });
      expect(entry).toBeTruthy();
      const res = await get(a, '/super-admin/stats');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('TWO_FACTOR_REQUIRED');
    });
  });

  // ======================================================================
  describe('school administrators', () => {
    const tenant = () => ({ 'x-school-subdomain': `e2e-${RUN}` });
    const profilePath = '/schools/current/me/profile';

    it('is optional by default: an owner without 2FA can use the school', async () => {
      delete process.env.REQUIRE_2FA_SCHOOL_ADMINS;
      const a = agent();
      await signIn(a, emails.owner);
      const res = await get(a, profilePath, tenant());
      expect(res.status).not.toBe(403);
    });

    it('can be required by policy: owner without 2FA is blocked with TWO_FACTOR_REQUIRED', async () => {
      process.env.REQUIRE_2FA_SCHOOL_ADMINS = 'true';
      try {
        const a = agent();
        await signIn(a, emails.owner);
        const res = await get(a, profilePath, tenant());
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('TWO_FACTOR_REQUIRED');
      } finally {
        delete process.env.REQUIRE_2FA_SCHOOL_ADMINS;
      }
    });

    it('an admin cannot dodge the policy by asking to act as a lower role', async () => {
      process.env.REQUIRE_2FA_SCHOOL_ADMINS = 'true';
      try {
        const a = agent();
        await signIn(a, emails.teacher);
        const res = await get(a, profilePath, {
          'x-school-subdomain': `e2e2-${RUN}`,
          'x-school-role': 'teacher',
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('TWO_FACTOR_REQUIRED');
      } finally {
        delete process.env.REQUIRE_2FA_SCHOOL_ADMINS;
      }
    });

    it('an owner who has enrolled passes the policy, using password + code', async () => {
      process.env.REQUIRE_2FA_SCHOOL_ADMINS = 'true';
      try {
        const { secret } = await enrol(emails.owner);
        const a = agent();
        const first = await signIn(a, emails.owner);
        expect(first.body.twoFactorRedirect).toBe(true);
        const refusedTrust = await post(a, '/auth/two-factor/verify-totp', {
          code: totp(secret),
          trustDevice: true,
        });
        expect(refusedTrust.status).toBe(403);
        expect(
          (
            await post(a, '/auth/two-factor/verify-totp', {
              code: totp(secret),
            })
          ).status,
        ).toBe(200);
        expect((await get(a, profilePath, tenant())).status).not.toBe(403);
      } finally {
        delete process.env.REQUIRE_2FA_SCHOOL_ADMINS;
      }
    });

    it('a platform admin can reset a locked-out school admin, which signs them out and is audited', async () => {
      // the owner enrolled in the previous test; now enrol the super-admin again to act
      const sa = await enrol(emails.admin);
      const reset = await post(
        sa.agent,
        `/super-admin/schools/${ids.school}/admins/${ids.owner}/reset-two-factor`,
        {},
        nextIp(),
      );
      expect(reset.status).toBe(201);

      const owner = await prisma.user.findUnique({
        where: { id: ids.owner },
        select: { twoFactorEnabled: true },
      });
      expect(owner.twoFactorEnabled).toBe(false);
      expect(
        await prisma.twoFactor.count({ where: { userId: ids.owner } }),
      ).toBe(0);
      expect(await prisma.session.count({ where: { userId: ids.owner } })).toBe(
        0,
      );
      const entry = await prisma.auditLog.findFirst({
        where: {
          userId: ids.admin,
          entityType: 'super-admin.school-admin.reset-two-factor',
          schoolId: ids.school,
        },
      });
      expect(entry.oldValues.twoFactorEnabled).toBe(true);

      // after the reset a password alone signs them in again (to re-enrol)
      const a = agent();
      const res = await signIn(a, emails.owner);
      expect(res.body.twoFactorRedirect).toBeUndefined();
      expect((await get(a, '/auth/get-session')).body.user.email).toBe(
        emails.owner,
      );
    });

    it('only a super-admin may use the reset endpoint', async () => {
      const a = agent();
      await signIn(a, emails.owner);
      const res = await post(
        a,
        `/super-admin/schools/${ids.school}/admins/${ids.owner}/reset-two-factor`,
        {},
        nextIp(),
      );
      expect(res.status).toBe(403);
    });
  });
  it('verifies Resend signatures against the exact raw body through the production auth parser', async () => {
    const { Webhook } = await import('svix');
    const secret =
      'whsec_' +
      Buffer.from('test-webhook-signing-secret-only').toString('base64');
    const previous = process.env.RESEND_WEBHOOK_SECRET;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const eventId = `e2e-${RUN}-resend`,
      date = new Date();
    const raw = JSON.stringify(
      {
        type: 'email.delivered',
        created_at: date.toISOString(),
        data: { email_id: `unmatched-${RUN}` },
      },
      null,
      2,
    );
    const headers = {
      'svix-id': eventId,
      'svix-timestamp': String(Math.floor(date.getTime() / 1000)),
      'svix-signature': new Webhook(secret).sign(eventId, date, raw),
    };
    try {
      await request(app.getHttpServer())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(raw)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(raw)
        .expect(201);
      expect(
        await prisma.notificationProviderEvent.count({
          where: { id: 'resend:' + eventId },
        }),
      ).toBe(1);
      await request(app.getHttpServer())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(raw.replace('delivered', 'bounced'))
        .expect(400);
    } finally {
      await prisma.notificationProviderEvent.deleteMany({
        where: { id: 'resend:' + eventId },
      });
      if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = previous;
    }
  });
});
