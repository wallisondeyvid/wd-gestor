import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTH_CONTEXT_SOURCE_LEGACY,
  AUTH_CONTEXT_SOURCE_V1,
  projectLegacySessionUserFromAuthContext,
  resolveContextualUserProjection,
  resolveGestorAuthContext,
} from '../src/modules/gestor/app/services/authContextResolver.js';

const IDS = Object.freeze({
  user: '65f100000000000000000001',
  unitA: '65f100000000000000000002',
  unitB: '65f100000000000000000003',
  principalA: '65f100000000000000000004',
  principalB: '65f100000000000000000005',
  funcA: '65f100000000000000000006',
  funcB: '65f100000000000000000007',
  membershipA: '65f100000000000000000008',
  membershipB: '65f100000000000000000009',
});

function createDeps({ memberships = [], unidades = {} } = {}) {
  let membershipLoadCalls = 0;
  let unidadeLoadCalls = 0;

  return {
    deps: {
      async loadActiveMembershipsByUserId() {
        membershipLoadCalls += 1;
        return memberships;
      },
      async loadUnidadeById({ unidadeId }) {
        unidadeLoadCalls += 1;
        return unidades[unidadeId] || null;
      },
    },
    getCalls() {
      return { membershipLoadCalls, unidadeLoadCalls };
    },
  };
}

test('flag desligada retorna snapshot legado e nao consulta memberships', async () => {
  const harness = createDeps({
    memberships: [{ _id: IDS.membershipA, user_id: IDS.user, unidade_id: IDS.unitA, papel_contextual: 'gestor' }],
  });

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'diretor@example.com',
      role: 'diretor',
      unidade_id: IDS.unitA,
      funcionario_id: IDS.funcA,
    },
    sessionUser: {
      id: IDS.user,
      email: 'diretor@example.com',
      role: 'diretor',
      unidade_id: IDS.unitA,
      unidade_principal_id: IDS.principalA,
      funcionario_id: IDS.funcA,
    },
    featureFlags: { gestor_auth_context_resolver: false },
    deps: harness.deps,
  });

  assert.equal(authContext.source, AUTH_CONTEXT_SOURCE_LEGACY);
  assert.equal(authContext.authenticated, true);
  assert.equal(authContext.effectiveRole, 'diretor');
  assert.equal(authContext.membershipCount, 1);
  assert.equal(authContext.needsUnitSelection, false);
  assert.equal(authContext.activeContext?.unidadeId, IDS.unitA);
  assert.deepEqual(harness.getCalls(), { membershipLoadCalls: 0, unidadeLoadCalls: 0 });
});

test('global_role resolve auth-context-v1 sem consultar memberships', async () => {
  const harness = createDeps();

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'admin@example.com',
      role: 'admin',
      global_role: 'admin',
    },
    featureFlags: { gestor_auth_context_resolver: true },
    deps: harness.deps,
  });

  assert.equal(authContext.source, AUTH_CONTEXT_SOURCE_V1);
  assert.equal(authContext.globalRole, 'admin');
  assert.equal(authContext.effectiveRole, 'admin');
  assert.equal(authContext.membershipCount, 0);
  assert.equal(authContext.needsUnitSelection, false);
  assert.equal(authContext.activeContext, null);
  assert.deepEqual(harness.getCalls(), { membershipLoadCalls: 0, unidadeLoadCalls: 0 });
});

test('snapshot legado reconhece unidade ativa para Master global quando unidade_id ja esta na sessao', async () => {
  const harness = createDeps();

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'master@example.com',
      role: 'master',
      global_role: 'master',
    },
    sessionUser: {
      id: IDS.user,
      email: 'master@example.com',
      role: 'master',
      global_role: 'master',
      unidade_id: IDS.unitA,
      unidade_principal_id: IDS.principalA,
    },
    featureFlags: { gestor_auth_context_resolver: false },
    deps: harness.deps,
  });

  assert.equal(authContext.source, AUTH_CONTEXT_SOURCE_LEGACY);
  assert.equal(authContext.globalRole, 'master');
  assert.equal(authContext.effectiveRole, 'master');
  assert.equal(authContext.membershipCount, 1);
  assert.deepEqual(authContext.activeContext, {
    membershipId: 'legacy-active-context',
    unidadeId: IDS.unitA,
    unidadePrincipalId: IDS.principalA,
    papelContextual: 'gestor',
    funcionarioId: null,
    legacyRole: 'master',
  });
  assert.deepEqual(harness.getCalls(), { membershipLoadCalls: 0, unidadeLoadCalls: 0 });
});

test('membership unico ativo vira contexto ativo automaticamente', async () => {
  const harness = createDeps({
    memberships: [{
      _id: IDS.membershipA,
      user_id: IDS.user,
      unidade_id: IDS.unitA,
      papel_contextual: 'gestor',
      funcionario_id: IDS.funcA,
      status: 'active',
    }],
    unidades: {
      [IDS.unitA]: { _id: IDS.unitA, is_principal: false, unidade_principal_id: IDS.principalA, nome: 'Unidade A', codigo: 'UA' },
    },
  });

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'gestor@example.com',
      role: 'diretor',
      global_role: null,
    },
    featureFlags: { gestor_auth_context_resolver: true },
    deps: harness.deps,
  });

  assert.equal(authContext.source, AUTH_CONTEXT_SOURCE_V1);
  assert.equal(authContext.membershipCount, 1);
  assert.equal(authContext.needsUnitSelection, false);
  assert.equal(authContext.activeContext?.membershipId, IDS.membershipA);
  assert.equal(authContext.activeContext?.unidadePrincipalId, IDS.principalA);
  assert.equal(authContext.effectiveRole, 'diretor');
});

test('multiplos memberships ativos exigem selecao quando nao ha contexto selecionado', async () => {
  const harness = createDeps({
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
  });

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'multi@example.com',
      role: 'user',
    },
    featureFlags: { gestor_auth_context_resolver: true },
    deps: harness.deps,
  });

  assert.equal(authContext.membershipCount, 2);
  assert.equal(authContext.needsUnitSelection, true);
  assert.equal(authContext.activeContext, null);
  assert.equal(authContext.effectiveRole, null);
});

test('contexto ja selecionado reaproveita membership ativo correspondente', async () => {
  const harness = createDeps({
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
  });

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'selected@example.com',
      role: 'user',
    },
    existingAuthContext: {
      active_membership_id: IDS.membershipB,
      active_unidade_id: IDS.unitB,
    },
    featureFlags: { gestor_auth_context_resolver: true },
    deps: harness.deps,
  });

  assert.equal(authContext.membershipCount, 2);
  assert.equal(authContext.needsUnitSelection, false);
  assert.equal(authContext.activeContext?.membershipId, IDS.membershipB);
  assert.equal(authContext.activeContext?.legacyRole, 'user');
  assert.equal(authContext.effectiveRole, 'user');
});

test('sem vinculos ativos produz auth-context-v1 autenticado sem contexto efetivo', async () => {
  const harness = createDeps();

  const authContext = await resolveGestorAuthContext({
    authenticatedUser: {
      _id: IDS.user,
      email: 'sem-vinculo@example.com',
      role: 'user',
      global_role: null,
    },
    featureFlags: { gestor_auth_context_resolver: true },
    deps: harness.deps,
  });

  assert.equal(authContext.authenticated, true);
  assert.equal(authContext.source, AUTH_CONTEXT_SOURCE_V1);
  assert.equal(authContext.globalRole, null);
  assert.equal(authContext.membershipCount, 0);
  assert.equal(authContext.needsUnitSelection, false);
  assert.equal(authContext.activeContext, null);
  assert.equal(authContext.effectiveRole, null);
});

test('projectLegacySessionUserFromAuthContext preserva compatibilidade sem inventar contexto', () => {
  const projected = projectLegacySessionUserFromAuthContext({
    authContext: {
      authenticated: true,
      identity: { id: IDS.user, email: 'multi@example.com' },
      globalRole: null,
      memberships: [],
      membershipCount: 2,
      needsUnitSelection: true,
      activeContext: null,
      effectiveRole: null,
      source: AUTH_CONTEXT_SOURCE_V1,
    },
    sessionUser: { nome: 'Usuário legado' },
  });

  assert.deepEqual(projected, {
    nome: 'Usuário legado',
    id: IDS.user,
    email: 'multi@example.com',
    role: null,
    unidade_id: null,
    unidade_principal_id: null,
    funcionario_id: null,
    global_role: null,
    auth_version: 'phase3',
  });
});

test('resolveContextualUserProjection nao trata auth_version phase3 como fonte autoritativa sem sessionAuthContext', () => {
  const projection = resolveContextualUserProjection({
    sessionUser: {
      id: IDS.user,
      auth_version: 'phase3',
      unidade_id: IDS.unitA,
      funcionario_id: IDS.funcA,
    },
    sessionAuthContext: null,
  });

  assert.deepEqual(projection, {
    isAuthoritative: false,
    contextualUnidadeId: IDS.unitA,
    contextualFuncionarioId: IDS.funcA,
  });
});

test('resolveContextualUserProjection trata phase3 como projeção autoritativa quando sessionAuthContext tem source auth-context-v1', () => {
  const projection = resolveContextualUserProjection({
    sessionUser: {
      id: IDS.user,
      auth_version: 'phase3',
      unidade_id: IDS.unitA,
      funcionario_id: IDS.funcA,
    },
    sessionAuthContext: {
      source: AUTH_CONTEXT_SOURCE_V1,
      active_unidade_id: IDS.unitB,
      active_funcionario_id: IDS.funcB,
    },
  });

  assert.deepEqual(projection, {
    isAuthoritative: true,
    contextualUnidadeId: IDS.unitB,
    contextualFuncionarioId: IDS.funcB,
  });
});

test('resolveContextualUserProjection nao trata sessionAuthContext parcial sem source como projeção autoritativa mesmo com auth_version phase3', () => {
  const projection = resolveContextualUserProjection({
    sessionUser: {
      id: IDS.user,
      auth_version: 'phase3',
      unidade_id: IDS.unitA,
      funcionario_id: IDS.funcA,
    },
    sessionAuthContext: {
      active_unidade_id: IDS.unitB,
      active_funcionario_id: IDS.funcB,
    },
  });

  assert.deepEqual(projection, {
    isAuthoritative: false,
    contextualUnidadeId: IDS.unitA,
    contextualFuncionarioId: IDS.funcA,
  });
});