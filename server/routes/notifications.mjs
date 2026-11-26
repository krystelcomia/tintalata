import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.mjs';
import { asyncHandler } from '../utils/http.mjs';

export function createNotificationsRouter(db) {
  const router = express.Router();

  router.use(requireAuth, requireRole('student'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const rows = await db.all(
        `SELECT id, reset_request_id, type, title, message, is_read, read_at, created_at
         FROM student_notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        req.user.id
      );

      const unreadRow = await db.get(
        'SELECT COUNT(*) AS cnt FROM student_notifications WHERE user_id = ? AND is_read = 0',
        req.user.id
      );

      return res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          resetRequestId: n.reset_request_id || null,
          type: n.type,
          title: n.title,
          message: n.message,
          isRead: Boolean(n.is_read),
          readAt: n.read_at || null,
          createdAt: n.created_at,
        })),
        unreadCount: Number(unreadRow?.cnt || 0),
      });
    })
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE student_notifications
         SET is_read = 1, read_at = COALESCE(read_at, ?)
         WHERE id = ? AND user_id = ?`,
        now,
        req.params.id,
        req.user.id
      );

      const unreadRow = await db.get(
        'SELECT COUNT(*) AS cnt FROM student_notifications WHERE user_id = ? AND is_read = 0',
        req.user.id
      );

      return res.json({
        ok: true,
        unreadCount: Number(unreadRow?.cnt || 0),
      });
    })
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => {
      const now = new Date().toISOString();
      await db.run(
        `UPDATE student_notifications
         SET is_read = 1, read_at = COALESCE(read_at, ?)
         WHERE user_id = ? AND is_read = 0`,
        now,
        req.user.id
      );

      return res.json({
        ok: true,
        unreadCount: 0,
      });
    })
  );

  return router;
}
