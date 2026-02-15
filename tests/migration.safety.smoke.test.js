import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

test('smoke migração: /health responde e inclui headers de correlação', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });

  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);

  assert.ok(res.headers['x-request-id']);
  assert.ok(res.headers['x-wd-path']);
  assert.equal(res.headers['x-wd-path'], 'health');
});

test('smoke migração: 404 também inclui headers de correlação', async () => {
  const { app } = await createServer({ skipDb: true, skipAuth: true });

  const res = await request(app).get('/rota-inexistente-smoke');
  assert.equal(res.status, 404);
  assert.ok(res.headers['x-request-id']);
  assert.ok(res.headers['x-wd-path']);
});
