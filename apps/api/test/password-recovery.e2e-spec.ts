import 'reflect-metadata';
import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
const url = process.env.TEST_DATABASE_URL,
  run = 'recover-http-' + randomBytes(4).toString('hex'),
  origin = 'http://localhost:5173',
  email = run + '@example.test',
  oldPassword = 'OriginalPassw0rd!42',
  newPassword = 'RecoveredPassw0rd!42';
function totp(secret: string) {
  let bits = '';
  for (const char of secret.replace(/=+$/, ''))
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
      .indexOf(char)
      .toString(2)
      .padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(),
    offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
}
describe.skipIf(!url)(
  'password recovery HTTP and real authentication',
  { timeout: 60000 },
  () => {
    let app: INestApplication,
      db: PrismaClient,
      worker: any,
      token = '',
      secret = '',
      pending: ReturnType<typeof request.agent>,
      trusted: ReturnType<typeof request.agent>;
    let ip = 10;
    const send = vi
      .fn()
      .mockResolvedValue({ state: 'ACCEPTED', messageId: run + '-email' });
    const post = (
      agent: ReturnType<typeof request.agent>,
      path: string,
      body: object,
    ) =>
      agent
        .post('/api' + path)
        .set('Origin', origin)
        .set('X-Forwarded-For', '10.35.0.' + ++ip)
        .send(body);
    beforeAll(async () => {
      process.env.DATABASE_URL = url!;
      process.env.BETTER_AUTH_SECRET =
        'recovery-e2e-secret-00000000000000000000';
      process.env.BETTER_AUTH_URL = 'http://localhost:3001';
      process.env.WEB_ORIGIN = origin;
      process.env.NODE_ENV = 'test';
      process.env.RESEND_FROM_EMAIL = 'alerts@example.test';
      const { Test } = await import('@nestjs/testing'),
        { AppModule } = await import('../src/app.module.js'),
        { RecoveryTransport } =
          await import('../src/modules/accounts/password-recovery/recovery-transport.js'),
        { PasswordRecoveryWorker } =
          await import('../src/modules/accounts/password-recovery/password-recovery.worker.js');
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(RecoveryTransport)
        .useValue({ configured: () => true, send })
        .compile();
      app = module.createNestApplication({ bodyParser: false });
      app.setGlobalPrefix('api');
      app.getHttpAdapter().getInstance().set('trust proxy', 1);
      app.useLogger(false);
      await app.init();
      worker = app.get(PasswordRecoveryWorker);
      db = (await import('../src/prisma/prisma.client.js')).prisma;
      const { hashPassword } = await import('better-auth/crypto');
      await db.user.create({
        data: { id: run, name: 'Recovery test', email, emailVerified: true },
      });
      await db.account.create({
        data: {
          id: run,
          accountId: run,
          userId: run,
          providerId: 'credential',
          password: await hashPassword(oldPassword),
        },
      });
    });
    it('uses the public endpoint, masks ineligible accounts and rejects alternate native reset routes', async () => {
      const unknown = await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/request',
        { email: 'unknown@example.test' },
      ).expect(200);
      await db.user.update({
        where: { id: run },
        data: { emailVerified: false },
      });
      const unverified = await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/request',
        { email },
      ).expect(200);
      expect(unverified.body).toEqual(unknown.body);
      expect(
        await db.passwordRecoveryRequest.count({ where: { userId: run } }),
      ).toBe(0);
      await db.user.update({
        where: { id: run },
        data: { emailVerified: true },
      });
      await post(
        request.agent(app.getHttpServer()),
        '/auth/request-password-reset',
        { email },
      ).expect(404);
      await post(request.agent(app.getHttpServer()), '/auth/reset-password', {
        token: 'bogus-token',
        newPassword,
      }).expect(404);
      await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/request',
        { email: 'not-an-email' },
      ).expect(400);
    });
    it('queues and dispatches a generic encrypted reset email while retaining active and pending 2FA for the reset test', async () => {
      trusted = request.agent(app.getHttpServer());
      await post(trusted, '/auth/sign-in/email', {
        email,
        password: oldPassword,
      }).expect(200);
      const enabled = await post(trusted, '/auth/two-factor/enable', {
        password: oldPassword,
      }).expect(200);
      secret = new URL(enabled.body.totpURI).searchParams.get('secret')!;
      await post(trusted, '/auth/two-factor/verify-totp', {
        code: totp(secret),
      }).expect(200);
      await post(trusted, '/auth/sign-out', {});
      await post(trusted, '/auth/sign-in/email', {
        email,
        password: oldPassword,
      });
      await post(trusted, '/auth/two-factor/verify-totp', {
        code: totp(secret),
        trustDevice: true,
      }).expect(200);
      pending = request.agent(app.getHttpServer());
      expect(
        (
          await post(pending, '/auth/sign-in/email', {
            email,
            password: oldPassword,
          })
        ).body.twoFactorRedirect,
      ).toBe(true);
      await db.user.update({
        where: { id: run },
        data: {
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() - 3600000),
        },
      });
      const response = await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/request',
        { email, school: 'test-school' },
      ).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toHaveProperty('success', true);
      const row = await db.passwordRecoveryRequest.findFirstOrThrow({
        where: { userId: run },
      });
      expect(row.encryptedPayload).not.toContain(email);
      await worker.dispatch(row.id);
      expect(send).toHaveBeenCalledTimes(1);
      const payload = send.mock.calls[0]![2],
        link = new URL(payload.text.match(/https?:\/\/\S+/)[0]);
      token = new URLSearchParams(link.hash.slice(1)).get('token')!;
      expect(link.origin).toBe(origin);
      expect(link.searchParams.has('token')).toBe(false);
      expect(
        JSON.stringify(
          await db.passwordRecoveryRequest.findUnique({
            where: { id: row.id },
          }),
        ),
      ).not.toContain(token);
      expect(
        JSON.stringify(
          await db.backgroundJob.findUnique({ where: { id: row.id } }),
        ),
      ).not.toContain(token);
    });
    it('consumes a reset once, clears forced expiry, revokes sessions/trust/challenges and keeps the authenticator', async () => {
      await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/complete',
        { token, newPassword: 'weak' },
      ).expect(400);
      const results = await Promise.all(
        [1, 2].map(() =>
          post(
            request.agent(app.getHttpServer()),
            '/account/password-recovery/complete',
            { token, newPassword },
          ),
        ),
      );
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 400]);
      await post(
        request.agent(app.getHttpServer()),
        '/account/password-recovery/complete',
        { token, newPassword },
      ).expect(400);
      expect(await db.session.count({ where: { userId: run } })).toBe(0);
      expect(
        await db.verification.count({
          where: {
            value: run,
            OR: [
              { identifier: { startsWith: 'trust-device-' } },
              { identifier: { startsWith: '2fa-' } },
            ],
          },
        }),
      ).toBe(0);
      expect(await db.user.findUnique({ where: { id: run } })).toMatchObject({
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        twoFactorEnabled: true,
      });
      expect(
        await db.twoFactor.findFirst({ where: { userId: run } }),
      ).not.toBeNull();
      const stale = await post(pending, '/auth/two-factor/verify-totp', {
        code: totp(secret),
      });
      expect(stale.status).not.toBe(200);
      await post(request.agent(app.getHttpServer()), '/auth/sign-in/email', {
        email,
        password: oldPassword,
      }).expect(401);
      const login = request.agent(app.getHttpServer()),
        signed = await post(login, '/auth/sign-in/email', {
          email,
          password: newPassword,
        });
      expect(signed.body.twoFactorRedirect).toBe(true);
      await post(login, '/auth/two-factor/verify-totp', {
        code: totp(secret),
      }).expect(200);
      expect(
        await db.auditLog.count({
          where: { userId: run, entityType: 'auth.password.reset' },
        }),
      ).toBe(1);
    });
    it('rejects expired and tampered links without changing the password', async () => {
      const { recoveryHash } =
        await import('../src/modules/accounts/password-recovery/recovery-crypto.js');
      const expired = randomBytes(32).toString('base64url');
      await db.passwordRecoveryRequest.create({
        data: {
          id: run + '-expired',
          userId: run,
          tokenHash: recoveryHash(expired),
          recipientHash: recoveryHash(email),
        credentialFingerprint: recoveryHash("expired-fixture"),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      for (const value of [expired, randomBytes(32).toString('base64url')])
        await post(
          request.agent(app.getHttpServer()),
          '/account/password-recovery/complete',
          { token: value, newPassword: 'AnotherPassw0rd!42' },
        ).expect(400);
    });
    afterAll(async () => {
      await app?.close();
      if (!db) return;
      const rows = await db.passwordRecoveryRequest.findMany({
        where: { userId: run },
        select: { id: true },
      });
      await db.backgroundJob.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      await db.passwordRecoveryRequest.deleteMany({ where: { userId: run } });
      await db.auditLog.deleteMany({ where: { userId: run } });
      await db.verification.deleteMany({ where: { value: run } });
      await db.user.deleteMany({ where: { id: run } });
      await db.$disconnect();
    });
  },
);
