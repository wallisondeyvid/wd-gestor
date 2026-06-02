import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

test('GET /gestor/login renderiza o shell de seleção de unidade sem quebrar o login legado', async () => {
  process.env.NODE_ENV = 'test';

  const built = await createServer({ skipDb: true, deferErrorHandlers: true });
  await Promise.resolve(built.registerErrorHandlers());

  try {
    const res = await request(built.app)
      .get('/gestor/login?step=select')
      .set('Accept', 'text/html');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /text\/html/i);
    assert.match(res.text, /id="loginFormSection"/i);
    assert.match(res.text, /id="loginSelectionPanel"/i);
    assert.match(res.text, /id="loginUnitSelectionList"/i);
  } finally {
    try {
      await built.close({ stopMemoryServer: true });
    } catch {
      // noop
    }
  }
});

test('GET /gestor/login renderiza mensagem genérica para erro de muitas tentativas', async () => {
  process.env.NODE_ENV = 'test';

  const built = await createServer({ skipDb: true, deferErrorHandlers: true });
  await Promise.resolve(built.registerErrorHandlers());

  try {
    const res = await request(built.app)
      .get('/gestor/login?erro=muitas_tentativas')
      .set('Accept', 'text/html');

    assert.equal(res.status, 200);
    assert.match(res.text, /Muitas tentativas de login\. Aguarde alguns minutos e tente novamente\./i);
  } finally {
    try {
      await built.close({ stopMemoryServer: true });
    } catch {
      // noop
    }
  }
});