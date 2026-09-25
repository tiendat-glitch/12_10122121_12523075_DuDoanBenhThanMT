import { readFile } from 'node:fs/promises';
import { loadConfig } from './config/env.js';
import { createDatabase } from './config/db.js';
import { createModelService } from './services/model.service.js';
import { createApp } from './app.js';
import { log } from './utils/logger.js';
let database;
try {
  const config = loadConfig();
  const schema = JSON.parse(await readFile(config.schemaPath, 'utf8'));
  database = createDatabase(config);
  await database.connect();
  const app = createApp({ config, schema, database, model: createModelService(config) });
  const server = app.listen(config.port, '0.0.0.0', () => log('server_started', { port: config.port }));
  server.on('error', async () => { log('listen_failed'); await database.close(); process.exit(1); });
  const shutdown = () => {
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => { await database.close(); clearTimeout(timer); process.exit(0); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  log('startup_failed', { detail: 'Check environment, schema path and MongoDB connectivity' });
  if (database) await database.close();
  process.exitCode = 1;
}
