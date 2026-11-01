import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryTransport } from './recovery-transport.js';
import { DeliveryProvider } from '../../notifications/delivery-provider.js';

describe('password recovery transport configuration', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('sends account recovery with school broadcasts disabled and no webhook secret', async () => {
    vi.stubEnv('RESEND_API_KEY', 'synthetic-only-key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'alerts@example.test');
    vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'false');
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'recovery-email' }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    const transport = new RecoveryTransport();
    expect(transport.configured('EMAIL')).toBe(true);
    expect(transport.configured('SMS')).toBe(false);
    expect(new DeliveryProvider().configured('EMAIL')).toBe(false);
    expect(await transport.send('EMAIL', 'recovery-synthetic', { from: 'alerts@example.test', to: 'user@example.test', subject: 'Reset password', text: 'Synthetic test content' })).toEqual({ state: 'ACCEPTED', messageId: 'recovery-email' });
    expect(request.mock.calls[0][0]).toBe('https://api.resend.com/emails');
  });
  it.each([
    ['', 'alerts@example.test'],
    ['   ', 'alerts@example.test'],
    ['synthetic-only-key', ''],
    ['synthetic-only-key', 'invalid-email'],
  ])('refuses recovery when key or sender is missing or invalid', (key, from) => {
    vi.stubEnv('RESEND_API_KEY', key); vi.stubEnv('RESEND_FROM_EMAIL', from);
    vi.stubEnv('NOTIFICATION_DELIVERY_ENABLED', 'true'); vi.stubEnv('RESEND_WEBHOOK_SECRET', 'synthetic-only-secret');
    expect(new RecoveryTransport().configured('EMAIL')).toBe(false);
  });
});
