import {
  getConnectionForUnit,
  getConnectionTrackerDiagnostics,
  registerTrackedConnection,
  releaseTrackedTenantConnection,
} from '#shared/db/connectionFactory.js';
import { readUnitDatabaseRegistry } from '#shared/db/unitDatabaseRegistry.js';
import { userDbHandshake } from '#shared/db/userdbHandshake.js';

const dbCache = new Map();
const pendingConnections = new Map();
const handshakeCache = new Set();
const handshakeStatsByUnit = new Map();
const HANDSHAKE_STATS_MAX_UNITS = 1000;
const HANDSHAKE_SUMMARY_EVERY = 25;
const HANDSHAKE_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TENANT_CONNECTIONS = 120;
const MAX_HANDSHAKE_CACHE_SIZE = Math.max(MAX_TENANT_CONNECTIONS * 2, 240);
const MAX_CONNECTION_CREATION = Number(process.env.WD_MAX_CONNECTION_CREATION || 5);
const CONNECTION_CREATION_WAIT_MS = 10;
const CONNECTION_CREATION_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

let activeCreations = 0;

const handshakeSummaryState = {
  success: 0,
  failure: 0,
  sinceLastReport: 0,
  lastReportAt: Date.now(),
};

const routingStats = {
  global: 0,
  tenant: 0,
};

const routingSummaryState = {
  sinceLastReport: 0,
  lastReportAt: Date.now(),
};

function isMultiDbEnabled() {
  const raw = String(process.env.WD_MULTI_DB || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isTenantDbAllowedForUnit(unidadeId) {
  const unitKey = String(unidadeId || '').trim().toLowerCase();
  if (!unitKey) return false;

  const rawAllowlist = String(process.env.WD_MULTI_DB_ALLOWLIST || '');
  const allowlist = rawAllowlist
    .split(',')
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return false;
  return allowlist.includes(unitKey);
}

function isUserDbHandshakeEnabled() {
  const raw = String(process.env.WD_USERDB_HANDSHAKE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isMultiDbRegistryReadEnabled() {
  const raw = String(process.env.WD_MULTI_DB_REGISTRY_READ || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isRegistryEntryReady(registryEntry) {
  return registryEntry?.readiness?.ready === true;
}

function isRegistryEntryActive(registryEntry) {
  return registryEntry?.activation?.active === true;
}

function isValidUnidadeId(unidadeId) {
  const normalized = String(unidadeId || '').trim();
  return /^[a-f\d]{24}$/i.test(normalized);
}

function ensureHandshakeStatsCapacity() {
  if (handshakeStatsByUnit.size < HANDSHAKE_STATS_MAX_UNITS) return;
  const oldestUnit = handshakeStatsByUnit.keys().next().value;
  if (oldestUnit) handshakeStatsByUnit.delete(oldestUnit);
}

function maybeLogHandshakeSummary() {
  if (handshakeSummaryState.sinceLastReport === 0) return;

  const now = Date.now();
  const shouldLogByCount = handshakeSummaryState.sinceLastReport >= HANDSHAKE_SUMMARY_EVERY;
  const shouldLogByTime = (now - handshakeSummaryState.lastReportAt) >= HANDSHAKE_SUMMARY_INTERVAL_MS;
  if (!shouldLogByCount && !shouldLogByTime) return;

  let failedUnits = 0;
  const topFailingUnits = [];
  for (const [unidadeId, unitStats] of handshakeStatsByUnit.entries()) {
    if (!unitStats || unitStats.failure <= 0) continue;
    failedUnits += 1;
    topFailingUnits.push({ unidadeId, failure: unitStats.failure });
  }

  topFailingUnits.sort((a, b) => b.failure - a.failure);

  console.info('[resolveConnection] userdb handshake resumo', {
    processed: handshakeSummaryState.success + handshakeSummaryState.failure,
    success: handshakeSummaryState.success,
    failure: handshakeSummaryState.failure,
    unitsTracked: handshakeStatsByUnit.size,
    failedUnits,
    topFailingUnits: topFailingUnits.slice(0, 5),
  });

  handshakeSummaryState.sinceLastReport = 0;
  handshakeSummaryState.lastReportAt = now;
}

function maybeLogRoutingSummary() {
  if (routingSummaryState.sinceLastReport === 0) return;

  const now = Date.now();
  const shouldLogByCount = routingSummaryState.sinceLastReport >= HANDSHAKE_SUMMARY_EVERY;
  const shouldLogByTime = (now - routingSummaryState.lastReportAt) >= HANDSHAKE_SUMMARY_INTERVAL_MS;
  if (!shouldLogByCount && !shouldLogByTime) return;

  console.info('[resolveConnection] routing summary', {
    tenant: routingStats.tenant,
    global: routingStats.global,
    cache: buildConnectionCacheDiagnostics(),
  });

  routingSummaryState.sinceLastReport = 0;
  routingSummaryState.lastReportAt = now;
}

function recordRoutingGlobal() {
  routingStats.global += 1;
  routingSummaryState.sinceLastReport += 1;
  maybeLogRoutingSummary();
}

function recordRoutingTenant() {
  routingStats.tenant += 1;
  routingSummaryState.sinceLastReport += 1;
  maybeLogRoutingSummary();
}

function buildConnectionCacheDiagnostics() {
  const tracker = getConnectionTrackerDiagnostics();

  return {
    dbCacheSize: dbCache.size,
    pendingConnectionsSize: pendingConnections.size,
    handshakeCacheSize: handshakeCache.size,
    trackerTenantMetadataSize: Number(tracker?.tenantMetadataSize || 0),
  };
}

function trimHandshakeCache() {
  if (handshakeCache.size <= MAX_HANDSHAKE_CACHE_SIZE) return;

  for (const dbName of handshakeCache) {
    if (handshakeCache.size <= MAX_HANDSHAKE_CACHE_SIZE) break;
    if (dbCache.has(dbName)) continue;
    if (pendingConnections.has(dbName)) continue;
    handshakeCache.delete(dbName);
  }
}

function closeTenantConnection(connection) {
  if (!connection || typeof connection.close !== 'function') return;

  try {
    const closeResult = connection.close();
    if (closeResult && typeof closeResult.catch === 'function') {
      closeResult.catch(() => {});
    }
  } catch (_) {}
}

function detachTenantConnection(dbName) {
  if (!dbName) return;

  const baseConnection = getConnectionForUnit(null);
  if (!baseConnection || typeof baseConnection.removeDb !== 'function') return;

  try {
    const removeResult = baseConnection.removeDb(dbName);
    if (removeResult && typeof removeResult.catch === 'function') {
      removeResult.catch(() => {});
    }
  } catch (_) {}
}

function touchTenantConnection(dbName, connection) {
  if (!dbName || !connection) return connection || null;

  if (dbCache.has(dbName)) {
    dbCache.delete(dbName);
  }

  dbCache.set(dbName, connection);
  return connection;
}

function pickOldestEvictionCandidate() {
  for (const [dbName, connection] of dbCache.entries()) {
    if (pendingConnections.has(dbName)) continue;
    return { dbName, connection };
  }

  return null;
}

function evictOldestTenantConnection() {
  while (dbCache.size > MAX_TENANT_CONNECTIONS) {
    const candidate = pickOldestEvictionCandidate();
    if (!candidate) return;

    const { dbName, connection } = candidate;
    dbCache.delete(dbName);
    detachTenantConnection(dbName);
    closeTenantConnection(connection);
    releaseTrackedTenantConnection(dbName, connection);

    trimHandshakeCache();

    console.warn('[resolveConnection] evicted tenant connection', {
      dbName,
      ...buildConnectionCacheDiagnostics(),
    });
  }
}

function sleepConnectionCreationWait(ms) {
  try {
    Atomics.wait(CONNECTION_CREATION_WAIT_BUFFER, 0, 0, ms);
  } catch {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < ms) {
      // Busy fallback only if Atomics.wait is not available.
    }
  }
}

function waitForPendingConnection(dbName) {
  while (pendingConnections.has(dbName) && !dbCache.has(dbName)) {
    sleepConnectionCreationWait(CONNECTION_CREATION_WAIT_MS);
  }

  return dbCache.get(dbName) || null;
}

function createTenantConnection(baseConnection, dbName) {
  while (activeCreations >= MAX_CONNECTION_CREATION) {
    sleepConnectionCreationWait(CONNECTION_CREATION_WAIT_MS);
  }

  activeCreations += 1;

  try {
    return registerTrackedConnection(
      baseConnection.useDb(dbName, { useCache: true }),
      { kind: 'tenant', dbName, parentConnection: baseConnection }
    );
  } finally {
    activeCreations -= 1;
  }
}

function createDeferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function recordHandshakeOutcome({ unidadeId, dbName, ok, error }) {
  const key = String(unidadeId || '').trim();
  if (!key) return;

  const success = ok === true;
  const failure = !success;

  let unitStats = handshakeStatsByUnit.get(key);
  if (!unitStats) {
    ensureHandshakeStatsCapacity();
    unitStats = {
      success: 0,
      failure: 0,
      dbName,
      lastError: null,
      lastSeenAt: 0,
    };
    handshakeStatsByUnit.set(key, unitStats);
  }

  unitStats.dbName = dbName;
  unitStats.lastSeenAt = Date.now();
  if (success) {
    unitStats.success += 1;
  } else {
    unitStats.failure += 1;
    unitStats.lastError = String(error || 'USERDB_HANDSHAKE_FAILED');
  }

  if (success) handshakeSummaryState.success += 1;
  else handshakeSummaryState.failure += 1;
  handshakeSummaryState.sinceLastReport += 1;

  maybeLogHandshakeSummary();
}

function runUserDbHandshakeSafe(baseConnection, unidadeId, dbName) {
  if (!isUserDbHandshakeEnabled()) return;
  if (!isValidUnidadeId(unidadeId)) return;
  if (handshakeCache.has(dbName)) return;

  handshakeCache.add(dbName);
  trimHandshakeCache();

  void userDbHandshake(baseConnection, unidadeId)
    .then((result) => {
      recordHandshakeOutcome({
        unidadeId,
        dbName,
        ok: result?.ok === true,
        error: result?.error,
      });

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
      recordHandshakeOutcome({
        unidadeId,
        dbName,
        ok: false,
        error,
      });

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
    recordRoutingGlobal();
    return baseConnection;
  }

  if (isMultiDbRegistryReadEnabled()) {
    let registryEntry;
    try {
      registryEntry = readUnitDatabaseRegistry({ unidadeId });
    } catch (_) {
      recordRoutingGlobal();
      return baseConnection;
    }

    if (!registryEntry) {
      recordRoutingGlobal();
      return baseConnection;
    }

    if (!isRegistryEntryReady(registryEntry)) {
      recordRoutingGlobal();
      return baseConnection;
    }

    if (!isRegistryEntryActive(registryEntry)) {
      recordRoutingGlobal();
      return baseConnection;
    }
  }

  if (!isTenantDbAllowedForUnit(unidadeId)) {
    recordRoutingGlobal();
    return baseConnection;
  }

  const dbName = `wdgestor_unit_${unidadeId}`;

  if (dbCache.has(dbName)) {
    const cachedConnection = dbCache.get(dbName);
    if (!cachedConnection) {
      dbCache.delete(dbName);
    } else {
      touchTenantConnection(dbName, cachedConnection);
      runUserDbHandshakeSafe(baseConnection, unidadeId, dbName);
      recordRoutingTenant();
      return cachedConnection;
    }
  }

  if (pendingConnections.has(dbName)) {
    const pendingConnection = waitForPendingConnection(dbName);
    if (pendingConnection) {
      touchTenantConnection(dbName, pendingConnection);
      runUserDbHandshakeSafe(baseConnection, unidadeId, dbName);
      recordRoutingTenant();
      return pendingConnection;
    }
  }

  const deferredCreation = createDeferredPromise();
  pendingConnections.set(dbName, deferredCreation.promise.catch(() => null));

  try {
    const tenantDb = createTenantConnection(baseConnection, dbName);
    touchTenantConnection(dbName, tenantDb);
    evictOldestTenantConnection();
    deferredCreation.resolve(tenantDb);
    runUserDbHandshakeSafe(baseConnection, unidadeId, dbName);
    recordRoutingTenant();

    return tenantDb;
  } catch (error) {
    deferredCreation.reject(error);
    throw error;
  } finally {
    pendingConnections.delete(dbName);
  }
}

export function clearResolveConnectionCache() {
  for (const [dbName, connection] of dbCache.entries()) {
    detachTenantConnection(dbName);
    closeTenantConnection(connection);
    releaseTrackedTenantConnection(dbName, connection);
  }

  dbCache.clear();
  pendingConnections.clear();
  handshakeCache.clear();
  handshakeStatsByUnit.clear();
  activeCreations = 0;
  handshakeSummaryState.success = 0;
  handshakeSummaryState.failure = 0;
  handshakeSummaryState.sinceLastReport = 0;
  handshakeSummaryState.lastReportAt = Date.now();
  routingStats.global = 0;
  routingStats.tenant = 0;
  routingSummaryState.sinceLastReport = 0;
  routingSummaryState.lastReportAt = Date.now();
}
