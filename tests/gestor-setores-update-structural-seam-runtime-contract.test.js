import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/setorApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/setores/updateSetorScoped.service.js')).href;
const actualRepositoryModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/repositories/SetorReadRepository.js')).href;
const bridgeMockModuleUrl = 'mock:gestor-setores-update-bridge';

const repositoryMockModuleUrl = 'mock:gestor-setores-update-repositories';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/SetorReadRepository.js') {
      return { url: repositoryMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const notUsed = async () => { throw new Error('bridge compat nao deveria ser chamada nesta suite'); };",
          'export const findUnidadeById = notUsed;',
          'export const findSetorByUnidadeAndNomeNormalizadoLean = notUsed;',
          'export const createSetor = notUsed;',
          'export const findSetoresByUnidadeIdPopulateLean = notUsed;',
          'export const findSetorByIdPopulateUnidade = notUsed;',
          'export const findSetorDupByNomeNormalizadoExcludingId = notUsed;',
          'export const saveSetor = notUsed;',
          'export const findSetoresByFiltroPopulateUnidadeLean = notUsed;',
          'export const findUnidadesByIdsNomeCodigoLean = notUsed;',
          'export const findCounterSetorCodigoLean = notUsed;',
          'export const findMaxSetorCodigoLean = notUsed;',
          'export const findOneAndUpdateCounterSetorCodigo = notUsed;',
        ].join('\n'),
      };
    }

    if (url === repositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          `export * from '${actualRepositoryModuleUrl}';`,
          `import * as actual from '${actualRepositoryModuleUrl}';`,
          "const getMocks = () => globalThis.__GESTOR_SETORES_UPDATE_REPOSITORY_MOCKS__ || {};",
          "const resolveImpl = (name) => {",
          "  const fn = getMocks()[name];",
          "  if (typeof fn === 'function') return fn;",
          "  return actual[name];",
          "};",
          "export async function findSetorByIdRepo(...args) {",
          "  return await resolveImpl('findSetorByIdRepo')(...args);",
          "}",
          "export async function findSetorDupByNomeNormalizadoExcludingIdRepo(...args) {",
          "  return await resolveImpl('findSetorDupByNomeNormalizadoExcludingIdRepo')(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

function setRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_SETORES_UPDATE_REPOSITORY_MOCKS__ = { ...overrides };
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
  setRepositoryMocks({
    findSetorByIdRepo: async (args) => {
      calls.push({ op: 'findSetorByIdRepo', args });
      return null;
    },
    findSetorDupByNomeNormalizadoExcludingIdRepo: async (args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingIdRepo', args });
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
  assert.equal(calls[0].op, 'findSetorByIdRepo');
  assert.equal(calls[0].args.id, 's-ausente');
  assert.equal(calls[0].args.unidadeId, 'u-contexto');
  assert.deepEqual(calls[0].args.unitScope, { type: 'unit', unidadeId: 'u-contexto' });
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

  setRepositoryMocks({
    findSetorByIdRepo: async (args) => {
      calls.push({ op: 'findSetorByIdRepo', args });
      return setorDoc;
    },
    findSetorDupByNomeNormalizadoExcludingIdRepo: async (args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingIdRepo', args });
      return null;
    },
  });

  const { updateSetorScopedService } = await importUpdateSetorService('service-success');
  const result = await updateSetorScopedService({
    setorId: 's-ok',
    canonicalUnitId: '507f1f77bcf86cd799439011',
    changes: { nome: ' Setor Novo ', descricao: 'Descricao nova' },
  });

  assert.deepEqual(result, { kind: 'updated' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, 'findSetorByIdRepo');
  assert.equal(calls[1].op, 'findSetorDupByNomeNormalizadoExcludingIdRepo');
  assert.equal(calls[0].args.id, 's-ok');
  assert.equal(calls[0].args.unidadeId, '507f1f77bcf86cd799439011');
  assert.deepEqual(calls[0].args.unitScope, { type: 'unit', unidadeId: '507f1f77bcf86cd799439011' });
  assert.equal(calls[1].args.setorId, 's-ok');
  assert.equal(calls[1].args.unidadeId, '507f1f77bcf86cd799439011');
  assert.equal(calls[1].args.nomeNormalizado, 'setor novo');
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

  setRepositoryMocks({
    findSetorByIdRepo: async (args) => {
      calls.push({ op: 'findSetorByIdRepo', args });
      return setorDoc;
    },
    findSetorDupByNomeNormalizadoExcludingIdRepo: async (args) => {
      calls.push({ op: 'findSetorDupByNomeNormalizadoExcludingIdRepo', args });
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
  assert.equal(calls[0].op, 'findSetorByIdRepo');
  assert.equal(calls[1].op, 'findSetorDupByNomeNormalizadoExcludingIdRepo');
  assert.equal(calls[1].args.nomeNormalizado, 'financeiro central');
});