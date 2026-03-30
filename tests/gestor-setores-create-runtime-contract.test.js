import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-setores-create-api-db-bridge';

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
        'const getMocks = () => globalThis.__GESTOR_SETORES_CREATE_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_SETORES_CREATE_DB_MOCKS__ = { ...overrides };
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

async function importCreateSetor(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('createSetor rejeita nome ausente com 400', async () => {
  setDbMocks({});

  const { createSetor } = await importCreateSetor('missing-name');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: {},
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nome é obrigatório',
  });
});

test('createSetor rejeita unidade ausente com 400', async () => {
  setDbMocks({});

  const { createSetor } = await importCreateSetor('missing-unit');
  const req = createReq({
    user: { role: 'diretor' },
    body: { nome: 'Financeiro' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Unidade é obrigatória',
  });
});

test('createSetor rejeita unidade fora do contexto com 404', async () => {
  let duplicateLookupCalled = false;
  setDbMocks({
    findSetorByUnidadeAndNomeNormalizadoLean: async () => {
      duplicateLookupCalled = true;
      return null;
    },
  });

  const { createSetor } = await importCreateSetor('unit-mismatch');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: { nome: 'Financeiro', unidade_id: 'u-outra' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.equal(duplicateLookupCalled, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('createSetor traduz duplicate_name do core em 409 com envelope correto', async () => {
  let receivedLookupArgs = null;
  setDbMocks({
    findSetorByUnidadeAndNomeNormalizadoLean: async (unidadeId, nomeNormalizado) => {
      receivedLookupArgs = { unidadeId, nomeNormalizado };
      return { _id: 's-existente' };
    },
  });

  const { createSetor } = await importCreateSetor('duplicate-name');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: { nome: '  Financeiro   Central  ', descricao: 'Backoffice' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.deepEqual(receivedLookupArgs, {
    unidadeId: 'u-contexto',
    nomeNormalizado: 'financeiro central',
  });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'Setor já cadastrado nesta unidade',
    duplicateField: 'nome',
    duplicateValue: '  Financeiro   Central  ',
    duplicateId: 's-existente',
  });
});

test('createSetor retorna 201 com o envelope mínimo esperado no sucesso', async () => {
  let duplicateLookupArgs = null;
  let createPayload = null;
  setDbMocks({
    findSetorByUnidadeAndNomeNormalizadoLean: async (unidadeId, nomeNormalizado) => {
      duplicateLookupArgs = { unidadeId, nomeNormalizado };
      return null;
    },
    createSetor: async (payload) => {
      createPayload = payload;
      return {
        _id: 's-ok',
        codigo: 'S001',
        ...payload,
      };
    },
  });

  const { createSetor } = await importCreateSetor('success');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: { nome: '  Financeiro   Central  ', descricao: 'Backoffice' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.deepEqual(duplicateLookupArgs, {
    unidadeId: 'u-contexto',
    nomeNormalizado: 'financeiro central',
  });
  assert.deepEqual(createPayload, {
    nome: '  Financeiro   Central  ',
    nome_normalizado: 'financeiro central',
    descricao: 'Backoffice',
    unidade_id: 'u-contexto',
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    created: true,
    id: 's-ok',
    data: {
      _id: 's-ok',
      codigo: 'S001',
    },
  });
});

test('createSetor traduz erro 11000 em 409 no caminho correto', async () => {
  const duplicateError = new Error('duplicate-driver');
  duplicateError.code = 11000;
  duplicateError.keyPattern = { codigo: 1 };
  duplicateError.keyValue = { codigo: 'S001' };

  setDbMocks({
    findSetorByUnidadeAndNomeNormalizadoLean: async () => null,
    createSetor: async () => {
      throw duplicateError;
    },
  });

  const { createSetor } = await importCreateSetor('driver-duplicate');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: { nome: 'Financeiro' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'Código de setor duplicado (falha na sequência). Tente novamente.',
    duplicateField: 'codigo',
    duplicateValue: 'S001',
    needsSequenceCheck: true,
  });
});

test('createSetor preserva 500 em erro externo relevante', async () => {
  setDbMocks({
    findSetorByUnidadeAndNomeNormalizadoLean: async () => null,
    createSetor: async () => {
      throw new Error('forced-setores-create-runtime-failure');
    },
  });

  const { createSetor } = await importCreateSetor('server-error');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    body: { nome: 'Financeiro' },
  });
  const res = createResCapture();

  await createSetor(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-setores-create-runtime-failure',
  });
});