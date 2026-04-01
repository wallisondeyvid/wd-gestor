import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';

const BIOMETRIA_FACE_UPLOAD_ENDPOINT = '/gestor/api/biometria/face/upload';
const TEST_FULL_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-biometria-face-upload-session';
const TEST_MINIMAL_SESSION_SEED_ENDPOINT = '/__tests__/seed-gestor-biometria-face-upload-minimal-session';

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

function installSessionSeedRoutes(app) {
  app.get(TEST_FULL_SESSION_SEED_ENDPOINT, (req, res) => {
    req.session.user = {
      id: 'gestor-biometria-face-upload-session-user',
      _id: 'gestor-biometria-face-upload-session-user',
      email: 'gestor-biometria-face-upload@example.com',
      nome: 'Gestor Biometria Face Upload Session',
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

  app.get(TEST_MINIMAL_SESSION_SEED_ENDPOINT, (req, res) => {
    req.session.user = {
      id: 'gestor-biometria-face-upload-minimal-session-user',
    };

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
}

async function buildAuthenticatedAgent(app, seedEndpoint) {
  const agent = request.agent(app);
  const seed = await agent
    .get(seedEndpoint)
    .set('Connection', 'close');

  assert.equal(seed.status, 204, JSON.stringify(seed.body));
  return agent;
}

test('POST /gestor/api/biometria/face/upload sem sessão preserva o contrato real atual da rota', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  registerErrorHandlers();

  try {
    const res = await request(app)
      .post(BIOMETRIA_FACE_UPLOAD_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({});

    assert.equal(res.status, 401, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.deepEqual(res.body, {
      success: false,
      error: 'Não autenticado',
      code: 'UNAUTHORIZED',
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('POST /gestor/api/biometria/face/upload com sessão mínima atravessa o requireApiAuth atual e cai na validação sem capturas', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoutes(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app, TEST_MINIMAL_SESSION_SEED_ENDPOINT);
    const res = await agent
      .post(BIOMETRIA_FACE_UPLOAD_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({});

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Nenhuma captura enviada',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('POST /gestor/api/biometria/face/upload autenticado preserva o comportamento real do ramo sem capturas', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoutes(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app, TEST_FULL_SESSION_SEED_ENDPOINT);
    const res = await agent
      .post(BIOMETRIA_FACE_UPLOAD_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ capturas: [] });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Nenhuma captura enviada',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});

test('POST /gestor/api/biometria/face/upload com capturas presentes preserva o ramo real de blob não configurado no ambiente atual', async () => {
  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });

  installSessionSeedRoutes(app);
  registerErrorHandlers();

  try {
    const agent = await buildAuthenticatedAgent(app, TEST_FULL_SESSION_SEED_ENDPOINT);
    const res = await agent
      .post(BIOMETRIA_FACE_UPLOAD_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        capturas: ['data:image/png;base64,AAAA'],
        meta: { orientacoes: ['frente'] },
      });

    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type'] || ''), /^application\/json\b/i);
    assert.deepEqual(res.body, {
      ok: false,
      error: 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)',
      success: false,
    });
  } finally {
    await closeWithTeardownGuard(close, teardownGuard);
    await teardownGuard.remove();
  }
});