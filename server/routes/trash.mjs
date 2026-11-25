import express from 'express';
import { requireAuth, resolveWorkspaceAccess } from '../middleware/auth.mjs';
import { getStorageSummary, recalculateUserStorage } from '../utils/storage.mjs';
import { asyncHandler } from '../utils/http.mjs';

export function createTrashRouter(db) {
  const router = express.Router();

  router.get(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;

      const deletedFolders = await db.all(
        `SELECT f.*,
          (SELECT COUNT(*) FROM documents d WHERE d.deleted_with_folder_id = f.id AND d.is_deleted = 1) AS nested_doc_count,
          (SELECT COUNT(*) FROM folders sf WHERE sf.deleted_with_parent_id = f.id AND sf.is_deleted = 1) AS nested_folder_count,
          (SELECT COALESCE(SUM(d.size_bytes), 0) FROM documents d WHERE d.deleted_with_folder_id = f.id AND d.is_deleted = 1) AS nested_bytes
         FROM folders f
         WHERE f.user_id = ? AND f.is_deleted = 1 AND f.deleted_with_parent_id IS NULL
         ORDER BY f.deleted_at DESC`,
        ownerId
      );

      const deletedDocs = await db.all(
        `SELECT d.*, f.name AS original_folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id
         WHERE d.user_id = ? AND d.is_deleted = 1 AND d.deleted_with_folder_id IS NULL
         ORDER BY d.deleted_at DESC`,
        ownerId
      );

      return res.json({
        folders: deletedFolders.map((f) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          icon: f.icon,
          deletedAt: f.deleted_at,
          nestedDocCount: Number(f.nested_doc_count || 0),
          nestedFolderCount: Number(f.nested_folder_count || 0),
          nestedBytes: Number(f.nested_bytes || 0),
        })),
        documents: deletedDocs.map((d) => ({
          id: d.id,
          title: d.title,
          originalFolderName: d.original_folder_name || null,
          wordCount: Number(d.word_count || 0),
          sizeBytes: Number(d.size_bytes || 0),
          deletedAt: d.deleted_at,
        })),
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.post(
    '/folders/:id/restore',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = await db.get(
        'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 1',
        req.params.id,
        ownerId
      );

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder sa Basurahan.' });
      }

      const now = new Date().toISOString();
      let nextParentId = folder.parent_id;
      if (nextParentId) {
        const activeParent = await db.get(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
          nextParentId,
          ownerId
        );
        if (!activeParent) {
          nextParentId = null;
        }
      }

      await db.run(
        `UPDATE folders
         SET is_deleted = 0, deleted_at = NULL, deleted_with_parent_id = NULL,
             parent_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        nextParentId,
        now,
        folder.id,
        ownerId
      );

      await db.run(
        `UPDATE folders
         SET is_deleted = 0, deleted_at = NULL, deleted_with_parent_id = NULL, updated_at = ?
         WHERE deleted_with_parent_id = ? AND user_id = ?`,
        now,
        folder.id,
        ownerId
      );

      await db.run(
        `UPDATE documents
         SET is_deleted = 0, deleted_at = NULL, deleted_with_folder_id = NULL, updated_at = ?
         WHERE deleted_with_folder_id = ? AND user_id = ?`,
        now,
        folder.id,
        ownerId
      );

      return res.json({
        message: `Matagumpay na naibalik ang folder na "${folder.name}" at ang mga nilalaman nito.`,
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.post(
    '/documents/:id/restore',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const doc = await db.get(
        'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 1',
        req.params.id,
        ownerId
      );

      if (!doc) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento sa Basurahan.' });
      }

      let nextFolderId = doc.folder_id;
      let movedToRoot = false;
      if (nextFolderId) {
        const activeFolder = await db.get(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
          nextFolderId,
          ownerId
        );
        if (!activeFolder) {
          nextFolderId = null;
          movedToRoot = true;
        }
      }

      const now = new Date().toISOString();
      await db.run(
        `UPDATE documents
         SET is_deleted = 0, deleted_at = NULL, deleted_with_folder_id = NULL,
             folder_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        nextFolderId,
        now,
        doc.id,
        ownerId
      );

      return res.json({
        message: movedToRoot
          ? `Naibalik ang "${doc.title}" sa Pangunahing Lalagyan dahil nasa Basurahan pa ang orihinal na folder nito.`
          : `Matagumpay na naibalik ang dokumentong "${doc.title}".`,
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.delete(
    '/folders/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = await db.get(
        'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 1',
        req.params.id,
        ownerId
      );

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder sa Basurahan.' });
      }

      const allFolders = await db.all(
        'SELECT id, parent_id FROM folders WHERE user_id = ? AND is_deleted = 1',
        ownerId
      );
      const byParent = new Map();
      for (const f of allFolders) {
        const key = f.parent_id || '__root__';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(f.id);
      }
      const subtreeIds = [folder.id];
      const queue = [folder.id];
      const seen = new Set(subtreeIds);
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const childId of byParent.get(cur) || []) {
          if (!seen.has(childId)) {
            seen.add(childId);
            subtreeIds.push(childId);
            queue.push(childId);
          }
        }
      }

      const placeholders = subtreeIds.map(() => '?').join(',');
      await db.run(
        `DELETE FROM documents
         WHERE user_id = ? AND is_deleted = 1
           AND (deleted_with_folder_id IN (${placeholders}) OR folder_id IN (${placeholders}))`,
        ownerId,
        ...subtreeIds,
        ...subtreeIds
      );

      await db.run(
        `DELETE FROM folders WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders})`,
        ownerId,
        ...subtreeIds
      );

      await recalculateUserStorage(db, ownerId);
      return res.json({
        message: `Tuluyan nang nabura ang folder na "${folder.name}" at nabawi ang nagamit na storage.`,
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.delete(
    '/documents/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const doc = await db.get(
        'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 1',
        req.params.id,
        ownerId
      );

      if (!doc) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento sa Basurahan.' });
      }

      await db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', doc.id, ownerId);
      await recalculateUserStorage(db, ownerId);

      return res.json({
        message: `Tuluyan nang nabura ang dokumentong "${doc.title}".`,
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.delete(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;

      await db.run('DELETE FROM documents WHERE user_id = ? AND is_deleted = 1', ownerId);
      await db.run('DELETE FROM folders WHERE user_id = ? AND is_deleted = 1', ownerId);
      await recalculateUserStorage(db, ownerId);

      return res.json({
        message: 'Tuluyan nang nilinis ang lahat ng laman ng Basurahan.',
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  return router;
}
