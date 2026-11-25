import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function tintalataEmbeddedApiPlugin(): Plugin {
  return {
    name: 'tintalata-embedded-api',
    async configureServer(server) {
      if (process.env.TINTALATA_PROXY_API === '1') return;
      const { createDatabase } = await import('./server/db.mjs');
      const { createApp } = await import('./server/app.mjs');
      const db = createDatabase();
      const apiApp = createApp(db, { serveStatic: false });

      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api')) {
          return apiApp(req as never, res as never, next);
        }
        return next();
      });

      server.httpServer?.once('close', () => {
        try {
          db.close();
        } catch {
          // ignore
        }
      });
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
