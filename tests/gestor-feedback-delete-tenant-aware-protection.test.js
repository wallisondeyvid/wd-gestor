import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDeleteApiController.js');
const CLEANUP_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processFeedbackDeleteCleanupCore.js');

const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const CLEANUP_SOURCE = fs.readFileSync(CLEANUP_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

// Guardrail semantico: este owner e o ponto curto do delete contextual.
// Ele nao e precedente para delete global nem para escopo material decorativo.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDeleteFeedbackHandlerFactory(dependencies = {}) {
  const normalizedSource = CONTROLLER_SOURCE
    .replace("import { processFeedbackDeleteCleanupCore } from './utils/processFeedbackDeleteCleanupCore.js';\r\n", '')
    .replace("import { processFeedbackDeleteCleanupCore } from './utils/processFeedbackDeleteCleanupCore.js';\n", '')
    .replace('export function createDeleteFeedbackHandler(', 'function createDeleteFeedbackHandler(');

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFactory: null,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${normalizedSource}\nglobalThis.__loadedFactory = createDeleteFeedbackHandler;`);
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

function deletedFeedback(overrides = {}) {
  return {
    _id: FEEDBACK_ID,
    anexos: [
      { url: 'https://blob.example/feedback/1.png' },
      { url: '/gestor/uploads/feedback/local.png' },
    ],
    ...overrides,
  };
}

test('delete feedback tenant-aware: owner preserva handoff curto e cleanup permanece pos-delete', () => {
  assert.match(CONTROLLER_SOURCE, /feedbackPolicy\.ensureAdminAccess\(/);
  assert.match(CONTROLLER_SOURCE, /scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),/);
  assert.match(CONTROLLER_SOURCE, /const fb = await findFeedbackByIdAndDeleteLean\(id, access\.feedbackMutationOptions\);/);
  assert.match(CONTROLLER_SOURCE, /await processFeedbackDeleteCleanupCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /return apiOk\(res, \{ id, deleted: true \}\);/);

  const accessIndex = CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureAdminAccess({');
  const deleteIndex = CONTROLLER_SOURCE.indexOf('const fb = await findFeedbackByIdAndDeleteLean(id, access.feedbackMutationOptions);');
  const cleanupIndex = CONTROLLER_SOURCE.indexOf('await processFeedbackDeleteCleanupCore({');
  const responseIndex = CONTROLLER_SOURCE.indexOf('return apiOk(res, { id, deleted: true });');

  assert.ok(accessIndex >= 0 && deleteIndex >= 0 && cleanupIndex >= 0 && responseIndex >= 0, 'Owner deve preservar o handoff curto atual do delete contextual.');
  assert.ok(accessIndex < deleteIndex && deleteIndex < cleanupIndex && cleanupIndex < responseIndex, 'Owner deve aplicar policy antes do delete, cleanup depois do delete e resposta publica ao final.');
  assert.doesNotMatch(CLEANUP_SOURCE, /scopedUnitId|feedbackMutationOptions|ensureAdminAccess|findFeedbackByIdAndDeleteLean|req\.|res\./);
});

test('delete feedback tenant-aware: owner repassa access.feedbackMutationOptions materialmente ao delete final', async () => {
  const events = [];
  const accessCalls = [];
  const deleteCalls = [];
  const cleanupCalls = [];

  const createDeleteFeedbackHandler = buildDeleteFeedbackHandlerFactory({
    processFeedbackDeleteCleanupCore: async (input) => {
      events.push('cleanup');
      cleanupCalls.push({
        id: input.id,
        fb: toPlainJson(input.fb),
        keys: Object.keys(input).sort(),
        hasScopedUnitId: Object.prototype.hasOwnProperty.call(input, 'scopedUnitId'),
        hasMutationOptions: Object.prototype.hasOwnProperty.call(input, 'feedbackMutationOptions'),
      });
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createDeleteFeedbackHandler({
    apiOk: (_res, data) => {
      events.push('apiOk');
      return { data: toPlainJson(data) };
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message }; 
    },
    feedbackPolicy: {
      ensureAdminAccess: ({ currentUser, scopedUnitId }) => {
        accessCalls.push(toPlainJson({ currentUser, scopedUnitId }));
        return {
          allowed: true,
          feedbackMutationOptions: {
            scopedUnitId,
            tenantId: 'tenant-77',
            actorRole: currentUser?.role || '',
          },
        };
      },
    },
    findFeedbackByIdAndDeleteLean: async (id, mutationOptions) => {
      events.push('delete');
      deleteCalls.push({ id, mutationOptions: toPlainJson(mutationOptions) });
      return deletedFeedback();
    },
    getBlobToken: () => 'blob-token',
    delBlob: async () => {},
    fsModule: { existsSync() { return false; }, rmSync() {} },
    pathModule: path,
    cwdProvider: () => process.cwd(),
    logWarn() {},
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
  assert.deepEqual(deleteCalls, [
    {
      id: FEEDBACK_ID,
      mutationOptions: {
        scopedUnitId: 'unit-77',
        tenantId: 'tenant-77',
        actorRole: 'admin',
      },
    },
  ]);
  assert.deepEqual(cleanupCalls, [
    {
      id: FEEDBACK_ID,
      fb: deletedFeedback(),
      keys: ['cwdProvider', 'delBlob', 'fb', 'fsModule', 'getBlobToken', 'id', 'logWarn', 'pathModule'],
      hasScopedUnitId: false,
      hasMutationOptions: false,
    },
  ]);
  assert.deepEqual(events, ['delete', 'cleanup', 'apiOk']);
  assert.deepEqual(result, {
    data: {
      id: FEEDBACK_ID,
      deleted: true,
    },
  });
});

test('delete feedback tenant-aware: not found nao executa cleanup indevidamente', async () => {
  const deleteCalls = [];
  const cleanupCalls = [];

  const createDeleteFeedbackHandler = buildDeleteFeedbackHandlerFactory({
    processFeedbackDeleteCleanupCore: async (input) => {
      cleanupCalls.push(input);
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createDeleteFeedbackHandler({
    apiOk: (_res, data) => ({ data: toPlainJson(data) }),
    apiFail: (_res, status, message) => ({ status, message }),
    feedbackPolicy: {
      ensureAdminAccess: ({ scopedUnitId }) => ({
        allowed: true,
        feedbackMutationOptions: { scopedUnitId },
      }),
    },
    findFeedbackByIdAndDeleteLean: async (id, mutationOptions) => {
      deleteCalls.push({ id, mutationOptions: toPlainJson(mutationOptions) });
      return null;
    },
    getBlobToken: () => 'blob-token',
    delBlob: async () => {},
    fsModule: { existsSync() { return false; }, rmSync() {} },
    pathModule: path,
    cwdProvider: () => process.cwd(),
    logWarn() {},
    logError() {},
  });

  const result = await handler(buildReq(), makeRes());

  assert.deepEqual(deleteCalls, [
    {
      id: FEEDBACK_ID,
      mutationOptions: {
        scopedUnitId: 'unit-77',
      },
    },
  ]);
  assert.equal(cleanupCalls.length, 0);
  assert.deepEqual(result, {
    status: 404,
    message: 'Feedback não encontrado.',
  });
});

test('delete feedback tenant-aware: id invalido bloqueia delete e cleanup no contrato atual', async () => {
  const deleteCalls = [];
  const cleanupCalls = [];
  const accessCalls = [];

  const createDeleteFeedbackHandler = buildDeleteFeedbackHandlerFactory({
    processFeedbackDeleteCleanupCore: async (input) => {
      cleanupCalls.push(input);
    },
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createDeleteFeedbackHandler({
    apiOk: (_res, data) => ({ data: toPlainJson(data) }),
    apiFail: (_res, status, message) => ({ status, message }),
    feedbackPolicy: {
      ensureAdminAccess: ({ currentUser, scopedUnitId }) => {
        accessCalls.push(toPlainJson({ currentUser, scopedUnitId }));
        return {
          allowed: true,
          feedbackMutationOptions: { scopedUnitId },
        };
      },
    },
    findFeedbackByIdAndDeleteLean: async (...args) => {
      deleteCalls.push(args);
      return deletedFeedback();
    },
    getBlobToken: () => 'blob-token',
    delBlob: async () => {},
    fsModule: { existsSync() { return false; }, rmSync() {} },
    pathModule: path,
    cwdProvider: () => process.cwd(),
    logWarn() {},
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
  assert.equal(deleteCalls.length, 0);
  assert.equal(cleanupCalls.length, 0);
  assert.deepEqual(result, {
    status: 400,
    message: 'ID inválido.',
  });
});