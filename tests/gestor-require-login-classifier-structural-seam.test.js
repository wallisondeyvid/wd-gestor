import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  classifyRequireLoginEntry,
  REQUIRE_LOGIN_ENTRY_DECISION,
  REQUIRE_LOGIN_ENTRY_REASON,
} from '../src/modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js';

const REQUIRE_LOGIN_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/middlewares/requireLogin.js');

function importFreshRequireLogin(token) {
  return import(`${pathToFileURL(REQUIRE_LOGIN_FILE).href}?case=${token}`);
}

function createRes() {
  return {
    statusCode: 200,
    redirectUrl: null,
    jsonPayload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    redirect(location) {
      this.redirectUrl = location;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    },
  };
}

function buildClassifierModule(classifyRequireLoginEntryImpl) {
  return {
    namedExports: {
      classifyRequireLoginEntry: classifyRequireLoginEntryImpl,
      REQUIRE_LOGIN_ENTRY_REASON,
    },
  };
}

test('classificador preserva o retorno estruturado minimo por estagio', () => {
  const cases = [
    {
      input: {
        stage: 'pending-selection',
        hasSessionUser: true,
        hasPendingSelection: true,
        shouldBypassPendingSelectionGuard: false,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
        reason: REQUIRE_LOGIN_ENTRY_REASON.SELECTION_REQUIRED,
      },
    },
    {
      input: {
        stage: 'route-access',
        hasSessionUser: false,
        isLoginPath: false,
        isPublicPath: false,
        isEscalasPath: true,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.ALLOW,
        reason: REQUIRE_LOGIN_ENTRY_REASON.ESCALAS_BYPASS,
      },
    },
    {
      input: {
        stage: 'route-access',
        hasSessionUser: false,
        isLoginPath: true,
        isPublicPath: true,
        isEscalasPath: false,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.ALLOW,
        reason: REQUIRE_LOGIN_ENTRY_REASON.PUBLIC_ROUTE,
      },
    },
    {
      input: {
        stage: 'route-access',
        hasSessionUser: false,
        isLoginPath: false,
        isPublicPath: false,
        isEscalasPath: false,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
        reason: REQUIRE_LOGIN_ENTRY_REASON.UNAUTHENTICATED,
      },
    },
    {
      input: {
        stage: 'resolved-user',
        hasUser: true,
        requiresFirstAccess: true,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
        reason: REQUIRE_LOGIN_ENTRY_REASON.FIRST_ACCESS_REQUIRED,
      },
    },
    {
      input: {
        stage: 'transient-error',
        hasTransientError: true,
        hasSessionUser: true,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.ALLOW,
        reason: REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK,
      },
    },
    {
      input: {
        stage: 'funcionario-fallback',
        hasReliableFuncionarioId: true,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE,
        reason: REQUIRE_LOGIN_ENTRY_REASON.NONE,
      },
    },
    {
      input: {
        stage: 'funcionario-fallback',
        hasReliableFuncionarioId: true,
        hasFuncionario: false,
      },
      expected: {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
        reason: REQUIRE_LOGIN_ENTRY_REASON.LOGIN_REQUIRED,
      },
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(classifyRequireLoginEntry(testCase.input), testCase.expected);
  }
});

test('requireLogin delega selecao pendente ao classificador e preserva a resposta JSON atual da API', async () => {
  mock.reset();

  const calls = [];
  await mock.module(
    '#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js',
    buildClassifierModule((input) => {
      calls.push(input);
      if (input.stage === 'pending-selection') {
        return {
          decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
          reason: REQUIRE_LOGIN_ENTRY_REASON.SELECTION_REQUIRED,
        };
      }

      return {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE,
        reason: REQUIRE_LOGIN_ENTRY_REASON.NONE,
      };
    })
  );

  const { requireLogin } = await importFreshRequireLogin('pending-selection-api');

  const req = {
    path: '/api/unidades',
    baseUrl: '/gestor',
    originalUrl: '/gestor/api/unidades',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: { id: 'u1', email: 'x@y' },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = createRes();
  let nextCalled = false;

  await requireLogin(req, res, () => {
    nextCalled = true;
  });

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
  assert.deepEqual(calls, [{
    stage: 'pending-selection',
    hasSessionUser: true,
    hasPendingSelection: true,
    shouldBypassPendingSelectionGuard: false,
  }]);
});

test('requireLogin delega a classificacao de rota protegida e preserva o redirect atual sem sessao', async () => {
  mock.reset();

  const calls = [];
  await mock.module(
    '#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js',
    buildClassifierModule((input) => {
      calls.push(input);
      if (input.stage === 'pending-selection') {
        return {
          decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE,
          reason: REQUIRE_LOGIN_ENTRY_REASON.NONE,
        };
      }

      if (input.stage === 'route-access') {
        return {
          decision: REQUIRE_LOGIN_ENTRY_DECISION.DENY,
          reason: REQUIRE_LOGIN_ENTRY_REASON.UNAUTHENTICATED,
        };
      }

      return {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE,
        reason: REQUIRE_LOGIN_ENTRY_REASON.NONE,
      };
    })
  );

  const { requireLogin } = await importFreshRequireLogin('route-access-redirect');

  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: false,
        },
      },
    },
    session: null,
  };
  const res = createRes();
  let nextCalled = false;

  await requireLogin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectUrl, '/gestor/login');
  assert.deepEqual(calls, [
    {
      stage: 'pending-selection',
      hasSessionUser: false,
      hasPendingSelection: false,
      shouldBypassPendingSelectionGuard: false,
    },
    {
      stage: 'route-access',
      hasSessionUser: false,
      isLoginPath: false,
      isPublicPath: false,
      isEscalasPath: false,
    },
  ]);
});

test('requireLogin delega a classificacao e preserva next mais projecao final de req.user no fallback sem banco', async () => {
  mock.reset();

  const calls = [];
  await mock.module(
    '#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js',
    buildClassifierModule((input) => {
      calls.push(input);
      return {
        decision: REQUIRE_LOGIN_ENTRY_DECISION.CONTINUE,
        reason: REQUIRE_LOGIN_ENTRY_REASON.NONE,
      };
    })
  );

  const { requireLogin } = await importFreshRequireLogin('route-access-next');

  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: false,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
        nome: 'Usuario X',
      },
    },
  };
  const res = createRes();
  let nextCalled = false;

  await requireLogin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.jsonPayload, null);
  assert.deepEqual(req.user, {
    _id: 'u1',
    id: 'u1',
    nome: 'Usuario X',
    email: 'x@y',
    role: 'user',
    global_role: null,
    isMaster: false,
    foto: null,
    funcionario_id: null,
    unidade_id: null,
    unidade_principal_id: null,
    funcao: null,
  });
  assert.deepEqual(calls, [
    {
      stage: 'pending-selection',
      hasSessionUser: true,
      hasPendingSelection: false,
      shouldBypassPendingSelectionGuard: false,
    },
    {
      stage: 'route-access',
      hasSessionUser: true,
      isLoginPath: false,
      isPublicPath: false,
      isEscalasPath: false,
    },
  ]);
});