import { getConnectionForUnit } from '#shared/db/connectionFactory.js';

const UNIT_DATABASE_REGISTRY_COLLECTION = 'unit_database_registry';

function createWriterError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function normalizeRequiredString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function getRegistryCollection(connection) {
  const collection = connection?.db?.collection;
  if (typeof collection !== 'function') {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE',
      'Base/global connection is unavailable for unit database registry writer.'
    );
  }

  return connection.db.collection(UNIT_DATABASE_REGISTRY_COLLECTION);
}

function buildPendingEntry({ unidadeId, dbName, databaseKey, updatedAt }) {
  return {
    unidadeId,
    dbName,
    databaseKey,
    status: 'pending',
    routingMode: 'base',
    readiness: {
      ready: false,
    },
    activation: {
      active: false,
    },
    updatedAt,
  };
}

function buildReadyEntry({ existingEntry, reason, updatedAt }) {
  const readiness = {
    ready: true,
    ...(reason ? { reason } : {}),
  };

  return {
    unidadeId: existingEntry.unidadeId,
    dbName: existingEntry.dbName,
    databaseKey: existingEntry.databaseKey,
    status: 'ready',
    routingMode: 'base',
    readiness,
    activation: {
      active: false,
    },
    updatedAt,
  };
}

function isReadyTransitionAllowed(status) {
  return status === 'pending' || status === 'provisioning';
}

export async function registerUnitDatabaseRegistryPending(input = {}) {
  const unidadeId = normalizeRequiredString(input?.unidadeId);
  const dbName = normalizeRequiredString(input?.dbName);
  const databaseKey = normalizeRequiredString(input?.databaseKey);

  if (!unidadeId || !dbName || !databaseKey) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_INVALID_INPUT',
      'unidadeId, dbName and databaseKey are required.'
    );
  }

  const updatedAt = new Date();
  const entry = buildPendingEntry({
    unidadeId,
    dbName,
    databaseKey,
    updatedAt,
  });

  const baseConnection = getConnectionForUnit(null);
  const collection = getRegistryCollection(baseConnection);

  try {
    await collection.updateOne(
      { unidadeId },
      { $set: entry },
      { upsert: true }
    );
  } catch (error) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_PERSIST_FAILED',
      'Failed to persist pending unit database registry entry.',
      error
    );
  }

  return entry;
}

export async function markUnitDatabaseRegistryReady(input = {}) {
  const unidadeId = normalizeRequiredString(input?.unidadeId);
  const reason = normalizeRequiredString(input?.reason);

  if (!unidadeId) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_INVALID_INPUT',
      'unidadeId is required.'
    );
  }

  const baseConnection = getConnectionForUnit(null);
  const collection = getRegistryCollection(baseConnection);

  let existingEntry;
  try {
    existingEntry = await collection.findOne({ unidadeId });
  } catch (error) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_PERSIST_FAILED',
      'Failed to read unit database registry entry before ready transition.',
      error
    );
  }

  if (!existingEntry) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_ENTRY_NOT_FOUND',
      'Unit database registry entry was not found.'
    );
  }

  const dbName = normalizeRequiredString(existingEntry?.dbName);
  const databaseKey = normalizeRequiredString(existingEntry?.databaseKey);
  const status = normalizeRequiredString(existingEntry?.status);

  if (!dbName || !databaseKey || !isReadyTransitionAllowed(status)) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION',
      'Unit database registry entry cannot transition to ready.'
    );
  }

  const updatedAt = new Date();
  const entry = buildReadyEntry({
    existingEntry: {
      unidadeId,
      dbName,
      databaseKey,
    },
    reason,
    updatedAt,
  });

  try {
    await collection.updateOne(
      { unidadeId },
      { $set: entry },
      { upsert: false }
    );
  } catch (error) {
    throw createWriterError(
      'UNIT_DATABASE_REGISTRY_PERSIST_FAILED',
      'Failed to persist ready unit database registry entry.',
      error
    );
  }

  return entry;
}