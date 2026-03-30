import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-setores-list-api-db-bridge';

const DB_BRIDGE_EXPORTS = [
  'findUnidadeById',
  'findSetorByUnidadeAndNomeNormalizadoLean',
  'createSetor',
  'findSetoresByUnidadeIdPopulateLean',
  'findSetorByIdPopulateUnidade',
  'findSetorById',
  'findSetorDupByNomeNormalizadoExcludingId',
  'saveSetor',
  'findSetoresByFiltroPopulateUnidadeLean',
  'findUnidadesByIdsNomeCodigoLean',
  'findSetorByIdAndDelete',
  'findCounterSetorCodigoLean',
  'findMaxSetorCodigoLean',
  'findOneAndUpdateCounterSetorCodigo',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: dbBridgeMockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === dbBridgeMockModuleUrl) {
      const lines = [
        `export * from '${actualDbBridgeModuleUrl}';`,
        `import * as actual from '${actualDbBridgeModuleUrl}';`,
        'const getMocks = () => globalThis.__GESTOR_SETORES_LIST_DB_MOCKS__ || {};',
        'const resolveImpl = (name) => {',
        '  const fn = getMocks()[name];',
        "  if (typeof fn === 'function') return fn;",
        '  return actual[name];',
        '};',
      ];

      for (const exportName of DB_BRIDGE_EXPORTS) {
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

function setDbMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_LIST_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
  globalThis.__GESTOR_SETORES_LIST_DB_MOCKS__ = {};
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
      this.headers[String(field).toLowerCase()] = value;
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

async function importListarSetores(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test.afterEach(() => {
  clearDbMocks();
});

test('listarSetores retorna 200 com lista vazia para usuario nao privilegiado sem unidade canonica', async () => {
  let listCalls = 0;
  let unidadesCalls = 0;
  setDbMocks({
    findSetoresByFiltroPopulateUnidadeLean: async () => {
      listCalls += 1;
      return [];
    },
    findUnidadesByIdsNomeCodigoLean: async () => {
      unidadesCalls += 1;
      return [];
    },
  });

  const { listarSetores } = await importListarSetores('missing-canonical-unit');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    query: { unidade_id: 'u-query' },
  });
  const res = createResCapture();

  await listarSetores(req, res);

  assert.equal(listCalls, 0);
  assert.equal(unidadesCalls, 0);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [],
  });
});

test('listarSetores usa unitScope canonico antes da query e retorna envelope de sucesso', async () => {
  let receivedFilter = null;
  let unidadesCalls = 0;
  setDbMocks({
    findSetoresByFiltroPopulateUnidadeLean: async (filtro) => {
      receivedFilter = JSON.parse(JSON.stringify(filtro));
      return [];
    },
    findUnidadesByIdsNomeCodigoLean: async () => {
      unidadesCalls += 1;
      return [];
    },
  });

  const { listarSetores } = await importListarSetores('canonical-precedence');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-contexto' },
    query: { unidade_id: 'u-query' },
  });
  const res = createResCapture();

  await listarSetores(req, res);

  assert.deepEqual(receivedFilter, { unidade_id: 'u-contexto' });
  assert.equal(unidadesCalls, 0);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [],
  });
});

test('listarSetores preserva unidade_nome, unidade_label e unidade_id_raw quando a unidade ja vem populada', async () => {
  setDbMocks({
    findSetoresByFiltroPopulateUnidadeLean: async (filtro) => {
      assert.deepEqual(JSON.parse(JSON.stringify(filtro)), { unidade_id: 'u-contexto' });
      return [
        {
          _id: 's-1',
          nome: 'Financeiro',
          descricao: 'Backoffice',
          unidade_id: { _id: 'u-contexto', codigo: '001', nome: 'Matriz' },
        },
      ];
    },
    findUnidadesByIdsNomeCodigoLean: async () => {
      throw new Error('nao deve fazer lookup adicional quando populate ja veio resolvido');
    },
  });

  const { listarSetores } = await importListarSetores('populated-success');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-contexto' },
  });
  const res = createResCapture();

  await listarSetores(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      {
        _id: 's-1',
        nome: 'Financeiro',
        descricao: 'Backoffice',
        unidade_id: { _id: 'u-contexto', codigo: '001', nome: 'Matriz' },
        unidade_nome: '001 - Matriz',
        unidade_label: '001 - Matriz',
        unidade_id_raw: 'u-contexto',
      },
    ],
  });
});

test('listarSetores usa fallback via findUnidadesByIdsNomeCodigoLean quando unidade_id vem como string', async () => {
  let receivedLookupIds = null;
  setDbMocks({
    findSetoresByFiltroPopulateUnidadeLean: async (filtro) => {
      assert.deepEqual(JSON.parse(JSON.stringify(filtro)), { unidade_id: 'u-contexto' });
      return [
        {
          _id: 's-2',
          nome: 'RH',
          descricao: '',
          unidade_id: 'u-contexto',
        },
      ];
    },
    findUnidadesByIdsNomeCodigoLean: async (unidadeIds) => {
      receivedLookupIds = JSON.parse(JSON.stringify(unidadeIds));
      return [
        { _id: 'u-contexto', codigo: '001', nome: 'Matriz' },
      ];
    },
  });

  const { listarSetores } = await importListarSetores('fallback-success');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-contexto' },
  });
  const res = createResCapture();

  await listarSetores(req, res);

  assert.deepEqual(receivedLookupIds, ['u-contexto']);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      {
        _id: 's-2',
        nome: 'RH',
        descricao: '',
        unidade_id: 'u-contexto',
        unidade_nome: '001 - Matriz',
        unidade_label: '001 - Matriz',
        unidade_id_raw: 'u-contexto',
      },
    ],
  });
});

test('listarSetores preserva 500 em erro externo relevante', async () => {
  setDbMocks({
    findSetoresByFiltroPopulateUnidadeLean: async () => {
      throw new Error('forced-setores-list-runtime-failure');
    },
  });

  const { listarSetores } = await importListarSetores('server-error');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    query: { unidade_id: 'u-query' },
  });
  const res = createResCapture();

  await listarSetores(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-list-runtime-failure',
  });
});