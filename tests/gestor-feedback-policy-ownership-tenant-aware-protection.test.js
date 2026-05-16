import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const POLICY_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/feedback/createFeedbackPolicyOwnershipCore.service.js');
const STATUS_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackStatusApiController.js');
const MY_LIST_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackMyListApiController.js');
const UPLOAD_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackUploadApiController.js');

const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const POLICY_SOURCE = fs.readFileSync(POLICY_SERVICE_PATH, 'utf8');
const STATUS_CONTROLLER_SOURCE = fs.readFileSync(STATUS_CONTROLLER_PATH, 'utf8');
const MY_LIST_CONTROLLER_SOURCE = fs.readFileSync(MY_LIST_CONTROLLER_PATH, 'utf8');
const UPLOAD_CONTROLLER_SOURCE = fs.readFileSync(UPLOAD_CONTROLLER_PATH, 'utf8');

// Guardrail semantico: este core e uma seam de policy/ownership de feedback.
// Ele nao e precedente para write global nem para bypass de contexto tenant-aware.

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Nao foi possivel localizar a assinatura: ${signature}`);

  const paramsStart = source.indexOf('(', start);
  assert.ok(paramsStart >= 0, `Nao foi possivel localizar os parametros: ${signature}`);

  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }

  assert.ok(paramsEnd >= 0, `Nao foi possivel localizar o fim dos parametros: ${signature}`);

  const bodyStart = source.indexOf('{', paramsEnd);
  assert.ok(bodyStart >= 0, `Nao foi possivel localizar o corpo da funcao: ${signature}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Nao foi possivel extrair a funcao: ${signature}`);
}

function buildExportedFunction(source, signature, dependencies = {}) {
  const functionBlock = extractFunction(source, signature).replace('export ', '');
  const nameMatch = signature.match(/function\s+([A-Za-z0-9_]+)/);
  assert.ok(nameMatch, `Nao foi possivel inferir o nome da funcao: ${signature}`);

  const dependencyPrelude = Object.keys(dependencies)
    .map((dependencyName) => `const ${dependencyName} = __deps.${dependencyName};`)
    .join('\n');

  const context = {
    __deps: dependencies,
    __loadedFunction: null,
    console,
  };

  const script = new vm.Script(`${dependencyPrelude}\n${functionBlock}\nglobalThis.__loadedFunction = ${nameMatch[1]};`);
  script.runInNewContext(context);
  return context.__loadedFunction;
}

function buildPolicyFactory() {
  const normalizedSource = POLICY_SOURCE
    .replace(/export default createFeedbackPolicyOwnershipCore;\s*/g, '')
    .replace('export function createFeedbackPolicyOwnershipCore(', 'function createFeedbackPolicyOwnershipCore(');

  const script = new vm.Script(`(${normalizedSource})`);
  return script.runInNewContext({ console });
}

function createResponseCapture() {
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

test('feedback policy tenant-aware: a seam permanece pura, sem I/O ou write, e os callsites minimos continuam explicitos', () => {
  assert.match(ROUTE_SOURCE, /const feedbackPolicy = createFeedbackPolicyOwnershipCore\(\{ isAdminLike \}\);/);
  assert.match(STATUS_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{[\s\S]*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),[\s\S]*\}\);/);
  assert.match(MY_LIST_CONTROLLER_SOURCE, /const filterResult = feedbackPolicy\.buildMyFeedbackFilter\(\{[\s\S]*scopedUnitId,[\s\S]*\}\);/);
  assert.match(UPLOAD_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureCreatorOwnership\(\{[\s\S]*scopedUnitId,[\s\S]*\}\);/);

  const statusAccessIndex = STATUS_CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureAdminAccess({');
  const statusWriteIndex = STATUS_CONTROLLER_SOURCE.indexOf('const fb = await findFeedbackByIdAndUpdateSetNewLean(');
  const uploadAccessIndex = UPLOAD_CONTROLLER_SOURCE.indexOf('const access = feedbackPolicy.ensureCreatorOwnership({');
  const uploadWriteIndex = UPLOAD_CONTROLLER_SOURCE.indexOf('await saveFeedbackDoc(fb);');

  assert.ok(statusAccessIndex >= 0 && statusWriteIndex >= 0 && statusAccessIndex < statusWriteIndex, 'Status deve passar pela policy antes do write sensivel.');
  assert.ok(uploadAccessIndex >= 0 && uploadWriteIndex >= 0 && uploadAccessIndex < uploadWriteIndex, 'Upload deve passar pela policy antes do save sensivel.');

  assert.match(POLICY_SOURCE, /export function createFeedbackPolicyOwnershipCore\(/);
  assert.match(POLICY_SOURCE, /function ensureAdminAccess\(options = \{\}\)/);
  assert.match(POLICY_SOURCE, /function ensureCreatorOwnership\(\{ currentUser, feedback, scopedUnitId \} = \{\}\)/);
  assert.match(POLICY_SOURCE, /function buildMyFeedbackFilter\(\{ currentUser, scopedUnitId \} = \{\}\)/);
  assert.doesNotMatch(POLICY_SOURCE, /await\s+/);
  assert.doesNotMatch(POLICY_SOURCE, /findFeedbackBy|findFeedbackById|findFeedbackByFilter|saveFeedbackDoc|findFeedbackByIdAndUpdate|findFeedbackByIdAndDelete|processUpload|apiOk|apiFail|mongoose|mongodb/i);
});

test('feedback policy tenant-aware: branch admin/global preserva shape atual sem scopedUnitId', () => {
  const createFeedbackPolicyOwnershipCore = buildPolicyFactory();
  const calls = [];
  const policy = createFeedbackPolicyOwnershipCore({
    isAdminLike: (currentUser) => {
      calls.push(toPlainJson(currentUser));
      return !!(currentUser && (currentUser.role === 'admin' || currentUser.role === 'master' || currentUser.isMaster));
    },
  });

  const result = policy.ensureAdminAccess({
    currentUser: { _id: 'admin-1', role: 'admin', email: ' admin@exemplo.com ' },
  });

  assert.deepEqual(toPlainJson(result), {
    allowed: true,
    actor: {
      id: 'admin-1',
      email: 'admin@exemplo.com',
      isAdmin: true,
    },
    canonicalContextUnitId: '',
    branch: 'global',
    feedbackQueryOptions: {},
    feedbackMutationOptions: {},
  });
  assert.deepEqual(toPlainJson(calls), [
    { _id: 'admin-1', role: 'admin', email: ' admin@exemplo.com ' },
  ]);
});

test('feedback policy tenant-aware: branch contextual com scopedUnitId preserva shape atual e scopedUnitId nao e decorativo', () => {
  const createFeedbackPolicyOwnershipCore = buildPolicyFactory();
  const policy = createFeedbackPolicyOwnershipCore({
    isAdminLike: (currentUser) => currentUser?.role === 'admin',
  });

  const contextual = policy.ensureAdminAccess({
    currentUser: { id: 'admin-2', role: 'admin', email: 'gestor@exemplo.com' },
    scopedUnitId: 'unit-42',
  });
  const globalResult = policy.ensureAdminAccess({
    currentUser: { id: 'admin-2', role: 'admin', email: 'gestor@exemplo.com' },
    scopedUnitId: '',
  });

  assert.deepEqual(toPlainJson(contextual), {
    allowed: true,
    actor: {
      id: 'admin-2',
      email: 'gestor@exemplo.com',
      isAdmin: true,
    },
    canonicalContextUnitId: 'unit-42',
    branch: 'contextual',
    feedbackQueryOptions: {
      scopedUnitId: 'unit-42',
      allowLegacyUnscoped: true,
      preferScopedRepoRead: true,
    },
    feedbackMutationOptions: {
      scopedUnitId: 'unit-42',
      allowLegacyUnscoped: true,
    },
  });
  assert.equal(globalResult.branch, 'global');
  assert.notDeepEqual(toPlainJson(contextual.feedbackQueryOptions), toPlainJson(globalResult.feedbackQueryOptions));
  assert.notDeepEqual(toPlainJson(contextual.feedbackMutationOptions), toPlainJson(globalResult.feedbackMutationOptions));
});

test('feedback policy tenant-aware: creator ownership preserva fail-closed por unidade e por dono', () => {
  const createFeedbackPolicyOwnershipCore = buildPolicyFactory();
  const policy = createFeedbackPolicyOwnershipCore({
    isAdminLike: () => false,
  });

  const deniedByUnit = policy.ensureCreatorOwnership({
    currentUser: { _id: 'user-1', email: 'dono@exemplo.com' },
    feedback: {
      unidade_id: 'unit-b',
      criadoPor: { userId: 'user-1', email: 'dono@exemplo.com' },
    },
    scopedUnitId: 'unit-a',
  });
  const deniedByCreator = policy.ensureCreatorOwnership({
    currentUser: { _id: 'user-2', email: 'outro@exemplo.com' },
    feedback: {
      unidade_id: 'unit-a',
      criadoPor: { userId: 'user-1', email: 'dono@exemplo.com' },
    },
    scopedUnitId: 'unit-a',
  });
  const allowed = policy.ensureCreatorOwnership({
    currentUser: { _id: 'user-1', email: 'dono@exemplo.com' },
    feedback: {
      unidade_id: 'unit-a',
      criadoPor: { userId: 'user-1', email: 'dono@exemplo.com' },
    },
    scopedUnitId: 'unit-a',
  });

  assert.deepEqual(toPlainJson(deniedByUnit), {
    allowed: false,
    error: 'forbidden',
    actor: {
      id: 'user-1',
      email: 'dono@exemplo.com',
      isAdmin: false,
    },
    canonicalContextUnitId: 'unit-a',
  });
  assert.deepEqual(toPlainJson(deniedByCreator), {
    allowed: false,
    error: 'forbidden',
    actor: {
      id: 'user-2',
      email: 'outro@exemplo.com',
      isAdmin: false,
    },
    canonicalContextUnitId: 'unit-a',
  });
  assert.deepEqual(toPlainJson(allowed), {
    allowed: true,
    actor: {
      id: 'user-1',
      email: 'dono@exemplo.com',
      isAdmin: false,
    },
    canonicalContextUnitId: 'unit-a',
  });
});

test('feedback policy tenant-aware: filtro de meus feedbacks preserva ownership e contexto', () => {
  const createFeedbackPolicyOwnershipCore = buildPolicyFactory();
  const policy = createFeedbackPolicyOwnershipCore({
    isAdminLike: () => false,
  });

  const contextual = policy.buildMyFeedbackFilter({
    currentUser: { _id: 'user-7', email: 'u7@exemplo.com' },
    scopedUnitId: 'unit-77',
  });
  const fallbackByEmail = policy.buildMyFeedbackFilter({
    currentUser: { email: 'fallback@exemplo.com' },
  });

  assert.deepEqual(toPlainJson(contextual), {
    filter: {
      $and: [
        { 'criadoPor.userId': 'user-7' },
        {
          $or: [
            { unidade_id: 'unit-77' },
            { unidade_id: { $exists: false } },
            { unidade_id: null },
          ],
        },
      ],
    },
    actor: {
      id: 'user-7',
      email: 'u7@exemplo.com',
      isAdmin: false,
    },
    canonicalContextUnitId: 'unit-77',
  });
  assert.deepEqual(toPlainJson(fallbackByEmail), {
    filter: { 'criadoPor.email': 'fallback@exemplo.com' },
    actor: {
      id: null,
      email: 'fallback@exemplo.com',
      isAdmin: false,
    },
    canonicalContextUnitId: '',
  });
});

test('feedback policy tenant-aware: callsite minimo de status usa a policy antes do write sensivel', async () => {
  const createUpdateFeedbackStatusHandler = buildExportedFunction(
    STATUS_CONTROLLER_SOURCE,
    'export function createUpdateFeedbackStatusHandler',
    {
      console,
      ALLOWED_FEEDBACK_STATUSES: new Set([
        'novo',
        'respondido',
        'aberto',
        'em_andamento',
        'resolvido',
        'cancelado',
      ]),
    },
  );

  const calls = [];
  const handler = createUpdateFeedbackStatusHandler({
    apiOk: (_res, payload) => {
      calls.push(['apiOk', toPlainJson(payload)]);
      return payload;
    },
    apiFail: (_res, status, message) => {
      calls.push(['apiFail', status, message]);
      return { status, message };
    },
    normalizeStatus: (value) => value,
    feedbackPolicy: {
      ensureAdminAccess: (input) => {
        calls.push(['ensureAdminAccess', toPlainJson(input)]);
        return {
          allowed: true,
          feedbackMutationOptions: {
            scopedUnitId: 'unit-9',
            allowLegacyUnscoped: true,
          },
        };
      },
    },
    findFeedbackByIdAndUpdateSetNewLean: async (id, setData, options) => {
      calls.push(['findFeedbackByIdAndUpdateSetNewLean', id, toPlainJson(setData), toPlainJson(options)]);
      return { _id: id, status: setData.status };
    },
  });

  const req = {
    user: { role: 'admin' },
    unitScope: { unidadeId: 'unit-9' },
    params: { feedbackId: '507f1f77bcf86cd799439011' },
    body: { status: 'resolvido' },
  };
  const res = createResponseCapture();

  await handler(req, res);

  assert.deepEqual(calls, [
    ['ensureAdminAccess', { currentUser: { role: 'admin' }, scopedUnitId: 'unit-9' }],
    ['findFeedbackByIdAndUpdateSetNewLean', '507f1f77bcf86cd799439011', { status: 'resolvido' }, { scopedUnitId: 'unit-9', allowLegacyUnscoped: true }],
    ['apiOk', { _id: '507f1f77bcf86cd799439011', status: 'resolvido' }],
  ]);
});

test('feedback policy tenant-aware: callsite minimo de meus feedbacks usa o core antes da leitura sensivel', async () => {
  const createMyFeedbackListHandler = buildExportedFunction(
    MY_LIST_CONTROLLER_SOURCE,
    'export function createMyFeedbackListHandler',
    { console },
  );

  const calls = [];
  const handler = createMyFeedbackListHandler({
    apiOk: (_res, payload) => {
      calls.push(['apiOk', toPlainJson(payload)]);
      return payload;
    },
    apiFail: (_res, status, message) => {
      calls.push(['apiFail', status, message]);
      return { status, message };
    },
    feedbackPolicy: {
      buildMyFeedbackFilter: (input) => {
        calls.push(['buildMyFeedbackFilter', toPlainJson(input)]);
        return {
          filter: { 'criadoPor.userId': 'user-9' },
        };
      },
    },
    findFeedbackByFilterSortCreatedAtDescLimit200Lean: async (filter, options) => {
      calls.push(['findFeedbackByFilterSortCreatedAtDescLimit200Lean', toPlainJson(filter), toPlainJson(options)]);
      return [{ _id: 'fb-1' }];
    },
  });

  const req = {
    user: { _id: 'user-9' },
    unitScope: { unidadeId: 'unit-9' },
  };
  const res = createResponseCapture();

  await handler(req, res);

  assert.deepEqual(calls, [
    ['buildMyFeedbackFilter', { currentUser: { _id: 'user-9' }, scopedUnitId: 'unit-9' }],
    ['findFeedbackByFilterSortCreatedAtDescLimit200Lean', { 'criadoPor.userId': 'user-9' }, { scopedUnitId: 'unit-9', allowLegacyUnscoped: true, preferScopedRepoRead: true }],
    ['apiOk', [{ _id: 'fb-1' }]],
  ]);
});