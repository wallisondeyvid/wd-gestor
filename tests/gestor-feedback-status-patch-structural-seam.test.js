import assert from 'node:assert/strict';
import path from 'node:path';
import test, { mock } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROUTE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/routes/feedbackApi.js');
const SERVICE_FILE = path.resolve(process.cwd(), 'src/modules/gestor/app/services/feedback/updateFeedbackStatus.service.js');

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
  mock.reset();

  const registrations = [];
  const fakeRouter = createFakeRouter(registrations);
  const requireLogin = function requireLogin(_req, _res, next) {
    if (typeof next === 'function') next();
  };
  const updateFeedbackStatusService = async function updateFeedbackStatusService() {};
  const legacyFindFeedbackByIdAndUpdateSetNewLean = async function legacyFindFeedbackByIdAndUpdateSetNewLean() {};
  const createStatusHandlerCalls = [];
  const noopFactory = createNoopHandlerFactory();

  class FakeMulterError extends Error {}

  await mock.module('express', {
    defaultExport: {
      Router: () => fakeRouter,
    },
  });

  await mock.module('multer', {
    defaultExport: Object.assign(
      () => ({ any: () => (_req, _res, next) => next() }),
      {
        memoryStorage: () => ({}),
        MulterError: FakeMulterError,
      },
    ),
  });

  await mock.module('@vercel/blob', {
    namedExports: {
      put: async () => {},
      del: async () => {},
    },
  });

  await mock.module('#modules/gestor/app/middlewares/requireLogin.js', {
    defaultExport: requireLogin,
  });

  await mock.module('#modules/gestor/app/controllers/feedbackDetailApiController.js', {
    namedExports: { createAdminFeedbackDetailHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackCreateApiController.js', {
    namedExports: { createCreateFeedbackHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackUploadApiController.js', {
    namedExports: { createUploadFeedbackAnexoHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackListApiController.js', {
    namedExports: { createAdminFeedbackListHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackMyDetailApiController.js', {
    namedExports: { createMyFeedbackDetailHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackMyListApiController.js', {
    namedExports: { createMyFeedbackListHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackDeleteApiController.js', {
    namedExports: { createDeleteFeedbackHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackRespostaApiController.js', {
    namedExports: { createUpdateFeedbackRespostaHandler: noopFactory },
  });
  await mock.module('#modules/gestor/app/controllers/feedbackStatusApiController.js', {
    namedExports: {
      createUpdateFeedbackStatusHandler: (deps) => {
        createStatusHandlerCalls.push(deps);
        const handler = function feedbackStatusHandler() {};
        handler.deps = deps;
        return handler;
      },
    },
  });

  await mock.module('#modules/gestor/app/services/feedback/updateFeedbackStatus.service.js', {
    namedExports: {
      updateFeedbackStatusService,
    },
    defaultExport: updateFeedbackStatusService,
  });

  await mock.module('#modules/gestor/app/db/api.db.js', {
    namedExports: {
      createFeedback: async () => {},
      findFeedbackById: async () => {},
      saveFeedbackDoc: async () => {},
      findFeedbackByFilterSortCreatedAtDescLimit200Lean: async () => [],
      findFeedbackByIdLean: async () => null,
      findFeedbackByFilterSortCreatedAtDescLimit500Lean: async () => [],
      findFeedbackByIdAndUpdateSetNewLean: legacyFindFeedbackByIdAndUpdateSetNewLean,
      findFeedbackByIdAndDeleteLean: async () => null,
    },
  });

  await importFresh(ROUTE_FILE, 'route-structural-seam');

  const patchRegistration = registrations.find(
    (entry) => entry.method === 'patch' && entry.path === '/api/gestor/feedback/:feedbackId/status',
  );
  const postRegistration = registrations.find(
    (entry) => entry.method === 'post' && entry.path === '/api/gestor/feedback/:feedbackId/status',
  );

  assert.ok(patchRegistration, 'PATCH canônico de status deve permanecer registrado');
  assert.ok(postRegistration, 'POST alias de status deve permanecer registrado');
  assert.equal(patchRegistration.handlers[0], requireLogin);
  assert.equal(postRegistration.handlers[0], requireLogin);
  assert.equal(createStatusHandlerCalls.length, 2);
  assert.equal(
    patchRegistration.handlers[1].deps.findFeedbackByIdAndUpdateSetNewLean,
    updateFeedbackStatusService,
  );
  assert.equal(
    postRegistration.handlers[1].deps.findFeedbackByIdAndUpdateSetNewLean,
    legacyFindFeedbackByIdAndUpdateSetNewLean,
  );
});

test('service de status delega ao repositorio com escopo global e payload intacto', async () => {
  mock.reset();

  const globalScope = { scope: 'global-feedback-status' };
  const repositoryResult = { _id: '507f1f77bcf86cd799439011', status: 'resolvido' };
  const createUnitScopeCalls = [];
  const repositoryCalls = [];

  await mock.module('#shared/unitScope.js', {
    namedExports: {
      createUnitScope: (input) => {
        createUnitScopeCalls.push(input);
        return globalScope;
      },
    },
  });

  await mock.module('#modules/gestor/app/repositories/FeedbackReadRepository.js', {
    namedExports: {
      findFeedbackByIdAndUpdateSetNewLeanRepo: async (input) => {
        repositoryCalls.push(input);
        return repositoryResult;
      },
    },
  });

  const { updateFeedbackStatusService } = await importFresh(SERVICE_FILE, 'service-structural-seam');
  const result = await updateFeedbackStatusService('507f1f77bcf86cd799439011', { status: 'resolvido' });

  assert.deepEqual(createUnitScopeCalls, [{}]);
  assert.deepEqual(repositoryCalls, [
    {
      unitScope: globalScope,
      id: '507f1f77bcf86cd799439011',
      setData: { status: 'resolvido' },
    },
  ]);
  assert.equal(result, repositoryResult);
});