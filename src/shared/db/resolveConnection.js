import { getConnectionForUnit, registerTrackedConnection } from '#shared/db/connectionFactory.js';
import { userDbHandshake } from '#shared/db/userdbHandshake.js';

const dbCache = new Map();
const handshakeCache = new Set();

function isMultiDbEnabled() {
  const raw = String(process.env.WD_MULTI_DB || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isUserDbHandshakeEnabled() {
  const raw = String(process.env.WD_USERDB_HANDSHAKE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isValidUnidadeId(unidadeId) {
  const normalized = String(unidadeId || '').trim();
  return /^[a-f\d]{24}$/i.test(normalized);
}

function runUserDbHandshakeSafe(baseConnection, unidadeId, dbName) {
  if (!isUserDbHandshakeEnabled()) return;
  if (!isValidUnidadeId(unidadeId)) return;
  if (handshakeCache.has(dbName)) return;

  handshakeCache.add(dbName);

  void userDbHandshake(baseConnection, unidadeId)
    .then((result) => {
      if (!result?.ok) {
        console.warn('[resolveConnection] userdb handshake falhou', {
          unidadeId,
          dbName,
          mode: result?.mode,
          error: result?.error || 'USERDB_HANDSHAKE_FAILED',
        });
      }
    })
    .catch((error) => {
      console.warn('[resolveConnection] userdb handshake erro não-bloqueante', {
        unidadeId,
        dbName,
        error: String(error?.message || error || 'USERDB_HANDSHAKE_ERROR'),
      });
    });
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
    const cachedConnection = dbCache.get(dbName);
    runUserDbHandshakeSafe(baseConnection, unidadeId, dbName);
    return cachedConnection;
  }

  const tenantDb = registerTrackedConnection(
    baseConnection.useDb(dbName, { useCache: true }),
    { kind: 'tenant', dbName, parentConnection: baseConnection }
  );
  dbCache.set(dbName, tenantDb);
  runUserDbHandshakeSafe(baseConnection, unidadeId, dbName);

  return tenantDb;
}

export function clearResolveConnectionCache() {
  dbCache.clear();
  handshakeCache.clear();
}
