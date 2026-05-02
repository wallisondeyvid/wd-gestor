import { primeUnitDatabaseRegistryCache } from '#shared/db/unitDatabaseRegistry.js';

let primeUnitDatabaseRegistryCacheOverride = null;

function createEmptyReport() {
  return {
    loaded: [],
    missing: [],
    failed: [],
    skipped: [],
  };
}

function normalizeUnidadeId(unidadeId) {
  const normalized = String(unidadeId || '').trim();
  return normalized || null;
}

function isValidUnidadeId(unidadeId) {
  return /^[a-f\d]{24}$/i.test(unidadeId);
}

function getPrimeUnitDatabaseRegistryCache() {
  return typeof primeUnitDatabaseRegistryCacheOverride === 'function'
    ? primeUnitDatabaseRegistryCacheOverride
    : primeUnitDatabaseRegistryCache;
}

export async function preloadUnitDatabaseRegistryForUnits({ unidadeIds } = {}) {
  const report = createEmptyReport();
  if (!Array.isArray(unidadeIds)) {
    return report;
  }

  const primeRegistryCache = getPrimeUnitDatabaseRegistryCache();
  const knownUnitIds = new Set();

  for (const rawUnidadeId of unidadeIds) {
    const unidadeId = normalizeUnidadeId(rawUnidadeId);
    if (!unidadeId || !isValidUnidadeId(unidadeId)) {
      report.skipped.push(rawUnidadeId);
      continue;
    }

    if (knownUnitIds.has(unidadeId)) {
      report.skipped.push(rawUnidadeId);
      continue;
    }

    knownUnitIds.add(unidadeId);

    try {
      const entry = await primeRegistryCache({ unidadeId });
      if (entry) {
        report.loaded.push(unidadeId);
      } else {
        report.missing.push(unidadeId);
      }
    } catch (error) {
      report.failed.push({
        unidadeId,
        error: String(error?.message || error || 'UNIT_DATABASE_REGISTRY_PRELOAD_FAILED'),
      });
    }
  }

  return report;
}

export function __setPrimeUnitDatabaseRegistryCacheForTests(fn) {
  primeUnitDatabaseRegistryCacheOverride = typeof fn === 'function' ? fn : null;
}

export function __resetPrimeUnitDatabaseRegistryCacheForTests() {
  primeUnitDatabaseRegistryCacheOverride = null;
}