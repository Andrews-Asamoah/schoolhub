import { describe, expect, it, vi } from 'vitest';
import {
  registerSyncDeviceSchema,
  syncDeviceQuerySchema,
  revokeSyncDeviceSchema,
} from '@schoolhub/shared';
import { SyncDeviceService } from './sync-device.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

describe('device API boundaries', () => {
  it('rejects secret/identity injection, unsupported platforms and unreadable names', () => {
    const input = {
      installationId: '4e93259c-ae98-4257-90dd-916bdcc6b33b',
      name: 'Staff PC',
      platform: 'windows',
    };
    const pipe = new ZodValidationPipe(registerSyncDeviceSchema);
    expect(pipe.transform(input)).toEqual(input);
    for (const bad of [
      { ...input, userId: 'another' },
      { ...input, schoolId: 'another' },
      { ...input, token: 'secret' },
      { ...input, installationId: 'bad' },
      { ...input, platform: 'browser' },
      { ...input, name: '\n' },
      { ...input, name: 'A\u0000B' },
    ]) {
      expect(() => pipe.transform(bad)).toThrow(/Validation failed/);
    }
    expect(syncDeviceQuerySchema.parse({})).toEqual({
      scope: 'mine',
      page: 1,
      limit: 25,
    });
    expect(
      syncDeviceQuerySchema.safeParse({ scope: 'all-schools' }).success,
    ).toBe(false);
    expect(syncDeviceQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(revokeSyncDeviceSchema.safeParse({ reason: '  ' }).success).toBe(
      false,
    );
  });
  it('rejects missing guard context before issuing a database query', async () => {
    const query = vi.fn();
    const service = new SyncDeviceService({
      client: { session: { findUnique: query } },
    } as never);
    await expect(
      service.requireBoundDevice(undefined!, 'user', 'session'),
    ).rejects.toThrow(/select a school/);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects an expired server session and cross-account bindings', async () => {
    const row = {
      userId: 'user',
      expiresAt: new Date(0),
      clientPlatform: 'desktop',
      desktopDevice: { schoolId: 'school', userId: 'user', revokedAt: null },
    };
    const query = vi.fn().mockResolvedValue(row);
    const service = new SyncDeviceService({
      client: { session: { findUnique: query } },
    } as never);
    await expect(
      service.requireBoundDevice('school', 'user', 'session'),
    ).rejects.toThrow(/Sign in again/);
    query.mockResolvedValue({
      ...row,
      expiresAt: new Date(Date.now() + 60000),
      desktopDevice: { ...row.desktopDevice, userId: 'other' },
    });
    await expect(
      service.requireBoundDevice('school', 'user', 'session'),
    ).rejects.toThrow(/Register an active installation/);
  });
});
