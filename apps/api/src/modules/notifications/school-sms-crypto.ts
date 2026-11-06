import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
function key(value: string | undefined) {
  if (!value) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === 32 && bytes.toString('base64') === value
    ? bytes
    : null;
}
const keyId = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 12);
export function canEncryptSchoolSms() {
  return !!key(process.env.SCHOOL_SMS_ENCRYPTION_KEY);
}
export function canReadSchoolSms() {
  return (
    canEncryptSchoolSms() ||
    !!key(process.env.SCHOOL_SMS_PREVIOUS_ENCRYPTION_KEY)
  );
}
export function encryptSchoolSms(
  schoolId: string,
  id: string,
  value: { clientId: string; clientSecret: string },
) {
  const bytes = key(process.env.SCHOOL_SMS_ENCRYPTION_KEY);
  if (!bytes) throw new Error('School SMS encryption not configured');
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', bytes, nonce);
  cipher.setAAD(Buffer.from('school-sms:' + schoolId + ':' + id));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    keyId(bytes),
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}
export function decryptSchoolSms(
  schoolId: string,
  id: string,
  sealed: string,
): { clientId: string; clientSecret: string } | null {
  try {
    const [version, fingerprint, nonce, tag, body] = sealed.split('.');
    if (version !== 'v1' || !nonce || !tag || !body) return null;
    const bytes = [
      key(process.env.SCHOOL_SMS_ENCRYPTION_KEY),
      key(process.env.SCHOOL_SMS_PREVIOUS_ENCRYPTION_KEY),
    ].find((value) => value && keyId(value) === fingerprint);
    if (!bytes) return null;
    const cipher = createDecipheriv(
      'aes-256-gcm',
      bytes,
      Buffer.from(nonce, 'base64url'),
    );
    cipher.setAAD(Buffer.from('school-sms:' + schoolId + ':' + id));
    cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(body, 'base64url')),
        cipher.final(),
      ]).toString('utf8'),
    );
  } catch {
    return null;
  }
}
