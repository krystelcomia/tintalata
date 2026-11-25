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
import { asyncHandler } from '../utils/http.mjs';

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
  const pageDoodle = parseJsonSafe(row.page_doodle_json || '{"strokes":[],"dataUrl":""}', {
    strokes: [],
    dataUrl: '',
  });
  return {
    id: row.id,
    folderId: row.folder_id || null,
    folderName: row.folder_name || null,
    title: row.title,
    previewText: plain.slice(0, 140),
    doodleCount:
      (Array.isArray(doodles) ? doodles.length : 0) +
      (Array.isArray(pageDoodle?.strokes) && pageDoodle.strokes.length > 0 ? 1 : 0),
    wordCount: Number(row.word_count || 0),
    sizeBytes: Number(row.size_bytes || 0),
    isFavorite: Boolean(row.is_favorite),
    lastOpenedAt: row.last_opened_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sharedRole: row.shared_role || null,
    ownerName: row.owner_name || null,
    ownerEmail: row.owner_email || null,
  };
}

function formatDocumentFull(row) {
  return {
    ...formatDocumentSummary(row),
    contentHtml: row.content_html || '',
    doodles: parseJsonSafe(row.doodles_json || '[]', []),
    pageDoodle: parseJsonSafe(row.page_doodle_json || '{"strokes":[],"dataUrl":""}', {
      strokes: [],
      dataUrl: '',
    }),
    pageSettings: parseJsonSafe(row.page_settings_json || '{}', {
      orientation: 'portrait',
      margins: 'normal',
      pageColor: '#ffffff',
    }),
  };
}

export function createDocumentsRouter(db) {
  const router = express.Router();

  router.get(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const { folderId, search, favoritesOnly } = req.query;

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

      if (favoritesOnly === '1' || favoritesOnly === 'true') {
        sql += ' AND d.is_favorite = 1';
      }

      if (search && typeof search === 'string' && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        sql += ' AND (LOWER(d.title) LIKE ? OR LOWER(d.content_html) LIKE ?)';
        params.push(term, term);
      }

      sql += ' ORDER BY d.updated_at DESC';

      const rows = await db.all(sql, ...params);
      return res.json({
        documents: rows.map(formatDocumentSummary),
      });
    })
  );

  router.get(
    '/shared/list',
    requireAuth,
    asyncHandler(async (req, res) => {
      if (req.user.role !== 'student') {
        return res.json({ sharedWithMe: [], sharedByMe: [] });
      }

      const sharedWithMe = await db.all(
        `SELECT d.*, NULL AS folder_name, s.permission_level AS shared_role,
                u.full_name AS owner_name, u.email AS owner_email
         FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         JOIN users u ON u.id = s.owner_id
         WHERE s.shared_with_user_id = ? AND d.is_deleted = 0 AND u.status = 'active'
         ORDER BY d.updated_at DESC`,
        req.user.id
      );

      const sharedByMe = await db.all(
        `SELECT s.id AS share_id, s.document_id, s.permission_level, s.created_at AS shared_at,
                d.title, u.full_name AS recipient_name, u.email AS recipient_email
         FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         JOIN users u ON u.id = s.shared_with_user_id
         WHERE s.owner_id = ? AND d.is_deleted = 0
         ORDER BY s.created_at DESC`,
        req.user.id
      );

      return res.json({
        sharedWithMe: sharedWithMe.map(formatDocumentSummary),
        sharedByMe: sharedByMe.map((r) => ({
          shareId: r.share_id,
          documentId: r.document_id,
          title: r.title,
          permissionLevel: r.permission_level,
          recipientName: r.recipient_name,
          recipientEmail: r.recipient_email,
          sharedAt: r.shared_at,
        })),
      });
    })
  );

  router.post(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const {
        title = 'Walang Pamagat na Dokumento',
        folderId = null,
        contentHtml = '<p></p>',
        doodles = [],
        pageDoodle = { strokes: [], dataUrl: '' },
        pageSettings = { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' },
        isFavorite = false,
      } = req.body || {};

      const cleanTitle = String(title).trim().slice(0, 150) || 'Walang Pamagat na Dokumento';
      const cleanHtml = sanitizeDocumentHtml(String(contentHtml || ''));
      const doodlesJson = JSON.stringify(Array.isArray(doodles) ? doodles : []);
      const pageDoodleJson = JSON.stringify(
        pageDoodle && typeof pageDoodle === 'object'
          ? {
              strokes: Array.isArray(pageDoodle.strokes) ? pageDoodle.strokes : [],
              dataUrl:
                typeof pageDoodle.dataUrl === 'string' &&
                pageDoodle.dataUrl.startsWith('data:image/png;base64,')
                  ? pageDoodle.dataUrl
                  : '',
            }
          : { strokes: [], dataUrl: '' }
      );
      const pageSettingsJson = JSON.stringify(
        pageSettings && typeof pageSettings === 'object'
          ? pageSettings
          : { orientation: 'portrait', margins: 'normal', pageColor: '#ffffff' }
      );

      let resolvedFolderId = null;
      if (folderId) {
        const folder = await db.get(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
          folderId,
          ownerId
        );
        if (!folder) {
          return res.status(404).json({ error: 'Hindi natagpuan ang napiling folder.' });
        }
        resolvedFolderId = folder.id;
      }

      const sizeBytes = calculateDocumentBytes({
        title: cleanTitle,
        contentHtml: cleanHtml,
        doodlesJson,
        pageDoodleJson,
        pageSettingsJson,
      });

      const quota = await checkStorageQuota(db, ownerId, sizeBytes, 0);
      if (!quota.allowed) {
        return res.status(413).json({
          error:
            'Puno na ang iyong storage! Hindi magawa ang bagong dokumento dahil kulang na ang espasyo. Magbura muna ng mga file sa Basurahan.',
        });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const words = countWords(cleanHtml);

      await db.run(
        `INSERT INTO documents (
          id, user_id, folder_id, title, content_html, doodles_json, page_doodle_json,
          page_settings_json, word_count, size_bytes, is_favorite, last_opened_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        ownerId,
        resolvedFolderId,
        cleanTitle,
        cleanHtml,
        doodlesJson,
        pageDoodleJson,
        pageSettingsJson,
        words,
        sizeBytes,
        isFavorite ? 1 : 0,
        now,
        now,
        now
      );

      await recalculateUserStorage(db, ownerId);
      const created = await db.get(
        `SELECT d.*, f.name AS folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
         WHERE d.id = ?`,
        id
      );

      return res.status(201).json({
        message: 'Nagawa na ang bagong dokumento.',
        document: formatDocumentFull(created),
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res, next) => {
      if (req.user.role === 'student') {
        const owned = await db.get(
          `SELECT d.*, f.name AS folder_name
           FROM documents d
           LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
           WHERE d.id = ? AND d.user_id = ? AND d.is_deleted = 0`,
          req.params.id,
          req.user.id
        );

        if (owned) {
          const now = new Date().toISOString();
          await db.run('UPDATE documents SET last_opened_at = ? WHERE id = ?', now, owned.id);
          owned.last_opened_at = now;
          return res.json({
            document: formatDocumentFull(owned),
            permission: 'read_write',
          });
        }

        const shared = await db.get(
          `SELECT d.*, NULL AS folder_name, s.permission_level AS shared_role,
                  u.full_name AS owner_name, u.email AS owner_email
           FROM document_shares s
           JOIN documents d ON d.id = s.document_id
           JOIN users u ON u.id = s.owner_id
           WHERE s.document_id = ? AND s.shared_with_user_id = ? AND d.is_deleted = 0`,
          req.params.id,
          req.user.id
        );

        if (shared) {
          return res.json({
            document: formatDocumentFull(shared),
            permission: shared.shared_role,
          });
        }
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }
      return next();
    }),
    resolveWorkspaceAccess(db),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const row = await db.get(
        `SELECT d.*, f.name AS folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
         WHERE d.id = ? AND d.user_id = ? AND d.is_deleted = 0`,
        req.params.id,
        ownerId
      );

      if (!row) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      return res.json({
        document: formatDocumentFull(row),
        permission: req.workspace.permission,
      });
    })
  );

  router.patch(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res, next) => {
      if (req.user.role === 'student') {
        const owned = await db.get(
          'SELECT id FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
          req.params.id,
          req.user.id
        );
        if (owned) {
          req.workspace = { ownerId: req.user.id, permission: 'read_write', isSharedEdit: false };
          return next();
        }
        const shared = await db.get(
          `SELECT s.owner_id, s.permission_level
           FROM document_shares s
           JOIN documents d ON d.id = s.document_id
           WHERE s.document_id = ? AND s.shared_with_user_id = ? AND d.is_deleted = 0`,
          req.params.id,
          req.user.id
        );
        if (shared) {
          if (shared.permission_level !== 'read_write') {
            return res.status(403).json({
              error: 'Basahin lamang ang pahintulot sa ibinahaging dokumentong ito.',
            });
          }
          req.workspace = {
            ownerId: shared.owner_id,
            permission: 'read_write',
            isSharedEdit: true,
          };
          return next();
        }
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }
      return resolveWorkspaceAccess(db, { requireWrite: true })(req, res, next);
    }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const existing = await db.get(
        'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
        req.params.id,
        ownerId
      );

      if (!existing) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const {
        title,
        folderId,
        contentHtml,
        doodles,
        pageDoodle,
        pageSettings,
        isFavorite,
      } = req.body || {};

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

      const nextPageDoodleJson =
        pageDoodle !== undefined && typeof pageDoodle === 'object'
          ? JSON.stringify({
              strokes: Array.isArray(pageDoodle.strokes) ? pageDoodle.strokes : [],
              dataUrl:
                typeof pageDoodle.dataUrl === 'string' &&
                pageDoodle.dataUrl.startsWith('data:image/png;base64,')
                  ? pageDoodle.dataUrl
                  : '',
            })
          : existing.page_doodle_json || '{"strokes":[],"dataUrl":""}';

      const nextPageSettingsJson =
        pageSettings !== undefined && typeof pageSettings === 'object'
          ? JSON.stringify(pageSettings)
          : existing.page_settings_json;

      const nextFavorite =
        isFavorite !== undefined && !req.workspace.isSharedEdit
          ? isFavorite
            ? 1
            : 0
          : existing.is_favorite;

      let nextFolderId = existing.folder_id;
      if (folderId !== undefined && !req.workspace.isSharedEdit) {
        if (folderId === null || folderId === '') {
          nextFolderId = null;
        } else {
          const targetFolder = await db.get(
            'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            folderId,
            ownerId
          );
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
        pageDoodleJson: nextPageDoodleJson,
        pageSettingsJson: nextPageSettingsJson,
      });

      const quota = await checkStorageQuota(db, ownerId, newBytes, existing.size_bytes);
      if (!quota.allowed) {
        return res.status(413).json({
          error:
            'Lumampas na sa limitasyon ng iyong storage! Hindi nai-save ang pagbabago. Magbura muna ng mga file sa Basurahan o bawasan ang mga larawan/guhit.',
        });
      }

      const words = countWords(nextHtml);
      const now = new Date().toISOString();

      await db.run(
        `UPDATE documents
         SET title = ?, folder_id = ?, content_html = ?, doodles_json = ?,
             page_doodle_json = ?, page_settings_json = ?, word_count = ?,
             size_bytes = ?, is_favorite = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        nextTitle,
        nextFolderId,
        nextHtml,
        nextDoodlesJson,
        nextPageDoodleJson,
        nextPageSettingsJson,
        words,
        newBytes,
        nextFavorite,
        now,
        existing.id,
        ownerId
      );

      await recalculateUserStorage(db, ownerId);
      const updated = await db.get(
        `SELECT d.*, f.name AS folder_name
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id AND f.is_deleted = 0
         WHERE d.id = ?`,
        existing.id
      );

      return res.json({
        message: 'Nai-save na ang dokumento.',
        document: formatDocumentFull(updated),
        storage: await getStorageSummary(db, req.user.role === 'student' ? req.user.id : ownerId),
      });
    })
  );

  router.get(
    '/:id/shares',
    requireAuth,
    asyncHandler(async (req, res) => {
      const owned = await db.get(
        'SELECT id FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
        req.params.id,
        req.user.id
      );
      if (!owned) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }
      const shares = await db.all(
        `SELECT s.id, s.permission_level, s.created_at, u.full_name, u.email
         FROM document_shares s
         JOIN users u ON u.id = s.shared_with_user_id
         WHERE s.document_id = ?
         ORDER BY s.created_at DESC`,
        owned.id
      );

      return res.json({
        shares: shares.map((s) => ({
          id: s.id,
          permissionLevel: s.permission_level,
          recipientName: s.full_name,
          recipientEmail: s.email,
          createdAt: s.created_at,
        })),
      });
    })
  );

  router.post(
    '/:id/share',
    requireAuth,
    asyncHandler(async (req, res) => {
      if (req.user.role !== 'student') {
        return res.status(403).json({ error: 'Mga mag-aaral lamang ang maaaring magbahagi.' });
      }
      const owned = await db.get(
        'SELECT id, title FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
        req.params.id,
        req.user.id
      );
      if (!owned) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const { email = '', permissionLevel = 'read' } = req.body || {};
      const targetEmail = String(email).trim().toLowerCase();
      if (!targetEmail) {
        return res.status(400).json({ error: 'Ilagay ang email ng mag-aaral na pagbabahagian.' });
      }
      if (!['read', 'read_write'].includes(permissionLevel)) {
        return res.status(400).json({ error: 'Hindi wastong antas ng pahintulot.' });
      }

      const recipient = await db.get(
        "SELECT id, full_name, email FROM users WHERE LOWER(email) = ? AND role = 'student' AND status = 'active'",
        targetEmail
      );
      if (!recipient) {
        return res.status(404).json({
          error: 'Walang aktibong account ng mag-aaral na may ganyang email address.',
        });
      }
      if (recipient.id === req.user.id) {
        return res.status(400).json({
          error: 'Hindi mo maaaring ibahagi ang dokumento sa sarili mong account.',
        });
      }

      const now = new Date().toISOString();
      const existingShare = await db.get(
        'SELECT id FROM document_shares WHERE document_id = ? AND shared_with_user_id = ?',
        owned.id,
        recipient.id
      );

      if (existingShare) {
        await db.run(
          'UPDATE document_shares SET permission_level = ? WHERE id = ?',
          permissionLevel,
          existingShare.id
        );
      } else {
        await db.run(
          `INSERT INTO document_shares (id, document_id, owner_id, shared_with_user_id, permission_level, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          owned.id,
          req.user.id,
          recipient.id,
          permissionLevel,
          now
        );
      }

      return res.status(201).json({
        message: `Naibahagi ang "${owned.title}" kay ${recipient.full_name}.`,
      });
    })
  );

  router.delete(
    '/:id/shares/:shareId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const deleted = await db.run(
        'DELETE FROM document_shares WHERE id = ? AND document_id = ? AND owner_id = ?',
        req.params.shareId,
        req.params.id,
        req.user.id
      );
      if (!deleted.changes) {
        return res.status(404).json({ error: 'Hindi natagpuan ang pagbabahaging ito.' });
      }
      return res.json({ message: 'Inalis na ang pagbabahagi ng dokumento.' });
    })
  );

  router.get(
    '/:id/download',
    requireAuth,
    asyncHandler(async (req, res, next) => {
      if (req.user.role === 'student') {
        const owned = await db.get(
          'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
          req.params.id,
          req.user.id
        );
        const shared =
          owned ||
          (await db.get(
            `SELECT d.*
             FROM document_shares s
             JOIN documents d ON d.id = s.document_id
             WHERE s.document_id = ? AND s.shared_with_user_id = ? AND d.is_deleted = 0`,
            req.params.id,
            req.user.id
          ));
        if (!shared) {
          return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
        }
        const format = req.query.format || 'docx';
        const { filename, contentType, buffer } = await buildDocumentExport(shared, format);
        res.setHeader('Content-Type', contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        return res.send(buffer);
      }
      return next();
    }),
    resolveWorkspaceAccess(db),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const row = await db.get(
        'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
        req.params.id,
        ownerId
      );

      if (!row) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const format = req.query.format || 'docx';
      const { filename, contentType, buffer } = await buildDocumentExport(row, format);

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      return res.send(buffer);
    })
  );

  router.delete(
    '/:id',
    requireAuth,
    resolveWorkspaceAccess(db, { requireWrite: true }),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const existing = await db.get(
        'SELECT * FROM documents WHERE id = ? AND user_id = ? AND is_deleted = 0',
        req.params.id,
        ownerId
      );

      if (!existing) {
        return res.status(404).json({ error: 'Hindi natagpuan ang dokumento.' });
      }

      const now = new Date().toISOString();
      await db.run(
        `UPDATE documents
         SET is_deleted = 1, deleted_at = ?, deleted_with_folder_id = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        now,
        now,
        existing.id,
        ownerId
      );

      return res.json({
        message: `Nailipat sa Basurahan ang dokumentong "${existing.title}".`,
        storage: await getStorageSummary(db, ownerId),
      });
    })
  );

  return router;
}
