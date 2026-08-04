import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const UNIDADE_ID = '507f1f77bcf86cd799439010';
const RANGE_FROM = '2026-04-10T00:00:00.000Z';
const RANGE_TO = '2026-04-12T23:59:59.999Z';

const ENDPOINTS = [
  '/mensagens/api/msg/admin/metrics/users',
  '/mensagens/api/msg/admin/metrics/timeseries/users',
  '/mensagens/api/msg/admin/metrics/mailboxes',
  '/mensagens/api/msg/admin/metrics/timeseries/mailboxes',
];

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

function buildQuery() {
  return new URLSearchParams({
    unidade_id: UNIDADE_ID,
    from: RANGE_FROM,
    to: RANGE_TO,
  }).toString();
}

test('GETs /mensagens/api/msg/admin/metrics estão migrados e exigem autenticação admin', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    for (const endpoint of ENDPOINTS) {
      const res = await request(app)
        .get(`${endpoint}?${buildQuery()}`)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 401, `${endpoint} => ${JSON.stringify(res.body)}`);
      assert.equal(res.body?.success, false, `${endpoint} => ${JSON.stringify(res.body)}`);
      assert.match(
        String(res.body?.message || res.body?.error || ''),
        /não autenticado/i,
        `${endpoint} => ${JSON.stringify(res.body)}`,
      );
    }
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});
