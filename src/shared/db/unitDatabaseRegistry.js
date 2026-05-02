import { readUnitDatabaseRegistryFromBase } from '#shared/db/unitDatabaseRegistryReader.js';

const registryCache = new Map();

let registryReaderOverride = null;

function normalizeUnidadeId(unidadeId) {
  const normalized = String(unidadeId || '').trim();
  return normalized || null;
}

export function readUnitDatabaseRegistry({ unidadeId } = {}) {
  if (typeof registryReaderOverride === 'function') {
    return registryReaderOverride({ unidadeId });
  }

  const cacheKey = normalizeUnidadeId(unidadeId);
  if (!cacheKey) return null;

  return registryCache.get(cacheKey) || null;
}

export async function primeUnitDatabaseRegistryCache({ unidadeId, connection } = {}) {
  const cacheKey = normalizeUnidadeId(unidadeId);
  if (!cacheKey) {
    return null;
  }

  const entry = await readUnitDatabaseRegistryFromBase({
    unidadeId: cacheKey,
    connection,
  });

  if (!entry) {
    registryCache.delete(cacheKey);
    return null;
  }

  registryCache.set(cacheKey, entry);
  return entry;
}

export function setUnitDatabaseRegistryCacheEntry({ unidadeId, entry } = {}) {
  const cacheKey = normalizeUnidadeId(unidadeId) || normalizeUnidadeId(entry?.unidadeId);
  if (!cacheKey) return null;

  if (!entry) {
    registryCache.delete(cacheKey);
    return null;
  }

  registryCache.set(cacheKey, entry);
  return entry;
}

export function clearUnitDatabaseRegistryCache() {
  registryCache.clear();
}

export function __setUnitDatabaseRegistryReaderForTests(reader) {
  registryReaderOverride = typeof reader === 'function' ? reader : null;
}

export function __resetUnitDatabaseRegistryReaderForTests() {
  registryReaderOverride = null;
}