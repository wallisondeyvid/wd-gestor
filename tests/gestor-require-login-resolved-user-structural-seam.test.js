import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const REQUIRE_LOGIN_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/middlewares/requireLogin.js');
const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-mongoose';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-feature-flags';
const AUTH_DB_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-auth-db';
const AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-auth-context-resolver';
const CANONICAL_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-canonical-resolver';
const LEGACY_HYDRATION_MOCK_MODULE_URL = 'mock:gestor-require-login-resolved-user-legacy-hydration';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') {
      return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#core/config/featureFlags.js') {
      return { url: FEATURE_FLAGS_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/db/auth.db.js') {
      return { url: AUTH_DB_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/authContextResolver.js') {
      return { url: AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL, shortCircuit: true };
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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_MONGOOSE__ || {};",
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
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_FEATURE_FLAGS__ || {};",
          "export function isFeatureEnabled(...args) { return getMock().isFeatureEnabled(...args); }",
          "export function isFlagEnabled(...args) { return getMock().isFlagEnabled(...args); }",
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_DB__ || {};",
          "export async function findUserLeanByEmail(...args) { return await getMock().findUserLeanByEmail(...args); }",
          "export async function findFuncionarioByIdPopulate(...args) { return await getMock().findFuncionarioByIdPopulate(...args); }",
          "export async function findUnidadeLeanById(...args) { return await getMock().findUnidadeLeanById(...args); }",
          "export async function findUnidadePrincipalLean(...args) { return await getMock().findUnidadePrincipalLean(...args); }",
        ].join('\n'),
      };
    }

    if (url === AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_CONTEXT_RESOLVER__ || {};",
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = getMock().GESTOR_AUTH_CONTEXT_RESOLVER_FLAG;",
        ].join('\n'),
      };
    }

    if (url === CANONICAL_RESOLVER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_CANONICAL_RESOLVER__ || {};",
          "export async function resolveRequireLoginCanonicalResolvedUser(...args) { return await getMock().resolveRequireLoginCanonicalResolvedUser(...args); }",
        ].join('\n'),
      };
    }

    if (url === LEGACY_HYDRATION_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMock = () => globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_LEGACY_HYDRATION__ || {};",
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

function setRequireLoginResolvedUserMocks(mocks) {
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_MONGOOSE__ = mocks.mongoose;
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_FEATURE_FLAGS__ = mocks.featureFlags;
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_DB__ = mocks.authDb;
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_CONTEXT_RESOLVER__ = mocks.authContextResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_CANONICAL_RESOLVER__ = mocks.canonicalResolver;
  globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_LEGACY_HYDRATION__ = mocks.legacyHydration;
}

function clearRequireLoginResolvedUserMocks() {
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_MONGOOSE__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_FEATURE_FLAGS__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_DB__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_AUTH_CONTEXT_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_CANONICAL_RESOLVER__;
  delete globalThis.__GESTOR_REQUIRE_LOGIN_RESOLVED_USER_LEGACY_HYDRATION__;
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

test('requireLogin preserva o contrato externo enquanto encaminha o ramo resolved-user canônico pelas dependencias estruturais atuais', async () => {
  clearRequireLoginResolvedUserMocks();

  const findUserCalls = [];
  const resolvedUserCalls = [];

  setRequireLoginResolvedUserMocks({
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
    authDb: {
      async findUserLeanByEmail(input) {
        findUserCalls.push(input);
        return {
          _id: '507f1f77bcf86cd799439011',
          nome: 'Usuario DB',
          email: 'x@y',
          role: 'user',
          foto: 'db.png',
          unidade_id: 'legacy-unit',
          funcionario_id: 'funcionario-db-legado',
        };
      },
      async findFuncionarioByIdPopulate() {
        throw new Error('fallback por funcionario nao deve ser usado neste ramo');
      },
      async findUnidadeLeanById() {
        throw new Error('hidratacao legada nao deve ser usada quando a projecao canonica resolve o ramo');
      },
      async findUnidadePrincipalLean() {
        throw new Error('master fallback nao deve ser usado neste ramo');
      },
    },
    authContextResolver: {
      GESTOR_AUTH_CONTEXT_RESOLVER_FLAG: 'gestor_auth_context_resolver',
    },
    canonicalResolver: {
      async resolveRequireLoginCanonicalResolvedUser(input) {
        resolvedUserCalls.push(input);
        return {
          kind: 'authenticated',
          sessionUser: {
            id: '507f1f77bcf86cd799439011',
            email: 'x@y',
            nome: 'Usuario DB',
            role: 'diretor',
            global_role: null,
            unidade_id: 'unit-canonical',
            unidade_principal_id: 'principal-canonical',
            funcionario_id: 'funcionario-canonico',
            funcao: 'Analista',
            foto: 'db.png',
            auth_version: 'phase3',
          },
          reqUser: {
            _id: '507f1f77bcf86cd799439011',
            id: '507f1f77bcf86cd799439011',
            nome: 'Usuario DB',
            email: 'x@y',
            role: 'diretor',
            global_role: null,
            isMaster: false,
            foto: 'db.png',
            funcionario_id: 'funcionario-canonico',
            unidade_id: 'unit-canonical',
            unidade_principal_id: 'principal-canonical',
            funcao: 'Analista',
          },
        };
      },
    },
    legacyHydration: {
      async resolveRequireLoginLegacyHydration() {
        throw new Error('hidratacao legada nao deve ser usada quando a projecao canonica resolve o ramo');
      },
    },
  });

  const { requireLogin } = await importFreshRequireLogin('resolved-user-canonical');

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

  assert.deepEqual(resolvedUserCalls, [{
    user: {
      _id: '507f1f77bcf86cd799439011',
      nome: 'Usuario DB',
      email: 'x@y',
      role: 'user',
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

  assert.deepEqual(req.session.user, {
    id: '507f1f77bcf86cd799439011',
    email: 'x@y',
    nome: 'Usuario DB',
    role: 'diretor',
    global_role: null,
    unidade_id: 'unit-canonical',
    unidade_principal_id: 'principal-canonical',
    funcionario_id: 'funcionario-canonico',
    funcao: 'Analista',
    foto: 'db.png',
    auth_version: 'phase3',
  });

  assert.deepEqual(req.user, {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    nome: 'Usuario DB',
    email: 'x@y',
    role: 'diretor',
    global_role: null,
    isMaster: false,
    foto: 'db.png',
    funcionario_id: 'funcionario-canonico',
    unidade_id: 'unit-canonical',
    unidade_principal_id: 'principal-canonical',
    funcao: 'Analista',
  });
});