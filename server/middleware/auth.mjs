import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { verifySessionCookie } from '../utils/crypto.mjs';
import { asyncHandler } from '../utils/http.mjs';
import { logAudit } from '../db.mjs';

const revokedTokenHashes = new Set();

export function markTokenRevoked(tokenHash) {
  if (!tokenHash) return;
  if (revokedTokenHashes.size >= 500) {
    const first = revokedTokenHashes.values().next().value;
    if (first) revokedTokenHashes.delete(first);
  }
  revokedTokenHashes.add(tokenHash);
}

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function isSecureRequest(res) {
  const req = res?.req;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req?.secure || proto === 'https' || process.env.COOKIE_SECURE === 'true');
}

export function setSessionCookie(res, cookieValue, ttlMs = CONFIG.SESSION_TTL_MS) {
  const maxAgeMs = Math.max(60 * 1000, Number(ttlMs) || CONFIG.SESSION_TTL_MS);
  res.cookie(CONFIG.SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
    secure: isSecureRequest(res),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(CONFIG.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isSecureRequest(res),
  });
}

export function attachAuth(db) {
  return asyncHandler(async (req, res, next) => {
    req.user = null;
    req.sessionTokenHash = null;

    const cookies = parseCookies(req.headers.cookie);
    const rawCookie = cookies[CONFIG.SESSION_COOKIE_NAME];
    if (!rawCookie) return next();

    const verified = verifySessionCookie(rawCookie);
    if (!verified) {
      clearSessionCookie(res);
      return next();
    }
    const { tokenHash, claims } = verified;

    if (revokedTokenHashes.has(tokenHash)) {
      clearSessionCookie(res);
      return next();
    }

    let row = await db.get(
      `SELECT s.id AS session_id, s.expires_at,
              u.id, u.email, u.full_name, u.student_number, u.course_section,
              u.role, u.status, u.storage_quota_bytes, u.storage_used_bytes,
              u.created_at, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      tokenHash
    );

    if (!row && db.storageMode === 'sqlite-ephemeral' && claims) {
      if (Number(claims.exp) <= Date.now()) {
        clearSessionCookie(res);
        return next();
      }

      const cleanEmail = String(claims.em || '').trim().toLowerCase();
      let dbUser =
        (await db.get('SELECT * FROM users WHERE id = ?', claims.uid)) ||
        (cleanEmail ? await db.get('SELECT * FROM users WHERE LOWER(email) = ?', cleanEmail) : null);

      if (!dbUser && claims.rl === 'student' && cleanEmail) {
        const now = new Date().toISOString();
        const adminRow = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        await db.run(
          `INSERT INTO users (
            id, email, password_hash, full_name, student_number, course_section,
            role, status, storage_quota_bytes, storage_used_bytes, managed_by_admin_id,
            created_at, updated_at, last_login_at
          ) VALUES (?, ?, '!ephemeral-session-synced', ?, ?, ?, 'student', 'active', ?, 0, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING`,
          claims.uid,
          cleanEmail,
          String(claims.nm || cleanEmail),
          String(claims.sn || ''),
          String(claims.cs || ''),
          Number(claims.qt) || CONFIG.DEFAULT_STORAGE_QUOTA_BYTES,
          adminRow?.id || null,
          now,
          now,
          now
        );
        dbUser =
          (await db.get('SELECT * FROM users WHERE id = ?', claims.uid)) ||
          (await db.get('SELECT * FROM users WHERE LOWER(email) = ?', cleanEmail));
      }

      if (dbUser) {
        if (dbUser.status !== 'active') {
          await db.run('DELETE FROM sessions WHERE user_id = ?', dbUser.id);
          clearSessionCookie(res);
          req.accountBlockedStatus = dbUser.status;
          return next();
        }
        const nowIso = new Date().toISOString();
        const expiresIso = new Date(Number(claims.exp)).toISOString();
        await db.run(
          `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          crypto.randomUUID(),
          dbUser.id,
          tokenHash,
          nowIso,
          expiresIso,
          String(req.headers['user-agent'] || '').slice(0, 200)
        );
        row = {
          session_id: 'ephemeral-synced',
          expires_at: expiresIso,
          ...dbUser,
        };
      }
    }

    if (!row) {
      clearSessionCookie(res);
      return next();
    }

    const expiresAtMs = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await db.run('DELETE FROM sessions WHERE id = ?', row.session_id);
      clearSessionCookie(res);
      return next();
    }

    if (row.status !== 'active') {
      await db.run('DELETE FROM sessions WHERE user_id = ?', row.id);
      clearSessionCookie(res);
      req.accountBlockedStatus = row.status;
      return next();
    }

    // Sliding persistent session renewal: users remain signed in indefinitely until explicit logout.
    const isLogoutRequest = String(req.originalUrl || '').startsWith('/api/auth/logout');
    const slidingThresholdMs = 395 * 24 * 60 * 60 * 1000;
    if (
      !isLogoutRequest &&
      (!Number.isFinite(expiresAtMs) ||
        expiresAtMs - Date.now() < slidingThresholdMs ||
        req.originalUrl === '/api/auth/me')
    ) {
      const nextExpiresIso = new Date(Date.now() + CONFIG.SESSION_TTL_MS).toISOString();
      if (row.session_id && row.session_id !== 'ephemeral-synced') {
        await db.run(
          'UPDATE sessions SET expires_at = ? WHERE id = ?',
          nextExpiresIso,
          row.session_id
        );
      }
      setSessionCookie(res, rawCookie, CONFIG.SESSION_TTL_MS);
    }

    req.user = {
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
    req.sessionTokenHash = tokenHash;
    next();
  });
}

export function requireAuth(req, res, next) {
  if (req.accountBlockedStatus === 'suspended') {
    return res.status(403).json({
      error: 'Ang iyong account ay sinuspinde ng Tagapangasiwa. Makipag-ugnayan sa opisina ng administrasyon.',
    });
  }
  if (req.accountBlockedStatus === 'inactive') {
    return res.status(403).json({
      error: 'Ang iyong account ay kasalukuyang hindi aktibo. Makipag-ugnayan sa Tagapangasiwa.',
    });
  }
  if (!req.user) {
    return res.status(401).json({
      error: 'Kailangan munang mag-log in upang magpatuloy.',
    });
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Kailangan munang mag-log in upang magpatuloy.' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        error: 'Walang pahintulot ang iyong account na gamitin ang bahaging ito.',
      });
    }
    next();
  };
}

/**
 * Resolves the target workspace owner for document/folder/trash routes.
 */
export function resolveWorkspaceAccess(db, { requireWrite = false } = {}) {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Kailangan munang mag-log in upang magpatuloy.' });
    }

    if (req.user.role === 'student') {
      req.workspace = {
        ownerId: req.user.id,
        permission: 'read_write',
        isAdminSupport: false,
      };
      return next();
    }

    const supportStudentId =
      req.headers['x-support-student-id'] || req.query.supportStudentId || '';

    if (!supportStudentId || typeof supportStudentId !== 'string') {
      return res.status(403).json({
        error:
          'Proteksyon sa Pagkapribado: Hindi maaaring buksan o baguhin ng Admin ang mga pribadong file ng mag-aaral nang walang pahintulot.',
      });
    }

    const nowIso = new Date().toISOString();
    await db.run(
      `UPDATE access_grants
       SET status = 'expired'
       WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at <= ?`,
      nowIso
    );

    const grant = await db.get(
      `SELECT id, permission_level, expires_at
       FROM access_grants
       WHERE student_id = ? AND status = 'approved'
       ORDER BY responded_at DESC, created_at DESC
       LIMIT 1`,
      supportStudentId
    );

    if (!grant) {
      return res.status(403).json({
        error:
          'Walang aktibong pahintulot mula sa mag-aaral upang tingnan o baguhin ang kanyang mga dokumento.',
      });
    }

    if (requireWrite && grant.permission_level !== 'read_write') {
      return res.status(403).json({
        error:
          'Ang pahintulot na ibinigay ng mag-aaral ay para sa pagbabasa lamang (Basahin Lamang). Hindi pinapayagan ang pagbabago.',
      });
    }

    req.workspace = {
      ownerId: supportStudentId,
      permission: grant.permission_level,
      isAdminSupport: true,
      grantId: grant.id,
    };

    if (requireWrite) {
      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: supportStudentId,
        action: 'ADMIN_AUTHORIZED_WRITE',
        details: `${req.method} ${req.originalUrl}`,
      });
    }

    next();
  });
}
