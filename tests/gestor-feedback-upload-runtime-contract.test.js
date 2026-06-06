import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Feedback from '../src/core/models/feedback.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-feedback-upload-session';
const CANONICAL_UPLOAD_ENDPOINT = '/gestor/api/feedback/:feedbackId/anexo';
const FEEDBACK_UNIT_A = '507f191e810c19729de860aa';
const FEEDBACK_UNIT_B = '507f191e810c19729de860ab';

let uniqueCounter = 0;

function nextCounter() {
  uniqueCounter += 1;
  return uniqueCounter;
}

function createTinyPngBuffer() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082',
    'hex',
  );
}

function withRouteParam(template, value) {
  return template.replace(':feedbackId', encodeURIComponent(String(value)));
}

async function withEnvPatch(patch, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
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
    const message = String(err?.message || err);
    return message.includes('Connection was force closed')
      || message.includes('Unable to deserialize cloned data due to invalid or unsupported version.');
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

async function waitForLoadedModelsInit() {
  const initCalls = [];

  for (const connection of mongoose.connections) {
    for (const model of Object.values(connection.models || {})) {
      if (typeof model?.init === 'function') {
        initCalls.push(model.init().catch(() => {}));
      }
    }
  }

  await Promise.all(initCalls);
}

async function closeWithTeardownGuard(close, teardownGuard) {
  if (typeof close !== 'function') return;

  await waitForLoadedModelsInit();
  teardownGuard.startShutdown();
  await close({ stopMemoryServer: true });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installSessionSeedRoute(app) {
  app.get(TEST_SESSION_SEED_ENDPOINT, async (req, res) => {
    try {
      const email = String(req.query?.email || '').trim().toLowerCase();
      const role = String(req.query?.role || '').trim().toLowerCase();
      const unidadeId = String(req.query?.unidadeId || '').trim();

      if (!email) {
        return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED' });
      }

      const user = await User.findOne({ email }).lean();
      if (!user) {
        return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      }

      req.session.user = {
        id: String(user._id),
        email: user.email,
        role: role || user.role || 'user',
        nome: user.nome || 'Feedback Upload Contract User',
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      };

      if (unidadeId) {
        req.session.gestorAuthContext = {
          source: 'auth-context-v1',
          active_unidade_id: unidadeId,
        };
      } else {
        delete req.session.gestorAuthContext;
      }

      return req.session.save((err) => {
        if (err) {
          return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
        }
        return res.status(204).end();
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
  });
}

async function createTestUser({ role, marker }) {
  const unique = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}_${nextCounter()}`;
  const email = `${marker}.${role}.${unique}@feedback.upload.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Feedback Upload Contract ${role}`,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function seedAuthenticatedAgent(app, user, extras = {}) {
  const agent = request.agent(app);
  const res = await agent
    .get(TEST_SESSION_SEED_ENDPOINT)
    .query({
      email: user.email,
      role: user.role,
      ...(extras.unidadeId ? { unidadeId: extras.unidadeId } : {}),
    })
    .set('Connection', 'close');

  assert.equal(res.status, 204, `Falha ao seedar sessao para ${user.email}`);
  return agent;
}

function expectUnauthorizedJson(res) {
  assert.equal(res.status, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.code, 'UNAUTHORIZED');
  assert.equal(res.body?.error, 'Não autenticado');
}

function expectApiFailEnvelope(res, expectedStatus) {
  assert.equal(res.status, expectedStatus);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.success, false);
  assert.equal(typeof res.body?.error, 'string');
}

function expectApiSuccessEnvelope(res, expectedStatus = 200) {
  assert.equal(res.status, expectedStatus);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.success, true);
}

async function createFeedbackDoc({ unidadeId, creatorUser, mensagem, omitUnit = false }) {
  const payload = {
    tipo: 'outro',
    status: 'novo',
    mensagem,
    criadoPor: {
      userId: creatorUser?._id || null,
      email: creatorUser?.email || '',
      nome: creatorUser?.nome || '',
      role: creatorUser?.role || '',
    },
    origem: {
      modulo: 'gestor',
      path: '/gestor/feedback',
      userAgent: 'feedback-upload-runtime-contract',
      timezone: 'America/Sao_Paulo',
    },
    anexos: [],
  };

  if (!omitUnit) {
    payload.unidade_id = unidadeId;
  }

  const feedback = await Feedback.create(payload);

  return String(feedback._id);
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  const prevAuthContextFlag = process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
  process.env.MONGO_MEMORY = '1';
  process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = '1';

  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: false, deferErrorHandlers: true });
  app.locals.gestorAuthContextFeatureFlags = {
    ...(app.locals.gestorAuthContextFeatureFlags || {}),
    gestor_auth_context_resolver: true,
  };

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    await run({ app });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
      if (prevAuthContextFlag === undefined) delete process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER;
      else process.env.WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER = prevAuthContextFlag;
    }
  }
}

test('POST /gestor/api/feedback/:feedbackId/anexo sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, 'ffffffffffffffffffffffff'))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('anexo', createTinyPngBuffer(), 'anon.png');

    expectUnauthorizedJson(res);
  });
});

test('POST canônico do widget upload anexa arquivo em feedback do criador no escopo e expõe URL pública', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_upload_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback para upload focal',
    });

    const res = await withEnvPatch(
      {
        VERCEL: '',
        BLOB_READ_WRITE_TOKEN: '',
        WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
        VERCEL_BLOB_RW_TOKEN: '',
      },
      async () => creatorAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, feedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', createTinyPngBuffer(), 'ok-local.png'),
    );

    expectApiSuccessEnvelope(res, 200);
    const anexos = res.body?.data?.anexos || [];
    assert.ok(Array.isArray(anexos));
    assert.ok(anexos.length >= 1);
    const lastAnexo = anexos[anexos.length - 1] || {};
    assert.match(String(lastAnexo.url || ''), /^\/gestor\/uploads\/feedback\//);

    const staticAccess = await request(app)
      .get(String(lastAnexo.url || ''))
      .set('Connection', 'close');
    assert.equal(staticAccess.status, 200);

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.ok(Array.isArray(persisted?.anexos));
    assert.ok((persisted?.anexos || []).length >= 1);
  });
});

test('POST canônico do widget upload permite anexo em feedback global sem unidade ativa', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_upload_global_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'admin', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser);
    const feedbackId = await createFeedbackDoc({
      unidadeId: null,
      creatorUser,
      mensagem: 'feedback global para upload focal',
      omitUnit: true,
    });

    const res = await withEnvPatch(
      {
        VERCEL: '',
        BLOB_READ_WRITE_TOKEN: '',
        WDGESTOR_DB_DADOS_READ_WRITE_TOKEN: '',
        VERCEL_BLOB_RW_TOKEN: '',
      },
      async () => creatorAgent
        .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, feedbackId))
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .attach('anexo', createTinyPngBuffer(), 'ok-global.png'),
    );

    expectApiSuccessEnvelope(res, 200);
    assert.notEqual(res.body?.error, 'UNIDADE_ID_REQUIRED');
    const persisted = await Feedback.findById(feedbackId).lean();
    assert.ok(Array.isArray(persisted?.anexos));
    assert.ok((persisted?.anexos || []).length >= 1);
    assert.ok(persisted?.unidade_id == null || String(persisted?.unidade_id || '').trim() === '');
  });
});

test('POST canônico do widget upload traduz feedback fora do escopo para 404 sem mutar anexos', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_upload_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_B,
      creatorUser,
      mensagem: 'feedback fora do escopo para upload focal',
    });

    const res = await creatorAgent
      .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('anexo', createTinyPngBuffer(), 'fora-do-escopo.png');

    expectApiFailEnvelope(res, 404);
    assert.equal(res.body?.error, 'Feedback não encontrado.');

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.equal(Array.isArray(persisted?.anexos) ? persisted.anexos.length : 0, 0);
  });
});

test('POST canônico do widget upload preserva 400 para id malformado, arquivo ausente e mime inválido', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_upload_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback para erros de upload focal',
    });

    const malformedId = await creatorAgent
      .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, 'id-malformado'))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('anexo', createTinyPngBuffer(), 'malformed-id.png');

    expectApiFailEnvelope(malformedId, 400);
    assert.equal(malformedId.body?.error, 'ID inválido.');

    const missingFile = await creatorAgent
      .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({});

    expectApiFailEnvelope(missingFile, 400);
    assert.equal(missingFile.body?.error, 'Arquivo ausente.');

    const invalidMime = await creatorAgent
      .post(withRouteParam(CANONICAL_UPLOAD_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .attach('anexo', Buffer.from('nao-e-imagem'), 'mime-invalido.txt');

    expectApiFailEnvelope(invalidMime, 400);
    assert.equal(invalidMime.body?.error, 'Tipo de arquivo inválido.');
  });
});