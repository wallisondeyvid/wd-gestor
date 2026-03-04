import express from 'express';
import { bustWidgetEnabledCache } from '#core/utils/widgetSettings.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';
import {
  findWidgetSettingsFeedbackLean,
  updateWidgetSettingsFeedbackModuleEnabledUpsert,
} from '#modules/gestor/app/db/api.db.js';

const router = express.Router();

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

// Cache simples para reduzir queries repetidas em páginas com muitos acessos
let cache = { at: 0, map: null };
const CACHE_TTL_MS = 30_000;

async function getVisibilityMapFresh() {
  const rows = await findWidgetSettingsFeedbackLean();
  /** @type {Record<string, boolean>} */
  const enabledByModule = {};
  for (const m of KNOWN_MODULES) enabledByModule[m.id] = true;
  for (const r of rows) {
    const mid = String(r?.module || '').trim();
    if (!mid) continue;
    enabledByModule[mid] = (r?.enabled !== false);
  }
  return enabledByModule;
}

async function getVisibilityMapCached() {
  const now = Date.now();
  if (cache.map && (now - cache.at) < CACHE_TTL_MS) return cache.map;
  const fresh = await getVisibilityMapFresh();
  cache = { at: now, map: fresh };
  return fresh;
}

function bustCache(){
  cache = { at: 0, map: null };
}

// Lista de módulos conhecidos
router.get('/api/gestor/widgets/modules', requireLogin, requireRole(['admin'], { allowMasterImplicit: true }), (req, res) => {
  return res.json({ ok: true, modules: KNOWN_MODULES });
});

// Mapa de visibilidade do widget de feedback (default: true)
// Opcional: ?module=<id> retorna somente 1
router.get('/api/gestor/widgets/feedback', requireLogin, async (req, res) => {
  try {
    const enabledByModule = await getVisibilityMapCached();
    const moduleQ = normalizeModuleIdFromInput(req.query?.module);
    if (moduleQ) {
      const key = moduleQ === 'portal_morador' ? 'portal-morador' : moduleQ;
      return res.json({ ok: true, module: key, enabled: enabledByModule[key] !== false });
    }
    return res.json({ ok: true, enabledByModule });
  } catch (e) {
    console.error('[widgetSettingsApi] GET feedback visibility erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao carregar configuração do widget.' });
  }
});

// Atualizar visibilidade (admin/master)
router.put('/api/gestor/widgets/feedback', requireLogin, requireRole(['admin'], { allowMasterImplicit: true }), async (req, res) => {
  try {
    const moduleRaw = normalizeModuleIdFromInput(req.body?.module);
    const enabled = !!req.body?.enabled;
    const moduleId = moduleRaw === 'portal_morador' ? 'portal-morador' : moduleRaw;

    if (!moduleId) return res.status(400).json({ ok: false, error: 'Módulo inválido.' });
    const exists = KNOWN_MODULES.some(m => m.id === moduleId);
    if (!exists) return res.status(400).json({ ok: false, error: 'Módulo não reconhecido.' });

    await updateWidgetSettingsFeedbackModuleEnabledUpsert(moduleId, enabled);

    bustCache();
    bustWidgetEnabledCache();
    const enabledByModule = await getVisibilityMapCached();
    return res.json({ ok: true, enabledByModule });
  } catch (e) {
    console.error('[widgetSettingsApi] PUT feedback visibility erro:', e);
    return res.status(500).json({ ok: false, error: 'Erro ao salvar configuração do widget.' });
  }
});

export default router;
