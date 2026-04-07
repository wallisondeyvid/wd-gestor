import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { registerHooks } from 'node:module';
import http from 'node:http';

import express from 'express';

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
  connection: { readyState: 1 },
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
  compareError: null,
  hashCalls: [],
};

const authDbState = {
  user: null,
  modulo: { _id: 'mod-gestor' },
  moduloLean: null,
  unidade: { modulosAcessiveis: ['mod-gestor'] },
  saveCalls: [],
};

const authContextState = {
  memberships: [],
  unidades: {},
};

const MONGOOSE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-runtime-mongoose';
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-runtime-bcryptjs';
const FEATURE_FLAGS_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-runtime-feature-flags';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-runtime-auth-db-bridge';
const AUTH_CONTEXT_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-login-post-auth-runtime-auth-context-db-bridge';

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
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MONGOOSE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_MONGOOSE_STATE__; export default state;",
      };
    }

    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_BCRYPT_STATE__;',
          'export default {',
          '  async compare() { if (state.compareError) throw state.compareError; return state.compareResult; },',
          '  async hash(value, rounds) {',
          '    state.hashCalls.push({ value, rounds });',
          "    return `$2b$${String(rounds).padStart(2, '0')}$rehashrehashrehashrehashrehashrehashrehashrehash`;",
          '  },',
          '};',
        ].join('\n'),
      };
    }

    if (url === FEATURE_FLAGS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_FEATURE_FLAGS_STATE__;',
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
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_DB_STATE__;'];
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
      const lines = ['const state = globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_CONTEXT_STATE__;'];
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
    authDbState.saveCalls.push({
      email: user?.email || null,
      failed_login_attempts: user?.failed_login_attempts ?? null,
      lock_until: user?.lock_until ?? null,
    });
    return user;
  },
};

const authContextDbBridgeMock = {
  async loadActiveMembershipsByUserId() {
    return authContextState.memberships;
  },
  async loadUnidadeById({ unidadeId }) {
    return authContextState.unidades[unidadeId] || null;
  },
};

globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_MONGOOSE_STATE__ = mongooseState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_BCRYPT_STATE__ = bcryptState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_FEATURE_FLAGS_STATE__ = featureFlagsState;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_DB_STATE__ = authDbBridgeMock;
globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_CONTEXT_STATE__ = authContextDbBridgeMock;

const { login } = await import('#modules/gestor/app/controllers/authController.js');
const { default: authRouter } = await import('#modules/gestor/app/routes/auth.js');

after(() => {
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_MONGOOSE_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_BCRYPT_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_FEATURE_FLAGS_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_DB_STATE__;
  delete globalThis.__GESTOR_AUTH_LOGIN_POST_AUTH_RUNTIME_AUTH_CONTEXT_STATE__;
});

beforeEach(() => {
  featureFlagsState.gestor_auth_context_resolver = false;
  mongooseState.connection.readyState = 1;
  bcryptState.compareResult = true;
  bcryptState.compareError = null;
  bcryptState.hashCalls.length = 0;
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
    role: 'admin',
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

function createResolverDeps({ memberships = [], unidades = {}, error = null } = {}) {
  return {
    async loadActiveMembershipsByUserId() {
      if (error) throw error;
      return memberships;
    },
    async loadUnidadeById({ unidadeId }) {
      return unidades[unidadeId] || null;
    },
  };
}

function createReqRes({
  user,
  resolverEnabled = false,
  resolverDeps,
  existingAuthContext,
  body = {},
} = {}) {
  featureFlagsState.gestor_auth_context_resolver = resolverEnabled;
  authDbState.user = user;

  const session = {
    gestorAuthContext: existingAuthContext,
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
    renderedView: null,
    renderedPayload: null,
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
      modulo: 'gestor',
      ...body,
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

async function startAuthAppServer() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/gestor', authRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

test('app real: gate necessario do login continua redirecionando erro de credencial ausente', async () => {
  const server = await startAuthAppServer();
  try {
    const response = await fetch(`${server.baseUrl}/gestor/login`, {
      method: 'POST',
      redirect: 'manual',
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/gestor/login?erro=usuario');
  } finally {
    await server.close();
  }
});

test('owner real: com resolvedor desligado o login segue sem persistir gestorAuthContext', async () => {
  const user = createUser({ role: 'admin' });
  const { request, response, session } = createReqRes({ user, resolverEnabled: false });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/dashboard');
  assert.deepEqual(session.user, {
    id: '507f1f77bcf86cd799439901',
    email: 'login@gestor.test',
  });
  assert.equal('gestorAuthContext' in session, false);
  assert.equal(session.saveCalls, 1);
});

test('owner real: com contexto pronto o login persiste gestorAuthContext e redireciona para dashboard', async () => {
  const user = createUser({
    role: 'diretor',
    unidade_id: '507f191e810c19729de860ea',
  });
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
  assert.equal(session.user.role, 'diretor');
  assert.equal(session.user.unidade_id, '507f191e810c19729de860ea');
  assert.equal(session.saveCalls, 1);
});

test('owner real: com needsUnitSelection true o login salva contexto parcial e redireciona para step select', async () => {
  const user = createUser({ role: 'diretor' });
  const resolverDeps = createResolverDeps({
    memberships: [
      {
        _id: '507f1f77bcf86cd799439903',
        user_id: '507f1f77bcf86cd799439901',
        unidade_id: '507f191e810c19729de860ea',
        papel_contextual: 'gestor',
        funcionario_id: 'func-903',
      },
      {
        _id: '507f1f77bcf86cd799439904',
        user_id: '507f1f77bcf86cd799439901',
        unidade_id: '507f191e810c19729de860eb',
        papel_contextual: 'user',
        funcionario_id: 'func-904',
      },
    ],
    unidades: {
      '507f191e810c19729de860ea': {
        _id: '507f191e810c19729de860ea',
        nome: 'Filial Norte',
        codigo: 'FN01',
        is_principal: false,
        unidade_principal_id: '507f191e810c19729de860ff',
      },
      '507f191e810c19729de860eb': {
        _id: '507f191e810c19729de860eb',
        nome: 'Base Sul',
        codigo: 'BS02',
        is_principal: true,
        unidade_principal_id: null,
      },
    },
  });
  const { request, response, session } = createReqRes({ user, resolverEnabled: true, resolverDeps });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?step=select');
  assert.deepEqual(session.gestorAuthContext, {
    user_id: '507f1f77bcf86cd799439901',
    user_email: 'login@gestor.test',
    global_role: null,
    active_membership_id: null,
    active_unidade_id: null,
    active_unidade_principal_id: null,
    active_papel_contextual: null,
    active_funcionario_id: null,
    legacy_role: null,
    needs_selection: true,
  });
  assert.equal(session.user.id, '507f1f77bcf86cd799439901');
  assert.equal(session.saveCalls, 1);
});

test('owner real: sem contexto valido o login limpa sessao autenticada e redireciona erro contexto', async () => {
  const user = createUser({ role: 'diretor' });
  const resolverDeps = createResolverDeps({ memberships: [] });
  const { request, response, session } = createReqRes({
    user,
    resolverEnabled: true,
    resolverDeps,
    existingAuthContext: {
      active_membership_id: 'stale-membership',
      active_unidade_id: '507f191e810c19729de860ea',
    },
  });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=contexto');
  assert.equal('user' in session, false);
  assert.equal('gestorAuthContext' in session, false);
  assert.equal(session.saveCalls, 1);
});

test('owner real: erro interno do resolvedor cai no catch geral e mantem apenas a sessao minima ja escrita', async () => {
  const user = createUser({ role: 'diretor' });
  const resolverDeps = createResolverDeps({
    error: new Error('resolver-boom'),
  });
  const { request, response, session } = createReqRes({
    user,
    resolverEnabled: true,
    resolverDeps,
    existingAuthContext: {
      active_membership_id: 'stale-membership',
    },
  });

  await login(request, response);

  assert.equal(response.redirectStatus, 303);
  assert.equal(response.redirectLocation, '/gestor/login?erro=servidor');
  assert.equal(response.getHeader('x-login-error'), 'resolver-boom');
  assert.deepEqual(session.user, {
    id: '507f1f77bcf86cd799439901',
    email: 'login@gestor.test',
  });
  assert.equal('gestorAuthContext' in session, false);
  assert.equal(session.saveCalls, 0);
});