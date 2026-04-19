import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { registerHooks } from 'node:module';

const featureFlagsState = {
  gestor_auth_context_resolver: false,
};

class MockSchema {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.statics = {};
    this.paths = new Map();
  }

  index() {
    return this;
  }

  plugin() {
    return this;
  }

  pre() {
    return this;
  }

  post() {
    return this;
  }

  virtual() {
    return {
      get() {
        return this;
      },
      set() {
        return this;
      },
    };
  }

  set() {
    return this;
  }

  add(extraDefinition = {}) {
    Object.assign(this.definition, extraDefinition);
    return this;
  }

  path(name) {
    if (!this.paths.has(name)) {
      this.paths.set(name, { options: {}, enumValues: [] });
    }
    return this.paths.get(name);
  }
}

MockSchema.Types = {
  ObjectId: class MockObjectId {
    constructor(value) {
      this.value = value;
    }

    toString() {
      return String(this.value || '');
    }

    static isValid(value) {
      return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
    }
  },
  Mixed: class MockMixed {},
};

function createMockModel(name) {
  return class MockModel {
    static modelName = name;

    constructor(doc = {}) {
      Object.assign(this, doc);
    }

    static find() {
      return [];
    }

    static findOne() {
      return null;
    }

    static findById() {
      return null;
    }

    static updateOne() {
      return { acknowledged: true };
    }

    static create(doc = {}) {
      return new this(doc);
    }

    async save() {
      return this;
    }
  };
}

const mongooseState = {
  connection: {
    readyState: 1,
    models: {},
    model(name) {
      return mongooseState.model(name);
    },
  },
  Schema: MockSchema,
  models: {},
  model(name) {
    if (!this.models[name]) {
      this.models[name] = createMockModel(name);
    }
    return this.models[name];
  },
  Types: MockSchema.Types,
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
  moduloLean: null,
  unidade: { modulosAcessiveis: ['mod-gestor'] },
  saveCalls: [],
};

const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-mongoose';
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-bcryptjs';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-feature-flags';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-auth-db-bridge';
const AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-auth-context-db-bridge';
const LOGIN_PRE_AUTH_DATA_FACADE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-context-login-pre-auth-data-facade';

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
    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') return { url: AUTH_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/authContextDbBridgeService.js') return { url: AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/data/auth/loginPreAuthGateDataFacade.js') return { url: LOGIN_PRE_AUTH_DATA_FACADE_MOCK_MODULE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_MONGOOSE_STATE__; export default state;",
      };
    }

    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_BCRYPT_STATE__;',
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
          'const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_FEATURE_FLAGS_STATE__;',
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

    if (url === AUTH_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_DB_STATE__;'];
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
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_CONTEXT_DB_STATE__;'];
      for (const exportName of AUTH_CONTEXT_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await state['${exportName}'](...args); }`);
      }
      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === LOGIN_PRE_AUTH_DATA_FACADE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const authDbState = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_DB_STATE__;',
          'export async function loadLoginPreAuthUserData() {',
          "  return await authDbState.findUserByEmailForLogin();",
          '}',
          'export async function saveLoginPreAuthUserStateData({ user }) {',
          '  return await authDbState.saveUserDocument(user);',
          '}',
        ].join('\n'),
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
    return null;
  },
  async findFuncionarioByIdSelect() {
    return null;
  },
  async findFuncionariosByCpfSelect() {
    return [];
  },
  async findModuloByOr() {
    return authDbState.modulo;
  },
  async findModuloLeanByOrSelect() {
    return authDbState.moduloLean;
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
    return [];
  },
  async loadUnidadeById() {
    return null;
  },
};

globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_MONGOOSE_STATE__ = mongooseState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_BCRYPT_STATE__ = bcryptState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_FEATURE_FLAGS_STATE__ = featureFlagsState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_DB_STATE__ = authDbBridgeMock;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_CONTEXT_DB_STATE__ = authContextDbBridgeMock;

const { login } = await import('#modules/gestor/app/controllers/authController.js');

after(() => {
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_MONGOOSE_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_BCRYPT_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_FEATURE_FLAGS_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_DB_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_CONTEXT_AUTH_CONTEXT_DB_STATE__;
});

beforeEach(() => {
  featureFlagsState.gestor_auth_context_resolver = false;
  mongooseState.connection.readyState = 1;
  bcryptState.compareResult = true;
  authDbState.user = null;
  authDbState.modulo = { _id: 'mod-gestor' };
  authDbState.moduloLean = null;
  authDbState.unidade = { modulosAcessiveis: ['mod-gestor'] };
  authDbState.saveCalls.length = 0;
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
    unidade_id: '507f191e810c19729de860ea',
    funcionario_id: 'func-902',
    ...overrides,
  };
}

function createResolverDeps({ memberships = [], unidades = {} } = {}) {
  return {
    async loadActiveMembershipsByUserId() {
      return memberships;
    },
    async loadUnidadeById({ unidadeId }) {
      return unidades[unidadeId] || null;
    },
  };
}

function createReqRes({ user, resolverEnabled = false, resolverDeps } = {}) {
  featureFlagsState.gestor_auth_context_resolver = resolverEnabled;
  authDbState.user = user;

  const session = {
    gestorAuthContext: undefined,
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
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    cookie() {},
    clearCookie() {},
    status(code) {
      this.statusCode = code;
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
    },
    query: {},
    headers: {},
    ip: '127.0.0.1',
    app: {
      locals: {
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: resolverEnabled,
        },
        gestorAuthContextResolverDeps: resolverDeps,
        gestorAuthContextMaxTimeMS: 1000,
      },
    },
    session,
  };

  return { request, response, session };
}

test('owner caracteriza o bloco pos-auth-context pronto e preserva o redirect final esperado', async () => {
  const user = createUser();
  const resolverDeps = createResolverDeps({
    memberships: [
      {
        _id: '507f1f77bcf86cd799439902',
        user_id: '507f1f77bcf86cd799439901',
        unidade_id: '507f191e810c19729de860ea',
        papel_contextual: 'gestor',
        funcionario_id: 'func-902',
      },
    ],
    unidades: {
      '507f191e810c19729de860ea': {
        _id: '507f191e810c19729de860ea',
        nome: 'Matriz Centro',
        codigo: 'MC01',
        is_principal: true,
        unidade_principal_id: null,
      },
    },
  });
  const { request, response, session } = createReqRes({ user, resolverEnabled: true, resolverDeps });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/dashboard');
  assert.deepEqual(session.gestorAuthContext, {
    user_id: '507f1f77bcf86cd799439901',
    user_email: 'login@gestor.test',
    global_role: null,
    active_membership_id: '507f1f77bcf86cd799439902',
    active_unidade_id: '507f191e810c19729de860ea',
    active_unidade_principal_id: '507f191e810c19729de860ea',
    active_papel_contextual: 'gestor',
    active_funcionario_id: 'func-902',
    legacy_role: 'diretor',
    needs_selection: false,
  });
  assert.deepEqual(session.user, {
    id: '507f1f77bcf86cd799439901',
    email: 'login@gestor.test',
    role: 'diretor',
    global_role: null,
    unidade_id: '507f191e810c19729de860ea',
    unidade_principal_id: '507f191e810c19729de860ea',
    funcionario_id: 'func-902',
    auth_version: 'phase3',
  });
  assert.equal(session.saveCalls, 1);
});