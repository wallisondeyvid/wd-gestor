import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerHooks } from 'node:module';
import request from 'supertest';

const CONTROLLER_ALIAS = '#modules/gestor/app/controllers/funcaoApiController.js';
const CONTROLLER_MOCK_URL = 'mock:gestor-funcoes-get-by-id-query-controller';

globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__ = [];
globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = false;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === CONTROLLER_ALIAS && globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__) {
      return {
        shortCircuit: true,
        url: CONTROLLER_MOCK_URL,
      };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === CONTROLLER_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
const getCalls = () => globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__;
export async function getFuncao(req, res) {
  getCalls().push({
    method: 'GET',
    params: req?.params || null,
    query: req?.query || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { _id: String(req?.params?.id || '') } });
}
export async function createFuncao(req, res) { return res.status(201).json({ success: true, data: { _id: 'mock-created' } }); }
export async function updateFuncao(req, res) {
  getCalls().push({
    method: 'PUT',
    params: req?.params || null,
    query: req?.query || null,
    body: req?.body || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { updated: true } });
}
export async function getFuncoesPorUnidade(req, res) { return res.status(200).json({ success: true, data: [] }); }
export async function listarFuncoesApi(req, res) { return res.status(200).json({ success: true, data: [] }); }
export async function deleteFuncao(req, res) {
  getCalls().push({
    method: 'DELETE',
    params: req?.params || null,
    query: req?.query || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { deleted: true } });
}
export async function bulkUpdateFuncoes(req, res) { return res.status(200).json({ success: true, data: { updated: 0, results: [] } }); }
export default { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes };
`,
      };
    }

    return nextLoad(url, context);
  },
});

function resetRuntimeState() {
  globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__ = [];
  globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = false;
}

async function requestWithSession({ pathname, sessionUser, method = 'GET', body } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = sessionUser ? { user: { ...sessionUser } } : {};
    next();
  });

  globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = true;
  const routeModule = await import(`../src/modules/gestor/app/routes/funcaoApi.js?get-id-query-${Date.now()}`);
  app.use('/gestor', routeModule.default);

  const req = request(app)
    [String(method || 'GET').toLowerCase()](pathname)
    .set('Accept', 'application/json');

  if (body !== undefined) {
    req.send(body);
  }

  const res = await req;

  return { status: res.status, body: res.body };
}

test.beforeEach(() => {
  resetRuntimeState();
});

test('GET /gestor/api/funcoes/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto',
      email: 'admin.sem.contexto@example.com',
      role: 'admin',
      nome: 'Admin sem contexto',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''),
    '507f191e810c19729de860ea',
  );
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''),
    '507f191e810c19729de860ea',
  );
});

test('GET /gestor/api/funcoes/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-sem-unidade',
      email: 'admin.sem.unidade@example.com',
      role: 'admin',
      nome: 'Admin sem unidade',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});

test('PUT /gestor/api/funcoes/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto-put',
      email: 'admin.sem.contexto.put@example.com',
      role: 'admin',
      nome: 'Admin sem contexto PUT',
    },
    method: 'PUT',
    body: {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      unidade_principal_id: '507f191e810c19729de860ea',
      modulos_habilitados: ['mod-1'],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.method, 'PUT');
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''),
    '507f191e810c19729de860ea',
  );
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''),
    '507f191e810c19729de860ea',
  );
});

test('PUT /gestor/api/funcoes/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-put-sem-unidade',
      email: 'admin.sem.unidade.put@example.com',
      role: 'admin',
      nome: 'Admin sem unidade PUT',
    },
    method: 'PUT',
    body: {
      nome: 'Supervisor Senior',
      descricao: 'Coordena equipe ampliada',
      unidade_principal_id: '507f191e810c19729de860ea',
      modulos_habilitados: ['mod-1'],
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});

test('DELETE /gestor/api/funcoes/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto-delete',
      email: 'admin.sem.contexto.delete@example.com',
      role: 'admin',
      nome: 'Admin sem contexto DELETE',
    },
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.method, 'DELETE');
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''),
    '507f191e810c19729de860ea',
  );
  assert.equal(
    String(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''),
    '507f191e810c19729de860ea',
  );
});

test('DELETE /gestor/api/funcoes/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/funcoes/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-delete-sem-unidade',
      email: 'admin.sem.unidade.delete@example.com',
      role: 'admin',
      nome: 'Admin sem unidade DELETE',
    },
    method: 'DELETE',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_FUNCOES_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});
