import { getConnectionForUnit, registerTrackedConnection } from '#shared/db/connectionFactory.js';
import { userDbHandshake } from '#shared/db/userdbHandshake.js';

const dbCache = new Map();
const handshakeCache = new Set();
const handshakeStatsByUnit = new Map();
const HANDSHAKE_STATS_MAX_UNITS = 1000;
const HANDSHAKE_SUMMARY_EVERY = 25;
const HANDSHAKE_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;

const handshakeSummaryState = {
  success: 0,
  failure: 0,
  sinceLastReport: 0,
  lastReportAt: Date.now(),
};

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
  handshakeStatsByUnit.clear();
  handshakeSummaryState.success = 0;
  handshakeSummaryState.failure = 0;
  handshakeSummaryState.sinceLastReport = 0;
  handshakeSummaryState.lastReportAt = Date.now();
}
