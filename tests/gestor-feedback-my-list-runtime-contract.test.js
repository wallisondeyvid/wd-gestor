import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Feedback from '../src/core/models/feedback.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-feedback-my-list-session';
const CANONICAL_MY_LIST_ENDPOINT = '/gestor/api/feedback/meus';

const FEEDBACK_UNIT_A = '507f191e810c19729de860aa';
const FEEDBACK_UNIT_B = '507f191e810c19729de860ab';

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

      req.session.user = {
        id: String(user._id),
        email: user.email,
        role: role || user.role || 'user',
        nome: user.nome || 'Feedback My List Contract User',
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
  const email = `${marker}.${role}.${unique}@feedback.my-list.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Feedback My List Contract ${role}`,
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
      userAgent: 'feedback-my-list-runtime-contract',
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

test('GET /gestor/api/feedback/meus sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .get(CANONICAL_MY_LIST_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    expectUnauthorizedJson(res);
  });
});

test('GET canônico do widget list retorna apenas feedbacks do criador na unidade ativa', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_my_list_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const otherUser = await createTestUser({ role: 'user', marker: `${marker}_other` });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const ownScopedId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback próprio na unidade ativa',
    });
    const otherUserScopedId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser: otherUser,
      mensagem: 'feedback de outro usuário na mesma unidade',
    });

    const res = await creatorAgent
      .get(CANONICAL_MY_LIST_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    expectApiSuccessEnvelope(res, 200);
    assert.ok(Array.isArray(res.body?.data), 'GET meus deve retornar array em data');
    const returnedIds = new Set((res.body?.data || []).map((item) => String(item?._id || item?.id || '')));
    assert.equal(returnedIds.has(ownScopedId), true);
    assert.equal(returnedIds.has(otherUserScopedId), false);
  });
});

test('GET canônico do widget list exclui feedback do mesmo criador fora da unidade ativa', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_my_list_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const ownScopedId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback próprio visível na unidade A',
    });
    const ownOtherUnitId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_B,
      creatorUser,
      mensagem: 'feedback próprio fora da unidade ativa',
    });

    const res = await creatorAgent
      .get(CANONICAL_MY_LIST_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    expectApiSuccessEnvelope(res, 200);
    const returnedIds = new Set((res.body?.data || []).map((item) => String(item?._id || item?.id || '')));
    assert.equal(returnedIds.has(ownScopedId), true);
    assert.equal(returnedIds.has(ownOtherUnitId), false);
  });
});

test('GET canônico do widget list preserva o fallback legado para feedback sem unidade_id do criador', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_my_list_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });

    const ownScopedId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback próprio contextual',
    });
    const ownLegacyId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback legado sem unidade',
      omitUnit: true,
    });

    const res = await creatorAgent
      .get(CANONICAL_MY_LIST_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    expectApiSuccessEnvelope(res, 200);
    const returnedIds = new Set((res.body?.data || []).map((item) => String(item?._id || item?.id || '')));
    assert.equal(returnedIds.has(ownScopedId), true);
    assert.equal(returnedIds.has(ownLegacyId), true);
  });
});