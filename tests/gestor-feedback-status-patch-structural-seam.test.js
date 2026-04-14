import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROUTE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js');

const EXPRESS_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-express';
const MULTER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-multer';
const BLOB_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-vercel-blob';
const REQUIRE_LOGIN_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-require-login';
const FEEDBACK_DETAIL_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-detail-controller';
const FEEDBACK_CREATE_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-create-controller';
const FEEDBACK_UPLOAD_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-upload-controller';
const FEEDBACK_LIST_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-list-controller';
const FEEDBACK_MY_DETAIL_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-my-detail-controller';
const FEEDBACK_MY_LIST_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-my-list-controller';
const FEEDBACK_DELETE_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-delete-controller';
const FEEDBACK_RESPOSTA_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-resposta-controller';
const FEEDBACK_STATUS_CONTROLLER_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-status-controller';
const FEEDBACK_STATUS_SERVICE_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-status-service';
const FEEDBACK_STATUS_DATA_FACADE_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-feedback-status-data-facade';
const API_DB_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-api-db';
const API_DB_BRIDGE_MOCK_MODULE_URL = 'mock:gestor-feedback-status-patch-structural-api-db-bridge';

const ROUTE_HARNESS_STATE = {
  registrations: [],
  requireLogin: null,
  updateFeedbackStatusService: null,
  legacyFindFeedbackByIdAndUpdateSetNewLean: null,
  createStatusHandlerCalls: [],
  noopFactory: null,
  FakeMulterError: class FakeMulterError extends Error {},
};

const SERVICE_HARNESS_STATE = {
  repositoryResult: null,
  dataFacadeCalls: [],
};

globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__ = ROUTE_HARNESS_STATE;
globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_SERVICE_STATE__ = SERVICE_HARNESS_STATE;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'express') return { url: EXPRESS_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === 'multer') return { url: MULTER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '@vercel/blob') return { url: BLOB_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/middlewares/requireLogin.js') return { url: REQUIRE_LOGIN_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackDetailApiController.js') return { url: FEEDBACK_DETAIL_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackCreateApiController.js') return { url: FEEDBACK_CREATE_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackUploadApiController.js') return { url: FEEDBACK_UPLOAD_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackListApiController.js') return { url: FEEDBACK_LIST_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackMyDetailApiController.js') return { url: FEEDBACK_MY_DETAIL_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackMyListApiController.js') return { url: FEEDBACK_MY_LIST_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackDeleteApiController.js') return { url: FEEDBACK_DELETE_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackRespostaApiController.js') return { url: FEEDBACK_RESPOSTA_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/controllers/feedbackStatusApiController.js') return { url: FEEDBACK_STATUS_CONTROLLER_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/feedback/updateFeedbackStatus.service.js') return { url: FEEDBACK_STATUS_SERVICE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/data/feedback/feedbackStatusDataFacade.js') return { url: FEEDBACK_STATUS_DATA_FACADE_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/db/api.db.js') return { url: API_DB_MOCK_MODULE_URL, shortCircuit: true };
    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') return { url: API_DB_BRIDGE_MOCK_MODULE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === EXPRESS_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'function createFakeRouter(registrations) {',
          '  const router = {',
          '    get(routePath, ...handlers) { registrations.push({ method: "get", path: routePath, handlers }); return router; },',
          '    post(routePath, ...handlers) { registrations.push({ method: "post", path: routePath, handlers }); return router; },',
          '    patch(routePath, ...handlers) { registrations.push({ method: "patch", path: routePath, handlers }); return router; },',
          '    put(routePath, ...handlers) { registrations.push({ method: "put", path: routePath, handlers }); return router; },',
          '    delete(routePath, ...handlers) { registrations.push({ method: "delete", path: routePath, handlers }); return router; },',
          '  };',
          '  return router;',
          '}',
          'export default {',
          '  Router() { return createFakeRouter(state.registrations); },',
          '};',
        ].join('\n'),
      };
    }

    if (url === MULTER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'const multer = Object.assign(',
          '  () => ({ any: () => (_req, _res, next) => next() }),',
          '  {',
          '    memoryStorage: () => ({}),',
          '    MulterError: state.FakeMulterError,',
          '  },',
          ');',
          'export default multer;',
        ].join('\n'),
      };
    }

    if (url === BLOB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'export async function put() {}',
          'export async function del() {}',
        ].join('\n'),
      };
    }

    if (url === REQUIRE_LOGIN_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'export default state.requireLogin;',
        ].join('\n'),
      };
    }

    if ([
      FEEDBACK_DETAIL_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_CREATE_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_UPLOAD_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_LIST_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_MY_DETAIL_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_MY_LIST_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_DELETE_CONTROLLER_MOCK_MODULE_URL,
      FEEDBACK_RESPOSTA_CONTROLLER_MOCK_MODULE_URL,
    ].includes(url)) {
      const exportNameByUrl = {
        [FEEDBACK_DETAIL_CONTROLLER_MOCK_MODULE_URL]: 'createAdminFeedbackDetailHandler',
        [FEEDBACK_CREATE_CONTROLLER_MOCK_MODULE_URL]: 'createCreateFeedbackHandler',
        [FEEDBACK_UPLOAD_CONTROLLER_MOCK_MODULE_URL]: 'createUploadFeedbackAnexoHandler',
        [FEEDBACK_LIST_CONTROLLER_MOCK_MODULE_URL]: 'createAdminFeedbackListHandler',
        [FEEDBACK_MY_DETAIL_CONTROLLER_MOCK_MODULE_URL]: 'createMyFeedbackDetailHandler',
        [FEEDBACK_MY_LIST_CONTROLLER_MOCK_MODULE_URL]: 'createMyFeedbackListHandler',
        [FEEDBACK_DELETE_CONTROLLER_MOCK_MODULE_URL]: 'createDeleteFeedbackHandler',
        [FEEDBACK_RESPOSTA_CONTROLLER_MOCK_MODULE_URL]: 'createUpdateFeedbackRespostaHandler',
      };

      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          `export const ${exportNameByUrl[url]} = state.noopFactory;`,
        ].join('\n'),
      };
    }

    if (url === FEEDBACK_STATUS_CONTROLLER_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'export function createUpdateFeedbackStatusHandler(deps) {',
          '  state.createStatusHandlerCalls.push(deps);',
          '  const handler = function feedbackStatusHandler() {};',
          '  handler.deps = deps;',
          '  return handler;',
          '}',
        ].join('\n'),
      };
    }

    if (url === FEEDBACK_STATUS_SERVICE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'export const updateFeedbackStatusService = state.updateFeedbackStatusService;',
          'export default state.updateFeedbackStatusService;',
        ].join('\n'),
      };
    }

    if (url === FEEDBACK_STATUS_DATA_FACADE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_SERVICE_STATE__;',
          'export async function updateFeedbackStatusLeanData(...args) {',
          '  state.dataFacadeCalls.push(args);',
          '  return state.repositoryResult;',
          '}',
        ].join('\n'),
      };
    }

    if (url === API_DB_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;',
          'export async function createFeedback() {}',
          'export async function findFeedbackById() {}',
          'export async function saveFeedbackDoc() {}',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit200Lean() { return []; }',
          'export async function findFeedbackByIdLean() { return null; }',
          'export async function findFeedbackByFilterSortCreatedAtDescLimit500Lean() { return []; }',
          'export const findFeedbackByIdAndUpdateSetNewLean = state.legacyFindFeedbackByIdAndUpdateSetNewLean;',
          'export async function findFeedbackByIdAndDeleteLean() { return null; }',
        ].join('\n'),
      };
    }

    if (url === API_DB_BRIDGE_MOCK_MODULE_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_SERVICE_STATE__;',
          'export async function findFeedbackByIdAndUpdateSetNewLean(...args) {',
          '  state.bridgeCalls.push(args);',
          '  return state.repositoryResult;',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_ROUTE_STATE__;
  delete globalThis.__GESTOR_FEEDBACK_STATUS_PATCH_STRUCTURAL_SERVICE_STATE__;
});

function importFresh(filePath, token) {
  return import(`${pathToFileURL(filePath).href}?case=${token}`);
}

function createFakeRouter(registrations) {
  const router = {
    get(routePath, ...handlers) {
      registrations.push({ method: 'get', path: routePath, handlers });
      return router;
    },
    post(routePath, ...handlers) {
      registrations.push({ method: 'post', path: routePath, handlers });
      return router;
    },
    patch(routePath, ...handlers) {
      registrations.push({ method: 'patch', path: routePath, handlers });
      return router;
    },
    put(routePath, ...handlers) {
      registrations.push({ method: 'put', path: routePath, handlers });
      return router;
    },
    delete(routePath, ...handlers) {
      registrations.push({ method: 'delete', path: routePath, handlers });
      return router;
    },
  };

  return router;
}

function createNoopHandlerFactory() {
  return () => function noopHandler(_req, _res, next) {
    if (typeof next === 'function') next();
  };
}

test('PATCH canonico usa a nova service e POST alias permanece no mutador legado', async () => {
  ROUTE_HARNESS_STATE.registrations.length = 0;
  ROUTE_HARNESS_STATE.createStatusHandlerCalls.length = 0;

  const requireLogin = function requireLogin(_req, _res, next) {
    if (typeof next === 'function') next();
  };
  const updateFeedbackStatusService = async function updateFeedbackStatusService() {};
  const legacyFindFeedbackByIdAndUpdateSetNewLean = async function legacyFindFeedbackByIdAndUpdateSetNewLean() {};
  const noopFactory = createNoopHandlerFactory();

  ROUTE_HARNESS_STATE.requireLogin = requireLogin;
  ROUTE_HARNESS_STATE.updateFeedbackStatusService = updateFeedbackStatusService;
  ROUTE_HARNESS_STATE.legacyFindFeedbackByIdAndUpdateSetNewLean = legacyFindFeedbackByIdAndUpdateSetNewLean;
  ROUTE_HARNESS_STATE.noopFactory = noopFactory;

  await importFresh(ROUTE_FILE, 'route-structural-seam');

  const patchRegistration = ROUTE_HARNESS_STATE.registrations.find(
    (entry) => entry.method === 'patch' && entry.path === '/api/gestor/feedback/:feedbackId/status',
  );
  const postRegistration = ROUTE_HARNESS_STATE.registrations.find(
    (entry) => entry.method === 'post' && entry.path === '/api/gestor/feedback/:feedbackId/status',
  );

  assert.ok(patchRegistration, 'PATCH canônico de status deve permanecer registrado');
  assert.ok(postRegistration, 'POST alias de status deve permanecer registrado');
  assert.equal(patchRegistration.handlers[0], requireLogin);
  assert.equal(postRegistration.handlers[0], requireLogin);
  assert.equal(ROUTE_HARNESS_STATE.createStatusHandlerCalls.length, 2);
  assert.equal(
    patchRegistration.handlers[1].deps.findFeedbackByIdAndUpdateSetNewLean,
    updateFeedbackStatusService,
  );
  assert.equal(
    postRegistration.handlers[1].deps.findFeedbackByIdAndUpdateSetNewLean,
    legacyFindFeedbackByIdAndUpdateSetNewLean,
  );
});

test('service de status delega a data facade com payload intacto', async () => {
  SERVICE_HARNESS_STATE.repositoryResult = { _id: '507f1f77bcf86cd799439011', status: 'resolvido' };
  SERVICE_HARNESS_STATE.dataFacadeCalls.length = 0;

  const { updateFeedbackStatusService } = await importFresh(SERVICE_FILE, 'service-structural-seam');
  const result = await updateFeedbackStatusService('507f1f77bcf86cd799439011', { status: 'resolvido' });

  assert.deepEqual(SERVICE_HARNESS_STATE.dataFacadeCalls, [[
    '507f1f77bcf86cd799439011',
    { status: 'resolvido' },
  ]]);
  assert.equal(result, SERVICE_HARNESS_STATE.repositoryResult);
});