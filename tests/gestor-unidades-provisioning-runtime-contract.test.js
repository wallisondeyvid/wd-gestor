import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import { buildGestorApp } from '../src/modules/gestor/app/gestor-app.js';

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

function loadProvisioningHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export async function getUnidadeProvisioningEvents(req, res) {',
  ).replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadeById: async () => null,
    inspectUnitProvisioning: async () => null,
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
    'findUnidadeById',
    'inspectUnitProvisioning',
    'findAllUnidadesLean',
    'buildApiBancariaForResponse',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'console',
    `${snippet}\nreturn { getUnidadeProvisioningStatus, normalizeProvisioningSnapshotResponse };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadeById,
      deps.inspectUnitProvisioning,
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

test('GET /gestor/api/unidades/:id/provisioning sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .get('/gestor/api/unidades/64b000000000000000000001/provisioning');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadeProvisioningStatus responde 400 quando o id é vazio no owner atual', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness();
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: '' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'ID da unidade e obrigatorio.',
  });
});

test('getUnidadeProvisioningStatus responde 404 quando a unidade não existe', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async (id) => {
      assert.equal(id, 'u-ausente');
      return null;
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: 'u-ausente' }, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade nao encontrada',
  });
});

test('getUnidadeProvisioningStatus responde 400 fora do escopo contextual', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async () => ({ _id: 'u-fora' }),
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({
    params: { id: 'u-fora' },
    unitScope: { unidadeId: 'u-escopo' },
    user: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'Acesso a unidade nao autorizado',
  });
});

test('getUnidadeProvisioningStatus responde 200 com provisioning presente e shape normalizado observado', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async () => ({ _id: 'u-filial' }),
    inspectUnitProvisioning: async ({ unidadeId }) => {
      assert.equal(unidadeId, 'u-filial');
      return {
        status: 'ready',
        lastRunAt: '2026-03-24T10:00:00.000Z',
        modulosHabilitados: [' ponto ', '', null, 'escalas'],
        modulosHabilitadosDisplay: [' Ponto ', '', 'Escalas'],
        extra: { ok: true },
      };
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: 'u-filial' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      status: 'ready',
      lastRunAt: '2026-03-24T10:00:00.000Z',
      modulosHabilitados: ['ponto', 'escalas'],
      modulosHabilitadosDisplay: ['Ponto', 'Escalas'],
      extra: { ok: true },
    },
  });
});

test('getUnidadeProvisioningStatus responde 200 com fallback observável quando provisioning está ausente', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async () => ({ _id: 'u-sem-provisioning' }),
    inspectUnitProvisioning: async () => null,
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: 'u-sem-provisioning' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      modulosHabilitados: [],
      modulosHabilitadosDisplay: [],
    },
  });
});

test('getUnidadeProvisioningStatus responde 200 com arrays vazios quando provisioning é objeto vazio', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async () => ({ _id: 'u-vazio' }),
    inspectUnitProvisioning: async () => ({}),
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: 'u-vazio' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      modulosHabilitados: [],
      modulosHabilitadosDisplay: [],
    },
  });
});

test('getUnidadeProvisioningStatus devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { getUnidadeProvisioningStatus } = loadProvisioningHarness({
    findUnidadeById: async () => ({ _id: 'u-erro' }),
    inspectUnitProvisioning: async () => {
      throw new Error('forced-get-provisioning-failure');
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningStatus({ params: { id: 'u-erro' }, user: { role: 'admin', isMaster: true } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-get-provisioning-failure',
  });
});