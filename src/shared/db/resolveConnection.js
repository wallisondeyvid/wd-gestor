import { getConnectionForUnit, registerTrackedConnection } from '#shared/db/connectionFactory.js';

const dbCache = new Map();

function isMultiDbEnabled() {
  const raw = String(process.env.WD_MULTI_DB || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export function resolveConnection(unitScope) {
  const unidadeId =
    unitScope?.unidadeId ??
    unitScope?.unit?.unidadeId ??
    null;

  const baseConnection = getConnectionForUnit(null);

  if (!isMultiDbEnabled()) {
    return baseConnection;
  }

  if (!unidadeId) {
    return baseConnection;
  }

  const dbName = `wdgestor_unit_${unidadeId}`;

  if (dbCache.has(dbName)) {
    return dbCache.get(dbName);
  }

  const tenantDb = registerTrackedConnection(
    baseConnection.useDb(dbName, { useCache: true }),
    { kind: 'tenant', dbName, parentConnection: baseConnection }
  );
  dbCache.set(dbName, tenantDb);

  return tenantDb;
}

export function clearResolveConnectionCache() {
  dbCache.clear();
}
