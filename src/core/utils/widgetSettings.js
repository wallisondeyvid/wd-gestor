import mongoose from 'mongoose';
import WidgetSetting from '../models/widgetSetting.js';

const CACHE_TTL_MS = 30000;
/** @type {Map<string, { at: number, enabled: boolean }>} */
const cache = new Map();

function normalizeModuleId(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s === 'portal_morador') return 'portal-morador';
  return s;
}

export async function isWidgetEnabledCached(widget, moduleId, defaultEnabled = true) {
  const w = String(widget || '').trim();
  const m = normalizeModuleId(moduleId);
  if (!w || !m) return !!defaultEnabled;

  const key = `${w}:${m}`;
  const now = Date.now();

  // Sem DB: não “muda sozinho”. Se já existe um valor em cache (lido do DB antes), use-o.
  // Caso contrário, cai no default para evitar quebrar páginas em ambientes sem DB.
  if (mongoose.connection.readyState !== 1) {
    const hit = cache.get(key);
    if (hit) return hit.enabled;
    return !!defaultEnabled;
  }
  const hit = cache.get(key);
  if (hit && (now - hit.at) < CACHE_TTL_MS) return hit.enabled;

  const row = await WidgetSetting.findOne({ widget: w, module: m }).lean();
  const enabled = row ? (row.enabled !== false) : !!defaultEnabled;
  cache.set(key, { at: now, enabled });
  return enabled;
}

export function bustWidgetEnabledCache() {
  cache.clear();
}
