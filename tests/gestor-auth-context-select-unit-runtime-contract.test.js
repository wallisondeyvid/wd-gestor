import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';

import app from '#modules/gestor/app/gestor-app.js';
import { selectAuthUnit } from '#modules/gestor/app/controllers/authController.js';

function createReq({
  body = {},
  user = null,
  sessionUser = null,
  storedAuthContext = null,
  featureFlags = null,
  deps = undefined,
  maxTimeMS = 4321,
} = {}) {
  let saveCalls = 0;
  const session = {
    save(callback) {
      saveCalls += 1;
      if (typeof callback === 'function') callback();
    },
  };

  if (sessionUser) session.user = sessionUser;
  if (storedAuthContext) session.gestorAuthContext = storedAuthContext;

  const req = {
    body,
    user,
    session,
    app: {
      locals: {
        gestorAuthContextFeatureFlags: featureFlags,
        gestorAuthContextResolverDeps: deps,
        gestorAuthContextMaxTimeMS: maxTimeMS,
      },
    },
  };

  return {
    req,
    getSaveCalls() {
      return saveCalls;
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
  const { req, getSaveCalls } = createReq(options);
  const res = createRes();
  await selectAuthUnit(req, res);
  return {
    statusCode: res.statusCode,
    body: res.payload,
    session: req.session,
    saveCalls: getSaveCalls(),
  };
}

async function requestGestorApp(pathname, { method = 'POST', body, configureApp } = {}) {
  const previousFlags = app.locals.gestorAuthContextFeatureFlags;
  const previousDeps = app.locals.gestorAuthContextResolverDeps;
  const previousMaxTimeMS = app.locals.gestorAuthContextMaxTimeMS;

  if (typeof configureApp === 'function') configureApp(app);

  const mountedApp = express();
  mountedApp.use(express.json());
  mountedApp.use('/gestor', app);

  const server = createServer(mountedApp);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    return { statusCode: response.status, body: parsed };
  } finally {
    app.locals.gestorAuthContextFeatureFlags = previousFlags;
    app.locals.gestorAuthContextResolverDeps = previousDeps;
    app.locals.gestorAuthContextMaxTimeMS = previousMaxTimeMS;
    server.close();
    await once(server, 'close');
  }
}

test('POST /gestor/auth/select-unit sem sessao responde 401 no app real', async () => {
  const response = await requestGestorApp('/gestor/auth/select-unit', {
    body: { unidade_id: '507f191e810c19729de860ea' },
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
    code: 'GESTOR_UNAUTHORIZED',
  });
});

test('selectAuthUnit responde 400 para unidade_id ausente ou invalida', async () => {
  const response = await invokeOwner({
    body: { unidade_id: 'invalido' },
    sessionUser: {
      id: '507f1f77bcf86cd799439001',
      email: 'user@gestor.test',
      nome: 'Usuario Invalido',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    ok: false,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: '507f1f77bcf86cd799439001',
      email: 'user@gestor.test',
      nome: 'Usuario Invalido',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 0,
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
    code: 'GESTOR_INVALID_UNIDADE_ID',
  });
});

test('selectAuthUnit responde 409 quando o resolvedor esta desligado', async () => {
  const response = await invokeOwner({
    body: { unidade_id: '507f191e810c19729de860ea' },
    sessionUser: {
      id: 'user-legacy-1',
      email: 'diretor@gestor.test',
      nome: 'Diretora Legacy',
      role: 'diretor',
      unidade_id: '507f191e810c19729de860ea',
      unidade_principal_id: '507f191e810c19729de860eb',
      funcionario_id: 'func-legacy-1',
    },
    featureFlags: {
      gestor_auth_context_resolver: false,
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    ok: false,
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
    code: 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED',
  });
});

test('selectAuthUnit responde 409 quando nao ha selecao pendente', async () => {
  const unidadeId = '507f191e810c19729de860ca';
  const response = await invokeOwner({
    body: { unidade_id: unidadeId },
    sessionUser: {
      id: '507f1f77bcf86cd799439101',
      email: 'single@gestor.test',
      nome: 'Usuario Single',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        return [
          {
            _id: '507f1f77bcf86cd799439102',
            user_id: '507f1f77bcf86cd799439101',
            unidade_id: unidadeId,
            papel_contextual: 'gestor',
            funcionario_id: 'func-102',
          },
        ];
      },
      async loadUnidadeById() {
        return {
          _id: unidadeId,
          nome: 'Unica',
          codigo: 'UN01',
          is_principal: true,
          unidade_principal_id: null,
        };
      },
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    ok: false,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: '507f1f77bcf86cd799439101',
      email: 'single@gestor.test',
      nome: 'Usuario Single',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 1,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439102',
        unidadeId: unidadeId,
        unidadePrincipalId: unidadeId,
        unidadeNome: 'Unica',
        unidadeCodigo: 'UN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
    ],
    needsUnitSelection: false,
    activeContext: {
      membershipId: '507f1f77bcf86cd799439102',
      unidadeId: unidadeId,
      unidadePrincipalId: unidadeId,
      papelContextual: 'gestor',
      funcionarioId: 'func-102',
      legacyRole: 'diretor',
    },
    effectiveRole: 'diretor',
    code: 'GESTOR_SELECTION_NOT_REQUIRED',
  });
});

test('selectAuthUnit responde 403 quando a unidade pedida nao pertence as memberships ativas', async () => {
  const allowedUnitId = '507f191e810c19729de860da';
  const deniedUnitId = '507f191e810c19729de860db';

  const response = await invokeOwner({
    body: { unidade_id: deniedUnitId },
    sessionUser: {
      id: '507f1f77bcf86cd799439201',
      email: 'multi@gestor.test',
      nome: 'Usuario Multi',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        return [
          {
            _id: '507f1f77bcf86cd799439202',
            user_id: '507f1f77bcf86cd799439201',
            unidade_id: allowedUnitId,
            papel_contextual: 'user',
            funcionario_id: 'func-202',
          },
          {
            _id: '507f1f77bcf86cd799439203',
            user_id: '507f1f77bcf86cd799439201',
            unidade_id: '507f191e810c19729de860dc',
            papel_contextual: 'gestor',
            funcionario_id: 'func-203',
          },
        ];
      },
      async loadUnidadeById({ unidadeId }) {
        return {
          _id: unidadeId,
          nome: `Unidade ${unidadeId.slice(-2)}`,
          codigo: `U${unidadeId.slice(-2)}`,
          is_principal: true,
          unidade_principal_id: null,
        };
      },
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.source, 'auth-context-v1');
  assert.equal(response.body.membershipCount, 2);
  assert.equal(response.body.needsUnitSelection, true);
  assert.equal(response.body.activeContext, null);
  assert.equal(response.body.effectiveRole, null);
  assert.equal(response.body.code, 'GESTOR_UNIT_NOT_ALLOWED');
});

test('selectAuthUnit persiste a unidade escolhida e responde 200 com activeContext resolvido', async () => {
  const firstUnitId = '507f191e810c19729de860ea';
  const selectedUnitId = '507f191e810c19729de860eb';
  const userId = '507f1f77bcf86cd799439301';

  const response = await invokeOwner({
    body: { unidade_id: selectedUnitId },
    sessionUser: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      async loadActiveMembershipsByUserId({ userId: requestedUserId, maxTimeMS }) {
        assert.equal(requestedUserId, userId);
        assert.equal(maxTimeMS, 4321);
        return [
          {
            _id: '507f1f77bcf86cd799439302',
            user_id: userId,
            unidade_id: firstUnitId,
            papel_contextual: 'gestor',
            funcionario_id: 'func-302',
          },
          {
            _id: '507f1f77bcf86cd799439303',
            user_id: userId,
            unidade_id: selectedUnitId,
            papel_contextual: 'user',
            funcionario_id: 'func-303',
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
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authenticated: true,
    source: 'auth-context-v1',
    identity: {
      id: userId,
      email: 'selecionar@gestor.test',
      nome: 'Usuario Selecionar',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439302',
        unidadeId: firstUnitId,
        unidadePrincipalId: '507f191e810c19729de860ff',
        unidadeNome: 'Filial Norte',
        unidadeCodigo: 'FN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        membershipId: '507f1f77bcf86cd799439303',
        unidadeId: selectedUnitId,
        unidadePrincipalId: selectedUnitId,
        unidadeNome: 'Base Sul',
        unidadeCodigo: 'BS02',
        papelContextual: 'user',
        legacyRole: 'user',
      },
    ],
    needsUnitSelection: false,
    activeContext: {
      membershipId: '507f1f77bcf86cd799439303',
      unidadeId: selectedUnitId,
      unidadePrincipalId: selectedUnitId,
      papelContextual: 'user',
      funcionarioId: 'func-303',
      legacyRole: 'user',
    },
    effectiveRole: 'user',
  });
  assert.equal(response.saveCalls, 1);
  assert.deepEqual(response.session.gestorAuthContext, {
    active_membership_id: '507f1f77bcf86cd799439303',
    active_unidade_id: selectedUnitId,
    active_unidade_principal_id: selectedUnitId,
    active_papel_contextual: 'user',
    active_funcionario_id: 'func-303',
    legacy_role: 'user',
    needs_selection: false,
  });
});

test('selectAuthUnit responde 500 com payload de mutacao quando ocorre erro interno', async () => {
  const response = await invokeOwner({
    body: { unidade_id: '507f191e810c19729de860ee' },
    sessionUser: {
      id: '507f1f77bcf86cd799439401',
      email: 'erro@gestor.test',
      nome: 'Usuario Erro',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        throw new Error('forced-auth-context-select-failure');
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
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
    code: 'GESTOR_AUTH_CONTEXT_SELECTION_ERROR',
  });
});