import { describe, expect, it } from 'vitest';
import { originPolicy } from '../common/origin-policy.js';
import { nativeAuthOrigin, trustedAuthOrigins } from './native-auth-origin.js';

describe('native authentication origin', () => {
  const policy = originPolicy({
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://school.example.test',
  });
  const request = (path: string, headers: HeadersInit, method = 'POST') =>
    new Request(`https://api.example.test/api/auth/${path}`, {
      method,
      headers,
    });

  it('adds only the exact app scheme on the scoped native auth routes', async () => {
    for (const path of [
      'sign-in/email',
      'two-factor/verify-totp',
      'two-factor/verify-backup-code',
    ]) {
      const trusted = request(path, { 'expo-origin': 'schoolhub://' });
      expect(trustedAuthOrigins(policy.trustedOrigins, trusted)).toEqual([
        'https://school.example.test',
        'schoolhub://',
      ]);
      expect(
        (await nativeAuthOrigin.onRequest(trusted))?.request.headers.get(
          'origin',
        ),
      ).toBe('schoolhub://');
    }
    expect(policy.allows('schoolhub://')).toBe(false);
  });

  it('preserves browser origin and rejects native-origin overrides outside the allowed routes', async () => {
    for (const untrusted of [
      request('two-factor/verify-totp', {
        'expo-origin': 'schoolhub://',
        origin: 'https://untrusted.example.test',
      }),
      request('two-factor/verify-totp', {
        'expo-origin': 'schoolhub://',
        'sec-fetch-site': 'cross-site',
      }),
      request('two-factor/verify-totp', { 'expo-origin': 'exp://' }),
      request('two-factor/verify-totp', {}),
      request(
        'two-factor/verify-totp',
        { 'expo-origin': 'schoolhub://' },
        'GET',
      ),
      request('change-password', { 'expo-origin': 'schoolhub://' }),
    ]) {
      expect(trustedAuthOrigins(policy.trustedOrigins, untrusted)).toEqual(
        policy.trustedOrigins,
      );
      expect(await nativeAuthOrigin.onRequest(untrusted)).toBeUndefined();
    }
  });
});
