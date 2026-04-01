import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { readFile, writeFile, rename } from 'node:fs/promises';

import { createServer } from '../src/server/createServer.js';

const BANCOS_ENDPOINT = '/gestor/api/bancos';
const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-bancos-session';
const BANCOS_FILE = 'c:/Projeto3/public/data/bancos.json';
const BANCOS_FILE_BACKUP = 'c:/Projeto3/public/data/bancos.json.runtime-backup';
const CACHE_TTL_MS = 1000 * 60 * 10;
let reloadTick = 0;

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
      id: 'gestor-bancos-session-user',
      _id: 'gestor-bancos-session-user',
      email: 'gestor-bancos@example.com',
      nome: 'Gestor Bancos Session',
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

async function withReloadedCache(fn) {
  const originalDateNow = Date.now;
  try {
    reloadTick += 1;
    Date.now = () => originalDateNow() + (CACHE_TTL_MS * (reloadTick + 1));
    return await fn();
  } finally {
    Date.now = originalDateNow;
  }
}

test('GET /gestor/api/bancos sem sessão preserva o contrato real atual de autenticação', async () => {
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

test('GET /gestor/api/bancos retorna 200 no caminho feliz com o payload final atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app);
    const res = await agent
      .get(BANCOS_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body?.ok, true, JSON.stringify(res.body));
    assert.equal(res.body?.cached, true, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body?.bancos), JSON.stringify(res.body));
    assert.equal(res.body?.total, res.body?.bancos?.length, JSON.stringify(res.body));
    assert.ok((res.body?.bancos?.length || 0) > 0, JSON.stringify(res.body));

    const first = res.body.bancos[0];
    assert.deepEqual(Object.keys(first).sort(), ['codigo', 'nome']);
    assert.equal(first.codigo, '001');
    assert.equal(first.nome, 'Banco do Brasil S.A.');
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/bancos aplica a normalização atual de codigo e nome', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  const originalContent = await readFile(BANCOS_FILE, 'utf8');

  try {
    await writeFile(BANCOS_FILE, JSON.stringify([
      { id: 7, label: '  Banco Runtime A  ' },
      { code: '45', descricao: 'Banco Runtime B' },
      { nome: 'Sem codigo deve cair fora' },
    ], null, 2), 'utf8');

    const agent = await buildAuthenticatedAgent(app);
    const res = await withReloadedCache(() => agent
      .get(BANCOS_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      ok: true,
      bancos: [
        { codigo: '007', nome: 'Banco Runtime A' },
        { codigo: '045', nome: 'Banco Runtime B' },
        { codigo: '000', nome: 'Sem codigo deve cair fora' },
      ],
      total: 3,
      cached: true,
    });
  } finally {
    await writeFile(BANCOS_FILE, originalContent, 'utf8');
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('GET /gestor/api/bancos preserva o fallback atual quando a leitura do arquivo falha', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    await rename(BANCOS_FILE, BANCOS_FILE_BACKUP);

    const agent = await buildAuthenticatedAgent(app);
    const res = await withReloadedCache(() => agent
      .get(BANCOS_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, {
      ok: true,
      bancos: [],
      total: 0,
      cached: true,
    });
  } finally {
    try {
      await rename(BANCOS_FILE_BACKUP, BANCOS_FILE);
    } catch {}
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});