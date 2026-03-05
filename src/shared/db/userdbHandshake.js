import mongoose from 'mongoose';
import { registerTrackedConnection } from '#shared/db/connectionFactory.js';

const tenantCacheByConnection = new Map();

function isMultiDbEnabled() {
  const raw = String(process.env.WD_MULTI_DB || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function normalizeUnidadeId(unidadeId) {
  if (unidadeId === null || unidadeId === undefined) return null;
  const normalized = String(unidadeId).trim();
  if (!normalized) return null;
  if (!mongoose.isValidObjectId(normalized)) return null;
  return normalized;
}

function resolveDbName(connection, fallback = null) {
  return (
    connection?.name
    || connection?.db?.databaseName
    || fallback
    || null
  );
}

function getCacheForConnection(baseConnection) {
  if (!tenantCacheByConnection.has(baseConnection)) {
    tenantCacheByConnection.set(baseConnection, new Map());
  }

  return tenantCacheByConnection.get(baseConnection);
}

async function probeConnection(connection) {
  const nativeDb = connection?.db;

  if (!nativeDb) {
    return { ok: false, error: 'DB_HANDLE_UNAVAILABLE' };
  }

  if (typeof nativeDb.admin === 'function') {
    const admin = nativeDb.admin();
    if (admin && typeof admin.ping === 'function') {
      await admin.ping();
      return { ok: true };
    }
  }

  if (typeof nativeDb.listCollections === 'function') {
    const cursor = nativeDb.listCollections({}, { nameOnly: true });
    if (cursor && typeof cursor.limit === 'function') {
      await cursor.limit(1).toArray();
    } else if (cursor && typeof cursor.toArray === 'function') {
      await cursor.toArray();
    }
    return { ok: true };
  }

  return { ok: true };
}

export async function userDbHandshake(baseConnection, unidadeId) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
  const globalDbName = resolveDbName(baseConnection);

  if (!baseConnection) {
    return {
      ok: false,
      unidadeId: normalizedUnidadeId,
      dbName: null,
      mode: 'global',
      error: 'BASE_CONNECTION_REQUIRED',
    };
  }

  if (!isMultiDbEnabled() || !normalizedUnidadeId) {
    return {
      ok: true,
      unidadeId: normalizedUnidadeId,
      dbName: globalDbName,
      mode: 'global',
    };
  }

  const dbName = `wdgestor_unit_${normalizedUnidadeId}`;

  try {
    const cache = getCacheForConnection(baseConnection);
    let tenantConnection = cache.get(dbName);

    if (!tenantConnection) {
      if (typeof baseConnection.useDb !== 'function') {
        return {
          ok: false,
          unidadeId: normalizedUnidadeId,
          dbName,
          mode: 'tenant',
          error: 'BASE_CONNECTION_USEDB_UNAVAILABLE',
        };
      }

      tenantConnection = registerTrackedConnection(
        baseConnection.useDb(dbName, { useCache: true }),
        { kind: 'tenant', dbName, parentConnection: baseConnection }
      );
      cache.set(dbName, tenantConnection);
    }

    const probe = await probeConnection(tenantConnection);
    if (!probe.ok) {
      return {
        ok: false,
        unidadeId: normalizedUnidadeId,
        dbName,
        mode: 'tenant',
        error: probe.error || 'USERDB_HANDSHAKE_FAILED',
      };
    }

    return {
      ok: true,
      unidadeId: normalizedUnidadeId,
      dbName: resolveDbName(tenantConnection, dbName),
      mode: 'tenant',
    };
  } catch (error) {
    return {
      ok: false,
      unidadeId: normalizedUnidadeId,
      dbName,
      mode: 'tenant',
      error: String(error?.message || error || 'USERDB_HANDSHAKE_FAILED'),
    };
  }
}

export function clearUserDbHandshakeCache() {
  tenantCacheByConnection.clear();
}

export default userDbHandshake;
