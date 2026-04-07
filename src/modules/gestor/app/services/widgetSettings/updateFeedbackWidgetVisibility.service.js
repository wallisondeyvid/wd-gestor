import {
  findWidgetSettingsFeedbackLean,
  updateWidgetSettingsFeedbackModuleEnabledUpsert,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function buildEnabledByModule({ knownModules, rows }) {
  const enabledByModule = {};

  for (const moduleDef of knownModules) {
    enabledByModule[moduleDef.id] = true;
  }

  for (const row of rows) {
    const moduleId = String(row?.module || '').trim();
    if (!moduleId) continue;
    enabledByModule[moduleId] = row?.enabled !== false;
  }

  return enabledByModule;
}

export async function updateFeedbackWidgetVisibilityService({ moduleId, enabled, knownModules }) {
  await updateWidgetSettingsFeedbackModuleEnabledUpsert(moduleId, enabled);

  const rows = await findWidgetSettingsFeedbackLean();

  return buildEnabledByModule({
    knownModules: Array.isArray(knownModules) ? knownModules : [],
    rows: Array.isArray(rows) ? rows : [],
  });
}

export default updateFeedbackWidgetVisibilityService;