import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

async function requestWithV2Flag(app, buildRequest) {
  const prev = process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
  const prevMultiTenant = process.env.WDG_MULTI_TENANT;
  process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = '1';
  process.env.WDG_MULTI_TENANT = '1';
  try {
    return await buildRequest(request(app));
  } finally {
    if (prev === undefined) delete process.env.WDG_FLAG_CONDOMINIOS_APP_V2;
    else process.env.WDG_FLAG_CONDOMINIOS_APP_V2 = prev;

    if (prevMultiTenant === undefined) delete process.env.WDG_MULTI_TENANT;
    else process.env.WDG_MULTI_TENANT = prevMultiTenant;
  }
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
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));
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
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('requireUnitScope retorna 400 quando unidadeId ausente em rota V2 protegida', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithV2Flag(app, (agent) => agent
      .get('/condominios/api/unidades/000000000000000000000001')
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('requireUnitScope permite seguir quando unidadeId valido e informado', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithV2Flag(app, (agent) => agent
      .get('/condominios/api/unidades/000000000000000000000001')
      .query({ unidadeId: '000000000000000000000010' })
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.notEqual(res.status, 400);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('requireUnitScope retorna 400 quando unidadeId ausente em GET /condominios/api/andares/:id V2', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithV2Flag(app, (agent) => agent
      .get('/condominios/api/andares/000000000000000000000001')
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.equal(res.status, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'UNIDADE_ID_REQUIRED');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('requireUnitScope permite seguir em GET /condominios/api/andares/:id V2 quando unidadeId valido e informado', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithV2Flag(app, (agent) => agent
      .get('/condominios/api/andares/000000000000000000000001')
      .query({ unidadeId: '000000000000000000000010' })
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.notEqual(res.status, 400);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});
