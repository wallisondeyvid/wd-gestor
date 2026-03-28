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

test('requireLogin preserva o contrato externo enquanto encaminha o ramo resolved-user canônico pelas dependencias estruturais atuais', async () => {
  mock.reset();

  const findUserCalls = [];
  const resolvedUserCalls = [];

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

  await mock.module('#modules/gestor/app/db/auth.db.js', {
    namedExports: {
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
  });

  await mock.module('#modules/gestor/app/services/authContextResolver.js', {
    namedExports: {
      GESTOR_AUTH_CONTEXT_RESOLVER_FLAG: 'gestor_auth_context_resolver',
    },
  });

  await mock.module('#modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js', {
    namedExports: {
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