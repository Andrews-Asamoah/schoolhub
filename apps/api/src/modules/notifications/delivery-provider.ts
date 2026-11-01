import type { SchoolHubtelConnectionInput } from '@schoolhub/shared';
export type HubtelSmsCredentials = SchoolHubtelConnectionInput;
import { z } from 'zod';
export type DeliveryPayload = {
  from: string;
  to: string;
  subject?: string;
  text: string;
};
export type ProviderResult =
  | { state: 'ACCEPTED'; messageId: string }
  | { state: 'RETRY' | 'FAILED' | 'UNKNOWN'; reason: string; providerStatus?: number; providerCode?: string };
const resendErrorCodes = new Set(['missing_api_key', 'invalid_api_key', 'restricted_api_key', 'authentication_error', 'authorization_error', 'validation_error', 'invalid_parameter', 'invalid_access', 'invalid_from_address', 'unprocessable_entity', 'rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded', 'invalid_idempotency_key', 'invalid_idempotent_request', 'concurrent_idempotent_requests', 'application_error', 'internal_server_error', 'invalid_permission', 'suspended_api_key', 'service_unavailable']);
export function ghanaPhone(value: string): string | null {
  let phone = value.replace(/[\s()-]/g, '');
  if (/^0[25]\d{8}$/.test(phone)) phone = '+233' + phone.slice(1);
  if (/^233[25]\d{8}$/.test(phone)) phone = '+' + phone;
  return /^\+233[25]\d{8}$/.test(phone) ? phone : null;
}
export function deliveryPayload(
  channel: string,
  to: string,
  from: string,
  origin: string,
): DeliveryPayload {
  if (channel === 'EMAIL')
    return {
      from,
      to,
      subject: 'New SchoolHub notification',
      text: `A new school notification is available. Sign in securely to view it: ${new URL('/notifications', origin).href}`,
    };
  return {
    from,
    to,
    text: 'SchoolHub: A school update is available. Sign in to view it.',
  };
}
export class DeliveryProvider {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly config: NodeJS.ProcessEnv = process.env,
  ) {}
  /** Requested account-security mail does not depend on school broadcast controls or receipts. */
  emailConfigured() {
    return Boolean(this.config.RESEND_API_KEY?.trim() && z.email().safeParse(this.config.RESEND_FROM_EMAIL).success);
  }
  configured(channel: string, sms?: HubtelSmsCredentials) {
    if (this.config.NOTIFICATION_DELIVERY_ENABLED !== 'true') return false;
    if (channel === 'EMAIL')
      return Boolean(
        this.emailConfigured() &&
        this.config.RESEND_WEBHOOK_SECRET,
      );
    if (channel !== 'SMS' || !sms) return false;
    try {
      this.hubtelBase(sms);
      return Boolean(
        sms.clientId &&
        sms.clientSecret &&
        sms.senderId &&
        /^[a-zA-Z0-9]{1,11}$/.test(sms.senderId),
      );
    } catch {
      return false;
    }
  }
  private hubtelBase(sms: HubtelSmsCredentials) {
    const url = new URL(sms.apiBaseUrl);
    if (
      url.protocol !== 'https:' ||
      !/^([a-z0-9-]+\.)?hubtel\.com$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.replace(/\/$/, '') !== '/v1/messages'
    )
      throw new Error('Invalid Hubtel endpoint configuration');
    return url.href.replace(/\/$/, '');
  }
  async send(
    channel: string,
    id: string,
    payload: DeliveryPayload,
    sms?: HubtelSmsCredentials,
  ): Promise<ProviderResult> {
    const email = channel === 'EMAIL';
    if (!email && !sms)
      return { state: 'FAILED', reason: 'SCHOOL_SMS_ACCOUNT_REQUIRED' };
    if (!email && sms && payload.from !== sms.senderId)
      return { state: 'FAILED', reason: 'SMS_SENDER_ACCOUNT_MISMATCH' };
    try {
      const response = await this.request(
        email
          ? 'https://api.resend.com/emails'
          : this.hubtelBase(sms!) + '/send',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: email
            ? {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
                'Idempotency-Key': 'schoolhub/' + id,
              }
            : {
                'Content-Type': 'application/json',
                Authorization:
                  'Basic ' +
                  Buffer.from(`${sms!.clientId}:${sms!.clientSecret}`).toString(
                    'base64',
                  ),
              },
          body: JSON.stringify(
            email
              ? {
                  from: payload.from,
                  to: [payload.to],
                  subject: payload.subject,
                  text: payload.text,
                  tags: [{ name: 'delivery_id', value: id }],
                }
              : { from: payload.from, to: payload.to, content: payload.text },
          ),
        },
      );
      if (!response.ok) {
        // Retain only a known provider code and numeric status. Never expose/log the
        // response message, which can contain recipients or echoed request data.
        let providerCode: string | undefined;
        if (email) {
          try {
            const body = await response.json() as { name?: unknown };
            if (typeof body?.name === 'string' && resendErrorCodes.has(body.name)) providerCode = body.name;
          } catch { /* Non-JSON rejection still has a useful HTTP status. */ }
        }
        return {
          state: response.status === 429 ? 'RETRY' : response.status >= 500 ? (email ? 'RETRY' : 'UNKNOWN') : 'FAILED',
          reason: response.status === 429 ? 'PROVIDER_RATE_LIMIT' : response.status >= 500 ? 'PROVIDER_UNCERTAIN' : 'PROVIDER_REJECTED',
          ...(email ? { providerStatus: response.status, ...(providerCode ? { providerCode } : {}) } : {}),
        };
      }
      const data = (await response.json()) as {
        id?: unknown;
        data?: { messageId?: unknown };
      };
      const messageId = email ? data.id : data.data?.messageId;
      if (
        typeof messageId !== 'string' ||
        messageId.length < 1 ||
        messageId.length > 200
      )
        return {
          state: email ? 'RETRY' : 'UNKNOWN',
          reason: 'INVALID_PROVIDER_RESPONSE',
        };
      return { state: 'ACCEPTED', messageId };
    } catch {
      return {
        state: email ? 'RETRY' : 'UNKNOWN',
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
      };
    }
  }
  async smsStatus(
    messageId: string,
    sms?: HubtelSmsCredentials,
  ): Promise<'DELIVERED' | 'FAILED' | 'ACCEPTED' | 'UNKNOWN'> {
    if (!sms) return 'UNKNOWN';
    try {
      const response = await this.request(
        this.hubtelBase(sms) + '/' + encodeURIComponent(messageId),
        {
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${sms!.clientId}:${sms!.clientSecret}`).toString(
                'base64',
              ),
          },
        },
      );
      if (!response.ok) return 'UNKNOWN';
      const body = (await response.json()) as {
        data?: { messageId?: string; status?: string };
      };
      if (body.data?.messageId !== messageId) return 'UNKNOWN';
      const status = body.data.status?.toUpperCase();
      return status === 'DELIVERED'
        ? 'DELIVERED'
        : ['UNDELIVERED', 'FAILED', 'REJECTED', 'EXPIRED'].includes(
              status ?? '',
            )
          ? 'FAILED'
          : [
                'SENT',
                'ACCEPTED',
                'PENDING',
                'ACKNOWLEDGED',
                'SCHEDULED',
                'SUBMITTED',
              ].includes(status ?? '')
            ? 'ACCEPTED'
            : 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
}
export const deliveryStateForEvent: Record<string, string> = {
  'email.sent': 'ACCEPTED',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'DELAYED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.failed': 'FAILED',
  'email.suppressed': 'SUPPRESSED',
};
export function advancesDelivery(current: string, next: string) {
  const rank: Record<string, number> = {
    PENDING: 0,
    SENDING: 0,
    UNKNOWN: 0,
    DEAD: 0,
    EXPIRED: 0,
    ACCEPTED: 1,
    DELAYED: 2,
    DELIVERED: 3,
    FAILED: 4,
    SUPPRESSED: 4,
    BOUNCED: 5,
    COMPLAINED: 6,
  };
  return (rank[next] ?? -1) > (rank[current] ?? 0);
}
