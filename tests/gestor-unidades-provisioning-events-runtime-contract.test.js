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

function loadProvisioningEventsHarness(overrides = {}) {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const snippet = extractBetween(
    source,
    'function normalizeUnitId(value) {',
    'export async function retryUnidadeProvisioning(req, res) {',
  ).replace(/^export\s+/gm, '');

  const deps = {
    findUnidadeByIdLean: async () => null,
    findUnidadeUserBaseLean: async () => null,
    findUnidadesByCondLeanFull: async () => [],
    findUnidadeById: async () => null,
    listUnitProvisioningAuditEvents: async () => [],
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
    'listUnitProvisioningAuditEvents',
    'inspectUnitProvisioning',
    'findAllUnidadesLean',
    'buildApiBancariaForResponse',
    'ok',
    'badRequest',
    'notFound',
    'serverError',
    'console',
    `${snippet}\nreturn { getUnidadeProvisioningEvents, ensureCanAccessUnidade };`,
  );

  return {
    ...factory(
      deps.findUnidadeByIdLean,
      deps.findUnidadeUserBaseLean,
      deps.findUnidadesByCondLeanFull,
      deps.findUnidadeById,
      deps.listUnitProvisioningAuditEvents,
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

test('GET /gestor/api/unidades/:id/provisioning/events sem sessão responde 401 JSON no app real', async () => {
  const response = await request(app)
    .get('/gestor/api/unidades/64b000000000000000000001/provisioning/events');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    success: false,
    error: 'Não autenticado',
    code: 'UNAUTHORIZED',
  });
});

test('getUnidadeProvisioningEvents responde 400 quando o id é vazio no owner atual', async () => {
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness();
  const res = createApiRes();

  await getUnidadeProvisioningEvents({ params: { id: '' }, query: {}, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    code: 'BAD_REQUEST',
    message: 'ID da unidade e obrigatorio.',
  });
});

test('getUnidadeProvisioningEvents responde 404 quando a unidade não existe', async () => {
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async (id) => {
      assert.equal(id, 'u-ausente');
      return null;
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({ params: { id: 'u-ausente' }, query: {}, user: { role: 'admin' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    code: 'NOT_FOUND',
    message: 'Unidade nao encontrada',
  });
});

test('getUnidadeProvisioningEvents responde 400 fora do escopo contextual', async () => {
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async () => ({ _id: 'u-fora' }),
    findUnidadeByIdLean: async (id) => {
      if (id === 'u-escopo') return { _id: 'u-escopo' };
      throw new Error(`lookup inesperado: ${id}`);
    },
    findUnidadeUserBaseLean: async () => ({ _id: 'u-escopo', is_principal: true }),
    findUnidadesByCondLeanFull: async () => ([{ _id: 'u-escopo' }, { _id: 'u-filial' }]),
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({
    params: { id: 'u-fora' },
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

test('getUnidadeProvisioningEvents responde 200 com eventos presentes e shape exato observado', async () => {
  let servicePayload = null;
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async () => ({ _id: 'u-filial' }),
    listUnitProvisioningAuditEvents: async (payload) => {
      servicePayload = payload;
      return [
        {
          eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          createdAt: '2026-03-24T10:03:00.000Z',
          scope: 'module',
          moduleKey: 'ponto',
          operation: 'sync',
          status: 'success',
        },
        {
          eventId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          createdAt: '2026-03-24T10:02:00.000Z',
          scope: 'module',
          moduleKey: 'escalas',
          operation: 'sync',
          status: 'error',
        },
        {
          eventId: 'cccccccccccccccccccccccc',
          createdAt: '2026-03-24T10:01:00.000Z',
          scope: 'unit',
          moduleKey: null,
          operation: 'bootstrap',
          status: 'info',
        },
      ];
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({
    params: { id: 'u-filial' },
    query: {
      limit: '2',
      scope: ' module ',
      moduleKey: ' ponto ',
      operation: ' Sync ',
      status: ' SUCCESS ',
      before: '2026-03-24T09:59:00.000Z|ABCDEFABCDEFABCDEFABCDEF',
    },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.deepEqual(servicePayload, {
    unidadeId: 'u-filial',
    limit: 3,
    scope: 'module',
    moduleKey: 'ponto',
    operation: 'sync',
    status: 'success',
    before: '2026-03-24T09:59:00.000Z|abcdefabcdefabcdefabcdef',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidadeId: 'u-filial',
      filters: {
        limit: 2,
        scope: 'module',
        moduleKey: 'ponto',
        operation: 'sync',
        status: 'success',
        before: '2026-03-24T09:59:00.000Z|abcdefabcdefabcdefabcdef',
      },
      pagination: {
        hasMore: true,
        nextBefore: '2026-03-24T10:02:00.000Z|bbbbbbbbbbbbbbbbbbbbbbbb',
      },
      total: 2,
      events: [
        {
          eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          createdAt: '2026-03-24T10:03:00.000Z',
          scope: 'module',
          moduleKey: 'ponto',
          operation: 'sync',
          status: 'success',
        },
        {
          eventId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          createdAt: '2026-03-24T10:02:00.000Z',
          scope: 'module',
          moduleKey: 'escalas',
          operation: 'sync',
          status: 'error',
        },
      ],
    },
  });
});

test('getUnidadeProvisioningEvents responde 200 com fallback observável quando não há eventos', async () => {
  let servicePayload = null;
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async () => ({ _id: 'u-sem-eventos' }),
    listUnitProvisioningAuditEvents: async (payload) => {
      servicePayload = payload;
      return [];
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({
    params: { id: 'u-sem-eventos' },
    query: {},
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.deepEqual(servicePayload, {
    unidadeId: 'u-sem-eventos',
    limit: 101,
    scope: null,
    moduleKey: null,
    operation: null,
    status: null,
    before: null,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidadeId: 'u-sem-eventos',
      filters: {
        limit: 100,
        scope: null,
        moduleKey: null,
        operation: null,
        status: null,
        before: null,
      },
      pagination: {
        hasMore: false,
        nextBefore: null,
      },
      total: 0,
      events: [],
    },
  });
});

test('getUnidadeProvisioningEvents mantém o shape exato com paginação sem nextBefore quando há eventos abaixo do limite', async () => {
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async () => ({ _id: 'u-shape' }),
    listUnitProvisioningAuditEvents: async () => ([
      {
        eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        createdAt: '2026-03-24T10:03:00.000Z',
        scope: 'unit',
        moduleKey: null,
        operation: 'bootstrap',
        status: 'info',
      },
    ]),
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({
    params: { id: 'u-shape' },
    query: { limit: '5' },
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      unidadeId: 'u-shape',
      filters: {
        limit: 5,
        scope: null,
        moduleKey: null,
        operation: null,
        status: null,
        before: null,
      },
      pagination: {
        hasMore: false,
        nextBefore: null,
      },
      total: 1,
      events: [
        {
          eventId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          createdAt: '2026-03-24T10:03:00.000Z',
          scope: 'unit',
          moduleKey: null,
          operation: 'bootstrap',
          status: 'info',
        },
      ],
    },
  });
});

test('getUnidadeProvisioningEvents devolve 500 com a mensagem original quando ocorre erro interno induzido', async () => {
  const { getUnidadeProvisioningEvents } = loadProvisioningEventsHarness({
    findUnidadeById: async () => ({ _id: 'u-erro' }),
    listUnitProvisioningAuditEvents: async () => {
      throw new Error('forced-get-provisioning-events-failure');
    },
  });
  const res = createApiRes();

  await getUnidadeProvisioningEvents({
    params: { id: 'u-erro' },
    query: {},
    user: { role: 'admin', isMaster: true },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-get-provisioning-events-failure',
  });
});