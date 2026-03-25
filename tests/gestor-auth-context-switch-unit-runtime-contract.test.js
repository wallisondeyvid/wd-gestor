import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';

import app from '#modules/gestor/app/gestor-app.js';
import { switchAuthUnit } from '#modules/gestor/app/controllers/authController.js';

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
  await switchAuthUnit(req, res);
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

test('POST /gestor/auth/switch-unit sem sessao responde 401 no app real', async () => {
  const response = await requestGestorApp('/gestor/auth/switch-unit', {
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

test('switchAuthUnit responde 400 para unidade_id ausente ou invalida', async () => {
  const response = await invokeOwner({
    body: { unidade_id: 'invalido' },
    sessionUser: {
      id: '507f1f77bcf86cd799439501',
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
      id: '507f1f77bcf86cd799439501',
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

test('switchAuthUnit responde 409 quando o resolvedor esta desligado', async () => {
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
  assert.equal(response.body.code, 'GESTOR_AUTH_CONTEXT_SWITCH_DISABLED');
  assert.equal(response.body.source, 'legacy');
  assert.equal(response.body.membershipCount, 1);
  assert.equal(response.body.effectiveRole, 'diretor');
});

test('switchAuthUnit responde 403 para auth-context-v1 global sem memberships', async () => {
  const response = await invokeOwner({
    body: { unidade_id: '507f191e810c19729de860aa' },
    sessionUser: {
      id: 'user-master-1',
      email: 'master@gestor.test',
      nome: 'Master Gestor',
      global_role: 'master',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
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

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    ok: false,
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
    code: 'GESTOR_UNIT_NOT_ALLOWED',
  });
});

test('switchAuthUnit responde 403 quando a unidade pedida nao pertence as memberships ativas', async () => {
  const allowedUnitId = '507f191e810c19729de860da';
  const deniedUnitId = '507f191e810c19729de860db';

  const response = await invokeOwner({
    body: { unidade_id: deniedUnitId },
    sessionUser: {
      id: '507f1f77bcf86cd799439601',
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
            _id: '507f1f77bcf86cd799439602',
            user_id: '507f1f77bcf86cd799439601',
            unidade_id: allowedUnitId,
            papel_contextual: 'user',
            funcionario_id: 'func-602',
          },
          {
            _id: '507f1f77bcf86cd799439603',
            user_id: '507f1f77bcf86cd799439601',
            unidade_id: '507f191e810c19729de860dc',
            papel_contextual: 'gestor',
            funcionario_id: 'func-603',
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
  assert.equal(response.body.code, 'GESTOR_UNIT_NOT_ALLOWED');
});

test('switchAuthUnit permite trocar unidade mesmo sem selecao pendente e responde 200 com activeContext resolvido', async () => {
  const firstUnitId = '507f191e810c19729de860ea';
  const selectedUnitId = '507f191e810c19729de860eb';
  const userId = '507f1f77bcf86cd799439701';

  const response = await invokeOwner({
    body: { unidade_id: selectedUnitId },
    sessionUser: {
      id: userId,
      email: 'switch@gestor.test',
      nome: 'Usuario Switch',
    },
    storedAuthContext: {
      active_unidade_id: firstUnitId,
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
            _id: '507f1f77bcf86cd799439702',
            user_id: userId,
            unidade_id: firstUnitId,
            papel_contextual: 'gestor',
            funcionario_id: 'func-702',
          },
          {
            _id: '507f1f77bcf86cd799439703',
            user_id: userId,
            unidade_id: selectedUnitId,
            papel_contextual: 'user',
            funcionario_id: 'func-703',
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
      email: 'switch@gestor.test',
      nome: 'Usuario Switch',
      authenticated: true,
    },
    globalRole: null,
    membershipCount: 2,
    memberships: [
      {
        membershipId: '507f1f77bcf86cd799439702',
        unidadeId: firstUnitId,
        unidadePrincipalId: '507f191e810c19729de860ff',
        unidadeNome: 'Filial Norte',
        unidadeCodigo: 'FN01',
        papelContextual: 'gestor',
        legacyRole: 'diretor',
      },
      {
        membershipId: '507f1f77bcf86cd799439703',
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
      membershipId: '507f1f77bcf86cd799439703',
      unidadeId: selectedUnitId,
      unidadePrincipalId: selectedUnitId,
      papelContextual: 'user',
      funcionarioId: 'func-703',
      legacyRole: 'user',
    },
    effectiveRole: 'user',
  });
  assert.equal(response.saveCalls, 1);
  assert.deepEqual(response.session.gestorAuthContext, {
    active_unidade_id: selectedUnitId,
    active_membership_id: '507f1f77bcf86cd799439703',
    active_unidade_principal_id: selectedUnitId,
    active_papel_contextual: 'user',
    active_funcionario_id: 'func-703',
    legacy_role: 'user',
    needs_selection: false,
  });
});

test('switchAuthUnit responde 500 com payload de mutacao quando ocorre erro interno', async () => {
  const response = await invokeOwner({
    body: { unidade_id: '507f191e810c19729de860ee' },
    sessionUser: {
      id: '507f1f77bcf86cd799439801',
      email: 'erro@gestor.test',
      nome: 'Usuario Erro',
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      async loadActiveMembershipsByUserId() {
        throw new Error('forced-auth-context-switch-failure');
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
    code: 'GESTOR_AUTH_CONTEXT_SWITCH_ERROR',
  });
});