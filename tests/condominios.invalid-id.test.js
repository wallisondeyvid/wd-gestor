import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

async function requestWithFlag(app, flagValue, pathName, query = {}) {
  const prev = process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
  process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = String(flagValue);
  try {
    return await request(app)
      .get(pathName)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .query(query);
  } finally {
    if (prev === undefined) delete process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
    else process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = prev;
  }
}

function minimalBodyDebug(body) {
  try {
    const text = JSON.stringify(body);
    if (text.length <= 240) return text;
    return `${text.slice(0, 240)}...`;
  } catch {
    return String(body);
  }
}

function assert200EmptyListContract(body) {
  const debug = minimalBodyDebug(body);

  if (Array.isArray(body)) {
    assert.deepEqual(body, [], `status 200 deve retornar array vazio. body=${debug}`);
    return;
  }

  if (body && typeof body === 'object') {
    const ok = body.success ?? body.ok;
    assert.equal(ok, true, `status 200 sem success/ok=true. body=${debug}`);
    assert.ok(Array.isArray(body.data), `status 200 sem data como array. body=${debug}`);
    assert.deepEqual(body.data, [], `status 200 com data diferente de []. body=${debug}`);
    return;
  }

  assert.fail(`status 200 em formato inválido. body=${debug}`);
}

async function assertOfflineContract(app, pathName, query = {}) {
  const res = await request(app)
    .get(pathName)
    .set('Accept', 'application/json')
    .set('Connection', 'close')
    .query(query);

  assert.equal(res.status, 503);
  assert.equal(String(res.headers['retry-after'] || ''), '5');
  const ok = res.body?.success ?? res.body?.ok;
  assert.equal(ok, false);
  assert.equal(typeof res.body?.error, 'string');
  assert.ok(res.body.error.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body || {}, 'code'), false);
}

function installTeardownSuppression() {
  let shuttingDown = false;
  const originalEmit = process.emit;

  const shouldIgnore = (err) => {
    if (!shuttingDown) return false;
    return String(err?.message || err).includes('Connection was force closed');
  };

  const onUnhandledRejection = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  const onUncaughtException = (err) => {
    if (shouldIgnore(err)) return;
    throw err instanceof Error ? err : new Error(String(err));
  };

  process.emit = function patchedEmit(eventName, ...args) {
    if (
      (eventName === 'unhandledRejection' || eventName === 'uncaughtException')
      && shouldIgnore(args[0])
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  process.prependListener('unhandledRejection', onUnhandledRejection);
  process.prependListener('uncaughtException', onUncaughtException);

  return {
    startShutdown() {
      shuttingDown = true;
    },
    async remove() {
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setTimeout(r, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    }
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 0));
}

test('GET /condominios/api/blocos com unidade_id inválido retorna [] sem CastError e sem 500', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const res = await requestWithFlag(app, 1, '/condominios/api/blocos', { unidade_id: 'u-test' });
    assert.ok([200, 503].includes(res.status));
    if (res.status === 200) {
      assert200EmptyListContract(res.body);
    } else {
      const ok = res.body?.success ?? res.body?.ok;
      assert.equal(ok, false);
      assert.equal(typeof res.body?.error, 'string');
      assert.ok(res.body.error.length > 0);
      const retryAfter = String(res.headers?.['retry-after'] || '');
      if (retryAfter) {
        assert.equal(retryAfter, '5');
      }
    }

    const hasCastError = logs.some((line) => /CastError|Cast to ObjectId failed/i.test(line));
    assert.equal(hasCastError, false);
  } finally {
    console.error = originalConsoleError;
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/blocos com skipDb=true retorna 503 + Retry-After + payload consistente', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();
  try {
    await assertOfflineContract(app, '/condominios/api/blocos', {
      unidade_id: '000000000000000000000010'
    });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/unidades com skipDb=true retorna contrato offline', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();
  try {
    await assertOfflineContract(app, '/condominios/api/unidades');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/andares com skipDb=true retorna contrato offline', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();
  try {
    await assertOfflineContract(app, '/condominios/api/andares');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/blocos/:id com skipDb=true retorna contrato offline', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();
  try {
    await assertOfflineContract(app, '/condominios/api/blocos/000000000000000000000010');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('Integridade da flag V2: wiring OFF/ON para handlers de blocos permanece explícito', async () => {
  const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');
  const source = await fs.readFile(filePath, 'utf8');

  assert.match(source, /app\.get\('\/api\/blocos',[\s\S]*if \(isV2On\) return handleGetBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.post\('\/api\/blocos',[\s\S]*if \(isV2On\) return handlePostBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.put\('\/api\/blocos\/:id',[\s\S]*if \(isV2On\) return handlePutBlocosV2\(req, res, next\);/);
  assert.match(source, /app\.delete\('\/api\/blocos\/:id',[\s\S]*if \(isV2On\) return handleDeleteBlocosV2\(req, res, next\);/);
});
