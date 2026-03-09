import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import { createServer } from '../src/server/createServer.js';
import WidgetSetting from '../src/core/models/widgetSetting.js';

const MODULES_ENDPOINT = '/gestor/api/gestor/widgets/modules';
const FEEDBACK_ENDPOINT = '/gestor/api/gestor/widgets/feedback';

function installSessionSeedRoute(app) {
  app.get('/__tests__/seed-gestor-session', (req, res) => {
    const role = String(req.query?.role || 'master').trim() || 'master';
    req.session.user = {
      id: '000000000000000000000001',
      email: `${role}.widget.contract@example.com`,
      role,
      nome: `Test ${role}`,
    };

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'SESSION_SEED_FAILED' });
      }
      return res.status(204).end();
    });
  });
}

async function createAuthenticatedAgent(app, role) {
  const agent = request.agent(app);
  const seed = await agent
    .get('/__tests__/seed-gestor-session')
    .query({ role })
    .set('Connection', 'close');

  assert.equal(seed.status, 204, `Falha ao seedar sessão para role=${role}`);
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

function cloneRow(row) {
  return {
    widget: String(row?.widget || ''),
    module: String(row?.module || ''),
    enabled: row?.enabled !== false,
  };
}

function createWidgetStore(initialRows = []) {
  let rows = [];

  const reset = (nextRows = initialRows) => {
    rows = nextRows.map(cloneRow);
  };

  const find = (filter = {}) => {
    const widget = String(filter?.widget || '').trim();
    const filtered = rows
      .filter((row) => (!widget ? true : row.widget === widget))
      .map(cloneRow);

    return {
      lean: async () => filtered,
    };
  };

  const updateOne = async (filter = {}, update = {}, options = {}) => {
    const widget = String(filter?.widget || '').trim();
    const moduleId = String(filter?.module || '').trim();
    const enabled = update?.$set?.enabled !== false;

    const existing = rows.find((row) => row.widget === widget && row.module === moduleId);

    if (!existing) {
      if (options?.upsert) {
        rows.push({ widget, module: moduleId, enabled });
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    const before = existing.enabled;
    existing.enabled = enabled;
    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: before === enabled ? 0 : 1,
      upsertedCount: 0,
    };
  };

  const getRows = () => rows.map(cloneRow);

  reset(initialRows);
  return { reset, find, updateOne, getRows };
}

async function withWidgetSettingPatch(patch, run) {
  const originalFind = WidgetSetting.find;
  const originalUpdateOne = WidgetSetting.updateOne;

  try {
    if (patch.find) WidgetSetting.find = patch.find;
    if (patch.updateOne) WidgetSetting.updateOne = patch.updateOne;
    return await run();
  } finally {
    WidgetSetting.find = originalFind;
    WidgetSetting.updateOne = originalUpdateOne;
  }
}

async function withClockOffset(offsetMs, run) {
  const originalNow = Date.now;

  try {
    Date.now = () => originalNow() + offsetMs;
    return await run();
  } finally {
    Date.now = originalNow;
  }
}

function createClockOffsetGenerator(stepMs = 90_000) {
  let current = 0;
  return () => {
    current += stepMs;
    return current;
  };
}

test('widgetSettingsApi contract (tests-only freeze)', async (t) => {
  const { app, close, registerErrorHandlers } = await createServer({ skipDb: true, deferErrorHandlers: true });
  const teardownGuard = installTeardownSuppression();

  installSessionSeedRoute(app);
  registerErrorHandlers();

  const masterAgent = await createAuthenticatedAgent(app, 'master');
  const adminAgent = await createAuthenticatedAgent(app, 'admin');
  const userAgent = await createAuthenticatedAgent(app, 'user');
  const anonymous = request(app);

  const baseRows = [
    { widget: 'feedback', module: 'gestor', enabled: false },
    { widget: 'feedback', module: 'portal-morador', enabled: false },
    { widget: 'feedback', module: 'clinica', enabled: true },
  ];
  const store = createWidgetStore(baseRows);
  const nextClockOffset = createClockOffsetGenerator();

  try {
    await t.test('GET modules sem sessão retorna 401', async () => {
      const res = await anonymous
        .get(MODULES_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 401);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'UNAUTHORIZED');
    });

    await t.test('GET modules com usuário não-admin retorna 403', async () => {
      const res = await userAgent
        .get(MODULES_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 403);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'FORBIDDEN');
    });

    await t.test('GET modules com admin retorna 200 e shape esperado', async () => {
      const res = await adminAgent
        .get(MODULES_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 200);
      assert.equal(res.body?.ok, true);
      assert.ok(Array.isArray(res.body?.modules), 'modules deve ser array');

      const ids = new Set((res.body?.modules || []).map((m) => m?.id));
      for (const expectedId of ['gestor', 'clinica', 'condominios', 'escalas', 'portal-morador']) {
        assert.equal(ids.has(expectedId), true, `modules deve conter id=${expectedId}`);
      }
    });

    await t.test('GET feedback sem sessão retorna 401', async () => {
      const res = await anonymous
        .get(FEEDBACK_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close');

      assert.equal(res.status, 401);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'UNAUTHORIZED');
    });

    await t.test('GET feedback autenticado retorna mapa e mantém defaults/alias', async () => {
      store.reset(baseRows);

      await withClockOffset(nextClockOffset(), async () => {
        await withWidgetSettingPatch({ find: store.find, updateOne: store.updateOne }, async () => {
          const mapRes = await masterAgent
            .get(FEEDBACK_ENDPOINT)
            .set('Accept', 'application/json')
            .set('Connection', 'close');

          assert.equal(mapRes.status, 200);
          assert.equal(mapRes.body?.ok, true);
          assert.ok(
            mapRes.body?.enabledByModule && typeof mapRes.body.enabledByModule === 'object',
            'enabledByModule deve ser objeto',
          );
          assert.equal(mapRes.body?.enabledByModule?.gestor, false);
          assert.equal(mapRes.body?.enabledByModule?.condominios, true);

          const aliasRes = await masterAgent
            .get(FEEDBACK_ENDPOINT)
            .query({ module: 'portal_morador' })
            .set('Accept', 'application/json')
            .set('Connection', 'close');

          assert.equal(aliasRes.status, 200);
          assert.equal(aliasRes.body?.ok, true);
          assert.equal(aliasRes.body?.module, 'portal-morador');
          assert.equal(aliasRes.body?.enabled, false);

          const unknownRes = await masterAgent
            .get(FEEDBACK_ENDPOINT)
            .query({ module: 'modulo-inexistente' })
            .set('Accept', 'application/json')
            .set('Connection', 'close');

          assert.equal(unknownRes.status, 200);
          assert.equal(unknownRes.body?.ok, true);
          assert.equal(unknownRes.body?.module, 'modulo-inexistente');
          assert.equal(unknownRes.body?.enabled, true);
        });
      });
    });

    await t.test('GET feedback com falha interna retorna 500', async () => {
      await withClockOffset(nextClockOffset(), async () => {
        await withWidgetSettingPatch(
          {
            find() {
              throw new Error('FORCED_WIDGET_FIND_FAILURE');
            },
            updateOne: store.updateOne,
          },
          async () => {
            const res = await masterAgent
              .get(FEEDBACK_ENDPOINT)
              .set('Accept', 'application/json')
              .set('Connection', 'close');

            assert.equal(res.status, 500);
            assert.equal(res.body?.ok, false);
            assert.equal(typeof res.body?.error, 'string');
          },
        );
      });
    });

    await t.test('PUT feedback sem sessão retorna 401', async () => {
      const res = await anonymous
        .put(FEEDBACK_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ module: 'gestor', enabled: false });

      assert.equal(res.status, 401);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'UNAUTHORIZED');
    });

    await t.test('PUT feedback com usuário não-admin retorna 403', async () => {
      const res = await userAgent
        .put(FEEDBACK_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ module: 'gestor', enabled: false });

      assert.equal(res.status, 403);
      assert.equal(res.body?.success, false);
      assert.equal(res.body?.code, 'FORBIDDEN');
    });

    await t.test('PUT feedback sem module retorna 400', async () => {
      const res = await adminAgent
        .put(FEEDBACK_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ enabled: true });

      assert.equal(res.status, 400);
      assert.equal(res.body?.ok, false);
      assert.equal(res.body?.error, 'Módulo inválido.');
    });

    await t.test('PUT feedback com module não reconhecido retorna 400', async () => {
      const res = await adminAgent
        .put(FEEDBACK_ENDPOINT)
        .set('Accept', 'application/json')
        .set('Connection', 'close')
        .send({ module: 'modulo-inexistente', enabled: true });

      assert.equal(res.status, 400);
      assert.equal(res.body?.ok, false);
      assert.equal(res.body?.error, 'Módulo não reconhecido.');
    });

    await t.test('PUT feedback com alias portal_morador e enabled="false" mantém coerção atual', async () => {
      store.reset(baseRows);

      await withClockOffset(nextClockOffset(), async () => {
        await withWidgetSettingPatch({ find: store.find, updateOne: store.updateOne }, async () => {
          const res = await adminAgent
            .put(FEEDBACK_ENDPOINT)
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send({ module: 'portal_morador', enabled: 'false' });

          assert.equal(res.status, 200);
          assert.equal(res.body?.ok, true);
          assert.ok(
            res.body?.enabledByModule && typeof res.body.enabledByModule === 'object',
            'enabledByModule deve ser objeto',
          );
          assert.equal(res.body?.enabledByModule?.['portal-morador'], true);

          const saved = store.getRows().find((row) => row.widget === 'feedback' && row.module === 'portal-morador');
          assert.equal(saved?.enabled, true);
        });
      });
    });

    await t.test('PUT feedback com falha interna retorna 500', async () => {
      await withWidgetSettingPatch(
        {
          find: store.find,
          updateOne: async () => {
            throw new Error('FORCED_WIDGET_UPDATE_FAILURE');
          },
        },
        async () => {
          const res = await masterAgent
            .put(FEEDBACK_ENDPOINT)
            .set('Accept', 'application/json')
            .set('Connection', 'close')
            .send({ module: 'gestor', enabled: true });

          assert.equal(res.status, 500);
          assert.equal(res.body?.ok, false);
          assert.equal(typeof res.body?.error, 'string');
        },
      );
    });
  } finally {
    try {
      await closeWithTeardownGuard(close, teardownGuard);
    } finally {
      await teardownGuard.remove();
    }
  }
});
