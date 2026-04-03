import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, beforeEach, mock, test } from 'node:test';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const featureFlagsState = {
  gestor_auth_context_resolver: true,
};

const mongooseState = {
  connection: { readyState: 1 },
  isValidObjectId(value) {
    return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
  },
};

const bcryptState = {
  compareResult: true,
};

const authDbState = {
  user: null,
  modulo: { _id: 'mod-gestor' },
  unidade: { modulosAcessiveis: [] },
  findModuloByOrCalls: [],
  findUnidadeByIdSelectCalls: [],
};

const loginPostAuthContextState = {
  result: null,
  calls: [],
};

test('estado real atual: login preserva o corridor HTTP e a decisao de acesso ao modulo fica isolada no helper sem absorver excludes', () => {
  const seamPath = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/createLoginModuleAccessCore.js');
  const seamSource = fs.readFileSync(seamPath, 'utf8');

  assert.match(CONTROLLER_SOURCE, /import \{ createLoginModuleAccessCore \} from '#modules\/gestor\/app\/services\/auth\/createLoginModuleAccessCore\.js';/);
  assert.match(CONTROLLER_SOURCE, /const loginModuleAccess = createLoginModuleAccessCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /const loginPostAuthContextResult = await authContextOrchestration\.resolveLoginAuthContext\(/);
  assert.match(CONTROLLER_SOURCE, /const checagem = await Promise\.race\(\[/);
  assert.match(CONTROLLER_SOURCE, /loginModuleAccess\.evaluateModuleAccess\(\{ userDoc: effectiveLoginUser, moduloAlvoNome: moduloAlvo, basePath, authContext: resolvedLoginAuthContext \}\)/);
  assert.match(CONTROLLER_SOURCE, /if \(precisaTrocar.*return res\.redirect\(303, basePath \+ '\/primeiroacesso'\);/s);
  assert.match(CONTROLLER_SOURCE, /await createRememberToken\(/);
  assert.match(CONTROLLER_SOURCE, /return res\.status\(200\)\.render\('partials\/construcao'/);
  assert.match(CONTROLLER_SOURCE, /return res\.redirect\(303, basePath \+ '\/dashboard'\);/);

  assert.match(seamSource, /export function createLoginModuleAccessCore\(/);
  assert.match(seamSource, /async function evaluateModuleAccess\(\{ userDoc, moduloAlvoNome, basePath, authContext = null \} = \{\}\)/);
  assert.match(seamSource, /const modulo = await findModuloByOr\(/);
  assert.match(seamSource, /const unidadeIdEfetiva = unidadeIdCanonica \|\| userDoc\.unidade_id \|\| null;/);
  assert.match(seamSource, /const funcionario = await findFuncionarioByIdSelect\(/);
  assert.match(seamSource, /const funcao = await findFuncaoByIdSelect\(/);
  assert.doesNotMatch(seamSource, /bcrypt|failed_login_attempts|lock_until|createRememberToken|primeiroAcessoExecutionService/);
  assert.doesNotMatch(seamSource, /res\.redirect|res\.status\(200\)\.render\('partials\/construcao'|authContextOrchestration\.resolveLoginAuthContext/);
});

test('futura seam de module access recebe apenas usuario efetivo, modulo alvo, basePath e authContext resolvido', () => {
  const futureSeamSource = `function createLoginModuleAccessCore({ decideModuleAccess } = {}) {
    async function evaluateModuleAccess({ userDoc, moduloAlvoNome, basePath, authContext } = {}) {
      return decideModuleAccess({ userDoc, moduloAlvoNome, basePath, authContext });
    }

    return { evaluateModuleAccess };
  }`;

  assert.match(futureSeamSource, /function createLoginModuleAccessCore\(/);
  assert.match(futureSeamSource, /async function evaluateModuleAccess\(\{ userDoc, moduloAlvoNome, basePath, authContext \} = \{\}\)/);
  assert.doesNotMatch(futureSeamSource, /req|res|session|resolverEnabled|resolverDeps|maxTimeMS/);
  assert.doesNotMatch(futureSeamSource, /bcrypt|failed_login_attempts|lock_until|createRememberToken|primeiroAcessoExecutionService/);
  assert.doesNotMatch(futureSeamSource, /resolveLoginAuthContext|redirect|render\('partials\/construcao'|findModuloLeanByOrSelect/);
});

mock.module('mongoose', {
  defaultExport: mongooseState,
});

mock.module('bcryptjs', {
  defaultExport: {
    async compare() {
      return bcryptState.compareResult;
    },
    async hash() {
      return '$2b$12$rehashrehashrehashrehashrehashrehashrehashrehash';
    },
  },
});

mock.module('#core/config/featureFlags.js', {
  namedExports: {
    isFeatureEnabled(flags, flagName, fallback = false) {
      if (flags && Object.prototype.hasOwnProperty.call(flags, flagName)) {
        return flags[flagName] === true;
      }
      return fallback;
    },
    isFlagEnabled(flagName, fallback = false) {
      if (Object.prototype.hasOwnProperty.call(featureFlagsState, flagName)) {
        return featureFlagsState[flagName] === true;
      }
      return fallback;
    },
  },
});

mock.module('#modules/gestor/app/services/authContextResolver.js', {
  namedExports: {
    GESTOR_AUTH_CONTEXT_RESOLVER_FLAG: 'gestor_auth_context_resolver',
    async resolveGestorAuthContext() {
      return null;
    },
  },
});

mock.module('#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js', {
  namedExports: {
    async primeiroAcessoExecutionService() {
      return { kind: 'not_used' };
    },
  },
});

mock.module('#modules/gestor/app/services/auth/resolveLoginPostAuthContext.service.js', {
  namedExports: {
    async resolveLoginPostAuthContext(input) {
      loginPostAuthContextState.calls.push(input);
      return loginPostAuthContextState.result;
    },
  },
});

mock.module('#modules/gestor/app/services/authDbBridgeService.js', {
  namedExports: {
    async createPasswordReset() {
      return null;
    },
    async createRememberToken() {
      return null;
    },
    async deletePasswordResetById() {
      return null;
    },
    async findFuncaoByIdSelect() {
      return null;
    },
    async findFuncionarioByIdSelect() {
      return null;
    },
    async findFuncionariosByCpfSelect() {
      return [];
    },
    async findModuloByOr(input) {
      authDbState.findModuloByOrCalls.push(input);
      return authDbState.modulo;
    },
    async findModuloLeanByOrSelect() {
      return null;
    },
    async findPasswordResetByToken() {
      return null;
    },
    async findUnidadeByIdSelect(input) {
      authDbState.findUnidadeByIdSelectCalls.push(input);
      return authDbState.unidade;
    },
    async findUserByEmail() {
      return authDbState.user;
    },
    async findUserByEmailForLogin() {
      return authDbState.user;
    },
    async findUserByIdSelect() {
      return null;
    },
    async findUserByIdWithMaxTime() {
      return null;
    },
    async findUsersByCpf() {
      return [];
    },
    async findUsersByFuncionarioIds() {
      return [];
    },
    async revokeRememberTokenByHash() {
      return null;
    },
    async saveUserDocument(user) {
      return user;
    },
  },
});

const { login } = await import('#modules/gestor/app/controllers/authController.js');

after(() => {
  mock.restoreAll();
});

beforeEach(() => {
  featureFlagsState.gestor_auth_context_resolver = true;
  mongooseState.connection.readyState = 1;
  bcryptState.compareResult = true;
  authDbState.user = null;
  authDbState.modulo = { _id: 'mod-gestor' };
  authDbState.unidade = { modulosAcessiveis: [] };
  authDbState.findModuloByOrCalls.length = 0;
  authDbState.findUnidadeByIdSelectCalls.length = 0;
  loginPostAuthContextState.calls.length = 0;
  loginPostAuthContextState.result = null;
});

function createUser(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439901',
    email: 'login@gestor.test',
    nome: 'Usuario Login',
    senha: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    role: 'diretor',
    global_role: null,
    ativo: true,
    primeiro_acesso: false,
    senha_provisoria: false,
    failed_login_attempts: 0,
    lock_until: null,
    unidade_id: '507f191e810c19729de860ff',
    funcionario_id: 'func-stale',
    ...overrides,
  };
}

function createReqRes({ user, modulo = 'gestor' } = {}) {
  authDbState.user = user;

  const session = {
    saveCalls: 0,
    regenerate(callback) {
      callback(null);
    },
    save(callback) {
      this.saveCalls += 1;
      callback();
    },
  };

  const response = {
    redirectStatus: null,
    redirectLocation: null,
    renderedView: null,
    renderedPayload: null,
    cookieCalls: 0,
    setHeader() {},
    cookie() {
      this.cookieCalls += 1;
    },
    clearCookie() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, payload) {
      this.renderedView = view;
      this.renderedPayload = payload;
      return this;
    },
    redirect(statusOrLocation, maybeLocation) {
      if (typeof maybeLocation === 'string') {
        this.redirectStatus = statusOrLocation;
        this.redirectLocation = maybeLocation;
      } else {
        this.redirectStatus = 302;
        this.redirectLocation = statusOrLocation;
      }
      return this;
    },
  };

  const request = {
    baseUrl: '/gestor',
    body: {
      email: user?.email || 'login@gestor.test',
      senha: 'senha-correta',
      modulo,
    },
    query: {},
    headers: {
      'user-agent': 'structural-test',
    },
    ip: '127.0.0.1',
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
        gestorAuthContextResolverDeps: { ignored: true },
        gestorAuthContextMaxTimeMS: 1000,
      },
    },
    session,
  };

  return { request, response, session };
}

test('owner preserva o redirect final de modulo negado e a decisao semantica usa apenas modulo alvo, effectiveLoginUser e authContext resolvido', async () => {
  const unidadeContextualId = '507f191e810c19729de860ea';
  const user = createUser();
  loginPostAuthContextState.result = {
    kind: 'continue',
    effectiveLoginUser: {
      ...user,
      unidade_id: '507f191e810c19729de860ff',
      funcionario_id: 'func-stale',
      role: 'diretor',
    },
    resolvedAuthContext: {
      source: 'auth-context-v1',
      activeContext: {
        unidadeId: unidadeContextualId,
        unidadePrincipalId: unidadeContextualId,
        papelContextual: 'gestor',
        funcionarioId: 'func-902',
      },
      effectiveRole: 'diretor',
      globalRole: null,
    },
  };

  const { request, response, session } = createReqRes({ user, modulo: 'gestor' });

  await login(request, response);

  assert.equal(loginPostAuthContextState.calls.length, 1);
  assert.equal(authDbState.findModuloByOrCalls.length, 1);
  assert.equal(authDbState.findUnidadeByIdSelectCalls.length, 1);
  assert.equal(authDbState.findUnidadeByIdSelectCalls[0].id, unidadeContextualId);
  assert.notEqual(authDbState.findUnidadeByIdSelectCalls[0].id, user.unidade_id);
  assert.equal(authDbState.findUnidadeByIdSelectCalls[0].select, 'modulosAcessiveis');
  assert.ok(/gestor/i.test(String(authDbState.findModuloByOrCalls[0].or[0].nome)));
  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=modulo&motivo=modulo_nao_habilitado_unidade');
  assert.equal(response.renderedView, null);
  assert.equal(response.cookieCalls, 0);
  assert.equal(session.saveCalls, 0);
});