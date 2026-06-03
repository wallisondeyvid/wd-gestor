import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

async function withBuiltServer(nodeEnv, callback) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  const built = await createServer({ skipDb: true, deferErrorHandlers: true });
  await Promise.resolve(built.registerErrorHandlers());

  try {
    return await callback(built);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    try {
      await built.close({ stopMemoryServer: true });
    } catch {
      // noop
    }
  }
}

test('GET /gestor/login expõe headers de segurança conservadores sem CSP rígida', async () => {
  await withBuiltServer('test', async ({ app }) => {
    const res = await request(app)
      .get('/gestor/login')
      .set('Accept', 'text/html');

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(res.headers['x-dns-prefetch-control'], 'off');
    assert.equal(res.headers['strict-transport-security'], undefined);
    assert.equal(res.headers['content-security-policy'], undefined);
  });
});

test('GET /gestor/login envia HSTS apenas em production sobre HTTPS', async () => {
  await withBuiltServer('production', async ({ app }) => {
    const secureRes = await request(app)
      .get('/gestor/login')
      .set('Accept', 'text/html')
      .set('X-Forwarded-Proto', 'https');

    assert.equal(secureRes.status, 200);
    assert.equal(secureRes.headers['strict-transport-security'], 'max-age=15552000; includeSubDomains');

    const insecureRes = await request(app)
      .get('/gestor/login')
      .set('Accept', 'text/html');

    assert.equal(insecureRes.status, 200);
    assert.equal(insecureRes.headers['strict-transport-security'], undefined);
  });
});