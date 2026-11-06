import { afterEach, describe, expect, it, vi } from 'vitest';
import { schoolHubtelConnectionSchema } from '@schoolhub/shared';
import {
  canEncryptSchoolSms,
  decryptSchoolSms,
  encryptSchoolSms,
} from './school-sms-crypto.js';
const first = Buffer.alloc(32, 1).toString('base64'),
  second = Buffer.alloc(32, 2).toString('base64'),
  auth = { clientId: 'synthetic-client', clientSecret: 'synthetic-secret' };
describe('school SMS credential isolation', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('encrypts credentials and binds ciphertext to school and version', () => {
    vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', first);
    const sealed = encryptSchoolSms('school-a', 'version-1', auth);
    expect(sealed).not.toContain(auth.clientSecret);
    expect(sealed).not.toContain(auth.clientId);
    expect(decryptSchoolSms('school-a', 'version-1', sealed)).toEqual(auth);
    expect(decryptSchoolSms('school-b', 'version-1', sealed)).toBeNull();
    expect(decryptSchoolSms('school-a', 'version-2', sealed)).toBeNull();
    expect(decryptSchoolSms('school-a', 'version-1', sealed + 'x')).toBeNull();
  });
  it('supports a previous key during rotation without accepting weak keys', () => {
    vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', first);
    const sealed = encryptSchoolSms('a', 'one', auth);
    vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', second);
    expect(decryptSchoolSms('a', 'one', sealed)).toBeNull();
    vi.stubEnv('SCHOOL_SMS_PREVIOUS_ENCRYPTION_KEY', first);
    expect(decryptSchoolSms('a', 'one', sealed)).toEqual(auth);
    vi.stubEnv('SCHOOL_SMS_ENCRYPTION_KEY', 'short');
    expect(canEncryptSchoolSms()).toBe(false);
    expect(() => encryptSchoolSms('a', 'two', auth)).toThrow(/not configured/);
  });
  it('accepts only approved-format senders and documented HTTPS hosts without credential query strings', () => {
    const input = {
      ...auth,
      senderId: 'CampusA',
      apiBaseUrl: 'https://sms.hubtel.com/v1/messages',
    };
    expect(schoolHubtelConnectionSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { senderId: 'TooLongSenderName' },
      { clientSecret: '' },
      { apiBaseUrl: 'https://evil.example/v1/messages' },
      {
        apiBaseUrl:
          'https://sms.hubtel.com/v1/messages/send?clientsecret=synthetic',
      },
    ])
      expect(
        schoolHubtelConnectionSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
});
