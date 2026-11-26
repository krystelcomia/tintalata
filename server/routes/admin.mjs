import express from 'express';
import crypto from 'node:crypto';
import { CONFIG } from '../config.mjs';
import { requireAuth, requireRole } from '../middleware/auth.mjs';
import { getStorageSummary } from '../utils/storage.mjs';
import {
  decryptRecoveryCode,
  encryptRecoveryCode,
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  hashToken,
  verifyRecoveryCodeHmac,
} from '../utils/crypto.mjs';
import { createStudentAccount } from '../utils/accounts.mjs';
import {
  buildResetApprovedEmail,
  buildResetRejectedEmail,
  resolveAppBaseUrl,
  sendTransactionalEmail,
} from '../utils/email.mjs';
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

async function ensureStudentsLinkedToAdmin(db, adminId) {
  if (!adminId) return;
  await db.run(
    `UPDATE users
     SET managed_by_admin_id = ?
     WHERE LOWER(role) = 'student'
       AND (
         managed_by_admin_id IS NULL
         OR managed_by_admin_id = ''
         OR managed_by_admin_id NOT IN (SELECT id FROM users WHERE LOWER(role) = 'admin')
       )`,
    adminId
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

async function getRecoveryCodeMetadata(db, studentId) {
  const activeRow = await db.get(
    `SELECT id, status, created_at, last_viewed_at, last_verified_at
     FROM student_recovery_codes
     WHERE user_id = ? AND status = 'active'
     LIMIT 1`,
    studentId
  );
  const latestInvalidated = await db.get(
    `SELECT created_at, invalidated_at, invalidated_reason
     FROM student_recovery_codes
     WHERE user_id = ? AND status = 'invalidated'
     ORDER BY invalidated_at DESC, created_at DESC
     LIMIT 1`,
    studentId
  );
  const guard = await db.get(
    'SELECT failed_attempts, blocked_until FROM recovery_verification_guards WHERE user_id = ?',
    studentId
  );
  const isBlocked = Boolean(
    guard?.blocked_until && new Date(guard.blocked_until).getTime() > Date.now()
  );

  return {
    status: activeRow ? 'active' : latestInvalidated ? 'invalidated' : 'none',
    hasActiveCode: Boolean(activeRow),
    createdAt: activeRow?.created_at || latestInvalidated?.created_at || null,
    invalidatedAt: latestInvalidated?.invalidated_at || null,
    lastViewedAt: activeRow?.last_viewed_at || null,
    lastVerifiedAt: activeRow?.last_verified_at || null,
    isTemporarilyBlocked: isBlocked,
    blockedUntil: isBlocked ? guard.blocked_until : null,
    failedAttempts: Number(guard?.failed_attempts || 0),
  };
}

export function createAdminRouter(db) {
  const router = express.Router();

  router.use(requireAuth, requireRole('admin'));

  router.get(
    '/overview',
    asyncHandler(async (req, res) => {
      await expireStaleGrants(db);
      await ensureStudentsLinkedToAdmin(db, req.user.id);
      const counts = await db.get(
        `SELECT
          COUNT(*) AS total_students,
          COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_students,
          COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended_students,
          COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactive_students,
          COALESCE(SUM(storage_used_bytes), 0) AS total_used_bytes,
          COALESCE(SUM(storage_quota_bytes), 0) AS total_quota_bytes
         FROM users
         WHERE LOWER(role) = 'student'`
      );

      const docTotals = await db.get(
        `SELECT
          COALESCE(SUM(CASE WHEN d.is_deleted = 0 THEN 1 ELSE 0 END), 0) AS active_docs,
          COALESCE(SUM(CASE WHEN d.is_deleted = 1 THEN 1 ELSE 0 END), 0) AS trash_docs
         FROM documents d
         JOIN users u ON u.id = d.user_id
         WHERE LOWER(u.role) = 'student'`
      );

      const authorizedRow = await db.get(
        "SELECT COUNT(DISTINCT student_id) AS cnt FROM access_grants WHERE status = 'approved'"
      );
      const authorizedCount = Number(authorizedRow?.cnt || 0);

      const pendingResetRow = await db.get(
        "SELECT COUNT(*) AS cnt FROM password_reset_requests WHERE status = 'pending'"
      );
      const pendingResetCount = Number(pendingResetRow?.cnt || 0);

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
          pendingResetCount,
        },
      });
    })
  );

  router.get(
    '/students',
    asyncHandler(async (req, res) => {
      await expireStaleGrants(db);
      await ensureStudentsLinkedToAdmin(db, req.user.id);
      const { search = '', status = 'all' } = req.query;

      let sql = `
        SELECT u.id, u.email, u.full_name, u.student_number, u.course_section,
               u.status, u.storage_quota_bytes, u.storage_used_bytes,
               u.managed_by_admin_id, adm.full_name AS linked_admin_name, adm.email AS linked_admin_email,
               u.created_at, u.updated_at, u.last_login_at,
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id AND d.is_deleted = 0) AS active_doc_count,
               (SELECT COUNT(*) FROM folders f WHERE f.user_id = u.id AND f.is_deleted = 0) AS active_folder_count,
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id AND d.is_deleted = 1) AS trash_doc_count
        FROM users u
        LEFT JOIN users adm ON adm.id = u.managed_by_admin_id
        WHERE LOWER(u.role) = 'student'
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
          linkedAdminId: r.managed_by_admin_id || req.user.id,
          linkedAdminName: r.linked_admin_name || req.user.fullName,
          linkedAdminEmail: r.linked_admin_email || req.user.email,
          authorization: await getLatestGrantStatus(db, r.id),
          recoveryCode: await getRecoveryCodeMetadata(db, r.id),
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
        recoveryCode: result.recoveryCode,
      });
    })
  );

  router.get(
    '/recovery-codes',
    asyncHandler(async (req, res) => {
      const { search = '' } = req.query;
      let sql = `
        SELECT id, full_name, student_number, email, status, created_at
        FROM users
        WHERE LOWER(role) = 'student'
      `;
      const params = [];
      if (search && String(search).trim()) {
        const q = `%${String(search).trim().toLowerCase()}%`;
        sql += ' AND (LOWER(full_name) LIKE ? OR LOWER(student_number) LIKE ? OR LOWER(email) LIKE ?)';
        params.push(q, q, q);
      }
      sql += ' ORDER BY created_at DESC';
      const rows = await db.all(sql, ...params);
      const records = await Promise.all(
        rows.map(async (r) => ({
          studentId: r.id,
          fullName: r.full_name,
          studentNumber: r.student_number || '',
          email: r.email,
          accountStatus: r.status,
          accountCreatedAt: r.created_at,
          recoveryCode: await getRecoveryCodeMetadata(db, r.id),
        }))
      );
      return res.json({ records });
    })
  );

  router.post(
    '/students/:id/recovery-code/reveal',
    asyncHandler(async (req, res) => {
      const student = await db.get(
        "SELECT id, full_name, student_number, email FROM users WHERE id = ? AND LOWER(role) = 'student'",
        req.params.id
      );
      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang account ng mag-aaral.' });
      }

      const activeCode = await db.get(
        `SELECT id, code_hmac, code_ciphertext, status, created_at
         FROM student_recovery_codes
         WHERE user_id = ? AND status = 'active'
         LIMIT 1`,
        student.id
      );
      if (!activeCode) {
        return res.status(404).json({
          error: 'Walang aktibong Recovery Code para sa mag-aaral na ito. Maaaring gumawa ng bago.',
        });
      }

      const plainCode = decryptRecoveryCode(activeCode.code_ciphertext, student.id);
      if (!plainCode || !verifyRecoveryCodeHmac(student.id, plainCode, activeCode.code_hmac)) {
        return res.status(500).json({
          error:
            'Hindi ma-decrypt ang kasalukuyang Recovery Code dahil sa pagbabago ng encryption key. Mangyaring gumawa ng bagong Recovery Code para sa mag-aaral.',
        });
      }

      const now = new Date().toISOString();
      await db.run(
        'UPDATE student_recovery_codes SET last_viewed_at = ?, last_viewed_by_admin_id = ? WHERE id = ?',
        now,
        req.user.id,
        activeCode.id
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: student.id,
        action: 'ADMIN_VIEWED_RECOVERY_CODE',
        details: `Ligtas na sinuri ng Admin ang 6-digit Recovery Code ni ${student.full_name} (${student.email})`,
      });

      return res.json({
        recoveryCode: plainCode,
        status: activeCode.status,
        createdAt: activeCode.created_at,
        viewedAt: now,
        student: {
          id: student.id,
          fullName: student.full_name,
          studentNumber: student.student_number || '',
          email: student.email,
        },
      });
    })
  );

  router.post(
    '/students/:id/recovery-code/regenerate',
    asyncHandler(async (req, res) => {
      const student = await db.get(
        "SELECT id, full_name, student_number, email FROM users WHERE id = ? AND LOWER(role) = 'student'",
        req.params.id
      );
      if (!student) {
        return res.status(404).json({ error: 'Hindi natagpuan ang account ng mag-aaral.' });
      }

      const cleanReason =
        String(req.body?.reason || '').trim().slice(0, 240) ||
        'Pinalitan ng Tagapangasiwa (nawala o nakompromiso ang dating code)';

      const previousActive = await db.get(
        `SELECT id, code_ciphertext
         FROM student_recovery_codes
         WHERE user_id = ? AND status = 'active'
         LIMIT 1`,
        student.id
      );

      const excludeCode = previousActive
        ? decryptRecoveryCode(previousActive.code_ciphertext, student.id)
        : null;
      const now = new Date().toISOString();

      if (previousActive) {
        await db.run(
          `UPDATE student_recovery_codes
           SET status = 'invalidated',
               invalidated_at = ?,
               invalidated_by_admin_id = ?,
               invalidated_reason = ?
           WHERE user_id = ? AND status = 'active'`,
          now,
          req.user.id,
          cleanReason,
          student.id
        );

        await logAudit(db, {
          actorId: req.user.id,
          targetUserId: student.id,
          action: 'ADMIN_INVALIDATED_RECOVERY_CODE',
          details: `Agad na na-invalidate ang dating Recovery Code ni ${student.full_name} (${student.email}): ${cleanReason}`,
        });
      }

      const nextCode = generateRecoveryCode(excludeCode);
      await db.run(
        `INSERT INTO student_recovery_codes (
          id, user_id, code_hmac, code_ciphertext, status, created_at, created_by_user_id
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        crypto.randomUUID(),
        student.id,
        hashRecoveryCode(student.id, nextCode),
        encryptRecoveryCode(nextCode, student.id),
        now,
        req.user.id
      );

      // Clear any consecutive wrong-attempt lockout on replacement
      await db.run('DELETE FROM recovery_verification_guards WHERE user_id = ?', student.id);

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: student.id,
        action: 'ADMIN_REGENERATED_RECOVERY_CODE',
        details: `Gumawa ng bagong 6-digit Recovery Code para kay ${student.full_name} (${student.email})`,
      });

      return res.json({
        message: `Nakagawa ng bagong 6-digit Recovery Code para kay ${student.full_name}. Agad nang hindi magagamit ang dating code.`,
        recoveryCode: nextCode,
        createdAt: now,
        invalidatedPrevious: Boolean(previousActive),
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
      const recoveryCode = await getRecoveryCodeMetadata(db, student.id);
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
          recoveryCode,
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
    asyncHandler(async (req, res) => {
      const statusFilter = String(req.query.status || 'all').toLowerCase();

      const allRows = await db.all(
        `SELECT r.*, u.full_name AS user_full_name, u.student_number AS actual_student_number,
                u.course_section AS actual_course_section
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 100`
      );

      const normalizedRows = allRows.map((r) => ({
        ...r,
        normalizedStatus:
          r.status === 'resolved'
            ? 'completed'
            : r.status === 'dismissed'
              ? 'rejected'
              : r.status,
      }));

      const counts = {
        all: normalizedRows.length,
        pending: normalizedRows.filter((r) => r.normalizedStatus === 'pending').length,
        approved: normalizedRows.filter((r) => r.normalizedStatus === 'approved').length,
        rejected: normalizedRows.filter((r) => r.normalizedStatus === 'rejected').length,
        completed: normalizedRows.filter((r) => r.normalizedStatus === 'completed').length,
      };

      const filteredRows =
        statusFilter && statusFilter !== 'all'
          ? normalizedRows.filter((r) => r.normalizedStatus === statusFilter)
          : normalizedRows;

      const requests = await Promise.all(
        filteredRows.map(async (r) => {
          const latestToken = await db.get(
            `SELECT expires_at, used_at, created_at
             FROM password_reset_tokens
             WHERE request_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            r.id
          );
          const emailLogs = await db.all(
            `SELECT id, email_type, status, provider, error_message, created_at, sent_at
             FROM email_notifications
             WHERE reset_request_id = ?
             ORDER BY created_at DESC
             LIMIT 5`,
            r.id
          );

          return {
            id: r.id,
            userId: r.user_id,
            referenceNumber:
              r.reference_code || `TRR-${String(r.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            fullName: r.full_name || r.user_full_name,
            email: r.email,
            studentNumber: r.student_number || r.actual_student_number || '',
            courseSection: r.course_section || r.actual_course_section || '',
            reason: r.reason,
            status: r.normalizedStatus,
            rejectionReason: r.rejection_reason || '',
            createdAt: r.created_at,
            updatedAt: r.updated_at || r.created_at,
            approvedAt: r.approved_at || null,
            rejectedAt: r.rejected_at || null,
            completedAt: r.completed_at || null,
            resolvedAt: r.resolved_at || null,
            tokenExpiresAt: latestToken?.expires_at || null,
            tokenUsedAt: latestToken?.used_at || null,
            tokenExpired: Boolean(
              latestToken &&
                !latestToken.used_at &&
                new Date(latestToken.expires_at).getTime() <= Date.now()
            ),
            emailDelivery: emailLogs[0]
              ? {
                  status: emailLogs[0].status,
                  emailType: emailLogs[0].email_type,
                  provider: emailLogs[0].provider,
                  error: emailLogs[0].error_message || null,
                  sentAt: emailLogs[0].sent_at || null,
                }
              : null,
          };
        })
      );

      return res.json({ requests, counts });
    })
  );

  router.post(
    '/password-resets/:id/approve',
    asyncHandler(async (req, res) => {
      const requestRow = await db.get(
        `SELECT r.*, u.full_name AS user_full_name, u.email AS user_email, u.status AS user_status
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ? AND r.status = 'pending'`,
        req.params.id
      );

      if (!requestRow) {
        return res.status(404).json({
          error: 'Hindi natagpuan ang nakabinbing kahilingan o naaksyunan na ito.',
        });
      }

      if (requestRow.user_status !== 'active') {
        return res.status(400).json({
          error: 'Hindi maaaring aprubahan dahil hindi aktibo o sinuspinde ang account ng mag-aaral.',
        });
      }

      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + CONFIG.PASSWORD_RESET_TOKEN_TTL_MS).toISOString();
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const refNum =
        requestRow.reference_code ||
        `TRR-${String(requestRow.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;

      // Invalidate any previous unused tokens for this user
      await db.run(
        'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
        now,
        requestRow.user_id
      );

      await db.run(
        `INSERT INTO password_reset_tokens (id, request_id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        requestRow.id,
        requestRow.user_id,
        tokenHash,
        expiresAt,
        now
      );

      await db.run(
        `UPDATE password_reset_requests
         SET status = 'approved', approved_at = ?, approved_by_admin_id = ?, updated_at = ?, reference_code = ?
         WHERE id = ?`,
        now,
        req.user.id,
        now,
        refNum,
        requestRow.id
      );

      // Persist in-app notification immediately in DB so logged-out students see it upon login
      await db.run(
        `INSERT INTO student_notifications (
          id, user_id, reset_request_id, type, title, message, is_read, created_at
        ) VALUES (?, ?, ?, 'password_reset_approved', 'Naaprubahan ang Password Reset', ?, 0, ?)
        ON CONFLICT DO NOTHING`,
        crypto.randomUUID(),
        requestRow.user_id,
        requestRow.id,
        'Your password reset request has been approved by the Admin. Please check your registered email for the password reset link.',
        now
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: requestRow.user_id,
        action: 'ADMIN_APPROVED_PASSWORD_RESET',
        details: `Inaprubahan ang password reset request (${refNum}) para kay ${requestRow.user_email}`,
      });

      const resetUrl = `${resolveAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
      const emailTpl = buildResetApprovedEmail({
        fullName: requestRow.full_name || requestRow.user_full_name,
        referenceNumber: refNum,
        resetUrl,
        expiresMinutes: 15,
      });

      const emailDelivery = await sendTransactionalEmail(db, {
        userId: requestRow.user_id,
        resetRequestId: requestRow.id,
        recipientEmail: requestRow.user_email,
        emailType: 'reset_approved',
        ...emailTpl,
      });

      return res.json({
        message: emailDelivery.sent
          ? `Naaprubahan ang kahilingan (${refNum}) at naipadala na ang 15-minutong reset link sa ${requestRow.user_email}.`
          : `Naaprubahan ang kahilingan (${refNum}) at naitala ang in-app notification, ngunit NABIGO ang pagpapadala ng email: ${emailDelivery.error}`,
        referenceNumber: refNum,
        expiresAt,
        emailDelivery,
      });
    })
  );

  router.post(
    '/password-resets/:id/reject',
    asyncHandler(async (req, res) => {
      const cleanReason = String(req.body?.reason || req.body?.rejectionReason || '')
        .trim()
        .slice(0, 500);
      if (cleanReason.length < 3) {
        return res.status(400).json({
          error: 'Kinakailangang maglagay ng dahilan sa pagtanggi ng kahilingan (min. 3 karakter).',
        });
      }

      const requestRow = await db.get(
        `SELECT r.*, u.full_name AS user_full_name, u.email AS user_email
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ? AND r.status = 'pending'`,
        req.params.id
      );

      if (!requestRow) {
        return res.status(404).json({
          error: 'Hindi natagpuan ang nakabinbing kahilingan o naaksyunan na ito.',
        });
      }

      const now = new Date().toISOString();
      const refNum =
        requestRow.reference_code ||
        `TRR-${String(requestRow.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;

      await db.run(
        `UPDATE password_reset_requests
         SET status = 'rejected', rejection_reason = ?, rejected_at = ?, rejected_by_admin_id = ?,
             resolved_at = ?, resolved_by_admin_id = ?, updated_at = ?, reference_code = ?
         WHERE id = ?`,
        cleanReason,
        now,
        req.user.id,
        now,
        req.user.id,
        now,
        refNum,
        requestRow.id
      );

      await db.run(
        `INSERT INTO student_notifications (
          id, user_id, reset_request_id, type, title, message, is_read, created_at
        ) VALUES (?, ?, ?, 'password_reset_rejected', 'Tinanggihan ang Password Reset', ?, 0, ?)
        ON CONFLICT DO NOTHING`,
        crypto.randomUUID(),
        requestRow.user_id,
        requestRow.id,
        `Your password reset request has been rejected. Reason: ${cleanReason}.`,
        now
      );

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: requestRow.user_id,
        action: 'ADMIN_REJECTED_PASSWORD_RESET',
        details: `Tinanggihan ang kahilingan (${refNum}) ni ${requestRow.user_email}: ${cleanReason}`,
      });

      const statusUrl = `${resolveAppBaseUrl(req)}/reset-status`;
      const emailTpl = buildResetRejectedEmail({
        fullName: requestRow.full_name || requestRow.user_full_name,
        referenceNumber: refNum,
        reason: cleanReason,
        statusUrl,
      });

      const emailDelivery = await sendTransactionalEmail(db, {
        userId: requestRow.user_id,
        resetRequestId: requestRow.id,
        recipientEmail: requestRow.user_email,
        emailType: 'reset_rejected',
        ...emailTpl,
      });

      return res.json({
        message: emailDelivery.sent
          ? `Tinanggihan ang kahilingan (${refNum}) at naipadala na ang abiso sa ${requestRow.user_email}.`
          : `Tinanggihan ang kahilingan (${refNum}) at naitala ang in-app notification, ngunit NABIGO ang pagpapadala ng email: ${emailDelivery.error}`,
        referenceNumber: refNum,
        emailDelivery,
      });
    })
  );

  router.post(
    '/password-resets/:id/resend-email',
    asyncHandler(async (req, res) => {
      const requestRow = await db.get(
        `SELECT r.*, u.full_name AS user_full_name, u.email AS user_email
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ? AND r.status IN ('approved', 'rejected')`,
        req.params.id
      );

      if (!requestRow) {
        return res.status(404).json({
          error: 'Walang nahanap na naaprubahan o tinanggihang kahilingan upang padalhan muli ng email.',
        });
      }

      const now = new Date().toISOString();
      const refNum =
        requestRow.reference_code ||
        `TRR-${String(requestRow.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;

      let emailDelivery;
      if (requestRow.status === 'approved') {
        const expiresAt = new Date(Date.now() + CONFIG.PASSWORD_RESET_TOKEN_TTL_MS).toISOString();
        const rawToken = crypto.randomBytes(32).toString('hex');
        await db.run(
          'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
          now,
          requestRow.user_id
        );
        await db.run(
          `INSERT INTO password_reset_tokens (id, request_id, user_id, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          requestRow.id,
          requestRow.user_id,
          hashToken(rawToken),
          expiresAt,
          now
        );
        const resetUrl = `${resolveAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
        emailDelivery = await sendTransactionalEmail(db, {
          userId: requestRow.user_id,
          resetRequestId: requestRow.id,
          recipientEmail: requestRow.user_email,
          emailType: 'reset_approved',
          ...buildResetApprovedEmail({
            fullName: requestRow.full_name || requestRow.user_full_name,
            referenceNumber: refNum,
            resetUrl,
            expiresMinutes: 15,
          }),
        });
      } else {
        emailDelivery = await sendTransactionalEmail(db, {
          userId: requestRow.user_id,
          resetRequestId: requestRow.id,
          recipientEmail: requestRow.user_email,
          emailType: 'reset_rejected',
          ...buildResetRejectedEmail({
            fullName: requestRow.full_name || requestRow.user_full_name,
            referenceNumber: refNum,
            reason: requestRow.rejection_reason || 'Tinanggihan ng Tagapangasiwa.',
            statusUrl: `${resolveAppBaseUrl(req)}/reset-status`,
          }),
        });
      }

      await logAudit(db, {
        actorId: req.user.id,
        targetUserId: requestRow.user_id,
        action: 'ADMIN_RESENT_PASSWORD_RESET_EMAIL',
        details: `Sinubukang ipadala muli ang email (${refNum}): ${emailDelivery.sent ? 'Naipadala' : `Nabigo - ${emailDelivery.error}`}`,
      });

      return res.json({
        message: emailDelivery.sent
          ? `Naipadala muli ang email kay ${requestRow.user_email}.`
          : `Nabigo pa rin ang pagpapadala ng email: ${emailDelivery.error}`,
        emailDelivery,
      });
    })
  );

  return router;
}
