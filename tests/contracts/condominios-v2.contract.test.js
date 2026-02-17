import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';

import { createServer } from '../../src/server/createServer.js';

const V2_FLAG = 'WDG_FLAG_CONDOMINIOS_APP_V2';
const DEBUG_FLAG = 'WDG_DEBUG_ERRORS';
const VALID_OBJECT_ID = '000000000000000000000001';
const closeFns = [];

async function drainCloseFns() {
  while (closeFns.length) {
    const close = closeFns.pop();
    try {
      await close();
    } catch {
      // noop
    }
  }
}

async function createTrackedServer(options = {}) {
  const created = await createServer(options);
  if (typeof created.close === 'function') {
    closeFns.push(() => created.close({ stopMemoryServer: true }));
  }
  return created;
}

afterEach(async () => {
  await drainCloseFns();
});

after(async () => {
  await drainCloseFns();

  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }

  try {
    for (const conn of mongoose.connections || []) {
      if (conn && conn.readyState !== 0) {
        try { await conn.close(); } catch {}
      }
    }
  } catch {
    // noop
  }

  try {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    for (const handle of handles) {
      const name = String(handle?.constructor?.name || '');
      if (name === 'Timeout') {
        try { clearTimeout(handle); } catch {}
        try { clearInterval(handle); } catch {}
        try { handle.unref?.(); } catch {}
      }
      if (name === 'Immediate') {
        try { clearImmediate(handle); } catch {}
      }
    }
  } catch {
    // noop
  }
});

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env[name];
      else process.env[name] = prev;
    });
}

async function requestV2(app, method, path, { query, body } = {}) {
  return withEnv(V2_FLAG, '1', async () => {
    let req = request(app)[method](path);
    if (query) req = req.query(query);
    if (body !== undefined) req = req.send(body);
    return req;
  });
}

function assertJsonResponse(res) {
  const ct = String(res.headers['content-type'] || '');
  assert.match(ct, /application\/json/i);
  assert.doesNotMatch(String(res.text || ''), /<html|<!doctype html/i);
}

function assertErrorContract(res, { debugExpected }) {
  assert.ok(res.status >= 400, `status de erro esperado, recebido: ${res.status}`);
  assertJsonResponse(res);
  assert.equal(res.body?.success, false);
  assert.equal(typeof res.body?.error, 'string');
  assert.ok(res.body.error.length > 0);

  const hasCode = Object.prototype.hasOwnProperty.call(res.body || {}, 'code');
  assert.equal(hasCode, debugExpected);
  if (debugExpected) {
    assert.equal(typeof res.body.code, 'string');
    assert.ok(res.body.code.length > 0);
  }
}

function assertSuccessContract(res) {
  assert.ok(res.status >= 200 && res.status < 300, `status de sucesso esperado, recebido: ${res.status}`);
  assertJsonResponse(res);
  assert.notEqual(res.body?.success, false);
}

test('erros em /unidades, /blocos e /andares retornam JSON (sem HTML), success:false e error:string', async () => {
  const { app } = await createTrackedServer({ skipDb: true });

  const calls = [
    () => requestV2(app, 'get', '/condominios/api/unidades/' + VALID_OBJECT_ID),
    () => requestV2(app, 'get', '/condominios/api/blocos/' + VALID_OBJECT_ID),
    () => requestV2(app, 'get', '/condominios/api/andares/' + VALID_OBJECT_ID)
  ];

  for (const call of calls) {
    const res = await withEnv(DEBUG_FLAG, undefined, call);
    assertErrorContract(res, { debugExpected: false });
  }
});

test('campo code só aparece quando WDG_DEBUG_ERRORS=1', async () => {
  const { app } = await createTrackedServer({ skipDb: true });

  const path = '/condominios/api/blocos/' + VALID_OBJECT_ID;

  const noDebug = await withEnv(DEBUG_FLAG, undefined, () => requestV2(app, 'get', path));
  assertErrorContract(noDebug, { debugExpected: false });

  const debugOn = await withEnv(DEBUG_FLAG, '1', () => requestV2(app, 'get', path));
  assertErrorContract(debugOn, { debugExpected: true });
});

test('503 sempre inclui Retry-After em erro de DB indisponível', async () => {
  const { app } = await createTrackedServer({ skipDb: true });

  const responses = [
    await requestV2(app, 'get', '/condominios/api/blocos', { query: { unidade_id: VALID_OBJECT_ID } }),
    await requestV2(app, 'get', '/condominios/api/andares', { query: { unidade_id: VALID_OBJECT_ID } })
  ];

  for (const res of responses) {
    assert.equal(res.status, 503);
    assertJsonResponse(res);
    assert.equal(String(res.headers['retry-after'] || ''), '5');
    assert.equal(res.body?.success, false);
    assert.equal(typeof res.body?.error, 'string');
  }
});

test('GET /unidades, /blocos e /andares retornam JSON válido de sucesso (array/objeto) e nunca HTML', async () => {
  const appInfo = await withEnv('MONGO_MEMORY', '1', () => createTrackedServer());
  const app = appInfo.app;

  const responses = [
    await requestV2(app, 'get', '/condominios/api/unidades'),
    await requestV2(app, 'get', '/condominios/api/blocos', { query: { unidade_id: 'u-test' } }),
    await requestV2(app, 'get', '/condominios/api/andares', { query: { unidade_id: VALID_OBJECT_ID } })
  ];

  for (const res of responses) {
    assertSuccessContract(res);
    const isArray = Array.isArray(res.body);
    const isObject = !!res.body && typeof res.body === 'object' && !isArray;
    assert.ok(isArray || isObject, 'payload deve ser array ou objeto JSON');
  }
});

test('DELETE sucesso retorna JSON válido', async () => {
  const appInfo = await withEnv('MONGO_MEMORY', '1', () => createTrackedServer());
  const app = appInfo.app;

  const res = await requestV2(app, 'delete', '/condominios/api/blocos/' + VALID_OBJECT_ID);
  assertSuccessContract(res);
  assert.ok(res.body && typeof res.body === 'object');
  assert.equal(typeof res.body.ok, 'boolean');
});
