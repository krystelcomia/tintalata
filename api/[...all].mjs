import { createDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

let cachedApp = null;

function getApp() {
  if (!cachedApp) {
    const db = createDatabase();
    cachedApp = createApp(db, { serveStatic: false });
  }
  return cachedApp;
}

export default function handler(req, res) {
  const app = getApp();
  return app(req, res);
}
