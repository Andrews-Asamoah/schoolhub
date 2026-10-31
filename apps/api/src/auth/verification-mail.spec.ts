import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAccountVerification } from './verification-mail.js';
describe('account verification delivery', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('refuses missing configuration and exposes no credentials or provider errors', async () => {
    const transport = { configured: () => false, send: vi.fn() };
    await expect(
      sendAccountVerification(
        'user@example.test',
        'https://api.example.test/verify',
        transport as never,
      ),
    ).rejects.toThrow(/not configured/);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('sends an expiring verification link with a deterministic key and reports provider rejection', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
    const transport = {
      configured: () => true,
      send: vi
        .fn()
        .mockResolvedValue({ state: 'ACCEPTED', messageId: 'verification-1' }),
    };
    const url =
      'https://api.example.test/api/auth/verify-email?token=test-only';
    await sendAccountVerification('user@example.test', url, transport as never);
    await sendAccountVerification('user@example.test', url, transport as never);
    expect(transport.send.mock.calls[0]).toEqual(transport.send.mock.calls[1]);
    expect(transport.send.mock.calls[0][2]).toMatchObject({
      to: 'user@example.test',
      from: 'alerts@example.test',
      text: expect.stringContaining(url),
    });
    transport.send.mockResolvedValue({
      state: 'RETRY',
      reason: 'PROVIDER_RATE_LIMIT',
    });
    await expect(
      sendAccountVerification('user@example.test', url, transport as never),
    ).rejects.toThrow(/could not be confirmed/);
  });
});
