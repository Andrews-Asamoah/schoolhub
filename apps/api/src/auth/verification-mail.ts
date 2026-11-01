import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { DeliveryProvider } from '../modules/notifications/delivery-provider.js';

const logger = new Logger('AccountVerification');

/** Requested account verification is an immediate security email, not a school broadcast. */
export async function sendAccountVerification(
  email: string,
  url: string,
  transport = new DeliveryProvider(),
) {
  if (!transport.emailConfigured())
    throw new APIError('SERVICE_UNAVAILABLE', {
      message:
        'Email verification delivery is not configured. Contact school support.',
    });
  const result = await transport.send(
    'EMAIL',
    'verify_' + createHash('sha256').update(url).digest('hex'),
    {
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: 'Verify your SchoolHub email',
      text: `Verify this email address for your SchoolHub account using the link below. The link expires in one hour. If you did not request this, ignore this email.\n\n${url}`,
    },
  );
  if (result.state !== 'ACCEPTED') {
    logger.warn(JSON.stringify({ event: 'account.verification.delivery_failed', reason: result.reason, providerStatus: result.providerStatus ?? null, providerCode: result.providerCode ?? null }));
    let message = 'The verification email could not be confirmed. Please try again later.';
    if (result.providerStatus === 429 || result.providerCode === 'daily_quota_exceeded' || result.providerCode === 'monthly_quota_exceeded') message = 'Resend has reached a sending limit. Check the account quota and try again later.';
    else if (result.providerStatus === 401) message = 'Resend rejected the email API key. Ask the administrator to check RESEND_API_KEY and restart the API.';
    else if (result.providerStatus === 403) message = 'Resend denied this email. Ask the administrator to check the verified sender domain, API key permissions and any test-recipient restrictions in Resend Logs.';
    else if (result.providerStatus === 400 || result.providerStatus === 422) message = 'Resend rejected the verification email details. Check the API key, sender and recipient addresses; the administrator can inspect Resend Logs for the exact error.';
    else if (result.providerStatus === 409) message = 'Resend could not process this verification request yet. Wait a moment, then request a fresh verification email.';
    else if (result.reason === 'PROVIDER_OUTCOME_UNKNOWN') message = 'SchoolHub could not confirm a response from Resend. Check your inbox before retrying; the administrator should check the API server connection to Resend.';
    else if (result.providerStatus && result.providerStatus >= 500) message = 'Resend is temporarily unable to confirm this email. Check your inbox and try again later.';
    throw new APIError('SERVICE_UNAVAILABLE', { message });
  }
}
