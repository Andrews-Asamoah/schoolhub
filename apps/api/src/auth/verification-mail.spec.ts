import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryProvider } from '../modules/notifications/delivery-provider.js';
import { sendAccountVerification } from './verification-mail.js';
describe('account verification delivery', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it('refuses missing configuration and exposes no credentials or provider errors', async () => {
    const transport = { emailConfigured: () => false, send: vi.fn() };
    await expect(
      sendAccountVerification(
        'user@example.test',
        'https://api.example.test/verify',
        transport as never,
      ),
    ).rejects.toThrow(/not configured/);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it('sends requested verification with broadcasts disabled and no webhook secret', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'verification-1' }), { status: 200 }));
    const transport = new DeliveryProvider(request, { NOTIFICATION_DELIVERY_ENABLED: 'false', RESEND_API_KEY: 'synthetic-only', RESEND_FROM_EMAIL: 'alerts@example.test' });
    expect(transport.configured('EMAIL')).toBe(false);
    await sendAccountVerification('user@example.test', 'https://api.example.test/api/auth/verify-email?token=synthetic-only', transport);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('https://api.resend.com/emails');
  });
  it.each([
    [401, 'validation_error', /API key/],
    [403, 'validation_error', /verified sender domain/],
    [422, 'validation_error', /sender and recipient addresses/],
    [429, 'rate_limit_exceeded', /sending limit/],
    [403, 'daily_quota_exceeded', /sending limit/],
    [500, 'application_error', /temporarily unable/],
  ] as const)('reports actionable verification failure for HTTP %s and %s', async (status, code, expected) => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
    const log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: code, message: 'private@example.test secret-token secret-key' }), { status }));
    const transport = new DeliveryProvider(request, { RESEND_API_KEY: 'secret-key', RESEND_FROM_EMAIL: 'alerts@example.test' });
    let message = '';
    try { await sendAccountVerification('private@example.test', 'https://api.example.test/verify?token=secret-token', transport); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(expected);
    expect(JSON.stringify(log.mock.calls)).toContain('account.verification.delivery_failed');
    expect(message + JSON.stringify(log.mock.calls)).not.toMatch(/private@example|secret-token|secret-key/);
  });
  it('sends an expiring verification link with a deterministic key and reports provider rejection', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
    const transport = {
      emailConfigured: () => true,
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
