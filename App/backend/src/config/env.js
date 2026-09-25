import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
export function loadConfig(env = process.env) {
  const required = name => {
    if (!env[name]?.trim()) throw new Error('Missing environment variable: ' + name);
    return env[name].trim();
  };
  const port = Number(required('PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const aiServiceUrl = required('AI_SERVICE_URL').replace(/\/$/, '');
  const url = new URL(aiServiceUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid AI_SERVICE_URL');
  const timeoutMs = Number(env.REQUEST_TIMEOUT_SECONDS || 10) * 1000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid REQUEST_TIMEOUT_SECONDS');
  return { port, aiServiceUrl, timeoutMs, mongodbUri: required('MONGODB_URI'),
    databaseName: required('MONGODB_DATABASE'),
    schemaPath: env.SCHEMA_PATH || fileURLToPath(new URL('../../../../ai-models/models/schema.json', import.meta.url)),
    corsOrigins: required('CORS_ORIGINS').split(',').map(value => value.trim()) };
}
