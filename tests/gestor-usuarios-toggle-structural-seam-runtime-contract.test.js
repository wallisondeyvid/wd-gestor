import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/userController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/usuarios/toggleUsuarioExecution.service.js')).href;

const bridgeMockModuleUrl = 'mock:gestor-usuarios-toggle-bridge';
const toggleServiceMockModuleUrl = 'mock:gestor-usuarios-toggle-service';
const listLockedUsersServiceMockModuleUrl = 'mock:gestor-usuarios-toggle-list-locked-service';
const userServiceMockModuleUrl = 'mock:gestor-usuarios-toggle-user-service';
const authContextResolverMockModuleUrl = 'mock:gestor-usuarios-toggle-auth-context-resolver';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/usuarios/toggleUsuarioExecution.service.js') {
      return { url: toggleServiceMockModuleUrl, shortCircuit: true };
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
          "const getBridgeMocks = () => globalThis.__GESTOR_USUARIOS_TOGGLE_BRIDGE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('bridge compat nao deveria ser chamada nesta suite'); };",
          "export const findUsersByQueryLean = notUsed;",
          "export const findAllUnidadesSelectIdCodigoNomeLean = notUsed;",
          "export const findAllFuncionariosSelectIdNomeCpfLean = notUsed;",
          "export const findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLean = notUsed;",
          "export const findFuncionarioByIdSelectIdUnidadeUsuarioLean = notUsed;",
          "export async function findUserById(...args) { return await (getBridgeMocks().findUserById || notUsed)(...args); }",
          "export async function saveUserDoc(...args) { return await (getBridgeMocks().saveUserDoc || notUsed)(...args); }",
          "export const findUserDuplicadoByCpfUnidadeExcludingId = notUsed;",
          "export const createFuncionarioDoc = notUsed;",
          "export const createUserMembership = notUsed;",
          "export const unsetFuncionarioUsuarioIdById = notUsed;",
          "export const setFuncionarioUsuarioIdById = notUsed;",
          "export const setFuncionarioUsuarioIdIfEmpty = notUsed;",
          "export async function countUsersMasters(...args) { return await (getBridgeMocks().countUsersMasters || notUsed)(...args); }",
          "export async function deleteUserById(...args) { return await (getBridgeMocks().deleteUserById || notUsed)(...args); }",
          "export async function unsetFuncionarioUsuarioIdIfMatchesUser(...args) { return await (getBridgeMocks().unsetFuncionarioUsuarioIdIfMatchesUser || notUsed)(...args); }",
          "export const findUserByEmail = notUsed;",
          "export const findUserMembershipsByUserIdsLean = notUsed;",
          "export const findUnidadesByIdsNomeCodigoLean = notUsed;",
          "export const findUserMembershipByUserAndUnidade = notUsed;",
          "export const findUserByIdSelectAuthLockInfo = notUsed;",
        ].join('\n'),
      };
    }

    if (url === toggleServiceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getServiceMocks = () => globalThis.__GESTOR_USUARIOS_TOGGLE_SERVICE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('toggle service nao configurado nesta suite'); };",
          "export async function toggleUsuarioExecutionService(...args) {",
          "  return await (getServiceMocks().toggleUsuarioExecutionService || notUsed)(...args);",
          "}",
          "export default toggleUsuarioExecutionService;",
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
  globalThis.__GESTOR_USUARIOS_TOGGLE_BRIDGE_MOCKS__ = { ...overrides };
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_USUARIOS_TOGGLE_SERVICE_MOCKS__ = { ...overrides };
}

function createReq(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    params: overrides.params || {},
    user: overrides.user || null,
    xhr: overrides.xhr || false,
    get(name) {
      return headers[name] || headers[name?.toLowerCase?.()] || undefined;
    },
  };
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    sentText: undefined,
    redirectedTo: null,
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

async function importToggleUsuario(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importToggleUsuarioExecutionService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('toggleUsuario usa o service fino no caminho feliz XHR e responde com o ativo atualizado', async () => {
  const bridgeCalls = [];
  const serviceCalls = [];

  setBridgeMocks({
    findUserById: async (userId) => {
      bridgeCalls.push(userId);
      return { _id: userId, role: 'user', ativo: true };
    },
    countUsersMasters: async () => 2,
  });
  setServiceMocks({
    toggleUsuarioExecutionService: async ({ user }) => {
      serviceCalls.push({ userId: user._id, ativoAntes: user.ativo });
      user.ativo = false;
      return user;
    },
  });

  const { toggleUsuario } = await importToggleUsuario('owner-xhr-success');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439099', role: 'admin', isMaster: false },
    xhr: true,
  });
  const res = createResCapture();

  await toggleUsuario(req, res);

  assert.deepEqual(bridgeCalls, ['507f1f77bcf86cd799439011']);
  assert.deepEqual(serviceCalls, [{ userId: '507f1f77bcf86cd799439011', ativoAntes: true }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    id: '507f1f77bcf86cd799439011',
    ativo: false,
  });
});

test('toggleUsuario preserva protecao de usuario master no owner sem chamar o service', async () => {
  let serviceCalled = false;

  setBridgeMocks({
    findUserById: async () => ({ _id: '507f1f77bcf86cd799439011', role: 'master', ativo: true }),
    countUsersMasters: async () => 2,
  });
  setServiceMocks({
    toggleUsuarioExecutionService: async () => {
      serviceCalled = true;
    },
  });

  const { toggleUsuario } = await importToggleUsuario('owner-master-block');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439099', role: 'admin', isMaster: false },
  });
  const res = createResCapture();

  await toggleUsuario(req, res);

  assert.equal(serviceCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.sentText, 'Apenas Master pode alterar o usuário Master');
});

test('toggleUsuario preserva redirect no caminho nao XHR depois de delegar ao service', async () => {
  let serviceCalled = false;

  setBridgeMocks({
    findUserById: async (userId) => ({ _id: userId, role: 'user', ativo: false }),
    countUsersMasters: async () => 2,
  });
  setServiceMocks({
    toggleUsuarioExecutionService: async ({ user }) => {
      serviceCalled = true;
      user.ativo = true;
      return user;
    },
  });

  const { toggleUsuario } = await importToggleUsuario('owner-redirect-success');
  const req = createReq({
    params: { id: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439099', role: 'admin', isMaster: false },
  });
  const res = createResCapture();

  await toggleUsuario(req, res);

  assert.equal(serviceCalled, true);
  assert.equal(res.redirectedTo, '/gestor/usuarios');
});

test('toggleUsuarioExecutionService inverte user.ativo e persiste o proprio documento', async () => {
  const bridgeCalls = [];
  const user = {
    _id: '507f1f77bcf86cd799439011',
    ativo: false,
  };

  setBridgeMocks({
    saveUserDoc: async (userDoc) => {
      bridgeCalls.push(userDoc);
      return userDoc;
    },
  });

  const { toggleUsuarioExecutionService } = await importToggleUsuarioExecutionService('service-toggle-save');
  const result = await toggleUsuarioExecutionService({ user });

  assert.deepEqual(bridgeCalls, [user]);
  assert.equal(user.ativo, true);
  assert.equal(result, user);
});