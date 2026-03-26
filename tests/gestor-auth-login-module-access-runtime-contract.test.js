import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';

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

mock.module('mongoose', {
  defaultExport: mongooseState,
});

mock.module('bcryptjs', {
  defaultExport: {
    async compare() {
      if (bcryptState.compareError) throw bcryptState.compareError;
      return bcryptState.compareResult;
    },
    async hash(value, rounds) {
      return `$2b$${String(rounds).padStart(2, '0')}$${String(value).padEnd(53, 'a').slice(0, 53)}`;
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

mock.module('nodemailer', {
  defaultExport: {
    createTransport() {
      return {
        async sendMail() {
          return { messageId: 'mock-mail' };
        },
      };
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
  },
});

const authContextState = {
  memberships: [],
  unidades: {},
  error: null,
};

mock.module('#modules/gestor/app/services/authContextDbBridgeService.js', {
  namedExports: {
    async loadActiveMembershipsByUserId() {
      if (authContextState.error) throw authContextState.error;
      return authContextState.memberships;
    },
    async loadUnidadeById({ unidadeId }) {
      return authContextState.unidades[unidadeId] || null;
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