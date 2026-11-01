import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { DeliveryPayload } from '../../notifications/delivery-provider.js';
export const recoveryHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function key(secret: string) {
  if (secret.length < 32) throw new Error('Recovery encryption unavailable');
  return Buffer.from(
    hkdfSync('sha256', secret, 'schoolhub', 'password-recovery-v1', 32),
  );
}
export function sealRecovery(
  id: string,
  payload: DeliveryPayload,
  secret: string,
) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(secret), nonce);
  cipher.setAAD(Buffer.from(id));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), body]
    .map((value) => value.toString('base64url'))
    .join('.');
}
export function openRecovery(
  id: string,
  sealed: string,
  secret: string,
): DeliveryPayload {
  const parts = sealed.split('.');
  if (parts.length !== 3) throw new Error('Invalid recovery payload');
  const [nonce, tag, body] = parts.map((value) =>
    Buffer.from(value, 'base64url'),
  );
  const cipher = createDecipheriv('aes-256-gcm', key(secret), nonce);
  cipher.setAAD(Buffer.from(id));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8'),
  ) as DeliveryPayload;
}
