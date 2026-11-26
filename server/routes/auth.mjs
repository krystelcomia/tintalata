import express from 'express';
import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { hashPassword, verifyPassword, generateSessionToken } from '../utils/crypto.mjs';
import { getStorageSummary } from '../utils/storage.mjs';
import { createStudentAccount, EMAIL_RE } from '../utils/accounts.mjs';
import { asyncHandler } from '../utils/http.mjs';
import {
  clearSessionCookie,
  markTokenRevoked,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth.mjs';
import { logAudit } from '../db.mjs';

const DEFAULT_NOTIFICATION_SETTINGS = {
  notifyAutoSave: true,
  notifyStorageAlerts: true,
  notifyShareAlerts: true,
  notifyPrivacyRequests: true,
  defaultDownloadFormat: 'docx',
};

function parseNotificationSettings(raw) {
  try {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw || '{}') };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

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
    notificationSettings: parseNotificationSettings(row.notification_settings_json),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function createAuthRouter(db) {
  const router = express.Router();

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const {
        fullName = '',
        email = '',
        password = '',
        studentNumber = '',
        courseSection = '',
      } = req.body || {};

      const result = await createStudentAccount(db, {
        fullName,
        email,
        password,
        studentNumber,
        courseSection,
        markLoggedInNow: true,
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      const createdUser = result.user;
      const now = new Date().toISOString();
      const { cookieValue, tokenHash } = generateSessionToken(
        createdUser,
        CONFIG.SESSION_TOKEN_LIFETIME_MS
      );
      const expiresAt = new Date(Date.now() + CONFIG.SESSION_TTL_MS).toISOString();
      await db.run(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        createdUser.id,
        tokenHash,
        now,
        expiresAt,
        String(req.headers['user-agent'] || '').slice(0, 200)
      );

      setSessionCookie(res, cookieValue, CONFIG.SESSION_TTL_MS);
      return res.status(201).json({
        message: 'Matagumpay na nairehistro ang iyong account!',
        user: sanitizeUserPayload(createdUser),
        storage: await getStorageSummary(db, createdUser.id),
      });
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { email = '', password = '', rememberMe = true } = req.body || {};
      const cleanEmail = String(email).trim().toLowerCase();
      const rawPassword = String(password);

      if (!cleanEmail || !rawPassword) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang iyong email o numero ng mag-aaral at password.',
        });
      }

      let user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', cleanEmail);
      if (!user) {
        const candidates = await db.all(
          "SELECT * FROM users WHERE student_number != '' AND LOWER(student_number) = ?",
          cleanEmail
        );
        user =
          candidates.find((c) => verifyPassword(rawPassword, c.password_hash)) ||
          candidates[0] ||
          null;
      }
      if (!user) {
        if (db.storageMode === 'sqlite-ephemeral') {
          const countRow = await db.get("SELECT COUNT(*) AS cnt FROM users WHERE role = 'student'");
          if (Number(countRow?.cnt || 0) === 0) {
            return res.status(401).json({
              error:
                'Hindi natagpuan ang account sa pansamantalang database (/tmp) ng server. Kapag nag-redeploy o nag-restart ang Vercel nang walang nakakonektang PostgreSQL (POSTGRES_URL o DATABASE_URL), nabubura ang mga dating gawang account. Pakisubukang magparehistro muli o magkonekta ng PostgreSQL sa Vercel.',
            });
          }
        }
        return res.status(401).json({
          error: 'Mali ang email/username o password na iyong inilagay.',
        });
      }
      if (!verifyPassword(rawPassword, user.password_hash)) {
        return res.status(401).json({
          error: 'Mali ang email/username o password na iyong inilagay.',
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
      await db.run(
        'UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?',
        now,
        now,
        user.id
      );

      const ttlMs = CONFIG.SESSION_TTL_MS;
      const refreshed = await db.get('SELECT * FROM users WHERE id = ?', user.id);
      const { cookieValue, tokenHash } = generateSessionToken(
        refreshed || user,
        CONFIG.SESSION_TOKEN_LIFETIME_MS
      );
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      await db.run(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        user.id,
        tokenHash,
        now,
        expiresAt,
        String(req.headers['user-agent'] || '').slice(0, 200)
      );

      setSessionCookie(res, cookieValue, ttlMs);
      return res.json({
        message:
          refreshed.role === 'admin'
            ? 'Maligayang pagbabalik, Tagapangasiwa!'
            : 'Matagumpay kang naka-log in!',
        user: sanitizeUserPayload(refreshed),
        storage: await getStorageSummary(db, user.id),
      });
    })
  );

  router.post(
    '/forgot-password',
    asyncHandler(async (req, res) => {
      const { email = '', studentNumber = '', reason = '' } = req.body || {};
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanStudentNumber = String(studentNumber).trim();
      const cleanReason = String(reason).trim().slice(0, 240);

      if (!EMAIL_RE.test(cleanEmail)) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang wastong email address ng iyong account.',
        });
      }

      const user = await db.get(
        "SELECT id, email, student_number FROM users WHERE LOWER(email) = ? AND role = 'student'",
        cleanEmail
      );

      if (user) {
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO password_reset_requests (id, user_id, email, student_number, reason, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
          crypto.randomUUID(),
          user.id,
          user.email,
          cleanStudentNumber || user.student_number || '',
          cleanReason || 'Kahilingan sa pag-reset ng nakalimutang password',
          now
        );

        await logAudit(db, {
          actorId: user.id,
          targetUserId: user.id,
          action: 'STUDENT_PASSWORD_RESET_REQUESTED',
          details: `Nagpadala ng kahilingan sa pag-reset ng password (${user.email})`,
        });
      }

      return res.json({
        message:
          'Kung nakarehistro ang email sa sistema, naipadala na ang iyong kahilingan sa Tagapangasiwa para sa pag-reset ng password.',
      });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      if (req.sessionTokenHash) {
        markTokenRevoked(req.sessionTokenHash);
        await db.run('DELETE FROM sessions WHERE token_hash = ?', req.sessionTokenHash);
      }
      clearSessionCookie(res);
      return res.json({ message: 'Matagumpay kang naka-log out.' });
    })
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
      if (!row) {
        clearSessionCookie(res);
        return res.status(401).json({ error: 'Hindi natagpuan ang account.' });
      }
      const pendingGrantCount =
        row.role === 'student'
          ? Number(
              (
                await db.get(
                  "SELECT COUNT(*) AS cnt FROM access_grants WHERE student_id = ? AND status = 'pending'",
                  row.id
                )
              )?.cnt || 0
            )
          : 0;

      return res.json({
        user: sanitizeUserPayload(row),
        storage: await getStorageSummary(db, row.id),
        pendingGrantCount,
      });
    })
  );

  router.patch(
    '/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const {
        fullName,
        studentNumber,
        courseSection,
        currentPassword,
        newPassword,
        notificationSettings,
      } = req.body || {};
      const existing = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
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
        studentNumber !== undefined
          ? String(studentNumber).trim().slice(0, 40)
          : existing.student_number;
      const updatedCourse =
        courseSection !== undefined
          ? String(courseSection).trim().slice(0, 80)
          : existing.course_section;

      const existingSettings = parseNotificationSettings(existing.notification_settings_json);
      const mergedSettings =
        notificationSettings && typeof notificationSettings === 'object'
          ? {
              notifyAutoSave:
                notificationSettings.notifyAutoSave !== undefined
                  ? Boolean(notificationSettings.notifyAutoSave)
                  : existingSettings.notifyAutoSave,
              notifyStorageAlerts:
                notificationSettings.notifyStorageAlerts !== undefined
                  ? Boolean(notificationSettings.notifyStorageAlerts)
                  : existingSettings.notifyStorageAlerts,
              notifyShareAlerts:
                notificationSettings.notifyShareAlerts !== undefined
                  ? Boolean(notificationSettings.notifyShareAlerts)
                  : existingSettings.notifyShareAlerts,
              notifyPrivacyRequests:
                notificationSettings.notifyPrivacyRequests !== undefined
                  ? Boolean(notificationSettings.notifyPrivacyRequests)
                  : existingSettings.notifyPrivacyRequests,
              defaultDownloadFormat: ['docx', 'pdf', 'doc', 'html', 'txt'].includes(
                notificationSettings.defaultDownloadFormat
              )
                ? notificationSettings.defaultDownloadFormat
                : existingSettings.defaultDownloadFormat,
            }
          : existingSettings;

      let passwordHash = existing.password_hash;
      if (newPassword !== undefined && String(newPassword).length > 0) {
        if (!currentPassword || !verifyPassword(String(currentPassword), existing.password_hash)) {
          return res.status(400).json({
            error: 'Hindi tama ang kasalukuyang password.',
          });
        }
        const nextPass = String(newPassword);
        if (nextPass.length < 8) {
          return res.status(400).json({
            error: 'Ang bagong password ay dapat may hindi bababa sa 8 karakter.',
          });
        }
        passwordHash = hashPassword(nextPass);
      }

      const now = new Date().toISOString();
      await db.run(
        `UPDATE users
         SET full_name = ?, student_number = ?, course_section = ?,
             notification_settings_json = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
        updatedName,
        updatedStudentNumber,
        updatedCourse,
        JSON.stringify(mergedSettings),
        passwordHash,
        now,
        req.user.id
      );

      const updated = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
      return res.json({
        message: 'Matagumpay na na-update ang impormasyon ng iyong profile at mga setting.',
        user: sanitizeUserPayload(updated),
      });
    })
  );

  return router;
}
