import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

import authRouter from '../src/modules/gestor/app/routes/auth.js';

const IDS = Object.freeze({
  user: '65f300000000000000000001',
  unitA: '65f300000000000000000002',
  unitB: '65f300000000000000000003',
  unitC: '65f300000000000000000004',
  principalA: '65f300000000000000000005',
  principalB: '65f300000000000000000006',
  funcA: '65f300000000000000000007',
  funcB: '65f300000000000000000008',
  membershipA: '65f300000000000000000009',
  membershipB: '65f30000000000000000000a',
});

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

function createAuthApp({
  sessionUser = null,
  authenticatedUser = null,
  existingAuthContext = null,
  featureFlags = null,
  resolverDeps = null,
} = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'gestor-auth-context-test', resave: false, saveUninitialized: true }));

  if (featureFlags) app.locals.gestorAuthContextFeatureFlags = featureFlags;
  if (resolverDeps) app.locals.gestorAuthContextResolverDeps = resolverDeps;

  app.use((req, _res, next) => {
    if (sessionUser && !req.session.__seededSessionUser) {
      req.session.user = { ...sessionUser };
      req.session.__seededSessionUser = true;
    }
    if (existingAuthContext && !req.session.__seededGestorAuthContext) {
      req.session.gestorAuthContext = { ...existingAuthContext };
      req.session.__seededGestorAuthContext = true;
    }
    if (authenticatedUser) {
      req.user = { ...authenticatedUser };
    }
    next();
  });

  app.use('/gestor', authRouter);
  return app;
}

test('POST /gestor/auth/select-unit responde 401 quando não autenticado', async () => {
  const app = createAuthApp({
    featureFlags: { gestor_auth_context_resolver: true },
  });

  const res = await request(app)
    .post('/gestor/auth/select-unit')
    .send({ unidade_id: IDS.unitA });

  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'GESTOR_UNAUTHORIZED');
});

test('POST /gestor/auth/select-unit responde 400 quando unidade_id está ausente ou inválido', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'user@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'user@example.com', role: 'user' },
    featureFlags: { gestor_auth_context_resolver: true },
  });

  const missingRes = await request(app)
    .post('/gestor/auth/select-unit')
    .send({});

  assert.equal(missingRes.status, 400);
  assert.equal(missingRes.body.ok, false);
  assert.equal(missingRes.body.code, 'GESTOR_INVALID_UNIDADE_ID');
  assert.equal(missingRes.body.reason, 'invalid-unidade-id');

  const invalidRes = await request(app)
    .post('/gestor/auth/select-unit')
    .send({ unidade_id: 'abc' });

  assert.equal(invalidRes.status, 400);
  assert.equal(invalidRes.body.ok, false);
  assert.equal(invalidRes.body.code, 'GESTOR_INVALID_UNIDADE_ID');
  assert.equal(invalidRes.body.reason, 'invalid-unidade-id');
});

test('POST /gestor/auth/select-unit responde 409 estável quando a flag está desligada', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'user@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'user@example.com', role: 'user', unidade_id: IDS.unitA },
    featureFlags: { gestor_auth_context_resolver: false },
  });

  const res = await request(app)
    .post('/gestor/auth/select-unit')
    .send({ unidade_id: IDS.unitA });

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.source, 'legacy');
  assert.equal(res.body.code, 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED');
  assert.equal(res.body.reason, 'resolver-disabled');
});

test('POST /gestor/auth/select-unit responde 403 quando a unidade não pertence aos vínculos ativos', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'multi@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'multi@example.com', role: 'user' },
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

  const res = await request(app)
    .post('/gestor/auth/select-unit')
    .send({ unidade_id: IDS.unitC });

  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'GESTOR_UNIT_NOT_ALLOWED');
  assert.equal(res.body.reason, 'unit-not-allowed');
});

test('POST /gestor/auth/select-unit grava activeContext na sessão e o GET subsequente reflete a seleção', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'multi@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'multi@example.com', role: 'user' },
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

  const agent = request.agent(app);

  const selectRes = await agent
    .post('/gestor/auth/select-unit')
    .send({ unidade_id: IDS.unitB });

  assert.equal(selectRes.status, 200);
  assert.equal(selectRes.body.ok, true);
  assert.equal(selectRes.body.authenticated, true);
  assert.equal(selectRes.body.source, 'auth-context-v1');
  assert.equal(selectRes.body.membershipCount, 2);
  assert.equal(selectRes.body.needsUnitSelection, false);
  assert.deepEqual(selectRes.body.activeContext, {
    membershipId: IDS.membershipB,
    unidadeId: IDS.unitB,
    unidadePrincipalId: IDS.principalB,
    papelContextual: 'user',
    funcionarioId: IDS.funcB,
    legacyRole: 'user',
  });
  assert.equal(selectRes.body.effectiveRole, 'user');

  const contextRes = await agent.get('/gestor/auth/context');

  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.needsUnitSelection, false);
  assert.deepEqual(contextRes.body.activeContext, {
    membershipId: IDS.membershipB,
    unidadeId: IDS.unitB,
    unidadePrincipalId: IDS.principalB,
    papelContextual: 'user',
    funcionarioId: IDS.funcB,
    legacyRole: 'user',
  });
  assert.equal(contextRes.body.effectiveRole, 'user');
});

test('POST /gestor/auth/switch-unit responde 401 quando não autenticado', async () => {
  const app = createAuthApp({
    featureFlags: { gestor_auth_context_resolver: true },
  });

  const res = await request(app)
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitA });

  assert.equal(res.status, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'GESTOR_UNAUTHORIZED');
  assert.equal(res.body.reason, 'unauthorized');
});

test('POST /gestor/auth/switch-unit responde 400 quando unidade_id está ausente ou inválido', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'user@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'user@example.com', role: 'user' },
    featureFlags: { gestor_auth_context_resolver: true },
  });

  const missingRes = await request(app)
    .post('/gestor/auth/switch-unit')
    .send({});

  assert.equal(missingRes.status, 400);
  assert.equal(missingRes.body.ok, false);
  assert.equal(missingRes.body.code, 'GESTOR_INVALID_UNIDADE_ID');
  assert.equal(missingRes.body.reason, 'invalid-unidade-id');

  const invalidRes = await request(app)
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: 'abc' });

  assert.equal(invalidRes.status, 400);
  assert.equal(invalidRes.body.ok, false);
  assert.equal(invalidRes.body.code, 'GESTOR_INVALID_UNIDADE_ID');
  assert.equal(invalidRes.body.reason, 'invalid-unidade-id');
});

test('POST /gestor/auth/switch-unit responde 409 estável quando a flag está desligada', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'user@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'user@example.com', role: 'user', unidade_id: IDS.unitA },
    featureFlags: { gestor_auth_context_resolver: false },
  });

  const res = await request(app)
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitA });

  assert.equal(res.status, 409);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.source, 'legacy');
  assert.equal(res.body.code, 'GESTOR_AUTH_CONTEXT_SWITCH_DISABLED');
  assert.equal(res.body.reason, 'resolver-disabled');
  assert.equal(res.body.message, 'A ativação de unidade não está disponível neste ambiente.');
});

test('POST /gestor/auth/switch-unit permite Master global ativar unidade valida mesmo com resolvedor desligado', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'master@example.com', role: 'master', global_role: 'master' },
    authenticatedUser: { _id: IDS.user, email: 'master@example.com', role: 'master', global_role: 'master' },
    featureFlags: { gestor_auth_context_resolver: false },
    resolverDeps: createResolverDeps({
      unidades: {
        [IDS.unitA]: { _id: IDS.unitA, is_principal: true, unidade_principal_id: IDS.unitA, nome: 'Unidade A', codigo: 'UA' },
      },
    }),
  });

  const agent = request.agent(app);

  const switchRes = await agent
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitA });

  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.body.ok, true);
  assert.equal(switchRes.body.source, 'legacy');
  assert.equal(switchRes.body.globalRole, 'master');
  assert.deepEqual(switchRes.body.activeContext, {
    membershipId: 'legacy-active-context',
    unidadeId: IDS.unitA,
    unidadePrincipalId: IDS.unitA,
    papelContextual: 'gestor',
    funcionarioId: null,
    legacyRole: 'master',
  });
  assert.equal(switchRes.body.reason, 'success');

  const contextRes = await agent.get('/gestor/auth/context');

  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.source, 'legacy');
  assert.deepEqual(contextRes.body.activeContext, {
    membershipId: 'legacy-active-context',
    unidadeId: IDS.unitA,
    unidadePrincipalId: IDS.unitA,
    papelContextual: 'gestor',
    funcionarioId: null,
    legacyRole: 'master',
  });
});

test('POST /gestor/auth/switch-unit responde 403 quando a unidade não pertence aos vínculos ativos', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'multi@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'multi@example.com', role: 'user' },
    existingAuthContext: {
      active_membership_id: IDS.membershipA,
      active_unidade_id: IDS.unitA,
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

  const res = await request(app)
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitC });

  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'GESTOR_UNIT_NOT_ALLOWED');
  assert.equal(res.body.reason, 'unit-not-allowed');
});

test('POST /gestor/auth/switch-unit atualiza somente o activeContext da sessão e o GET subsequente reflete a troca', async () => {
  const app = createAuthApp({
    sessionUser: { id: IDS.user, email: 'multi@example.com', role: 'user' },
    authenticatedUser: { _id: IDS.user, email: 'multi@example.com', role: 'user' },
    existingAuthContext: {
      active_membership_id: IDS.membershipA,
      active_unidade_id: IDS.unitA,
      active_unidade_principal_id: IDS.principalA,
      active_papel_contextual: 'gestor',
      active_funcionario_id: IDS.funcA,
      legacy_role: 'diretor',
      needs_selection: false,
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

  const agent = request.agent(app);

  const switchRes = await agent
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitB });

  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.body.ok, true);
  assert.equal(switchRes.body.authenticated, true);
  assert.equal(switchRes.body.source, 'auth-context-v1');
  assert.equal(switchRes.body.membershipCount, 2);
  assert.equal(switchRes.body.needsUnitSelection, false);
  assert.deepEqual(switchRes.body.activeContext, {
    membershipId: IDS.membershipB,
    unidadeId: IDS.unitB,
    unidadePrincipalId: IDS.principalB,
    papelContextual: 'user',
    funcionarioId: IDS.funcB,
    legacyRole: 'user',
  });
  assert.equal(switchRes.body.effectiveRole, 'user');

  const contextRes = await agent.get('/gestor/auth/context');

  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.needsUnitSelection, false);
  assert.deepEqual(contextRes.body.activeContext, {
    membershipId: IDS.membershipB,
    unidadeId: IDS.unitB,
    unidadePrincipalId: IDS.principalB,
    papelContextual: 'user',
    funcionarioId: IDS.funcB,
    legacyRole: 'user',
  });
  assert.equal(contextRes.body.effectiveRole, 'user');
});