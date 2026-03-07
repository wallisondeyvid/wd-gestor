import { resolveConnection } from '#shared/db/resolveConnection.js';
import { createUnitScope } from '#shared/unitScope.js';
import mongoose from 'mongoose';

function resolveTenantConnection(unidadeId) {
  return resolveConnection(createUnitScope({ unidadeId }));
}

function resolveGlobalConnection() {
  return resolveConnection(createUnitScope({ unidadeId: null }));
}

function requireConnection(connection, contextLabel) {
  if (!connection || !connection.db) {
    throw new Error(`[UnitProvisioningRepository] conexao indisponivel em ${contextLabel}`);
  }
}

function isCollectionAlreadyExistsError(error) {
  const message = String(error?.message || '').toLowerCase();
  return Number(error?.code) === 48 || message.includes('namespace exists') || message.includes('already exists');
}

function normalizeModuloIds(moduloIds) {
  if (!Array.isArray(moduloIds)) return [];

  const normalized = [];
  const known = new Set();

  for (const item of moduloIds) {
    const id = String(item || '').trim();
    if (!id) continue;
    if (!mongoose.isValidObjectId(id)) continue;
    if (known.has(id)) continue;
    known.add(id);
    normalized.push(new mongoose.Types.ObjectId(id));
  }

  return normalized;
}

function normalizePositiveLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function normalizeEventScopeFilter(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (normalized === 'unit' || normalized === 'module') return normalized;
  return null;
}

function normalizeEventModuleKeyFilter(moduleKey) {
  const normalized = String(moduleKey || '').trim();
  return normalized || null;
}

function normalizeEventOperationFilter(operation) {
  const normalized = String(operation || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeEventStatusFilter(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeBeforeDate(beforeDate) {
  if (!beforeDate) return null;
  const parsed = new Date(beforeDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeBeforeEventId(beforeEventId) {
  const normalized = String(beforeEventId || '').trim();
  if (!normalized) return null;
  if (!mongoose.isValidObjectId(normalized)) return null;
  return new mongoose.Types.ObjectId(normalized);
}

async function ensureCollection(connection, collectionName) {
  try {
    await connection.db.createCollection(collectionName);
  } catch (error) {
    if (isCollectionAlreadyExistsError(error)) return;
    throw error;
  }
}

export class UnitProvisioningRepository {
  async findGlobalModulosByIds({ moduloIds }) {
    const ids = normalizeModuloIds(moduloIds);
    if (ids.length === 0) return [];

    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection('modulos');
    return collection
      .find({ _id: { $in: ids } })
      .project({ _id: 1, nome: 1, url_base: 1, status: 1 })
      .toArray();
  }

  async ensureTenantProvisioningCollection({ unidadeId, collectionName }) {
    const tenantConnection = resolveTenantConnection(unidadeId);
    requireConnection(tenantConnection, 'tenant-connection');
    await ensureCollection(tenantConnection, collectionName);
  }

  async ensureTenantProvisioningIndex({ unidadeId, collectionName, indexSpec, indexOptions }) {
    const tenantConnection = resolveTenantConnection(unidadeId);
    requireConnection(tenantConnection, 'tenant-connection');

    const collection = tenantConnection.collection(collectionName);
    await collection.createIndex(indexSpec, indexOptions);
  }

  async upsertTenantDocumentByKey({
    unidadeId,
    collectionName,
    keyField = 'key',
    keyValue,
    setFields,
    setOnInsertFields,
    now,
  }) {
    const tenantConnection = resolveTenantConnection(unidadeId);
    requireConnection(tenantConnection, 'tenant-connection');

    const normalizedKeyField = String(keyField || '').trim() || 'key';
    const normalizedKeyValue = String(keyValue || '').trim();
    if (!normalizedKeyValue) {
      throw new Error('[UnitProvisioningRepository] keyValue obrigatorio em upsertTenantDocumentByKey');
    }

    const safeSetFields = (setFields && typeof setFields === 'object' && !Array.isArray(setFields))
      ? setFields
      : {};
    const safeSetOnInsertFields = (setOnInsertFields && typeof setOnInsertFields === 'object' && !Array.isArray(setOnInsertFields))
      ? setOnInsertFields
      : {};

    const timestamp = now || new Date();
    const collection = tenantConnection.collection(collectionName);
    await collection.updateOne(
      { [normalizedKeyField]: normalizedKeyValue },
      {
        $set: {
          ...safeSetFields,
          updatedAt: timestamp,
        },
        $setOnInsert: {
          [normalizedKeyField]: normalizedKeyValue,
          ...safeSetOnInsertFields,
          createdAt: timestamp,
        },
      },
      { upsert: true }
    );
  }

  async upsertTenantProvisioningMarker({ unidadeId, collectionName, markerKey, dbName, now }) {
    await this.upsertTenantDocumentByKey({
      unidadeId,
      collectionName,
      keyField: 'key',
      keyValue: markerKey,
      setFields: {
        dbName,
      },
      now,
    });
  }

  async ensureGlobalProvisioningIndex({ collectionName, indexSpec, indexOptions }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection(collectionName);
    await collection.createIndex(indexSpec, indexOptions);
  }

  async findGlobalProvisioningStatusByUnidadeId({ collectionName, unidadeId }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection(collectionName);
    return collection.findOne(
      { unidadeId },
      { projection: { _id: 1, ready: 1 } }
    );
  }

  async findGlobalProvisioningStatusSnapshotByUnidadeId({ collectionName, unidadeId }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection(collectionName);
    return collection.findOne(
      { unidadeId },
      {
        projection: {
          _id: 0,
          unidadeId: 1,
          dbName: 1,
          tipo: 1,
          status: 1,
          ready: 1,
          lastProvisioningError: 1,
          modulosHabilitados: 1,
          tenantBase: 1,
          tenantBaseModel: 1,
          tenantBaseUnidadeId: 1,
          tenantBaseDbName: 1,
          moduleStatuses: 1,
          snapshotVersion: 1,
          createdAt: 1,
          updatedAt: 1,
          lastProvisionedAt: 1,
        },
      }
    );
  }

  async upsertGlobalProvisioningStatus({ collectionName, unidadeId, payload, now }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection(collectionName);
    await collection.updateOne(
      { unidadeId },
      {
        $set: {
          ...payload,
          unidadeId,
          updatedAt: now,
          lastProvisionedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  async insertGlobalProvisioningEvent({ collectionName, eventDoc }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const collection = globalConnection.collection(collectionName);
    await collection.insertOne(eventDoc);
  }

  async listGlobalProvisioningEventsByUnidadeId({
    collectionName,
    unidadeId,
    limit = 100,
    scope,
    moduleKey,
    operation,
    status,
    beforeDate,
    beforeEventId,
  }) {
    const globalConnection = resolveGlobalConnection();
    requireConnection(globalConnection, 'global-connection');

    const normalizedLimit = normalizePositiveLimit(limit, 100, 501);
    const normalizedScope = normalizeEventScopeFilter(scope);
    const normalizedModuleKey = normalizeEventModuleKeyFilter(moduleKey);
    const normalizedOperation = normalizeEventOperationFilter(operation);
    const normalizedStatus = normalizeEventStatusFilter(status);
    const normalizedBeforeDate = normalizeBeforeDate(beforeDate);
    const normalizedBeforeEventId = normalizeBeforeEventId(beforeEventId);
    const collection = globalConnection.collection(collectionName);

    const filter = { unidadeId };
    if (normalizedScope) {
      filter.scope = normalizedScope;
    }
    if (normalizedModuleKey) {
      filter.moduleKey = normalizedModuleKey;
    }
    if (normalizedOperation) {
      filter.operation = normalizedOperation;
    }
    if (normalizedStatus) {
      filter.status = normalizedStatus;
    }
    if (normalizedBeforeDate && normalizedBeforeEventId) {
      filter.$or = [
        { createdAt: { $lt: normalizedBeforeDate } },
        { createdAt: normalizedBeforeDate, _id: { $lt: normalizedBeforeEventId } },
      ];
    } else if (normalizedBeforeDate) {
      filter.createdAt = { $lt: normalizedBeforeDate };
    }

    return collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(normalizedLimit)
      .toArray();
  }
}

export default UnitProvisioningRepository;
