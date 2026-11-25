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

export function generateSessionToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', CONFIG.SESSION_SECRET)
    .update(rawToken)
    .digest('hex');
  return {
    cookieValue: `${rawToken}.${signature}`,
    tokenHash: hashToken(rawToken),
  };
}

export function verifySignedCookie(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string' || !cookieValue.includes('.')) {
    return null;
  }
  const [rawToken, signature] = cookieValue.split('.');
  if (!rawToken || !signature) return null;
  const expectedSig = crypto
    .createHmac('sha256', CONFIG.SESSION_SECRET)
    .update(rawToken)
    .digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return hashToken(rawToken);
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
