import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const apiDbModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js')).href;
const actualServiceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/recursos/listarRecursos.service.js')).href;
const actualDataFacadeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/data/recursos/recursosReadDataFacade.js')).href;
const serviceMockModuleUrl = 'mock:gestor-recursos-list-structural-seam-service';
const dataFacadeMockModuleUrl = 'mock:gestor-recursos-list-structural-seam-data-facade';
const SERVICE_EXPORTS = [
  'listarRecursosService',
  'findRecursosByFiltroComUnidadeService',
];
const DATA_FACADE_EXPORTS = [
  'findRecursosByFiltroComUnidadeLeanData',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/recursos/listarRecursos.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }
    if (specifier === '#modules/gestor/app/data/recursos/recursosReadDataFacade.js') {
      return { url: dataFacadeMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      const lines = [
        `export * from '${actualServiceModuleUrl}';`,
        `import * as actual from '${actualServiceModuleUrl}';`,
        "const getMocks = () => globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_SERVICE_MOCKS__ || {};",
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

    if (url === dataFacadeMockModuleUrl) {
      const lines = [
        `export * from '${actualDataFacadeModuleUrl}';`,
        `import * as actual from '${actualDataFacadeModuleUrl}';`,
        "const getMocks = () => globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_DATA_FACADE_MOCKS__ || {};",
      ];

      for (const exportName of DATA_FACADE_EXPORTS) {
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
  globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_SERVICE_MOCKS__ = { ...overrides };
}

function clearServiceMocks() {
  globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_SERVICE_MOCKS__ = {};
}

function setDataFacadeMocks(overrides = {}) {
  globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_DATA_FACADE_MOCKS__ = { ...overrides };
}

function clearDataFacadeMocks() {
  globalThis.__GESTOR_RECURSOS_LIST_STRUCTURAL_DATA_FACADE_MOCKS__ = {};
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
  };
}

test.afterEach(() => {
  clearServiceMocks();
  clearDataFacadeMocks();
});

test('listarRecursosApi usa o service fino como caminho principal da listagem', async () => {
  const serviceCalls = [];
  setServiceMocks({
    listarRecursosService: async (input) => {
      serviceCalls.push(JSON.parse(JSON.stringify(input)));
      return {
        blocked: false,
        data: [{ _id: 'r-1', placa: 'ABC-1234' }],
      };
    },
  });

  const { listarRecursosApi } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const req = {
    query: { placa: 'abc1', unidadeId: '507f191e810c19729de860ea' },
    user: { role: 'admin', isMaster: false },
    session: { user: { unidade_id: '507f191e810c19729de860eb' } },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ec' },
  };
  const res = createResponseCapture();

  await listarRecursosApi(req, res);

  assert.deepEqual(serviceCalls, [{
    query: { placa: 'abc1', unidadeId: '507f191e810c19729de860ea' },
    user: { role: 'admin', isMaster: false },
    session: { user: { unidade_id: '507f191e810c19729de860eb' } },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ec' },
  }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [{ _id: 'r-1', placa: 'ABC-1234' }],
  });
});

test('findRecursosByFiltroComUnidadeLean em api.db.js delega por compatibilidade ao service fino', async () => {
  const serviceCalls = [];
  setServiceMocks({
    findRecursosByFiltroComUnidadeService: async (filtro) => {
      serviceCalls.push(JSON.parse(JSON.stringify(filtro)));
      return [{ _id: 'r-10' }];
    },
  });

  const { findRecursosByFiltroComUnidadeLean } = await import(`${apiDbModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findRecursosByFiltroComUnidadeLean({ unidade_id: '507f191e810c19729de860ea' });

  assert.deepEqual(serviceCalls, [{ unidade_id: '507f191e810c19729de860ea' }]);
  assert.deepEqual(result, [{ _id: 'r-10' }]);
});

test('findRecursosByFiltroComUnidadeService usa a fachada canonica de dados como caminho principal', async () => {
  const dataFacadeCalls = [];
  setDataFacadeMocks({
    findRecursosByFiltroComUnidadeLeanData: async (filtro) => {
      dataFacadeCalls.push(JSON.parse(JSON.stringify(filtro)));
      return [{ _id: 'r-20' }];
    },
  });

  const { findRecursosByFiltroComUnidadeService } = await import(`${actualServiceModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findRecursosByFiltroComUnidadeService({ unidade_id: '507f191e810c19729de860ea' });

  assert.deepEqual(dataFacadeCalls, [{ unidade_id: '507f191e810c19729de860ea' }]);
  assert.deepEqual(result, [{ _id: 'r-20' }]);
});