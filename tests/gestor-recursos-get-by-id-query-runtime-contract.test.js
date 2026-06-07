import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerHooks } from 'node:module';
import request from 'supertest';

const CONTROLLER_ALIAS = '#modules/gestor/app/controllers/recursoApiController.js';
const CONTROLLER_MOCK_URL = 'mock:gestor-recursos-get-by-id-query-controller';

globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__ = [];
globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = false;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === CONTROLLER_ALIAS && globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__) {
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
const getCalls = () => globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__;
export async function listarRecursosApi(req, res) { return res.status(200).json({ success: true, data: [] }); }
export async function createRecurso(req, res) { return res.status(201).json({ success: true, data: { _id: 'mock-created' } }); }
export async function getRecurso(req, res) {
  getCalls().push({
    method: 'GET',
    params: req?.params || null,
    query: req?.query || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || req?.session?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { _id: String(req?.params?.id || '') } });
}
export async function updateRecurso(req, res) {
  getCalls().push({
    method: 'PUT',
    params: req?.params || null,
    query: req?.query || null,
    body: req?.body || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || req?.session?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { updated: true } });
}
export async function deleteRecurso(req, res) {
  getCalls().push({
    method: 'DELETE',
    params: req?.params || null,
    query: req?.query || null,
    unitScope: req?.unitScope || null,
    userRole: req?.user?.role || req?.session?.user?.role || null,
  });
  return res.status(200).json({ success: true, data: { deleted: true } });
}
export default { listarRecursosApi, createRecurso, getRecurso, updateRecurso, deleteRecurso };
`,
      };
    }

    return nextLoad(url, context);
  },
});

function resetRuntimeState() {
  globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__ = [];
  globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = false;
}

async function requestWithSession({ pathname, sessionUser, method = 'GET', body } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = sessionUser ? { user: { ...sessionUser } } : {};
    next();
  });

  globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_USE_CONTROLLER_MOCK__ = true;
  const routeModule = await import(`../src/modules/gestor/app/routes/recursoApi.js?get-id-query-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

test('GET /gestor/api/recursos/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-get',
      email: 'admin.sem.contexto.recursos.get@example.com',
      role: 'admin',
      nome: 'Admin sem contexto Recursos GET',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''), '507f191e810c19729de860ea');
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''), '507f191e810c19729de860ea');
});

test('GET /gestor/api/recursos/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-get-sem-unidade',
      email: 'admin.sem.unidade.recursos.get@example.com',
      role: 'admin',
      nome: 'Admin sem unidade Recursos GET',
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});

test('PUT /gestor/api/recursos/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-put',
      email: 'admin.sem.contexto.recursos.put@example.com',
      role: 'admin',
      nome: 'Admin sem contexto Recursos PUT',
    },
    method: 'PUT',
    body: {
      tipo: 'carro',
      placa: 'ABC-1D34',
      chassi: '9BWZZZ377VT004251',
      renavam: '12345678901',
      ano: '2024',
      mod: '2025',
      marca: 'Fiat',
      modelo: 'Argo',
      cor: 'Branco',
      ativo: true,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.method, 'PUT');
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''), '507f191e810c19729de860ea');
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''), '507f191e810c19729de860ea');
});

test('PUT /gestor/api/recursos/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-put-sem-unidade',
      email: 'admin.sem.unidade.recursos.put@example.com',
      role: 'admin',
      nome: 'Admin sem unidade Recursos PUT',
    },
    method: 'PUT',
    body: {
      tipo: 'carro',
      placa: 'ABC-1D34',
      chassi: '9BWZZZ377VT004251',
      renavam: '12345678901',
      ano: '2024',
      mod: '2025',
      marca: 'Fiat',
      modelo: 'Argo',
      cor: 'Branco',
      ativo: true,
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});

test('DELETE /gestor/api/recursos/:id com admin sem contexto ativo e unidade_id na query passa no requireUnitScope e retorna 200', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011?unidade_id=507f191e810c19729de860ea',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-delete',
      email: 'admin.sem.contexto.recursos.delete@example.com',
      role: 'admin',
      nome: 'Admin sem contexto Recursos DELETE',
    },
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.success, true);
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 1);
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.method, 'DELETE');
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.unitScope?.unidadeId || ''), '507f191e810c19729de860ea');
  assert.equal(String(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__[0]?.query?.unidade_id || ''), '507f191e810c19729de860ea');
});

test('DELETE /gestor/api/recursos/:id com admin sem contexto ativo e sem unidade_id continua retornando UNIDADE_ID_REQUIRED', async () => {
  const response = await requestWithSession({
    pathname: '/gestor/api/recursos/507f1f77bcf86cd799439011',
    sessionUser: {
      id: 'session-admin-sem-contexto-recursos-delete-sem-unidade',
      email: 'admin.sem.unidade.recursos.delete@example.com',
      role: 'admin',
      nome: 'Admin sem unidade Recursos DELETE',
    },
    method: 'DELETE',
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.error, 'UNIDADE_ID_REQUIRED');
  assert.equal(globalThis.__GESTOR_RECURSOS_GET_BY_ID_QUERY_ROUTE_CALLS__.length, 0);
});