import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { attachAuth } from './middleware/auth.mjs';
import { createAuthRouter } from './routes/auth.mjs';
import { createFoldersRouter } from './routes/folders.mjs';
import { createDocumentsRouter } from './routes/documents.mjs';
import { createTrashRouter } from './routes/trash.mjs';
import { createStorageRouter } from './routes/storage.mjs';
import { createPrivacyRouter } from './routes/privacy.mjs';
import { createAdminRouter } from './routes/admin.mjs';

export function createApp(db, { serveStatic = true } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: CONFIG.MAX_JSON_BODY }));
  app.use(attachAuth(db));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Tintalata',
      language: 'tl',
      storageMode: db.storageMode || CONFIG.STORAGE_MODE,
    });
  });

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/folders', createFoldersRouter(db));
  app.use('/api/documents', createDocumentsRouter(db));
  app.use('/api/trash', createTrashRouter(db));
  app.use('/api/storage', createStorageRouter(db));
  app.use('/api/privacy', createPrivacyRouter(db));
  app.use('/api/admin', createAdminRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Hindi natagpuan ang hinihiling na API endpoint.' });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Masyadong malaki ang ipinadalang dokumento o larawan.',
      });
    }
    console.error(err);
    return res.status(500).json({
      error: 'Nagkaroon ng panloob na error sa server. Pakisubukang muli.',
    });
  });

  if (serveStatic) {
    const distDir = path.resolve(import.meta.dirname, '..', 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}
