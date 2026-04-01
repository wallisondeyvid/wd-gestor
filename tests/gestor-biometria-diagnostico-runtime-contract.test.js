import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const BIOMETRIA_DIAGNOSTICO_ENDPOINT = '/gestor/api/biometria/diagnostico';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-biometria-diagnostico-session';

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
      id: 'gestor-biometria-diagnostico-session-user',
      _id: 'gestor-biometria-diagnostico-session-user',
      email: 'gestor-biometria-diagnostico@example.com',
      nome: 'Gestor Biometria Diagnostico Session',
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

test('GET /gestor/api/biometria/diagnostico sem sessão preserva o contrato real atual de autenticação', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .get(BIOMETRIA_DIAGNOSTICO_ENDPOINT)
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

test('GET /gestor/api/biometria/diagnostico autenticado preserva o contrato atual de sucesso', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(BIOMETRIA_DIAGNOSTICO_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    assert.equal(typeof res.body?.data, 'object', JSON.stringify(res.body));
    assert.ok(res.body?.data && !Array.isArray(res.body.data), JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/biometria/diagnostico em ambiente de teste preserva o ramo disabled com payload real atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(BIOMETRIA_DIAGNOSTICO_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      success: true,
      data: {
        sistema: process.platform,
        qtd: 0,
        resultados: [],
        disabled: true,
      },
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});