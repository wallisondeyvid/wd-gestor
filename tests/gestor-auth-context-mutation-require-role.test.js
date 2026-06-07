import test from 'node:test';
import assert from 'node:assert/strict';

import { selectAuthUnit, switchAuthUnit } from '#modules/gestor/app/controllers/authController.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';

function createSession() {
  return {
    save(callback) {
      if (typeof callback === 'function') callback();
    },
  };
}

function createControllerRes() {
  let statusCode = 200;
  let payload;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };
}

function createRequireRoleRes() {
  const result = {
    statusCode: 200,
    jsonPayload: undefined,
    redirectUrl: null,
  };

  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (payload) => {
    result.jsonPayload = payload;
    return result;
  };
  result.redirect = (url) => {
    result.redirectUrl = url;
    return result;
  };

  return result;
}

async function runRequireRole(middleware, req, res) {
  let nextCalled = false;
  const maybePromise = middleware(req, res, () => {
    nextCalled = true;
  });

  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  }

  return nextCalled;
}

function createMutationDeps({ userId, firstUnitId, selectedUnitId, firstRole = 'gestor', selectedRole = 'user' }) {
  return {
    async loadActiveMembershipsByUserId({ userId: requestedUserId, maxTimeMS }) {
      assert.equal(requestedUserId, userId);
      assert.equal(maxTimeMS, 4321);
      return [
        {
          _id: '507f1f77bcf86cd799439901',
          user_id: userId,
          unidade_id: firstUnitId,
          papel_contextual: firstRole,
          funcionario_id: 'func-901',
        },
        {
          _id: '507f1f77bcf86cd799439902',
          user_id: userId,
          unidade_id: selectedUnitId,
          papel_contextual: selectedRole,
          funcionario_id: 'func-902',
        },
      ];
    },
    async loadUnidadeById({ unidadeId }) {
      if (unidadeId === firstUnitId) {
        return {
          _id: firstUnitId,
          nome: 'Filial Norte',
          codigo: 'FN01',
          is_principal: false,
          unidade_principal_id: '507f191e810c19729de860ff',
        };
      }
      if (unidadeId === selectedUnitId) {
        return {
          _id: selectedUnitId,
          nome: 'Base Sul',
          codigo: 'BS02',
          is_principal: true,
          unidade_principal_id: null,
        };
      }
      throw new Error(`unidade inesperada: ${unidadeId}`);
    },
  };
}

test('selectAuthUnit seguido de requireRole aceita authContext canonico persistido em sessao', async () => {
  const userId = '507f1f77bcf86cd799439801';
  const firstUnitId = '507f191e810c19729de860ea';
  const selectedUnitId = '507f191e810c19729de860eb';
  const session = createSession();
  session.user = {
    id: userId,
    email: 'selecionar@gestor.test',
    nome: 'Usuario Selecionar',
    role: 'diretor',
    unidade_id: firstUnitId,
    unidade_principal_id: '507f191e810c19729de860ff',
    funcionario_id: 'func-801',
  };

  const mutationReq = {
    body: { unidade_id: selectedUnitId },
    session,
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
        gestorAuthContextResolverDeps: createMutationDeps({ userId, firstUnitId, selectedUnitId }),
        gestorAuthContextMaxTimeMS: 4321,
      },
    },
  };
  const mutationRes = createControllerRes();

  await selectAuthUnit(mutationReq, mutationRes);

  assert.equal(mutationRes.statusCode, 200);
  assert.equal(mutationRes.payload.source, 'auth-context-v1');
  assert.equal(session.user.auth_version, 'phase3');
  assert.deepEqual(session.gestorAuthContext, {
    source: 'auth-context-v1',
    user_id: userId,
    user_email: 'selecionar@gestor.test',
    global_role: null,
    active_membership_id: '507f1f77bcf86cd799439902',
    active_unidade_id: selectedUnitId,
    active_unidade_principal_id: selectedUnitId,
    active_papel_contextual: 'user',
    active_funcionario_id: 'func-902',
    legacy_role: 'user',
    needs_selection: false,
  });

  const middleware = requireRole(['user']);
  const roleReq = {
    path: '/api/admin',
    originalUrl: '/gestor/api/admin',
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
      },
    },
    session,
  };
  const roleRes = createRequireRoleRes();

  const nextCalled = await runRequireRole(middleware, roleReq, roleRes);

  assert.equal(nextCalled, true);
  assert.equal(roleRes.statusCode, 200);
  assert.equal(roleRes.jsonPayload, undefined);
  assert.equal(roleReq.user.role, 'user');
  assert.equal(roleReq.user.unidade_id, selectedUnitId);
  assert.equal(roleReq.user.funcionario_id, 'func-902');
});

test('switchAuthUnit seguido de requireRole aceita authContext canonico persistido em sessao', async () => {
  const userId = '507f1f77bcf86cd799439811';
  const firstUnitId = '507f191e810c19729de860fa';
  const selectedUnitId = '507f191e810c19729de860fb';
  const session = createSession();
  session.user = {
    id: userId,
    email: 'switch@gestor.test',
    nome: 'Usuario Switch',
    role: 'diretor',
    unidade_id: firstUnitId,
    unidade_principal_id: '507f191e810c19729de860ef',
    funcionario_id: 'func-811',
  };
  session.gestorAuthContext = {
    active_unidade_id: firstUnitId,
  };

  const mutationReq = {
    body: { unidade_id: selectedUnitId },
    session,
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
        gestorAuthContextResolverDeps: createMutationDeps({ userId, firstUnitId, selectedUnitId }),
        gestorAuthContextMaxTimeMS: 4321,
      },
    },
  };
  const mutationRes = createControllerRes();

  await switchAuthUnit(mutationReq, mutationRes);

  assert.equal(mutationRes.statusCode, 200);
  assert.equal(mutationRes.payload.source, 'auth-context-v1');
  assert.equal(session.user.auth_version, 'phase3');
  assert.deepEqual(session.gestorAuthContext, {
    source: 'auth-context-v1',
    user_id: userId,
    user_email: 'switch@gestor.test',
    global_role: null,
    active_unidade_id: selectedUnitId,
    active_membership_id: '507f1f77bcf86cd799439902',
    active_unidade_principal_id: selectedUnitId,
    active_papel_contextual: 'user',
    active_funcionario_id: 'func-902',
    legacy_role: 'user',
    needs_selection: false,
  });

  const middleware = requireRole(['user']);
  const roleReq = {
    path: '/api/admin',
    originalUrl: '/gestor/api/admin',
    baseUrl: '/gestor',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: true },
      },
    },
    session,
  };
  const roleRes = createRequireRoleRes();

  const nextCalled = await runRequireRole(middleware, roleReq, roleRes);

  assert.equal(nextCalled, true);
  assert.equal(roleRes.statusCode, 200);
  assert.equal(roleRes.jsonPayload, undefined);
  assert.equal(roleReq.user.role, 'user');
  assert.equal(roleReq.user.unidade_id, selectedUnitId);
  assert.equal(roleReq.user.funcionario_id, 'func-902');
});

// ─── requireUnitScope: fallback legacy via req.user.unidade_id ───────────────
// Cobre o bug 400 UNIDADE_ID_REQUIRED após switch-unit legacy.
// ─────────────────────────────────────────────────────────────────────────────

async function _runRusProbe({ userOverride, flagEnabled = false } = {}) {
  const { createServer: _rusCS } = await import('node:http');
  const { once: _rusOC } = await import('node:events');
  const { default: _rusExpress } = await import('express');
  const { requireUnitScope: _rusMiddleware } = await import(
    '#modules/gestor/app/middlewares/requireUnitScope.js'
  );
  const app = _rusExpress();
  app.use(_rusExpress.json());
  app.use((req, _r, n) => {
    req.app.locals = req.app.locals || {};
    req.app.locals.gestorAuthContextFeatureFlags = { gestor_auth_context_resolver: flagEnabled };
    n();
  });
  app.get('/probe', (req, _r, n) => {
    req.user = { ...userOverride };
    req.session = {};
    n();
  }, _rusMiddleware, (req, res) => res.json({ ok: true, unidadeId: req.unitScope?.unidadeId }));
  const server = _rusCS(app);
  server.listen(0, '127.0.0.1');
  await _rusOC(server, 'listening');
  const { port } = server.address();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/probe`);
    const b = await r.json().catch(() => ({}));
    return { status: r.status, body: b };
  } finally { server.close(); await _rusOC(server, 'close'); }
}

test('requireUnitScope legacy: master com req.user.unidade_id passa sem unidade_id no query', async () => {
  const uid = '65f300000000000000000022';
  const { status, body } = await _runRusProbe({
    userOverride: { role: 'master', isMaster: true, unidade_id: uid },
    flagEnabled: false,
  });
  assert.equal(status, 200, `status=${status} body=${JSON.stringify(body)}`);
  assert.equal(body.unidadeId, uid);
});

test('requireUnitScope legacy: admin com req.user.unidade_id passa sem unidade_id no query', async () => {
  const uid = '65f300000000000000000033';
  const { status, body } = await _runRusProbe({
    userOverride: { role: 'admin', isMaster: false, global_role: 'admin', unidade_id: uid },
    flagEnabled: false,
  });
  assert.equal(status, 200, `status=${status} body=${JSON.stringify(body)}`);
  assert.equal(body.unidadeId, uid);
});

test('requireUnitScope legacy: master sem unidade em req.user sem query retorna 400', async () => {
  const { status, body } = await _runRusProbe({
    userOverride: { role: 'master', isMaster: true, unidade_id: null },
    flagEnabled: false,
  });
  assert.equal(status, 400, `status=${status}`);
  assert.equal(body.error, 'UNIDADE_ID_REQUIRED');
});

test('requireUnitScope legacy: diretor sem unidade continua recebendo 400', async () => {
  const { status, body } = await _runRusProbe({
    userOverride: { role: 'diretor', isMaster: false, unidade_id: null },
    flagEnabled: false,
  });
  assert.equal(status, 400, `status=${status}`);
  assert.equal(body.error, 'UNIDADE_ID_REQUIRED');
});

test('requireUnitScope legacy: usuario comum sem unidade continua recebendo 400', async () => {
  const { status, body } = await _runRusProbe({
    userOverride: { role: 'user', isMaster: false, unidade_id: null },
    flagEnabled: false,
  });
  assert.equal(status, 400, `status=${status}`);
  assert.equal(body.error, 'UNIDADE_ID_REQUIRED');
});