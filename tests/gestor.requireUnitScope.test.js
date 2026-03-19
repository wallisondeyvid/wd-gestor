import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import { requireUnitScope } from '../src/modules/gestor/app/middlewares/requireUnitScope.js';

async function withEnforcedMultiTenant(buildRequest) {
  const prevMultiTenant = process.env.WDG_MULTI_TENANT;
  process.env.WDG_MULTI_TENANT = '1';

  try {
    return await buildRequest();
  } finally {
    if (prevMultiTenant === undefined) delete process.env.WDG_MULTI_TENANT;
    else process.env.WDG_MULTI_TENANT = prevMultiTenant;
  }
}

function installSessionSeedRoute(app) {
  app.get('/__tests__/seed-gestor-session', (req, res) => {
    req.session.user = {
      id: '000000000000000000000001',
      email: 'test@example.com',
      role: 'master',
      nome: 'Test User'
    };

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
}

function installRequireUnitScopeEchoRoute(app) {
  app.get('/__tests__/require-unit-scope', (req, res, next) => {
    req.user = req.session?.user
      ? {
          ...req.session.user,
          _id: req.session.user.id || null,
          isMaster: req.session.user.role === 'master',
        }
      : null;
    next();
  }, requireUnitScope, (req, res) => {
    return res.status(200).json({
      unidadeId: req.unitScope?.unidadeId || null,
    });
  });
}

async function createAuthenticatedAgent(app) {
  const agent = request.agent(app);
  const seed = await agent
    .get('/__tests__/seed-gestor-session')
    .set('Connection', 'close');

  assert.equal(seed.status, 204);
  return agent;
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

test('gestor requireUnitScope: sem unidadeId retorna 400 em modo multi-tenant enforced', async () => {
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  const teardownGuard = installTeardownSuppression();
  installSessionSeedRoute(app);
  registerErrorHandlers();
  const agent = await createAuthenticatedAgent(app);

  try {
    const res = await withEnforcedMultiTenant(() => agent
      .get('/gestor/api/recursos')
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

test('gestor requireUnitScope: com unidadeId valido nao retorna 400', async () => {
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  const teardownGuard = installTeardownSuppression();
  installSessionSeedRoute(app);
  registerErrorHandlers();
  const agent = await createAuthenticatedAgent(app);

  try {
    const res = await withEnforcedMultiTenant(() => agent
      .get('/gestor/api/recursos')
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

test('gestor requireUnitScope: usuario nao privilegiado nao consegue injetar unidade por query acima do contexto legado persistido', async () => {
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  const teardownGuard = installTeardownSuppression();
  installRequireUnitScopeEchoRoute(app);
  app.get('/__tests__/seed-gestor-diretor-session', (req, res) => {
    req.session.user = {
      id: '000000000000000000000001',
      email: 'diretor@example.com',
      role: 'diretor',
      nome: 'Diretor Teste',
      unidade_id: '0000000000000000000000aa',
    };

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
  registerErrorHandlers();

  const agent = request.agent(app);
  const seed = await agent
    .get('/__tests__/seed-gestor-diretor-session')
    .set('Connection', 'close');

  assert.equal(seed.status, 204);

  try {
    const res = await withEnforcedMultiTenant(() => agent
      .get('/__tests__/require-unit-scope')
      .query({ unidadeId: '0000000000000000000000bb' })
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.equal(res.status, 200);
    assert.equal(res.body?.unidadeId, '0000000000000000000000aa');
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});
