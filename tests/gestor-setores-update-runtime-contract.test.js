import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-setores-update-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_SETORES_UPDATE_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_SETORES_UPDATE_DB_MOCKS__ = { ...overrides };
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

async function importUpdateSetor(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('updateSetor rejeita unidade_id divergente do contexto canônico com 404', async () => {
  setDbMocks({});

  const { updateSetor } = await importUpdateSetor('unit-mismatch');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-1' },
    body: { unidade_id: 'u-outra' },
  });
  const res = createResCapture();

  await updateSetor(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('updateSetor responde 404 quando o alvo escopado não existe no contexto', async () => {
  let receivedLookupArgs = null;
  setDbMocks({
    findSetorById: async (id, unidadeId) => {
      receivedLookupArgs = { id, unidadeId };
      return null;
    },
  });

  const { updateSetor } = await importUpdateSetor('scoped-missing-target');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ausente' },
    body: {},
  });
  const res = createResCapture();

  await updateSetor(req, res);

  assert.deepEqual(receivedLookupArgs, { id: 's-ausente', unidadeId: 'u-contexto' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Setor não encontrado',
  });
});

test('updateSetor trata duplicidade de nome na mesma unidade com 400', async () => {
  let receivedDupArgs = null;
  setDbMocks({
    findSetorById: async () => ({
      _id: 's-dup',
      unidade_id: 'u-contexto',
      descricao: 'Setor atual',
    }),
    findSetorDupByNomeNormalizadoExcludingId: async (...args) => {
      receivedDupArgs = args;
      return { _id: 's-existente' };
    },
  });

  const { updateSetor } = await importUpdateSetor('duplicate-name');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-dup' },
    body: { nome: '   Financeiro  Central   ' },
  });
  const res = createResCapture();

  await updateSetor(req, res);

  assert.deepEqual(receivedDupArgs, ['s-dup', 'u-contexto', 'financeiro central']);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Já existe outro setor com este nome nesta unidade.',
  });
});

test('updateSetor retorna sucesso no caminho feliz com updated true', async () => {
  let savedSnapshot = null;
  setDbMocks({
    findSetorById: async () => ({
      _id: 's-ok',
      unidade_id: 'u-contexto',
      nome: 'Antigo',
      nome_normalizado: 'antigo',
      descricao: 'Descricao antiga',
    }),
    findSetorDupByNomeNormalizadoExcludingId: async () => null,
    saveSetor: async (setor) => {
      savedSnapshot = {
        _id: setor._id,
        unidade_id: setor.unidade_id,
        nome: setor.nome,
        nome_normalizado: setor.nome_normalizado,
        descricao: setor.descricao,
      };
      return setor;
    },
  });

  const { updateSetor } = await importUpdateSetor('success');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ok' },
    body: { nome: ' Setor Novo ', descricao: 'Descricao nova' },
  });
  const res = createResCapture();

  await updateSetor(req, res);

  assert.deepEqual(savedSnapshot, {
    _id: 's-ok',
    unidade_id: 'u-contexto',
    nome: ' Setor Novo ',
    nome_normalizado: 'setor novo',
    descricao: 'Descricao nova',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      updated: true,
    },
  });
});