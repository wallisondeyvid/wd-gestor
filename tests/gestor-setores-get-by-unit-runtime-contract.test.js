import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';
import request from 'supertest';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-setores-get-by-unit-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_SETORES_GET_BY_UNIT_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_SETORES_GET_BY_UNIT_DB_MOCKS__ = { ...overrides };
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

async function importGetSetoresPorUnidade(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function requestSetorRouterWithSession({ pathname, sessionUser, bridgeOverrides = {} } = {}) {
  setDbMocks(bridgeOverrides);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = sessionUser ? { user: { ...sessionUser } } : {};
    next();
  });
  app.use('/gestor', (await import('../src/modules/gestor/app/routes/setorApi.js')).default);

  return request(app)
    .get(pathname)
    .set('Accept', 'application/json');
}

test('GET /gestor/api/setores/unidade/:unidadeId com diretor sem contexto canonico ativo retorna 400 na borda real', async () => {
  const response = await requestSetorRouterWithSession({
    pathname: '/gestor/api/setores/unidade/u-param',
    sessionUser: {
      id: 'session-diretor-sem-contexto',
      email: 'diretor.setor.sem.contexto@example.com',
      role: 'diretor',
      nome: 'Diretor sem contexto',
    },
    bridgeOverrides: {
      findSetoresByUnidadeIdPopulateLean: async () => {
        throw new Error('controller-should-not-run-without-canonical-context');
      },
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
});

test('getSetoresPorUnidade retorna 200 com lista vazia quando a unidade efetiva e null ou "null"', async () => {
  let lookupCalled = false;
  setDbMocks({
    findSetoresByUnidadeIdPopulateLean: async () => {
      lookupCalled = true;
      return [];
    },
  });

  const { getSetoresPorUnidade } = await importGetSetoresPorUnidade('nullish-unit');

  for (const req of [
    createReq({ user: { role: 'diretor' }, params: { unidadeId: 'null' } }),
    createReq({ user: { role: 'diretor' }, params: {} }),
  ]) {
    const res = createResCapture();
    await getSetoresPorUnidade(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      success: true,
      data: [],
    });
  }

  assert.equal(lookupCalled, false);
});

test('getSetoresPorUnidade usa unitScope canonico antes do param e retorna a lista no envelope de sucesso', async () => {
  let receivedLookupUnitId = null;
  setDbMocks({
    findSetoresByUnidadeIdPopulateLean: async (unidadeId) => {
      receivedLookupUnitId = unidadeId;
      return [
        { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: unidadeId } },
        { _id: 's-2', nome: 'RH', unidade_id: { _id: unidadeId } },
      ];
    },
  });

  const { getSetoresPorUnidade } = await importGetSetoresPorUnidade('scoped-success');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { unidadeId: 'u-param' },
  });
  const res = createResCapture();

  await getSetoresPorUnidade(req, res);

  assert.equal(receivedLookupUnitId, 'u-contexto');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: 'u-contexto' } },
      { _id: 's-2', nome: 'RH', unidade_id: { _id: 'u-contexto' } },
    ],
  });
});

test('getSetoresPorUnidade usa o param quando nao ha unitScope', async () => {
  let receivedLookupUnitId = null;
  setDbMocks({
    findSetoresByUnidadeIdPopulateLean: async (unidadeId) => {
      receivedLookupUnitId = unidadeId;
      return [
        { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: unidadeId } },
      ];
    },
  });

  const { getSetoresPorUnidade } = await importGetSetoresPorUnidade('param-success');
  const req = createReq({
    user: { role: 'admin' },
    params: { unidadeId: 'u-param' },
  });
  const res = createResCapture();

  await getSetoresPorUnidade(req, res);

  assert.equal(receivedLookupUnitId, 'u-param');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      { _id: 's-1', nome: 'Financeiro', unidade_id: { _id: 'u-param' } },
    ],
  });
});

test('getSetoresPorUnidade preserva 500 em erro externo relevante', async () => {
  setDbMocks({
    findSetoresByUnidadeIdPopulateLean: async () => {
      throw new Error('forced-setores-get-by-unit-runtime-failure');
    },
  });

  const { getSetoresPorUnidade } = await importGetSetoresPorUnidade('server-error');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { unidadeId: 'u-param' },
  });
  const res = createResCapture();

  await getSetoresPorUnidade(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-get-by-unit-runtime-failure',
  });
});