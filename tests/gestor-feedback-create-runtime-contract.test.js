import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Feedback from '../src/core/models/feedback.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-feedback-create-session';
const CANONICAL_CREATE_ENDPOINT = '/gestor/api/feedback';
const FEEDBACK_UNIT_A = '507f191e810c19729de860aa';

let uniqueCounter = 0;

function nextCounter() {
  uniqueCounter += 1;
  return uniqueCounter;
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

      const effectiveRole = role || user.role || 'user';
      const globalRole = effectiveRole === 'admin' || effectiveRole === 'master'
        ? effectiveRole
        : null;

      req.session.user = {
        id: String(user._id),
        email: user.email,
        role: effectiveRole,
        nome: user.nome || 'Feedback Create Contract User',
        ...(globalRole ? { global_role: globalRole } : {}),
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      };

      if (unidadeId) {
        req.session.gestorAuthContext = {
          source: 'auth-context-v1',
          active_unidade_id: unidadeId,
          ...(globalRole ? { global_role: globalRole } : {}),
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
  const email = `${marker}.${role}.${unique}@feedback.create.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Feedback Create Contract ${role}`,
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

test('POST /gestor/api/feedback sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ mensagem: 'Sem sessao' });

    expectUnauthorizedJson(res);
  });
});

test('POST canônico do widget create cria feedback contextual com unidade ativa e status novo', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_create_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const res = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        mensagem: 'Mensagem de criação contrato focal',
        tipo: 'elogio',
      });

    expectApiSuccessEnvelope(res, 200);
    assert.equal(res.body?.created, true);
    assert.equal(typeof res.body?.id, 'string');
    assert.ok(res.body?.id);
    assert.equal(String(res.body?.data?.unidade_id || ''), FEEDBACK_UNIT_A);
    assert.equal(res.body?.data?.status, 'novo');
    assert.equal(String(res.body?.data?.criadoPor?.userId || ''), String(creatorUser._id));

    const persisted = await Feedback.findById(res.body.id).lean();
    assert.ok(persisted, 'feedback criado deve existir no banco');
    assert.equal(String(persisted.unidade_id || ''), FEEDBACK_UNIT_A);
    assert.equal(persisted.status, 'novo');
  });
});

test('POST canônico do widget create preserva 400 para mensagem obrigatória, limite e tipo inválido', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_create_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const emptyMessage = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ mensagem: '   ' });

    expectApiFailEnvelope(emptyMessage, 400);
    assert.equal(emptyMessage.body?.error, 'Mensagem é obrigatória.');

    const tooLong = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ mensagem: 'x'.repeat(5001), tipo: 'erro' });

    expectApiFailEnvelope(tooLong, 400);
    assert.equal(tooLong.body?.error, 'Mensagem deve ter no máximo 4000 caracteres.');

    const invalidType = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ mensagem: 'create com tipo invalido', tipo: 'tipo-invalido' });

    expectApiFailEnvelope(invalidType, 400);
    assert.equal(invalidType.body?.error, 'Tipo inválido.');
  });
});

test('POST canônico do widget create normaliza tipo e infere módulo por precedência', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_create_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const withModule = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .set('Referer', 'https://app.local/referer/ignorado')
      .send({
        mensagem: 'create com module explicito',
        tipo: ' ELOGIO ',
        module: 'modulo_explicito',
        contexto: {
          url: 'https://app.local/contexto/ignorado',
          timezone: 'America/Sao_Paulo',
          user_agent: 'ctx-agent',
        },
      });

    expectApiSuccessEnvelope(withModule, 200);
    assert.equal(withModule.body?.data?.tipo, 'elogio');
    assert.equal(withModule.body?.data?.origem?.modulo, 'modulo_explicito');
    assert.equal(String(withModule.body?.data?.unidade_id || ''), FEEDBACK_UNIT_A);

    const withContextUrl = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({
        mensagem: 'create com contexto para inferencia',
        contexto: {
          url: '/ouvidoria/painel',
          timezone: 'America/Sao_Paulo',
        },
      });

    expectApiSuccessEnvelope(withContextUrl, 200);
    assert.equal(withContextUrl.body?.data?.tipo, 'outro');
    assert.equal(withContextUrl.body?.data?.origem?.modulo, 'ouvidoria');
    assert.equal(withContextUrl.body?.data?.origem?.path, '/ouvidoria/painel');

    const withReferer = await creatorAgent
      .post(CANONICAL_CREATE_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .set('Referer', 'https://app.local/atendimento/tela')
      .send({
        mensagem: 'create com inferencia por referer',
        tipo: 'erro',
      });

    expectApiSuccessEnvelope(withReferer, 200);
    assert.equal(withReferer.body?.data?.tipo, 'erro');
    assert.equal(withReferer.body?.data?.origem?.modulo, 'atendimento');
  });
});