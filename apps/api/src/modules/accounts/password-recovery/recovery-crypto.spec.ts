import { describe, expect, it } from 'vitest';
import { openRecovery, recoveryHash, sealRecovery } from './recovery-crypto.js';
const secret = 'unit-test-recovery-secret-at-least-32-characters';
const payload = {
  from: 'alerts@example.test',
  to: 'user@example.test',
  subject: 'Reset',
  text: 'https://portal.example.test/reset-password#token=secret-link',
};
describe('recovery bearer material protection', () => {
  it('encrypts contact and link data with authenticated request-bound encryption', () => {
    const sealed = sealRecovery('request-1', payload, secret);
    expect(sealed).not.toContain('secret-link');
    expect(sealed).not.toContain('user@example.test');
    expect(openRecovery('request-1', sealed, secret)).toEqual(payload);
    expect(sealRecovery('request-1', payload, secret)).not.toBe(sealed);
  });
  it('rejects altered ciphertext, request substitution and secret rotation', () => {
    const sealed = sealRecovery('request-1', payload, secret);
    expect(() => openRecovery('request-2', sealed, secret)).toThrow();
    expect(() =>
      openRecovery('request-1', sealed, secret + 'rotated'),
    ).toThrow();
    const parts = sealed.split('.');
    parts[2] = 'AAAA' + parts[2];
    expect(() => openRecovery('request-1', parts.join('.'), secret)).toThrow();
  });
  it('stores a non-reversible token fingerprint and refuses weak encryption configuration', () => {
    expect(recoveryHash('raw-token')).toHaveLength(64);
    expect(() => sealRecovery('request-1', payload, 'short')).toThrow();
  });
});
