import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const BIOMETRIA_SNIFF_ENDPOINT = '/gestor/api/biometria/sniff';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-biometria-sniff-session';

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
      id: 'gestor-biometria-sniff-session-user',
      _id: 'gestor-biometria-sniff-session-user',
      email: 'gestor-biometria-sniff@example.com',
      nome: 'Gestor Biometria Sniff Session',
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

test('POST /gestor/api/biometria/sniff sem sessão preserva o contrato real atual de autenticação', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .post(BIOMETRIA_SNIFF_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({});

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

test('POST /gestor/api/biometria/sniff autenticado preserva o contrato atual do endpoint no ambiente de teste', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .post(BIOMETRIA_SNIFF_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({});

    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.equal(res.body?.code, 'BIOMETRIA_DISABLED', JSON.stringify(res.body));
    assert.equal(typeof res.body?.error, 'string', JSON.stringify(res.body));
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('POST /gestor/api/biometria/sniff em ambiente de teste preserva o ramo disabled com payload real atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .post(BIOMETRIA_SNIFF_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ vendorId: '0x1234', productId: '0x5678', durationMs: '2500', poke: true });

    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      error: 'Biometria desabilitada no servidor',
      code: 'BIOMETRIA_DISABLED',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});