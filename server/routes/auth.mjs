import express from 'express';
import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import {
  hashPassword,
  hashToken,
  verifyPassword,
  generateSessionToken,
  isValidRecoveryCodeFormat,
  decryptRecoveryCode,
  verifyRecoveryCodeHmac,
  signRecoveryProofToken,
  verifyRecoveryProofToken,
} from '../utils/crypto.mjs';
import { getStorageSummary } from '../utils/storage.mjs';
import { createStudentAccount, EMAIL_RE } from '../utils/accounts.mjs';
import { createRateLimiter } from '../utils/rateLimit.mjs';
import { buildPasswordChangedEmail, sendTransactionalEmail } from '../utils/email.mjs';
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
    const parsed = JSON.parse(raw || '{}');
    const merged = { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
    if (merged.theme !== 'light' && merged.theme !== 'dark') {
      delete merged.theme;
    }
    return merged;
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

  const forgotPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: 'forgot-password',
    message:
      'Masyadong maraming kahilingan sa pag-reset ng password. Pakihintay ng ilang minuto bago subukan muli.',
  });

  const statusTrackingLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyPrefix: 'reset-status',
    message: 'Masyadong maraming pagsubok sa pagtingin ng status. Pakihintay ng ilang minuto.',
  });

  const resetTokenLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyPrefix: 'reset-token',
    message: 'Masyadong maraming pagtatangka sa pag-reset ng password. Pakihintay ng ilang minuto.',
  });

  const verifyRecoveryLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyPrefix: 'verify-recovery',
    message:
      'Masyadong maraming pagtatangka sa pagberipika ng Recovery Code. Pakihintay ng ilang minuto.',
  });

  async function recordRecoveryFailure(userId, email) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const guard = await db.get(
      'SELECT failed_attempts, blocked_until FROM recovery_verification_guards WHERE user_id = ?',
      userId
    );
    const guardExpired = !guard?.blocked_until || new Date(guard.blocked_until).getTime() <= nowMs;
    const nextAttempts = (guard && guardExpired ? Number(guard.failed_attempts || 0) : 0) + 1;
    const shouldBlock = nextAttempts >= CONFIG.RECOVERY_MAX_FAILED_ATTEMPTS;
    const blockedUntil = shouldBlock ? new Date(nowMs + CONFIG.RECOVERY_BLOCK_MS).toISOString() : null;

    await db.run(
      `INSERT INTO recovery_verification_guards (user_id, failed_attempts, last_failed_at, blocked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         failed_attempts = excluded.failed_attempts,
         last_failed_at = excluded.last_failed_at,
         blocked_until = excluded.blocked_until`,
      userId,
      nextAttempts,
      nowIso,
      blockedUntil
    );

    await logAudit(db, {
      actorId: userId,
      targetUserId: userId,
      action: shouldBlock ? 'RECOVERY_CODE_TEMP_BLOCKED' : 'STUDENT_RECOVERY_VERIFICATION_FAILED',
      details: shouldBlock
        ? `Pansamantalang na-block ang recovery code verification (${nextAttempts} maling subok) para kay ${email}`
        : `Nabigong beripikasyon ng 6-digit recovery code / Student ID para kay ${email}`,
    });

    if (shouldBlock) {
      return {
        status: 429,
        error:
          'Pansamantalang na-block ang beripikasyon ng Recovery Code dahil sa maraming sunod-sunod na maling pagsubok. Pakihintay ng 15 minuto o makipag-ugnayan sa Admin.',
      };
    }
    return {
      status: 400,
      error:
        'Mali ang iyong nakarehistrong email, Student ID, o 6-digit Recovery Code, o na-invalidate na ang code.',
    };
  }

  async function verifyStudentRecoveryIdentity({ email, studentNumber, recoveryCode }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanStudentNumber = String(studentNumber || '').trim().slice(0, 40);
    const rawCode = String(recoveryCode ?? '').trim();

    if (!EMAIL_RE.test(cleanEmail)) {
      return {
        ok: false,
        status: 400,
        error: 'Mangyaring ilagay ang wastong nakarehistrong email address.',
      };
    }
    if (!cleanStudentNumber) {
      return {
        ok: false,
        status: 400,
        error: 'Mangyaring ilagay ang iyong Student ID / Numero ng Mag-aaral.',
      };
    }
    if (!isValidRecoveryCodeFormat(rawCode)) {
      return {
        ok: false,
        status: 400,
        error:
          'Ang Recovery Code ay dapat eksaktong anim (6) na numero lamang (0–9) at walang letra o simbolo.',
      };
    }

    const user = await db.get(
      "SELECT id, email, full_name, student_number, course_section, status FROM users WHERE LOWER(TRIM(email)) = ? AND LOWER(TRIM(role)) = 'student'",
      cleanEmail
    );
    if (!user) {
      return {
        ok: false,
        status: 400,
        error: 'Walang nahanap o hindi tugma ang iyong nakarehistrong email, Student ID, at Recovery Code.',
      };
    }
    if (user.status !== 'active') {
      return {
        ok: false,
        status: 403,
        error: 'Ang account na ito ay kasalukuyang sinuspinde o hindi aktibo. Makipag-ugnayan sa Admin.',
      };
    }

    const guard = await db.get(
      'SELECT failed_attempts, blocked_until FROM recovery_verification_guards WHERE user_id = ?',
      user.id
    );
    if (guard?.blocked_until && new Date(guard.blocked_until).getTime() > Date.now()) {
      return {
        ok: false,
        status: 429,
        error:
          'Pansamantalang naka-block ang beripikasyon ng Recovery Code dahil sa sunod-sunod na maling pagsubok. Pakihintay ng 15 minuto o makipag-ugnayan sa Admin.',
      };
    }

    const normalizeStudentId = (val) =>
      String(val || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    const savedStudentNum = normalizeStudentId(user.student_number);
    const idMatches = !savedStudentNum || normalizeStudentId(cleanStudentNumber) === savedStudentNum;

    const activeCode = await db.get(
      `SELECT id, code_hmac, code_ciphertext
       FROM student_recovery_codes
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      user.id
    );

    const codeMatches =
      Boolean(activeCode) &&
      (verifyRecoveryCodeHmac(user.id, rawCode, activeCode.code_hmac) ||
        decryptRecoveryCode(activeCode.code_ciphertext, user.id) === rawCode);

    if (!idMatches || !codeMatches) {
      const failResult = await recordRecoveryFailure(user.id, user.email);
      return { ok: false, ...failResult };
    }

    const now = new Date().toISOString();
    await db.run('DELETE FROM recovery_verification_guards WHERE user_id = ?', user.id);
    await db.run('UPDATE student_recovery_codes SET last_verified_at = ? WHERE id = ?', now, activeCode.id);
    await logAudit(db, {
      actorId: user.id,
      targetUserId: user.id,
      action: 'STUDENT_RECOVERY_CODE_VERIFIED',
      details: `Matagumpay na naberipika ang 6-digit Recovery Code para kay ${user.email}`,
    });

    return { ok: true, user, activeCodeId: activeCode.id, cleanStudentNumber };
  }

  async function findActiveResetRequestError(userId) {
    const activeExisting = await db.get(
      `SELECT id, status, reference_code
       FROM password_reset_requests
       WHERE user_id = ? AND status IN ('pending', 'approved')
       ORDER BY created_at DESC
       LIMIT 1`,
      userId
    );
    if (!activeExisting) return null;
    if (activeExisting.status === 'pending') {
      return {
        status: 409,
        error: `Mayroon ka nang aktibong kahilingan (${activeExisting.reference_code}) na naghihintay ng pag-apruba ng Admin. Hindi pinapayagan ang dobleng aktibong kahilingan.`,
      };
    }
    const activeToken = await db.get(
      `SELECT id, expires_at
       FROM password_reset_tokens
       WHERE request_id = ? AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      activeExisting.id
    );
    if (activeToken && new Date(activeToken.expires_at).getTime() > Date.now()) {
      return {
        status: 409,
        error: `Naaprubahan na ang iyong aktibong kahilingan (${activeExisting.reference_code}) at may bisa pa ang reset link. Pakitingnan ang iyong email.`,
      };
    }
    return null;
  }

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const {
        fullName = '',
        email = '',
        password = '',
        studentNumber = '',
        courseSection = '',
        recoveryCode = undefined,
      } = req.body || {};

      const result = await createStudentAccount(db, {
        fullName,
        email,
        password,
        studentNumber,
        courseSection,
        recoveryCode,
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
        recoveryCode: result.recoveryCode,
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
    '/verify-recovery-code',
    verifyRecoveryLimiter,
    asyncHandler(async (req, res) => {
      const { email = '', studentNumber = '', recoveryCode = '' } = req.body || {};
      const verified = await verifyStudentRecoveryIdentity({ email, studentNumber, recoveryCode });
      if (!verified.ok) {
        return res.status(verified.status).json({ error: verified.error });
      }

      const recoveryProofToken = signRecoveryProofToken({
        userId: verified.user.id,
        codeId: verified.activeCodeId,
      });

      return res.json({
        verified: true,
        message:
          'Tugma ang iyong 6-digit Recovery Code sa database! Maaari ka nang magtakda ng bagong password para sa iyong account.',
        recoveryProofToken,
        fullName: verified.user.full_name,
        studentNumber: verified.user.student_number || verified.cleanStudentNumber,
      });
    })
  );

  router.post(
    '/reset-password-with-recovery',
    resetTokenLimiter,
    asyncHandler(async (req, res) => {
      const {
        email = '',
        studentNumber = '',
        recoveryCode = '',
        recoveryProofToken = '',
        newPassword = '',
        confirmPassword = '',
      } = req.body || {};

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanStudentNumber = String(studentNumber).trim().slice(0, 40);
      const rawCode = String(recoveryCode ?? '').trim();
      const rawPass = String(newPassword);
      const rawConfirm = String(confirmPassword);

      if (rawPass.length < 8 || !/[a-zA-Z]/.test(rawPass) || !/\d/.test(rawPass)) {
        return res.status(400).json({
          error:
            'Ang bagong password ay dapat may hindi bababa sa 8 karakter at may pinagsamang titik at numero.',
        });
      }
      if (rawPass !== rawConfirm) {
        return res.status(400).json({
          error: 'Hindi magkatugma ang bagong password at kumpirmasyon.',
        });
      }

      let verifiedUser = null;

      if (rawCode) {
        const verified = await verifyStudentRecoveryIdentity({
          email: cleanEmail,
          studentNumber: cleanStudentNumber,
          recoveryCode: rawCode,
        });
        if (!verified.ok) {
          return res.status(verified.status).json({ error: verified.error });
        }
        if (recoveryProofToken) {
          const proof = verifyRecoveryProofToken(String(recoveryProofToken));
          if (!proof || proof.userId !== verified.user.id || proof.codeId !== verified.activeCodeId) {
            return res.status(400).json({
              error:
                'Hindi wasto o nag-expire ang iyong beripikasyon ng Recovery Code. Pakiberipika muli.',
            });
          }
        }
        verifiedUser = verified.user;
      } else if (recoveryProofToken) {
        const proof = verifyRecoveryProofToken(String(recoveryProofToken));
        if (!proof) {
          return res.status(400).json({
            error:
              'Nag-expire o hindi wasto ang iyong beripikasyon ng Recovery Code. Pakilagay muli ang iyong 6-digit Recovery Code.',
          });
        }
        const user = await db.get(
          "SELECT id, email, full_name, student_number, course_section, status FROM users WHERE LOWER(TRIM(email)) = ? AND LOWER(TRIM(role)) = 'student'",
          cleanEmail
        );
        if (!user || user.id !== proof.userId) {
          return res.status(400).json({
            error: 'Hindi tumugma ang beripikadong account sa email na inilagay.',
          });
        }
        if (user.status !== 'active') {
          return res.status(403).json({
            error: 'Ang account na ito ay kasalukuyang sinuspinde o hindi aktibo. Makipag-ugnayan sa Admin.',
          });
        }
        const normalizeStudentId = (val) =>
          String(val || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '');
        const savedStudentNum = normalizeStudentId(user.student_number);
        if (savedStudentNum && normalizeStudentId(cleanStudentNumber) !== savedStudentNum) {
          return res.status(400).json({
            error: 'Hindi tumugma ang iyong Student ID sa nakarehistrong account.',
          });
        }
        const guard = await db.get(
          'SELECT blocked_until FROM recovery_verification_guards WHERE user_id = ?',
          user.id
        );
        if (guard?.blocked_until && new Date(guard.blocked_until).getTime() > Date.now()) {
          return res.status(429).json({
            error: 'Pansamantalang naka-block ang beripikasyon ng Recovery Code. Pakihintay ng 15 minuto.',
          });
        }
        const activeCode = await db.get(
          "SELECT id FROM student_recovery_codes WHERE id = ? AND user_id = ? AND status = 'active'",
          proof.codeId,
          user.id
        );
        if (!activeCode) {
          return res.status(400).json({
            error:
              'Na-invalidate o napalitan na ng Admin ang iyong Recovery Code. Pakiberipika gamit ang bagong code.',
          });
        }
        verifiedUser = user;
      } else {
        return res.status(400).json({
          error: 'Kailangan munang i-verify ang iyong 6-digit Recovery Code sa database.',
        });
      }

      const now = new Date().toISOString();
      await db.run(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        hashPassword(rawPass),
        now,
        verifiedUser.id
      );
      await db.run('DELETE FROM sessions WHERE user_id = ?', verifiedUser.id);
      await db.run('DELETE FROM recovery_verification_guards WHERE user_id = ?', verifiedUser.id);
      await db.run(
        `UPDATE password_reset_requests
         SET status = 'completed', completed_at = ?, resolved_at = ?, updated_at = ?
         WHERE user_id = ? AND status IN ('pending', 'approved')`,
        now,
        now,
        now,
        verifiedUser.id
      );

      await db.run(
        `INSERT INTO student_notifications (
          id, user_id, reset_request_id, type, title, message, is_read, created_at
        ) VALUES (?, ?, NULL, 'password_changed', 'Napalitan na ang Password', ?, 0, ?)`,
        crypto.randomUUID(),
        verifiedUser.id,
        'Your password has been successfully changed.',
        now
      );

      await logAudit(db, {
        actorId: verifiedUser.id,
        targetUserId: verifiedUser.id,
        action: 'STUDENT_PASSWORD_RESET_COMPLETED',
        details: `Matagumpay na napalitan ng mag-aaral ang password gamit ang 6-digit Recovery Code (${verifiedUser.email})`,
      });

      return res.json({
        message:
          'Matagumpay na napalitan ang iyong password! Ito na ang magiging password ng iyong account at maaari ka nang mag-log in.',
        email: verifiedUser.email,
      });
    })
  );

  router.post(
    '/forgot-password',
    forgotPasswordLimiter,
    asyncHandler(async (req, res) => {
      const {
        fullName = '',
        email = '',
        studentNumber = '',
        reason = '',
        recoveryCode = '',
        recoveryProofToken = '',
      } = req.body || {};
      const cleanFullName = String(fullName).trim().slice(0, 120);
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanStudentNumber = String(studentNumber).trim().slice(0, 40);
      const cleanReason = String(reason).trim().slice(0, 400);

      if (cleanFullName.length < 2) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang iyong buong pangalan.',
        });
      }
      if (!EMAIL_RE.test(cleanEmail)) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang wastong nakarehistrong email address.',
        });
      }
      if (!cleanStudentNumber) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang iyong Numero ng Mag-aaral (Student ID).',
        });
      }
      if (cleanReason.length < 3) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang dahilan ng paghiling ng pag-reset ng password.',
        });
      }

      let user = null;
      if (recoveryProofToken) {
        const proof = verifyRecoveryProofToken(String(recoveryProofToken));
        if (!proof) {
          return res.status(400).json({
            error:
              'Nag-expire o hindi wasto ang iyong beripikasyon ng Recovery Code. Pakilagay muli ang iyong 6-digit Recovery Code.',
          });
        }

        user = await db.get(
          "SELECT id, email, full_name, student_number, course_section, status FROM users WHERE LOWER(email) = ? AND LOWER(role) = 'student'",
          cleanEmail
        );
        if (!user || user.id !== proof.userId) {
          return res.status(400).json({
            error: 'Hindi tumugma ang beripikadong account sa email na inilagay.',
          });
        }
        if (user.status !== 'active') {
          return res.status(403).json({
            error: 'Ang account na ito ay kasalukuyang sinuspinde o hindi aktibo. Makipag-ugnayan sa Admin.',
          });
        }

        const guard = await db.get(
          'SELECT blocked_until FROM recovery_verification_guards WHERE user_id = ?',
          user.id
        );
        if (guard?.blocked_until && new Date(guard.blocked_until).getTime() > Date.now()) {
          return res.status(429).json({
            error: 'Pansamantalang naka-block ang beripikasyon ng Recovery Code. Pakihintay ng 15 minuto.',
          });
        }

        const activeCode = await db.get(
          "SELECT id FROM student_recovery_codes WHERE id = ? AND user_id = ? AND status = 'active'",
          proof.codeId,
          user.id
        );
        if (!activeCode) {
          return res.status(400).json({
            error:
              'Na-invalidate o napalitan na ng Admin ang iyong Recovery Code. Pakiberipika gamit ang bagong code.',
          });
        }

        const savedStudentNum = String(user.student_number || '').trim().toLowerCase();
        if (savedStudentNum && cleanStudentNumber.toLowerCase() !== savedStudentNum) {
          return res.status(400).json({
            error: 'Hindi tumugma ang iyong Student ID sa nakarehistrong account.',
          });
        }
      } else {
        const verified = await verifyStudentRecoveryIdentity({
          email: cleanEmail,
          studentNumber: cleanStudentNumber,
          recoveryCode,
        });
        if (!verified.ok) {
          return res.status(verified.status).json({ error: verified.error });
        }
        user = verified.user;
      }

      const nameMatches = cleanFullName.toLowerCase() === String(user.full_name || '').trim().toLowerCase();
      if (!nameMatches) {
        await logAudit(db, {
          actorId: user.id,
          targetUserId: user.id,
          action: 'STUDENT_PASSWORD_RESET_VERIFICATION_FAILED',
          details: `Hindi tugma ang buong pangalan sa password reset request (${user.email})`,
        });
        return res.status(400).json({
          error: 'Hindi tumugma ang iyong Buong Pangalan sa nakarehistrong account.',
        });
      }

      const dupError = await findActiveResetRequestError(user.id);
      if (dupError) {
        return res.status(dupError.status).json({ error: dupError.error });
      }

      const now = new Date().toISOString();
      const requestId = crypto.randomUUID();
      const referenceNumber = `TRR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      await db.run(
        `INSERT INTO password_reset_requests (
          id, user_id, reference_code, full_name, email, student_number, course_section,
          reason, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        requestId,
        user.id,
        referenceNumber,
        cleanFullName,
        user.email,
        cleanStudentNumber,
        user.course_section || '',
        cleanReason,
        now,
        now
      );

      await logAudit(db, {
        actorId: user.id,
        targetUserId: user.id,
        action: 'STUDENT_PASSWORD_RESET_REQUESTED',
        details: `Nagsumite ng password reset request (${referenceNumber}) para kay ${user.email}`,
      });

      return res.status(201).json({
        message:
          'Matagumpay na naipadala ang iyong kahilingan sa pag-reset ng password at naghihintay na ito ng pag-apruba ng Admin.',
        referenceNumber,
        status: 'pending',
        submittedAt: now,
      });
    })
  );

  router.post(
    '/reset-status',
    statusTrackingLimiter,
    asyncHandler(async (req, res) => {
      const { email = '', referenceNumber = '' } = req.body || {};
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanRef = String(referenceNumber).trim().toUpperCase();

      if (!EMAIL_RE.test(cleanEmail) || !cleanRef) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang iyong nakarehistrong email address at Reference Number.',
        });
      }

      const row = await db.get(
        `SELECT id, reference_code, status, rejection_reason,
                created_at, approved_at, rejected_at, completed_at, updated_at
         FROM password_reset_requests
         WHERE LOWER(email) = ? AND UPPER(TRIM(reference_code)) = ?
         LIMIT 1`,
        cleanEmail,
        cleanRef
      );

      if (!row) {
        return res.status(404).json({
          error: 'Walang nahanap na kahilingan para sa email at reference number na iyan.',
        });
      }

      const normalizedStatus =
        row.status === 'resolved'
          ? 'completed'
          : row.status === 'dismissed'
            ? 'rejected'
            : row.status;

      let tokenExpired = false;
      let tokenExpiresAt = null;
      if (normalizedStatus === 'approved') {
        const tokenRow = await db.get(
          `SELECT expires_at, used_at
           FROM password_reset_tokens
           WHERE request_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
          row.id
        );
        if (tokenRow) {
          tokenExpiresAt = tokenRow.expires_at;
          tokenExpired = !tokenRow.used_at && new Date(tokenRow.expires_at).getTime() <= Date.now();
        }
      }

      const latestEmail = await db.get(
        `SELECT status
         FROM email_notifications
         WHERE reset_request_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        row.id
      );

      const statusMessages = {
        pending: 'Your request is waiting for Admin review.',
        approved: 'Your request has been approved. Please check your registered email for the reset link.',
        rejected: 'Your request has been rejected. Check your email for the reason.',
        completed: 'Your password has been successfully changed.',
      };

      return res.json({
        referenceNumber: row.reference_code,
        status: normalizedStatus,
        statusMessage: statusMessages[normalizedStatus] || statusMessages.pending,
        submittedAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        approvedAt: row.approved_at || null,
        rejectedAt: row.rejected_at || null,
        completedAt: row.completed_at || null,
        rejectionReason: normalizedStatus === 'rejected' ? row.rejection_reason || null : null,
        tokenExpiresAt,
        tokenExpired,
        emailDeliveryStatus: latestEmail?.status || null,
      });
    })
  );

  router.get(
    '/reset-password/validate',
    resetTokenLimiter,
    asyncHandler(async (req, res) => {
      const rawToken = String(req.query.token || '').trim();
      if (!rawToken || rawToken.length < 32) {
        return res.status(400).json({ error: 'Hindi wasto o kulang ang password reset token.' });
      }

      const tokenHash = hashToken(rawToken);
      const tokenRow = await db.get(
        `SELECT t.id, t.expires_at, t.used_at, t.user_id,
                r.id AS request_id, r.reference_code, r.status AS request_status,
                u.full_name, u.email, u.status AS user_status
         FROM password_reset_tokens t
         JOIN password_reset_requests r ON r.id = t.request_id
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?
         LIMIT 1`,
        tokenHash
      );

      if (!tokenRow) {
        return res.status(404).json({
          error: 'Hindi wasto o hindi umiiral ang link sa pag-reset ng password.',
        });
      }
      if (tokenRow.used_at || tokenRow.request_status === 'completed') {
        return res.status(410).json({
          error: 'Nagamit na ang one-time reset link na ito. Gumawa ng bagong kahilingan kung kinakailangan.',
        });
      }
      if (tokenRow.request_status !== 'approved') {
        return res.status(403).json({
          error: 'Hindi na aktibo o hindi aprubado ang kahilingang ito.',
        });
      }
      if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        return res.status(410).json({
          error: 'Nag-expire na ang reset link (lampas na sa 15 minuto). Magpadala ng panibagong kahilingan sa Admin.',
        });
      }
      if (tokenRow.user_status !== 'active') {
        return res.status(403).json({
          error: 'Ang account na ito ay kasalukuyang hindi aktibo o sinuspinde.',
        });
      }

      const emailParts = String(tokenRow.email).split('@');
      const maskedEmail =
        emailParts.length === 2
          ? `${emailParts[0].slice(0, 2)}***@${emailParts[1]}`
          : tokenRow.email;

      return res.json({
        valid: true,
        referenceNumber: tokenRow.reference_code,
        fullName: tokenRow.full_name,
        emailMasked: maskedEmail,
        expiresAt: tokenRow.expires_at,
      });
    })
  );

  router.post(
    '/reset-password',
    resetTokenLimiter,
    asyncHandler(async (req, res) => {
      const { token = '', newPassword = '', confirmPassword = '' } = req.body || {};
      const rawToken = String(token).trim();
      const rawPass = String(newPassword);
      const rawConfirm = String(confirmPassword);

      if (!rawToken || rawToken.length < 32) {
        return res.status(400).json({ error: 'Hindi wastong reset token.' });
      }
      if (rawPass.length < 8 || !/[a-zA-Z]/.test(rawPass) || !/\d/.test(rawPass)) {
        return res.status(400).json({
          error:
            'Ang bagong password ay dapat may hindi bababa sa 8 karakter at may pinagsamang titik at numero.',
        });
      }
      if (rawPass !== rawConfirm) {
        return res.status(400).json({
          error: 'Hindi magkatugma ang bagong password at kumpirmasyon.',
        });
      }

      const tokenHash = hashToken(rawToken);
      const tokenRow = await db.get(
        `SELECT t.id, t.expires_at, t.used_at, t.user_id,
                r.id AS request_id, r.reference_code, r.status AS request_status,
                u.full_name, u.email, u.status AS user_status
         FROM password_reset_tokens t
         JOIN password_reset_requests r ON r.id = t.request_id
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?
         LIMIT 1`,
        tokenHash
      );

      if (!tokenRow) {
        return res.status(404).json({ error: 'Hindi wastong link sa pag-reset ng password.' });
      }
      if (tokenRow.used_at || tokenRow.request_status === 'completed') {
        return res.status(410).json({ error: 'Nagamit na ang reset token na ito.' });
      }
      if (tokenRow.request_status !== 'approved') {
        return res.status(403).json({ error: 'Walang aktibong pag-apruba para sa token na ito.' });
      }
      if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        return res.status(410).json({
          error: 'Nag-expire na ang reset link (15 minuto). Mangyaring humiling muli.',
        });
      }
      if (tokenRow.user_status !== 'active') {
        return res.status(403).json({ error: 'Hindi aktibo o sinuspinde ang account na ito.' });
      }

      const now = new Date().toISOString();
      const claim = await db.run(
        'UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
        now,
        tokenRow.id
      );
      if (claim.changes === 0) {
        return res.status(409).json({ error: 'Nagamit na ang reset token na ito.' });
      }

      await db.run(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        hashPassword(rawPass),
        now,
        tokenRow.user_id
      );
      await db.run('DELETE FROM sessions WHERE user_id = ?', tokenRow.user_id);

      await db.run(
        `UPDATE password_reset_requests
         SET status = 'completed', completed_at = ?, resolved_at = ?, updated_at = ?
         WHERE id = ?`,
        now,
        now,
        now,
        tokenRow.request_id
      );

      await db.run(
        `INSERT INTO student_notifications (
          id, user_id, reset_request_id, type, title, message, is_read, created_at
        ) VALUES (?, ?, ?, 'password_changed', 'Napalitan na ang Password', ?, 0, ?)
        ON CONFLICT DO NOTHING`,
        crypto.randomUUID(),
        tokenRow.user_id,
        tokenRow.request_id,
        'Your password has been successfully changed.',
        now
      );

      await logAudit(db, {
        actorId: tokenRow.user_id,
        targetUserId: tokenRow.user_id,
        action: 'STUDENT_PASSWORD_RESET_COMPLETED',
        details: `Matagumpay na napalitan ang password gamit ang reset link (${tokenRow.reference_code})`,
      });

      const emailTpl = buildPasswordChangedEmail({
        fullName: tokenRow.full_name,
        referenceNumber: tokenRow.reference_code,
      });
      const emailDelivery = await sendTransactionalEmail(db, {
        userId: tokenRow.user_id,
        resetRequestId: tokenRow.request_id,
        recipientEmail: tokenRow.email,
        emailType: 'password_changed',
        ...emailTpl,
      });

      return res.json({
        message:
          'Matagumpay na napalitan ang iyong password! Maaari ka nang mag-log in gamit ang iyong bagong password.',
        referenceNumber: tokenRow.reference_code,
        emailDelivery,
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
              ...(notificationSettings.theme === 'light' || notificationSettings.theme === 'dark'
                ? { theme: notificationSettings.theme }
                : existingSettings.theme === 'light' || existingSettings.theme === 'dark'
                  ? { theme: existingSettings.theme }
                  : {}),
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
