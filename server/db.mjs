import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CONFIG } from './config.mjs';
import { hashPassword } from './utils/crypto.mjs';

export function createDatabase(dbPath = CONFIG.DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      student_number TEXT DEFAULT '',
      course_section TEXT DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
      storage_quota_bytes INTEGER NOT NULL DEFAULT ${CONFIG.DEFAULT_STORAGE_QUOTA_BYTES},
      storage_used_bytes INTEGER NOT NULL DEFAULT 0,
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
      size_bytes INTEGER NOT NULL DEFAULT 0,
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

  ensureMigrations(db);
  seedDefaultAdmin(db);
  linkStudentsToAdmin(db);
  return db;
}

function linkStudentsToAdmin(db) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (admin) {
    db.prepare(
      "UPDATE users SET managed_by_admin_id = ? WHERE role = 'student' AND managed_by_admin_id IS NULL"
    ).run(admin.id);
  }
}

function ensureMigrations(db) {
  const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!userCols.has('managed_by_admin_id')) {
    db.exec('ALTER TABLE users ADD COLUMN managed_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!userCols.has('notification_settings_json')) {
    db.exec(
      `ALTER TABLE users ADD COLUMN notification_settings_json TEXT NOT NULL DEFAULT '{"notifyAutoSave":true,"notifyStorageAlerts":true,"notifyShareAlerts":true,"notifyPrivacyRequests":true,"defaultDownloadFormat":"docx"}'`
    );
  }

  const docCols = new Set(db.prepare('PRAGMA table_info(documents)').all().map((c) => c.name));
  if (!docCols.has('page_doodle_json')) {
    db.exec(`ALTER TABLE documents ADD COLUMN page_doodle_json TEXT NOT NULL DEFAULT '{"strokes":[],"dataUrl":""}'`);
  }
  if (!docCols.has('is_favorite')) {
    db.exec(`ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`);
  }
  if (!docCols.has('last_opened_at')) {
    db.exec(`ALTER TABLE documents ADD COLUMN last_opened_at TEXT`);
  }
}

export function seedDefaultAdmin(db) {
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();

  if (!existingAdmin) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, student_number, course_section,
        role, status, storage_quota_bytes, storage_used_bytes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', 'Pangasiwaan', 'admin', 'active', ?, 0, ?, ?)`
    ).run(
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

export function logAudit(db, { actorId, targetUserId, action, details = '' }) {
  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, target_user_id, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    actorId || null,
    targetUserId || null,
    action,
    details,
    new Date().toISOString()
  );
}
