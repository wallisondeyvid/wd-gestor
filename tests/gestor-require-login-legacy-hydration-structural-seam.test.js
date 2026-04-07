import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const REQUIRE_LOGIN_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/middlewares/requireLogin.js');
const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-mongoose';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-feature-flags';
const AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-auth-context-resolver';
const AUTH_DB_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-auth-db';
const CANONICAL_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-canonical-resolver';
const LEGACY_HYDRATION_MOCK_MODULE_URL = 'mock:gestor-require-login-legacy-hydration-legacy-hydration';

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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_MONGOOSE__ || {};",
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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_FEATURE_FLAGS__ || {};",
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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_CONTEXT_RESOLVER__ || {};",
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = getMock().GESTOR_AUTH_CONTEXT_RESOLVER_FLAG;",
          "export function hasPendingAuthUnitSelection(...args) { const fn = getMock().hasPendingAuthUnitSelection; return typeof fn === 'function' ? fn(...args) : false; }",
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_DB__ || {};",
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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_CANONICAL_RESOLVER__ || {};",
          "export async function resolveRequireLoginCanonicalResolvedUser(...args) { return await getMock().resolveRequireLoginCanonicalResolvedUser(...args); }",
        ].join('\n'),
      };
    }

    if (url === LEGACY_HYDRATION_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_LEGACY_HYDRATION__ || {};",
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

function setRequireLoginLegacyHydrationMocks(mocks) {
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_MONGOOSE__ = mocks.mongoose;
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_FEATURE_FLAGS__ = mocks.featureFlags;
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_CONTEXT_RESOLVER__ = mocks.authContextResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_DB__ = mocks.authDb;
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_CANONICAL_RESOLVER__ = mocks.canonicalResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_LEGACY_HYDRATION__ = mocks.legacyHydration;
}

function clearRequireLoginLegacyHydrationMocks() {
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_MONGOOSE__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_FEATURE_FLAGS__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_CONTEXT_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_AUTH_DB__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_CANONICAL_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_LEGACY_HYDRATION_LEGACY_HYDRATION__;
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

test('requireLogin preserva o contrato externo enquanto percorre o caminho de hidratacao legada apos o caminho canonico nao autenticar', async () => {
  clearRequireLoginLegacyHydrationMocks();

  const findUserCalls = [];
  const canonicalResolvedUserCalls = [];
  const legacyHydrationCalls = [];

  setRequireLoginLegacyHydrationMocks({
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
    canonicalResolver: {
      async resolveRequireLoginCanonicalResolvedUser(input) {
        canonicalResolvedUserCalls.push(input);
        return { kind: 'continue' };
      },
    },
    authDb: {
      async findUserLeanByEmail(input) {
        findUserCalls.push(input);
        return {
          _id: '507f1f77bcf86cd799439011',
          nome: 'Usuario DB',
          email: 'x@y',
          role: 'diretor',
          foto: 'db.png',
          unidade_id: 'legacy-unit',
          funcionario_id: 'funcionario-db-legado',
        };
      },
      async findUnidadePrincipalLean() {
        throw new Error('fallback de master nao deve ser usado neste caso');
      },
      async findUnidadeLeanById() {
        throw new Error('a hidratacao legada deve ser delegada para a unidade extraivel');
      },
      async findFuncionarioByIdPopulate() {
        throw new Error('fallback por funcionario nao deve ser usado neste caso');
      },
    },
    legacyHydration: {
      async resolveRequireLoginLegacyHydration(input) {
        legacyHydrationCalls.push(input);
        return {
          kind: 'authenticated',
          reqUser: {
            _id: '507f1f77bcf86cd799439011',
            id: '507f1f77bcf86cd799439011',
            nome: 'Usuario DB',
            email: 'x@y',
            role: 'diretor',
            isMaster: false,
            foto: 'db.png',
            funcionario_id: 'funcionario-db-legado',
            unidade_id: 'legacy-unit',
            unidade_principal_id: 'legacy-principal',
            funcao: 'Analista',
          },
          sessionUserPatch: {
            foto: 'db.png',
          },
        };
      },
    },
  });

  const { requireLogin } = await importFreshRequireLogin('legacy-hydration');

  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
        gestorAuthContextResolverDeps: {
          fake: true,
        },
        gestorAuthContextMaxTimeMS: 4321,
      },
    },
    session: {
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'x@y',
        nome: 'Sessao Atual',
        role: 'user',
        unidade_id: 'legacy-session-unit',
        unidade_principal_id: 'legacy-session-principal',
        funcionario_id: 'funcionario-session-legado',
        funcao: 'Analista',
      },
      gestorAuthContext: {
        needs_selection: false,
        active_membership_id: 'mem-canonica',
        active_unidade_id: 'unit-canonical',
        global_role: null,
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

  assert.equal(nextCalled, true);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.jsonPayload, null);
  assert.equal(res.statusCode, 200);

  assert.deepEqual(findUserCalls, [{
    email: 'x@y',
    maxTimeMS: 3000,
  }]);

  assert.deepEqual(canonicalResolvedUserCalls, [{
    user: {
      _id: '507f1f77bcf86cd799439011',
      nome: 'Usuario DB',
      email: 'x@y',
      role: 'diretor',
      foto: 'db.png',
      unidade_id: 'legacy-unit',
      funcionario_id: 'funcionario-db-legado',
    },
    sessionUser: {
      id: '507f1f77bcf86cd799439011',
      email: 'x@y',
      nome: 'Sessao Atual',
      role: 'user',
      unidade_id: 'legacy-session-unit',
      unidade_principal_id: 'legacy-session-principal',
      funcionario_id: 'funcionario-session-legado',
      funcao: 'Analista',
    },
    existingAuthContext: {
      needs_selection: false,
      active_membership_id: 'mem-canonica',
      active_unidade_id: 'unit-canonical',
      global_role: null,
    },
    featureFlags: {
      gestor_auth_context_resolver: true,
    },
    deps: {
      fake: true,
    },
    maxTimeMS: 4321,
  }]);

  assert.equal(legacyHydrationCalls.length, 1);
  assert.deepEqual(legacyHydrationCalls[0].user, {
    _id: '507f1f77bcf86cd799439011',
    nome: 'Usuario DB',
    email: 'x@y',
    role: 'diretor',
    foto: 'db.png',
    unidade_id: 'legacy-unit',
    funcionario_id: 'funcionario-db-legado',
  });
  assert.deepEqual(legacyHydrationCalls[0].sessionUser, {
    id: '507f1f77bcf86cd799439011',
    email: 'x@y',
    nome: 'Sessao Atual',
    role: 'user',
    unidade_id: 'legacy-session-unit',
    unidade_principal_id: 'legacy-session-principal',
    funcionario_id: 'funcionario-session-legado',
    funcao: 'Analista',
  });
  assert.equal(legacyHydrationCalls[0].maxTimeMS, 3000);
  assert.equal(typeof legacyHydrationCalls[0].loadUnidadePrincipalLean, 'function');
  assert.equal(typeof legacyHydrationCalls[0].loadUnidadeLeanById, 'function');

  assert.deepEqual(req.user, {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    nome: 'Usuario DB',
    email: 'x@y',
    role: 'diretor',
    isMaster: false,
    foto: 'db.png',
    funcionario_id: 'funcionario-db-legado',
    unidade_id: 'legacy-unit',
    unidade_principal_id: 'legacy-principal',
    funcao: 'Analista',
  });

  assert.equal(req.session.user.foto, 'db.png');
});