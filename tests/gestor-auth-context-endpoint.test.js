import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';

import authRouter from '../src/modules/gestor/app/routes/auth.js';

const IDS = Object.freeze({
  user: '65f200000000000000000001',
  unitA: '65f200000000000000000002',
  unitB: '65f200000000000000000003',
  principalA: '65f200000000000000000004',
  principalB: '65f200000000000000000005',
  funcA: '65f200000000000000000006',
  funcB: '65f200000000000000000007',
  membershipA: '65f200000000000000000008',
  membershipB: '65f200000000000000000009',
});

function createAuthApp({
  sessionUser = null,
  authenticatedUser = null,
  existingAuthContext = null,
  featureFlags = null,
  resolverDeps = null,
} = {}) {
  const app = express();
  if (featureFlags) app.locals.gestorAuthContextFeatureFlags = featureFlags;
  if (resolverDeps) app.locals.gestorAuthContextResolverDeps = resolverDeps;

  app.use((req, _res, next) => {
    req.session = {};
    if (sessionUser) req.session.user = { ...sessionUser };
    if (existingAuthContext) req.session.gestorAuthContext = { ...existingAuthContext };
    if (authenticatedUser) req.user = { ...authenticatedUser };
    next();
  });

  app.use('/gestor', authRouter);
  return app;
}

function createResolverDeps({ memberships = [], unidades = {} } = {}) {
  return {
    async loadActiveMembershipsByUserId() {
      return memberships;
    },
    async loadUnidadeById({ unidadeId }) {
      return unidades[unidadeId] || null;
    },
  };
}

test('GET /gestor/auth/context responde 401 estável quando não autenticado', async () => {
  const app = createAuthApp({
    featureFlags: { gestor_auth_context_resolver: false },
  });

  const res = await request(app).get('/gestor/auth/context');

  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.authenticated, false);
  assert.equal(res.body.source, 'legacy');
  assert.deepEqual(res.body.identity, {
    id: null,
    email: '',
    nome: null,
    authenticated: false,
  });
  assert.equal(res.body.globalRole, null);
  assert.equal(res.body.membershipCount, 0);
  assert.deepEqual(res.body.memberships, []);
  assert.equal(res.body.needsUnitSelection, false);
  assert.equal(res.body.activeContext, null);
  assert.equal(res.body.effectiveRole, null);
});

test('GET /gestor/auth/context responde 200 em modo legacy quando a flag está desligada', async () => {
  const sessionUser = {
    id: IDS.user,
    email: 'diretor@example.com',
    role: 'diretor',
    unidade_id: IDS.unitA,
    unidade_principal_id: IDS.principalA,
    funcionario_id: IDS.funcA,
  };

  const app = createAuthApp({
    sessionUser,
    authenticatedUser: {
      _id: IDS.user,
      email: 'diretor@example.com',
      role: 'diretor',
      unidade_id: IDS.unitA,
      funcionario_id: IDS.funcA,
    },
    featureFlags: { gestor_auth_context_resolver: false },
  });

  const res = await request(app).get('/gestor/auth/context');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.source, 'legacy');
  assert.equal(res.body.identity.id, IDS.user);
  assert.equal(res.body.identity.email, 'diretor@example.com');
  assert.equal(res.body.globalRole, null);
  assert.equal(res.body.membershipCount, 1);
  assert.deepEqual(res.body.memberships, [
    {
      membershipId: 'legacy-active-context',
      unidadeId: IDS.unitA,
      unidadePrincipalId: IDS.principalA,
      unidadeNome: null,
      unidadeCodigo: null,
      papelContextual: 'gestor',
      legacyRole: 'diretor',
    },
  ]);
  assert.equal(res.body.needsUnitSelection, false);
  assert.deepEqual(res.body.activeContext, {
    membershipId: 'legacy-active-context',
    unidadeId: IDS.unitA,
    unidadePrincipalId: IDS.principalA,
    papelContextual: 'gestor',
    funcionarioId: IDS.funcA,
    legacyRole: 'diretor',
  });
  assert.equal(res.body.effectiveRole, 'diretor');
});

test('GET /gestor/auth/context responde auth-context-v1 para global_role', async () => {
  const app = createAuthApp({
    sessionUser: {
      id: IDS.user,
      email: 'admin@example.com',
      role: 'admin',
    },
    authenticatedUser: {
      _id: IDS.user,
      email: 'admin@example.com',
      role: 'admin',
      global_role: 'admin',
    },
    featureFlags: { gestor_auth_context_resolver: true },
  });

  const res = await request(app).get('/gestor/auth/context');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.source, 'auth-context-v1');
  assert.equal(res.body.globalRole, 'admin');
  assert.equal(res.body.membershipCount, 0);
  assert.deepEqual(res.body.memberships, []);
  assert.equal(res.body.needsUnitSelection, false);
  assert.equal(res.body.activeContext, null);
  assert.equal(res.body.effectiveRole, 'admin');
});

test('GET /gestor/auth/context responde auth-context-v1 com seleção pendente para múltiplos vínculos', async () => {
  const app = createAuthApp({
    sessionUser: {
      id: IDS.user,
      email: 'multi@example.com',
      role: 'user',
    },
    authenticatedUser: {
      _id: IDS.user,
      email: 'multi@example.com',
      role: 'user',
    },
    featureFlags: { gestor_auth_context_resolver: true },
    resolverDeps: createResolverDeps({
      memberships: [
        {
          _id: IDS.membershipA,
          user_id: IDS.user,
          unidade_id: IDS.unitA,
          papel_contextual: 'gestor',
          funcionario_id: IDS.funcA,
          status: 'active',
        },
        {
          _id: IDS.membershipB,
          user_id: IDS.user,
          unidade_id: IDS.unitB,
          papel_contextual: 'user',
          funcionario_id: IDS.funcB,
          status: 'active',
        },
      ],
      unidades: {
        [IDS.unitA]: { _id: IDS.unitA, is_principal: false, unidade_principal_id: IDS.principalA, nome: 'Unidade A', codigo: 'UA' },
        [IDS.unitB]: { _id: IDS.unitB, is_principal: false, unidade_principal_id: IDS.principalB, nome: 'Unidade B', codigo: 'UB' },
      },
    }),
  });

  const res = await request(app).get('/gestor/auth/context');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.source, 'auth-context-v1');
  assert.equal(res.body.globalRole, null);
  assert.equal(res.body.membershipCount, 2);
  assert.deepEqual(res.body.memberships, [
    {
      membershipId: IDS.membershipA,
      unidadeId: IDS.unitA,
      unidadePrincipalId: IDS.principalA,
      unidadeNome: 'Unidade A',
      unidadeCodigo: 'UA',
      papelContextual: 'gestor',
      legacyRole: 'diretor',
    },
    {
      membershipId: IDS.membershipB,
      unidadeId: IDS.unitB,
      unidadePrincipalId: IDS.principalB,
      unidadeNome: 'Unidade B',
      unidadeCodigo: 'UB',
      papelContextual: 'user',
      legacyRole: 'user',
    },
  ]);
  assert.equal(res.body.needsUnitSelection, true);
  assert.equal(res.body.activeContext, null);
  assert.equal(res.body.effectiveRole, null);
});