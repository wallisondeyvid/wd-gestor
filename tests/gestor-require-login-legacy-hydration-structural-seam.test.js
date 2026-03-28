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

test('requireLogin preserva o contrato externo enquanto percorre o caminho de hidratacao legada apos o caminho canonico nao autenticar', async () => {
  mock.reset();

  const findUserCalls = [];
  const canonicalResolvedUserCalls = [];
  const legacyHydrationCalls = [];

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

  await mock.module('#modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js', {
    namedExports: {
      async resolveRequireLoginCanonicalResolvedUser(input) {
        canonicalResolvedUserCalls.push(input);
        return { kind: 'continue' };
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
  });

  await mock.module('#modules/gestor/app/services/auth/resolveRequireLoginLegacyHydration.service.js', {
    namedExports: {
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