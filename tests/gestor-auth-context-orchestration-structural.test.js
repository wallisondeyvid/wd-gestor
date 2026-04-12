import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const AUTH_CONTEXT_ORCHESTRATION_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/createAuthContextOrchestrationCore.js');
const LOGIN_POST_AUTH_CONTEXT_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/resolveLoginPostAuthContext.service.js');
const MUTATE_AUTH_UNIT_CONTEXT_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/mutateAuthUnitContext.service.js');
const AUTH_CONTEXT_RESOLVER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/authContextResolver.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE = fs.readFileSync(AUTH_CONTEXT_ORCHESTRATION_CORE_PATH, 'utf8');
const LOGIN_POST_AUTH_CONTEXT_SERVICE_SOURCE = fs.readFileSync(LOGIN_POST_AUTH_CONTEXT_SERVICE_PATH, 'utf8');
const MUTATE_AUTH_UNIT_CONTEXT_SERVICE_SOURCE = fs.readFileSync(MUTATE_AUTH_UNIT_CONTEXT_SERVICE_PATH, 'utf8');
const AUTH_CONTEXT_RESOLVER_SOURCE = fs.readFileSync(AUTH_CONTEXT_RESOLVER_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildAuthContextOrchestrationCoreSource() {
  return `function createAuthContextOrchestrationCore({
    resolveLoginPostAuthContext,
    resolveAuthContext,
    mutateAuthUnitContextService,
  } = {}) {
    async function resolveLoginAuthContext({
      authenticatedUser,
      session,
      resolverEnabled,
      featureFlags,
      resolverDeps,
      maxTimeMS,
    } = {}) {
      return resolveLoginPostAuthContext({
        authenticatedUser,
        session,
        resolverEnabled,
        featureFlags,
        deps: resolverDeps,
        maxTimeMS,
      });
    }

    async function resolveCurrentAuthContext({ resolverOptions } = {}) {
      return resolveAuthContext(resolverOptions);
    }

    async function mutateActiveUnitContext({
      authenticated,
      unidadeId,
      session,
      resolverOptions,
      requirePendingSelection,
      mutationDeps,
    } = {}) {
      return mutateAuthUnitContextService({
        authenticated,
        unidadeId,
        session,
        resolverOptions,
        requirePendingSelection,
        deps: mutationDeps,
      });
    }

    return {
      resolveLoginAuthContext,
      resolveCurrentAuthContext,
      mutateActiveUnitContext,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async loginOwner(req, deps) {
      const result = await deps.authContextOrchestration.resolveLoginAuthContext({
        authenticatedUser: deps.user,
        session: req.session,
        resolverEnabled: deps.resolverEnabled,
        featureFlags: deps.featureFlags,
        resolverDeps: deps.resolverDeps,
        maxTimeMS: deps.maxTimeMS,
      });

      if (result.kind === 'no-context') return { redirect: '/login?erro=contexto' };
      if (result.kind === 'needs-selection') return { redirect: '/login?step=select' };
      return { redirect: '/dashboard', effectiveLoginUser: result.effectiveLoginUser };
    },

    async getAuthContextOwner(deps) {
      const authContext = await deps.authContextOrchestration.resolveCurrentAuthContext({
        resolverOptions: deps.resolverOptions,
      });

      if (!authContext?.authenticated) {
        return { status: 401, body: { ok: false, payload: deps.buildAuthContextHttpPayload(authContext) } };
      }

      return { status: 200, body: { ok: true, payload: deps.buildAuthContextHttpPayload(authContext) } };
    },

    async selectAuthUnitOwner(req, deps) {
      return deps.authContextOrchestration.mutateActiveUnitContext({
        authenticated: deps.requestIdentity.authenticated,
        unidadeId: String(req.body?.unidade_id || '').trim(),
        session: req.session,
        resolverOptions: deps.resolverOptions,
        requirePendingSelection: true,
        mutationDeps: deps.mutationDeps,
      });
    },

    async switchAuthUnitOwner(req, deps) {
      return deps.authContextOrchestration.mutateActiveUnitContext({
        authenticated: deps.requestIdentity.authenticated,
        unidadeId: String(req.body?.unidade_id || '').trim(),
        session: req.session,
        resolverOptions: deps.resolverOptions,
        requirePendingSelection: false,
        mutationDeps: deps.mutationDeps,
      });
    },
  })`;
}

test('estado real atual: AuthContext orchestration delega para a seam unica sem absorver recovery nem lockout', () => {
  assert.match(AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE, /export function createAuthContextOrchestrationCore\(/);
  assert.match(CONTROLLER_SOURCE, /createAuthContextOrchestrationCore/);
  assert.match(CONTROLLER_SOURCE, /authContextOrchestration\.resolveLoginAuthContext\(/);
  assert.match(CONTROLLER_SOURCE, /authContextOrchestration\.resolveCurrentAuthContext\(/);
  assert.match(CONTROLLER_SOURCE, /authContextOrchestration\.mutateActiveUnitContext\(/);
  assert.match(CONTROLLER_SOURCE, /const result = await mutateAuthUnitContext\(req, \{/);
  assert.match(CONTROLLER_SOURCE, /requirePendingSelection: true,/);
  assert.match(CONTROLLER_SOURCE, /requirePendingSelection: false,/);
  assert.match(CONTROLLER_SOURCE, /function buildAuthContextHttpPayload\(/);
  assert.match(CONTROLLER_SOURCE, /function buildAuthContextResolverOptions\(/);
  assert.match(CONTROLLER_SOURCE, /function buildAuthContextMutationErrorPayload\(/);
  assert.match(CONTROLLER_SOURCE, /async function mutateAuthUnitContext\(req,/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /const loginPostAuthContextResult = await resolveLoginPostAuthContext\(/);
  assert.doesNotMatch(CONTROLLER_SOURCE, /const authContext = await resolveGestorAuthContext\(buildAuthContextResolverOptions\(req\)\);/);
  assert.match(CONTROLLER_SOURCE, /evaluateLoginPreAuthGateService\(\{ email, senha \}\)/);

  assert.match(CONTROLLER_SOURCE, /createRememberToken\(/);
  assert.match(CONTROLLER_SOURCE, /const loginModuleAccess = createLoginModuleAccessCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /loginModuleAccess\.evaluateModuleAccess\(\{ userDoc: effectiveLoginUser, moduloAlvoNome: moduloAlvo, basePath, authContext: resolvedLoginAuthContext \}\)/);
  assert.match(CONTROLLER_SOURCE, /resolveLoginSuccessOutcome\.service\.js/);
  assert.match(CONTROLLER_SOURCE, /const earlyLoginSuccessOutcome = await resolveLoginSuccessOutcome\(\{/);
  assert.match(CONTROLLER_SOURCE, /const finalLoginSuccessOutcome = await resolveLoginSuccessOutcome\(\{/);
  assert.match(CONTROLLER_SOURCE, /return res\.redirect\(303, finalLoginSuccessOutcome\.location\);/);

  assert.match(CONTROLLER_SOURCE, /export async function postResetPassword\(/);
  assert.match(CONTROLLER_SOURCE, /export async function postEsqueciSenha\(/);
  assert.match(CONTROLLER_SOURCE, /export async function listarEmailsPorCPF\(/);

  assert.match(AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE, /return resolveLoginPostAuthContext\(/);
  assert.match(AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE, /return resolveAuthContext\(resolverOptions\);/);
  assert.match(AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE, /return mutateAuthUnitContextService\(/);
  assert.doesNotMatch(AUTH_CONTEXT_ORCHESTRATION_CORE_SOURCE, /redirect|createRememberToken|failed_login_attempts|evaluateModuleAccess|findPasswordResetByToken/);

  assert.match(LOGIN_POST_AUTH_CONTEXT_SERVICE_SOURCE, /projectLegacySessionUserFromAuthContext/);
  assert.match(LOGIN_POST_AUTH_CONTEXT_SERVICE_SOURCE, /session\.gestorAuthContext = storedAuthContext;/);
  assert.match(MUTATE_AUTH_UNIT_CONTEXT_SERVICE_SOURCE, /persistActiveMembershipInSession\(session, selectedMembership\);/);
  assert.match(MUTATE_AUTH_UNIT_CONTEXT_SERVICE_SOURCE, /const resolvedAfterMutation = await resolveAuthContext\(/);
  assert.match(AUTH_CONTEXT_RESOLVER_SOURCE, /export async function resolveGestorAuthContext\(/);
  assert.match(AUTH_CONTEXT_RESOLVER_SOURCE, /export function projectLegacySessionUserFromAuthContext\(/);
});

test('futura seam unica recebe apenas identidade, sessao, resolver options e deps de mutacao contextual', async () => {
  const functionSource = buildAuthContextOrchestrationCoreSource();
  assert.match(functionSource, /function createAuthContextOrchestrationCore\(\{/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b|redirect|createRememberToken|revokeRememberTokenByHash|postEsqueciSenha|postResetPassword|listarEmailsPorCPF/);
  assert.doesNotMatch(functionSource, /failed_login_attempts|lock_until|bcrypt|evaluateModuleAccess|findModuloByOr|findPasswordResetByToken/);
  assert.doesNotMatch(functionSource, /renderResetPassword|primeiroAcessoExecutionService|cookie|Retry-After|X-Account-Lock/);

  const calls = [];
  const createAuthContextOrchestrationCore = buildFunctionFromSource(buildAuthContextOrchestrationCoreSource());
  const orchestration = createAuthContextOrchestrationCore({
    resolveLoginPostAuthContext: async (input) => {
      calls.push(['resolveLoginPostAuthContext', toPlain(input)]);
      return { kind: 'continue', effectiveLoginUser: { id: 'u-1' }, resolvedAuthContext: { authenticated: true } };
    },
    resolveAuthContext: async (input) => {
      calls.push(['resolveAuthContext', toPlain(input)]);
      return { authenticated: true, source: 'auth-context-v1', activeContext: { unidadeId: 'u-ativa' } };
    },
    mutateAuthUnitContextService: async (input) => {
      calls.push(['mutateAuthUnitContextService', {
        authenticated: input.authenticated,
        unidadeId: input.unidadeId,
        session: { hasSession: !!input.session },
        resolverOptions: toPlain(input.resolverOptions),
        requirePendingSelection: input.requirePendingSelection,
        depsKeys: Object.keys(input.deps || {}).sort(),
      }]);
      return { kind: 'success', authContext: { authenticated: true, activeContext: { unidadeId: input.unidadeId } } };
    },
  });

  assert.deepEqual(toPlain(await orchestration.resolveLoginAuthContext({
    authenticatedUser: { _id: 'u-1' },
    session: { user: { id: 'u-1' } },
    resolverEnabled: true,
    featureFlags: { gestor_auth_context_resolver: true },
    resolverDeps: { dep: 'x' },
    maxTimeMS: 3000,
  })), {
    kind: 'continue',
    effectiveLoginUser: { id: 'u-1' },
    resolvedAuthContext: { authenticated: true },
  });

  assert.deepEqual(toPlain(await orchestration.resolveCurrentAuthContext({
    resolverOptions: { authenticatedUser: { _id: 'u-1' }, sessionUser: { id: 'u-1' } },
  })), {
    authenticated: true,
    source: 'auth-context-v1',
    activeContext: { unidadeId: 'u-ativa' },
  });

  assert.deepEqual(toPlain(await orchestration.mutateActiveUnitContext({
    authenticated: true,
    unidadeId: '507f191e810c19729de860ea',
    session: { gestorAuthContext: null },
    resolverOptions: { existingAuthContext: null },
    requirePendingSelection: true,
    mutationDeps: {
      resolveAuthContext: async () => null,
      isValidObjectId: () => true,
      findMembershipByUnidadeId: () => null,
      persistActiveMembershipInSession: () => null,
      saveSession: async () => null,
    },
  })), {
    kind: 'success',
    authContext: {
      authenticated: true,
      activeContext: { unidadeId: '507f191e810c19729de860ea' },
    },
  });

  assert.deepEqual(calls, [
    ['resolveLoginPostAuthContext', {
      authenticatedUser: { _id: 'u-1' },
      session: { user: { id: 'u-1' } },
      resolverEnabled: true,
      featureFlags: { gestor_auth_context_resolver: true },
      deps: { dep: 'x' },
      maxTimeMS: 3000,
    }],
    ['resolveAuthContext', {
      authenticatedUser: { _id: 'u-1' },
      sessionUser: { id: 'u-1' },
    }],
    ['mutateAuthUnitContextService', {
      authenticated: true,
      unidadeId: '507f191e810c19729de860ea',
      session: { hasSession: true },
      resolverOptions: { existingAuthContext: null },
      requirePendingSelection: true,
      depsKeys: [
        'findMembershipByUnidadeId',
        'isValidObjectId',
        'persistActiveMembershipInSession',
        'resolveAuthContext',
        'saveSession',
      ],
    }],
  ]);
});

test('apos extracao, login e endpoints contextuais seguem owners HTTP e delegam apenas a orquestracao contextual', async () => {
  const owners = buildObjectFromSource(buildDelegatedOwnersSource());
  const calls = [];

  const authContextOrchestration = {
    async resolveLoginAuthContext(input) {
      calls.push(['resolveLoginAuthContext', toPlain(input)]);
      return { kind: 'needs-selection', effectiveLoginUser: { id: 'u-1' } };
    },
    async resolveCurrentAuthContext(input) {
      calls.push(['resolveCurrentAuthContext', toPlain(input)]);
      return { authenticated: true, source: 'auth-context-v1' };
    },
    async mutateActiveUnitContext(input) {
      calls.push(['mutateActiveUnitContext', {
        authenticated: input.authenticated,
        unidadeId: input.unidadeId,
        session: { hasSession: !!input.session },
        resolverOptions: toPlain(input.resolverOptions),
        requirePendingSelection: input.requirePendingSelection,
        mutationDepsKeys: Object.keys(input.mutationDeps || {}).sort(),
      }]);
      return { kind: 'success', authContext: { authenticated: true, activeContext: { unidadeId: input.unidadeId } } };
    },
  };

  const loginResult = await owners.loginOwner(
    { session: { user: { id: 'u-1' } } },
    {
      user: { _id: 'u-1' },
      resolverEnabled: true,
      featureFlags: { gestor_auth_context_resolver: true },
      resolverDeps: { bridge: true },
      maxTimeMS: 5000,
      authContextOrchestration,
    },
  );

  const getResult = await owners.getAuthContextOwner({
    authContextOrchestration,
    resolverOptions: { authenticatedUser: { _id: 'u-1' } },
    buildAuthContextHttpPayload: (authContext) => ({ source: authContext.source, authenticated: authContext.authenticated }),
  });

  const selectResult = await owners.selectAuthUnitOwner(
    { body: { unidade_id: '507f191e810c19729de860ea' }, session: {} },
    {
      requestIdentity: { authenticated: true },
      resolverOptions: { existingAuthContext: null },
      mutationDeps: {
        resolveAuthContext: async () => null,
        isValidObjectId: () => true,
        findMembershipByUnidadeId: () => null,
        persistActiveMembershipInSession: () => null,
        saveSession: async () => null,
      },
      authContextOrchestration,
    },
  );

  const switchResult = await owners.switchAuthUnitOwner(
    { body: { unidade_id: '507f191e810c19729de860eb' }, session: {} },
    {
      requestIdentity: { authenticated: true },
      resolverOptions: { existingAuthContext: { active_unidade_id: '507f191e810c19729de860ea' } },
      mutationDeps: {
        resolveAuthContext: async () => null,
        isValidObjectId: () => true,
        findMembershipByUnidadeId: () => null,
        persistActiveMembershipInSession: () => null,
        saveSession: async () => null,
      },
      authContextOrchestration,
    },
  );

  assert.deepEqual(toPlain(loginResult), { redirect: '/login?step=select' });
  assert.deepEqual(toPlain(getResult), { status: 200, body: { ok: true, payload: { source: 'auth-context-v1', authenticated: true } } });
  assert.deepEqual(toPlain(selectResult), { kind: 'success', authContext: { authenticated: true, activeContext: { unidadeId: '507f191e810c19729de860ea' } } });
  assert.deepEqual(toPlain(switchResult), { kind: 'success', authContext: { authenticated: true, activeContext: { unidadeId: '507f191e810c19729de860eb' } } });

  assert.deepEqual(calls, [
    ['resolveLoginAuthContext', {
      authenticatedUser: { _id: 'u-1' },
      session: { user: { id: 'u-1' } },
      resolverEnabled: true,
      featureFlags: { gestor_auth_context_resolver: true },
      resolverDeps: { bridge: true },
      maxTimeMS: 5000,
    }],
    ['resolveCurrentAuthContext', {
      resolverOptions: { authenticatedUser: { _id: 'u-1' } },
    }],
    ['mutateActiveUnitContext', {
      authenticated: true,
      unidadeId: '507f191e810c19729de860ea',
      session: { hasSession: true },
      resolverOptions: { existingAuthContext: null },
      requirePendingSelection: true,
      mutationDepsKeys: [
        'findMembershipByUnidadeId',
        'isValidObjectId',
        'persistActiveMembershipInSession',
        'resolveAuthContext',
        'saveSession',
      ],
    }],
    ['mutateActiveUnitContext', {
      authenticated: true,
      unidadeId: '507f191e810c19729de860eb',
      session: { hasSession: true },
      resolverOptions: { existingAuthContext: { active_unidade_id: '507f191e810c19729de860ea' } },
      requirePendingSelection: false,
      mutationDepsKeys: [
        'findMembershipByUnidadeId',
        'isValidObjectId',
        'persistActiveMembershipInSession',
        'resolveAuthContext',
        'saveSession',
      ],
    }],
  ]);
});