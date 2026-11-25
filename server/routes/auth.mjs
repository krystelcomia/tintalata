import express from 'express';
import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { hashPassword, verifyPassword, generateSessionToken } from '../utils/crypto.mjs';
import { calculateDocumentBytes, getStorageSummary, recalculateUserStorage } from '../utils/storage.mjs';
import { countWords } from '../utils/sanitize.mjs';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth.mjs';
import { logAudit } from '../db.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUserPayload(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    studentNumber: row.student_number || '',
    courseSection: row.course_section || '',
    role: row.role,
    status: row.status,
    storageQuotaBytes: Number(row.storage_quota_bytes),
    storageUsedBytes: Number(row.storage_used_bytes),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function createStarterWorkspace(db, userId, fullName) {
  const now = new Date().toISOString();
  const folderId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO folders (id, user_id, parent_id, name, color, icon, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'blue', 'book', ?, ?)`
  ).run(folderId, userId, 'Mga Tala sa Klase', now, now);

  const welcomeTitle = 'Maligayang Pagdating sa Tintalata';
  const welcomeHtml = `<h1>Maligayang Pagdating, ${fullName.replace(/[<>&"]/g, '')}!</h1><p>Ito ang iyong pribadong espasyo sa <strong>Tintalata</strong> — isang modernong patnugot ng dokumento at guhit sa wikang Filipino.</p><h2>Mga Maaari Mong Gawin:</h2><ul><li><strong>Sumulat at Mag-format:</strong> Gamitin ang toolbar sa itaas upang pumili ng font, laki, kulay, pagkakahanay, mga talaan, at higit pa.</li><li><strong>Gumuhit ng Doodle:</strong> Pindutin ang <em>Gumuhit / Doodle</em> upang gumawa ng malayang guhit at ilagay ito mismo sa iyong dokumento.</li><li><strong>Ayusin sa mga Folder:</strong> Gumawa ng mga nako-customize na folder na may iba't ibang kulay at icon.</li><li><strong>Mag-download at Pamahalaan ang Storage:</strong> Maaaring i-download ang bawat dokumento o buong folder bilang ZIP, at bantayan ang iyong storage sa MB.</li></ul><blockquote>Paalala: Ligtas at pribado ang lahat ng iyong mga file. Walang ibang makakakita nito nang wala ang iyong pahintulot.</blockquote>`;
  const doodlesJson = '[]';
  const pageSettingsJson = JSON.stringify({
    orientation: 'portrait',
    margins: 'normal',
    pageColor: '#ffffff',
  });
  const sizeBytes = calculateDocumentBytes({
    title: welcomeTitle,
    contentHtml: welcomeHtml,
    doodlesJson,
    pageSettingsJson,
  });

  db.prepare(
    `INSERT INTO documents (
      id, user_id, folder_id, title, content_html, doodles_json,
      page_settings_json, word_count, size_bytes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    folderId,
    welcomeTitle,
    welcomeHtml,
    doodlesJson,
    pageSettingsJson,
    countWords(welcomeHtml),
    sizeBytes,
    now,
    now
  );

  recalculateUserStorage(db, userId);
}

export function createAuthRouter(db) {
  const router = express.Router();

  router.post('/register', (req, res) => {
    const {
      fullName = '',
      email = '',
      password = '',
      studentNumber = '',
      courseSection = '',
    } = req.body || {};

    const cleanName = String(fullName).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanStudentNum = String(studentNumber).trim();
    const cleanCourse = String(courseSection).trim();
    const rawPassword = String(password);

    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        error: 'Mangyaring ilagay ang iyong buong pangalan (hindi bababa sa 2 titik).',
      });
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({
        error: 'Mangyaring maglagay ng wastong email address.',
      });
    }
    if (rawPassword.length < 8 || !/[a-zA-Z]/.test(rawPassword) || !/\d/.test(rawPassword)) {
      return res.status(400).json({
        error:
          'Ang password ay dapat may hindi bababa sa 8 karakter at naglalaman ng parehong titik at numero.',
      });
    }
    if (cleanStudentNum.length > 40 || cleanCourse.length > 80) {
      return res.status(400).json({
        error: 'Masyadong mahaba ang Numero ng Mag-aaral o Kurso/Seksyon.',
      });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        error: 'May nakarehistro nang account gamit ang email na ito.',
      });
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(rawPassword);

    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, student_number, course_section,
        role, status, storage_quota_bytes, storage_used_bytes, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'student', 'active', ?, 0, ?, ?, ?)`
    ).run(
      userId,
      cleanEmail,
      passwordHash,
      cleanName,
      cleanStudentNum,
      cleanCourse,
      CONFIG.DEFAULT_STORAGE_QUOTA_BYTES,
      now,
      now,
      now
    );

    createStarterWorkspace(db, userId, cleanName);

    const { cookieValue, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + CONFIG.SESSION_TTL_MS).toISOString();
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      tokenHash,
      now,
      expiresAt,
      String(req.headers['user-agent'] || '').slice(0, 200)
    );

    logAudit(db, {
      actorId: userId,
      targetUserId: userId,
      action: 'STUDENT_REGISTERED',
      details: `Nagparehistro ang mag-aaral: ${cleanEmail}`,
    });

    setSessionCookie(res, cookieValue);
    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return res.status(201).json({
      message: 'Matagumpay na nairehistro ang iyong account!',
      user: sanitizeUserPayload(createdUser),
      storage: getStorageSummary(db, userId),
    });
  });

  router.post('/login', (req, res) => {
    const { email = '', password = '' } = req.body || {};
    const cleanEmail = String(email).trim().toLowerCase();
    const rawPassword = String(password);

    if (!cleanEmail || !rawPassword) {
      return res.status(400).json({
        error: 'Mangyaring ilagay ang iyong email at password.',
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user || !verifyPassword(rawPassword, user.password_hash)) {
      return res.status(401).json({
        error: 'Mali ang email o password na iyong inilagay.',
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'Ang iyong account ay kasalukuyang sinuspinde ng Tagapangasiwa.',
      });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({
        error: 'Ang iyong account ay hindi aktibo. Makipag-ugnayan sa Tagapangasiwa.',
      });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      user.id
    );

    const { cookieValue, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + CONFIG.SESSION_TTL_MS).toISOString();
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      tokenHash,
      now,
      expiresAt,
      String(req.headers['user-agent'] || '').slice(0, 200)
    );

    setSessionCookie(res, cookieValue);
    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return res.json({
      message: 'Matagumpay kang naka-log in!',
      user: sanitizeUserPayload(refreshed),
      storage: getStorageSummary(db, user.id),
    });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionTokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
    }
    clearSessionCookie(res);
    return res.json({ message: 'Matagumpay kang naka-log out.' });
  });

  router.get('/me', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!row) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Hindi natagpuan ang account.' });
    }
    const pendingGrantCount =
      row.role === 'student'
        ? Number(
            db
              .prepare(
                "SELECT COUNT(*) AS cnt FROM access_grants WHERE student_id = ? AND status = 'pending'"
              )
              .get(row.id)?.cnt || 0
          )
        : 0;

    return res.json({
      user: sanitizeUserPayload(row),
      storage: getStorageSummary(db, row.id),
      pendingGrantCount,
    });
  });

  router.patch('/profile', requireAuth, (req, res) => {
    const { fullName, studentNumber, courseSection, currentPassword, newPassword } = req.body || {};
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Hindi natagpuan ang user.' });
    }

    const updatedName =
      fullName !== undefined ? String(fullName).trim() : existing.full_name;
    if (updatedName.length < 2 || updatedName.length > 100) {
      return res.status(400).json({
        error: 'Ang buong pangalan ay dapat may 2 hanggang 100 karakter.',
      });
    }

    const updatedStudentNumber =
      studentNumber !== undefined ? String(studentNumber).trim().slice(0, 40) : existing.student_number;
    const updatedCourse =
      courseSection !== undefined ? String(courseSection).trim().slice(0, 80) : existing.course_section;

    let passwordHash = existing.password_hash;
    if (newPassword !== undefined && String(newPassword).length > 0) {
      if (!currentPassword || !verifyPassword(String(currentPassword), existing.password_hash)) {
        return res.status(400).json({
          error: 'Hindi tama ang kasalukuyang password.',
        });
      }
      const nextPass = String(newPassword);
      if (nextPass.length < 8 || !/[a-zA-Z]/.test(nextPass) || !/\d/.test(nextPass)) {
        return res.status(400).json({
          error:
            'Ang bagong password ay dapat may hindi bababa sa 8 karakter at may titik at numero.',
        });
      }
      passwordHash = hashPassword(nextPass);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET full_name = ?, student_number = ?, course_section = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`
    ).run(updatedName, updatedStudentNumber, updatedCourse, passwordHash, now, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    return res.json({
      message: 'Matagumpay na na-update ang impormasyon ng iyong profile.',
      user: sanitizeUserPayload(updated),
    });
  });

  return router;
}
