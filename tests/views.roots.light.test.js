import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from '../src/server/createServer.js';

function snippetBody(text) {
  return String(text || '').slice(0, 260).replace(/\s+/g, ' ').trim();
}

function pickHeaders(headers = {}) {
  return {
    'content-type': headers['content-type'] || '',
    'x-app-mode': headers['x-app-mode'] || '',
    location: headers.location || ''
  };
}

function assertNoLegacyViews(url, res) {
  const bodySnippet = snippetBody(res.text);
  const headersInfo = pickHeaders(res.headers || {});

  assert.equal(
    res.status,
    200,
    `[views.light] ${url} status inesperado=${res.status} body=${bodySnippet} headers=${JSON.stringify(headersInfo)}`
  );

  assert.equal(
    String(res.headers?.['x-app-mode'] || '').toLowerCase(),
    'light',
    `[views.light] ${url} não respondeu em light. headers=${JSON.stringify(headersInfo)}`
  );

  assert.equal(
    /C:\\views/i.test(res.text || ''),
    false,
    `[views.light] ${url} contém assinatura de regressão C:\\views. body=${bodySnippet} headers=${JSON.stringify(headersInfo)}`
  );

  assert.equal(
    /Failed to lookup view/i.test(res.text || ''),
    false,
    `[views.light] ${url} contém erro de lookup de view. body=${bodySnippet} headers=${JSON.stringify(headersInfo)}`
  );
}

test('Light mode roots não devem regredir para C:\\views', async () => {
  process.env.NODE_ENV = 'test';
  process.env.SKIP_AUTH = '1';
  process.env.ENABLE_ESCALAS = '1';

  const built = await createServer({ skipDb: true, skipAuth: true, deferErrorHandlers: true });
  await Promise.resolve(built.registerErrorHandlers());

  try {
    const r1 = await request(built.app).get('/condominios/dashboard').set('Accept', 'text/html');
    assertNoLegacyViews('/condominios/dashboard', r1);

    const r2 = await request(built.app).get('/gestor/dashboard').set('Accept', 'text/html');
    assertNoLegacyViews('/gestor/dashboard', r2);

    const r3 = await request(built.app).get('/portal-morador/login').set('Accept', 'text/html');
    assertNoLegacyViews('/portal-morador/login', r3);
  } finally {
    try {
      await built.close({ stopMemoryServer: true });
    } catch {
      // noop
    }
  }
});
