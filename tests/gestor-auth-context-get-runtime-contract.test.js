import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';

import buildGestorApp from '#modules/gestor/app/gestor-app.js';
import { getAuthContext } from '#modules/gestor/app/controllers/authController.js';

function createReq({
  user = null,
  sessionUser = null,
  storedAuthContext = null,
  featureFlags = null,
  deps = undefined,
  maxTimeMS = 4321,
} = {}) {
  const session = {};
  if (sessionUser) session.user = sessionUser;
  if (storedAuthContext) session.gestorAuthContext = storedAuthContext;

  return {
    user,
    session: Object.keys(session).length ? session : undefined,
    app: {
      locals: {
        gestorAuthContextFeatureFlags: featureFlags,
        gestorAuthContextResolverDeps: deps,
        gestorAuthContextMaxTimeMS: maxTimeMS,
      },
    },
  };
}

function createRes() {
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

async function invokeOwner(options = {}) {
  const req = createReq(options);
  const res = createRes();
  await getAuthContext(req, res);
  return { statusCode: res.statusCode, body: res.payload };
}

async function requestGestorApp(pathname, { configureApp } = {}) {
  const app = buildGestorApp();
  const previousFlags = app.locals.gestorAuthContextFeatureFlags;
  const previousDeps = app.locals.gestorAuthContextResolverDeps;
  const previousMaxTimeMS = app.locals.gestorAuthContextMaxTimeMS;

  if (typeof configureApp === 'function') {
    configureApp(app);
  }

  const mountedApp = express();
  mountedApp.use('/gestor', app);

  const server = createServer(mountedApp);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { statusCode: response.status, body };
  } finally {
    app.locals.gestorAuthContextFeatureFlags = previousFlags;
    app.locals.gestorAuthContextResolverDeps = previousDeps;
    app.locals.gestorAuthContextMaxTimeMS = previousMaxTimeMS;
    server.close();
    await once(server, 'close');
  }
}

test('GET /gestor/auth/context sem sessao responde 401 legado no app real', async () => {
  const response = await requestGestorApp('/gestor/auth/context', {
    configureApp(targetApp) {
      targetApp.locals.gestorAuthContextFeatureFlags = {
        gestor_auth_context_resolver: false,
      };
      targetApp.locals.gestorAuthContextResolverDeps = undefined;
      targetApp.locals.gestorAuthContextMaxTimeMS = 4321;
    },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    ok: false,
    authenticated: false,
    source: 'legacy',
    identity: {
      id: null,
      email: '',
      nome: null,
      authenticated: false,
    },
    globalRole: null,
    membershipCount: 0,
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
  });
});

test('getAuthContext projeta contexto legado com membership derivada da sessao', async () => {
  const response = await invokeOwner({
    featureFlags: {
      gestor_auth_context_resolver: false,
    },
    sessionUser: {
      id: 'user-legacy-1',
      email: 'diretor@gestor.test',
      nome: 'Diretora Legacy',
      role: 'diretor',
      unidade_id: '507f191e810c19729de860ea',
      unidade_principal_id: '507f191e810c19729de860eb',
      funcionario_id: 'func-legacy-1',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authenticated: true,
    source: 'legacy',
    identity: {
      id: 'user-legacy-1',
      email: 'diretor@gestor.test',
      nome: 'Diretora Legacy',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 1,
    memberships: [
      {
        membershipId: 'legacy-active-context',
        unidadeId: '507f191e810c19729de860ea',
        unidadePrincipalId: '507f191e810c19729de860eb',
        unidadeNome: null,
        unidadeCodigo: null,
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
    ],
    needsUnitSelection: false,
    activeContext: {
      membershipId: 'legacy-active-context',
      unidadeId: '507f191e810c19729de860ea',
      unidadePrincipalId: '507f191e810c19729de860eb',
      papelContextual: 'gestor',
      funcionarioId: 'func-legacy-1',
      legacyRole: 'diretor',
    },
    effectiveRole: 'diretor',
  });
});

test('getAuthContext em auth-context-v1 com global_role retorna contexto global sem memberships', async () => {
  const response = await invokeOwner({
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    sessionUser: {
      id: 'user-master-1',
      email: 'master@gestor.test',
      nome: 'Master Gestor',
      global_role: 'master',
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        throw new Error('nao-deveria-carregar-memberships');
      },
      async loadUnidadeById() {
        throw new Error('nao-deveria-carregar-unidades');
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: 'user-master-1',
      email: 'master@gestor.test',
      nome: 'Master Gestor',
      authenticated: true,
    },
    globalRole: 'master',
    membershipCount: 0,
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: 'master',
  });
});

test('getAuthContext em auth-context-v1 sem selecao ativa expõe needsUnitSelection true', async () => {
  const userId = '507f1f77bcf86cd799439001';
  const unidadePrincipalId = '507f191e810c19729de860aa';
  const unidadeFilialId = '507f191e810c19729de860ab';
  const outraUnidadeId = '507f191e810c19729de860ac';

  const response = await invokeOwner({
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    sessionUser: {
      id: userId,
      email: 'multi@gestor.test',
      nome: 'Usuario Multi',
    },
    deps: {
      async loadActiveMembershipsByUserId({ userId: requestedUserId, maxTimeMS }) {
        assert.equal(requestedUserId, userId);
        assert.equal(maxTimeMS, 4321);
        return [
          {
            _id: '507f1f77bcf86cd799439011',
            user_id: userId,
            unidade_id: unidadeFilialId,
            papel_contextual: 'gestor',
            funcionario_id: 'func-1',
          },
          {
            _id: '507f1f77bcf86cd799439012',
            user_id: userId,
            unidade_id: outraUnidadeId,
            papel_contextual: 'user',
            funcionario_id: 'func-2',
          },
        ];
      },
      async loadUnidadeById({ unidadeId }) {
        if (unidadeId === unidadeFilialId) {
          return {
            _id: unidadeFilialId,
            nome: 'Filial Norte',
            codigo: 'FN01',
            is_principal: false,
            unidade_principal_id: unidadePrincipalId,
          };
        }
        if (unidadeId === outraUnidadeId) {
          return {
            _id: outraUnidadeId,
            nome: 'Operacao Sul',
            codigo: 'OS02',
            is_principal: true,
            unidade_principal_id: null,
          };
        }
        throw new Error(`unidade inesperada: ${unidadeId}`);
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'multi@gestor.test',
      nome: 'Usuario Multi',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439011',
        unidadeId: unidadeFilialId,
        unidadePrincipalId: unidadePrincipalId,
        unidadeNome: 'Filial Norte',
        unidadeCodigo: 'FN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        membershipId: '507f1f77bcf86cd799439012',
        unidadeId: outraUnidadeId,
        unidadePrincipalId: outraUnidadeId,
        unidadeNome: 'Operacao Sul',
        unidadeCodigo: 'OS02',
        papelContextual: 'user',
        legacyRole: 'user',
      },
    ],
    needsUnitSelection: true,
    activeContext: null,
    effectiveRole: null,
  });
});

test('getAuthContext em auth-context-v1 respeita active_unidade_id armazenada e projeta activeContext', async () => {
  const userId = '507f1f77bcf86cd799439021';
  const unidadePrincipalId = '507f191e810c19729de860ba';
  const unidadeFilialId = '507f191e810c19729de860bb';
  const outraUnidadeId = '507f191e810c19729de860bc';

  const response = await invokeOwner({
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    sessionUser: {
      id: userId,
      email: 'selecionado@gestor.test',
      nome: 'Usuario Selecionado',
    },
    storedAuthContext: {
      active_unidade_id: outraUnidadeId,
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        return [
          {
            _id: '507f1f77bcf86cd799439031',
            user_id: userId,
            unidade_id: unidadeFilialId,
            papel_contextual: 'gestor',
            funcionario_id: 'func-31',
          },
          {
            _id: '507f1f77bcf86cd799439032',
            user_id: userId,
            unidade_id: outraUnidadeId,
            papel_contextual: 'user',
            funcionario_id: 'func-32',
          },
        ];
      },
      async loadUnidadeById({ unidadeId }) {
        if (unidadeId === unidadeFilialId) {
          return {
            _id: unidadeFilialId,
            nome: 'Filial Leste',
            codigo: 'FL01',
            is_principal: false,
            unidade_principal_id: unidadePrincipalId,
          };
        }
        if (unidadeId === outraUnidadeId) {
          return {
            _id: outraUnidadeId,
            nome: 'Base Oeste',
            codigo: 'BO02',
            is_principal: true,
            unidade_principal_id: null,
          };
        }
        throw new Error(`unidade inesperada: ${unidadeId}`);
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'selecionado@gestor.test',
      nome: 'Usuario Selecionado',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439031',
        unidadeId: unidadeFilialId,
        unidadePrincipalId: unidadePrincipalId,
        unidadeNome: 'Filial Leste',
        unidadeCodigo: 'FL01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        membershipId: '507f1f77bcf86cd799439032',
        unidadeId: outraUnidadeId,
        unidadePrincipalId: outraUnidadeId,
        unidadeNome: 'Base Oeste',
        unidadeCodigo: 'BO02',
        papelContextual: 'user',
        legacyRole: 'user',
      },
    ],
    needsUnitSelection: false,
    activeContext: {
      membershipId: '507f1f77bcf86cd799439032',
      unidadeId: outraUnidadeId,
      unidadePrincipalId: outraUnidadeId,
      papelContextual: 'user',
      funcionarioId: 'func-32',
      legacyRole: 'user',
    },
    effectiveRole: 'user',
  });
});

test('getAuthContext responde 500 com payload reduzido quando o resolvedor falha', async () => {
  const response = await invokeOwner({
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    sessionUser: {
      id: '507f1f77bcf86cd799439041',
      email: 'erro@gestor.test',
      nome: 'Usuario Erro',
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        throw new Error('forced-auth-context-get-failure');
      },
      async loadUnidadeById() {
        throw new Error('nao-deveria-ser-chamado');
      },
    },
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    ok: false,
    authenticated: false,
    source: 'legacy',
    identity: {
      id: null,
      email: '',
      nome: null,
      authenticated: false,
    },
    globalRole: null,
    membershipCount: 0,
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
    code: 'GESTOR_AUTH_CONTEXT_ERROR',
  });
});