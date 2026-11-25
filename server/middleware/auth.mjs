import { CONFIG } from '../config.mjs';
import { verifySignedCookie } from '../utils/crypto.mjs';
import { asyncHandler } from '../utils/http.mjs';
import { logAudit } from '../db.mjs';

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
  const req = res.req;
  const proto = req?.headers?.['x-forwarded-proto'];
  return Boolean(req?.secure || proto === 'https' || process.env.COOKIE_SECURE === 'true');
}

export function setSessionCookie(res, cookieValue) {
  const maxAgeSec = Math.floor(CONFIG.SESSION_TTL_MS / 1000);
  res.cookie(CONFIG.SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec * 1000,
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

    const tokenHash = verifySignedCookie(rawCookie);
    if (!tokenHash) {
      clearSessionCookie(res);
      return next();
    }

    const row = await db.get(
      `SELECT s.id AS session_id, s.expires_at,
              u.id, u.email, u.full_name, u.student_number, u.course_section,
              u.role, u.status, u.storage_quota_bytes, u.storage_used_bytes,
              u.created_at, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      tokenHash
    );

    if (!row) {
      clearSessionCookie(res);
      return next();
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
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
