import { bustWidgetEnabledCache } from '#core/utils/widgetSettings.js';
import {
  bustFeedbackWidgetVisibilityReadCache,
  readFeedbackWidgetVisibilityPayload,
} from '#modules/gestor/app/services/widgetSettings/readFeedbackWidgetVisibility.service.js';
import { updateFeedbackWidgetVisibilityService } from '#modules/gestor/app/services/widgetSettings/updateFeedbackWidgetVisibility.service.js';

const KNOWN_MODULES = [
  { id: 'gestor', name: 'Gestor', basePath: '/gestor' },
  { id: 'clinica', name: 'Clínica', basePath: '/clinica' },
  { id: 'condominios', name: 'Condomínios', basePath: '/condominios' },
  { id: 'escalas', name: 'Escalas', basePath: '/escalas' },
  { id: 'portal-morador', name: 'Portal do Morador', basePath: '/portal-morador' },
];

function normalizeModuleIdFromInput(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s.replace(/^\/+/, '');
  return s;
}

function bustCache() {
  bustFeedbackWidgetVisibilityReadCache();
}

export function listWidgetModules(_req, res) {
  return res.json({ ok: true, modules: KNOWN_MODULES });
}

export async function getFeedbackWidgetVisibility(req, res) {
  try {
    const moduleQ = normalizeModuleIdFromInput(req.query?.module);
    const moduleId = moduleQ === 'portal_morador' ? 'portal-morador' : moduleQ;
    const payload = await readFeedbackWidgetVisibilityPayload(moduleId, { knownModules: KNOWN_MODULES });
    return res.json({ ok: true, ...payload });
  } catch (e) {
    console.error('[widgetSettingsApi] GET feedback visibility erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar configuração do widget.' });
  }
}

export async function updateFeedbackWidgetVisibility(req, res) {
  try {
    const moduleRaw = normalizeModuleIdFromInput(req.body?.module);
    const enabled = !!req.body?.enabled;
    const moduleId = moduleRaw === 'portal_morador' ? 'portal-morador' : moduleRaw;

    if (!moduleId) return res.status(400).json({ ok: false, error: 'Módulo inválido.' });
    const exists = KNOWN_MODULES.some((m) => m.id === moduleId);
    if (!exists) return res.status(400).json({ ok: false, error: 'Módulo não reconhecido.' });

    const enabledByModule = await updateFeedbackWidgetVisibilityService({
      moduleId,
      enabled,
      knownModules: KNOWN_MODULES,
    });

    bustCache();
    bustWidgetEnabledCache();
    return res.json({ ok: true, enabledByModule });
  } catch (e) {
    console.error('[widgetSettingsApi] PUT feedback visibility erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar configuração do widget.' });
  }
}
