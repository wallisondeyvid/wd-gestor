import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-setores-get-by-id-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_SETORES_GET_BY_ID_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_SETORES_GET_BY_ID_DB_MOCKS__ = { ...overrides };
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

async function importGetSetor(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('getSetor responde 404 quando o alvo escopado não existe no contexto', async () => {
  let receivedLookupArgs = null;
  setDbMocks({
    findSetorByIdPopulateUnidade: async (id, unidadeId) => {
      receivedLookupArgs = { id, unidadeId };
      return null;
    },
  });

  const { getSetor } = await importGetSetor('scoped-missing-target');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ausente' },
  });
  const res = createResCapture();

  await getSetor(req, res);

  assert.deepEqual(receivedLookupArgs, { id: 's-ausente', unidadeId: 'u-contexto' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Setor não encontrado',
  });
});

test('getSetor usa unitScope canônico no lookup e retorna payload plano de sucesso', async () => {
  let receivedLookupArgs = null;
  setDbMocks({
    findSetorByIdPopulateUnidade: async (id, unidadeId) => {
      receivedLookupArgs = { id, unidadeId };
      return {
        _id: id,
        nome: 'Financeiro',
        descricao: undefined,
        unidade_id: { _id: 'u-contexto' },
      };
    },
  });

  const { getSetor } = await importGetSetor('success');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ok' },
  });
  const res = createResCapture();

  await getSetor(req, res);

  assert.deepEqual(receivedLookupArgs, { id: 's-ok', unidadeId: 'u-contexto' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      _id: 's-ok',
      nome: 'Financeiro',
      descricao: '',
      unidade_id: 'u-contexto',
    },
  });
});