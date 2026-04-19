import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import WidgetSetting from '../src/core/models/widgetSetting.js';
import {
  bustFeedbackWidgetVisibilityReadCache,
} from '../src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-widget-feedback-put-session';
const CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT = '/gestor/api/gestor/widgets/feedback';

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
        nome: user.nome || 'Widget Feedback PUT Contract User',
        isMaster: role === 'master',
      };

      delete req.session.gestorAuthContext;

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
  const email = `${marker}.${role}.${unique}@widget-feedback-put.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Widget Feedback PUT Contract ${role}`,
    role,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
  });
}

async function seedAuthenticatedAgent(app, user) {
  const agent = request.agent(app);
  const res = await agent
    .get(TEST_SESSION_SEED_ENDPOINT)
    .query({ email: user.email, role: user.role })
    .set('Connection', 'close');

  assert.equal(res.status, 204, `Falha ao seedar sessao para ${user.email}`);
  return agent;
}

async function seedWidgetFeedbackRows(rows) {
  await WidgetSetting.deleteMany({ widget: 'feedback' });
  if (Array.isArray(rows) && rows.length) {
    await WidgetSetting.insertMany(rows);
  }
  bustFeedbackWidgetVisibilityReadCache();
}

function expectUnauthorizedJson(res) {
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
}

function expectForbiddenJson(res) {
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Acesso negado',
    code: 'FORBIDDEN',
  });
}

async function withHarness(run) {
  const prevMongoMemory = process.env.MONGO_MEMORY;
  process.env.MONGO_MEMORY = '1';

  const teardownGuard = installTeardownSuppression();
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: false, deferErrorHandlers: true });

  installSessionSeedRoute(app);
  registerErrorHandlers();

  try {
    await run({ app });
  } finally {
    try {
      bustFeedbackWidgetVisibilityReadCache();
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
      if (prevMongoMemory === undefined) delete process.env.MONGO_MEMORY;
      else process.env.MONGO_MEMORY = prevMongoMemory;
    }
  }
}

test('PUT /gestor/api/gestor/widgets/feedback sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ module: 'gestor', enabled: false });

    expectUnauthorizedJson(res);
  });
});

test('PUT canônico de widget settings feedback com usuário não-admin retorna 403 JSON', async () => {
  await withHarness(async ({ app }) => {
    const user = await createTestUser({ role: 'user', marker: `widget_feedback_put_${Date.now()}_${nextCounter()}` });
    const agent = await seedAuthenticatedAgent(app, user);

    const res = await agent
      .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ module: 'gestor', enabled: false });

    expectForbiddenJson(res);
  });
});

test('PUT canônico de widget settings feedback sem module retorna 400', async () => {
  await withHarness(async ({ app }) => {
    const admin = await createTestUser({ role: 'admin', marker: `widget_feedback_put_${Date.now()}_${nextCounter()}` });
    const adminAgent = await seedAuthenticatedAgent(app, admin);

    const res = await adminAgent
      .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ enabled: true });

    assert.equal(res.status, 400);
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.error, 'Módulo inválido.');
  });
});

test('PUT canônico de widget settings feedback com module não reconhecido retorna 400', async () => {
  await withHarness(async ({ app }) => {
    const admin = await createTestUser({ role: 'admin', marker: `widget_feedback_put_${Date.now()}_${nextCounter()}` });
    const adminAgent = await seedAuthenticatedAgent(app, admin);

    const res = await adminAgent
      .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ module: 'modulo-inexistente', enabled: true });

    assert.equal(res.status, 400);
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.error, 'Módulo não reconhecido.');
  });
});

test('PUT canônico de widget settings feedback preserva alias portal_morador, coerção atual e persistência real', async () => {
  await withHarness(async ({ app }) => {
    const admin = await createTestUser({ role: 'admin', marker: `widget_feedback_put_${Date.now()}_${nextCounter()}` });
    const adminAgent = await seedAuthenticatedAgent(app, admin);
    await seedWidgetFeedbackRows([
      { widget: 'feedback', module: 'gestor', enabled: false },
    ]);

    const res = await adminAgent
      .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .send({ module: 'portal_morador', enabled: 'false' });

    assert.equal(res.status, 200);
    assert.equal(res.body?.ok, true);
    assert.ok(res.body?.enabledByModule && typeof res.body.enabledByModule === 'object');
    assert.equal(res.body?.enabledByModule?.gestor, false);
    assert.equal(res.body?.enabledByModule?.['portal-morador'], true);
    assert.equal(res.body?.enabledByModule?.clinica, true);

    const saved = await WidgetSetting.findOne({ widget: 'feedback', module: 'portal-morador' }).lean();
    assert.equal(saved?.enabled, true);
  });
});

test('PUT canônico de widget settings feedback traduz falha interna de escrita para 500', async () => {
  await withHarness(async ({ app }) => {
    const master = await createTestUser({ role: 'master', marker: `widget_feedback_put_${Date.now()}_${nextCounter()}` });
    const masterAgent = await seedAuthenticatedAgent(app, master);
    await seedWidgetFeedbackRows([]);

    const originalUpdateOne = WidgetSetting.updateOne.bind(WidgetSetting);
    try {
      WidgetSetting.updateOne = async function forcedUpdateOne() {
        throw new Error('FORCED_WIDGET_UPDATE_FAILURE');
      };
      bustFeedbackWidgetVisibilityReadCache();

      const res = await masterAgent
        .put(CANONICAL_WIDGET_FEEDBACK_PUT_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ module: 'gestor', enabled: true });

      assert.equal(res.status, 500);
      assert.equal(res.body?.ok, false);
      assert.equal(res.body?.error, 'Erro ao salvar configuração do widget.');
    } finally {
      WidgetSetting.updateOne = originalUpdateOne;
      bustFeedbackWidgetVisibilityReadCache();
    }
  });
});