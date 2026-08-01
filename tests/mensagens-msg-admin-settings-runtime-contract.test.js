import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

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

test('GET /mensagens/api/msg/admin/settings permanece nao migrado no modulo mensagens', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .get('/mensagens/api/msg/admin/settings?unidade_id=507f1f77bcf86cd799439010')
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.match(String(res.body?.message || ''), /^Recurso n.o encontrado$/u);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('PUT /mensagens/api/msg/admin/settings permanece nao migrado no modulo mensagens', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await request(app)
      .put('/mensagens/api/msg/admin/settings')
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        unidade_id: '507f1f77bcf86cd799439010',
        permitir_pessoal_para_pessoal: false,
      });

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body?.success, false, JSON.stringify(res.body));
    assert.match(String(res.body?.message || ''), /^Recurso n.o encontrado$/u);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});