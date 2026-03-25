import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/recursoApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-recursos-list-api-db-bridge';

const DB_BRIDGE_EXPORTS = [
  'findUnidadeUserBaseLean',
  'findUnidadesByCondLean',
  'findRecursosByFiltroComUnidadeLean',
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
        'const getMocks = () => globalThis.__GESTOR_RECURSOS_LIST_DB_MOCKS__ || {};',
      ];

      for (const exportName of DB_BRIDGE_EXPORTS) {
        lines.push(`export async function ${exportName}(...args) { const fn = getMocks()['${exportName}']; if (typeof fn === 'function') return await fn(...args); return await actual['${exportName}'](...args); }`);
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
  globalThis.__GESTOR_RECURSOS_LIST_DB_MOCKS__ = { ...overrides };
}

function clearDbMocks() {
  globalThis.__GESTOR_RECURSOS_LIST_DB_MOCKS__ = {};
}

function createReq(overrides = {}) {
  return {
    app: { locals: {}, ...(overrides.app || {}) },
    user: overrides.user || null,
    unitScope: overrides.unitScope || null,
    session: overrides.session,
    params: overrides.params || {},
    query: overrides.query || {},
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

async function importListarRecursosApi(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function requestGestorApp(pathname) {
  const { default: gestorApp } = await import(`${gestorAppModuleUrl}?case=app-${Date.now()}`);
  const rootApp = express();
  rootApp.use('/gestor', gestorApp);

  const server = await new Promise((resolve) => {
    const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: 'application/json' },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body, text };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test.afterEach(() => {
  clearDbMocks();
});

test('GET /gestor/api/recursos sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/recursos');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('listarRecursosApi sem contexto canonico para usuario nao privilegiado responde 404', async () => {
  setDbMocks({});

  const { listarRecursosApi } = await importListarRecursosApi('missing-context');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    query: {},
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('listarRecursosApi para admin sem filtros retorna envelope com data e shape compativel com Gestor e Escalas', async () => {
  const filtros = [];
  setDbMocks({
    findRecursosByFiltroComUnidadeLean: async (filtro) => {
      filtros.push(JSON.parse(JSON.stringify(filtro)));
      return [
        {
          _id: 'r-1',
          placa: 'ABC-1234',
          tipo: 'carro',
          marca: 'Fiat',
          modelo: 'Argo',
          ano: 2024,
          mod: 2025,
          cor: 'Branco',
          ativo: true,
          unidade_id: { _id: 'u-1', codigo: 'M001', nome: 'Matriz Centro' },
        },
      ];
    },
  });

  const { listarRecursosApi } = await importListarRecursosApi('admin-success');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    query: {},
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.deepEqual(filtros, [{}]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      {
        id: 'r-1',
        _id: 'r-1',
        placa: 'ABC-1234',
        tipo: 'carro',
        marca: 'Fiat',
        modelo: 'Argo',
        ano: 2024,
        mod: 2025,
        cor: 'Branco',
        ativo: true,
        unidade_id: { _id: 'u-1', codigo: 'M001', nome: 'Matriz Centro' },
        descricao: 'Fiat Argo',
        unidadeFormatada: 'M001 - Matriz Centro',
      },
    ],
  });
});

test('listarRecursosApi aplica filtro parcial de placa com normalizacao case-insensitive', async () => {
  setDbMocks({
    findRecursosByFiltroComUnidadeLean: async () => ([
      {
        _id: 'r-hit',
        placa: 'ABC-1D34',
        tipo: 'carro',
        marca: 'VW',
        modelo: 'Gol',
        ano: 2020,
        mod: 2021,
        cor: 'Prata',
        ativo: true,
        unidade_id: { _id: 'u-1', codigo: 'M001', nome: 'Matriz Centro' },
      },
      {
        _id: 'r-miss',
        placa: 'XYZ-9999',
        tipo: 'moto',
        marca: 'Honda',
        modelo: 'CG',
        ano: 2019,
        mod: 2019,
        cor: 'Preta',
        ativo: true,
        unidade_id: { _id: 'u-2', codigo: 'F001', nome: 'Filial Sul' },
      },
    ]),
  });

  const { listarRecursosApi } = await importListarRecursosApi('plate-filter');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    query: { placa: 'aBc1d' },
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map((item) => item._id), ['r-hit']);
});

test('listarRecursosApi restringe usuario contextual ao cluster acessivel e retorna vazio para unidade fora do escopo', async () => {
  const conds = [];
  const filtros = [];
  setDbMocks({
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLean: async (cond) => {
      conds.push(JSON.parse(JSON.stringify(cond)));
      return [
        { _id: 'u-principal' },
        { _id: 'u-filial-1' },
      ];
    },
    findRecursosByFiltroComUnidadeLean: async (filtro) => {
      filtros.push(JSON.parse(JSON.stringify(filtro)));
      return [];
    },
  });

  const { listarRecursosApi } = await importListarRecursosApi('out-of-scope-unit-filter');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal' },
    query: { unidadeId: 'u-outra' },
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.deepEqual(conds, [{ $or: [{ _id: 'u-principal' }, { unidade_principal_id: 'u-principal' }, { matriz_id: 'u-principal' }] }]);
  assert.deepEqual(filtros, []);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, data: [] });
});

test('listarRecursosApi restringe usuario contextual ao cluster acessivel e aplica unidadeId dentro do escopo', async () => {
  const filtros = [];
  setDbMocks({
    findUnidadeUserBaseLean: async () => ({ _id: 'u-filial-1', is_principal: false, unidade_principal_id: 'u-principal' }),
    findUnidadesByCondLean: async () => ([
      { _id: 'u-principal' },
      { _id: 'u-filial-1' },
    ]),
    findRecursosByFiltroComUnidadeLean: async (filtro) => {
      filtros.push(JSON.parse(JSON.stringify(filtro)));
      return [
        {
          _id: 'r-2',
          placa: 'FIL-1234',
          tipo: 'van',
          marca: 'Ford',
          modelo: 'Transit',
          ano: 2022,
          mod: 2023,
          cor: 'Azul',
          ativo: false,
          unidade_id: { _id: 'u-filial-1', codigo: 'F001', nome: 'Filial Sul' },
        },
      ];
    },
  });

  const { listarRecursosApi } = await importListarRecursosApi('in-scope-unit-filter');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-filial-1' },
    query: { unidadeId: 'u-filial-1' },
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.deepEqual(filtros, [{ unidade_id: 'u-filial-1' }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, [
    {
      id: 'r-2',
      _id: 'r-2',
      placa: 'FIL-1234',
      tipo: 'van',
      marca: 'Ford',
      modelo: 'Transit',
      ano: 2022,
      mod: 2023,
      cor: 'Azul',
      ativo: false,
      unidade_id: { _id: 'u-filial-1', codigo: 'F001', nome: 'Filial Sul' },
      descricao: 'Ford Transit',
      unidadeFormatada: 'F001 - Filial Sul',
    },
  ]);
});

test('listarRecursosApi retorna 500 com mensagem original quando ocorre erro interno', async () => {
  setDbMocks({
    findRecursosByFiltroComUnidadeLean: async () => {
      throw new Error('forced-recursos-list-failure');
    },
  });

  const { listarRecursosApi } = await importListarRecursosApi('forced-error');
  const req = createReq({
    user: { role: 'admin', isMaster: true },
    query: {},
  });
  const res = createResCapture();

  await listarRecursosApi(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-recursos-list-failure',
  });
});