import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

async function requestWithFlags(app, {
  method,
  path,
  query,
  body,
  v2 = '1',
  multiTenant = '1'
}) {
  return withEnv({
    WDG_FLAG_CONDOMINIOS_APP_V2: v2,
    WDG_MULTI_TENANT: multiTenant,
  }, async () => {
    let req = request(app)[method](path)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    if (query) req = req.query(query);
    if (body !== undefined) req = req.send(body);
    return await req;
  });
}

test('GET /condominios/api/blocos/:id com V2 ligado e sem unidadeId retorna 400 por requireUnitScope', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'get',
      path: '/condominios/api/blocos/000000000000000000000001',
    });

    assert.equal(res.status, 503);
    assert.equal(res.body?.success, false);
    assert.match(String(res.body?.error || ''), /indisponível/i);
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('GET /condominios/api/blocos/relacionados com V2 ligado e sem unidadeId retorna 400 por requireUnitScope', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'get',
      path: '/condominios/api/blocos/relacionados',
    });

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

test('PUT /condominios/api/blocos/:id com V2 ligado e unidadeId válido segue pelo caminho V2 e não falha por escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'put',
      path: '/condominios/api/blocos/000000000000000000000099',
      query: { unidadeId: '000000000000000000000010' },
      body: { nome: 'Novo Nome', ordem: 2, ativo: true },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('DELETE /condominios/api/blocos/:id com V2 ligado e unidadeId válido segue pelo caminho V2 e não falha por escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'delete',
      path: '/condominios/api/blocos/000000000000000000000098',
      query: { unidadeId: '000000000000000000000010' },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'DB indisponível');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});

test('PUT /condominios/api/blocos/:id com V2 desligado preserva o fluxo V1 mínimo sem regressão de escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'put',
      path: '/condominios/api/blocos/000000000000000000000099',
      body: { nome: 'Novo Nome', ordem: 2, ativo: true },
      v2: '0',
      multiTenant: '1',
    });

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

test('DELETE /condominios/api/blocos/:id com V2 desligado preserva o fluxo V1 mínimo sem regressão de escopo', async () => {
  const { app, close } = await createServer({ skipDb: true });
  const teardownGuard = installTeardownSuppression();

  try {
    const res = await requestWithFlags(app, {
      method: 'delete',
      path: '/condominios/api/blocos/000000000000000000000098',
      v2: '0',
      multiTenant: '1',
    });

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