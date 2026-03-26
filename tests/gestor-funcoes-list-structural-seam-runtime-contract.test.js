import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/funcaoApiController.js')).href;
const apiDbModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js')).href;
const actualServiceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/funcoes/listarFuncoes.service.js')).href;
const serviceMockModuleUrl = 'mock:gestor-funcoes-list-structural-seam-service';
const SERVICE_EXPORTS = [
  'listarFuncoesService',
  'findFuncoesByFiltroService',
  'findFuncoesByFiltroSelectService',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/funcoes/listarFuncoes.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      const lines = [
        `export * from '${actualServiceModuleUrl}';`,
        `import * as actual from '${actualServiceModuleUrl}';`,
        "const getMocks = () => globalThis.__GESTOR_FUNCOES_LIST_STRUCTURAL_SERVICE_MOCKS__ || {};",
      ];

      for (const exportName of SERVICE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { const fn = getMocks()['${exportName}']; if (typeof fn === 'function') return await fn(...args); return await actual['${exportName}'](...args); }`);
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

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_FUNCOES_LIST_STRUCTURAL_SERVICE_MOCKS__ = { ...overrides };
}

function clearServiceMocks() {
  globalThis.__GESTOR_FUNCOES_LIST_STRUCTURAL_SERVICE_MOCKS__ = {};
}

function createResponseCapture() {
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
    set() {
      return this;
    },
    setHeader() {},
    type() {
      return this;
    },
  };
}

test.afterEach(() => {
  clearServiceMocks();
});

test('listarFuncoesApi usa o service fino como caminho principal da listagem', async () => {
  const serviceCalls = [];
  setServiceMocks({
    listarFuncoesService: async (input) => {
      serviceCalls.push(JSON.parse(JSON.stringify(input)));
      return [{ _id: 'f-1', nome: 'Analista', descricao: '', codigo: 'ANA' }];
    },
  });

  const { listarFuncoesApi } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const req = {
    query: { unidade_cluster: '507f191e810c19729de860ea', q: 'ana' },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860eb' },
  };
  const res = createResponseCapture();

  await listarFuncoesApi(req, res);

  assert.deepEqual(serviceCalls, [{
    query: { unidade_cluster: '507f191e810c19729de860ea', q: 'ana' },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860eb' },
  }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [{ _id: 'f-1', nome: 'Analista', descricao: '', codigo: 'ANA' }],
  });
});

test('findFuncoesByFiltroLean em api.db.js delega por compatibilidade ao service fino', async () => {
  const serviceCalls = [];
  setServiceMocks({
    findFuncoesByFiltroService: async (filtro) => {
      serviceCalls.push(JSON.parse(JSON.stringify(filtro)));
      return [{ _id: 'f-10' }];
    },
  });

  const { findFuncoesByFiltroLean } = await import(`${apiDbModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findFuncoesByFiltroLean({ unidade_principal_id: '507f191e810c19729de860ea' });

  assert.deepEqual(serviceCalls, [{ unidade_principal_id: '507f191e810c19729de860ea' }]);
  assert.deepEqual(result, [{ _id: 'f-10' }]);
});

test('findFuncoesByFiltroSelectLean em api.db.js delega por compatibilidade ao service fino', async () => {
  const serviceCalls = [];
  setServiceMocks({
    findFuncoesByFiltroSelectService: async (filtro) => {
      serviceCalls.push(JSON.parse(JSON.stringify(filtro)));
      return [{ _id: 'f-20' }];
    },
  });

  const { findFuncoesByFiltroSelectLean } = await import(`${apiDbModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findFuncoesByFiltroSelectLean({ unidade_principal_id: { $in: ['507f191e810c19729de860ea'] } });

  assert.deepEqual(serviceCalls, [{ unidade_principal_id: { $in: ['507f191e810c19729de860ea'] } }]);
  assert.deepEqual(result, [{ _id: 'f-20' }]);
});