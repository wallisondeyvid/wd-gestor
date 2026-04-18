import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { registerHooks } from 'node:module';

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
      find() { return createQuery(authContextState.memberships); },
      findOne() { return createQuery(authContextState.memberships[0] || null); },
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
      findOne(query = {}) {
        const id = query._id || query.id || query.unidade_id || null;
        return createQuery(id ? (authContextState.unidades[id] || authDbState.unidade || null) : (authDbState.unidade || null));
      },
      findById(id) { return createQuery(authContextState.unidades[id] || authDbState.unidade || null); },
    };
  }
  if (lowered.includes('funcionario')) {
    return {
      findOne() { return createQuery(authDbState.funcionario); },
      findById() { return createQuery(authDbState.funcionario); },
    };
  }
  if (lowered.includes('funcao')) {
    return {
      findOne() { return createQuery(authDbState.funcao); },
      findById() { return createQuery(authDbState.funcao); },
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
  compareError: null,
};

const authDbState = {
  user: null,
  modulo: { _id: 'mod-gestor' },
  plannedModulo: null,
  unidade: { modulosAcessiveis: ['mod-gestor'] },
  funcionario: null,
  funcao: null,
  saveCalls: [],
};

const authContextState = {
  memberships: [],
  unidades: {},
  error: null,
};

const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-mongoose';
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-bcryptjs';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-feature-flags';
const NODEMAILER_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-nodemailer';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-auth-db-bridge';
const AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-module-access-runtime-auth-context-db-bridge';

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

const AUTH_CONTEXT_DB_BRIDGE_EXPORTS = [
  'loadActiveMembershipsByUserId',
  'loadUnidadeById',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mongoose') return { url: MONGOOSE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'bcryptjs') return { url: BCRYPT_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#core/config/featureFlags.js') return { url: FEATURE_FLAGS_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'nodemailer') return { url: NODEMAILER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') return { url: AUTH_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authContextDbBridgeService.js') return { url: AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_MONGOOSE_STATE__; export default state;",
      };
    }

    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_BCRYPT_STATE__;',
          'export default {',
          '  async compare() { if (state.compareError) throw state.compareError; return state.compareResult; },',
          "  async hash(value, rounds) { return `$2b$${String(rounds).padStart(2, '0')}$${String(value).padEnd(53, 'a').slice(0, 53)}`; }",
          '};',
        ].join('\n'),
      };
    }

    if (url === FEATURE_FLAGS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_FEATURE_FLAGS_STATE__;',
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

    if (url === NODEMAILER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export default {',
          '  createTransport() {',
          '    return {',
          "      async sendMail() { return { messageId: 'mock-mail' }; },",
          '    };',
          '  },',
          '};',
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_DB_STATE__;'];
      for (const exportName of AUTH_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await state['${exportName}'](...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_CONTEXT_STATE__;'];
      for (const exportName of AUTH_CONTEXT_DB_BRIDGE_EXPORTS) {
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
    return authDbState.funcao;
  },
  async findFuncionarioByIdSelect() {
    return authDbState.funcionario;
  },
  async findFuncionariosByCpfSelect() {
    return [];
  },
  async findModuloByOr() {
    return authDbState.modulo;
  },
  async findModuloLeanByOrSelect() {
    return authDbState.plannedModulo;
  },
  async findPasswordResetByToken() {
    return null;
  },
  async findUnidadeByIdSelect() {
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
    authDbState.saveCalls.push(user?.email || null);
    return user;
  },
};

const authContextDbBridgeMock = {
  async loadActiveMembershipsByUserId() {
    if (authContextState.error) throw authContextState.error;
    return authContextState.memberships;
  },
  async loadUnidadeById({ unidadeId }) {
    return authContextState.unidades[unidadeId] || null;
  },
};

globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_MONGOOSE_STATE__ = mongooseState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_BCRYPT_STATE__ = bcryptState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_FEATURE_FLAGS_STATE__ = featureFlagsState;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_DB_STATE__ = authDbBridgeMock;
globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_CONTEXT_STATE__ = authContextDbBridgeMock;

const { login } = await import('#modules/gestor/app/controllers/authController.js');

after(() => {
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_MONGOOSE_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_BCRYPT_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_FEATURE_FLAGS_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_DB_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_MODULE_ACCESS_RUNTIME_AUTH_CONTEXT_STATE__;
});

beforeEach(() => {
  featureFlagsState.gestor_auth_context_resolver = true;
  mongooseState.connection.readyState = 1;
  bcryptState.compareResult = true;
  bcryptState.compareError = null;

  authDbState.user = null;
  authDbState.modulo = { _id: 'mod-gestor' };
  authDbState.plannedModulo = null;
  authDbState.unidade = { modulosAcessiveis: ['mod-gestor'] };
  authDbState.funcionario = null;
  authDbState.funcao = null;
  authDbState.saveCalls.length = 0;

  authContextState.memberships = [];
  authContextState.unidades = {};
  authContextState.error = null;
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
    unidade_id: null,
    funcionario_id: null,
    ...overrides,
  };
}

function createReqRes({ user, memberships, unidades, body = {}, funcionario = null, funcao = null, unidade = null } = {}) {
  authDbState.user = user;
  authDbState.funcionario = funcionario;
  authDbState.funcao = funcao;
  if (unidade) authDbState.unidade = unidade;
  authContextState.memberships = memberships || [];
  authContextState.unidades = unidades || {};

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

  const headers = new Map();
  const response = {
    statusCode: 200,
    redirectStatus: null,
    redirectLocation: null,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    cookie() {},
    clearCookie() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    render() {
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
      modulo: 'gestor',
      ...body,
    },
    query: {},
    headers: {},
    ip: '127.0.0.1',
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
        gestorAuthContextResolverDeps: undefined,
        gestorAuthContextMaxTimeMS: 1000,
      },
    },
    session,
  };

  return { request, response, session };
}

function createReadyMembership({
  membershipId = '507f1f77bcf86cd799439902',
  unidadeId = '507f191e810c19729de860ea',
  papelContextual = 'gestor',
  funcionarioId = 'func-902',
} = {}) {
  return {
    _id: membershipId,
    user_id: '507f1f77bcf86cd799439901',
    unidade_id: unidadeId,
    papel_contextual: papelContextual,
    funcionario_id: funcionarioId,
  };
}

function createResolverUnidade({
  unidadeId = '507f191e810c19729de860ea',
  nome = 'Matriz Centro',
  codigo = 'MC01',
  isPrincipal = true,
  unidadePrincipalId = null,
} = {}) {
  return {
    _id: unidadeId,
    nome,
    codigo,
    is_principal: isPrincipal,
    unidade_principal_id: unidadePrincipalId,
  };
}

test('owner real: diretor contextualizado sem modulo habilitado redireciona erro=modulo com motivo concreto', async () => {
  const user = createUser({ role: 'diretor' });
  const unidadeId = '507f191e810c19729de860ea';
  const { request, response, session } = createReqRes({
    user,
    memberships: [createReadyMembership({ unidadeId, papelContextual: 'gestor', funcionarioId: 'func-902' })],
    unidades: {
      [unidadeId]: createResolverUnidade({ unidadeId }),
    },
    unidade: { modulosAcessiveis: [] },
  });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=modulo&motivo=modulo_nao_habilitado_unidade');
  assert.deepEqual(session.gestorAuthContext, {
    user_id: '507f1f77bcf86cd799439901',
    user_email: 'login@gestor.test',
    global_role: null,
    active_membership_id: '507f1f77bcf86cd799439902',
    active_unidade_id: unidadeId,
    active_unidade_principal_id: unidadeId,
    active_papel_contextual: 'gestor',
    active_funcionario_id: 'func-902',
    legacy_role: 'diretor',
    needs_selection: false,
  });
});

test('owner real: user contextualizado sem funcao redireciona erro=modulo com motivo user_sem_funcao', async () => {
  const user = createUser({ role: 'user', funcionario_id: 'func-903' });
  const unidadeId = '507f191e810c19729de860ea';
  const { request, response } = createReqRes({
    user,
    memberships: [createReadyMembership({ unidadeId, papelContextual: 'user', funcionarioId: 'func-903' })],
    unidades: {
      [unidadeId]: createResolverUnidade({ unidadeId }),
    },
    funcionario: {
      _id: 'func-903',
      funcao_id: null,
      unidade_id: unidadeId,
    },
    unidade: { modulosAcessiveis: ['mod-gestor'] },
  });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=modulo&motivo=user_sem_funcao');
});

test('owner real: diretor contextualizado com modulo habilitado segue para dashboard', async () => {
  const user = createUser({ role: 'diretor' });
  const unidadeId = '507f191e810c19729de860ea';
  const { request, response, session } = createReqRes({
    user,
    memberships: [createReadyMembership({ unidadeId, papelContextual: 'gestor', funcionarioId: 'func-904' })],
    unidades: {
      [unidadeId]: createResolverUnidade({ unidadeId }),
    },
    unidade: { modulosAcessiveis: ['mod-gestor'] },
  });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/dashboard');
  assert.equal(session.user.role, 'diretor');
  assert.equal(session.user.unidade_id, unidadeId);
  assert.equal(session.saveCalls, 1);
});