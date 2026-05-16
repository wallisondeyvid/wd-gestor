import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processUpdateFeedbackRespostaCore.js');
const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackRespostaApiController.js');

const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';

// Guardrail semantico: este core e uma seam minima de patch.
// Ele nao e precedente para write global nem para mutacao sem contexto.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildProcessUpdateFeedbackRespostaCore() {
  const normalizedSource = CORE_SOURCE.replace(
    'export async function processUpdateFeedbackRespostaCore(',
    'async function processUpdateFeedbackRespostaCore(',
  );

  const context = {
    console,
    __loadedFunction: null,
  };

  const script = new vm.Script(`${normalizedSource}\nglobalThis.__loadedFunction = processUpdateFeedbackRespostaCore;`);
  script.runInNewContext(context);
  return context.__loadedFunction;
}

function buildUpdateFeedbackRespostaHandlerFactory(dependencies = {}) {
  const normalizedSource = CONTROLLER_SOURCE
    .replace("import { processUpdateFeedbackRespostaCore } from './utils/processUpdateFeedbackRespostaCore.js';\r\n", '')
    .replace("import { processUpdateFeedbackRespostaCore } from './utils/processUpdateFeedbackRespostaCore.js';\n", '')
    .replace('export function createUpdateFeedbackRespostaHandler(', 'function createUpdateFeedbackRespostaHandler(');

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFactory: null,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${normalizedSource}\nglobalThis.__loadedFactory = createUpdateFeedbackRespostaHandler;`);
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
  const { body: bodyOverrides = {}, params: paramsOverrides = {}, user: userOverrides = {}, ...restOverrides } = overrides;

  return {
    body: {
      resposta: 'Resposta contratual',
      ...bodyOverrides,
    },
    params: {
      feedbackId: FEEDBACK_ID,
      ...paramsOverrides,
    },
    unitScope: {
      unidadeId: ' unit-77 ',
    },
    user: {
      _id: '507f191e810c19729de860ea',
      email: 'feedback.resposta@test.local',
      nome: 'Resposta Admin',
      role: 'admin',
      isMaster: false,
      ...userOverrides,
    },
    get() {
      return '';
    },
    ...restOverrides,
  };
}

function updatedFeedbackDoc(overrides = {}) {
  return {
    _id: FEEDBACK_ID,
    resposta: 'Resposta contratual',
    status: 'respondido',
    toObject() {
      const { toObject, ...plain } = this;
      return JSON.parse(JSON.stringify(plain));
    },
    ...overrides,
  };
}

test('feedback resposta tenant-aware: owner delega ao core e o core permanece sem I/O proprio', () => {
  assert.match(CONTROLLER_SOURCE, /feedbackPolicy\.ensureAdminAccess\(/);
  assert.match(CONTROLLER_SOURCE, /scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),/);
  assert.match(CONTROLLER_SOURCE, /const fb = await processUpdateFeedbackRespostaCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /findFeedbackByIdAndUpdateSetNewLean: \(feedbackId, setData\) =>\s*findFeedbackByIdAndUpdateSetNewLean\(feedbackId, setData, access\.feedbackMutationOptions\),/);
  assert.match(CORE_SOURCE, /const set = \{ resposta \};/);
  assert.match(CORE_SOURCE, /if \(resposta\) set\.status = 'respondido';/);
  assert.match(CORE_SOURCE, /return findFeedbackByIdAndUpdateSetNewLean\(id, set\);/);

  const accessIndex = CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureAdminAccess({');
  const coreIndex = CONTROLLER_SOURCE.indexOf('const fb = await processUpdateFeedbackRespostaCore({');
  const responseIndex = CONTROLLER_SOURCE.indexOf('return apiOk(res, fb);');

  assert.ok(accessIndex >= 0 && coreIndex >= 0 && responseIndex >= 0, 'Owner deve preservar o handoff curto atual.');
  assert.ok(accessIndex < coreIndex && coreIndex < responseIndex, 'Owner deve aplicar gate antes da seam e responder publicamente apenas depois dela.');
  assert.doesNotMatch(CORE_SOURCE, /req\.|res\.|apiOk|apiFail|mongoose|mongodb|resolveModel|resolveConnection|fs\.|readFile|writeFile|rmSync|unlink|findOne|findById|updateOne|deleteOne|insertOne/i);
});

test('feedback resposta tenant-aware: core monta patch minimo com status respondido quando ha resposta', async () => {
  const processUpdateFeedbackRespostaCore = buildProcessUpdateFeedbackRespostaCore();
  const calls = [];
  const persistedDoc = updatedFeedbackDoc();

  const result = await processUpdateFeedbackRespostaCore({
    id: FEEDBACK_ID,
    resposta: 'Resposta contratual',
    findFeedbackByIdAndUpdateSetNewLean: async (id, set) => {
      calls.push({ id, set: toPlainJson(set) });
      return persistedDoc;
    },
  });

  assert.equal(result, persistedDoc);
  assert.deepEqual(calls, [
    {
      id: FEEDBACK_ID,
      set: {
        resposta: 'Resposta contratual',
        status: 'respondido',
      },
    },
  ]);
});

test('feedback resposta tenant-aware: core preserva contrato atual sem status quando resposta e vazia', async () => {
  const processUpdateFeedbackRespostaCore = buildProcessUpdateFeedbackRespostaCore();
  const calls = [];

  await processUpdateFeedbackRespostaCore({
    id: FEEDBACK_ID,
    resposta: '',
    findFeedbackByIdAndUpdateSetNewLean: async (id, set) => {
      calls.push({ id, set: toPlainJson(set) });
      return updatedFeedbackDoc({ resposta: '', status: 'novo' });
    },
  });

  assert.deepEqual(calls, [
    {
      id: FEEDBACK_ID,
      set: {
        resposta: '',
      },
    },
  ]);
});

test('feedback resposta tenant-aware: owner injeta wrapper com access.feedbackMutationOptions e o contexto material nao e decorativo', async () => {
  const events = [];
  const accessCalls = [];
  const seamCalls = [];
  const updateCalls = [];

  const createUpdateFeedbackRespostaHandler = buildUpdateFeedbackRespostaHandlerFactory({
    processUpdateFeedbackRespostaCore: async (input) => {
      events.push('core');
      seamCalls.push({
        id: input.id,
        resposta: input.resposta,
        hasInjectedUpdate: typeof input.findFeedbackByIdAndUpdateSetNewLean === 'function',
      });
      return input.findFeedbackByIdAndUpdateSetNewLean(input.id, {
        resposta: input.resposta,
        status: 'respondido',
      });
    },
    console: {
      error(...args) {
        events.push(['console.error', ...args]);
      },
      log() {},
      warn() {},
    },
  });

  const handler = createUpdateFeedbackRespostaHandler({
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
    findFeedbackByIdAndUpdateSetNewLean: async (id, setData, mutationOptions) => {
      events.push('update');
      updateCalls.push({
        id,
        setData: toPlainJson(setData),
        mutationOptions: toPlainJson(mutationOptions),
      });
      return updatedFeedbackDoc({
        resposta: setData.resposta,
        status: setData.status,
      });
    },
  });

  const result = await handler(buildReq(), makeRes());

  assert.deepEqual(accessCalls, [
    {
      currentUser: {
        _id: '507f191e810c19729de860ea',
        email: 'feedback.resposta@test.local',
        nome: 'Resposta Admin',
        role: 'admin',
        isMaster: false,
      },
      scopedUnitId: 'unit-77',
    },
  ]);
  assert.deepEqual(seamCalls, [
    {
      id: FEEDBACK_ID,
      resposta: 'Resposta contratual',
      hasInjectedUpdate: true,
    },
  ]);
  assert.deepEqual(updateCalls, [
    {
      id: FEEDBACK_ID,
      setData: {
        resposta: 'Resposta contratual',
        status: 'respondido',
      },
      mutationOptions: {
        scopedUnitId: 'unit-77',
        tenantId: 'tenant-77',
        actorRole: 'admin',
      },
    },
  ]);
  assert.deepEqual(events, ['core', 'update', 'apiOk']);
  assert.deepEqual(result, {
    data: {
      _id: FEEDBACK_ID,
      resposta: 'Resposta contratual',
      status: 'respondido',
    },
  });
});