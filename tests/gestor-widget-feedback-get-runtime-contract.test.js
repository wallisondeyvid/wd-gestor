import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import User from '../src/core/models/user.js';
import WidgetSetting from '../src/core/models/widgetSetting.js';
import { bustFeedbackWidgetVisibilityReadCache } from '../src/modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js';

const TEST_SESSION_SEED_ENDPOINT = '/__tests__/seed-widget-feedback-get-session';
const CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT = '/gestor/api/gestor/widgets/feedback';

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
        nome: user.nome || 'Widget Feedback GET Contract User',
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
  const email = `${marker}.${role}.${unique}@widget-feedback-get.contract.test`;
  const senha = await bcrypt.hash('Senha@123456', 10);
  const cpf = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').slice(-11).padStart(11, '0');

  return User.create({
    email,
    senha,
    cpf,
    nome: `Widget Feedback GET Contract ${role}`,
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

function expectUnauthorizedJson(res) {
  assert.equal(res.status, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.code, 'UNAUTHORIZED');
  assert.equal(res.body?.error, 'Não autenticado');
}

async function seedWidgetFeedbackRows(rows) {
  await WidgetSetting.deleteMany({ widget: 'feedback' });
  if (Array.isArray(rows) && rows.length) {
    await WidgetSetting.insertMany(rows);
  }
  bustFeedbackWidgetVisibilityReadCache();
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

test('GET /gestor/api/gestor/widgets/feedback sem sessão retorna 401 JSON', async () => {
  await withHarness(async ({ app }) => {
    const res = await request(app)
      .get(CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    expectUnauthorizedJson(res);
  });
});

test('GET canônico de widget settings feedback autenticado retorna mapa com defaults e rows persistidas', async () => {
  await withHarness(async ({ app }) => {
    const user = await createTestUser({ role: 'user', marker: `widget_feedback_get_${Date.now()}_${nextCounter()}` });
    const agent = await seedAuthenticatedAgent(app, user);
    await seedWidgetFeedbackRows([
      { widget: 'feedback', module: 'gestor', enabled: false },
      { widget: 'feedback', module: 'portal-morador', enabled: false },
    ]);

    const res = await agent
      .get(CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT)
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(res.status, 200);
    assert.equal(res.body?.ok, true);
    assert.ok(res.body?.enabledByModule && typeof res.body.enabledByModule === 'object');
    assert.equal(res.body?.enabledByModule?.gestor, false);
    assert.equal(res.body?.enabledByModule?.['portal-morador'], false);
    assert.equal(res.body?.enabledByModule?.condominios, true);
    assert.equal(res.body?.enabledByModule?.clinica, true);
    assert.equal(res.body?.enabledByModule?.escalas, true);
  });
});

test('GET canônico de widget settings feedback preserva alias portal_morador e default true para módulo desconhecido', async () => {
  await withHarness(async ({ app }) => {
    const user = await createTestUser({ role: 'user', marker: `widget_feedback_get_${Date.now()}_${nextCounter()}` });
    const agent = await seedAuthenticatedAgent(app, user);
    await seedWidgetFeedbackRows([
      { widget: 'feedback', module: 'portal-morador', enabled: false },
    ]);

    const aliasRes = await agent
      .get(CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT)
      .query({ module: 'portal_morador' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(aliasRes.status, 200);
    assert.equal(aliasRes.body?.ok, true);
    assert.equal(aliasRes.body?.module, 'portal-morador');
    assert.equal(aliasRes.body?.enabled, false);

    const unknownRes = await agent
      .get(CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT)
      .query({ module: 'modulo-inexistente' })
      .set('Accept', 'application/json')
      .set('Connection', 'close');

    assert.equal(unknownRes.status, 200);
    assert.equal(unknownRes.body?.ok, true);
    assert.equal(unknownRes.body?.module, 'modulo-inexistente');
    assert.equal(unknownRes.body?.enabled, true);
  });
});

test('GET canônico de widget settings feedback traduz falha interna de leitura para 500', async () => {
  await withHarness(async ({ app }) => {
    const user = await createTestUser({ role: 'user', marker: `widget_feedback_get_${Date.now()}_${nextCounter()}` });
    const agent = await seedAuthenticatedAgent(app, user);
    await seedWidgetFeedbackRows([]);

    const originalFind = WidgetSetting.find.bind(WidgetSetting);
    try {
      WidgetSetting.find = function forcedFind() {
        return {
          lean() {
            throw new Error('FORCED_WIDGET_FIND_FAILURE');
          },
        };
      };
      bustFeedbackWidgetVisibilityReadCache();

      const res = await agent
        .get(CANONICAL_WIDGET_FEEDBACK_GET_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        ok: false,
        error: 'Erro ao carregar configuração do widget.',
        success: false,
      });
    } finally {
      WidgetSetting.find = originalFind;
      bustFeedbackWidgetVisibilityReadCache();
    }
  });
});