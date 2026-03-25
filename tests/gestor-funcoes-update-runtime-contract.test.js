import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import funcaoApiRouter from '../src/modules/gestor/app/routes/funcaoApi.js';

function createJsonResponseRecorder() {
  const response = {
    statusCode: 200,
    headers: {},
    payload: undefined,
  };

  response.status = (code) => {
    response.statusCode = code;
    return response;
  };

  response.set = (key, value) => {
    response.headers[key] = value;
    return response;
  };

  response.json = (payload) => {
    response.payload = payload;
    return response;
  };

  response.send = (payload) => {
    response.payload = payload;
    return response;
  };

  response.end = () => response;

  return response;
}

function createOwnerRequest({
  params = {},
  body = {},
  unitScope = undefined,
  user = undefined,
  session = undefined,
} = {}) {
  return {
    params,
    body,
    unitScope,
    user,
    session,
  };
}

async function importUpdateFuncaoWithMocks(t, overrides = {}) {
  const calls = {
    findFuncaoById: [],
    findOutraFuncaoByNomeExcludingId: [],
    updateFuncaoById: [],
    findFuncaoByIdLean: [],
    findUnidadeByIdWithModulosAcessiveis: [],
    findUnidadeUserBaseLean: [],
  };

  const defaults = {
    findFuncaoByNome: async () => null,
    createFuncao: async () => ({ _id: 'unused-create-id' }),
    findFuncaoByIdPopulated: async () => null,
    findFuncaoById: async (id, principalUnitId) => {
      calls.findFuncaoById.push([id, principalUnitId]);
      return null;
    },
    findOutraFuncaoByNomeExcludingId: async (id, nome, principalUnitId) => {
      calls.findOutraFuncaoByNomeExcludingId.push([id, nome, principalUnitId]);
      return null;
    },
    updateFuncaoById: async (id, updates, principalUnitId) => {
      calls.updateFuncaoById.push([id, updates, principalUnitId]);
      return { acknowledged: true };
    },
    findFuncaoByIdLean: async (id, principalUnitId) => {
      calls.findFuncaoByIdLean.push([id, principalUnitId]);
      return {
        _id: id,
        codigo: 'COD-001',
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
      };
    },
    findFuncoesByPrincipalUnitIdLean: async () => [],
    findFuncoesByFiltroLean: async () => [],
    findFuncoesByFiltroSelectLean: async () => [],
    deleteFuncaoById: async () => ({ deleted: true }),
    saveFuncao: async (doc) => doc,
    findUnidadeByIdWithModulosAcessiveis: async (principalUnitId) => {
      calls.findUnidadeByIdWithModulosAcessiveis.push([principalUnitId]);
      return {
        _id: principalUnitId,
        modulosAcessiveis: [
          { _id: 'mod-1', nome: 'Escalas' },
          { _id: 'mod-2', nome: 'Funcionarios' },
        ],
      };
    },
    findUnidadeUserBaseLean: async (unitId) => {
      calls.findUnidadeUserBaseLean.push([unitId]);
      if (unitId === 'u-filial-a') {
        return {
          _id: 'u-filial-a',
          is_principal: false,
          unidade_principal_id: 'u-principal-a',
          matriz_id: 'u-principal-a',
        };
      }

      if (unitId === 'u-filial-b') {
        return {
          _id: 'u-filial-b',
          is_principal: false,
          unidade_principal_id: 'u-principal-b',
          matriz_id: 'u-principal-b',
        };
      }

      if (unitId === 'u-principal-a' || unitId === 'u-principal-b') {
        return {
          _id: unitId,
          is_principal: true,
        };
      }

      return null;
    },
  };

  t.mock.module('#modules/gestor/app/services/apiDbBridgeService.js', {
    namedExports: {
      ...defaults,
      ...overrides,
    },
  });

  const module = await import(`../src/modules/gestor/app/controllers/funcaoApiController.js?case=${Date.now()}-${Math.random()}`);
  return { updateFuncao: module.updateFuncao, calls };
}

test('PUT /gestor/api/funcoes/:id sem sessao responde 401 JSON na borda real', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use('/gestor', funcaoApiRouter);

  const response = await request(app)
    .put('/gestor/api/funcoes/507f1f77bcf86cd799439011')
    .send({ nome: 'Supervisor' });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('updateFuncao colapsa id invalido em 404 sem validacao sintatica propria', async (t) => {
  const { updateFuncao, calls } = await importUpdateFuncaoWithMocks(t);
  const req = createOwnerRequest({
    params: { id: 'id-invalido' },
    body: { nome: 'Supervisor' },
  });
  const res = createJsonResponseRecorder();

  await updateFuncao(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  });
  assert.deepEqual(calls.findFuncaoById, [['id-invalido', null]]);
});

test('updateFuncao trata alvo fora do escopo contextual como funcao nao encontrada', async (t) => {
  const { updateFuncao, calls } = await importUpdateFuncaoWithMocks(t);
  const req = createOwnerRequest({
    params: { id: '507f1f77bcf86cd799439099' },
    body: { nome: 'Supervisor' },
    unitScope: { type: 'unit', unidadeId: 'u-filial-a' },
  });
  const res = createJsonResponseRecorder();

  await updateFuncao(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  });
  assert.deepEqual(calls.findUnidadeUserBaseLean, [['u-filial-a']]);
  assert.deepEqual(calls.findFuncaoById, [['507f1f77bcf86cd799439099', 'u-principal-a']]);
});

test('updateFuncao responde 404 quando a funcao nao existe no escopo efetivo', async (t) => {
  const { updateFuncao, calls } = await importUpdateFuncaoWithMocks(t);
  const req = createOwnerRequest({
    params: { id: '507f1f77bcf86cd799439011' },
    body: { nome: 'Supervisor' },
    unitScope: { type: 'unit', unidadeId: 'u-filial-a' },
  });
  const res = createJsonResponseRecorder();

  await updateFuncao(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Função não encontrada',
  });
  assert.deepEqual(calls.findFuncaoById, [['507f1f77bcf86cd799439011', 'u-principal-a']]);
});

test('updateFuncao retorna payload exato de sucesso no owner isolado', async (t) => {
  const { updateFuncao, calls } = await importUpdateFuncaoWithMocks(t, {
    findFuncaoById: async (id, principalUnitId) => {
      calls.findFuncaoById.push([id, principalUnitId]);
      return {
        _id: id,
        nome: 'Supervisor',
        descricao: 'Coordena equipe',
        unidade_principal_id: 'u-principal-a',
      };
    },
    findFuncaoByIdLean: async (id, principalUnitId) => {
      calls.findFuncaoByIdLean.push([id, principalUnitId]);
      return {
        _id: id,
        codigo: 'SUP',
        nome: 'Supervisor Senior',
        descricao: 'Coordena equipe ampliada',
      };
    },
  });
  const req = createOwnerRequest({
    params: { id: '507f1f77bcf86cd799439011' },
    body: {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      modulos_habilitados: ['mod-2', 'mod-x'],
    },
    unitScope: { type: 'unit', unidadeId: 'u-filial-a' },
  });
  const res = createJsonResponseRecorder();

  await updateFuncao(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    success: true,
    data: {
      updated: true,
      funcao: {
        _id: '507f1f77bcf86cd799439011',
        codigo: 'SUP',
        nome: 'Supervisor Senior',
        descricao: 'Coordena equipe ampliada',
        descricao_display: 'Coordena equipe ampliada',
        hasDescricaoReal: true,
      },
    },
  });
  assert.deepEqual(calls.findFuncaoById, [['507f1f77bcf86cd799439011', 'u-principal-a']]);
  assert.deepEqual(calls.findUnidadeByIdWithModulosAcessiveis, [['u-principal-a']]);
  assert.deepEqual(calls.updateFuncaoById, [[
    '507f1f77bcf86cd799439011',
    {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      unidade_principal_id: 'u-principal-a',
      modulos_habilitados: ['mod-2'],
    },
    'u-principal-a',
  ]]);
});

test('updateFuncao responde 500 quando ocorre erro interno relevante', async (t) => {
  const { updateFuncao } = await importUpdateFuncaoWithMocks(t, {
    findFuncaoById: async () => ({
      _id: '507f1f77bcf86cd799439011',
      nome: 'Supervisor',
      descricao: 'Coordena equipe',
      unidade_principal_id: 'u-principal-a',
    }),
    updateFuncaoById: async () => {
      throw new Error('forced-funcoes-update-failure');
    },
  });
  const req = createOwnerRequest({
    params: { id: '507f1f77bcf86cd799439011' },
    body: { nome: 'Supervisor Senior' },
    unitScope: { type: 'unit', unidadeId: 'u-filial-a' },
  });
  const res = createJsonResponseRecorder();

  await updateFuncao(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-funcoes-update-failure',
  });
});
