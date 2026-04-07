import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const CONTROLLER_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/controllers/authController.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js');
const BCRYPT_MOCK_MODULE_URL = 'mock:gestor-auth-primeiro-acesso-bcryptjs';
const EXECUTION_SERVICE_MOCK_MODULE_URL = 'mock:gestor-auth-primeiro-acesso-execution-service';
const AUTH_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-auth-primeiro-acesso-auth-db-bridge';

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
    if (specifier === 'bcryptjs') {
      return { url: BCRYPT_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js') {
      return { url: EXECUTION_SERVICE_MOCK_MODULE_URL, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') {
      return { url: AUTH_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === BCRYPT_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getMocks = () => globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_BCRYPT_MOCKS__ || {};',
          'const bcryptMock = {',
          '  async hash(...args) {',
          "    const fn = getMocks().hash;",
          "    if (typeof fn === 'function') return await fn(...args);",
          "    return 'hash-gerado';",
          '  },',
          '  async compare(...args) {',
          "    const fn = getMocks().compare;",
          "    if (typeof fn === 'function') return await fn(...args);",
          '    return false;',
          '  },',
          '};',
          'export default bcryptMock;',
        ].join('\n'),
      };
    }

    if (url === EXECUTION_SERVICE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const getMocks = () => globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_EXECUTION_SERVICE_MOCKS__ || {};',
          'export async function primeiroAcessoExecutionService(...args) {',
          "  const fn = getMocks().primeiroAcessoExecutionService;",
          "  if (typeof fn === 'function') return await fn(...args);",
          "  throw new Error('primeiroAcessoExecutionService mock ausente');",
          '}',
          'export default primeiroAcessoExecutionService;',
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_BRIDGE_MOCK_MODULE_URL) {
      const lines = [
        'const getMocks = () => globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_AUTH_DB_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return async () => null;',
        '};',
      ];

      for (const exportName of AUTH_DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
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

function setBcryptMocks(overrides = {}) {
  globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_BCRYPT_MOCKS__ = { ...overrides };
}

function setExecutionServiceMocks(overrides = {}) {
  globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_EXECUTION_SERVICE_MOCKS__ = { ...overrides };
}

function setAuthDbBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_AUTH_PRIMEIRO_ACESSO_AUTH_DB_MOCKS__ = { ...overrides };
}

function resetHarnessMocks() {
  setBcryptMocks({});
  setExecutionServiceMocks({});
  setAuthDbBridgeMocks({});
}

test.afterEach(() => {
  resetHarnessMocks();
});

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function createRes() {
  return {
    statusCode: 200,
    location: null,
    redirect(statusOrLocation, maybeLocation) {
      if (typeof maybeLocation === 'undefined') {
        this.statusCode = 302;
        this.location = statusOrLocation;
        return this;
      }
      this.statusCode = statusOrLocation;
      this.location = maybeLocation;
      return this;
    },
  };
}

test('owner encaminha userId, senhaHash e maxTimeMS ao service fino e preserva o redirect feliz', async () => {
  resetHarnessMocks();

  const hashCalls = [];
  const serviceCalls = [];

  setBcryptMocks({
    hash: async (senha, rounds) => {
      hashCalls.push({ senha, rounds });
      return 'hash-gerado';
    },
  });

  setExecutionServiceMocks({
    primeiroAcessoExecutionService: async (input) => {
      serviceCalls.push(input);
      return { kind: 'updated' };
    },
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-updated');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439011' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.deepEqual(hashCalls, [{ senha: 'NovaSenha@123', rounds: 10 }]);
  assert.deepEqual(serviceCalls, [{
    userId: '507f1f77bcf86cd799439011',
    senhaHash: 'hash-gerado',
    maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
  }]);
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, '/gestor/dashboard');
});

test('owner preserva o mapeamento not_found para redirect de login', async () => {
  resetHarnessMocks();

  setBcryptMocks({
    hash: async () => 'hash-gerado',
  });

  setExecutionServiceMocks({
    primeiroAcessoExecutionService: async () => ({ kind: 'not_found' }),
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-not-found');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439012' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.equal(res.statusCode, 303);
  assert.equal(res.location, '/gestor/login');
});

test('owner preserva o mapeamento de save_failed para erro de servidor com redirect local', async () => {
  resetHarnessMocks();

  setBcryptMocks({
    hash: async () => 'hash-gerado',
  });

  setExecutionServiceMocks({
    primeiroAcessoExecutionService: async () => ({ kind: 'save_failed', error: new Error('falha-save') }),
  });

  const { primeiroAcessoPost } = await importFresh(CONTROLLER_FILE, 'owner-save-failed');

  const req = {
    baseUrl: '/gestor',
    session: { user: { id: '507f1f77bcf86cd799439013' } },
    body: { senha: 'NovaSenha@123', confirmar_senha: 'NovaSenha@123' },
    get: () => '',
  };
  const res = createRes();

  await primeiroAcessoPost(req, res);

  assert.equal(res.statusCode, 303);
  assert.equal(res.location, '/gestor/primeiroacesso?erro=servidor');
});

test('service consulta authDbBridgeService, aplica a mutacao e salva o documento', async () => {
  resetHarnessMocks();

  const findCalls = [];
  const saveCalls = [];
  const fakeUser = {
    primeiro_acesso: true,
    senha_provisoria: true,
    senha: 'anterior',
  };

  setAuthDbBridgeMocks({
    findUserByIdWithMaxTime: async (input) => {
      findCalls.push(input);
      return fakeUser;
    },
    saveUserDocument: async (user) => {
      saveCalls.push({
        senha: user.senha,
        primeiro_acesso: user.primeiro_acesso,
        senha_provisoria: user.senha_provisoria,
      });
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-updated');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439021',
    senhaHash: 'hash-gerado',
    maxTimeMS: 4321,
  });

  assert.deepEqual(findCalls, [{
    id: '507f1f77bcf86cd799439021',
    maxTimeMS: 4321,
  }]);
  assert.deepEqual(saveCalls, [{
    senha: 'hash-gerado',
    primeiro_acesso: false,
    senha_provisoria: false,
  }]);
  assert.deepEqual(result, { kind: 'updated' });
});

test('service retorna already_completed sem salvar quando o usuario ja concluiu primeiro acesso', async () => {
  resetHarnessMocks();

  let saveCalled = false;

  setAuthDbBridgeMocks({
    findUserByIdWithMaxTime: async () => ({
      primeiro_acesso: false,
      senha_provisoria: false,
    }),
    saveUserDocument: async () => {
      saveCalled = true;
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-already-completed');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439022',
    senhaHash: 'hash-gerado',
    maxTimeMS: 0,
  });

  assert.deepEqual(result, { kind: 'already_completed' });
  assert.equal(saveCalled, false);
});

test('service retorna save_failed quando o save do documento falha', async () => {
  resetHarnessMocks();

  setAuthDbBridgeMocks({
    findUserByIdWithMaxTime: async () => ({
      primeiro_acesso: true,
      senha_provisoria: true,
    }),
    saveUserDocument: async () => {
      throw new Error('falha-save');
    },
  });

  const { primeiroAcessoExecutionService } = await importFresh(SERVICE_FILE, 'service-save-failed');
  const result = await primeiroAcessoExecutionService({
    userId: '507f1f77bcf86cd799439023',
    senhaHash: 'hash-gerado',
    maxTimeMS: 0,
  });

  assert.equal(result.kind, 'save_failed');
  assert.equal(result.error?.message, 'falha-save');
});