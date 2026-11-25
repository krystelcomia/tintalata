import { CONFIG } from './config.mjs';
import { createDatabase } from './db.mjs';
import { createApp } from './app.mjs';

const db = await createDatabase();
const app = createApp(db, { serveStatic: true });

app.listen(CONFIG.PORT, () => {
  console.log(`Tintalata server tumatakbo sa http://localhost:${CONFIG.PORT} (${db.storageMode})`);
});
