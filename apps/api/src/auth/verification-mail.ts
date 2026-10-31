import { createHash } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { DeliveryProvider } from '../modules/notifications/delivery-provider.js';

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
  if (result.state !== 'ACCEPTED')
    throw new APIError('SERVICE_UNAVAILABLE', {
      message:
        'The verification email could not be confirmed. Please try again later.',
    });
}
