import {
  findWidgetSettingsFeedbackLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

const CACHE_TTL_MS = 30_000;

let cache = { at: 0, map: null };

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

async function getVisibilityMapFresh({ knownModules }) {
  const rows = await findWidgetSettingsFeedbackLean();

  return buildEnabledByModule({
    knownModules: Array.isArray(knownModules) ? knownModules : [],
    rows: Array.isArray(rows) ? rows : [],
  });
}

async function getVisibilityMapCached({ knownModules }) {
  const now = Date.now();
  if (cache.map && (now - cache.at) < CACHE_TTL_MS) return cache.map;

  const fresh = await getVisibilityMapFresh({ knownModules });
  cache = { at: now, map: fresh };
  return fresh;
}

export async function readFeedbackWidgetVisibilityPayload(moduleId = '', options) {
  const knownModules = options?.knownModules;
  const enabledByModule = await getVisibilityMapCached({ knownModules });

  if (moduleId) {
    return { module: moduleId, enabled: enabledByModule[moduleId] !== false };
  }

  return { enabledByModule };
}

export function bustFeedbackWidgetVisibilityReadCache() {
  cache = { at: 0, map: null };
}

export default readFeedbackWidgetVisibilityPayload;