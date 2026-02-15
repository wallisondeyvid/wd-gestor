function parseBool(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

export function loadFeatureFlagsFromEnv(defaults = {}) {
  const out = { ...defaults };

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('WDG_FLAG_')) continue;
    const rawName = key.slice('WDG_FLAG_'.length).trim();
    if (!rawName) continue;
    const flagName = rawName.toLowerCase();
    out[flagName] = parseBool(value, Boolean(out[flagName]));
  }

  if (process.env.ENABLE_ESCALAS !== undefined) {
    out.escalas = parseBool(process.env.ENABLE_ESCALAS, Boolean(out.escalas));
  }

  return out;
}

export function isFeatureEnabled(featureFlags, name, fallback = false) {
  if (!featureFlags || typeof featureFlags !== 'object') return fallback;
  return parseBool(featureFlags[String(name || '').toLowerCase()], fallback);
}

export function isFlagEnabled(name, fallback = false) {
  const flags = loadFeatureFlagsFromEnv({});
  return isFeatureEnabled(flags, name, fallback);
}
