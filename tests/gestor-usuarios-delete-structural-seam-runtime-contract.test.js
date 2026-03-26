import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/userController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/usuarios/deleteUsuarioExecution.service.js')).href;

const bridgeMockModuleUrl = 'mock:gestor-usuarios-delete-bridge';
const serviceMockModuleUrl = 'mock:gestor-usuarios-delete-service';
const userRepositoryMockModuleUrl = 'mock:gestor-usuarios-delete-user-repository';
const funcionarioRepositoryMockModuleUrl = 'mock:gestor-usuarios-delete-funcionario-repository';
const listLockedUsersServiceMockModuleUrl = 'mock:gestor-usuarios-list-locked-service';
const userServiceMockModuleUrl = 'mock:gestor-usuarios-user-service';
const authContextResolverMockModuleUrl = 'mock:gestor-usuarios-auth-context-resolver';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/usuarios/deleteUsuarioExecution.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/UserRepository.js') {
      return { url: userRepositoryMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/FuncionarioRepository.js') {
      return { url: funcionarioRepositoryMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/usuarios/listLockedUsers.service.js') {
      return { url: listLockedUsersServiceMockModuleUrl, shortCircuit: true };
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
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getBridgeMocks = () => globalThis.__GESTOR_USUARIOS_DELETE_BRIDGE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('bridge compat nao deveria ser chamada nesta suite'); };",
          "export const findUsersByQueryLean = notUsed;",
          "export const findAllUnidadesSelectIdCodigoNomeLean = notUsed;",
          "export const findAllFuncionariosSelectIdNomeCpfLean = notUsed;",
          "export const findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean = notUsed;",
          "export const findFuncionarioByIdSelectIdUnidadeUsuarioLean = notUsed;",
          "export async function findUserById(...args) { return await (getBridgeMocks().findUserById || notUsed)(...args); }",
          "export const saveUserDoc = notUsed;",
          "export const findUserDuplicadoByCpfUnidadeExcludingId = notUsed;",
          "export const createFuncionarioDoc = notUsed;",
          "export const createUserMembership = notUsed;",
          "export const unsetFuncionarioUsuarioIdById = notUsed;",
          "export const setFuncionarioUsuarioIdById = notUsed;",
          "export const setFuncionarioUsuarioIdIfEmpty = notUsed;",
          "export async function countUsersMasters(...args) { return await (getBridgeMocks().countUsersMasters || notUsed)(...args); }",
          "export const deleteUserById = notUsed;",
          "export const unsetFuncionarioUsuarioIdIfMatchesUser = notUsed;",
          "export const findUserByEmail = notUsed;",
          "export const findUserMembershipsByUserIdsLean = notUsed;",
          "export const findUnidadesByIdsNomeCodigoLean = notUsed;",
          "export const findUserMembershipByUserAndUnidade = notUsed;",
          "export const findUserByIdSelectAuthLockInfo = notUsed;",
        ].join('\n'),
      };
    }

    if (url === serviceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getServiceMocks = () => globalThis.__GESTOR_USUARIOS_DELETE_SERVICE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('service fino nao configurado nesta suite'); };",
          "export async function deleteUsuarioExecutionService(...args) {",
          "  return await (getServiceMocks().deleteUsuarioExecutionService || notUsed)(...args);",
          "}",
          "export default deleteUsuarioExecutionService;",
        ].join('\n'),
      };
    }

    if (url === userRepositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_USUARIOS_DELETE_USER_REPOSITORY_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('user repository nao configurado nesta suite'); };",
          "export async function deleteUserByIdRepo(...args) { return await (getMocks().deleteUserByIdRepo || notUsed)(...args); }",
        ].join('\n'),
      };
    }

    if (url === funcionarioRepositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_USUARIOS_DELETE_FUNCIONARIO_REPOSITORY_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('funcionario repository nao configurado nesta suite'); };",
          "export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo(...args) { return await (getMocks().unsetFuncionarioUsuarioIdIfMatchesUserRepo || notUsed)(...args); }",
        ].join('\n'),
      };
    }

    if (url === listLockedUsersServiceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: "export const listLockedUsersService = async () => { throw new Error('listLockedUsersService nao deveria ser chamado nesta suite'); };",
      };
    }

    if (url === userServiceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const notUsed = async () => { throw new Error('userService nao deveria ser chamado nesta suite'); };",
          "export const createUserAndSendPassword = notUsed;",
          "export const findUserByIdForProfile = notUsed;",
          "export const findUserByEmailForProfile = notUsed;",
        ].join('\n'),
      };
    }

    if (url === authContextResolverMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = 'gestor_auth_context_resolver';",
          "export const resolveGestorAuthContext = async () => { throw new Error('resolveGestorAuthContext nao deveria ser chamado nesta suite'); };",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_DELETE_BRIDGE_MOCKS__ = { ...overrides };
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_DELETE_SERVICE_MOCKS__ = { ...overrides };
}

function setUserRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_DELETE_USER_REPOSITORY_MOCKS__ = { ...overrides };
}

function setFuncionarioRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_DELETE_FUNCIONARIO_REPOSITORY_MOCKS__ = { ...overrides };
}

function createReq(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    params: overrides.params || {},
    user: overrides.user || null,
    xhr: overrides.xhr || false,
    body: overrides.body || {},
    query: overrides.query || {},
    get(name) {
      return headers[name] || headers[name?.toLowerCase?.()] || undefined;
    },
  };
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    redirectedTo: null,
    sentText: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      this.sentText = payload;
      this.body = payload;
      return this;
    },
    redirect(location) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
  };
}

async function importExcluirUsuario(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importDeleteUsuarioExecutionService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('excluirUsuario usa o service fino no caminho feliz XHR com userId e vinculoFuncionarioId', async () => {
  const bridgeCalls = [];
  const serviceCalls = [];

  setBridgeMocks({
    findUserById: async (userId) => {
      bridgeCalls.push({ op: 'findUserById', userId });
      return {
        _id: '507f1f77bcf86cd799439011',
        role: 'user',
        funcionario_id: '507f191e810c19729de860aa',
      };
    },
    countUsersMasters: async () => {
      bridgeCalls.push({ op: 'countUsersMasters' });
      return 2;
    },
  });
  setServiceMocks({
    deleteUsuarioExecutionService: async (args) => {
      serviceCalls.push(args);
    },
  });

  const { excluirUsuario } = await importExcluirUsuario('owner-success');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439099', isMaster: true, role: 'master' },
    xhr: true,
  });
  const res = createResCapture();

  await excluirUsuario(req, res);

  assert.deepEqual(bridgeCalls, [{ op: 'findUserById', userId: '507f1f77bcf86cd799439011' }]);
  assert.deepEqual(serviceCalls, [{
    userId: '507f1f77bcf86cd799439011',
    vinculoFuncionarioId: '507f191e810c19729de860aa',
  }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    deleted: true,
    id: '507f1f77bcf86cd799439011',
  });
});

test('excluirUsuario preserva autoexclusao no owner e nao chama o service fino', async () => {
  const serviceCalls = [];

  setBridgeMocks({
    findUserById: async () => ({ _id: '507f1f77bcf86cd799439011', role: 'user', funcionario_id: null }),
    countUsersMasters: async () => 2,
  });
  setServiceMocks({
    deleteUsuarioExecutionService: async (args) => {
      serviceCalls.push(args);
    },
  });

  const { excluirUsuario } = await importExcluirUsuario('owner-self-delete');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439011', isMaster: true, role: 'master' },
  });
  const res = createResCapture();

  await excluirUsuario(req, res);

  assert.equal(serviceCalls.length, 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.sentText, 'Você não pode excluir seu próprio usuário.');
});

test('excluirUsuario preserva bloqueio de exclusao de master no owner e nao chama o service fino', async () => {
  const serviceCalls = [];
  const bridgeCalls = [];

  setBridgeMocks({
    findUserById: async () => ({ _id: '507f1f77bcf86cd799439011', role: 'master', funcionario_id: null }),
    countUsersMasters: async () => {
      bridgeCalls.push('countUsersMasters');
      return 2;
    },
  });
  setServiceMocks({
    deleteUsuarioExecutionService: async (args) => {
      serviceCalls.push(args);
    },
  });

  const { excluirUsuario } = await importExcluirUsuario('owner-master-block');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439099', isMaster: true, role: 'master' },
  });
  const res = createResCapture();

  await excluirUsuario(req, res);

  assert.deepEqual(bridgeCalls, ['countUsersMasters']);
  assert.equal(serviceCalls.length, 0);
  assert.equal(res.statusCode, 403);
  assert.equal(res.sentText, 'Usuário master não pode ser excluído.');
});

test('deleteUsuarioExecutionService executa delete e cleanup opcional pelos repositories reais', async () => {
  const calls = [];

  setUserRepositoryMocks({
    deleteUserByIdRepo: async (args) => {
      calls.push({ op: 'deleteUserByIdRepo', args });
      return { acknowledged: true, deletedCount: 1 };
    },
  });
  setFuncionarioRepositoryMocks({
    unsetFuncionarioUsuarioIdIfMatchesUserRepo: async (args) => {
      calls.push({ op: 'unsetFuncionarioUsuarioIdIfMatchesUserRepo', args });
      return { acknowledged: true, modifiedCount: 1 };
    },
  });

  const { deleteUsuarioExecutionService } = await importDeleteUsuarioExecutionService('service-with-cleanup');
  await deleteUsuarioExecutionService({
    userId: '507f1f77bcf86cd799439011',
    vinculoFuncionarioId: '507f191e810c19729de860aa',
  });

  assert.deepEqual(calls, [
    {
      op: 'deleteUserByIdRepo',
      args: {
        unitScope: { type: 'global', unidadeId: null },
        userId: '507f1f77bcf86cd799439011',
      },
    },
    {
      op: 'unsetFuncionarioUsuarioIdIfMatchesUserRepo',
      args: {
        unitScope: { type: 'global', unidadeId: null },
        funcionarioId: '507f191e810c19729de860aa',
        userId: '507f1f77bcf86cd799439011',
      },
    },
  ]);
});

test('deleteUsuarioExecutionService nao tenta cleanup quando nao ha vinculoFuncionarioId', async () => {
  const calls = [];

  setUserRepositoryMocks({
    deleteUserByIdRepo: async (args) => {
      calls.push({ op: 'deleteUserByIdRepo', args });
      return { acknowledged: true, deletedCount: 1 };
    },
  });
  setFuncionarioRepositoryMocks({
    unsetFuncionarioUsuarioIdIfMatchesUserRepo: async (args) => {
      calls.push({ op: 'unsetFuncionarioUsuarioIdIfMatchesUserRepo', args });
      throw new Error('cleanup nao deveria ser chamado');
    },
  });

  const { deleteUsuarioExecutionService } = await importDeleteUsuarioExecutionService('service-without-cleanup');
  await deleteUsuarioExecutionService({
    userId: '507f1f77bcf86cd799439011',
    vinculoFuncionarioId: null,
  });

  assert.deepEqual(calls, [{
    op: 'deleteUserByIdRepo',
    args: {
      unitScope: { type: 'global', unidadeId: null },
      userId: '507f1f77bcf86cd799439011',
    },
  }]);
});