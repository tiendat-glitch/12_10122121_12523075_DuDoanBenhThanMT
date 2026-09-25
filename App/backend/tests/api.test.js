import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { createModelService } from '../src/services/model.service.js';

const schema = JSON.parse(readFileSync(new URL('../../../ai-models/models/schema.json', import.meta.url)));
const features = Object.fromEntries(Object.entries(schema.numeric_ranges).map(([name, range]) => [name, (range.min + range.max) / 2]));
Object.entries(schema.allowed_categories).forEach(([name, values]) => { features[name] = values[0]; });
const config = { port: 8000, corsOrigins: ['https://frontend.example'], timeoutMs: 20, aiServiceUrl: 'http://ai.example' };

async function fixture(t, overrides = {}) {
  const saved = [];
  const model = { health: async () => ({ status: 'ok', model_loaded: true }), info: async () => ({ metadata: { model_version: '1' } }),
    predict: async (input, id) => ({ prediction: 'ckd', probability: .8, model_version: '1', request_id: id }), ...overrides.model };
  const database = { ping: async () => true, savePrediction: async item => saved.push(item), listPredictions: async limit => saved.slice(-limit), ...overrides.database };
  const server = createApp({ config, schema, model, database }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, headers = {}) => fetch(base + '/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { base, post, saved };
}

test('prediction saves history and preserves supplied and generated request IDs', async t => {
  const { base, post, saved } = await fixture(t);
  for (const id of ['demo-request-123', undefined]) {
    const response = await post({ features }, id ? { 'X-Request-ID': id } : {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.request_id, response.headers.get('X-Request-ID'));
    if (id) assert.equal(body.request_id, id);
    assert.equal(saved.at(-1).request_id, body.request_id);
    assert.deepEqual(saved.at(-1).features, features);
  }
  assert.equal((await (await fetch(base + '/api/history')).json()).items.length, 2);
  assert.equal((await fetch(base + '/api/v1/schema')).status, 200);
});

test('rejects missing, extra, wrong types, invalid category/range before calling AI', async t => {
  let called = false;
  const { post } = await fixture(t, { model: { predict: () => { called = true; } } });
  const missing = { ...features }; delete missing.age;
  for (const body of [{}, { features: [] }, { features: missing }, { features: { ...features, extra: 2 } },
    { features: { ...features, age: true } }, { features: { ...features, age: '48' } },
    { features: { ...features, age: 999 } }, { features: { ...features, dm: 'invalid' } }]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    const error = await response.json();
    assert.equal(error.error, 'invalid_input');
    assert.equal(error.request_id, response.headers.get('X-Request-ID'));
  }
  assert.equal(called, false);
});

test('malformed JSON, oversized body, history bounds, unknown route and CORS', async t => {
  const { base } = await fixture(t);
  for (const [body, code] of [['{', 400], [JSON.stringify({ data: 'x'.repeat(34000) }), 413]]) {
    const response = await fetch(base + '/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, code);
    assert.ok((await response.json()).request_id);
  }
  for (const value of ['0', '101', '1.5', 'abc', '']) assert.equal((await fetch(base + '/api/history?limit=' + value)).status, 400);
  assert.equal((await fetch(base + '/not-found')).status, 404);
  const allowed = await fetch(base + '/api/schema', { headers: { Origin: config.corsOrigins[0] } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), config.corsOrigins[0]);
  const denied = await fetch(base + '/api/schema', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('health rechecks dependencies and reports HTTP 503 while degraded', async t => {
  let ready = false;
  const { base } = await fixture(t, { database: { ping: async () => ready } });
  assert.equal((await fetch(base + '/health')).status, 503);
  ready = true;
  const response = await fetch(base + '/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).port, config.port);
});

test('MongoDB failure is not reported as successful prediction or history', async t => {
  const fail = async () => { throw new Error('sensitive connection string'); };
  const { base, post } = await fixture(t, { database: { savePrediction: fail, listPredictions: fail } });
  for (const response of [await post({ features }), await fetch(base + '/api/history')]) {
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'history_unavailable');
    assert.ok(!JSON.stringify(body).includes('sensitive'));
  }
});

test('AI client propagates trace ID, maps failure/timeout and rejects invalid output', async () => {
  let received;
  const client = createModelService(config, async (url, options) => {
    received = options;
    return Response.json({ prediction: 'ckd', probability: .9, model_version: '1' });
  });
  assert.equal((await client.predict(features, 'trace-1')).request_id, 'trace-1');
  assert.equal(received.headers['X-Request-ID'], 'trace-1');
  for (const [fetcher, status] of [
    [async () => { throw new TypeError('connection failed'); }, 503],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504],
    [async () => new Response('', { status: 500 }), 502],
    [async () => Response.json({ prediction: 'ckd' }), 502],
  ]) await assert.rejects(createModelService(config, fetcher).predict(features, 'trace'), error => error.status === status);
});
