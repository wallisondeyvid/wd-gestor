import test from 'node:test';
import assert from 'node:assert/strict';

import { requireRole } from '../src/modules/gestor/app/middlewares/requireRole.js';

function mockRes() {
  const result = {
    statusCode: 200,
    jsonPayload: undefined,
    sendPayload: undefined,
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
  result.send = (payload) => {
    result.sendPayload = payload;
    return result;
  };
  result.redirect = (url) => {
    result.redirectUrl = url;
    return result;
  };

  return result;
}

async function runMw(middleware, req, res) {
  let nextCalled = false;
  const maybePromise = middleware(req, res, () => {
    nextCalled = true;
  });

  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  }

  return nextCalled;
}

function createReq({
  featureFlags = null,
  user = null,
  sessionUser = null,
  authContext = null,
  path = '/api/admin',
  originalUrl = '/gestor/api/admin',
  baseUrl = '/gestor',
  accept = 'application/json',
} = {}) {
  const req = {
    path,
    originalUrl,
    baseUrl,
    headers: { accept },
    app: { locals: {} },
    session: {},
  };

  if (featureFlags) {
    req.app.locals.gestorAuthContextFeatureFlags = featureFlags;
  }
  if (user) {
    req.user = { ...user };
  }
  if (sessionUser) {
    req.session.user = { ...sessionUser };
  }
  if (authContext) {
    req.session.gestorAuthContext = { ...authContext };
  }

  return req;
}

test('requireRole mantém o comportamento legado integral quando a flag está desligada', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: false },
    user: { role: 'user', isMaster: false },
    sessionUser: { id: 'u1', email: 'legacy@example.com', role: 'user' },
    authContext: { global_role: 'admin' },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.jsonPayload, { success: false, error: 'Acesso negado', code: 'FORBIDDEN' });
  assert.equal(req.user.role, 'user');
  assert.equal(req.user.isMaster, false);
});

test('requireRole usa globalRole do AuthContext quando a flag está ligada', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: { role: 'user', isMaster: false },
    sessionUser: { id: 'u1', email: 'admin@example.com', role: 'user' },
    authContext: { global_role: 'admin', needs_selection: false },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'admin');
  assert.equal(req.user.global_role, 'admin');
  assert.equal(req.user.isMaster, false);
});

test('requireRole usa o effectiveRole do AuthContext ativo quando a flag está ligada', async () => {
  const middleware = requireRole(['diretor']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    sessionUser: { id: 'u1', email: 'gestor@example.com', role: 'user' },
    authContext: {
      active_membership_id: 'mem1',
      active_unidade_id: 'uni1',
      legacy_role: 'diretor',
      needs_selection: false,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'diretor');
  assert.equal(req.user.isMaster, false);
});

test('requireRole prioriza o contexto canônico ativo ao sincronizar o shape legado', async () => {
  const middleware = requireRole(['diretor']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'gestor@example.com',
      role: 'user',
      isMaster: false,
      unidade_id: 'req-legacy-unit',
      unidade_principal_id: 'req-legacy-principal',
      funcionario_id: 'req-legacy-funcionario',
    },
    sessionUser: {
      id: 'u1',
      email: 'gestor@example.com',
      role: 'user',
      unidade_id: 'session-legacy-unit',
      unidade_principal_id: 'session-legacy-principal',
      funcionario_id: 'session-legacy-funcionario',
    },
    authContext: {
      needs_selection: false,
      active_membership_id: 'mem1',
      active_unidade_id: 'unit-canonical',
      active_unidade_principal_id: 'principal-canonical',
      active_funcionario_id: 'funcionario-canonico',
      legacy_role: 'diretor',
      effectiveRole: 'diretor',
      activeContext: {
        membershipId: 'mem1',
        unidadeId: 'unit-canonical',
        unidadePrincipalId: 'principal-canonical',
        funcionarioId: 'funcionario-canonico',
        legacyRole: 'diretor',
      },
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'diretor');
  assert.equal(req.user.global_role, null);
  assert.equal(req.user.isMaster, false);
  assert.equal(req.user.unidade_id, 'unit-canonical');
  assert.equal(req.user.unidade_principal_id, 'principal-canonical');
  assert.equal(req.user.funcionario_id, 'funcionario-canonico');
  assert.equal(req.session.user.role, 'diretor');
  assert.equal(req.session.user.global_role, null);
  assert.equal(req.session.user.unidade_id, 'unit-canonical');
  assert.equal(req.session.user.unidade_principal_id, 'principal-canonical');
  assert.equal(req.session.user.funcionario_id, 'funcionario-canonico');
  assert.equal(req.session.user.auth_version, 'phase3');
});

test('requireRole limpa unidade legacy residual quando o auth-context v1 global ja e autoritativo', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'admin@example.com',
      role: 'user',
      isMaster: false,
      unidade_id: 'req-legacy-unit',
      unidade_principal_id: 'req-legacy-principal',
      funcionario_id: 'req-legacy-funcionario',
    },
    sessionUser: {
      id: 'u1',
      email: 'admin@example.com',
      role: 'user',
      unidade_id: 'session-legacy-unit',
      unidade_principal_id: 'session-legacy-principal',
      funcionario_id: 'session-legacy-funcionario',
    },
    authContext: {
      source: 'auth-context-v1',
      needs_selection: false,
      global_role: 'admin',
      active_membership_id: null,
      active_unidade_id: null,
      active_unidade_principal_id: null,
      active_funcionario_id: null,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'admin');
  assert.equal(req.user.global_role, 'admin');
  assert.equal(req.user.unidade_id, null);
  assert.equal(req.user.unidade_principal_id, null);
  assert.equal(req.user.funcionario_id, null);
  assert.equal(req.session.user.unidade_id, null);
  assert.equal(req.session.user.unidade_principal_id, null);
  assert.equal(req.session.user.funcionario_id, null);
});

test('requireRole nao herda papel legado residual quando o auth-context v1 neutro ja e autoritativo', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'stale-admin@example.com',
      role: 'admin',
      isMaster: false,
      unidade_id: 'req-legacy-unit',
      unidade_principal_id: 'req-legacy-principal',
      funcionario_id: 'req-legacy-funcionario',
    },
    sessionUser: {
      id: 'u1',
      email: 'stale-admin@example.com',
      role: 'admin',
      unidade_id: 'session-legacy-unit',
      unidade_principal_id: 'session-legacy-principal',
      funcionario_id: 'session-legacy-funcionario',
    },
    authContext: {
      source: 'auth-context-v1',
      authenticated: true,
      needs_selection: false,
      global_role: null,
      globalRole: null,
      effectiveRole: null,
      active_membership_id: null,
      active_unidade_id: null,
      active_unidade_principal_id: null,
      active_funcionario_id: null,
      activeContext: null,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.jsonPayload, { success: false, error: 'Acesso negado', code: 'FORBIDDEN' });
  assert.equal(req.user.role, null);
  assert.equal(req.user.global_role, null);
  assert.equal(req.user.unidade_id, null);
  assert.equal(req.user.unidade_principal_id, null);
  assert.equal(req.user.funcionario_id, null);
  assert.equal(req.session.user.role, null);
  assert.equal(req.session.user.global_role, null);
  assert.equal(req.session.user.unidade_id, null);
  assert.equal(req.session.user.unidade_principal_id, null);
  assert.equal(req.session.user.funcionario_id, null);
  assert.equal(req.session.user.auth_version, 'phase3');
});

test('requireRole nao herda unidade legada quando ja existe projecao phase3 com auth-context sem contexto ativo', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'admin@example.com',
      role: 'user',
      isMaster: false,
      unidade_id: 'req-legacy-unit',
      unidade_principal_id: 'req-legacy-principal',
      funcionario_id: 'req-legacy-funcionario',
    },
    sessionUser: {
      id: 'u1',
      email: 'admin@example.com',
      role: 'user',
      global_role: null,
      unidade_id: 'session-legacy-unit',
      unidade_principal_id: 'session-legacy-principal',
      funcionario_id: 'session-legacy-funcionario',
      auth_version: 'phase3',
    },
    authContext: {
      authenticated: true,
      needs_selection: false,
      global_role: 'admin',
      globalRole: 'admin',
      effectiveRole: 'admin',
      active_membership_id: null,
      active_unidade_id: null,
      active_unidade_principal_id: null,
      active_funcionario_id: null,
      activeContext: null,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'admin');
  assert.equal(req.user.global_role, 'admin');
  assert.equal(req.user.unidade_id, null);
  assert.equal(req.user.unidade_principal_id, null);
  assert.equal(req.user.funcionario_id, null);
  assert.equal(req.session.user.role, 'admin');
  assert.equal(req.session.user.global_role, 'admin');
  assert.equal(req.session.user.unidade_id, null);
  assert.equal(req.session.user.unidade_principal_id, null);
  assert.equal(req.session.user.funcionario_id, null);
  assert.equal(req.session.user.auth_version, 'phase3');
});

test('requireRole com a flag ligada continua aceitando o shape legado quando não há AuthContext salvo', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: { role: 'admin', isMaster: false },
    sessionUser: { id: 'u1', email: 'admin@example.com', role: 'admin' },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'admin');
});

test('requireRole retorna 409 funcional para API quando a seleção de unidade está pendente', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: { role: 'user', isMaster: false },
    sessionUser: { id: 'u1', email: 'pending@example.com', role: 'user' },
    authContext: {
      needs_selection: true,
      active_membership_id: null,
      active_unidade_id: null,
      global_role: null,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    authenticated: true,
    error: 'Seleção de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  });
});

test('requireRole redireciona páginas HTML para seleção quando o contexto está pendente', async () => {
  const middleware = requireRole(['admin']);
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    sessionUser: { id: 'u1', email: 'pending@example.com', role: 'user' },
    authContext: {
      needs_selection: true,
      active_membership_id: null,
      active_unidade_id: null,
      global_role: null,
    },
    path: '/usuarios',
    originalUrl: '/gestor/usuarios',
    accept: 'text/html',
  });
  const res = mockRes();

  const nextCalled = await runMw(middleware, req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.redirectUrl, '/gestor/login?step=select');
});