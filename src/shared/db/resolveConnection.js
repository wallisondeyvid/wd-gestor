import { getConnectionForUnit } from '#shared/db/connectionFactory.js';

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

  const tenantDb = baseConnection.useDb(dbName, { useCache: true });
  dbCache.set(dbName, tenantDb);

  return tenantDb;
}
