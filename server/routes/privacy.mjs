import express from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireRole } from '../middleware/auth.mjs';
import { logAudit } from '../db.mjs';
import { asyncHandler } from '../utils/http.mjs';

function formatGrant(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    adminId: row.admin_id,
    adminName: row.admin_name || 'Tagapangasiwa',
    permissionLevel: row.permission_level,
    status: row.status,
    reason: row.reason,
    requestedByAdmin: Boolean(row.requested_by_admin),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    revokedAt: row.revoked_at,
  };
}

export function createPrivacyRouter(db) {
  const router = express.Router();

  router.use(requireAuth, requireRole('student'));

  router.get(
    '/grants',
    asyncHandler(async (req, res) => {
      const nowIso = new Date().toISOString();
      await db.run(
        `UPDATE access_grants
         SET status = 'expired'
         WHERE student_id = ? AND status = 'approved' AND expires_at IS NOT NULL AND expires_at <= ?`,
        req.user.id,
        nowIso
      );

      const grants = await db.all(
        `SELECT g.*, a.full_name AS admin_name
         FROM access_grants g
         LEFT JOIN users a ON a.id = g.admin_id
         WHERE g.student_id = ?
         ORDER BY g.created_at DESC`,
        req.user.id
      );

      const logs = await db.all(
        `SELECT l.*, u.full_name AS actor_name, u.role AS actor_role
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.actor_id
         WHERE l.target_user_id = ?
         ORDER BY l.created_at DESC
         LIMIT 20`,
        req.user.id
      );

      return res.json({
        grants: grants.map(formatGrant),
        auditLogs: logs.map((l) => ({
          id: l.id,
          actorName: l.actor_name || 'Sistema',
          actorRole: l.actor_role || 'system',
          action: l.action,
          details: l.details,
          createdAt: l.created_at,
        })),
      });
    })
  );

  router.post(
    '/grants',
    asyncHandler(async (req, res) => {
      const {
        permissionLevel = 'read',
        durationHours = 24,
        reason = 'Boluntaryong pahintulot para sa suportang teknikal',
      } = req.body || {};

      if (!['read', 'read_write'].includes(permissionLevel)) {
        return res.status(400).json({ error: 'Hindi wastong antas ng pahintulot.' });
      }

      const hours = Math.min(168, Math.max(1, Number(durationHours || 24)));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
      const admin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

      await db.run(
        `UPDATE access_grants
         SET status = 'revoked', revoked_at = ?
         WHERE student_id = ? AND status = 'approved'`,
        now.toISOString(),
        req.user.id
      );

      const id = crypto.randomUUID();
      await db.run(
        `INSERT INTO access_grants (
          id, student_id, admin_id, permission_level, status, reason,
          requested_by_admin, expires_at, created_at, responded_at
        ) VALUES (?, ?, ?, ?, 'approved', ?, 0, ?, ?, ?)`,
        id,
        req.user.id,
        admin?.id || null,
        permissionLevel,
        String(reason).trim().slice(0, 240),
        expiresAt,
        now.toISOString(),
        now.toISOString()
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: req.user.id,
        action: 'STUDENT_GRANTED_ACCESS',
        details: `Nagbigay ng pahintulot (${permissionLevel === 'read_write' ? 'Basahin at I-edit' : 'Basahin Lamang'}) sa loob ng ${hours} oras`,
      });

      const created = await db.get(
        `SELECT g.*, a.full_name AS admin_name
         FROM access_grants g
         LEFT JOIN users a ON a.id = g.admin_id
         WHERE g.id = ?`,
        id
      );

      return res.status(201).json({
        message: 'Naibigay ang pahintulot sa Tagapangasiwa.',
        grant: formatGrant(created),
      });
    })
  );

  router.post(
    '/grants/:id/respond',
    asyncHandler(async (req, res) => {
      const { decision, permissionLevel, durationHours = 24 } = req.body || {};
      if (!['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'Hindi wastong desisyon.' });
      }

      const grant = await db.get(
        "SELECT * FROM access_grants WHERE id = ? AND student_id = ? AND status = 'pending'",
        req.params.id,
        req.user.id
      );

      if (!grant) {
        return res.status(404).json({ error: 'Hindi natagpuan ang nakabinbing kahilingan.' });
      }

      const now = new Date();
      const hours = Math.min(168, Math.max(1, Number(durationHours || 24)));
      const expiresAt =
        decision === 'approved' ? new Date(now.getTime() + hours * 3600 * 1000).toISOString() : null;
      const finalLevel =
        permissionLevel && ['read', 'read_write'].includes(permissionLevel)
          ? permissionLevel
          : grant.permission_level;

      if (decision === 'approved') {
        await db.run(
          `UPDATE access_grants
           SET status = 'revoked', revoked_at = ?
           WHERE student_id = ? AND status = 'approved'`,
          now.toISOString(),
          req.user.id
        );
      }

      await db.run(
        `UPDATE access_grants
         SET status = ?, permission_level = ?, expires_at = ?, responded_at = ?
         WHERE id = ? AND student_id = ?`,
        decision,
        finalLevel,
        expiresAt,
        now.toISOString(),
        grant.id,
        req.user.id
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: req.user.id,
        action: decision === 'approved' ? 'STUDENT_APPROVED_REQUEST' : 'STUDENT_DENIED_REQUEST',
        details:
          decision === 'approved'
            ? `Pinayagan ang kahilingan ng Admin (${finalLevel})`
            : 'Tinanggihan ang kahilingan ng Admin',
      });

      return res.json({
        message:
          decision === 'approved'
            ? 'Inaprubahan ang kahilingan ng Tagapangasiwa.'
            : 'Tinanggihan ang kahilingan ng Tagapangasiwa.',
      });
    })
  );

  router.post(
    '/grants/:id/revoke',
    asyncHandler(async (req, res) => {
      const grant = await db.get(
        "SELECT * FROM access_grants WHERE id = ? AND student_id = ? AND status = 'approved'",
        req.params.id,
        req.user.id
      );

      if (!grant) {
        return res.status(404).json({ error: 'Hindi natagpuan ang aktibong pahintulot.' });
      }

      const now = new Date().toISOString();
      await db.run(
        "UPDATE access_grants SET status = 'revoked', revoked_at = ? WHERE id = ?",
        now,
        grant.id
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: req.user.id,
        action: 'STUDENT_REVOKED_ACCESS',
        details: 'Binawi ng mag-aaral ang pahintulot sa pag-access',
      });

      return res.json({
        message: 'Matagumpay na nabawi ang pahintulot. Pribado na muli ang iyong mga file.',
      });
    })
  );

  return router;
}
