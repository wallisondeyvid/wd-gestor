import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/funcaoApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js')).href;

const bridgeMockModuleUrl = 'mock:gestor-funcoes-delete-bridge';
const dataFacadeMockModuleUrl = 'mock:gestor-funcoes-delete-data-facade';
const listarServiceMockModuleUrl = 'mock:gestor-funcoes-listar-service';
const serviceMockModuleUrl = 'mock:gestor-funcoes-delete-service';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/data/funcoes/funcoesDeleteDataFacade.js') {
      return { url: dataFacadeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/funcoes/listarFuncoes.service.js') {
      return { url: listarServiceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getBridgeMocks = () => globalThis.__GESTOR_FUNCOES_DELETE_BRIDGE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('bridge compat nao deveria ser chamada nesta suite'); };",
          "export const findFuncaoByNome = notUsed;",
          "export const createFuncao = notUsed;",
          "export const findFuncaoByIdPopulated = notUsed;",
          "export async function findFuncaoById(...args) {",
          "  return await (getBridgeMocks().findFuncaoById || notUsed)(...args);",
          "}",
          "export const findOutraFuncaoByNomeExcludingId = notUsed;",
          "export const updateFuncaoById = notUsed;",
          "export const findFuncaoByIdLean = notUsed;",
          "export const findFuncoesByPrincipalUnitIdLean = notUsed;",
          "export const saveFuncao = notUsed;",
          "export async function deleteFuncaoById(...args) {",
          "  return await (getBridgeMocks().deleteFuncaoById || notUsed)(...args);",
          "}",
          "export const findUnidadeByIdWithModulosAcessiveis = notUsed;",
          "export async function findUnidadeUserBaseLean(...args) {",
          "  return await (getBridgeMocks().findUnidadeUserBaseLean || notUsed)(...args);",
          "}",
        ].join('\n'),
      };
    }

    if (url === dataFacadeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getDataFacadeMocks = () => globalThis.__GESTOR_FUNCOES_DELETE_DATA_FACADE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('data facade nao deveria ser chamada sem mock nesta suite'); };",
          "export async function findFuncaoById(...args) {",
          "  return await (getDataFacadeMocks().findFuncaoById || notUsed)(...args);",
          "}",
          "export async function deleteFuncaoById(...args) {",
          "  return await (getDataFacadeMocks().deleteFuncaoById || notUsed)(...args);",
          "}",
        ].join('\n'),
      };
    }

    if (url === serviceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getServiceMocks = () => globalThis.__GESTOR_FUNCOES_DELETE_SERVICE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('service fino nao configurado nesta suite'); };",
          "export async function deleteFuncaoScopedService(...args) {",
          "  return await (getServiceMocks().deleteFuncaoScopedService || notUsed)(...args);",
          "}",
          "export default deleteFuncaoScopedService;",
        ].join('\n'),
      };
    }

    if (url === listarServiceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const notUsed = async () => { throw new Error('listarFuncoesService nao deveria ser chamado nesta suite'); };",
          "export const listarFuncoesService = notUsed;",
        ].join('\n'),
      };
    }
    return nextLoad(url, context);
  },
});

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_FUNCOES_DELETE_BRIDGE_MOCKS__ = { ...overrides };
}

function setDataFacadeMocks(overrides = {}) {
  globalThis.__GESTOR_FUNCOES_DELETE_DATA_FACADE_MOCKS__ = { ...overrides };
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_FUNCOES_DELETE_SERVICE_MOCKS__ = { ...overrides };
}

function createReq(overrides = {}) {
  return {
    params: overrides.params || {},
    unitScope: overrides.unitScope || null,
    user: overrides.user || { role: 'admin', isMaster: false },
    session: overrides.session || { user: { role: 'admin' } },
    body: overrides.body || {},
    query: overrides.query || {},
  };
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
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

async function importDeleteFuncao(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importDeleteFuncaoService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('deleteFuncao usa o service fino com a principal contextual resolvida e preserva 404', async () => {
  const serviceCalls = [];
  const bridgeCalls = [];

  setBridgeMocks({
    findUnidadeUserBaseLean: async (unidadeId) => {
      bridgeCalls.push(unidadeId);
      return {
        _id: '507f191e810c19729de860aa',
        is_principal: false,
        unidade_principal_id: '507f191e810c19729de860ea',
      };
    },
  });
  setServiceMocks({
    deleteFuncaoScopedService: async (args) => {
      serviceCalls.push(args);
      return null;
    },
  });

  const { deleteFuncao } = await importDeleteFuncao('owner-contextual-not-found');
  const req = createReq({
    params: { id: 'missing-id' },
    unitScope: { unidadeId: '507f191e810c19729de860aa' },
  });
  const res = createResCapture();

  await deleteFuncao(req, res);

  assert.deepEqual(bridgeCalls, ['507f191e810c19729de860aa']);
  assert.deepEqual(serviceCalls, [{
    funcaoId: 'missing-id',
    canonicalPrincipalUnitId: '507f191e810c19729de860ea',
  }]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  });
});

test('deleteFuncaoScopedService usa a principal da propria funcao quando nao ha contexto canonico', async () => {
  const calls = [];

  setDataFacadeMocks({
    findFuncaoById: async (...args) => {
      calls.push({ op: 'findFuncaoById', args });
      return {
        _id: '507f1f77bcf86cd799439011',
        unidade_principal_id: '507f191e810c19729de860ff',
      };
    },
    deleteFuncaoById: async (...args) => {
      calls.push({ op: 'deleteFuncaoById', args });
      return { _id: '507f1f77bcf86cd799439011' };
    },
  });

  const { deleteFuncaoScopedService } = await importDeleteFuncaoService('service-own-principal');
  const result = await deleteFuncaoScopedService({
    funcaoId: '507f1f77bcf86cd799439011',
    canonicalPrincipalUnitId: null,
  });

  assert.deepEqual(result, {
    _id: '507f1f77bcf86cd799439011',
    unidade_principal_id: '507f191e810c19729de860ff',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findFuncaoById');
  assert.equal(calls[1].op, 'deleteFuncaoById');
  assert.deepEqual(calls[0].args, ['507f1f77bcf86cd799439011', null]);
  assert.deepEqual(calls[1].args, ['507f1f77bcf86cd799439011', '507f191e810c19729de860ff']);
});

test('deleteFuncaoScopedService usa a principal contextual no lookup e no delete quando ela existe', async () => {
  const calls = [];

  setDataFacadeMocks({
    findFuncaoById: async (...args) => {
      calls.push({ op: 'findFuncaoById', args });
      return {
        _id: '507f1f77bcf86cd799439011',
        unidade_principal_id: '507f191e810c19729de860ff',
      };
    },
    deleteFuncaoById: async (...args) => {
      calls.push({ op: 'deleteFuncaoById', args });
      return { _id: '507f1f77bcf86cd799439011' };
    },
  });

  const { deleteFuncaoScopedService } = await importDeleteFuncaoService('service-contextual-principal');
  await deleteFuncaoScopedService({
    funcaoId: '507f1f77bcf86cd799439011',
    canonicalPrincipalUnitId: '507f191e810c19729de860ea',
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']);
  assert.deepEqual(calls[1].args, ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']);
});

test('deleteFuncaoScopedService nao tenta excluir quando o lookup por id invalido ou alvo ausente nao encontra funcao', async () => {
  const calls = [];

  setDataFacadeMocks({
    findFuncaoById: async (...args) => {
      calls.push({ op: 'findFuncaoById', args });
      return null;
    },
    deleteFuncaoById: async (...args) => {
      calls.push({ op: 'deleteFuncaoById', args });
      throw new Error('delete nao deveria ser chamado');
    },
  });

  const { deleteFuncaoScopedService } = await importDeleteFuncaoService('service-not-found');
  const invalidIdResult = await deleteFuncaoScopedService({
    funcaoId: 'missing-id',
    canonicalPrincipalUnitId: null,
  });
  const missingResult = await deleteFuncaoScopedService({
    funcaoId: '507f1f77bcf86cd799439011',
    canonicalPrincipalUnitId: '507f191e810c19729de860ea',
  });

  assert.equal(invalidIdResult, null);
  assert.equal(missingResult, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']);
});