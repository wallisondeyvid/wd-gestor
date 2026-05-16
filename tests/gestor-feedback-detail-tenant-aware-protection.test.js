import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDetailApiController.js');
const CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processAdminFeedbackDetailCore.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

// Guardrail semantico: este owner e a fronteira curta da leitura admin contextual.
// Ele nao e precedente para leitura global silenciosa nem para contexto material decorativo.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDetailFeedbackHandlerFactory(dependencies = {}) {
  const normalizedSource = CONTROLLER_SOURCE
    .replace("import { processAdminFeedbackDetailCore } from './utils/processAdminFeedbackDetailCore.js';\r\n", '')
    .replace("import { processAdminFeedbackDetailCore } from './utils/processAdminFeedbackDetailCore.js';\n", '')
    .replace('export function createAdminFeedbackDetailHandler(', 'function createAdminFeedbackDetailHandler(');

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFactory: null,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${normalizedSource}\nglobalThis.__loadedFactory = createAdminFeedbackDetailHandler;`);
  script.runInNewContext(context);
  return context.__loadedFactory;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
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

function buildReq(overrides = {}) {
  return {
    params: {
      feedbackId: FEEDBACK_ID,
      ...(overrides.params || {}),
    },
    body: {},
    query: {},
    user: {
      _id: '507f191e810c19729de860ea',
      role: 'admin',
      isMaster: false,
      ...(overrides.user || {}),
    },
    unitScope: {
      unidadeId: ' unit-77 ',
      ...(overrides.unitScope || {}),
    },
    ...overrides,
  };
}

function feedbackFixture(overrides = {}) {
  return {
    _id: FEEDBACK_ID,
    mensagem: 'Feedback admin detail',
    resposta: { texto: 'resposta legado objeto' },
    status: 'novo',
    criadoPor: {
      userId: '507f191e810c19729de860ea',
      email: 'admin.detail@test.local',
      nome: 'Admin Detail',
      role: 'user',
    },
    ...overrides,
  };
}

test('feedback detail tenant-aware: owner preserva handoff curto e core permanece pos-read', () => {
  assert.match(CONTROLLER_SOURCE, /feedbackPolicy\.ensureAdminAccess\(/);
  assert.match(CONTROLLER_SOURCE, /scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),/);
  assert.match(CONTROLLER_SOURCE, /const fb = await findFeedbackByIdLean\(id, access\.feedbackQueryOptions\);/);
  assert.match(CONTROLLER_SOURCE, /const detailResult = await processAdminFeedbackDetailCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /return apiOk\(res, detailResult\?\.feedback \|\| fb\);/);

  const policyIndex = CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureAdminAccess({');
  const readIndex = CONTROLLER_SOURCE.indexOf('const fb = await findFeedbackByIdLean(id, access.feedbackQueryOptions);');
  const coreIndex = CONTROLLER_SOURCE.indexOf('const detailResult = await processAdminFeedbackDetailCore({');
  const responseIndex = CONTROLLER_SOURCE.indexOf('return apiOk(res, detailResult?.feedback || fb);');

  assert.ok(policyIndex >= 0 && readIndex >= 0 && coreIndex >= 0 && responseIndex >= 0, 'Owner deve preservar o handoff curto atual do detalhe admin contextual.');
  assert.ok(policyIndex < readIndex && readIndex < coreIndex && coreIndex < responseIndex, 'Owner deve aplicar policy antes do read, core apenas depois do read e resposta publica ao final.');
  assert.doesNotMatch(CORE_SOURCE, /scopedUnitId|unitScope|feedbackQueryOptions|ensureAdminAccess|findFeedbackByIdLean|req\.|res\./);
});

test('feedback detail tenant-aware: owner repassa access.feedbackQueryOptions materialmente ao read final', async () => {
  const events = [];
  const accessCalls = [];
  const readCalls = [];
  const coreCalls = [];

  const createAdminFeedbackDetailHandler = buildDetailFeedbackHandlerFactory({
    processAdminFeedbackDetailCore: async (input) => {
      events.push('core');
      coreCalls.push({
        keys: Object.keys(input).sort(),
        feedback: toPlainJson(input.feedback),
        hasScopedUnitId: Object.prototype.hasOwnProperty.call(input, 'scopedUnitId'),
        hasUnitScope: Object.prototype.hasOwnProperty.call(input, 'unitScope'),
        hasFeedbackQueryOptions: Object.prototype.hasOwnProperty.call(input, 'feedbackQueryOptions'),
      });
      return {
        feedback: {
          ...input.feedback,
          resposta: 'resposta legado objeto',
        },
      };
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createAdminFeedbackDetailHandler({
    apiOk: (_res, data) => {
      events.push('apiOk');
      return { data: toPlainJson(data) };
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    sanitizeFeedback: (feedback) => feedback,
    feedbackPolicy: {
      ensureAdminAccess: ({ currentUser, scopedUnitId }) => {
        events.push('policy');
        accessCalls.push(toPlainJson({ currentUser, scopedUnitId }));
        return {
          allowed: true,
          feedbackQueryOptions: {
            scopedUnitId,
            tenantId: 'tenant-77',
            preferScopedRepoRead: true,
          },
        };
      },
    },
    findFeedbackByIdLean: async (id, queryOptions) => {
      events.push('read');
      readCalls.push({ id, queryOptions: toPlainJson(queryOptions) });
      return feedbackFixture();
    },
    logError() {},
  });

  const result = await handler(buildReq(), makeRes());

  assert.deepEqual(accessCalls, [
    {
      currentUser: {
        _id: '507f191e810c19729de860ea',
        role: 'admin',
        isMaster: false,
      },
      scopedUnitId: 'unit-77',
    },
  ]);
  assert.deepEqual(readCalls, [
    {
      id: FEEDBACK_ID,
      queryOptions: {
        scopedUnitId: 'unit-77',
        tenantId: 'tenant-77',
        preferScopedRepoRead: true,
      },
    },
  ]);
  assert.deepEqual(coreCalls, [
    {
      keys: ['feedback'],
      feedback: feedbackFixture(),
      hasScopedUnitId: false,
      hasUnitScope: false,
      hasFeedbackQueryOptions: false,
    },
  ]);
  assert.deepEqual(events, ['policy', 'read', 'core', 'apiOk']);
  assert.deepEqual(result, {
    data: {
      ...feedbackFixture(),
      resposta: 'resposta legado objeto',
    },
  });
});

test('feedback detail tenant-aware: not found nao executa pos-processamento indevido', async () => {
  const events = [];
  const readCalls = [];
  const coreCalls = [];

  const createAdminFeedbackDetailHandler = buildDetailFeedbackHandlerFactory({
    processAdminFeedbackDetailCore: async (input) => {
      coreCalls.push(input);
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createAdminFeedbackDetailHandler({
    apiOk: (_res, data) => ({ data: toPlainJson(data) }),
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    sanitizeFeedback: (feedback) => feedback,
    feedbackPolicy: {
      ensureAdminAccess: ({ scopedUnitId }) => ({
        allowed: true,
        feedbackQueryOptions: { scopedUnitId, allowLegacyUnscoped: true },
      }),
    },
    findFeedbackByIdLean: async (id, queryOptions) => {
      events.push('read');
      readCalls.push({ id, queryOptions: toPlainJson(queryOptions) });
      return null;
    },
    logError() {},
  });

  const result = await handler(buildReq(), makeRes());

  assert.deepEqual(readCalls, [
    {
      id: FEEDBACK_ID,
      queryOptions: {
        scopedUnitId: 'unit-77',
        allowLegacyUnscoped: true,
      },
    },
  ]);
  assert.equal(coreCalls.length, 0);
  assert.deepEqual(events, ['read', ['apiFail', 404, 'Feedback não encontrado.']]);
  assert.deepEqual(result, {
    status: 404,
    message: 'Feedback não encontrado.',
  });
});

test('feedback detail tenant-aware: id invalido nao executa read nem pos-processamento', async () => {
  const accessCalls = [];
  const readCalls = [];
  const coreCalls = [];

  const createAdminFeedbackDetailHandler = buildDetailFeedbackHandlerFactory({
    processAdminFeedbackDetailCore: async (input) => {
      coreCalls.push(input);
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createAdminFeedbackDetailHandler({
    apiOk: (_res, data) => ({ data: toPlainJson(data) }),
    apiFail: (_res, status, message) => ({ status, message }),
    sanitizeFeedback: (feedback) => feedback,
    feedbackPolicy: {
      ensureAdminAccess: ({ currentUser, scopedUnitId }) => {
        accessCalls.push(toPlainJson({ currentUser, scopedUnitId }));
        return {
          allowed: true,
          feedbackQueryOptions: { scopedUnitId },
        };
      },
    },
    findFeedbackByIdLean: async (id, queryOptions) => {
      readCalls.push({ id, queryOptions: toPlainJson(queryOptions) });
      return feedbackFixture();
    },
    logError() {},
  });

  const result = await handler(buildReq({ params: { feedbackId: 'id-malformado' } }), makeRes());

  assert.deepEqual(accessCalls, [
    {
      currentUser: {
        _id: '507f191e810c19729de860ea',
        role: 'admin',
        isMaster: false,
      },
      scopedUnitId: 'unit-77',
    },
  ]);
  assert.equal(readCalls.length, 0);
  assert.equal(coreCalls.length, 0);
  assert.deepEqual(result, {
    status: 400,
    message: 'ID inválido.',
  });
});