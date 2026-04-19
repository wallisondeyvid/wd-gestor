import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import mongoose from 'mongoose';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/userController.js')).href;
const apiDbMockModuleUrl = 'mock:gestor-auth-user-endpoint-api-db-bridge';
const userServiceMockModuleUrl = 'mock:gestor-auth-user-endpoint-user-service';
const authContextResolverMockModuleUrl = 'mock:gestor-auth-user-endpoint-auth-context-resolver';

const API_DB_EXPORTS = [
  'findUsersLockedAfterSelectLean',
  'findUsersByQueryLean',
  'findAllUnidadesSelectIdCodigoNomeLean',
  'findAllFuncionariosSelectIdNomeCpfLean',
  'findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean',
  'findFuncionarioByIdSelectIdUnidadeUsuarioLean',
  'findUserById',
  'saveUserDoc',
  'findUserDuplicadoByCpfUnidadeExcludingId',
  'createFuncionarioDoc',
  'createUserMembership',
  'unsetFuncionarioUsuarioIdById',
  'setFuncionarioUsuarioIdById',
  'setFuncionarioUsuarioIdIfEmpty',
  'countUsersMasters',
  'deleteUserById',
  'unsetFuncionarioUsuarioIdIfMatchesUser',
  'findUserByEmail',
  'findUserMembershipsByUserIdsLean',
  'findUnidadesByIdsNomeCodigoLean',
  'findUnidadeByIdLean',
  'findUnidadesByMatrizOuPrincipal',
  'findUserMembershipByUserAndUnidade',
  'findUserByIdSelectAuthLockInfo',
];

const USER_SERVICE_EXPORTS = [
  'createUserAndSendPassword',
  'findUserByIdForProfile',
  'findUserByEmailForProfile',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: apiDbMockModuleUrl, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/userService.js') {
      return { url: userServiceMockModuleUrl, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/services/authContextResolver.js') {
      return { url: authContextResolverMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === apiDbMockModuleUrl) {
      const lines = [
        'const getMocks = () => globalThis.__GESTOR_AUTH_USER_ENDPOINT_API_DB_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return async () => null;',
        '};',
      ];

      for (const exportName of API_DB_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === userServiceMockModuleUrl) {
      const lines = [
        'const getMocks = () => globalThis.__GESTOR_AUTH_USER_ENDPOINT_USER_SERVICE_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return async () => null;',
        '};',
      ];

      for (const exportName of USER_SERVICE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { return await resolveImpl('${exportName}')(...args); }`);
      }

      return {
        format: 'module',
        shortCircuit: true,
        source: lines.join('\n'),
      };
    }

    if (url === authContextResolverMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = 'gestor_auth_context_resolver';",
          'export async function resolveGestorAuthContext(...args) {',
          '  const fn = globalThis.__GESTOR_AUTH_USER_ENDPOINT_RESOLVE_AUTH_CONTEXT__;',
          "  if (typeof fn === 'function') return await fn(...args);",
          '  return null;',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setApiDbMocks(overrides = {}) {
  globalThis.__GESTOR_AUTH_USER_ENDPOINT_API_DB_MOCKS__ = { ...overrides };
}

function setUserServiceMocks(overrides = {}) {
  globalThis.__GESTOR_AUTH_USER_ENDPOINT_USER_SERVICE_MOCKS__ = { ...overrides };
}

function setResolveAuthContextMock(fn = null) {
  globalThis.__GESTOR_AUTH_USER_ENDPOINT_RESOLVE_AUTH_CONTEXT__ = fn;
}

function createResCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(field, value) {
      this.headers[field.toLowerCase()] = value;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

function createReq(overrides = {}) {
  return {
    app: { locals: {}, ...(overrides.app || {}) },
    user: overrides.user || null,
    unitScope: overrides.unitScope || null,
    params: overrides.params || {},
    body: overrides.body || {},
    query: overrides.query || {},
    session: overrides.session,
  };
}

async function importObterUsuarioAtual(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('obterUsuarioAtual responde 401 quando req.user está ausente', async () => {
  setApiDbMocks({});
  setUserServiceMocks({});
  setResolveAuthContextMock(null);

  const { obterUsuarioAtual } = await importObterUsuarioAtual('missing-user');
  const req = createReq({
    user: null,
    session: {},
  });
  const res = createResCapture();

  await obterUsuarioAtual(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('obterUsuarioAtual responde 401 quando a sessão autenticada é inválida', async () => {
  setApiDbMocks({});
  setUserServiceMocks({});
  setResolveAuthContextMock(null);

  const { obterUsuarioAtual } = await importObterUsuarioAtual('invalid-session');
  const req = createReq({
    user: { email: 'invalido@gestor.test' },
    session: { user: { id: 'nao-e-object-id', email: 'invalido@gestor.test' } },
  });
  const res = createResCapture();

  await obterUsuarioAtual(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Sessão inválida',
    code: 'UNAUTHORIZED',
  });
});

test('obterUsuarioAtual responde 404 quando não resolve o usuário nem por id nem por e-mail', async () => {
  const calls = [];
  setApiDbMocks({});
  setUserServiceMocks({
    findUserByIdForProfile: async (args) => {
      calls.push({ op: 'findUserByIdForProfile', args: { ...args, userId: String(args.userId) } });
      return null;
    },
    findUserByEmailForProfile: async (args) => {
      calls.push({ op: 'findUserByEmailForProfile', args });
      return null;
    },
  });
  setResolveAuthContextMock(null);

  const sessionId = new mongoose.Types.ObjectId().toString();
  const { obterUsuarioAtual } = await importObterUsuarioAtual('not-found');
  const req = createReq({
    app: { locals: { gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: false } } },
    user: { email: 'desconhecido@gestor.test' },
    unitScope: { unidadeId: 'u-contexto' },
    session: { user: { id: sessionId, email: 'desconhecido@gestor.test' } },
  });
  const res = createResCapture();

  await obterUsuarioAtual(req, res);

  assert.deepEqual(calls, [
    {
      op: 'findUserByIdForProfile',
      args: { unitScope: { unidadeId: 'u-contexto' }, userId: sessionId },
    },
    {
      op: 'findUserByEmailForProfile',
      args: { unitScope: { unidadeId: 'u-contexto' }, email: 'desconhecido@gestor.test' },
    },
  ]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Usuário não encontrado',
    code: 'NOT_FOUND',
  });
});

test('obterUsuarioAtual retorna envelope base mínimo sem auth-context rico quando a flag está desligada', async () => {
  setApiDbMocks({});
  setUserServiceMocks({
    findUserByIdForProfile: async () => ({
      _id: '507f191e810c19729de860ea',
      nome: 'Usuario Base',
      email: 'base@gestor.test',
      role: 'user',
      isMaster: false,
      foto: 'https://cdn.example.test/user.webp',
      cpf: '12345678901',
      telefone: '11999999999',
      unidade_id: {
        _id: 'u-base',
        nome: 'Unidade Base',
        codigo: 'UNI-001',
      },
      funcionario_id: {
        _id: 'f-base',
      },
    }),
    findUserByEmailForProfile: async () => {
      throw new Error('fallback por email não deveria ser usado no caminho feliz base');
    },
  });
  setResolveAuthContextMock(null);

  const sessionId = new mongoose.Types.ObjectId().toString();
  const { obterUsuarioAtual } = await importObterUsuarioAtual('base-success');
  const req = createReq({
    app: { locals: { gestorAuthContextFeatureFlags: { gestor_auth_context_resolver: false } } },
    user: { email: 'base@gestor.test' },
    unitScope: { unidadeId: 'u-base' },
    session: { user: { id: sessionId, email: 'base@gestor.test' } },
  });
  const res = createResCapture();

  await obterUsuarioAtual(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      id: '507f191e810c19729de860ea',
      nome: 'Usuario Base',
      email: 'base@gestor.test',
      role: 'user',
      isMaster: false,
      unidade_id: 'u-base',
      unidade_nome: 'Unidade Base',
      unidade_codigo: 'UNI-001',
      funcionario_id: 'f-base',
      foto: 'https://cdn.example.test/user.webp',
      cpf: '12345678901',
      telefone: '11999999999',
    },
  });
});