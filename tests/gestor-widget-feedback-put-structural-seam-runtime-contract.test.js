import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/widgetSettingsApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js')).href;

const serviceMockModuleUrl = 'mock:gestor-widget-feedback-put-service';
const repositoryMockModuleUrl = 'mock:gestor-widget-feedback-put-repository';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/WidgetSettingWriteRepository.js') {
      return { url: repositoryMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === serviceMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_SERVICE_MOCKS__ || {};",
          "export async function updateFeedbackWidgetVisibilityService(...args) {",
          "  const fn = getMocks().updateFeedbackWidgetVisibilityService;",
          "  if (typeof fn !== 'function') throw new Error('updateFeedbackWidgetVisibilityService mock ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    if (url === repositoryMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_REPOSITORY_MOCKS__ || {};",
          "export async function findWidgetSettingsFeedbackLeanRepo(...args) {",
          "  const fn = getMocks().findWidgetSettingsFeedbackLeanRepo;",
          "  if (typeof fn !== 'function') throw new Error('findWidgetSettingsFeedbackLeanRepo mock ausente');",
          "  return await fn(...args);",
          "}",
          "export async function updateWidgetSettingsFeedbackModuleEnabledUpsertRepo(...args) {",
          "  const fn = getMocks().updateWidgetSettingsFeedbackModuleEnabledUpsertRepo;",
          "  if (typeof fn !== 'function') throw new Error('updateWidgetSettingsFeedbackModuleEnabledUpsertRepo mock ausente');",
          "  return await fn(...args);",
          "}",
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

const ownerState = {
  serviceCalls: [],
  bustCalls: 0,
};

const serviceState = {
  repositoryCalls: [],
};

mock.module('#core/utils/widgetSettings.js', {
  namedExports: {
    bustWidgetEnabledCache() {
      ownerState.bustCalls += 1;
    },
  },
});

mock.module('#modules/gestor/app/services/apiDbBridgeService.js', {
  namedExports: {
    async findWidgetSettingsFeedbackLean() {
      throw new Error('findWidgetSettingsFeedbackLean nao deveria ser chamado no caminho principal do PUT');
    },
  },
});

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_SERVICE_MOCKS__ = { ...overrides };
}

function setRepositoryMocks(overrides = {}) {
  globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_REPOSITORY_MOCKS__ = { ...overrides };
}

function resetState() {
  ownerState.serviceCalls.length = 0;
  ownerState.bustCalls = 0;
  serviceState.repositoryCalls.length = 0;
}

function createResCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
  };
}

async function importWidgetSettingsController(tag) {
  return import(`${controllerModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

async function importUpdateFeedbackWidgetVisibilityService(tag) {
  return import(`${serviceModuleUrl}?case=${encodeURIComponent(tag)}-${Date.now()}`);
}

after(() => {
  mock.restoreAll();
  delete globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_SERVICE_MOCKS__;
  delete globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_REPOSITORY_MOCKS__;
});

test('updateFeedbackWidgetVisibility usa o service fino como caminho principal do PUT e preserva alias, coercao, bust de cache e shape HTTP', async () => {
  resetState();

  setServiceMocks({
    updateFeedbackWidgetVisibilityService: async (args) => {
      ownerState.serviceCalls.push(JSON.parse(JSON.stringify(args)));
      return {
        gestor: true,
        'portal-morador': true,
      };
    },
  });

  const { updateFeedbackWidgetVisibility } = await importWidgetSettingsController('owner-success');
  const req = {
    body: {
      module: 'portal_morador',
      enabled: 'false',
    },
  };
  const res = createResCapture();

  await updateFeedbackWidgetVisibility(req, res);

  assert.equal(ownerState.serviceCalls.length, 1);
  assert.equal(ownerState.serviceCalls[0].moduleId, 'portal-morador');
  assert.equal(ownerState.serviceCalls[0].enabled, true);
  assert.deepEqual(
    ownerState.serviceCalls[0].knownModules.map((moduleDef) => moduleDef.id),
    ['gestor', 'clinica', 'condominios', 'escalas', 'portal-morador'],
  );
  assert.equal(ownerState.bustCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    enabledByModule: {
      gestor: true,
      'portal-morador': true,
    },
  });
});

test('updateFeedbackWidgetVisibilityService faz upsert e readback direto via repository global para montar o mapa final', async () => {
  resetState();

  setRepositoryMocks({
    updateWidgetSettingsFeedbackModuleEnabledUpsertRepo: async (args) => {
      serviceState.repositoryCalls.push({ op: 'updateWidgetSettingsFeedbackModuleEnabledUpsertRepo', args });
      return { acknowledged: true };
    },
    findWidgetSettingsFeedbackLeanRepo: async (args) => {
      serviceState.repositoryCalls.push({ op: 'findWidgetSettingsFeedbackLeanRepo', args });
      return [
        { widget: 'feedback', module: 'gestor', enabled: false },
        { widget: 'feedback', module: 'portal-morador', enabled: true },
      ];
    },
  });

  const { updateFeedbackWidgetVisibilityService } = await importUpdateFeedbackWidgetVisibilityService('service-success');
  const result = await updateFeedbackWidgetVisibilityService({
    moduleId: 'gestor',
    enabled: false,
    knownModules: [
      { id: 'gestor' },
      { id: 'clinica' },
      { id: 'portal-morador' },
    ],
  });

  assert.equal(serviceState.repositoryCalls.length, 2);
  assert.equal(serviceState.repositoryCalls[0].op, 'updateWidgetSettingsFeedbackModuleEnabledUpsertRepo');
  assert.equal(serviceState.repositoryCalls[1].op, 'findWidgetSettingsFeedbackLeanRepo');
  assert.deepEqual(serviceState.repositoryCalls[0].args, {
    unitScope: { type: 'global', unidadeId: null },
    moduleId: 'gestor',
    enabled: false,
  });
  assert.deepEqual(serviceState.repositoryCalls[1].args, {
    unitScope: { type: 'global', unidadeId: null },
  });
  assert.deepEqual(result, {
    gestor: false,
    clinica: true,
    'portal-morador': true,
  });
});