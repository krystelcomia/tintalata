import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { CONFIG } from './config.mjs';
import { hashPassword } from './utils/crypto.mjs';

const { Pool } = pg;

function toPgPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function createSqliteAdapter(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL;');
  }

  return {
    dialect: 'sqlite',
    storageMode: dbPath === ':memory:' ? 'sqlite-memory' : CONFIG.STORAGE_MODE,
    async get(sql, ...params) {
      return raw.prepare(sql).get(...params);
    },
    async all(sql, ...params) {
      return raw.prepare(sql).all(...params);
    },
    async run(sql, ...params) {
      const info = raw.prepare(sql).run(...params);
      return { changes: Number(info?.changes || 0) };
    },
    async exec(sql) {
      raw.exec(sql);
    },
    async close() {
      raw.close();
    },
  };
}

function createPostgresAdapter(connectionString) {
  const needsSsl =
    !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  const pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  return {
    dialect: 'postgres',
    storageMode: 'postgres',
    async get(sql, ...params) {
      const res = await pool.query(toPgPlaceholders(sql), params);
      return res.rows[0] || undefined;
    },
    async all(sql, ...params) {
      const res = await pool.query(toPgPlaceholders(sql), params);
      return res.rows;
    },
    async run(sql, ...params) {
      const res = await pool.query(toPgPlaceholders(sql), params);
      return { changes: Number(res.rowCount || 0) };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

export async function createDatabase(dbPath = CONFIG.DB_PATH) {
  const usePostgres =
    dbPath !== ':memory:' &&
    Boolean(CONFIG.DATABASE_URL) &&
    /^postgres(ql)?:\/\//i.test(CONFIG.DATABASE_URL);

  const db = usePostgres
    ? createPostgresAdapter(CONFIG.DATABASE_URL)
    : createSqliteAdapter(dbPath);

  const int64Type = db.dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  const emailColDef =
    db.dialect === 'postgres' ? 'TEXT NOT NULL UNIQUE' : 'TEXT NOT NULL UNIQUE COLLATE NOCASE';

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email ${emailColDef},
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      student_number TEXT DEFAULT '',
      course_section TEXT DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
      storage_quota_bytes ${int64Type} NOT NULL DEFAULT ${CONFIG.DEFAULT_STORAGE_QUOTA_BYTES},
      storage_used_bytes ${int64Type} NOT NULL DEFAULT 0,
      managed_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      notification_settings_json TEXT NOT NULL DEFAULT '{"notifyAutoSave":true,"notifyStorageAlerts":true,"notifyShareAlerts":true,"notifyPrivacyRequests":true,"defaultDownloadFormat":"docx"}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      icon TEXT NOT NULL DEFAULT 'folder',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      deleted_with_parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      doodles_json TEXT NOT NULL DEFAULT '[]',
      page_doodle_json TEXT NOT NULL DEFAULT '{"strokes":[],"dataUrl":""}',
      page_settings_json TEXT NOT NULL DEFAULT '{"orientation":"portrait","margins":"normal","pageColor":"#ffffff"}',
      word_count INTEGER NOT NULL DEFAULT 0,
      size_bytes ${int64Type} NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      deleted_with_folder_id TEXT,
      last_opened_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_shares (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_level TEXT NOT NULL CHECK (permission_level IN ('read', 'read_write')),
      created_at TEXT NOT NULL,
      UNIQUE(document_id, shared_with_user_id)
    );

    CREATE TABLE IF NOT EXISTS access_grants (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      permission_level TEXT NOT NULL CHECK (permission_level IN ('read', 'read_write')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'revoked', 'expired')),
      reason TEXT NOT NULL DEFAULT '',
      requested_by_admin INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      responded_at TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      student_number TEXT DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_access_grants_student ON access_grants(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_password_resets_status ON password_reset_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_document_shares_target ON document_shares(shared_with_user_id);
  `);

  await ensureMigrations(db);
  await seedDefaultAdmin(db);
  await linkStudentsToAdmin(db);
  return db;
}

async function ensureMigrations(db) {
  if (db.dialect === 'postgres') {
    await db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));'
    );
    return;
  }

  const userCols = new Set((await db.all('PRAGMA table_info(users)')).map((c) => c.name));
  if (!userCols.has('managed_by_admin_id')) {
    await db.exec(
      'ALTER TABLE users ADD COLUMN managed_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL'
    );
  }
  if (!userCols.has('notification_settings_json')) {
    await db.exec(
      `ALTER TABLE users ADD COLUMN notification_settings_json TEXT NOT NULL DEFAULT '{"notifyAutoSave":true,"notifyStorageAlerts":true,"notifyShareAlerts":true,"notifyPrivacyRequests":true,"defaultDownloadFormat":"docx"}'`
    );
  }

  const docCols = new Set((await db.all('PRAGMA table_info(documents)')).map((c) => c.name));
  if (!docCols.has('page_doodle_json')) {
    await db.exec(
      `ALTER TABLE documents ADD COLUMN page_doodle_json TEXT NOT NULL DEFAULT '{"strokes":[],"dataUrl":""}'`
    );
  }
  if (!docCols.has('is_favorite')) {
    await db.exec('ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
  }
  if (!docCols.has('last_opened_at')) {
    await db.exec('ALTER TABLE documents ADD COLUMN last_opened_at TEXT');
  }
}

export async function seedDefaultAdmin(db) {
  const existingAdmin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!existingAdmin) {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO users (
        id, email, password_hash, full_name, student_number, course_section,
        role, status, storage_quota_bytes, storage_used_bytes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', 'Pangasiwaan', 'admin', 'active', ?, 0, ?, ?)`,
      crypto.randomUUID(),
      CONFIG.ADMIN_SEED_EMAIL,
      hashPassword(CONFIG.ADMIN_SEED_PASSWORD),
      CONFIG.ADMIN_SEED_NAME,
      CONFIG.DEFAULT_STORAGE_QUOTA_BYTES,
      now,
      now
    );
  }
}

async function linkStudentsToAdmin(db) {
  const admin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) {
    await db.run(
      "UPDATE users SET managed_by_admin_id = ? WHERE role = 'student' AND managed_by_admin_id IS NULL",
      admin.id
    );
  }
}

export async function logAudit(db, { actorId, targetUserId, action, details = '' }) {
  await db.run(
    `INSERT INTO audit_logs (id, actor_id, target_user_id, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    actorId || null,
    targetUserId || null,
    action,
    details,
    new Date().toISOString()
  );
}
