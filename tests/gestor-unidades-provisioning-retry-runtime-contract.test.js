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

function loadProvisioningRetryHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export async function getUnidadePublic(req, res) {',
  ).replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadeById: async () => null,
    retryUnitProvisioning: async () => ({ retried: true }),
    isUnitProvisioningValidationError: () => false,
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
    'retryUnitProvisioning',
    'isUnitProvisioningValidationError',
    'findAllUnidadesLean',
    'buildApiBancariaForResponse',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'console',
    `${snippet}\nreturn { retryUnidadeProvisioning };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadeById,
      deps.retryUnitProvisioning,
      deps.isUnitProvisioningValidationError,
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

test('POST /gestor/api/unidades/:id/provisioning/retry sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .post('/gestor/api/unidades/64b000000000000000000001/provisioning/retry')
    .send({});

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('retryUnidadeProvisioning responde 400 quando o id é vazio no owner atual', async () => {
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness();
  const res = createApiRes();

  await retryUnidadeProvisioning({ params: { id: '' }, body: {}, query: {}, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'ID da unidade e obrigatorio.',
  });
});

test('retryUnidadeProvisioning responde 404 quando a unidade não existe', async () => {
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async (id) => {
      assert.equal(id, 'u-ausente');
      return null;
    },
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({ params: { id: 'u-ausente' }, body: {}, query: {}, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade nao encontrada',
  });
});

test('retryUnidadeProvisioning responde 400 fora do escopo contextual', async () => {
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async () => ({ _id: 'u-fora', subunidade: false, modulosAcessiveis: [] }),
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({
    params: { id: 'u-fora' },
    body: {},
    query: {},
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

test('retryUnidadeProvisioning responde 200 no caminho feliz com payload mínimo observado do serviço', async () => {
  let retryPayload = null;
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async () => ({
      _id: 'u-filial',
      is_principal: false,
      subunidade: false,
      modulosAcessiveis: ['ponto', 'escalas'],
    }),
    retryUnitProvisioning: async (payload) => {
      retryPayload = payload;
      return { retried: true, accepted: true };
    },
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({
    params: { id: 'u-filial' },
    body: {
      modulo: ' ponto , escalas ',
      modulosRetryKeys: ['escalas', 'ponto', ''],
    },
    query: {
      moduleKey: 'financeiro',
      modulosRetry: 'escalas,ponto',
    },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.deepEqual(retryPayload, {
    unidadeId: 'u-filial',
    tipo: 'filial',
    modulosHabilitados: ['ponto', 'escalas'],
    modulosRetry: ['ponto', 'escalas', 'financeiro'],
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      retried: true,
      accepted: true,
    },
  });
});

test('retryUnidadeProvisioning preserva fallback observável para modulosHabilitados e modulosRetry vazios', async () => {
  let retryPayload = null;
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async () => ({
      _id: 'u-sem-modulos',
      is_principal: false,
      subunidade: true,
    }),
    retryUnitProvisioning: async (payload) => {
      retryPayload = payload;
      return { retried: true };
    },
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({
    params: { id: 'u-sem-modulos' },
    body: {},
    query: {},
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.deepEqual(retryPayload, {
    unidadeId: 'u-sem-modulos',
    tipo: 'subunidade',
    modulosHabilitados: [],
    modulosRetry: [],
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      retried: true,
    },
  });
});

test('retryUnidadeProvisioning mantém o shape exato do payload observado quando o serviço devolve payload mínimo', async () => {
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async () => ({
      _id: 'u-shape',
      is_principal: true,
      modulosAcessiveis: [],
    }),
    retryUnitProvisioning: async () => ({ accepted: true }),
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({
    params: { id: 'u-shape' },
    body: {},
    query: {},
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      accepted: true,
    },
  });
});

test('retryUnidadeProvisioning devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { retryUnidadeProvisioning } = loadProvisioningRetryHarness({
    findUnidadeById: async () => ({ _id: 'u-erro', is_principal: true, modulosAcessiveis: ['ponto'] }),
    retryUnitProvisioning: async () => {
      throw new Error('forced-provisioning-retry-failure');
    },
  });
  const res = createApiRes();

  await retryUnidadeProvisioning({
    params: { id: 'u-erro' },
    body: {},
    query: {},
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-provisioning-retry-failure',
  });
});