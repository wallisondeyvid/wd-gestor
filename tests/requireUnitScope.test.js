import test from 'node:test';
import assert from 'node:assert/strict';

import { requireUnitScope } from '../src/modules/gestor/app/middlewares/requireUnitScope.js';

function mockRes() {
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

function withMultiTenantEnforced(run) {
  const previous = process.env.WDG_MULTI_TENANT;
  process.env.WDG_MULTI_TENANT = '1';

  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.WDG_MULTI_TENANT;
    else process.env.WDG_MULTI_TENANT = previous;
  }
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
  query = undefined,
  params = undefined,
  body = undefined,
  path = '/api/recursos',
  originalUrl = '/gestor/api/recursos',
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
    query: query || {},
    params: params || {},
    body: body || {},
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

test('requireUnitScope mantém o comportamento legado integral quando a flag está desligada', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: false },
    user: {
      id: 'u1',
      email: 'legacy@example.com',
      unidade_id: '000000000000000000000001',
    },
    query: {
      unidadeId: '000000000000000000000010',
    },
    authContext: {
      active_unidade_id: '000000000000000000000099',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: '000000000000000000000001',
  });
});

test('requireUnitScope retorna 409 funcional para API quando a seleção de unidade está pendente', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'pending@example.com',
    },
    authContext: {
      needs_selection: true,
      active_membership_id: null,
      active_unidade_id: null,
      global_role: null,
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(requireUnitScope, req, res);

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

test('requireUnitScope redireciona páginas HTML para seleção quando o contexto está pendente', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'pending@example.com',
    },
    authContext: {
      needs_selection: true,
      active_membership_id: null,
      active_unidade_id: null,
      global_role: null,
    },
    path: '/recursos',
    originalUrl: '/gestor/recursos',
    accept: 'text/html',
  });
  const res = mockRes();

  const nextCalled = await runMw(requireUnitScope, req, res);

  assert.equal(nextCalled, false);
  assert.equal(res.redirectUrl, '/gestor/login?step=select');
});

test('requireUnitScope usa a unidade ativa do AuthContext e ignora query body e params quando a flag está ligada', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'gestor@example.com',
      unidade_id: '000000000000000000000001',
      unidade_principal_id: '000000000000000000000002',
    },
    authContext: {
      active_membership_id: 'mem1',
      active_unidade_id: '000000000000000000000020',
      active_unidade_principal_id: '000000000000000000000021',
      needs_selection: false,
    },
    query: {
      unidadeId: '000000000000000000000010',
    },
    params: {
      unidadeId: '000000000000000000000011',
    },
    body: {
      unidade_id: '000000000000000000000012',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: '000000000000000000000020',
  });
});

test('requireUnitScope não usa matriz_unidade_id sozinha no fallback legado autenticado', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'matriz-only@example.com',
      role: 'diretor',
      matriz_unidade_id: '000000000000000000000031',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    error: 'UNIDADE_ID_REQUIRED',
  });
});

test('requireUnitScope continua priorizando unidade_principal_id no fallback legado autenticado', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'principal@example.com',
      role: 'diretor',
      matriz_unidade_id: '000000000000000000000031',
      unidade_principal_id: '000000000000000000000032',
      unidade_id: '000000000000000000000033',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: '000000000000000000000032',
  });
});

test('requireUnitScope continua usando unidade_id quando unidade_principal_id não existe', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'unit-only@example.com',
      role: 'diretor',
      matriz_unidade_id: '000000000000000000000031',
      unidade_id: '000000000000000000000033',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: '000000000000000000000033',
  });
});

test('requireUnitScope sem usuário não aceita unidadeId explícito quando multi-tenant está enforced', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    query: {
      unidadeId: '000000000000000000000030',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    error: 'UNIDADE_ID_REQUIRED',
  });
});

test('requireUnitScope sem usuário segue com unitScope nulo quando enforcement está desligado', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    query: {
      unidadeId: '000000000000000000000030',
    },
  });
  const res = mockRes();

  const nextCalled = await runMw(requireUnitScope, req, res);

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'global',
    unidadeId: null,
  });
});

test('requireUnitScope com a flag ligada continua aceitando unidadeId explícito quando não há contexto ativo', async () => {
  const req = createReq({
    featureFlags: { gestor_auth_context_resolver: true },
    user: {
      id: 'u1',
      email: 'admin@example.com',
      role: 'admin',
    },
    authContext: {
      global_role: 'admin',
      needs_selection: false,
    },
    query: {
      unidadeId: '000000000000000000000030',
    },
  });
  const res = mockRes();

  const nextCalled = await withMultiTenantEnforced(() => runMw(requireUnitScope, req, res));

  assert.equal(nextCalled, true);
  assert.deepEqual(req.unitScope, {
    type: 'unit',
    unidadeId: '000000000000000000000030',
  });
});