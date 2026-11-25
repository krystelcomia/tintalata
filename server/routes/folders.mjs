import express from 'express';
import crypto from 'node:crypto';
import { requireAuth, resolveWorkspaceAccess } from '../middleware/auth.mjs';
import { buildFolderZipBuffer } from '../utils/export.mjs';

const VALID_COLORS = new Set([
  'blue',
  'indigo',
  'sky',
  'teal',
  'emerald',
  'amber',
  'rose',
  'slate',
]);
const VALID_ICONS = new Set([
  'folder',
  'book',
  'graduation',
  'palette',
  'flask',
  'calculator',
  'star',
  'briefcase',
]);

function formatFolderRow(row) {
  return {
    id: row.id,
    parentId: row.parent_id || null,
    name: row.name,
    color: row.color,
    icon: row.icon,
    docCount: Number(row.doc_count || 0),
    subfolderCount: Number(row.subfolder_count || 0),
    totalBytes: Number(row.total_bytes || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAllDescendantFolderIds(db, ownerId, rootFolderId, { includeDeleted = false } = {}) {
  const rows = db
    .prepare(
      `SELECT id, parent_id FROM folders WHERE user_id = ? ${includeDeleted ? '' : 'AND is_deleted = 0'}`
    )
    .all(ownerId);

  const byParent = new Map();
  for (const r of rows) {
    const key = r.parent_id || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r.id);
  }

  const collected = [];
  const queue = [rootFolderId];
  const visited = new Set([rootFolderId]);

  while (queue.length > 0) {
    const current = queue.shift();
    const children = byParent.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        collected.push(childId);
        queue.push(childId);
      }
    }
  }
  return collected;
}

export function createFoldersRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth, resolveWorkspaceAccess(db), (req, res) => {
    const ownerId = req.workspace.ownerId;
    const rows = db
      .prepare(
        `SELECT f.*,
          (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.is_deleted = 0) AS doc_count,
          (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.id AND sf.is_deleted = 0) AS subfolder_count,
          (SELECT COALESCE(SUM(d.size_bytes), 0) FROM documents d WHERE d.folder_id = f.id AND d.is_deleted = 0) AS total_bytes
         FROM folders f
         WHERE f.user_id = ? AND f.is_deleted = 0
         ORDER BY f.name COLLATE NOCASE ASC`
      )
      .all(ownerId);

    return res.json({
      folders: rows.map(formatFolderRow),
    });
  });

  router.post(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const { name = '', parentId = null, color = 'blue', icon = 'folder' } = req.body || {};

      const cleanName = String(name).trim();
      if (!cleanName || cleanName.length > 80) {
        return res.status(400).json({
          error: 'Ang pangalan ng folder ay dapat may 1 hanggang 80 karakter.',
        });
      }

      const safeColor = VALID_COLORS.has(color) ? color : 'blue';
      const safeIcon = VALID_ICONS.has(icon) ? icon : 'folder';

      let resolvedParentId = null;
      if (parentId) {
        const parent = db
          .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
          .get(parentId, ownerId);
        if (!parent) {
          return res.status(404).json({ error: 'Hindi natagpuan ang napiling pangunahing folder.' });
        }
        resolvedParentId = parent.id;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO folders (id, user_id, parent_id, name, color, icon, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, ownerId, resolvedParentId, cleanName, safeColor, safeIcon, now, now);

      const created = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
      return res.status(201).json({
        message: `Nagawa na ang folder na "${cleanName}".`,
        folder: formatFolderRow(created),
      });
    }
  );

  router.patch(
    '/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = db
        .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
        .get(req.params.id, ownerId);

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder.' });
      }

      const { name, color, icon, parentId } = req.body || {};
      const nextName = name !== undefined ? String(name).trim() : folder.name;
      if (!nextName || nextName.length > 80) {
        return res.status(400).json({
          error: 'Ang pangalan ng folder ay dapat may 1 hanggang 80 karakter.',
        });
      }

      const nextColor = color !== undefined && VALID_COLORS.has(color) ? color : folder.color;
      const nextIcon = icon !== undefined && VALID_ICONS.has(icon) ? icon : folder.icon;

      let nextParentId = folder.parent_id;
      if (parentId !== undefined) {
        if (parentId === null || parentId === '') {
          nextParentId = null;
        } else {
          if (parentId === folder.id) {
            return res.status(400).json({
              error: 'Hindi maaaring ilipat ang folder sa loob mismo ng sarili nito.',
            });
          }
          const descendants = new Set(getAllDescendantFolderIds(db, ownerId, folder.id));
          if (descendants.has(parentId)) {
            return res.status(400).json({
              error: 'Hindi maaaring ilipat ang folder sa loob ng sarili nitong subfolder.',
            });
          }
          const targetParent = db
            .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
            .get(parentId, ownerId);
          if (!targetParent) {
            return res.status(404).json({ error: 'Hindi natagpuan ang paglilipatang folder.' });
          }
          nextParentId = targetParent.id;
        }
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE folders SET name = ?, color = ?, icon = ?, parent_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(nextName, nextColor, nextIcon, nextParentId, now, folder.id, ownerId);

      const updated = db
        .prepare(
          `SELECT f.*,
            (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.is_deleted = 0) AS doc_count,
            (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.id AND sf.is_deleted = 0) AS subfolder_count,
            (SELECT COALESCE(SUM(d.size_bytes), 0) FROM documents d WHERE d.folder_id = f.id AND d.is_deleted = 0) AS total_bytes
           FROM folders f WHERE f.id = ?`
        )
        .get(folder.id);

      return res.json({
        message: 'Matagumpay na na-update ang folder.',
        folder: formatFolderRow(updated),
      });
    }
  );

  router.get('/:id/download', requireAuth, resolveWorkspaceAccess(db), async (req, res) => {
    const ownerId = req.workspace.ownerId;
    const folder = db
      .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
      .get(req.params.id, ownerId);

    if (!folder) {
      return res.status(404).json({ error: 'Hindi natagpuan ang folder.' });
    }

    const allFolders = db
      .prepare('SELECT * FROM folders WHERE user_id = ? AND is_deleted = 0')
      .all(ownerId);
    const allDocs = db
      .prepare('SELECT * FROM documents WHERE user_id = ? AND is_deleted = 0')
      .all(ownerId);

    const format = req.query.format || 'doc';
    const { filename, buffer } = await buildFolderZipBuffer(folder, allFolders, allDocs, format);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    return res.send(buffer);
  });

  router.delete(
    '/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const folder = db
        .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
        .get(req.params.id, ownerId);

      if (!folder) {
        return res.status(404).json({ error: 'Hindi natagpuan ang folder.' });
      }

      const descendants = getAllDescendantFolderIds(db, ownerId, folder.id);
      const allTargetFolderIds = [folder.id, ...descendants];
      const now = new Date().toISOString();

      // Soft-delete root folder (marked as independently deleted: deleted_with_parent_id = NULL)
      db.prepare(
        `UPDATE folders
         SET is_deleted = 1, deleted_at = ?, deleted_with_parent_id = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(now, now, folder.id, ownerId);

      // Soft-delete active descendants with marker pointing to this root deleted folder
      for (const subId of descendants) {
        db.prepare(
          `UPDATE folders
           SET is_deleted = 1, deleted_at = ?, deleted_with_parent_id = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND is_deleted = 0`
        ).run(now, folder.id, now, subId, ownerId);
      }

      // Soft-delete active documents inside any of these folders
      const placeholders = allTargetFolderIds.map(() => '?').join(',');
      db.prepare(
        `UPDATE documents
         SET is_deleted = 1, deleted_at = ?, deleted_with_folder_id = ?, updated_at = ?
         WHERE user_id = ? AND is_deleted = 0 AND folder_id IN (${placeholders})`
      ).run(now, folder.id, now, ownerId, ...allTargetFolderIds);

      return res.json({
        message: `Nailipat sa Basurahan ang folder na "${folder.name}" at ang mga nilalaman nito.`,
      });
    }
  );

  return router;
}
