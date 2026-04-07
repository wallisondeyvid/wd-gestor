import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/setores/updateSetorScoped.service.js')).href;
const bridgeMockModuleUrl = 'mock:gestor-setores-update-bridge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_SETORES_UPDATE_BRIDGE_MOCKS__ || {};",
          "const notUsed = async () => { throw new Error('bridge compat nao deveria ser chamada nesta suite'); };",
          'export const findUnidadeById = notUsed;',
          'export const findSetorByUnidadeAndNomeNormalizadoLean = notUsed;',
          'export const createSetor = notUsed;',
          'export const findSetoresByUnidadeIdPopulateLean = notUsed;',
          'export const findSetorByIdPopulateUnidade = notUsed;',
          'export async function findSetorById(...args) { return await (getMocks().findSetorById || notUsed)(...args); }',
          'export async function findSetorDupByNomeNormalizadoExcludingId(...args) { return await (getMocks().findSetorDupByNomeNormalizadoExcludingId || notUsed)(...args); }',
          'export async function saveSetor(...args) { return await (getMocks().saveSetor || notUsed)(...args); }',
          'export const findSetoresByFiltroPopulateUnidadeLean = notUsed;',
          'export const findUnidadesByIdsNomeCodigoLean = notUsed;',
          'export const findSetorByIdAndDelete = notUsed;',
          'export const findCounterSetorCodigoLean = notUsed;',
          'export const findMaxSetorCodigoLean = notUsed;',
          'export const findOneAndUpdateCounterSetorCodigo = notUsed;',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_UPDATE_BRIDGE_MOCKS__ = { ...overrides };
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
    send(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

async function importUpdateSetor(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importUpdateSetorService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

test('updateSetor usa o service fino como caminho principal e preserva 404 quando o service nao encontra alvo', async () => {
  const calls = [];
  setBridgeMocks({
    findSetorById: async (...args) => {
      calls.push({ op: 'findSetorById', args });
      return null;
    },
    findSetorDupByNomeNormalizadoExcludingId: async (...args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingId', args });
      return { kind: 'not_found' };
    },
  });

  const { updateSetor } = await importUpdateSetor('owner-not-found');
  const req = createReq({
    user: { role: 'diretor' },
    unitScope: { unidadeId: 'u-contexto' },
    params: { id: 's-ausente' },
    body: {},
  });
  const res = createResCapture();

  await updateSetor(req, res);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'findSetorById');
  assert.deepEqual(calls[0].args, ['s-ausente', 'u-contexto']);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Setor não encontrado',
  });
});

test('updateSetorScopedService consulta duplicidade por nome normalizado e persiste o documento atualizado', async () => {
  const calls = [];
  let savedSnapshot = null;
  const setorDoc = {
    _id: 's-ok',
    unidade_id: '507f1f77bcf86cd799439011',
    nome: 'Antigo',
    nome_normalizado: 'antigo',
    descricao: 'Descricao antiga',
    async save() {
      savedSnapshot = {
        _id: this._id,
        unidade_id: this.unidade_id,
        nome: this.nome,
        nome_normalizado: this.nome_normalizado,
        descricao: this.descricao,
      };
      return this;
    },
  };

  setBridgeMocks({
    findSetorById: async (...args) => {
      calls.push({ op: 'findSetorById', args });
      return setorDoc;
    },
    findSetorDupByNomeNormalizadoExcludingId: async (...args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingId', args });
      return null;
    },
    saveSetor: async (setor) => setor.save(),
  });

  const { updateSetorScopedService } = await importUpdateSetorService('service-success');
  const result = await updateSetorScopedService({
    setorId: 's-ok',
    canonicalUnitId: '507f1f77bcf86cd799439011',
    changes: { nome: ' Setor Novo ', descricao: 'Descricao nova' },
  });

  assert.deepEqual(result, { kind: 'updated' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findSetorById');
  assert.equal(calls[1].op, 'findSetorDupByNomeNormalizadoExcludingId');
  assert.deepEqual(calls[0].args, ['s-ok', '507f1f77bcf86cd799439011']);
  assert.deepEqual(calls[1].args, ['s-ok', '507f1f77bcf86cd799439011', 'setor novo']);
  assert.deepEqual(savedSnapshot, {
    _id: 's-ok',
    unidade_id: '507f1f77bcf86cd799439011',
    nome: ' Setor Novo ',
    nome_normalizado: 'setor novo',
    descricao: 'Descricao nova',
  });
});

test('updateSetorScopedService retorna duplicate_name quando encontra outro setor com o mesmo nome normalizado', async () => {
  const calls = [];
  const setorDoc = {
    _id: 's-dup',
    unidade_id: '507f1f77bcf86cd799439011',
    nome: 'Antigo',
    nome_normalizado: 'antigo',
    descricao: 'Descricao antiga',
    async save() {
      throw new Error('save nao deveria ser chamado');
    },
  };

  setBridgeMocks({
    findSetorById: async (...args) => {
      calls.push({ op: 'findSetorById', args });
      return setorDoc;
    },
    findSetorDupByNomeNormalizadoExcludingId: async (...args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingId', args });
      return { _id: 's-existente' };
    },
  });

  const { updateSetorScopedService } = await importUpdateSetorService('service-duplicate');
  const result = await updateSetorScopedService({
    setorId: 's-dup',
    canonicalUnitId: '507f1f77bcf86cd799439011',
    changes: { nome: ' Financeiro Central ' },
  });

  assert.deepEqual(result, { kind: 'duplicate_name' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findSetorById');
  assert.equal(calls[1].op, 'findSetorDupByNomeNormalizadoExcludingId');
  assert.deepEqual(calls[1].args, ['s-dup', '507f1f77bcf86cd799439011', 'financeiro central']);
});