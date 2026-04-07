import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import { buildGestorApp } from '../src/modules/gestor/app/gestor-app.js';
import { executeToggleAccessCore } from '../src/modules/gestor/app/usecases/unidades/executeToggleAccessCore.js';

const app = buildGestorApp();

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

function loadToggleAccessHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export async function getUnidadeById(req, res) {',
  )
    .replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadesPrincipaisByIds: async () => [],
    updateManyUnidadesAccessByIds: async () => ({ modifiedCount: 0 }),
    findAllUnidadesLean: async () => [],
    buildApiBancariaForResponse: (value) => value,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
    ...overrides,
  };

  const factory = new Function(
    'findUnidadeByIdLean',
    'findUnidadeUserBaseLean',
    'findUnidadesByCondLeanFull',
    'findUnidadesPrincipaisByIds',
    'updateManyUnidadesAccessByIds',
    'findAllUnidadesLean',
    'buildApiBancariaForResponse',
    'executeToggleAccessCore',
    'ok',
    'badRequest',
    'serverError',
    'console',
    `${snippet}\nreturn { toggleAccessUnidades };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadesPrincipaisByIds,
      deps.updateManyUnidadesAccessByIds,
      deps.findAllUnidadesLean,
      deps.buildApiBancariaForResponse,
      executeToggleAccessCore,
      deps.ok,
      deps.badRequest,
      deps.serverError,
      deps.console,
    ),
    deps,
  };
}

test('POST /gestor/api/unidades/toggle-access sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .post('/gestor/api/unidades/toggle-access')
    .send({ unitIds: ['u-1'], activate: true });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('toggleAccessUnidades trata alvo inválido como parâmetros inválidos após normalização do payload', async () => {
  const { toggleAccessUnidades } = loadToggleAccessHarness();
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['   ', '', null], activate: true },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Parâmetros inválidos.',
  });
});

test('toggleAccessUnidades conclui unidade inexistente como nenhuma unidade atualizada no owner atual', async () => {
  let updateArgs = null;
  const { toggleAccessUnidades } = loadToggleAccessHarness({
    updateManyUnidadesAccessByIds: async (unitIds, activate) => {
      updateArgs = { unitIds, activate };
      return { modifiedCount: 0 };
    },
  });
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['u-ausente'], activate: false },
    user: { role: 'admin' },
  }, res);

  assert.deepEqual(updateArgs, { unitIds: ['u-ausente'], activate: false });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Nenhuma unidade atualizada.',
  });
});

test('toggleAccessUnidades responde 400 fora do escopo contextual quando algum alvo não pertence ao cluster acessível', async () => {
  const { toggleAccessUnidades } = loadToggleAccessHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['u-filial', 'u-fora'], activate: true },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso à unidade não autorizado.',
  });
});

test('toggleAccessUnidades responde 400 quando o payload está ausente ou inválido', async () => {
  const { toggleAccessUnidades } = loadToggleAccessHarness();
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { activate: 'true' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Parâmetros inválidos.',
  });
});

test('toggleAccessUnidades responde 200 no caminho feliz com envelope contendo apenas newStatus', async () => {
  let updateArgs = null;
  const { toggleAccessUnidades } = loadToggleAccessHarness({
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-matriz') return { _id: 'u-matriz' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-matriz', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-matriz' }, { _id: 'u-filial' }]),
    updateManyUnidadesAccessByIds: async (unitIds, activate) => {
      updateArgs = { unitIds, activate };
      return { acknowledged: true, matchedCount: 2, modifiedCount: 2 };
    },
  });
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['u-filial', 'u-matriz'], activate: true },
    unitScope: { unidadeId: 'u-matriz' },
    user: { role: 'admin' },
  }, res);

  assert.deepEqual(updateArgs, { unitIds: ['u-filial', 'u-matriz'], activate: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: { newStatus: true },
  });
});

test('toggleAccessUnidades deduplica e filtra unitIds antes de mutar, efeito observável do owner atual', async () => {
  let updateArgs = null;
  const { toggleAccessUnidades } = loadToggleAccessHarness({
    updateManyUnidadesAccessByIds: async (unitIds, activate) => {
      updateArgs = { unitIds, activate };
      return { modifiedCount: 1 };
    },
  });
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['u-1', ' u-1 ', '', 'u-2', 'u-2'], activate: false },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.deepEqual(updateArgs, { unitIds: ['u-1', 'u-2'], activate: false });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: { newStatus: false },
  });
});

test('toggleAccessUnidades devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { toggleAccessUnidades } = loadToggleAccessHarness({
    updateManyUnidadesAccessByIds: async () => {
      throw new Error('forced-toggle-access-failure');
    },
  });
  const res = createApiRes();

  await toggleAccessUnidades({
    body: { unitIds: ['u-1'], activate: true },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-toggle-access-failure',
  });
});