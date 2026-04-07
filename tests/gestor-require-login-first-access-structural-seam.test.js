import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const REQUIRE_LOGIN_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/middlewares/requireLogin.js');
const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-mongoose';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-feature-flags';
const AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-auth-context-resolver';
const CLASSIFIER_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-classifier';
const AUTH_DB_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-auth-db';
const CANONICAL_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-canonical-resolver';
const LEGACY_HYDRATION_MOCK_MODULE_URL = 'mock:gestor-require-login-first-access-legacy-hydration';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') {
      return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#core/config/featureFlags.js') {
      return { url: FEATURE_FLAGS_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/authContextResolver.js') {
      return { url: AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js') {
      return { url: CLASSIFIER_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/db/auth.db.js') {
      return { url: AUTH_DB_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js') {
      return { url: CANONICAL_RESOLVER_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/auth/resolveRequireLoginLegacyHydration.service.js') {
      return { url: LEGACY_HYDRATION_MOCK_MODULE_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_MONGOOSE__ || {};",
          "const mock = getMock();",
          "export default mock.defaultExport || { connection: { readyState: 1 } };",
        ].join('\n'),
      };
    }

    if (url === FEATURE_FLAGS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_FEATURE_FLAGS__ || {};",
          "export function isFeatureEnabled(...args) { return getMock().isFeatureEnabled(...args); }",
          "export function isFlagEnabled(...args) { return getMock().isFlagEnabled(...args); }",
        ].join('\n'),
      };
    }

    if (url === AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_CONTEXT_RESOLVER__ || {};",
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = getMock().GESTOR_AUTH_CONTEXT_RESOLVER_FLAG;",
          "export function hasPendingAuthUnitSelection(...args) { const fn = getMock().hasPendingAuthUnitSelection; return typeof fn === 'function' ? fn(...args) : false; }",
        ].join('\n'),
      };
    }

    if (url === CLASSIFIER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CLASSIFIER__ || {};",
          "export const REQUIRE_LOGIN_ENTRY_REASON = getMock().REQUIRE_LOGIN_ENTRY_REASON;",
          "export function classifyRequireLoginEntry(...args) { return getMock().classifyRequireLoginEntry(...args); }",
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_DB__ || {};",
          "export async function findUserLeanByEmail(...args) { return await getMock().findUserLeanByEmail(...args); }",
          "export async function findFuncionarioByIdPopulate(...args) { return await getMock().findFuncionarioByIdPopulate(...args); }",
          "export async function findUnidadeLeanById(...args) { return await getMock().findUnidadeLeanById(...args); }",
          "export async function findUnidadePrincipalLean(...args) { return await getMock().findUnidadePrincipalLean(...args); }",
        ].join('\n'),
      };
    }

    if (url === CANONICAL_RESOLVER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CANONICAL_RESOLVER__ || {};",
          "export async function resolveRequireLoginCanonicalResolvedUser(...args) { return await getMock().resolveRequireLoginCanonicalResolvedUser(...args); }",
        ].join('\n'),
      };
    }

    if (url === LEGACY_HYDRATION_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_LEGACY_HYDRATION__ || {};",
          "export async function resolveRequireLoginLegacyHydration(...args) { return await getMock().resolveRequireLoginLegacyHydration(...args); }",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function importFreshRequireLogin(token) {
  return import(`${pathToFileURL(REQUIRE_LOGIN_FILE).href}?case=${token}`);
}

function setRequireLoginFirstAccessMocks(mocks) {
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_MONGOOSE__ = mocks.mongoose;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_FEATURE_FLAGS__ = mocks.featureFlags;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_CONTEXT_RESOLVER__ = mocks.authContextResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CLASSIFIER__ = mocks.classifier;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_DB__ = mocks.authDb;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CANONICAL_RESOLVER__ = mocks.canonicalResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_LEGACY_HYDRATION__ = mocks.legacyHydration;
}

function clearRequireLoginFirstAccessMocks() {
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_MONGOOSE__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_FEATURE_FLAGS__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_CONTEXT_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CLASSIFIER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_AUTH_DB__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_CANONICAL_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_FIRST_ACCESS_LEGACY_HYDRATION__;
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
  clearRequireLoginFirstAccessMocks();

  const classifierCalls = [];
  const findUserCalls = [];

  setRequireLoginFirstAccessMocks({
    mongoose: {
      defaultExport: {
      connection: { readyState: 1 },
      isValidObjectId(value) {
        return /^[a-f\d]{24}$/i.test(String(value || '').trim());
      },
      },
    },
    featureFlags: {
      isFeatureEnabled(featureFlags, flagName, defaultValue) {
        if (!featureFlags || typeof featureFlags !== 'object') return defaultValue;
        return featureFlags[flagName] ?? defaultValue;
      },
      isFlagEnabled(_flagName, defaultValue) {
        return defaultValue;
      },
    },
    authContextResolver: {
      GESTOR_AUTH_CONTEXT_RESOLVER_FLAG: 'gestor_auth_context_resolver',
    },
    classifier: {
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
    authDb: {
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
    canonicalResolver: {
      async resolveRequireLoginCanonicalResolvedUser() {
        throw new Error('caminho canonico nao deve ser alcancado no first-access');
      },
    },
    legacyHydration: {
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

  clearRequireLoginFirstAccessMocks();
});