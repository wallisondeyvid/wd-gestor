import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processCreateFeedbackCore.js');
const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackCreateApiController.js');

const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

// Guardrail semantico: este core e uma seam minima de montagem de payload
// e repasse de contexto. Ele nao e precedente para write global.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildProcessCreateFeedbackCore() {
  const normalizedSource = CORE_SOURCE.replace(
    'export async function processCreateFeedbackCore(',
    'async function processCreateFeedbackCore(',
  );

  const context = {
    console,
    __loadedFunction: null,
  };

  const script = new vm.Script(`${normalizedSource}\nglobalThis.__loadedFunction = processCreateFeedbackCore;`);
  script.runInNewContext(context);
  return context.__loadedFunction;
}

function buildCreateFeedbackHandlerFactory(dependencies = {}) {
  const normalizedSource = CONTROLLER_SOURCE
    .replace("import { processCreateFeedbackCore } from './utils/processCreateFeedbackCore.js';\r\n", '')
    .replace("import { processCreateFeedbackCore } from './utils/processCreateFeedbackCore.js';\n", '')
    .replace('export function createCreateFeedbackHandler(', 'function createCreateFeedbackHandler(');

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFactory: null,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${normalizedSource}\nglobalThis.__loadedFactory = createCreateFeedbackHandler;`);
  script.runInNewContext(context);
  return context.__loadedFactory;
}

function createFeedbackDoc(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    tipo: 'elogio',
    status: 'novo',
    mensagem: 'Mensagem de contrato',
    criadoPor: {
      userId: '507f191e810c19729de860ea',
      email: 'create.feedback@test.local',
      nome: 'Create Feedback',
      role: 'user',
    },
    origem: {
      modulo: 'modulo_explicito',
      path: 'https://app.local/feedback/criar',
      userAgent: 'ctx-agent',
      timezone: 'America/Sao_Paulo',
    },
    toObject() {
      const { toObject, ...plain } = this;
      return JSON.parse(JSON.stringify(plain));
    },
    ...overrides,
  };
}

test('create feedback tenant-aware: owner delega ao core antes da resposta e o core permanece sem I/O proprio', () => {
  assert.match(CONTROLLER_SOURCE, /const fb = await processCreateFeedbackCore\(\{/);
  assert.match(CONTROLLER_SOURCE, /scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),/);
  assert.match(CORE_SOURCE, /return createFeedback\(\{[\s\S]*status: 'novo',[\s\S]*criadoPor:[\s\S]*origem:[\s\S]*\}, \{\s*scopedUnitId,\s*\}\);/);

  const delegationIndex = CONTROLLER_SOURCE.indexOf('const fb = await processCreateFeedbackCore({');
  const responseIndex = CONTROLLER_SOURCE.indexOf('return apiOk(res, fb.toObject(), { id: fb._id, created: true });');

  assert.ok(delegationIndex >= 0 && responseIndex >= 0 && delegationIndex < responseIndex, 'Owner deve delegar ao core antes da resposta publica final.');
  assert.doesNotMatch(CORE_SOURCE, /req\.|res\.|apiOk|apiFail|mongoose|mongodb|resolveModel|resolveConnection|fs\.|readFile|writeFile|rmSync|find[A-Z]|update[A-Z]|delete[A-Z]|insert[A-Z]/i);
  assert.doesNotMatch(CORE_SOURCE, /files|anexos/);
});

test('create feedback tenant-aware: core repassa scopedUnitId materialmente e preserva payload atual', async () => {
  const processCreateFeedbackCore = buildProcessCreateFeedbackCore();
  const calls = [];
  const persistedDoc = createFeedbackDoc();

  const result = await processCreateFeedbackCore({
    mensagem: 'Mensagem de contrato',
    tipo: 'elogio',
    rawModulo: 'modulo_explicito',
    contexto: {
      url: 'https://app.local/feedback/criar',
      timezone: 'America/Sao_Paulo',
      user_agent: 'ctx-agent',
    },
    bodyUrl: 'https://body.local/ignorado',
    bodyTimezone: 'UTC',
    bodyUserAgent: 'body-agent',
    referer: 'https://referer.local/ignorado',
    headerUserAgent: 'header-agent',
    scopedUnitId: 'unit-42',
    user: {
      _id: '507f191e810c19729de860ea',
      email: 'create.feedback@test.local',
      nome: 'Create Feedback',
      role: 'user',
    },
    inferModuloFromUrl: () => 'modulo_fallback',
    createFeedback: async (payload, options) => {
      calls.push({ payload: toPlainJson(payload), options: toPlainJson(options) });
      return persistedDoc;
    },
  });

  assert.equal(result, persistedDoc);
  assert.deepEqual(calls, [
    {
      payload: {
        tipo: 'elogio',
        status: 'novo',
        mensagem: 'Mensagem de contrato',
        criadoPor: {
          userId: '507f191e810c19729de860ea',
          email: 'create.feedback@test.local',
          nome: 'Create Feedback',
          role: 'user',
        },
        origem: {
          modulo: 'modulo_explicito',
          path: 'https://app.local/feedback/criar',
          userAgent: 'ctx-agent',
          timezone: 'America/Sao_Paulo',
        },
      },
      options: {
        scopedUnitId: 'unit-42',
      },
    },
  ]);
  assert.ok(!('files' in calls[0].payload), 'Core nao deve inventar files no payload atual.');
  assert.ok(!('anexos' in calls[0].payload), 'Core nao deve inventar anexos no payload atual.');
});

test('create feedback tenant-aware: cenario sem scopedUnitId permanece explicito no contrato atual', async () => {
  const processCreateFeedbackCore = buildProcessCreateFeedbackCore();
  const calls = [];

  await processCreateFeedbackCore({
    mensagem: 'Mensagem sem unidade',
    tipo: 'erro',
    rawModulo: '',
    contexto: null,
    bodyUrl: 'https://app.local/modulo-body/rota',
    bodyTimezone: 'America/Fortaleza',
    bodyUserAgent: 'body-agent',
    referer: 'https://app.local/modulo-ref/rota',
    headerUserAgent: 'header-agent',
    scopedUnitId: '',
    user: {
      id: 'user-2',
      email: 'fallback@test.local',
      nome: 'Fallback User',
      role: 'user',
    },
    inferModuloFromUrl: (value) => {
      if (value.includes('/modulo-body/')) return 'modulo_body';
      if (value.includes('/modulo-ref/')) return 'modulo_ref';
      return '';
    },
    createFeedback: async (payload, options) => {
      calls.push({ payload: toPlainJson(payload), options: toPlainJson(options) });
      return createFeedbackDoc({ ...payload });
    },
  });

  assert.deepEqual(calls, [
    {
      payload: {
        tipo: 'erro',
        status: 'novo',
        mensagem: 'Mensagem sem unidade',
        criadoPor: {
          userId: 'user-2',
          email: 'fallback@test.local',
          nome: 'Fallback User',
          role: 'user',
        },
        origem: {
          modulo: 'modulo_body',
          path: 'https://app.local/modulo-body/rota',
          userAgent: 'body-agent',
          timezone: 'America/Fortaleza',
        },
      },
      options: {
        scopedUnitId: '',
      },
    },
  ]);
});

test('create feedback tenant-aware: handoff minimo do owner preserva seam antes do write sensivel', async () => {
  const events = [];
  const seamCalls = [];
  const createCreateFeedbackHandler = buildCreateFeedbackHandlerFactory({
    processCreateFeedbackCore: async (input) => {
      events.push('core');
      seamCalls.push(toPlainJson(input));
      return createFeedbackDoc({ mensagem: input.mensagem, tipo: input.tipo });
    },
    console: {
      error(...args) {
        events.push(['console.error', ...args]);
      },
      log() {},
      warn() {},
    },
  });

  const directCreateCalls = [];
  const handler = createCreateFeedbackHandler({
    apiOk: (_res, data, extra) => {
      events.push('apiOk');
      return { data: toPlainJson(data), extra: toPlainJson(extra) };
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    normalizeTipo: (value) => String(value || '').trim().toLowerCase(),
    inferModuloFromUrl: (value) => (String(value || '').includes('/ctx/') ? 'ctx_modulo' : 'fallback_modulo'),
    createFeedback: async (...args) => {
      directCreateCalls.push(args);
      return createFeedbackDoc();
    },
  });

  const result = await handler(
    {
      body: {
        mensagem: 'Mensagem owner core',
        tipo: 'ELOGIO',
        module: 'modulo_owner',
        contexto: {
          url: 'https://app.local/ctx/owner',
          timezone: 'America/Sao_Paulo',
          user_agent: 'ctx-owner-agent',
        },
        url: 'https://body.local/ignorado',
        timezone: 'UTC',
        userAgent: 'body-agent',
      },
      unitScope: { unidadeId: ' unit-99 ' },
      user: {
        _id: '507f191e810c19729de860ea',
        email: 'owner@test.local',
        nome: 'Owner User',
        role: 'user',
      },
      get(name) {
        const normalized = String(name || '').toLowerCase();
        if (normalized === 'referer') return 'https://app.local/ref/owner';
        if (normalized === 'user-agent') return 'header-owner-agent';
        return '';
      },
    },
    {},
  );

  assert.deepEqual(events, ['core', 'apiOk']);
  assert.equal(directCreateCalls.length, 0, 'Owner nao deve chamar createFeedback diretamente quando a seam ja encapsula o handoff.');
  assert.deepEqual(seamCalls, [
    {
      mensagem: 'Mensagem owner core',
      tipo: 'elogio',
      rawModulo: 'modulo_owner',
      contexto: {
        url: 'https://app.local/ctx/owner',
        timezone: 'America/Sao_Paulo',
        user_agent: 'ctx-owner-agent',
      },
      bodyUrl: 'https://body.local/ignorado',
      bodyTimezone: 'UTC',
      bodyUserAgent: 'body-agent',
      referer: 'https://app.local/ref/owner',
      headerUserAgent: 'header-owner-agent',
      scopedUnitId: 'unit-99',
      user: {
        _id: '507f191e810c19729de860ea',
        email: 'owner@test.local',
        nome: 'Owner User',
        role: 'user',
      },
    },
  ]);
  assert.deepEqual(result, {
    data: {
      _id: '507f1f77bcf86cd799439011',
      tipo: 'elogio',
      status: 'novo',
      mensagem: 'Mensagem owner core',
      criadoPor: {
        userId: '507f191e810c19729de860ea',
        email: 'create.feedback@test.local',
        nome: 'Create Feedback',
        role: 'user',
      },
      origem: {
        modulo: 'modulo_explicito',
        path: 'https://app.local/feedback/criar',
        userAgent: 'ctx-agent',
        timezone: 'America/Sao_Paulo',
      },
    },
    extra: {
      id: '507f1f77bcf86cd799439011',
      created: true,
    },
  });
});