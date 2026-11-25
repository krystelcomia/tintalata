import express from 'express';
import { requireAuth, resolveWorkspaceAccess } from '../middleware/auth.mjs';
import { getStorageSummary } from '../utils/storage.mjs';
import { asyncHandler } from '../utils/http.mjs';

export function createStorageRouter(db) {
  const router = express.Router();

  router.get(
    '/',
    requireAuth,
    resolveWorkspaceAccess(db),
    asyncHandler(async (req, res) => {
      const ownerId = req.workspace.ownerId;
      const summary = await getStorageSummary(db, ownerId);

      const largestDocs = (
        await db.all(
          `SELECT id, title, size_bytes, is_deleted, updated_at
           FROM documents
           WHERE user_id = ?
           ORDER BY size_bytes DESC
           LIMIT 8`,
          ownerId
        )
      ).map((d) => ({
        id: d.id,
        title: d.title,
        sizeBytes: Number(d.size_bytes || 0),
        isDeleted: Boolean(d.is_deleted),
        updatedAt: d.updated_at,
      }));

      return res.json({
        storage: summary,
        largestDocuments: largestDocs,
      });
    })
  );

  return router;
}
