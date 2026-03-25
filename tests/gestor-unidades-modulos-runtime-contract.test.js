import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import app from '../src/modules/gestor/app/gestor-app.js';

const ROOT = process.cwd();
const CONTROLLER_PATH = path.join(ROOT, 'src/modules/gestor/app/controllers/unidadeApiController.js');

function createApiRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Não foi possível extrair trecho entre ${startMarker} e ${endMarker}`);
  }
  return source.slice(start, end);
}

function loadUnidadeModulosHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export async function getUnidadeProvisioningStatus(req, res) {',
  ).replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadeByIdWithModulosAcessiveis: async () => null,
    findAllUnidadesLean: async () => [],
    buildApiBancariaForResponse: (value) => value,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
    ...overrides,
  };

  const factory = new Function(
    'findUnidadeByIdLean',
    'findUnidadeUserBaseLean',
    'findUnidadesByCondLeanFull',
    'findUnidadeByIdWithModulosAcessiveis',
    'findAllUnidadesLean',
    'buildApiBancariaForResponse',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'console',
    `${snippet}\nreturn { getUnidadeModulos, ensureCanAccessUnidade };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadeByIdWithModulosAcessiveis,
      deps.findAllUnidadesLean,
      deps.buildApiBancariaForResponse,
      deps.ok,
      deps.badRequest,
      deps.notFound,
      deps.serverError,
      deps.console,
    ),
    deps,
  };
}

test('GET /gestor/api/unidades/:id/modulos sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .get('/gestor/api/unidades/64b000000000000000000001/modulos');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadeModulos trata id inválido no runtime atual como unidade não encontrada quando o lookup não resolve alvo', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdWithModulosAcessiveis: async (id) => {
      assert.equal(id, 'id-invalido');
      return null;
    },
  });
  const res = createApiRes();

  await getUnidadeModulos({ params: { id: 'id-invalido' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('getUnidadeModulos responde 404 quando a unidade não existe', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdWithModulosAcessiveis: async () => null,
  });
  const res = createApiRes();

  await getUnidadeModulos({ params: { id: 'u-ausente' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade não encontrada',
  });
});

test('getUnidadeModulos responde 400 fora do escopo contextual', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await getUnidadeModulos({
    params: { id: 'u-fora' },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado',
  });
});

test('getUnidadeModulos responde 200 com shape exato observado quando há módulos', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-matriz') return { _id: 'u-matriz' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-matriz', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-matriz' }, { _id: 'u-filial' }]),
    findUnidadeByIdWithModulosAcessiveis: async () => ({
      _id: 'u-filial',
      modulosAcessiveis: [
        { _id: 'm-1', nome: 'Ponto', status: 'active', extra: 'não deve vazar' },
        { _id: 'm-2', nome: 'Escalas', status: false, outro: 123 },
      ],
    }),
  });
  const res = createApiRes();

  await getUnidadeModulos({
    params: { id: 'u-filial' },
    unitScope: { unidadeId: 'u-matriz' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [
      { _id: 'm-1', nome: 'Ponto', status: 'active' },
      { _id: 'm-2', nome: 'Escalas', status: false },
    ],
  });
});

test('getUnidadeModulos responde 200 com array vazio quando a unidade não tem módulos', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdWithModulosAcessiveis: async () => ({ _id: 'u-sem-modulos', modulosAcessiveis: [] }),
  });
  const res = createApiRes();

  await getUnidadeModulos({ params: { id: 'u-sem-modulos' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [],
  });
});

test('getUnidadeModulos cai para array vazio quando modulosAcessiveis não existe', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdWithModulosAcessiveis: async () => ({ _id: 'u-sem-campo' }),
  });
  const res = createApiRes();

  await getUnidadeModulos({ params: { id: 'u-sem-campo' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: [],
  });
});

test('getUnidadeModulos devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { getUnidadeModulos } = loadUnidadeModulosHarness({
    findUnidadeByIdWithModulosAcessiveis: async () => {
      throw new Error('forced-get-modulos-failure');
    },
  });
  const res = createApiRes();

  await getUnidadeModulos({ params: { id: 'u-erro' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-get-modulos-failure',
  });
});