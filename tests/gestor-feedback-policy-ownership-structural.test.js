import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROUTE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const UPLOAD_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackUploadApiController.js');
const MY_DETAIL_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackMyDetailApiController.js');
const MY_LIST_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackMyListApiController.js');
const ADMIN_LIST_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackListApiController.js');
const ADMIN_DETAIL_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDetailApiController.js');
const STATUS_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackStatusApiController.js');
const RESPOSTA_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackRespostaApiController.js');
const DELETE_CONTROLLER_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/feedbackDeleteApiController.js');
const POLICY_SERVICE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/services/feedback/createFeedbackPolicyOwnershipCore.service.js');
const MY_DETAIL_OWNERSHIP_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processMyFeedbackDetailOwnershipCore.js');
const MY_LIST_FILTER_CORE_PATH = path.join(process.cwd(), 'src/modules/gestor/app/controllers/utils/processMyFeedbackListFilterCore.js');

const ROUTE_SOURCE = fs.readFileSync(ROUTE_PATH, 'utf8');
const UPLOAD_CONTROLLER_SOURCE = fs.readFileSync(UPLOAD_CONTROLLER_PATH, 'utf8');
const MY_DETAIL_CONTROLLER_SOURCE = fs.readFileSync(MY_DETAIL_CONTROLLER_PATH, 'utf8');
const MY_LIST_CONTROLLER_SOURCE = fs.readFileSync(MY_LIST_CONTROLLER_PATH, 'utf8');
const ADMIN_LIST_CONTROLLER_SOURCE = fs.readFileSync(ADMIN_LIST_CONTROLLER_PATH, 'utf8');
const ADMIN_DETAIL_CONTROLLER_SOURCE = fs.readFileSync(ADMIN_DETAIL_CONTROLLER_PATH, 'utf8');
const STATUS_CONTROLLER_SOURCE = fs.readFileSync(STATUS_CONTROLLER_PATH, 'utf8');
const RESPOSTA_CONTROLLER_SOURCE = fs.readFileSync(RESPOSTA_CONTROLLER_PATH, 'utf8');
const DELETE_CONTROLLER_SOURCE = fs.readFileSync(DELETE_CONTROLLER_PATH, 'utf8');
const POLICY_SERVICE_SOURCE = fs.readFileSync(POLICY_SERVICE_PATH, 'utf8');
const MY_DETAIL_OWNERSHIP_CORE_SOURCE = fs.readFileSync(MY_DETAIL_OWNERSHIP_CORE_PATH, 'utf8');
const MY_LIST_FILTER_CORE_SOURCE = fs.readFileSync(MY_LIST_FILTER_CORE_PATH, 'utf8');

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function buildObjectFromSource(source, context = {}) {
  const script = new vm.Script(source);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function buildFeedbackPolicyOwnershipCoreSource() {
  return `function createFeedbackPolicyOwnershipCore({ isAdminLike } = {}) {
    function resolveActor(currentUser) {
      const id = currentUser?._id || currentUser?.id || null;
      const email = String(currentUser?.email || '').trim().toLowerCase();
      return {
        id: id ? String(id) : null,
        email,
        isAdmin: !!isAdminLike(currentUser || null),
      };
    }

    function ensureAdminAccess({ currentUser }) {
      const actor = resolveActor(currentUser);
      if (!actor.isAdmin) return { allowed: false, error: 'forbidden' };
      return { allowed: true, actor };
    }

    function ensureCreatorOwnership({ currentUser, feedback }) {
      const actor = resolveActor(currentUser);
      const creatorId = feedback?.criadoPor?.userId ? String(feedback.criadoPor.userId) : '';
      if (creatorId && actor.id && actor.id !== creatorId) {
        return { allowed: false, error: 'forbidden', actor };
      }
      return { allowed: true, actor };
    }

    function buildMyFeedbackFilter({ currentUser }) {
      const actor = resolveActor(currentUser);
      const filter = actor.id
        ? { 'criadoPor.userId': actor.id }
        : { 'criadoPor.email': actor.email };
      return { filter, actor };
    }

    return {
      resolveActor,
      ensureAdminAccess,
      ensureCreatorOwnership,
      buildMyFeedbackFilter,
    };
  }`;
}

function buildDelegatedOwnersSource() {
  return `({
    async uploadOwner(req, res, deps) {
      const feedbackId = String(req.params.feedbackId || '').trim();
      if (!feedbackId) return deps.apiFail(res, 400, 'ID inválido.');
      const fb = await deps.findFeedbackById(feedbackId);
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');

      const access = deps.policy.ensureCreatorOwnership({
        currentUser: req.user || null,
        feedback: fb,
      });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');

      const uploadResult = await deps.uploadStorageInfra.processUpload({
        file: req.file,
        files: req.files,
        baseUrl: req.baseUrl || '',
        feedbackId: String(fb._id),
      });
      if (uploadResult.kind === 'missing_file') return deps.apiFail(res, 400, 'Arquivo ausente.');

      return deps.apiOk(res, { uploaded: true }, { id: fb._id });
    },

    async myListOwner(req, res, deps) {
      const policy = deps.policy.buildMyFeedbackFilter({ currentUser: req.user || null });
      const items = await deps.findFeedbackByFilter(policy.filter);
      return deps.apiOk(res, items);
    },

    async myDetailOwner(req, res, deps) {
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return deps.apiFail(res, 400, 'ID inválido.');
      const fb = await deps.findFeedbackByIdLean(id);
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');

      const access = deps.policy.ensureCreatorOwnership({
        currentUser: req.user || null,
        feedback: fb,
      });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');

      return deps.apiOk(res, fb);
    },

    async adminListOwner(req, res, deps) {
      const access = deps.policy.ensureAdminAccess({ currentUser: req.user || null });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');
      const items = await deps.findFeedbackByFilter({});
      return deps.apiOk(res, items);
    },

    async adminDetailOwner(req, res, deps) {
      const access = deps.policy.ensureAdminAccess({ currentUser: req.user || null });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');
      const fb = await deps.findFeedbackByIdLean(String(req.params.feedbackId || '').trim());
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');
      return deps.apiOk(res, fb);
    },

    async adminStatusOwner(req, res, deps) {
      const access = deps.policy.ensureAdminAccess({ currentUser: req.user || null });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');
      const fb = await deps.updateStatus(String(req.params.feedbackId || '').trim(), { status: req.body?.status });
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');
      return deps.apiOk(res, fb);
    },

    async adminRespostaOwner(req, res, deps) {
      const access = deps.policy.ensureAdminAccess({ currentUser: req.user || null });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');
      const fb = await deps.updateResposta(String(req.params.feedbackId || '').trim(), req.body?.resposta || '');
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');
      return deps.apiOk(res, fb);
    },

    async adminDeleteOwner(req, res, deps) {
      const access = deps.policy.ensureAdminAccess({ currentUser: req.user || null });
      if (!access.allowed) return deps.apiFail(res, 403, 'Acesso negado.');
      const fb = await deps.deleteFeedback(String(req.params.feedbackId || '').trim());
      if (!fb) return deps.apiFail(res, 404, 'Feedback não encontrado.');
      return deps.apiOk(res, { deleted: true });
    },
  })`;
}

test('estado real atual: policy e ownership ainda estao espalhados entre rota, owners e cores locais', () => {
  assert.match(ROUTE_SOURCE, /function isAdminLike\(user\)/);
  assert.match(ROUTE_SOURCE, /import \{ createFeedbackPolicyOwnershipCore \} from '#modules\/gestor\/app\/services\/feedback\/createFeedbackPolicyOwnershipCore\.service\.js';/);
  assert.match(ROUTE_SOURCE, /const feedbackPolicy = createFeedbackPolicyOwnershipCore\(\{ isAdminLike \}\);/);
  assert.match(POLICY_SERVICE_SOURCE, /export function createFeedbackPolicyOwnershipCore\(\{/);
  assert.match(POLICY_SERVICE_SOURCE, /function ensureAdminAccess\(options = \{\}\)/);
  assert.match(POLICY_SERVICE_SOURCE, /function ensureCreatorOwnership\(\{ currentUser, feedback, scopedUnitId \} = \{\}\)/);
  assert.match(POLICY_SERVICE_SOURCE, /function buildMyFeedbackFilter\(\{ currentUser, scopedUnitId \} = \{\}\)/);

  assert.match(UPLOAD_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureCreatorOwnership\(\{/);

  assert.match(MY_DETAIL_CONTROLLER_SOURCE, /const ownershipResult = feedbackPolicy\.ensureCreatorOwnership\(\{/);
  assert.match(MY_LIST_CONTROLLER_SOURCE, /const filterResult = feedbackPolicy\.buildMyFeedbackFilter\(\{/);
  assert.match(ADMIN_LIST_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{\s*currentUser: req\.user \|\| null,\s*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),\s*\}\);/);
  assert.match(ADMIN_DETAIL_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{\s*currentUser: req\.user \|\| null,\s*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),\s*\}\);/);
  assert.match(STATUS_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{\s*currentUser: req\.user \|\| null,\s*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),\s*\}\);/);
  assert.match(RESPOSTA_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{\s*currentUser: req\.user \|\| null,\s*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),\s*\}\);/);
  assert.match(DELETE_CONTROLLER_SOURCE, /const access = feedbackPolicy\.ensureAdminAccess\(\{\s*currentUser: req\.user \|\| null,\s*scopedUnitId: String\(req\.unitScope\?\.unidadeId \|\| ''\)\.trim\(\),\s*\}\);/);
  assert.match(MY_DETAIL_OWNERSHIP_CORE_SOURCE, /return \{ error: 'forbidden' \};|return \{ error: 'forbidden' \}/);
  assert.match(MY_LIST_FILTER_CORE_SOURCE, /const filter = me \? \{ 'criadoPor\.userId': me \} : \{ 'criadoPor\.email': currentUser\?\.email \|\| '' \};/);

  assert.equal(countOccurrences(ROUTE_SOURCE, 'function isAdminLike(user)'), 1);
  assert.equal(countOccurrences(ADMIN_LIST_CONTROLLER_SOURCE, 'feedbackPolicy.ensureAdminAccess'), 1);
  assert.equal(countOccurrences(ADMIN_DETAIL_CONTROLLER_SOURCE, 'feedbackPolicy.ensureAdminAccess'), 1);
  assert.equal(countOccurrences(STATUS_CONTROLLER_SOURCE, 'feedbackPolicy.ensureAdminAccess'), 1);
  assert.equal(countOccurrences(RESPOSTA_CONTROLLER_SOURCE, 'feedbackPolicy.ensureAdminAccess'), 1);
  assert.equal(countOccurrences(DELETE_CONTROLLER_SOURCE, 'feedbackPolicy.ensureAdminAccess'), 1);
  assert.equal(countOccurrences(UPLOAD_CONTROLLER_SOURCE, 'feedbackPolicy.ensureCreatorOwnership'), 1);

  assert.doesNotMatch(UPLOAD_CONTROLLER_SOURCE, /String\(me\) !== creator/);
  assert.doesNotMatch(MY_DETAIL_CONTROLLER_SOURCE, /processMyFeedbackDetailOwnershipCore\(/);
  assert.doesNotMatch(MY_LIST_CONTROLLER_SOURCE, /processMyFeedbackListFilterCore\(/);
  assert.doesNotMatch(ADMIN_LIST_CONTROLLER_SOURCE, /!isAdminLike\(req\.user\)/);
  assert.doesNotMatch(ADMIN_DETAIL_CONTROLLER_SOURCE, /!isAdminLike\(req\.user\)/);
  assert.doesNotMatch(STATUS_CONTROLLER_SOURCE, /!isAdminLike\(req\.user\)/);
  assert.doesNotMatch(RESPOSTA_CONTROLLER_SOURCE, /!isAdminLike\(req\.user\)/);
  assert.doesNotMatch(DELETE_CONTROLLER_SOURCE, /!isAdminLike\(req\.user\)/);
});

test('futura seam unica recebe apenas contexto minimo de user e feedback carregado ou ids normalizados', () => {
  const functionSource = POLICY_SERVICE_SOURCE
    .replace(/export default createFeedbackPolicyOwnershipCore;\s*/g, '')
    .replace('export function createFeedbackPolicyOwnershipCore(', 'function createFeedbackPolicyOwnershipCore(');
  assert.match(functionSource, /function createFeedbackPolicyOwnershipCore\([\s\S]*isAdminLike[\s\S]*\} = \{\}\)/);
  assert.doesNotMatch(functionSource, /findFeedback|saveFeedback|processUpload|status|resposta|apiOk|apiFail/);
  assert.doesNotMatch(functionSource, /\breq\b|\bres\b/);

  const calls = [];
  const createFeedbackPolicyOwnershipCore = buildFunctionFromSource(functionSource);
  const policy = createFeedbackPolicyOwnershipCore({
    isAdminLike: (currentUser) => {
      calls.push(['isAdminLike', currentUser?.role || null, !!currentUser?.isMaster]);
      return !!(currentUser && (currentUser.isMaster || currentUser.role === 'admin' || currentUser.role === 'master'));
    },
  });

  assert.deepEqual(toPlain(policy.ensureAdminAccess({ currentUser: { role: 'admin' } })), {
    allowed: true,
    actor: { id: null, email: '', isAdmin: true },
    canonicalContextUnitId: '',
    branch: 'global',
    feedbackQueryOptions: {},
    feedbackMutationOptions: {},
  });
  assert.deepEqual(toPlain(policy.ensureAdminAccess({ currentUser: { role: 'user' } })), {
    allowed: false,
    error: 'forbidden',
  });
  assert.deepEqual(toPlain(policy.ensureCreatorOwnership({
    currentUser: { _id: 'user-1', email: 'dono@exemplo.com' },
    feedback: { criadoPor: { userId: 'user-1' } },
  })), {
    allowed: true,
    actor: { id: 'user-1', email: 'dono@exemplo.com', isAdmin: false },
    canonicalContextUnitId: '',
  });
  assert.deepEqual(toPlain(policy.ensureCreatorOwnership({
    currentUser: { _id: 'user-2', email: 'outro@exemplo.com' },
    feedback: { criadoPor: { userId: 'user-1' } },
  })), {
    allowed: false,
    error: 'forbidden',
    actor: { id: 'user-2', email: 'outro@exemplo.com', isAdmin: false },
    canonicalContextUnitId: '',
  });
  assert.deepEqual(toPlain(policy.buildMyFeedbackFilter({ currentUser: { _id: 'user-7', email: 'u7@exemplo.com' } })), {
    filter: { 'criadoPor.userId': 'user-7' },
    actor: { id: 'user-7', email: 'u7@exemplo.com', isAdmin: false },
    canonicalContextUnitId: '',
  });
  assert.deepEqual(toPlain(policy.buildMyFeedbackFilter({ currentUser: { email: 'fallback@exemplo.com' } })), {
    filter: { 'criadoPor.email': 'fallback@exemplo.com' },
    actor: { id: null, email: 'fallback@exemplo.com', isAdmin: false },
    canonicalContextUnitId: '',
  });

  assert.deepEqual(calls, [
    ['isAdminLike', 'admin', false],
    ['isAdminLike', 'user', false],
    ['isAdminLike', null, false],
    ['isAdminLike', null, false],
    ['isAdminLike', null, false],
    ['isAdminLike', null, false],
  ]);
});

test('os endpoints continuam owners HTTP apos a extracao da seam unica de policy-ownership', async () => {
  const policyCalls = [];
  const owners = buildObjectFromSource(buildDelegatedOwnersSource());
  const policy = {
    ensureAdminAccess: (input) => {
      policyCalls.push(['ensureAdminAccess', toPlain(input)]);
      return { allowed: true, actor: { id: 'admin-1', email: 'admin@x.com', isAdmin: true } };
    },
    ensureCreatorOwnership: (input) => {
      policyCalls.push(['ensureCreatorOwnership', toPlain(input)]);
      return { allowed: true, actor: { id: 'user-1', email: 'user@x.com', isAdmin: false } };
    },
    buildMyFeedbackFilter: (input) => {
      policyCalls.push(['buildMyFeedbackFilter', toPlain(input)]);
      return { filter: { 'criadoPor.userId': 'user-1' } };
    },
  };

  const lifecycle = [];
  const deps = {
    policy,
    apiFail: (_res, status, message) => ({ status, message }),
    apiOk: (_res, data, extra) => ({ ok: true, data, extra }),
    findFeedbackById: async (id) => {
      lifecycle.push(['findFeedbackById', id]);
      return { _id: 'fb-1', criadoPor: { userId: 'user-1' } };
    },
    findFeedbackByIdLean: async (id) => {
      lifecycle.push(['findFeedbackByIdLean', id]);
      return { _id: id, criadoPor: { userId: 'user-1' } };
    },
    findFeedbackByFilter: async (filter) => {
      lifecycle.push(['findFeedbackByFilter', toPlain(filter)]);
      return [{ _id: 'fb-1' }];
    },
    updateStatus: async (id, payload) => {
      lifecycle.push(['updateStatus', id, toPlain(payload)]);
      return { _id: id, status: payload.status };
    },
    updateResposta: async (id, resposta) => {
      lifecycle.push(['updateResposta', id, resposta]);
      return { _id: id, resposta };
    },
    deleteFeedback: async (id) => {
      lifecycle.push(['deleteFeedback', id]);
      return { _id: id };
    },
    uploadStorageInfra: {
      processUpload: async (input) => {
        lifecycle.push(['processUpload', { feedbackId: input.feedbackId, baseUrl: input.baseUrl }]);
        return { kind: 'stored', file: { mimetype: 'image/png', size: 3, buffer: { length: 3 } }, stored: { originalName: 'file.png', url: 'https://blob/file.png' } };
      },
    },
  };

  await owners.uploadOwner({ params: { feedbackId: 'fb-up' }, user: { _id: 'user-1' }, file: null, files: [], baseUrl: '/gestor' }, {}, deps);
  await owners.myListOwner({ user: { _id: 'user-1' } }, {}, deps);
  await owners.myDetailOwner({ params: { feedbackId: '507f1f77bcf86cd799439011' }, user: { _id: 'user-1' } }, {}, deps);
  await owners.adminListOwner({ user: { role: 'admin' } }, {}, deps);
  await owners.adminDetailOwner({ params: { feedbackId: 'fb-det' }, user: { role: 'admin' } }, {}, deps);
  await owners.adminStatusOwner({ params: { feedbackId: 'fb-status' }, body: { status: 'resolvido' }, user: { role: 'admin' } }, {}, deps);
  await owners.adminRespostaOwner({ params: { feedbackId: 'fb-resp' }, body: { resposta: 'ok' }, user: { role: 'admin' } }, {}, deps);
  await owners.adminDeleteOwner({ params: { feedbackId: 'fb-del' }, user: { role: 'admin' } }, {}, deps);

  assert.deepEqual(policyCalls, [
    ['ensureCreatorOwnership', { currentUser: { _id: 'user-1' }, feedback: { _id: 'fb-1', criadoPor: { userId: 'user-1' } } }],
    ['buildMyFeedbackFilter', { currentUser: { _id: 'user-1' } }],
    ['ensureCreatorOwnership', { currentUser: { _id: 'user-1' }, feedback: { _id: '507f1f77bcf86cd799439011', criadoPor: { userId: 'user-1' } } }],
    ['ensureAdminAccess', { currentUser: { role: 'admin' } }],
    ['ensureAdminAccess', { currentUser: { role: 'admin' } }],
    ['ensureAdminAccess', { currentUser: { role: 'admin' } }],
    ['ensureAdminAccess', { currentUser: { role: 'admin' } }],
    ['ensureAdminAccess', { currentUser: { role: 'admin' } }],
  ]);

  const ownersSource = buildDelegatedOwnersSource();
  assert.doesNotMatch(ownersSource, /isAdminLike\(req\.user\)|String\(me\) !== creator|criadoPor\.userId': me/);
  assert.doesNotMatch(ownersSource, /saveFeedbackDoc|processUpdateFeedbackRespostaCore|processFeedbackDeleteCleanupCore/);
});