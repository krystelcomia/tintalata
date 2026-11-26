import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function generateSessionToken(claims = null, ttlMs = CONFIG.SESSION_TOKEN_LIFETIME_MS) {
  const sid = crypto.randomBytes(24).toString('hex');
  const payloadStr = claims
    ? Buffer.from(
        JSON.stringify({
          v: 2,
          sid,
          exp: Date.now() + ttlMs,
          uid: claims.id,
          em: claims.email,
          nm: claims.fullName || claims.full_name || '',
          sn: claims.studentNumber ?? claims.student_number ?? '',
          cs: claims.courseSection ?? claims.course_section ?? '',
          rl: claims.role,
          qt: Number(claims.storageQuotaBytes ?? claims.storage_quota_bytes ?? CONFIG.DEFAULT_STORAGE_QUOTA_BYTES),
        }),
        'utf8'
      ).toString('base64url')
    : crypto.randomBytes(32).toString('hex');

  const signature = crypto
    .createHmac('sha256', CONFIG.SESSION_SECRET)
    .update(payloadStr)
    .digest('hex');

  return {
    cookieValue: `${payloadStr}.${signature}`,
    tokenHash: hashToken(payloadStr),
  };
}

export function verifySessionCookie(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string' || !cookieValue.includes('.')) {
    return null;
  }
  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const payloadStr = cookieValue.slice(0, dotIdx);
  const signature = cookieValue.slice(dotIdx + 1);
  if (!payloadStr || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', CONFIG.SESSION_SECRET)
    .update(payloadStr)
    .digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let claims = null;
  try {
    const decoded = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (decoded && decoded.v === 2 && decoded.uid && decoded.em && decoded.rl) {
      claims = decoded;
    }
  } catch {
    claims = null;
  }

  return {
    tokenHash: hashToken(payloadStr),
    claims,
  };
}

export function verifySignedCookie(cookieValue) {
  return verifySessionCookie(cookieValue)?.tokenHash || null;
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
