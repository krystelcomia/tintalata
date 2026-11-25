import express from 'express';
import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { requireAuth, requireRole } from '../middleware/auth.mjs';
import { getStorageSummary } from '../utils/storage.mjs';
import { hashPassword } from '../utils/crypto.mjs';
import { createStudentAccount } from '../utils/accounts.mjs';
import { asyncHandler } from '../utils/http.mjs';
import { logAudit } from '../db.mjs';

async function expireStaleGrants(db) {
  await db.run(
    `UPDATE access_grants
     SET status = 'expired'
     WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at <= ?`,
    new Date().toISOString()
  );
}

async function getLatestGrantStatus(db, studentId) {
  const approved = await db.get(
    `SELECT id, permission_level, expires_at, reason, responded_at
     FROM access_grants
     WHERE student_id = ? AND status = 'approved'
     ORDER BY responded_at DESC, created_at DESC
     LIMIT 1`,
    studentId
  );

  if (approved) {
    return {
      state: 'approved',
      grantId: approved.id,
      permissionLevel: approved.permission_level,
      expiresAt: approved.expires_at,
      reason: approved.reason,
    };
  }

  const pending = await db.get(
    `SELECT id, permission_level, reason, created_at
     FROM access_grants
     WHERE student_id = ? AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    studentId
  );

  if (pending) {
    return {
      state: 'pending',
      grantId: pending.id,
      permissionLevel: pending.permission_level,
      reason: pending.reason,
      createdAt: pending.created_at,
    };
  }

  return { state: 'none', permissionLevel: null };
}

export function createAdminRouter(db) {
  const router = express.Router();

  router.use(requireAuth, requireRole('admin'));

  router.get(
    '/overview',
    asyncHandler(async (_req, res) => {
      await expireStaleGrants(db);
      const counts = await db.get(
        `SELECT
          COUNT(*) AS total_students,
          COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_students,
          COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended_students,
          COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactive_students,
          COALESCE(SUM(storage_used_bytes), 0) AS total_used_bytes,
          COALESCE(SUM(storage_quota_bytes), 0) AS total_quota_bytes
         FROM users
         WHERE role = 'student'`
      );

      const docTotals = await db.get(
        `SELECT
          COALESCE(SUM(CASE WHEN d.is_deleted = 0 THEN 1 ELSE 0 END), 0) AS active_docs,
          COALESCE(SUM(CASE WHEN d.is_deleted = 1 THEN 1 ELSE 0 END), 0) AS trash_docs
         FROM documents d
         JOIN users u ON u.id = d.user_id
         WHERE u.role = 'student'`
      );

      const authorizedRow = await db.get(
        "SELECT COUNT(DISTINCT student_id) AS cnt FROM access_grants WHERE status = 'approved'"
      );
      const authorizedCount = Number(authorizedRow?.cnt || 0);

      const toMB = (bytes) => Number((Number(bytes || 0) / (1024 * 1024)).toFixed(2));

      return res.json({
        overview: {
          totalStudents: Number(counts?.total_students || 0),
          activeStudents: Number(counts?.active_students || 0),
          suspendedStudents: Number(counts?.suspended_students || 0),
          inactiveStudents: Number(counts?.inactive_students || 0),
          totalUsedMB: toMB(counts?.total_used_bytes),
          totalQuotaMB: toMB(counts?.total_quota_bytes),
          totalActiveDocs: Number(docTotals?.active_docs || 0),
          totalTrashDocs: Number(docTotals?.trash_docs || 0),
          authorizedStudentCount: authorizedCount,
        },
      });
    })
  );

  router.get(
    '/students',
    asyncHandler(async (req, res) => {
      await expireStaleGrants(db);
      const { search = '', status = 'all' } = req.query;

      let sql = `
        SELECT u.id, u.email, u.full_name, u.student_number, u.course_section,
               u.status, u.storage_quota_bytes, u.storage_used_bytes,
               u.created_at, u.updated_at, u.last_login_at,
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id AND d.is_deleted = 0) AS active_doc_count,
               (SELECT COUNT(*) FROM folders f WHERE f.user_id = u.id AND f.is_deleted = 0) AS active_folder_count,
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id AND d.is_deleted = 1) AS trash_doc_count
        FROM users u
        WHERE u.role = 'student'
      `;
      const params = [];

      if (status && ['active', 'suspended', 'inactive'].includes(String(status))) {
        sql += ' AND u.status = ?';
        params.push(String(status));
      }

      if (search && String(search).trim()) {
        const q = `%${String(search).trim().toLowerCase()}%`;
        sql +=
          ' AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.student_number) LIKE ? OR LOWER(u.course_section) LIKE ?)';
        params.push(q, q, q, q);
      }

      sql += ' ORDER BY u.created_at DESC';
      const rows = await db.all(sql, ...params);
      const toMB = (b) => Number((Number(b || 0) / (1024 * 1024)).toFixed(2));

      const students = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          studentNumber: r.student_number || '',
          courseSection: r.course_section || '',
          status: r.status,
          storageQuotaBytes: Number(r.storage_quota_bytes),
          storageUsedBytes: Number(r.storage_used_bytes),
          storageQuotaMB: toMB(r.storage_quota_bytes),
          storageUsedMB: toMB(r.storage_used_bytes),
          storageRemainingMB: toMB(
            Math.max(0, Number(r.storage_quota_bytes) - Number(r.storage_used_bytes))
          ),
          activeDocCount: Number(r.active_doc_count || 0),
          activeFolderCount: Number(r.active_folder_count || 0),
          trashDocCount: Number(r.trash_doc_count || 0),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          lastLoginAt: r.last_login_at,
          authorization: await getLatestGrantStatus(db, r.id),
        }))
      );

      return res.json({ students });
    })
  );

  router.post(
    '/students',
    asyncHandler(async (req, res) => {
      const {
        fullName = '',
        email = '',
        password = '',
        studentNumber = '',
        courseSection = '',
        storageQuotaMB = 50,
      } = req.body || {};

      const mb = Number(storageQuotaMB || 50);
      if (!Number.isFinite(mb) || mb < 1 || mb > 10240) {
        return res.status(400).json({
          error: 'Ang kapasidad ng storage ay dapat nasa pagitan ng 1 MB at 10,240 MB.',
        });
      }

      const result = await createStudentAccount(db, {
        fullName,
        email,
        password,
        studentNumber,
        courseSection,
        storageQuotaBytes: Math.round(mb * 1024 * 1024) || CONFIG.DEFAULT_STORAGE_QUOTA_BYTES,
        createdByAdminId: req.user.id,
        markLoggedInNow: false,
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.status(201).json({
        message: `Matagumpay na naidagdag ang account ni ${result.user.full_name} at maaari na itong mag-log in.`,
        studentId: result.user.id,
      });
    })
  );

  router.get(
    '/students/:id',
    asyncHandler(async (req, res) => {
      await expireStaleGrants(db);
      const student = await db.get(
        `SELECT id, email, full_name, student_number, course_section, role, status,
                storage_quota_bytes, storage_used_bytes, created_at, updated_at, last_login_at
         FROM users WHERE id = ? AND role = 'student'`,
        req.params.id
      );

      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang account ng mag-aaral.' });
      }

      const storage = await getStorageSummary(db, student.id);
      const authorization = await getLatestGrantStatus(db, student.id);
      const logs = await db.all(
        `SELECT l.*, u.full_name AS actor_name
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.actor_id
         WHERE l.target_user_id = ?
         ORDER BY l.created_at DESC
         LIMIT 15`,
        student.id
      );

      return res.json({
        student: {
          id: student.id,
          email: student.email,
          fullName: student.full_name,
          studentNumber: student.student_number || '',
          courseSection: student.course_section || '',
          status: student.status,
          createdAt: student.created_at,
          updatedAt: student.updated_at,
          lastLoginAt: student.last_login_at,
          storage,
          authorization,
        },
        auditLogs: logs.map((l) => ({
          id: l.id,
          actorName: l.actor_name || 'Sistema',
          action: l.action,
          details: l.details,
          createdAt: l.created_at,
        })),
      });
    })
  );

  router.patch(
    '/students/:id',
    asyncHandler(async (req, res) => {
      const student = await db.get(
        "SELECT * FROM users WHERE id = ? AND role = 'student'",
        req.params.id
      );

      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang account ng mag-aaral.' });
      }

      const { status, storageQuotaMB, fullName, studentNumber, courseSection, newPassword } =
        req.body || {};
      const nextStatus = status !== undefined ? String(status) : student.status;
      if (!['active', 'suspended', 'inactive'].includes(nextStatus)) {
        return res.status(400).json({ error: 'Hindi wastong status ng account.' });
      }

      let nextQuotaBytes = Number(student.storage_quota_bytes);
      if (storageQuotaMB !== undefined) {
        const mb = Number(storageQuotaMB);
        if (!Number.isFinite(mb) || mb < 1 || mb > 10240) {
          return res.status(400).json({
            error: 'Ang kapasidad ng storage ay dapat nasa pagitan ng 1 MB at 10,240 MB.',
          });
        }
        nextQuotaBytes = Math.round(mb * 1024 * 1024);
      }

      const nextName =
        fullName !== undefined ? String(fullName).trim() : student.full_name;
      if (nextName.length < 2 || nextName.length > 100) {
        return res.status(400).json({ error: 'Hindi wasto ang buong pangalan.' });
      }

      const nextStudentNum =
        studentNumber !== undefined
          ? String(studentNumber).trim().slice(0, 40)
          : student.student_number;
      const nextCourse =
        courseSection !== undefined
          ? String(courseSection).trim().slice(0, 80)
          : student.course_section;

      let nextPasswordHash = student.password_hash;
      let passwordChanged = false;
      if (newPassword !== undefined && String(newPassword).length > 0) {
        const cleanNewPass = String(newPassword);
        if (cleanNewPass.length < 8) {
          return res.status(400).json({
            error: 'Ang bagong password ay dapat may hindi bababa sa 8 karakter.',
          });
        }
        nextPasswordHash = hashPassword(cleanNewPass);
        passwordChanged = true;
      }

      const now = new Date().toISOString();
      await db.run(
        `UPDATE users
         SET status = ?, storage_quota_bytes = ?, full_name = ?,
             student_number = ?, course_section = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
        nextStatus,
        nextQuotaBytes,
        nextName,
        nextStudentNum,
        nextCourse,
        nextPasswordHash,
        now,
        student.id
      );

      if (nextStatus !== 'active' || passwordChanged) {
        await db.run('DELETE FROM sessions WHERE user_id = ?', student.id);
      }

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: student.id,
        action: 'ADMIN_UPDATED_STUDENT_ACCOUNT',
        details: `Status: ${nextStatus}, Kapasidad: ${Math.round(nextQuotaBytes / (1024 * 1024))} MB${passwordChanged ? ', Pinalitan ang password' : ''}`,
      });

      return res.json({
        message: `Na-update ang account ni ${nextName}.`,
      });
    })
  );

  router.delete(
    '/students/:id',
    asyncHandler(async (req, res) => {
      const student = await db.get(
        "SELECT id, full_name, email FROM users WHERE id = ? AND role = 'student'",
        req.params.id
      );

      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang account ng mag-aaral.' });
      }

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: null,
        action: 'ADMIN_DELETED_STUDENT_ACCOUNT',
        details: `Tinanggal ang account: ${student.full_name} (${student.email})`,
      });

      await db.run('DELETE FROM users WHERE id = ?', student.id);
      return res.json({
        message: `Tuluyan nang tinanggal ang account ni ${student.full_name}.`,
      });
    })
  );

  router.post(
    '/students/:id/request-access',
    asyncHandler(async (req, res) => {
      const student = await db.get(
        "SELECT id, full_name FROM users WHERE id = ? AND role = 'student'",
        req.params.id
      );

      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang mag-aaral.' });
      }

      const { permissionLevel = 'read', reason = '' } = req.body || {};
      if (!['read', 'read_write'].includes(permissionLevel)) {
        return res.status(400).json({ error: 'Hindi wastong uri ng pahintulot.' });
      }
      const cleanReason = String(reason).trim().slice(0, 240);
      if (!cleanReason) {
        return res.status(400).json({
          error: 'Mangyaring ilagay ang dahilan ng paghiling ng pahintulot sa mag-aaral.',
        });
      }

      await db.run(
        `UPDATE access_grants
         SET status = 'revoked'
         WHERE student_id = ? AND status = 'pending'`,
        student.id
      );

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO access_grants (
          id, student_id, admin_id, permission_level, status, reason, requested_by_admin, created_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, 1, ?)`,
        id,
        student.id,
        req.user.id,
        permissionLevel,
        cleanReason,
        now
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: student.id,
        action: 'ADMIN_REQUESTED_ACCESS',
        details: `Humiling ng pahintulot (${permissionLevel}): ${cleanReason}`,
      });

      return res.status(201).json({
        message: `Naipadala na ang kahilingan ng pahintulot kay ${student.full_name}. Kailangan muna itong aprubahan ng mag-aaral bago mabuksan ang kanyang mga dokumento.`,
      });
    })
  );

  router.get(
    '/audit-logs',
    asyncHandler(async (_req, res) => {
      const logs = await db.all(
        `SELECT l.*, a.full_name AS actor_name, t.full_name AS target_name
         FROM audit_logs l
         LEFT JOIN users a ON a.id = l.actor_id
         LEFT JOIN users t ON t.id = l.target_user_id
         ORDER BY l.created_at DESC
         LIMIT 50`
      );

      return res.json({
        logs: logs.map((l) => ({
          id: l.id,
          actorName: l.actor_name || 'Sistema',
          targetName: l.target_name || '—',
          action: l.action,
          details: l.details,
          createdAt: l.created_at,
        })),
      });
    })
  );

  router.get(
    '/password-resets',
    asyncHandler(async (_req, res) => {
      const rows = await db.all(
        `SELECT r.*, u.full_name, u.student_number AS actual_student_number, u.course_section
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 50`
      );

      return res.json({
        requests: rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          fullName: r.full_name,
          email: r.email,
          studentNumber: r.student_number || r.actual_student_number || '',
          courseSection: r.course_section || '',
          reason: r.reason,
          status: r.status,
          createdAt: r.created_at,
          resolvedAt: r.resolved_at,
        })),
      });
    })
  );

  router.post(
    '/password-resets/:id/resolve',
    asyncHandler(async (req, res) => {
      const requestRow = await db.get(
        "SELECT * FROM password_reset_requests WHERE id = ? AND status = 'pending'",
        req.params.id
      );

      if (!requestRow) {
        return res.status(404).json({ error: 'Hindi natagpuan ang nakabinbing kahilingan.' });
      }

      const { action = 'reset', newPassword = '' } = req.body || {};
      const now = new Date().toISOString();

      if (action === 'dismiss') {
        await db.run(
          `UPDATE password_reset_requests
           SET status = 'dismissed', resolved_at = ?, resolved_by_admin_id = ?
           WHERE id = ?`,
          now,
          req.user.id,
          requestRow.id
        );

        return res.json({ message: 'Isinara ang kahilingan sa pag-reset ng password.' });
      }

      const cleanPassword = String(newPassword);
      if (cleanPassword.length < 8) {
        return res.status(400).json({
          error: 'Ang pansamantalang password ay dapat may hindi bababa sa 8 karakter.',
        });
      }

      await db.run(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        hashPassword(cleanPassword),
        now,
        requestRow.user_id
      );
      await db.run('DELETE FROM sessions WHERE user_id = ?', requestRow.user_id);
      await db.run(
        `UPDATE password_reset_requests
         SET status = 'resolved', resolved_at = ?, resolved_by_admin_id = ?
         WHERE id = ?`,
        now,
        req.user.id,
        requestRow.id
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: requestRow.user_id,
        action: 'ADMIN_RESET_STUDENT_PASSWORD',
        details: `Nag-reset ng password para kay ${requestRow.email}`,
      });

      return res.json({
        message: `Matagumpay na na-reset ang password para kay ${requestRow.email}.`,
      });
    })
  );

  return router;
}
