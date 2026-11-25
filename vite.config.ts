import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Server } from 'node:http';

async function attachEmbeddedApi(middlewares: Connect.Server, httpServer: Server | null) {
  if (process.env.TINTALATA_PROXY_API === '1') return;
  const { createDatabase } = await import('./server/db.mjs');
  const { createApp } = await import('./server/app.mjs');
  const db = await createDatabase();
  const apiApp = createApp(db, { serveStatic: false });

  middlewares.use((req, res, next) => {
    if (req.url && req.url.startsWith('/api')) {
      return apiApp(req as never, res as never, next);
    }
    return next();
  });

  httpServer?.once('close', () => {
    void db.close().catch(() => {});
  });
}

function tintalataEmbeddedApiPlugin(): Plugin {
  return {
    name: 'tintalata-embedded-api',
    async configureServer(server) {
      await attachEmbeddedApi(server.middlewares, server.httpServer as Server | null);
    },
    async configurePreviewServer(server) {
      await attachEmbeddedApi(server.middlewares, server.httpServer as Server | null);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tintalataEmbeddedApiPlugin()],
  server: {
    port: 5173,
    proxy:
      process.env.TINTALATA_PROXY_API === '1'
        ? {
            '/api': {
              target: 'http://localhost:3001',
              changeOrigin: true,
            },
          }
        : undefined,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
