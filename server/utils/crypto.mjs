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

const SIX_DIGIT_RE = /^\d{6}$/;

export function isValidRecoveryCodeFormat(value) {
  return typeof value === 'string' && SIX_DIGIT_RE.test(value);
}

/**
 * Generates a cryptographically random 6-digit numeric string (000000-999999),
 * preserving leading zeros and optionally avoiding an excluded code.
 */
export function generateRecoveryCode(excludeCode = null) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const num = crypto.randomInt(0, 1_000_000);
    const code = String(num).padStart(6, '0');
    if (SIX_DIGIT_RE.test(code) && code !== excludeCode) {
      return code;
    }
  }
  const fallback = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return fallback === excludeCode
    ? String((Number(fallback) + 1) % 1_000_000).padStart(6, '0')
    : fallback;
}

function getRecoveryAesKey() {
  return crypto
    .createHash('sha256')
    .update(`tintalata-recovery-aes:${CONFIG.RECOVERY_CODE_SECRET}`)
    .digest();
}

export function hashRecoveryCode(userId, code) {
  if (!userId || !isValidRecoveryCodeFormat(code)) {
    throw new Error('Hindi wastong parameter para sa recovery code hash.');
  }
  return crypto
    .createHmac('sha256', CONFIG.RECOVERY_CODE_SECRET)
    .update(`recovery:${String(userId)}:${code}`)
    .digest('hex');
}

export function verifyRecoveryCodeHmac(userId, candidateCode, expectedHmac) {
  if (!userId || !isValidRecoveryCodeFormat(candidateCode) || !expectedHmac) {
    return false;
  }
  const actualBuf = Buffer.from(hashRecoveryCode(userId, candidateCode), 'utf8');
  const expectedBuf = Buffer.from(String(expectedHmac), 'utf8');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function encryptRecoveryCode(code, userId) {
  if (!userId || !isValidRecoveryCodeFormat(code)) {
    throw new Error('Hindi wastong 6-digit recovery code.');
  }
  const key = getRecoveryAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(userId), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptRecoveryCode(payload, userId) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('v1:') || !userId) {
    return null;
  }
  const parts = payload.split(':');
  if (parts.length !== 4) return null;
  const [, ivHex, tagHex, cipherHex] = parts;
  try {
    const key = getRecoveryAesKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAAD(Buffer.from(String(userId), 'utf8'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    return isValidRecoveryCodeFormat(decrypted) ? decrypted : null;
  } catch {
    return null;
  }
}

export function signRecoveryProofToken({ userId, codeId }) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      purpose: 'recovery-verified',
      uid: String(userId),
      cid: String(codeId),
      nonce: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + CONFIG.RECOVERY_PROOF_TTL_MS,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', CONFIG.RECOVERY_CODE_SECRET)
    .update(`proof:${payload}`)
    .digest('hex');
  return `${payload}.${sig}`;
}

export function verifyRecoveryProofToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', CONFIG.RECOVERY_CODE_SECRET)
    .update(`proof:${payload}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      !decoded ||
      decoded.purpose !== 'recovery-verified' ||
      !decoded.uid ||
      !decoded.cid ||
      !decoded.exp ||
      Number(decoded.exp) <= Date.now()
    ) {
      return null;
    }
    return { userId: String(decoded.uid), codeId: String(decoded.cid) };
  } catch {
    return null;
  }
}
