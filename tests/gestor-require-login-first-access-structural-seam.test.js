import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

test('requireLogin delega a classificacao de first-access e preserva 403 FIRST_LOGIN em API sem seguir para os ramos posteriores', async () => {
  mock.reset();

  const classifierCalls = [];
  const findUserCalls = [];

  await mock.module('mongoose', {
    defaultExport: {
      connection: { readyState: 1 },
      isValidObjectId(value) {
        return /^[a-f\d]{24}$/i.test(String(value || '').trim());
      },
    },
  });

  await mock.module('#core/config/featureFlags.js', {
    namedExports: {
      isFeatureEnabled(featureFlags, flagName, defaultValue) {
        if (!featureFlags || typeof featureFlags !== 'object') return defaultValue;
        return featureFlags[flagName] ?? defaultValue;
      },
      isFlagEnabled(_flagName, defaultValue) {
        return defaultValue;
      },
    },
  });

  await mock.module('#modules/gestor/app/services/authContextResolver.js', {
    namedExports: {
      GESTOR_AUTH_CONTEXT_RESOLVER_FLAG: 'gestor_auth_context_resolver',
    },
  });

  await mock.module('#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js', {
    namedExports: {
      REQUIRE_LOGIN_ENTRY_REASON: {
        NONE: 'none',
        AUTHENTICATED_USER: 'authenticated-user',
        FIRST_ACCESS_REQUIRED: 'first-access-required',
        PUBLIC_ROUTE: 'public-route',
        SELECTION_REQUIRED: 'selection-required',
        SESSION_FALLBACK: 'session-fallback',
        UNAUTHENTICATED: 'unauthenticated',
      },
      classifyRequireLoginEntry(input) {
        classifierCalls.push(input);

        if (input.stage === 'pending-selection') {
          return { decision: 'continue', reason: 'none' };
        }

        if (input.stage === 'route-access') {
          return { decision: 'continue', reason: 'none' };
        }

        if (input.stage === 'resolved-user') {
          return { decision: 'deny', reason: 'first-access-required' };
        }

        return { decision: 'continue', reason: 'none' };
      },
    },
  });

  await mock.module('#modules/gestor/app/db/auth.db.js', {
    namedExports: {
      async findUserLeanByEmail(input) {
        findUserCalls.push(input);
        return {
          _id: '507f1f77bcf86cd799439011',
          nome: 'Usuario DB',
          email: 'x@y',
          role: 'user',
          primeiro_acesso: true,
          senha_provisoria: false,
          foto: null,
          unidade_id: 'legacy-unit',
          funcionario_id: 'funcionario-db-legado',
        };
      },
      async findFuncionarioByIdPopulate() {
        throw new Error('fallback por funcionario nao deve ser usado no first-access');
      },
      async findUnidadeLeanById() {
        throw new Error('hidratacao legada nao deve ser usada no first-access');
      },
      async findUnidadePrincipalLean() {
        throw new Error('fallback de master nao deve ser usado no first-access');
      },
    },
  });

  await mock.module('#modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js', {
    namedExports: {
      async resolveRequireLoginCanonicalResolvedUser() {
        throw new Error('caminho canonico nao deve ser alcancado no first-access');
      },
    },
  });

  await mock.module('#modules/gestor/app/services/auth/resolveRequireLoginLegacyHydration.service.js', {
    namedExports: {
      async resolveRequireLoginLegacyHydration() {
        throw new Error('caminho legado nao deve ser alcancado no first-access');
      },
    },
  });

  const { requireLogin } = await importFreshRequireLogin('first-access-api');

  const req = {
    path: '/api/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/api/dashboard',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'x@y',
        nome: 'Sessao Atual',
      },
    },
    get() {
      return '';
    },
  };
  const res = createRes();
  let nextCalled = false;

  await requireLogin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.redirectUrl, null);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    error: 'FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED',
    code: 'FIRST_LOGIN',
  });

  assert.deepEqual(findUserCalls, [{
    email: 'x@y',
    maxTimeMS: 3000,
  }]);

  assert.deepEqual(classifierCalls, [
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
    {
      stage: 'resolved-user',
      hasUser: true,
      requiresFirstAccess: true,
    },
  ]);
});