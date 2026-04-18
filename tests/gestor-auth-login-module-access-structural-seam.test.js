import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { registerHooks } from 'node:module';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const featureFlagsState = {
  gestor_auth_context_resolver: true,
};

class SchemaMock {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.statics = {};
  }

  index() { return this; }
  pre() { return this; }
  post() { return this; }
  add() { return this; }
  set() { return this; }
  plugin() { return this; }
  method() { return this; }
  static() { return this; }
  path() {
    return {
      options: {},
      validate() { return this; },
      get() { return this; },
      set() { return this; },
    };
  }
  virtual() {
    return {
      get() { return this; },
      set() { return this; },
    };
  }
}

SchemaMock.Types = {
  ObjectId: class ObjectIdSchemaTypeMock {},
};

function createQuery(value) {
  const resolveValue = () => (typeof value === 'function' ? value() : value);
  return {
    select() { return this; },
    lean() { return Promise.resolve(resolveValue()); },
    maxTimeMS() { return this; },
    populate() { return this; },
    sort() { return this; },
    exec() { return Promise.resolve(resolveValue()); },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolveValue()).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.resolve(resolveValue()).catch(onRejected);
    },
  };
}

function buildModelMock(name) {
  const lowered = String(name || '').toLowerCase();
  if (lowered.includes('membership')) {
    return {
      find() { return createQuery([]); },
      findOne() { return createQuery(null); },
    };
  }
  if (lowered.includes('user')) {
    return {
      findOne() { return createQuery(authDbState.user); },
      findById() { return createQuery(authDbState.user); },
    };
  }
  if (lowered.includes('unidade')) {
    return {
      findOne() { return createQuery(authDbState.unidade); },
      findById() { return createQuery(authDbState.unidade); },
    };
  }
  return {
    findOne() { return createQuery(null); },
    findById() { return createQuery(null); },
    find() { return createQuery([]); },
  };
}

const mongooseState = {
  connection: {
    readyState: 1,
    useDb() {
      return this;
    },
    model(name) {
      return mongooseState.model(name);
    },
  },
  models: {},
  Schema: SchemaMock,
  model(name) {
    if (!this.models[name]) this.models[name] = buildModelMock(name);
    return this.models[name];
  },
  isValidObjectId(value) {
    return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
  },
  Types: {
    ObjectId: class ObjectIdMock {
      constructor(value) {
        this.value = String(value || '');
      }

      toString() {
        return this.value;
      }
    },
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

const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-mongoose';
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-bcryptjs';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-feature-flags';
const AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-auth-context-resolver';
const PRIMEIRO_ACESSO_EXECUTION_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-primeiro-acesso-execution';
const LOGIN_POST_AUTH_CONTEXT_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-login-post-auth-context';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-auth-db-bridge';

const AUTH_DB_BRIDGE_EXPORTS = [
  'createPasswordReset',
  'createRememberToken',
  'deletePasswordResetById',
  'findFuncaoByIdSelect',
  'findFuncionarioByIdSelect',
  'findFuncionariosByCpfSelect',
  'findModuloByOr',
  'findModuloLeanByOrSelect',
  'findPasswordResetByToken',
  'findUnidadeByIdSelect',
  'findUserByEmail',
  'findUserByEmailForLogin',
  'findUserByIdSelect',
  'findUserByIdWithMaxTime',
  'findUsersByCpf',
  'findUsersByFuncionarioIds',
  'revokeRememberTokenByHash',
  'saveUserDocument',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'bcryptjs') return { url: BCRYPT_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#core/config/featureFlags.js') return { url: FEATURE_FLAGS_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authContextResolver.js') return { url: AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js') return { url: PRIMEIRO_ACESSO_EXECUTION_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/auth/resolveLoginPostAuthContext.service.js') return { url: LOGIN_POST_AUTH_CONTEXT_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') return { url: AUTH_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_MONGOOSE_STATE__; export default state;",
      };
    }

    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_BCRYPT_STATE__;',
          'export default {',
          '  async compare() { return state.compareResult; },',
          "  async hash() { return '$2b$12$rehashrehashrehashrehashrehashrehashrehashrehash'; },",
          '};',
        ].join('\n'),
      };
    }

    if (url === FEATURE_FLAGS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_FEATURE_FLAGS_STATE__;',
          'export function isFeatureEnabled(flags, flagName, fallback = false) {',
          '  if (flags && Object.prototype.hasOwnProperty.call(flags, flagName)) return flags[flagName] === true;',
          '  return fallback;',
          '}',
          'export function isFlagEnabled(flagName, fallback = false) {',
          '  if (Object.prototype.hasOwnProperty.call(state, flagName)) return state[flagName] === true;',
          '  return fallback;',
          '}',
        ].join('\n'),
      };
    }

    if (url === AUTH_CONTEXT_RESOLVER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = 'gestor_auth_context_resolver';",
          'export async function resolveGestorAuthContext() { return null; }',
        ].join('\n'),
      };
    }

    if (url === PRIMEIRO_ACESSO_EXECUTION_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "export async function primeiroAcessoExecutionService() { return { kind: 'not_used' }; }",
      };
    }

    if (url === LOGIN_POST_AUTH_CONTEXT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_LOGIN_POST_AUTH_CONTEXT_STATE__;',
          'export async function resolveLoginPostAuthContext(input) {',
          '  state.calls.push(input);',
          '  return state.result;',
          '}',
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_AUTH_DB_STATE__;'];
      for (const exportName of AUTH_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await state['${exportName}'](...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

test('estado real atual: login preserva o corridor HTTP e a decisao de acesso ao modulo fica isolada no helper sem absorver excludes', () => {
  const seamPath = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/createLoginModuleAccessCore.js');
  const seamSource = fs.readFileSync(seamPath, 'utf8');
  const outcomePath = path.join(process.cwd(), 'src/modules/gestor/app/services/auth/resolveLoginSuccessOutcome.service.js');
  const outcomeSource = fs.readFileSync(outcomePath, 'utf8');

  assert.match(CONTROLLER_SOURCE, /import \{ createLoginModuleAccessCore \} from '#modules\/gestor\/app\/services\/auth\/createLoginModuleAccessCore\.js';/);
  assert.match(CONTROLLER_SOURCE, /import \{ resolveLoginSuccessOutcome \} from '#modules\/gestor\/app\/services\/auth\/resolveLoginSuccessOutcome\.service\.js';/);
  assert.match(CONTROLLER_SOURCE, /const loginModuleAccess = createLoginModuleAccessCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /const loginPostAuthContextResult = await authContextOrchestration\.resolveLoginAuthContext\(/);
  assert.match(CONTROLLER_SOURCE, /const earlyLoginSuccessOutcome = await resolveLoginSuccessOutcome\(\{/);
  assert.match(CONTROLLER_SOURCE, /const checagem = await Promise\.race\(\[/);
  assert.match(CONTROLLER_SOURCE, /loginModuleAccess\.evaluateModuleAccess\(\{ userDoc: effectiveLoginUser, moduloAlvoNome: moduloAlvo, basePath, authContext: resolvedLoginAuthContext \}\)/);
  assert.match(CONTROLLER_SOURCE, /const finalLoginSuccessOutcome = await resolveLoginSuccessOutcome\(\{/);
  assert.match(CONTROLLER_SOURCE, /await createRememberToken\(/);
  assert.match(CONTROLLER_SOURCE, /return res\.status\(finalLoginSuccessOutcome\.statusCode\)\.render\(finalLoginSuccessOutcome\.view, finalLoginSuccessOutcome\.payload\);/);
  assert.match(CONTROLLER_SOURCE, /return res\.redirect\(303, finalLoginSuccessOutcome\.location\);/);

  assert.match(seamSource, /export function createLoginModuleAccessCore\(/);
  assert.match(seamSource, /async function evaluateModuleAccess\(\{ userDoc, moduloAlvoNome, basePath, authContext = null \} = \{\}\)/);
  assert.match(seamSource, /function resolveCanonicalActiveUnitId\(authContext\)/);
  assert.match(seamSource, /function resolveTenantSensitiveUnitId\(\{ authContext, legacyUnitId \}\)/);
  assert.match(seamSource, /const modulo = await findModuloByOr\(/);
  assert.match(seamSource, /const unidadeIdEfetiva = resolveTenantSensitiveUnitId\(\{/);
  assert.match(seamSource, /const funcionario = await findFuncionarioByIdSelect\(/);
  assert.match(seamSource, /const funcao = await findFuncaoByIdSelect\(/);
  assert.doesNotMatch(seamSource, /bcrypt|failed_login_attempts|lock_until|createRememberToken|primeiroAcessoExecutionService/);
  assert.doesNotMatch(seamSource, /res\.redirect|res\.status\(200\)\.render\('partials\/construcao'|authContextOrchestration\.resolveLoginAuthContext/);

  assert.match(outcomeSource, /export async function resolveLoginSuccessOutcome\(/);
  assert.match(outcomeSource, /location: basePath \+ '\/primeiroacesso'/);
  assert.match(outcomeSource, /location: `\$\{basePath\}\/login\?erro=modulo&motivo=\$\{motivo\}`/);
  assert.match(outcomeSource, /view: 'partials\/construcao'/);
  assert.match(outcomeSource, /location: basePath \+ '\/dashboard'/);
  assert.doesNotMatch(outcomeSource, /createRememberToken|resolveLoginAuthContext|failed_login_attempts|lock_until|bcrypt/);
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

const authDbBridgeMock = {
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
};

globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_MONGOOSE_STATE__ = mongooseState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_BCRYPT_STATE__ = bcryptState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_FEATURE_FLAGS_STATE__ = featureFlagsState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_LOGIN_POST_AUTH_CONTEXT_STATE__ = loginPostAuthContextState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_AUTH_DB_STATE__ = authDbBridgeMock;

const { login } = await import('#modules/gestor/app/controllers/authController.js');

after(() => {
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_MONGOOSE_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_BCRYPT_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_FEATURE_FLAGS_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_LOGIN_POST_AUTH_CONTEXT_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_AUTH_DB_STATE__;
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

test('owner nao recai para userDoc.unidade_id quando o auth-context v1 existe sem unidade canonica ativa', async () => {
  const user = createUser();
  loginPostAuthContextState.result = {
    kind: 'continue',
    effectiveLoginUser: {
      ...user,
      unidade_id: '507f191e810c19729de860ff',
      role: 'diretor',
    },
    resolvedAuthContext: {
      source: 'auth-context-v1',
      activeContext: null,
      effectiveRole: 'diretor',
      globalRole: null,
    },
  };

  const { request, response } = createReqRes({ user, modulo: 'gestor' });

  await login(request, response);

  assert.equal(authDbState.findModuloByOrCalls.length, 1);
  assert.equal(authDbState.findUnidadeByIdSelectCalls.length, 0);
  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=modulo&motivo=diretor_sem_unidade');
});