import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const projectRoot = process.cwd();
const controllerModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/controllers/widgetSettingsApiController.js')).href;
const serviceModuleUrl = pathToFileURL(path.join(projectRoot, 'src/modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js')).href;

const serviceMockModuleUrl = 'mock:gestor-widget-feedback-put-service';
const bridgeMockModuleUrl = 'mock:gestor-widget-feedback-put-bridge';
const widgetSettingsMockModuleUrl = 'mock:gestor-widget-feedback-put-widget-settings';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#core/utils/widgetSettings.js') {
      return { url: widgetSettingsMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js') {
      return { url: serviceMockModuleUrl, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: bridgeMockModuleUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === widgetSettingsMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_WIDGET_SETTINGS_MOCKS__ || {};",
          "export function bustWidgetEnabledCache(...args) {",
          "  const fn = getMocks().bustWidgetEnabledCache;",
          "  if (typeof fn !== 'function') return undefined;",
          "  return fn(...args);",
          "}",
        ].join('\n'),
      };
    }

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

    if (url === bridgeMockModuleUrl) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          "const getMocks = () => globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_BRIDGE_MOCKS__ || {};",
          "export async function findWidgetSettingsFeedbackLean(...args) {",
          "  const fn = getMocks().findWidgetSettingsFeedbackLean;",
          "  if (typeof fn !== 'function') throw new Error('findWidgetSettingsFeedbackLean mock ausente');",
          "  return await fn(...args);",
          "}",
          "export async function updateWidgetSettingsFeedbackModuleEnabledUpsert(...args) {",
          "  const fn = getMocks().updateWidgetSettingsFeedbackModuleEnabledUpsert;",
          "  if (typeof fn !== 'function') throw new Error('updateWidgetSettingsFeedbackModuleEnabledUpsert mock ausente');",
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

function setWidgetSettingsMocks(overrides = {}) {
  globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_WIDGET_SETTINGS_MOCKS__ = { ...overrides };
}

function setServiceMocks(overrides = {}) {
  globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_SERVICE_MOCKS__ = { ...overrides };
}

function setBridgeMocks(overrides = {}) {
  globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_BRIDGE_MOCKS__ = { ...overrides };
}

function resetState() {
  ownerState.serviceCalls.length = 0;
  ownerState.bustCalls = 0;
  serviceState.repositoryCalls.length = 0;
}

setWidgetSettingsMocks({
  bustWidgetEnabledCache() {
    ownerState.bustCalls += 1;
  },
});

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
  delete globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_WIDGET_SETTINGS_MOCKS__;
  delete globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_SERVICE_MOCKS__;
  delete globalThis.__GESTOR_WIDGET_FEEDBACK_PUT_BRIDGE_MOCKS__;
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

test('updateFeedbackWidgetVisibilityService faz upsert e readback via bridge global para montar o mapa final', async () => {
  resetState();

  setBridgeMocks({
    updateWidgetSettingsFeedbackModuleEnabledUpsert: async (moduleId, enabled) => {
      serviceState.repositoryCalls.push({ op: 'updateWidgetSettingsFeedbackModuleEnabledUpsert', moduleId, enabled });
      return { acknowledged: true };
    },
    findWidgetSettingsFeedbackLean: async () => {
      serviceState.repositoryCalls.push({ op: 'findWidgetSettingsFeedbackLean' });
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
  assert.deepEqual(serviceState.repositoryCalls[0], {
    op: 'updateWidgetSettingsFeedbackModuleEnabledUpsert',
    moduleId: 'gestor',
    enabled: false,
  });
  assert.deepEqual(serviceState.repositoryCalls[1], {
    op: 'findWidgetSettingsFeedbackLean',
  });
  assert.deepEqual(result, {
    gestor: false,
    clinica: true,
    'portal-morador': true,
  });
});