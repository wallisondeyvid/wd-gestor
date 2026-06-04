import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

async function withBuiltServer(nodeEnv, serverOptions, callback) {
  const effectiveServerOptions = typeof serverOptions === 'function' ? {} : (serverOptions || {});
  const effectiveCallback = typeof serverOptions === 'function' ? serverOptions : callback;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  const built = await createServer({ skipDb: true, deferErrorHandlers: true, ...effectiveServerOptions });
  await Promise.resolve(built.registerErrorHandlers());

  try {
    return await effectiveCallback(built);
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

test('GET /gestor/dashboard e rota simples de outro módulo não expõem x-powered-by', async () => {
  await withBuiltServer('test', { skipAuth: true }, async ({ app }) => {
    const gestorRes = await request(app)
      .get('/gestor/dashboard')
      .set('Accept', 'text/html');

    assert.equal(gestorRes.status, 200);
    assert.equal(gestorRes.headers['x-powered-by'], undefined);
    assert.equal(gestorRes.headers['x-frame-options'], 'DENY');

    const clinicaRes = await request(app)
      .get('/clinica/dashboard')
      .set('Accept', 'text/html');

    assert.equal(clinicaRes.status, 200);
    assert.equal(clinicaRes.headers['x-powered-by'], undefined);
    assert.equal(clinicaRes.headers['x-content-type-options'], 'nosniff');
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