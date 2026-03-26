import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/moduloApiController.js')).href;
const apiDbModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/db/api.db.js')).href;
const actualServiceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/modulos/findModuloByIdLean.service.js')).href;
const serviceMockModuleUrl = 'mock:gestor-modulos-by-id-structural-seam-service';
const SERVICE_EXPORTS = [
  'findModuloByIdLeanService',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/modulos/findModuloByIdLean.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      const lines = [
        `export * from '${actualServiceModuleUrl}';`,
        `import * as actual from '${actualServiceModuleUrl}';`,
        "const getMocks = () => globalThis.__GESTOR_MODULOS_BY_ID_STRUCTURAL_SERVICE_MOCKS__ || {};",
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
  globalThis.__GESTOR_MODULOS_BY_ID_STRUCTURAL_SERVICE_MOCKS__ = { ...overrides };
}

function clearServiceMocks() {
  globalThis.__GESTOR_MODULOS_BY_ID_STRUCTURAL_SERVICE_MOCKS__ = {};
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
});

test('obterModulo usa o service fino como caminho principal da leitura por id', async () => {
  const serviceCalls = [];
  setServiceMocks({
    findModuloByIdLeanService: async (id) => {
      serviceCalls.push(id);
      return { _id: id, nome: 'Módulo X' };
    },
  });

  const { obterModulo } = await import(`${controllerModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const req = { params: { id: '507f191e810c19729de860ea' } };
  const res = createResponseCapture();

  await obterModulo(req, res);

  assert.deepEqual(serviceCalls, ['507f191e810c19729de860ea']);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: { _id: '507f191e810c19729de860ea', nome: 'Módulo X' },
  });
});

test('findModuloByIdLean em api.db.js delega por compatibilidade ao service fino', async () => {
  const serviceCalls = [];
  setServiceMocks({
    findModuloByIdLeanService: async (id) => {
      serviceCalls.push(id);
      return { _id: id };
    },
  });

  const { findModuloByIdLean } = await import(`${apiDbModuleUrl}?case=${encodeURIComponent(uniqueSuffix())}`);
  const result = await findModuloByIdLean('507f191e810c19729de860eb');

  assert.deepEqual(serviceCalls, ['507f191e810c19729de860eb']);
  assert.deepEqual(result, { _id: '507f191e810c19729de860eb' });
});