import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const BANCOS_ENDPOINT = '/gestor/api/bancos';

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

test('GET /gestor/api/bancos sem sessão preserva o contrato real atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(BANCOS_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.equal(res.body?.error, 'Não autenticado', JSON.stringify(res.body));
    assert.equal(res.body?.code, 'UNAUTHORIZED', JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});