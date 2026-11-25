import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATABASE_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';

const DATA_DIR = process.env.VERCEL
  ? '/tmp/tintalata-data'
  : path.resolve(import.meta.dirname, '..', 'data');

function resolveSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  // On serverless platforms like Vercel, /tmp is not shared across instances.
  // Derive a deterministic deployment-scoped HMAC key so cookies verify across instances.
  if (process.env.VERCEL) {
    const scope =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      'tintalata-vercel-default';
    const adminPass = process.env.ADMIN_PASSWORD || 'TintalataAdmin#2026';
    return crypto
      .createHash('sha256')
      .update(`tintalata-secret:${scope}:${adminPass}`)
      .digest('hex');
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const secretFile = path.join(DATA_DIR, '.session-secret');
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export const CONFIG = {
  PORT: Number(process.env.PORT || 3001),
  DATA_DIR,
  DATABASE_URL,
  DB_PATH: process.env.TINTALATA_DB_PATH || path.join(DATA_DIR, 'tintalata.db'),
  STORAGE_MODE: DATABASE_URL
    ? 'postgres'
    : process.env.VERCEL
      ? 'sqlite-ephemeral'
      : 'sqlite-local',
  SESSION_SECRET: resolveSessionSecret(),
  SESSION_COOKIE_NAME: 'tintalata_session',
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  DEFAULT_STORAGE_QUOTA_BYTES: 50 * 1024 * 1024, // 50 MB
  ADMIN_SEED_EMAIL: (process.env.ADMIN_EMAIL || 'admin@tintalata.ph').toLowerCase(),
  ADMIN_SEED_PASSWORD: process.env.ADMIN_PASSWORD || 'TintalataAdmin#2026',
  ADMIN_SEED_NAME: process.env.ADMIN_NAME || 'Tagapangasiwa ng Sistema',
  MAX_JSON_BODY: '25mb',
};
