import assert from 'node:assert/strict';
import test, { after, mock } from 'node:test';

const controllerState = {
  clusterCalls: [],
};

const compatState = {
  delegationCalls: [],
};

mock.module('#modules/gestor/app/services/apiDbBridgeService.js', {
  namedExports: {
    async findUnidadeByCodigoLean() {
      return null;
    },
    async findUnidadeByIdLean() {
      return null;
    },
    async findUnidadeByIdOrRawLean() {
      return {
        _id: '507f191e810c19729de860ea',
        matriz_id: '507f191e810c19729de860ed',
      };
    },
    async findUnidadeUserBaseLean() {
      return {
        _id: '507f191e810c19729de860ea',
        matriz_id: '507f191e810c19729de860ed',
      };
    },
  },
});

mock.module('#modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js', {
  namedExports: {
    async findClusterUnidadesByAnchorService(anchor) {
      controllerState.clusterCalls.push(anchor);
      compatState.delegationCalls.push(anchor);
      return [
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
      ];
    },
  },
});

const { unidadesCluster } = await import('#modules/gestor/app/controllers/apiController.js');
const { findClusterUnidadesByAnchorLean } = await import('#modules/gestor/app/db/api.db.js');

after(() => {
  mock.restoreAll();
});

function resetState() {
  controllerState.clusterCalls.length = 0;
  compatState.delegationCalls.length = 0;
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