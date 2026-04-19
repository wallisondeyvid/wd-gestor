import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const IBGE_ENDPOINT = '/gestor/api/ibge';

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
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
      process.emit = originalEmit;
    },
  };
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('GET /gestor/api/ibge sem parametros preserva o contrato runtime atual do app montado', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(IBGE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Parametro estado requerido',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/ibge com apenas estado preserva a listagem runtime atual do app montado', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(`${IBGE_ENDPOINT}?estado=SP`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.ok, true, JSON.stringify(res.body));
    assert.ok(Number.isInteger(res.body?.total), JSON.stringify(res.body));
    assert.ok(res.body.total > 0, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body?.municipios), JSON.stringify(res.body));
    assert.equal(res.body.total, res.body.municipios.length, JSON.stringify(res.body));
    assert.ok(res.body.municipios.some((item) => item?.nome === 'São Paulo' && item?.uf === 'SP'), JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/ibge com estado e cidade preserva o payload runtime atual vencedor', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(`${IBGE_ENDPOINT}?estado=sp&cidade=${encodeURIComponent('São Paulo')}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      ok: true,
      ibge: '3550308',
      cidade: 'São Paulo',
      uf: 'SP',
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/ibge com cidade inexistente preserva o 404 runtime atual vencedor', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(`${IBGE_ENDPOINT}?estado=SP&cidade=${encodeURIComponent('Cidade Inexistente XYZ')}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Cidade nao encontrada para UF',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});