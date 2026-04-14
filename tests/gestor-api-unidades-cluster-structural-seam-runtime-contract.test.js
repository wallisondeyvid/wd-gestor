import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const controllerState = {
  clusterCalls: [],
};

const compatState = {
  delegationCalls: [],
};

const serviceState = {
  facadeCalls: [],
};

const API_DB_BRIDGE_MODULE_URL = pathToFileURL(path.join(process.cwd(), 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const API_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-structural-api-db-bridge';
const CLUSTER_SERVICE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-structural-cluster-service';
const CLUSTER_DATA_FACADE_MOCK_MODULE_URL = 'mock:gestor-api-unidades-cluster-structural-cluster-data-facade';
const ACTUAL_CLUSTER_SERVICE_MODULE_URL = pathToFileURL(path.join(process.cwd(), 'src/modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js')).href;

globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_CONTROLLER_STATE__ = controllerState;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_COMPAT_STATE__ = compatState;
globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_SERVICE_STATE__ = serviceState;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: API_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/data/unidades/unidadesClusterDataFacade.js') {
      return { url: CLUSTER_DATA_FACADE_MOCK_MODULE_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js') {
      return { url: CLUSTER_SERVICE_MOCK_MODULE_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === API_DB_BRIDGE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          `export * from ${JSON.stringify(API_DB_BRIDGE_MODULE_URL)};`,
          'export async function findUnidadeByCodigoLean() { return null; }',
          'export async function findUnidadeByIdLean() { return null; }',
          'export async function findUnidadeByIdOrRawLean() {',
          '  return { _id: "507f191e810c19729de860ea", matriz_id: "507f191e810c19729de860ed" };',
          '}',
          'export async function findUnidadeUserBaseLean() {',
          '  return { _id: "507f191e810c19729de860ea", matriz_id: "507f191e810c19729de860ed" };',
          '}',
        ].join('\n'),
      };
    }

    if (url === CLUSTER_SERVICE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const controllerState = globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_CONTROLLER_STATE__ || { clusterCalls: [] };',
          'const compatState = globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_COMPAT_STATE__ || { delegationCalls: [] };',
          'export async function findClusterUnidadesByAnchorService(anchor) {',
          '  controllerState.clusterCalls.push(anchor);',
          '  compatState.delegationCalls.push(anchor);',
          '  return [',
          '    {',
          '      _id: "507f191e810c19729de860ea",',
          '      codigo: "U-001",',
          '      nome: "Unidade A",',
          '      is_principal: true,',
          '      subunidade: false,',
          '      unidade_principal_id: null,',
          '      cidade: "Cidade A",',
          '      estado: "SP",',
          '    },',
          '  ];',
          '}',
        ].join('\n'),
      };
    }

    if (url === CLUSTER_DATA_FACADE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const serviceState = globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_SERVICE_STATE__ || { facadeCalls: [] };',
          'export async function findClusterUnidadesByAnchorLeanData(anchor) {',
          '  serviceState.facadeCalls.push(anchor);',
          '  return [{ _id: "507f191e810c19729de860ea" }];',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const { unidadesCluster } = await import('#modules/gestor/app/controllers/apiController.js');
const { findClusterUnidadesByAnchorLean } = await import('#modules/gestor/app/db/api.db.js');

after(() => {
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_CONTROLLER_STATE__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_COMPAT_STATE__;
  delete globalThis.__GESTOR_API_UNIDADES_CLUSTER_STRUCTURAL_SERVICE_STATE__;
});

function resetState() {
  controllerState.clusterCalls.length = 0;
  compatState.delegationCalls.length = 0;
  serviceState.facadeCalls.length = 0;
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
  };
}

test('unidadesCluster usa o service fino como caminho principal da leitura de cluster', async () => {
  resetState();

  const req = {
    query: { unidade_id: '507f191e810c19729de860ea' },
    user: { role: 'master', isMaster: true },
    unitScope: { type: 'unit', unidadeId: '507f191e810c19729de860ea' },
  };
  const res = createResCapture();

  await unidadesCluster(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(controllerState.clusterCalls, ['507f191e810c19729de860ed']);
  assert.deepEqual(res.body, {
    ok: true,
    total: 1,
    unidades: [
      {
        id: '507f191e810c19729de860ea',
        codigo: 'U-001',
        nome: 'Unidade A',
        is_principal: true,
        subunidade: false,
        unidade_principal_id: null,
        cidade: 'Cidade A',
        estado: 'SP',
      },
    ],
  });
});

test('findClusterUnidadesByAnchorLean em api.db.js delega por compatibilidade ao service fino', async () => {
  resetState();

  const result = await findClusterUnidadesByAnchorLean('anchor-compat-001');

  assert.deepEqual(compatState.delegationCalls, ['anchor-compat-001']);
  assert.deepEqual(result, [
    {
      _id: '507f191e810c19729de860ea',
      codigo: 'U-001',
      nome: 'Unidade A',
      is_principal: true,
      subunidade: false,
      unidade_principal_id: null,
      cidade: 'Cidade A',
      estado: 'SP',
    },
  ]);
});

test('findClusterUnidadesByAnchorService delega a leitura para a data facade', async () => {
  resetState();

  const serviceModule = await import(`${ACTUAL_CLUSTER_SERVICE_MODULE_URL}?case=service-${Date.now()}`);
  const result = await serviceModule.findClusterUnidadesByAnchorService('anchor-service-001');

  assert.deepEqual(serviceState.facadeCalls, ['anchor-service-001']);
  assert.deepEqual(result, [{ _id: '507f191e810c19729de860ea' }]);
});