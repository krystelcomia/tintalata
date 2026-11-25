import express from 'express';
import { requireAuth, resolveWorkspaceAccess } from '../middleware/auth.mjs';
import { getStorageSummary, recalculateUserStorage } from '../utils/storage.mjs';

export function createTrashRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth, resolveWorkspaceAccess(db), (req, res) => {
    const ownerId = req.workspace.ownerId;

    // Top-level deleted folders (those deleted directly, not merely swept into a parent cascade)
    const deletedFolders = db
      .prepare(
        `SELECT f.*,
          (SELECT COUNT(*) FROM documents d WHERE d.deleted_with_folder_id = f.id AND d.is_deleted = 1) AS nested_doc_count,
          (SELECT COUNT(*) FROM folders sf WHERE sf.deleted_with_parent_id = f.id AND sf.is_deleted = 1) AS nested_folder_count,
          (SELECT COALESCE(SUM(d.size_bytes), 0) FROM documents d WHERE d.deleted_with_folder_id = f.id AND d.is_deleted = 1) AS nested_bytes
         FROM folders f
         WHERE f.user_id = ? AND f.is_deleted = 1 AND f.deleted_with_parent_id IS NULL
         ORDER BY f.deleted_at DESC`
      )
      .all(ownerId);

    // Individually deleted documents (not swept into a folder cascade)
    const deletedDocs = db
      .prepare(
        `SELECT d.*, f.name AS original_folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id
         WHERE d.user_id = ? AND d.is_deleted = 1 AND d.deleted_with_folder_id IS NULL
         ORDER BY d.deleted_at DESC`
      )
      .all(ownerId);

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
      storage: getStorageSummary(db, ownerId),
    });
  });

  router.post(
    '/folders/:id/restore',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = db
        .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 1')
        .get(req.params.id, ownerId);

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder sa Basurahan.' });
      }

      const now = new Date().toISOString();
      // If parent folder is missing or still deleted, restore to root
      let nextParentId = folder.parent_id;
      if (nextParentId) {
        const activeParent = db
          .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
          .get(nextParentId, ownerId);
        if (!activeParent) {
          nextParentId = null;
        }
      }

      db.prepare(
        `UPDATE folders
         SET is_deleted = 0, deleted_at = NULL, deleted_with_parent_id = NULL,
             parent_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(nextParentId, now, folder.id, ownerId);

      db.prepare(
        `UPDATE folders
         SET is_deleted = 0, deleted_at = NULL, deleted_with_parent_id = NULL, updated_at = ?
         WHERE deleted_with_parent_id = ? AND user_id = ?`
      ).run(now, folder.id, ownerId);

      db.prepare(
        `UPDATE documents
         SET is_deleted = 0, deleted_at = NULL, deleted_with_folder_id = NULL, updated_at = ?
         WHERE deleted_with_folder_id = ? AND user_id = ?`
      ).run(now, folder.id, ownerId);

      return res.json({
        message: `Matagumpay na naibalik ang folder na "${folder.name}" at ang mga nilalaman nito.`,
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.post(
    '/documents/:id/restore',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const doc = db
        .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 1')
        .get(req.params.id, ownerId);

      if (!doc) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento sa Basurahan.' });
      }

      let nextFolderId = doc.folder_id;
      let movedToRoot = false;
      if (nextFolderId) {
        const activeFolder = db
          .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
          .get(nextFolderId, ownerId);
        if (!activeFolder) {
          nextFolderId = null;
          movedToRoot = true;
        }
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE documents
         SET is_deleted = 0, deleted_at = NULL, deleted_with_folder_id = NULL,
             folder_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(nextFolderId, now, doc.id, ownerId);

      return res.json({
        message: movedToRoot
          ? `Naibalik ang "${doc.title}" sa Pangunahing Lalagyan dahil nasa Basurahan pa ang orihinal na folder nito.`
          : `Matagumpay na naibalik ang dokumentong "${doc.title}".`,
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.delete(
    '/folders/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = db
        .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 1')
        .get(req.params.id, ownerId);

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder sa Basurahan.' });
      }

      // Collect entire deleted subtree so independently deleted nested subfolders are also cleaned cleanly
      const allFolders = db
        .prepare('SELECT id, parent_id FROM folders WHERE user_id = ? AND is_deleted = 1')
        .all(ownerId);
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
      db.prepare(
        `DELETE FROM documents
         WHERE user_id = ? AND is_deleted = 1
           AND (deleted_with_folder_id IN (${placeholders}) OR folder_id IN (${placeholders}))`
      ).run(ownerId, ...subtreeIds, ...subtreeIds);

      db.prepare(
        `DELETE FROM folders WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders})`
      ).run(ownerId, ...subtreeIds);

      recalculateUserStorage(db, ownerId);
      return res.json({
        message: `Tuluyan nang nabura ang folder na "${folder.name}" at nabawi ang nagamit na storage.`,
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.delete(
    '/documents/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const doc = db
        .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 1')
        .get(req.params.id, ownerId);

      if (!doc) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento sa Basurahan.' });
      }

      db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(doc.id, ownerId);
      recalculateUserStorage(db, ownerId);

      return res.json({
        message: `Tuluyan nang nabura ang dokumentong "${doc.title}".`,
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.delete(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;

      db.prepare('DELETE FROM documents WHERE user_id = ? AND is_deleted = 1').run(ownerId);
      db.prepare('DELETE FROM folders WHERE user_id = ? AND is_deleted = 1').run(ownerId);
      recalculateUserStorage(db, ownerId);

      return res.json({
        message: 'Tuluyan nang nilinis ang lahat ng laman ng Basurahan.',
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  return router;
}
