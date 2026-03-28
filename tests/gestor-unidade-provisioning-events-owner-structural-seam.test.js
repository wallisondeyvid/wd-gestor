import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/unidadeApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function extractExportedAsyncFunction(source, functionName) {
  const signature = `export async function ${functionName}`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName}`);

  const paramsEnd = source.indexOf(')', start);
  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = source.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair ${functionName}`);
}

function buildFunction(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildProvisioningEventsFunctionWithOwnerSeam(context = {}) {
  const functionSource = extractExportedAsyncFunction(CONTROLLER_SOURCE, 'getUnidadeProvisioningEvents');
  const startMarker = "const queriedEvents = await listUnitProvisioningAuditEvents({";
  const endMarker = "const hasMore = queriedEvents.length > limit;";
  const startIndex = functionSource.indexOf(startMarker);
  const endIndex = functionSource.indexOf(endMarker);

  assert.ok(startIndex >= 0, 'Nao encontrou a chamada de leitura local atual do owner de eventos');
  assert.ok(endIndex > startIndex, 'Nao encontrou o ponto de paginação do owner de eventos');

  const replacement = [
    "const queriedEvents = await getUnidadeProvisioningEventsOwnerService({",
    "  unidadeId: unidade._id,",
    "  scope,",
    "  moduleKey,",
    "  operation,",
    "  status,",
    "  before,",
    "  limit: queryLimit,",
    "});",
    "",
  ].join('\n    ');

  const transformed = functionSource.slice(0, startIndex) + replacement + functionSource.slice(endIndex);

  return buildFunction(transformed, context);
}

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

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('getUnidadeProvisioningEvents preserva normalizacao, paginacao e envelope ao delegar apenas a leitura semantica ao owner futuro', async () => {
  const calls = [];

  const getUnidadeProvisioningEventsOwnerService = async (input) => {
    calls.push(input);
    return [
      { eventId: 'evt-1', createdAt: '2026-03-24T10:03:00.000Z', status: 'success' },
      { eventId: 'evt-2', createdAt: '2026-03-24T10:02:00.000Z', status: 'error' },
      { eventId: 'evt-3', createdAt: '2026-03-24T10:01:00.000Z', status: 'info' },
    ];
  };

  const getUnidadeProvisioningEvents = buildProvisioningEventsFunctionWithOwnerSeam({
    getUnidadeProvisioningEventsOwnerService,
    ensureCanAccessUnidade: async () => true,
    findUnidadeById: async (unidadeId) => ({ _id: unidadeId }),
    normalizeProvisioningEventsLimit: (value) => {
      assert.equal(value, ' 2 ');
      return 2;
    },
    normalizeProvisioningEventsScope: (value) => {
      assert.equal(value, ' module ');
      return 'module';
    },
    normalizeProvisioningEventsModuleKey: (value) => {
      assert.equal(value, ' ponto ');
      return 'ponto';
    },
    normalizeProvisioningEventsOperation: (value) => {
      assert.equal(value, ' Sync ');
      return 'sync';
    },
    normalizeProvisioningEventsStatus: (value) => {
      assert.equal(value, ' SUCCESS ');
      return 'success';
    },
    normalizeProvisioningEventsBefore: (value) => {
      assert.equal(value, '2026-03-24T09:59:00.000Z|ABCDEFABCDEFABCDEFABCDEF');
      return '2026-03-24T09:59:00.000Z|abcdefabcdefabcdefabcdef';
    },
    buildProvisioningEventsNextBefore: (events) => `cursor:${events[1].eventId}`,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
  });

  const req = {
    params: { id: '  u-filial  ' },
    query: {
      limit: ' 2 ',
      scope: ' module ',
      moduleKey: ' ponto ',
      operation: ' Sync ',
      status: ' SUCCESS ',
      before: '2026-03-24T09:59:00.000Z|ABCDEFABCDEFABCDEFABCDEF',
    },
  };
  const res = createApiRes();

  await getUnidadeProvisioningEvents(req, res);

  assert.equal(calls.length, 1, 'o owner deve delegar apenas uma vez ao service owner futuro');
  assert.deepEqual(Object.keys(calls[0]).sort(), [
    'before',
    'limit',
    'moduleKey',
    'operation',
    'scope',
    'status',
    'unidadeId',
  ]);
  assert.equal(calls[0].unidadeId, 'u-filial');
  assert.equal(calls[0].limit, 3, 'o owner deve continuar dono da paginação limit+1');
  assert.equal(calls[0].scope, 'module');
  assert.equal(calls[0].moduleKey, 'ponto');
  assert.equal(calls[0].operation, 'sync');
  assert.equal(calls[0].status, 'success');
  assert.equal(calls[0].before, '2026-03-24T09:59:00.000Z|abcdefabcdefabcdefabcdef');

  assert.equal(res.statusCode, 200);
  assert.deepEqual(toPlainJson(res.body), {
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
        nextBefore: 'cursor:evt-2',
      },
      total: 2,
      events: [
        { eventId: 'evt-1', createdAt: '2026-03-24T10:03:00.000Z', status: 'success' },
        { eventId: 'evt-2', createdAt: '2026-03-24T10:02:00.000Z', status: 'error' },
      ],
    },
  });
});

test('getUnidadeProvisioningEvents continua dono do HTTP quando a leitura futura falha', async () => {
  const getUnidadeProvisioningEventsOwnerService = async () => {
    throw new Error('forced-events-owner-failure');
  };

  const getUnidadeProvisioningEvents = buildProvisioningEventsFunctionWithOwnerSeam({
    getUnidadeProvisioningEventsOwnerService,
    ensureCanAccessUnidade: async () => true,
    findUnidadeById: async (unidadeId) => ({ _id: unidadeId }),
    normalizeProvisioningEventsLimit: () => 50,
    normalizeProvisioningEventsScope: () => null,
    normalizeProvisioningEventsModuleKey: () => null,
    normalizeProvisioningEventsOperation: () => null,
    normalizeProvisioningEventsStatus: () => null,
    normalizeProvisioningEventsBefore: () => null,
    buildProvisioningEventsNextBefore: () => null,
    ok: (res, data = {}, extra = {}) => res.status(200).json({ success: true, ...extra, data }),
    badRequest: (res, message = 'Bad request', extra = {}) => res.status(400).json({ success: false, code: 'BAD_REQUEST', message, ...extra }),
    notFound: (res, message = 'Not found', extra = {}) => res.status(404).json({ success: false, code: 'NOT_FOUND', message, ...extra }),
    serverError: (res, error, extra = {}) => res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error?.message || 'Erro interno', ...extra }),
    console,
  });

  const res = createApiRes();
  await getUnidadeProvisioningEvents({ params: { id: 'u-fora' }, query: {} }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(toPlainJson(res.body), {
    success: false,
    code: 'SERVER_ERROR',
    message: 'forced-events-owner-failure',
  });
});