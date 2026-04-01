import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const CNAES_ENDPOINT = '/gestor/cnaes';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-cnae-session';

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

function installSessionSeedRoute(app) {
  app.get(TEST_SESSION_SEED_ENDPOINT, (req, res) => {
    req.session.user = {
      id: 'gestor-cnae-session-user',
      _id: 'gestor-cnae-session-user',
      email: 'gestor-cnae@example.com',
      nome: 'Gestor CNAE Session',
      role: 'admin',
      global_role: 'admin',
      isMaster: false,
    };

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
}

async function buildAuthenticatedAgent(app) {
  const agent = request.agent(app);
  const seed = await agent
    .get(TEST_SESSION_SEED_ENDPOINT)
    .set('Connection', 'close');

  assert.equal(seed.status, 204, JSON.stringify(seed.body));
  return agent;
}

test('GET /gestor/cnaes sem sessão preserva o contrato real atual de autenticação', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(CNAES_ENDPOINT)
      .redirects(0)
      .set('Connection', 'close');

    if (res.status === 302) {
      assert.equal(res.headers.location, '/gestor/login');
      return;
    }

    assert.equal(res.status, 200);
    assert.match(String(res.text || ''), /login/i);
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/cnaes retorna 200 no caminho feliz com a paginação atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(`${CNAES_ENDPOINT}?page=1&limit=1`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.page, 1, JSON.stringify(res.body));
    assert.equal(res.body?.limit, 1, JSON.stringify(res.body));
    assert.equal(res.body?.total, 2, JSON.stringify(res.body));
    assert.equal(res.body?.pages, 2, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body?.data), JSON.stringify(res.body));
    assert.equal(res.body.data.length, 1, JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/cnaes respeita a busca relevante já existente no controller', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(`${CNAES_ENDPOINT}?search=${encodeURIComponent('outros cereais')}`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.total, 1, JSON.stringify(res.body));
    assert.equal(res.body?.pages, 1, JSON.stringify(res.body));
    assert.equal(res.body?.data?.length, 1, JSON.stringify(res.body));
    assert.equal(res.body?.data?.[0]?.codigo, '0111-3/02', JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/cnaes/:codigo retorna 404 quando o código não existe', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(`${CNAES_ENDPOINT}/0000-0%2F00`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      success: false,
      code: 'NOT_FOUND',
      message: 'CNAE não encontrado',
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/cnaes/:codigo retorna 200 quando encontra o CNAE', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(`${CNAES_ENDPOINT}/0111-3%2F01`)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(res.body?.data?.codigo, '0111-3/01', JSON.stringify(res.body));
    assert.match(String(res.body?.data?.descricao || ''), /cereais/i);
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});