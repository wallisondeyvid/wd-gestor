import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import Feedback from '../src/core/models/feedback.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-feedback-status-session';
const CANONICAL_ADMIN_STATUS_ENDPOINT = '/gestor/api/gestor/feedback/:feedbackId/status';

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

      const effectiveRole = role || user.role || 'user';
      const globalRole = effectiveRole === 'admin' || effectiveRole === 'master'
        ? effectiveRole
        : null;

      req.session.user = {
        id: String(user._id),
        email: user.email,
        role: effectiveRole,
        nome: user.nome || 'Feedback Status Contract User',
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
  const email = `${marker}.${role}.${unique}@feedback.status.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Feedback Status Contract ${role}`,
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

function withRouteParam(template, value) {
  return template.replace(':feedbackId', encodeURIComponent(String(value)));
}

async function createFeedbackDoc({ unidadeId, creatorUser, status = 'novo', mensagem }) {
  const feedback = await Feedback.create({
    tipo: 'outro',
    status,
    mensagem,
    unidade_id: unidadeId,
    criadoPor: {
      userId: creatorUser?._id || null,
      email: creatorUser?.email || '',
      nome: creatorUser?.nome || '',
      role: creatorUser?.role || '',
    },
    origem: {
      modulo: 'gestor',
      path: '/gestor/feedback',
      userAgent: 'feedback-status-runtime-contract',
      timezone: 'America/Sao_Paulo',
    },
    anexos: [],
  });

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

test('PATCH /gestor/api/gestor/feedback/:feedbackId/status sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, 'ffffffffffffffffffffffff'))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ status: 'resolvido' });

    expectUnauthorizedJson(res);
  });
});

test('PATCH canônico com admin contextual atualiza o status e persiste a mutação na unidade ativa', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_status_patch_${Date.now()}_${nextCounter()}`;
    const adminUser = await createTestUser({ role: 'admin', marker });
    const creatorUser = await createTestUser({ role: 'user', marker });
    const adminAgent = await seedAuthenticatedAgent(app, adminUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback da unidade A para patch canônico de status',
    });

    const res = await adminAgent
      .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ status: 'resolvido' });

    expectApiSuccessEnvelope(res, 200);
    assert.equal(res.body?.data?.status, 'resolvido');

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.equal(String(persisted?.status || ''), 'resolvido');
  });
});

test('PATCH canônico com usuário não admin preserva o gate 403 antes da mutação', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_status_patch_${Date.now()}_${nextCounter()}`;
    const creatorUser = await createTestUser({ role: 'user', marker });
    const creatorAgent = await seedAuthenticatedAgent(app, creatorUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback da unidade A para gate 403 do patch de status',
    });

    const res = await creatorAgent
      .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ status: 'resolvido' });

    expectApiFailEnvelope(res, 403);
    assert.equal(res.body?.error, 'Acesso negado.');

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.equal(String(persisted?.status || ''), 'novo');
  });
});

test('PATCH canônico com admin contextual fora de escopo traduz o alvo para 404 e não altera o documento', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_status_patch_${Date.now()}_${nextCounter()}`;
    const adminUser = await createTestUser({ role: 'admin', marker });
    const creatorUser = await createTestUser({ role: 'user', marker });
    const adminAgent = await seedAuthenticatedAgent(app, adminUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_B,
      creatorUser,
      mensagem: 'feedback da unidade B fora do escopo admin contextual A',
    });

    const res = await adminAgent
      .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ status: 'resolvido' });

    expectApiFailEnvelope(res, 404);
    assert.equal(res.body?.error, 'Feedback não encontrado.');

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.equal(String(persisted?.status || ''), 'novo');
  });
});

test('PATCH canônico com status inválido preserva a validação 400 antes da mutação', async () => {
  await withHarness(async ({ app }) => {
    const marker = `feedback_status_patch_${Date.now()}_${nextCounter()}`;
    const adminUser = await createTestUser({ role: 'admin', marker });
    const creatorUser = await createTestUser({ role: 'user', marker });
    const adminAgent = await seedAuthenticatedAgent(app, adminUser, { unidadeId: FEEDBACK_UNIT_A });
    const feedbackId = await createFeedbackDoc({
      unidadeId: FEEDBACK_UNIT_A,
      creatorUser,
      mensagem: 'feedback da unidade A para validação 400 do patch de status',
    });

    const res = await adminAgent
      .patch(withRouteParam(CANONICAL_ADMIN_STATUS_ENDPOINT, feedbackId))
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ status: 'status-invalido' });

    expectApiFailEnvelope(res, 400);
    assert.equal(res.body?.error, 'Status inválido.');

    const persisted = await Feedback.findById(feedbackId).lean();
    assert.equal(String(persisted?.status || ''), 'novo');
  });
});