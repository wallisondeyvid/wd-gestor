import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackUploadApiController.js');
const CONTROLLER_SOURCE = fs.readFileSync(CONTROLLER_PATH, 'utf8');

const FEEDBACK_ID = '507f1f77bcf86cd799439011';
const CREATOR_ID = '507f191e810c19729de860ea';

// Guardrail semantico: este owner e a fronteira curta do upload contextual.
// Ele nao e precedente para upload global silencioso nem para scopedUnitId decorativo.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildUploadFeedbackHandlerFactory(dependencies = {}) {
  const normalizedSource = CONTROLLER_SOURCE.replace(
    'export function createUploadFeedbackAnexoHandler(',
    'function createUploadFeedbackAnexoHandler(',
  );

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFactory: null,
    Buffer,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${normalizedSource}\nglobalThis.__loadedFactory = createUploadFeedbackAnexoHandler;`);
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
  const {
    params: paramsOverrides = {},
    user: userOverrides = {},
    unitScope: unitScopeOverrides = {},
    file: fileOverride,
    files: filesOverride,
    ...restOverrides
  } = overrides;

  return {
    params: {
      feedbackId: FEEDBACK_ID,
      ...paramsOverrides,
    },
    unitScope: {
      unidadeId: 'unit-77',
      ...unitScopeOverrides,
    },
    user: {
      _id: CREATOR_ID,
      id: CREATOR_ID,
      email: 'creator.feedback@test.local',
      nome: 'Creator Feedback',
      role: 'user',
      ...userOverrides,
    },
    baseUrl: '/gestor',
    file:
      fileOverride === undefined
        ? { originalname: 'print.png', mimetype: 'image/png', buffer: Buffer.from('png'), size: 3 }
        : fileOverride,
    files: filesOverride === undefined ? [] : filesOverride,
    ...restOverrides,
  };
}

function feedbackFixture(overrides = {}) {
  const base = {
    _id: FEEDBACK_ID,
    unidade_id: 'unit-77',
    mensagem: 'Feedback de upload',
    criadoPor: {
      userId: CREATOR_ID,
      email: 'creator.feedback@test.local',
      nome: 'Creator Feedback',
      role: 'user',
    },
    anexos: [],
    toObject() {
      return {
        _id: this._id,
        unidade_id: this.unidade_id,
        mensagem: this.mensagem,
        criadoPor: this.criadoPor,
        anexos: this.anexos,
      };
    },
  };

  return Object.assign(base, overrides);
}

test('feedback upload tenant-aware: owner preserva handoff curto contextual antes do storage e do write', () => {
  assert.match(CONTROLLER_SOURCE, /const scopedUnitId = String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\);/);
  assert.match(
    CONTROLLER_SOURCE,
    /const fb = await findFeedbackById\(feedbackId, \{[\s\S]*?scopedUnitId,[\s\S]*?allowLegacyUnscoped: true,[\s\S]*?preferScopedRepoRead: true,[\s\S]*?\}\);/,
  );
  assert.match(CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureCreatorOwnership\(\{/);
  assert.match(CONTROLLER_SOURCE, /const uploadResult = await uploadStorageInfra\.processUpload\(\{/);
  assert.match(CONTROLLER_SOURCE, /await saveFeedbackDoc\(fb\);/);
  assert.match(CONTROLLER_SOURCE, /return apiOk\(res, fb\.toObject\(\), \{ id: fb\._id \}\);/);

  const idValidationIndex = CONTROLLER_SOURCE.indexOf("if (!/^[0-9a-fA-F]{24}$/.test(feedbackId)) return apiFail(res, 400, 'ID inválido.');");
  const readIndex = CONTROLLER_SOURCE.indexOf('const fb = await findFeedbackById(feedbackId, {');
  const notFoundIndex = CONTROLLER_SOURCE.indexOf("if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');");
  const seamIndex = CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureCreatorOwnership({');
  const storageIndex = CONTROLLER_SOURCE.indexOf('const uploadResult = await uploadStorageInfra.processUpload({');
  const saveIndex = CONTROLLER_SOURCE.indexOf('await saveFeedbackDoc(fb);');
  const responseIndex = CONTROLLER_SOURCE.indexOf('return apiOk(res, fb.toObject(), { id: fb._id });');

  assert.ok(idValidationIndex >= 0 && readIndex >= 0 && notFoundIndex >= 0 && seamIndex >= 0 && storageIndex >= 0 && saveIndex >= 0 && responseIndex >= 0, 'Owner deve preservar a cadeia curta do upload contextual.');
  assert.ok(idValidationIndex < readIndex && readIndex < notFoundIndex && notFoundIndex < seamIndex, 'Owner deve validar id, ler feedback e traduzir 404 antes do gate de ownership.');
  assert.ok(seamIndex < storageIndex && storageIndex < saveIndex && saveIndex < responseIndex, 'Owner deve aplicar ownership antes do storage, persistir apenas ao final e responder publicamente por ultimo.');
});

test('feedback upload tenant-aware: feedbackId invalido nao executa read, seam, storage nem persistencia', async () => {
  const events = [];

  const createUploadFeedbackAnexoHandler = buildUploadFeedbackHandlerFactory({
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createUploadFeedbackAnexoHandler({
    apiOk: () => {
      events.push('apiOk');
      return null;
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    findFeedbackById: async () => {
      events.push('read');
      throw new Error('nao deve ler com id invalido');
    },
    feedbackPolicy: {
      ensureCreatorOwnership() {
        events.push('seam');
        throw new Error('nao deve executar ownership com id invalido');
      },
    },
    saveFeedbackDoc: async () => {
      events.push('save');
      throw new Error('nao deve persistir com id invalido');
    },
    uploadStorageInfra: {
      async processUpload() {
        events.push('storage');
        throw new Error('nao deve processar storage com id invalido');
      },
    },
    logError() {},
  });

  const result = await handler(buildReq({ params: { feedbackId: 'id-malformado' } }), makeRes());

  assert.deepEqual(events, [['apiFail', 400, 'ID inválido.']]);
  assert.deepEqual(result, { status: 400, message: 'ID inválido.' });
});

test('feedback upload tenant-aware: not found nao executa gate tardio, storage nem write', async () => {
  const events = [];
  const readCalls = [];

  const createUploadFeedbackAnexoHandler = buildUploadFeedbackHandlerFactory({
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createUploadFeedbackAnexoHandler({
    apiOk: () => {
      events.push('apiOk');
      return null;
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    findFeedbackById: async (id, queryOptions) => {
      events.push('read');
      readCalls.push({ id, queryOptions: toPlainJson(queryOptions) });
      return null;
    },
    feedbackPolicy: {
      ensureCreatorOwnership() {
        events.push('seam');
        throw new Error('nao deve executar ownership sem feedback carregado');
      },
    },
    saveFeedbackDoc: async () => {
      events.push('save');
      throw new Error('nao deve persistir sem feedback');
    },
    uploadStorageInfra: {
      async processUpload() {
        events.push('storage');
        throw new Error('nao deve processar storage sem feedback');
      },
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
        preferScopedRepoRead: true,
      },
    },
  ]);
  assert.deepEqual(events, ['read', ['apiFail', 404, 'Feedback não encontrado.']]);
  assert.deepEqual(result, { status: 404, message: 'Feedback não encontrado.' });
});

test('feedback upload tenant-aware: owner mantem scoped read material, seam curta e write somente apos upload bem-sucedido', async () => {
  const events = [];
  const readCalls = [];
  const seamCalls = [];
  const storageCalls = [];
  const saveCalls = [];
  const feedback = feedbackFixture();

  const createUploadFeedbackAnexoHandler = buildUploadFeedbackHandlerFactory({
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createUploadFeedbackAnexoHandler({
    apiOk: (_res, data, extra) => {
      events.push('apiOk');
      return { data: toPlainJson(data), extra: toPlainJson(extra) };
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    findFeedbackById: async (id, queryOptions) => {
      events.push('read');
      readCalls.push({ id, queryOptions: toPlainJson(queryOptions) });
      return feedback;
    },
    feedbackPolicy: {
      ensureCreatorOwnership(input) {
        events.push('seam');
        seamCalls.push({
          keys: Object.keys(input).sort(),
          payload: toPlainJson(input),
        });
        return { allowed: true };
      },
    },
    saveFeedbackDoc: async (value) => {
      events.push('save');
      saveCalls.push(toPlainJson(value));
    },
    uploadStorageInfra: {
      async processUpload(input) {
        events.push('storage');
        storageCalls.push({
          keys: Object.keys(input).sort(),
          payload: toPlainJson(input),
          hasScopedUnitId: Object.prototype.hasOwnProperty.call(input, 'scopedUnitId'),
          hasOwnership: Object.prototype.hasOwnProperty.call(input, 'access'),
          hasCurrentUser: Object.prototype.hasOwnProperty.call(input, 'currentUser'),
        });
        return {
          kind: 'stored',
          file: input.file,
          stored: {
            originalName: 'print.png',
            url: '/gestor/uploads/feedback/fb-1/print.png',
          },
        };
      },
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
        preferScopedRepoRead: true,
      },
    },
  ]);
  assert.deepEqual(seamCalls, [
    {
      keys: ['currentUser', 'feedback', 'scopedUnitId'],
      payload: {
        currentUser: {
          _id: CREATOR_ID,
          id: CREATOR_ID,
          email: 'creator.feedback@test.local',
          nome: 'Creator Feedback',
          role: 'user',
        },
        feedback: feedbackFixture(),
        scopedUnitId: 'unit-77',
      },
    },
  ]);
  assert.deepEqual(storageCalls, [
    {
      keys: ['baseUrl', 'feedbackId', 'file', 'files'],
      payload: {
        baseUrl: '/gestor',
        feedbackId: FEEDBACK_ID,
        file: {
          originalname: 'print.png',
          mimetype: 'image/png',
          buffer: {
            type: 'Buffer',
            data: [112, 110, 103],
          },
          size: 3,
        },
        files: [],
      },
      hasScopedUnitId: false,
      hasOwnership: false,
      hasCurrentUser: false,
    },
  ]);
  assert.equal(saveCalls.length, 1);
  assert.deepEqual(events, ['read', 'seam', 'storage', 'save', 'apiOk']);
  assert.equal(feedback.anexos.length, 1);
  assert.deepEqual(toPlainJson(feedback.anexos[0]), {
    nome: 'print.png',
    url: '/gestor/uploads/feedback/fb-1/print.png',
    mime: 'image/png',
    size: 3,
  });
  assert.deepEqual(result, {
    data: {
      _id: FEEDBACK_ID,
      unidade_id: 'unit-77',
      mensagem: 'Feedback de upload',
      criadoPor: {
        userId: CREATOR_ID,
        email: 'creator.feedback@test.local',
        nome: 'Creator Feedback',
        role: 'user',
      },
      anexos: [
        {
          nome: 'print.png',
          url: '/gestor/uploads/feedback/fb-1/print.png',
          mime: 'image/png',
          size: 3,
        },
      ],
    },
    extra: { id: FEEDBACK_ID },
  });
});

test('feedback upload tenant-aware: ownership negado bloqueia storage e persistencia mesmo com feedback carregado', async () => {
  const events = [];

  const createUploadFeedbackAnexoHandler = buildUploadFeedbackHandlerFactory({
    console: {
      error() {},
      warn() {},
      log() {},
    },
  });

  const handler = createUploadFeedbackAnexoHandler({
    apiOk: () => {
      events.push('apiOk');
      return null;
    },
    apiFail: (_res, status, message) => {
      events.push(['apiFail', status, message]);
      return { status, message };
    },
    findFeedbackById: async () => {
      events.push('read');
      return feedbackFixture({ unidade_id: 'unit-99' });
    },
    feedbackPolicy: {
      ensureCreatorOwnership(input) {
        events.push('seam');
        assert.equal(input.scopedUnitId, 'unit-77');
        return { allowed: false };
      },
    },
    saveFeedbackDoc: async () => {
      events.push('save');
      throw new Error('nao deve persistir com ownership negado');
    },
    uploadStorageInfra: {
      async processUpload() {
        events.push('storage');
        throw new Error('nao deve processar storage com ownership negado');
      },
    },
    logError() {},
  });

  const result = await handler(buildReq(), makeRes());

  assert.deepEqual(events, ['read', 'seam', ['apiFail', 403, 'Acesso negado.']]);
  assert.deepEqual(result, { status: 403, message: 'Acesso negado.' });
});