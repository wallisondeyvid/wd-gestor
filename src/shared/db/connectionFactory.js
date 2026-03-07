import mongoose from 'mongoose';

const connections = new Map();
const trackedConnections = new Set();
const tenantConnectionKeys = new Set();
const tenantMetadataByKey = new Map();

function normalizeTenantDbKey(dbName) {
  return String(dbName || '').trim();
}

function trackConnection(connection) {
  if (!connection || typeof connection.close !== 'function') return;
  trackedConnections.add(connection);
}

export function getConnectionForUnit(unidadeId) {
  const key = unidadeId ?? null;

  if (!connections.has(key)) {
    connections.set(key, mongoose.connection);
  }

  const connection = connections.get(key);
  trackConnection(connection);
  return connection;
}

export function registerTrackedConnection(connection, options = {}) {
  trackConnection(connection);

  if (options.kind === 'tenant') {
    const key = normalizeTenantDbKey(options.dbName || 'tenant');
    const previous = tenantMetadataByKey.get(key);
    const previousConnection = previous?.connection;

    if (previousConnection && previousConnection !== connection) {
      tenantConnectionKeys.delete(previousConnection);
      trackedConnections.delete(previousConnection);
    }

    tenantConnectionKeys.add(connection);
    tenantMetadataByKey.set(key, {
      parentConnection: options.parentConnection,
      dbName: options.dbName,
      connection,
    });
  }

  return connection;
}

export function releaseTrackedTenantConnection(dbName, connection) {
  const key = normalizeTenantDbKey(dbName);
  const metadata = key ? tenantMetadataByKey.get(key) : null;
  const trackedTenantConnection = connection || metadata?.connection || null;

  if (key) {
    tenantMetadataByKey.delete(key);
  }

  if (trackedTenantConnection) {
    tenantConnectionKeys.delete(trackedTenantConnection);
    trackedConnections.delete(trackedTenantConnection);
  }
}

export function getConnectionTrackerDiagnostics() {
  return {
    tenantMetadataSize: tenantMetadataByKey.size,
  };
}

export async function closeAllDbConnections() {
  for (const tenantMeta of tenantMetadataByKey.values()) {
    const parentConnection = tenantMeta?.parentConnection;
    const dbName = tenantMeta?.dbName;
    if (!parentConnection || !dbName || typeof parentConnection.removeDb !== 'function') continue;
    try {
      await parentConnection.removeDb(dbName);
    } catch {
      /* noop */
    }
  }

  const toClose = new Set();

  toClose.add(mongoose.connection);
  for (const connection of connections.values()) {
    toClose.add(connection);
  }
  for (const connection of trackedConnections.values()) {
    if (tenantConnectionKeys.has(connection)) continue;
    toClose.add(connection);
  }

  for (const connection of toClose) {
    if (!connection || typeof connection.close !== 'function') continue;
    try {
      await connection.close();
    } catch {
      /* noop */
    }
  }

  connections.clear();
  trackedConnections.clear();
  tenantConnectionKeys.clear();
  tenantMetadataByKey.clear();
}
