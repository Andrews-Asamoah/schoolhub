import { describe, expect, it, vi } from 'vitest';
import {
  advancesDelivery,
  DeliveryProvider,
  deliveryPayload,
  ghanaPhone,
} from './delivery-provider.js';
const config = {
  NOTIFICATION_DELIVERY_ENABLED: 'true',
  RESEND_API_KEY: 'test-only',
  RESEND_FROM_EMAIL: 'alerts@example.test',
  RESEND_WEBHOOK_SECRET: 'test-only',
  HUBTEL_CLIENT_ID: 'test-id',
  HUBTEL_CLIENT_SECRET: 'test-secret',
  HUBTEL_SENDER_ID: 'SchoolHub',
};
const email = deliveryPayload(
  'EMAIL',
  'user@example.test',
  'alerts@example.test',
  'https://portal.example.test',
);
const sms = deliveryPayload(
  'SMS',
  '+233241234567',
  'SchoolHub',
  'https://portal.example.test',
);
describe('notification provider contracts', () => {
  it('requires the global switch, email signing secret, and valid sender configuration', () => {
    expect(new DeliveryProvider(fetch, {}).configured('EMAIL')).toBe(false);
    expect(new DeliveryProvider(fetch, config).configured('EMAIL')).toBe(true);
    expect(
      new DeliveryProvider(fetch, {
        ...config,
        RESEND_WEBHOOK_SECRET: '',
      }).configured('EMAIL'),
    ).toBe(false);
    expect(
      new DeliveryProvider(fetch, {
        ...config,
        HUBTEL_SENDER_ID: 'Unapproved sender',
      }).configured('SMS'),
    ).toBe(false);
  });
  it('normalizes Ghana mobile numbers and rejects short, foreign and injected contacts', () => {
    expect(ghanaPhone('024 123 4567')).toBe('+233241234567');
    expect(ghanaPhone('233541234567')).toBe('+233541234567');
    for (const value of [
      '+12025550123',
      '123',
      '+233241234567;bad',
      '02412345678',
    ])
      expect(ghanaPhone(value)).toBeNull();
  });
  it('sends only a generic portal reminder with a stable email idempotency key', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
      );
    const provider = new DeliveryProvider(request, config);
    expect(await provider.send('EMAIL', 'delivery-1', email)).toEqual({
      state: 'ACCEPTED',
      messageId: 'email-1',
    });
    await provider.send('EMAIL', 'delivery-1', email);
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
    expect(request.mock.calls[0][1].headers).toEqual(
      request.mock.calls[1][1].headers,
    );
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['Idempotency-Key']).toBe('schoolhub/delivery-1');
    expect(JSON.parse(init.body)).toMatchObject({
      to: ['user@example.test'],
      text: expect.stringContaining(
        'https://portal.example.test/notifications',
      ),
    });
    expect(sms.text.length).toBeLessThan(160);
    expect(/^[\x20-\x7e]+$/.test(sms.text)).toBe(true);
  });
  it('uses authenticated Hubtel JSON sending and polling, and validates the returned ID', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { messageId: 'sms-1' } }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { messageId: 'sms-1', status: 'Delivered' } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { messageId: 'different', status: 'Delivered' },
          }),
        ),
      );
    const provider = new DeliveryProvider(request, config);
    expect(await provider.send('SMS', 'delivery-1', sms)).toEqual({
      state: 'ACCEPTED',
      messageId: 'sms-1',
    });
    expect(request.mock.calls[0][0]).toBe(
      'https://smsc.hubtel.com/v1/messages/send',
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      from: 'SchoolHub',
      to: '+233241234567',
      content: sms.text,
    });
    expect(await provider.smsStatus('sms-1')).toBe('DELIVERED');
    expect(await provider.smsStatus('sms-1')).toBe('UNKNOWN');
    expect(request.mock.calls[1][1].headers.Authorization).toBe(
      'Basic ' + Buffer.from('test-id:test-secret').toString('base64'),
    );
  });
  it.each([500, 502])(
    'never blindly retries uncertain SMS HTTP %s',
    async (status) => {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status }));
      const provider = new DeliveryProvider(request, config);
      expect((await provider.send('SMS', 'd', sms)).state).toBe('UNKNOWN');
      expect((await provider.send('EMAIL', 'd', email)).state).toBe('RETRY');
    },
  );
  it('distinguishes rate limits, rejection, malformed success and network uncertainty', async () => {
    for (const [status, state] of [
      [429, 'RETRY'],
      [400, 'FAILED'],
      [201, 'UNKNOWN'],
    ] as const) {
      const request = vi.fn().mockResolvedValue(new Response('{}', { status }));
      expect(
        (await new DeliveryProvider(request, config).send('SMS', 'd', sms))
          .state,
      ).toBe(state);
    }
    const request = vi.fn().mockRejectedValue(new Error('timeout'));
    const provider = new DeliveryProvider(request, config);
    expect((await provider.send('SMS', 'd', sms)).state).toBe('UNKNOWN');
    expect((await provider.send('EMAIL', 'd', email)).state).toBe('RETRY');
  });
  it('rejects arbitrary endpoint overrides without making a request', async () => {
    const request = vi.fn();
    const provider = new DeliveryProvider(request, {
      ...config,
      HUBTEL_SMS_BASE_URL: 'https://evil.example/v1/messages',
    });
    expect((await provider.send('SMS', 'd', sms)).state).toBe('UNKNOWN');
    expect(provider.configured('SMS')).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('does not downgrade delivery receipts on delayed or replayed events', () => {
    expect(advancesDelivery('DELIVERED', 'ACCEPTED')).toBe(false);
    expect(advancesDelivery('DELIVERED', 'DELAYED')).toBe(false);
    expect(advancesDelivery('BOUNCED', 'DELIVERED')).toBe(false);
    expect(advancesDelivery('DELIVERED', 'COMPLAINED')).toBe(true);
    expect(advancesDelivery('UNKNOWN', 'DELIVERED')).toBe(true);
  });
});
