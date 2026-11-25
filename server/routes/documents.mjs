import express from 'express';
import crypto from 'node:crypto';
import { requireAuth, resolveWorkspaceAccess } from '../middleware/auth.mjs';
import { countWords, extractPlainText, sanitizeDocumentHtml } from '../utils/sanitize.mjs';
import {
  calculateDocumentBytes,
  checkStorageQuota,
  getStorageSummary,
  recalculateUserStorage,
} from '../utils/storage.mjs';
import { buildDocumentExport } from '../utils/export.mjs';

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function formatDocumentSummary(row) {
  const plain = extractPlainText(row.content_html || '');
  const doodles = parseJsonSafe(row.doodles_json || '[]', []);
  return {
    id: row.id,
    folderId: row.folder_id || null,
    folderName: row.folder_name || null,
    title: row.title,
    previewText: plain.slice(0, 140),
    doodleCount: Array.isArray(doodles) ? doodles.length : 0,
    wordCount: Number(row.word_count || 0),
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatDocumentFull(row) {
  return {
    ...formatDocumentSummary(row),
    contentHtml: row.content_html || '',
    doodles: parseJsonSafe(row.doodles_json || '[]', []),
    pageSettings: parseJsonSafe(row.page_settings_json || '{}', {
      orientation: 'portrait',
      margins: 'normal',
      pageColor: '#ffffff',
    }),
  };
}

export function createDocumentsRouter(db) {
  const router = express.Router();

  router.get('/', requireAuth, resolveWorkspaceAccess(db), (req, res) => {
    const ownerId = req.workspace.ownerId;
    const { folderId, search } = req.query;

    let sql = `
      SELECT d.*, f.name AS folder_name
      FROM documents d
      LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
      WHERE d.user_id = ? AND d.is_deleted = 0
    `;
    const params = [ownerId];

    if (folderId === 'root') {
      sql += ' AND d.folder_id IS NULL';
    } else if (folderId && typeof folderId === 'string') {
      sql += ' AND d.folder_id = ?';
      params.push(folderId);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ' AND (d.title LIKE ? OR d.content_html LIKE ?)';
      params.push(term, term);
    }

    sql += ' ORDER BY d.updated_at DESC';

    const rows = db.prepare(sql).all(...params);
    return res.json({
      documents: rows.map(formatDocumentSummary),
    });
  });

  router.post(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const {
        title = 'Walang Pamagat na Dokumento',
        folderId = null,
        contentHtml = '<p></p>',
        doodles = [],
        pageSettings = { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' },
      } = req.body || {};

      const cleanTitle = String(title).trim().slice(0, 150) || 'Walang Pamagat na Dokumento';
      const cleanHtml = sanitizeDocumentHtml(String(contentHtml || ''));
      const doodlesJson = JSON.stringify(Array.isArray(doodles) ? doodles : []);
      const pageSettingsJson = JSON.stringify(
        pageSettings && typeof pageSettings === 'object'
          ? pageSettings
          : { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' }
      );

      let resolvedFolderId = null;
      if (folderId) {
        const folder = db
          .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
          .get(folderId, ownerId);
        if (!folder) {
          return res.status(404).json({ error: 'Hindi natagpuan ang napiling folder.' });
        }
        resolvedFolderId = folder.id;
      }

      const sizeBytes = calculateDocumentBytes({
        title: cleanTitle,
        contentHtml: cleanHtml,
        doodlesJson,
        pageSettingsJson,
      });

      const quota = checkStorageQuota(db, ownerId, sizeBytes, 0);
      if (!quota.allowed) {
        return res.status(413).json({
          error:
            'Puno na ang iyong storage! Hindi magawa ang bagong dokumento dahil kulang na ang espasyo. Magbura muna ng mga file sa Basurahan.',
        });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const words = countWords(cleanHtml);

      db.prepare(
        `INSERT INTO documents (
          id, user_id, folder_id, title, content_html, doodles_json,
          page_settings_json, word_count, size_bytes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        ownerId,
        resolvedFolderId,
        cleanTitle,
        cleanHtml,
        doodlesJson,
        pageSettingsJson,
        words,
        sizeBytes,
        now,
        now
      );

      recalculateUserStorage(db, ownerId);
      const created = db
        .prepare(
          `SELECT d.*, f.name AS folder_name
           FROM documents d
           LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
           WHERE d.id = ?`
        )
        .get(id);

      return res.status(201).json({
        message: 'Nagawa na ang bagong dokumento.',
        document: formatDocumentFull(created),
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.get('/:id', requireAuth, resolveWorkspaceAccess(db), (req, res) => {
    const ownerId = req.workspace.ownerId;
    const row = db
      .prepare(
        `SELECT d.*, f.name AS folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
         WHERE d.id = ? AND d.user_id = ? AND d.is_deleted = 0`
      )
      .get(req.params.id, ownerId);

    if (!row) {
      return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
    }

    return res.json({
      document: formatDocumentFull(row),
      permission: req.workspace.permission,
    });
  });

  router.patch(
    '/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    (req, res) => {
      const ownerId = req.workspace.ownerId;
      const existing = db
        .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0')
        .get(req.params.id, ownerId);

      if (!existing) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const { title, folderId, contentHtml, doodles, pageSettings } = req.body || {};

      const nextTitle =
        title !== undefined
          ? String(title).trim().slice(0, 150) || 'Walang Pamagat na Dokumento'
          : existing.title;

      const nextHtml =
        contentHtml !== undefined
          ? sanitizeDocumentHtml(String(contentHtml))
          : existing.content_html;

      const nextDoodlesJson =
        doodles !== undefined
          ? JSON.stringify(Array.isArray(doodles) ? doodles : [])
          : existing.doodles_json;

      const nextPageSettingsJson =
        pageSettings !== undefined && typeof pageSettings === 'object'
          ? JSON.stringify(pageSettings)
          : existing.page_settings_json;

      let nextFolderId = existing.folder_id;
      if (folderId !== undefined) {
        if (folderId === null || folderId === '') {
          nextFolderId = null;
        } else {
          const targetFolder = db
            .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0')
            .get(folderId, ownerId);
          if (!targetFolder) {
            return res.status(404).json({ error: 'Hindi natagpuan ang napiling folder.' });
          }
          nextFolderId = targetFolder.id;
        }
      }

      const newBytes = calculateDocumentBytes({
        title: nextTitle,
        contentHtml: nextHtml,
        doodlesJson: nextDoodlesJson,
        pageSettingsJson: nextPageSettingsJson,
      });

      const quota = checkStorageQuota(db, ownerId, newBytes, existing.size_bytes);
      if (!quota.allowed) {
        return res.status(413).json({
          error:
            'Lumampas na sa limitasyon ng iyong storage! Hindi nai-save ang pagbabago. Magbura muna ng mga file sa Basurahan o bawasan ang mga larawan/guhit.',
        });
      }

      const words = countWords(nextHtml);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE documents
         SET title = ?, folder_id = ?, content_html = ?, doodles_json = ?,
             page_settings_json = ?, word_count = ?, size_bytes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        nextTitle,
        nextFolderId,
        nextHtml,
        nextDoodlesJson,
        nextPageSettingsJson,
        words,
        newBytes,
        now,
        existing.id,
        ownerId
      );

      recalculateUserStorage(db, ownerId);
      const updated = db
        .prepare(
          `SELECT d.*, f.name AS folder_name
           FROM documents d
           LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
           WHERE d.id = ?`
        )
        .get(existing.id);

      return res.json({
        message: 'Nai-save na ang dokumento.',
        document: formatDocumentFull(updated),
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  router.get('/:id/download', requireAuth, resolveWorkspaceAccess(db), (req, res) => {
    const ownerId = req.workspace.ownerId;
    const row = db
      .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0')
      .get(req.params.id, ownerId);

    if (!row) {
      return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
    }

    const format = req.query.format || 'doc';
    const { filename, contentType, buffer } = buildDocumentExport(row, format);

    res.setHeader('Content-Type', contentType);
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
      const existing = db
        .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0')
        .get(req.params.id, ownerId);

      if (!existing) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE documents
         SET is_deleted = 1, deleted_at = ?, deleted_with_folder_id = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(now, now, existing.id, ownerId);

      return res.json({
        message: `Nailipat sa Basurahan ang dokumentong "${existing.title}".`,
        storage: getStorageSummary(db, ownerId),
      });
    }
  );

  return router;
}
