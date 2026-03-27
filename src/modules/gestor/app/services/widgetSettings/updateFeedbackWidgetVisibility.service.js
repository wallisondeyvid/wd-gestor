import {
  findWidgetSettingsFeedbackLeanRepo,
  updateWidgetSettingsFeedbackModuleEnabledUpsertRepo,
} from '#modules/gestor/app/repositories/WidgetSettingWriteRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

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
  await updateWidgetSettingsFeedbackModuleEnabledUpsertRepo({
    unitScope: GLOBAL_SCOPE,
    moduleId,
    enabled,
  });

  const rows = await findWidgetSettingsFeedbackLeanRepo({ unitScope: GLOBAL_SCOPE });

  return buildEnabledByModule({
    knownModules: Array.isArray(knownModules) ? knownModules : [],
    rows: Array.isArray(rows) ? rows : [],
  });
}

export default updateFeedbackWidgetVisibilityService;