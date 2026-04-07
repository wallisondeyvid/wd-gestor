import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
import express from 'express';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/unidadeApiController.js')).href;
const gestorAppModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/gestor-app.js')).href;
const actualDbBridgeModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/apiDbBridgeService.js')).href;
const dbBridgeMockModuleUrl = 'mock:gestor-unidades-delete-api-db-bridge';

const DB_BRIDGE_EXPORTS = [
  'findAllUnidadesLean',
  'findUnidadeUserBaseLean',
  'findUnidadesByCondLeanFull',
  'findUltimaUnidadePorCodigo',
  'findUnidadeByCodigo',
  'findUnidadeByCpf',
  'findUnidadeByCnpj',
  'findUnidadeById',
  'findSubunidadesByUnidadePrincipal',
  'createUnidadeDoc',
  'saveUnidadeDoc',
  'updateUserUnidadeById',
  'findUnidadeByCpfExcludingId',
  'findUnidadeByCnpjExcludingId',
  'updateUnidadeByIdWithValidators',
  'findUnidadesPrincipaisByIds',
  'updateManyUnidadesAccessByIds',
  'findUnidadesPermitidasByMatrizRef',
  'findDiretorAtivoByUnidadeSelectId',
  'findUnidadeByIdWithModulosAcessiveis',
  'findUnidadeByIdLean',
  'deleteUnidadeById',
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
        'const getMocks = () => globalThis.__GESTOR_UNIDADES_DELETE_DB_MOCKS__ || {};',
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
  globalThis.__GESTOR_UNIDADES_DELETE_DB_MOCKS__ = { ...overrides };
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
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
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

async function importDeleteUnidade(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function requestGestorApp(pathname) {
  const { default: buildGestorApp } = await import(`${gestorAppModuleUrl}?case=app-${Date.now()}`);
  const gestorApp = buildGestorApp();
  const rootApp = express();
  rootApp.use('/gestor', gestorApp);

  const server = await new Promise((resolve) => {
    const instance = rootApp.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'DELETE',
      redirect: 'manual',
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

test('DELETE /gestor/api/unidades/:id sem sessao no app real responde 401 JSON', async () => {
  const response = await requestGestorApp('/gestor/api/unidades/qualquer-id');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('deleteUnidade com id vazio cai no lookup real e responde 404', async () => {
  let receivedId = null;
  setDbMocks({
    findUnidadeById: async (id) => {
      receivedId = id;
      return null;
    },
  });

  const { deleteUnidade } = await importDeleteUnidade('empty-id');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: '' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(receivedId, '');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('deleteUnidade responde 404 quando a unidade nao existe', async () => {
  setDbMocks({
    findUnidadeById: async () => null,
  });

  const { deleteUnidade } = await importDeleteUnidade('missing-unit');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-inexistente' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('deleteUnidade responde 400 quando a unidade esta fora do escopo contextual', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, is_principal: false }),
    findUnidadeByIdLean: async (id) => ({ _id: id, nome: 'Scope atual' }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([
      { _id: 'u-principal' },
      { _id: 'u-filial-permitida' },
    ]),
  });

  const { deleteUnidade } = await importDeleteUnidade('out-of-scope');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal' },
    params: { id: 'u-bloqueada' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('deleteUnidade retorna sucesso com unidade encontrada e envelope exato', async () => {
  let deletedId = null;
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, is_principal: false }),
    deleteUnidadeById: async (id) => {
      deletedId = id;
    },
  });

  const { deleteUnidade } = await importDeleteUnidade('success');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-ok' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(deletedId, 'u-ok');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      deleted: true,
      id: 'u-ok',
    },
  });
});

test('deleteUnidade aplica regra especifica para diretor em unidade principal', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, is_principal: true }),
    findUnidadeByIdLean: async (id) => ({ _id: id }),
    findUnidadeUserBaseLean: async () => ({ _id: 'u-principal', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-principal', is_principal: true }]),
  });

  const { deleteUnidade } = await importDeleteUnidade('principal-diretor');
  const req = createReq({
    user: { role: 'diretor', isMaster: false },
    unitScope: { unidadeId: 'u-principal' },
    params: { id: 'u-principal' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Diretores não podem excluir unidades principais.',
  });
});

test('deleteUnidade aplica regra especifica de master para unidade principal', async () => {
  setDbMocks({
    findUnidadeById: async (id) => ({ _id: id, is_principal: true }),
  });

  const { deleteUnidade } = await importDeleteUnidade('principal-admin');
  const req = createReq({
    user: { role: 'admin', isMaster: false },
    params: { id: 'u-principal' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Apenas Master pode excluir unidades principais',
  });
});

test('deleteUnidade trata erro interno induzido com 500 e mensagem original', async () => {
  setDbMocks({
    findUnidadeById: async () => {
      throw new Error('forced-delete-failure');
    },
  });

  const { deleteUnidade } = await importDeleteUnidade('forced-error');
  const req = createReq({
    user: { role: 'admin', isMaster: true },
    params: { id: 'u-error' },
  });
  const res = createResCapture();

  await deleteUnidade(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-delete-failure',
  });
});