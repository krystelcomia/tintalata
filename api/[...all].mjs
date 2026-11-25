import { createDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = createDatabase()
      .then((db) => createApp(db, { serveStatic: false }))
      .catch((err) => {
        appPromise = null;
        throw err;
      });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
