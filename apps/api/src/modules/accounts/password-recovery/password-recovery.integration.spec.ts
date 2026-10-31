import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { DurableJobsService } from '../../../common/jobs/durable-jobs.service.js';
import {
  PasswordRecoveryService,
  RECOVERY_RESPONSE,
} from './password-recovery.service.js';
import { PasswordRecoveryWorker } from './password-recovery.worker.js';
import { openRecovery, recoveryHash } from './recovery-crypto.js';
vi.mock('../../../env.js', () => ({ env: { NODE_ENV: 'test' } }));
const url = process.env.TEST_DATABASE_URL ?? '',
  enabled = (() => {
    try {
      return /test/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  })();
describe.skipIf(!enabled)(
  'password recovery (PostgreSQL)',
  { timeout: 60000 },
  () => {
    const run = 'recovery-' + Date.now().toString(36),
      userId = run + '-user',
      email = userId + '@example.test',
      secret = 'recovery-integration-secret-000000000000',
      password = 'RecoveredPassw0rd!42';
    let db: PrismaClient,
      service: PasswordRecoveryService,
      worker: PasswordRecoveryWorker;
    const transport = {
      configured: vi.fn(() => true),
      send: vi
        .fn()
        .mockResolvedValue({ state: 'ACCEPTED', messageId: 'test-message' }),
    };
    async function mail() {
      const row = await db.passwordRecoveryRequest.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      const payload = openRecovery(row.id, row.encryptedPayload!, secret);
      const link = new URL(payload.text.match(/https?:\/\/\S+/)![0]);
      return {
        row,
        payload,
        link,
        token: new URLSearchParams(link.hash.slice(1)).get('token')!,
      };
    }
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      vi.stubEnv('BETTER_AUTH_SECRET', secret);
      vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
      vi.stubEnv('WEB_ORIGIN', 'https://portal.example.test');
      vi.stubEnv('NODE_ENV', 'test');
      db = (await import('../../../prisma/prisma.client.js')).prisma;
      await db.user.create({
        data: {
          id: userId,
          name: 'Recovery test',
          email,
          emailVerified: true,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() - 3600000),
          twoFactorEnabled: true,
        },
      });
      await db.account.create({
        data: {
          id: run,
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword('OriginalPassw0rd!42'),
        },
      });
      await db.twoFactor.create({
        data: {
          id: run,
          userId,
          secret: 'test-encrypted-secret',
          backupCodes: 'test-backup-codes',
          verified: true,
        },
      });
      const prisma = { client: db } as never,
        jobs = new DurableJobsService(prisma);
      service = new PasswordRecoveryService(prisma, jobs, transport as never);
      worker = new PasswordRecoveryWorker(prisma, jobs, transport as never);
    });
    it('returns identical public responses without queuing for unknown, unverified or banned accounts', async () => {
      expect(await service.request('missing@example.test')).toEqual(
        RECOVERY_RESPONSE,
      );
      await db.user.update({
        where: { id: userId },
        data: { emailVerified: false },
      });
      expect(await service.request(email)).toEqual(RECOVERY_RESPONSE);
      await db.user.update({
        where: { id: userId },
        data: { emailVerified: true, banned: true },
      });
      expect(await service.request(email)).toEqual(RECOVERY_RESPONSE);
      await db.user.update({ where: { id: userId }, data: { banned: false } });
      expect(
        await db.passwordRecoveryRequest.count({ where: { userId } }),
      ).toBe(0);
    });
    it('queues encrypted payload and a durable job, with token only in the fragment and hash in the row', async () => {
      expect(
        await service.request(
          email,
          'https://portal.example.test',
          'test-school',
        ),
      ).toEqual(RECOVERY_RESPONSE);
      const item = await mail();
      expect(item.link.pathname).toBe('/reset-password');
      expect(item.link.searchParams.get('school')).toBe('test-school');
      expect(item.link.search).not.toContain('token');
      expect(item.row.tokenHash).toBe(recoveryHash(item.token));
      expect(JSON.stringify(item.row)).not.toContain(item.token);
      expect(JSON.stringify(item.row)).not.toContain(email);
      expect(
        await db.backgroundJob.findUnique({ where: { id: item.row.id } }),
      ).toMatchObject({ kind: 'password-recovery', status: 'PENDING' });
      expect(transport.send).not.toHaveBeenCalled();
      await expect(
        service.request(email, 'https://attacker.example'),
      ).rejects.toThrow(/origin/);
    });
    it('issues only the latest usable link and enforces a durable rolling user limit', async () => {
      const original = await mail();
      await service.request(email);
      const latest = await mail();
      expect(latest.token).not.toBe(original.token);
      await expect(service.complete(original.token, password)).rejects.toThrow(
        /invalid or expired/,
      );
      expect(
        (
          await db.passwordRecoveryRequest.findUniqueOrThrow({
            where: { id: original.row.id },
          })
        ).encryptedPayload,
      ).toBeNull();
      await service.request(email);
      const before = await db.passwordRecoveryRequest.count({
        where: { userId },
      });
      await service.request(email);
      expect(
        await db.passwordRecoveryRequest.count({ where: { userId } }),
      ).toBe(before);
      expect(before).toBe(3);
    });
    it('preserves the token after a rejected password and commits exactly one concurrent reset', async () => {
      const item = await mail();
      await expect(service.complete(item.token, 'weak')).rejects.toThrow();
      expect(
        (
          await db.passwordRecoveryRequest.findUniqueOrThrow({
            where: { id: item.row.id },
          })
        ).consumedAt,
      ).toBeNull();
      await db.session.create({
        data: {
          id: run,
          token: run,
          expiresAt: new Date(Date.now() + 3600000),
          userId,
        },
      });
      await db.verification.createMany({
        data: [
          {
            id: run + '-trust',
            identifier: 'trust-device-' + run,
            value: userId,
            expiresAt: new Date(Date.now() + 3600000),
          },
          {
            id: run + '-challenge',
            identifier: '2fa-' + run,
            value: userId,
            expiresAt: new Date(Date.now() + 3600000),
          },
          {
            id: run + '-attempts',
            identifier: '2fa-attempts-2fa-' + run,
            value: '0',
            expiresAt: new Date(Date.now() + 3600000),
          },
        ],
      });
      const results = await Promise.allSettled([
        service.complete(item.token, password),
        service.complete(item.token, password),
      ]);
      expect(
        results.filter((item) => item.status === 'fulfilled'),
      ).toHaveLength(1);
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user).toMatchObject({
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        twoFactorEnabled: true,
      });
      expect(user.passwordChangedAt).not.toBeNull();
      expect(await db.session.count({ where: { userId } })).toBe(0);
      expect(
        await db.verification.count({ where: { id: { startsWith: run } } }),
      ).toBe(0);
      expect(await db.twoFactor.findFirst({ where: { userId } })).toMatchObject(
        { secret: 'test-encrypted-secret', backupCodes: 'test-backup-codes' },
      );
      expect(
        await verifyPassword({
          hash: (await db.account.findUniqueOrThrow({ where: { id: run } }))
            .password!,
          password,
        }),
      ).toBe(true);
      expect(
        await db.auditLog.count({
          where: { userId, entityType: 'auth.password.reset' },
        }),
      ).toBe(1);
      await expect(service.complete(item.token, password)).rejects.toThrow(
        /invalid or expired/,
      );
    });
    async function fresh() {
      // Separate verified accounts keep rate-limit evidence intact.
      const id = run + '-' + Math.random().toString(36).slice(2);
      await db.user.create({
        data: {
          id,
          name: 'Other user',
          email: id + '@example.test',
          emailVerified: true,
        },
      });
      await db.account.create({
        data: {
          id,
          providerId: 'credential',
          accountId: id,
          userId: id,
          password: await hashPassword('OriginalPassw0rd!42'),
        },
      });
      await service.request(id + '@example.test');
      const row = await db.passwordRecoveryRequest.findFirstOrThrow({
        where: { userId: id },
      });
      const payload = openRecovery(row.id, row.encryptedPayload!, secret),
        link = new URL(payload.text.match(/https?:\/\/\S+/)![0]);
      return {
        id,
        row,
        payload,
        token: new URLSearchParams(link.hash.slice(1)).get('token')!,
      };
    }
    it('rolls back password, token and session changes if the audit write fails', async () => {
      const item = await fresh();
      await db.session.create({
        data: {
          id: item.id,
          token: item.id,
          userId: item.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const prisma = {
        client: {
          passwordRecoveryRequest: db.passwordRecoveryRequest,
          $transaction: (fn: any) =>
            db.$transaction((tx) =>
              fn({
                ...tx,
                auditLog: {
                  create: () => {
                    throw new Error('Synthetic audit failure');
                  },
                },
              }),
            ),
        },
      } as never;
      const failing = new PasswordRecoveryService(
        prisma,
        {} as never,
        transport as never,
      );
      await expect(failing.complete(item.token, password)).rejects.toThrow(
        'Synthetic audit failure',
      );
      expect(
        (
          await db.passwordRecoveryRequest.findUniqueOrThrow({
            where: { id: item.row.id },
          })
        ).consumedAt,
      ).toBeNull();
      expect(await db.session.count({ where: { userId: item.id } })).toBe(1);
      expect(
        await verifyPassword({
          hash: (await db.account.findUniqueOrThrow({ where: { id: item.id } }))
            .password!,
          password: 'OriginalPassw0rd!42',
        }),
      ).toBe(true);
    });
    it('reuses encrypted payload/key on Resend retry and erases it on acceptance', async () => {
      const item = await fresh();
      transport.send.mockResolvedValueOnce({
        state: 'RETRY',
        reason: 'PROVIDER_RATE_LIMIT',
      });
      await expect(worker.dispatch(item.row.id)).rejects.toThrow(/Retryable/);
      expect(
        (
          await db.passwordRecoveryRequest.findUniqueOrThrow({
            where: { id: item.row.id },
          })
        ).encryptedPayload,
      ).toBe(item.row.encryptedPayload);
      transport.send.mockResolvedValue({
        state: 'ACCEPTED',
        messageId: 'test-accepted',
      });
      await worker.dispatch(item.row.id);
      const count = transport.send.mock.calls.length;
      await worker.dispatch(item.row.id);
      expect(transport.send.mock.calls).toHaveLength(count);
      expect(
        await db.passwordRecoveryRequest.findUniqueOrThrow({
          where: { id: item.row.id },
        }),
      ).toMatchObject({ status: 'ACCEPTED', encryptedPayload: null });
    });
    it('blocks changed contacts and new bans at completion and dispatch', async () => {
      for (const kind of ['email', 'banned']) {
        const item = await fresh();
        await db.user.update({
          where: { id: item.id },
          data:
            kind === 'email'
              ? { email: 'changed-' + item.id + '@example.test' }
              : { banned: true },
        });
        await expect(service.complete(item.token, password)).rejects.toThrow(
          /invalid or expired/,
        );
        transport.send.mockClear();
        await worker.dispatch(item.row.id);
        expect(transport.send).not.toHaveBeenCalled();
        expect(
          (
            await db.passwordRecoveryRequest.findUniqueOrThrow({
              where: { id: item.row.id },
            })
          ).status,
        ).toBe('SUPPRESSED');
      }
    });
    it('invalidates outstanding links when an administrator or user changes the credential',async()=>{
      const item=await fresh();await db.account.update({where:{id:item.id},data:{password:await hashPassword('ChangedPassw0rd!42')}});
      await expect(service.complete(item.token,password)).rejects.toThrow(/invalid or expired/);transport.send.mockClear();await worker.dispatch(item.row.id);expect(transport.send).not.toHaveBeenCalled();
      expect((await db.passwordRecoveryRequest.findUniqueOrThrow({where:{id:item.row.id}})).status).toBe('SUPPRESSED');
    });
    it('expires links and wipes payloads while delivery is disabled, with immutable token scope', async () => {
      const item = await fresh();
      await expect(
        db.passwordRecoveryRequest.update({
          where: { id: item.row.id },
          data: { tokenHash: recoveryHash('changed') },
        }),
      ).rejects.toThrow(/immutable/);
      transport.configured.mockReturnValue(false);
      await worker.tick(new Date(Date.now() + 16 * 60000));
      expect(
        await db.passwordRecoveryRequest.findUniqueOrThrow({
          where: { id: item.row.id },
        }),
      ).toMatchObject({ encryptedPayload: null, status: 'EXPIRED' });
      transport.configured.mockReturnValue(true);
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      if (!db) return;
      const users = await db.user.findMany({
          where: { id: { startsWith: run } },
          select: { id: true },
        }),
        ids = users.map((user) => user.id);
      const requests = await db.passwordRecoveryRequest.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      });
      await db.$transaction(async (tx) => {
        await tx.backgroundJob.deleteMany({
          where: { id: { in: requests.map((item) => item.id) } },
        });
        await tx.passwordRecoveryRequest.deleteMany({
          where: { userId: { in: ids } },
        });
        await tx.auditLog.deleteMany({ where: { userId: { in: ids } } });
        await tx.verification.deleteMany({
          where: { id: { startsWith: run } },
        });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      });
      await db.$disconnect();
    });
  },
);
