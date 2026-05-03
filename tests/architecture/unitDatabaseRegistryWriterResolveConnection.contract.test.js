import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const resolveConnectionModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/resolveConnection.js')
).href;

const writerModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryWriter.js')
).href;

const registryModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistry.js')
).href;

let resolveConnectionImportNonce = 0;
let writerImportNonce = 0;

async function loadResolveConnectionFresh() {
  resolveConnectionImportNonce += 1;
  return import(`${resolveConnectionModuleUrl}?test=${resolveConnectionImportNonce}`);
}

async function loadWriterModuleFresh() {
  writerImportNonce += 1;
  return import(`${writerModuleUrl}?test=${writerImportNonce}`);
}

async function loadRegistryModuleShared() {
  return import(registryModuleUrl);
}

function cloneValue(value) {
  if (value instanceof Date) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }

  return value;
}

function deleteNestedProperty(target, dottedPath) {
  const segments = String(dottedPath || '').split('.').filter(Boolean);
  if (segments.length === 0) return;

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = current?.[segments[index]];
    if (!current || typeof current !== 'object') {
      return;
    }
  }

  delete current?.[segments[segments.length - 1]];
}

function createRegistryStoreHarness() {
  const store = new Map();

  const db = {
    collection(name) {
      assert.equal(name, 'unit_database_registry');
      return {
        async findOne(filter) {
          const unidadeId = String(filter?.unidadeId || '').trim();
          return cloneValue(store.get(unidadeId) || null);
        },
        async updateOne(filter, update, options) {
          const unidadeId = String(filter?.unidadeId || '').trim();
          const existed = store.has(unidadeId);

          if (!existed && !options?.upsert) {
            return {
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: 0,
            };
          }

          let nextEntry = cloneValue(store.get(unidadeId) || { unidadeId });

          if (update?.$set) {
            nextEntry = {
              ...nextEntry,
              ...cloneValue(update.$set),
            };
          }

          if (update?.$unset) {
            for (const fieldName of Object.keys(update.$unset)) {
              deleteNestedProperty(nextEntry, fieldName);
            }
          }

          store.set(unidadeId, nextEntry);

          return {
            acknowledged: true,
            matchedCount: existed ? 1 : 0,
            modifiedCount: 1,
            upsertedCount: existed ? 0 : 1,
          };
        },
      };
    },
  };

  return {
    db,
    read(unidadeId) {
      return cloneValue(store.get(String(unidadeId || '').trim()) || null);
    },
    write(entry) {
      store.set(String(entry?.unidadeId || '').trim(), cloneValue(entry));
    },
  };
}

function setEnvFlag(name, value) {
  if (value === undefined || value === null || value === false) {
    delete process.env[name];
    return;
  }

  process.env[name] = String(value);
}

async function primeRegistryCache(registry, unidadeId) {
  registry.clearUnitDatabaseRegistryCache();
  await registry.primeUnitDatabaseRegistryCache({ unidadeId });
}

async function runContractHarness({ allowlist = true } = {}, callback) {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousRegistryRead = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalDb = baseConnection.db;
  const originalUseDb = baseConnection.useDb;
  const unidadeId = '000000000000000000000010';
  const tenantConn = { name: 'tenantConn' };
  const useDbCalls = [];
  const harness = createRegistryStoreHarness();
  const resolveConnectionModule = await loadResolveConnectionFresh();
  const writer = await loadWriterModuleFresh();
  const registry = await loadRegistryModuleShared();

  baseConnection.db = harness.db;
  baseConnection.useDb = (...args) => {
    useDbCalls.push(args);
    return tenantConn;
  };

  setEnvFlag('WD_MULTI_DB', '1');
  setEnvFlag('WD_MULTI_DB_REGISTRY_READ', '1');
  setEnvFlag('WD_USERDB_HANDSHAKE', '0');
  setEnvFlag('WD_MULTI_DB_ALLOWLIST', allowlist ? unidadeId : undefined);
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  try {
    return await callback({
      unidadeId,
      tenantConn,
      useDbCalls,
      harness,
      writer,
      registry,
      resolveConnection: resolveConnectionModule.resolveConnection,
      clearResolveConnectionCache: resolveConnectionModule.clearResolveConnectionCache,
    });
  } finally {
    registry.clearUnitDatabaseRegistryCache();
    registry.__resetUnitDatabaseRegistryReaderForTests();
    if (typeof resolveConnectionModule.clearResolveConnectionCache === 'function') {
      resolveConnectionModule.clearResolveConnectionCache();
    }

    baseConnection.db = originalDb;
    baseConnection.useDb = originalUseDb;
    setEnvFlag('WD_MULTI_DB', previousMultiDb);
    setEnvFlag('WD_MULTI_DB_REGISTRY_READ', previousRegistryRead);
    setEnvFlag('WD_MULTI_DB_ALLOWLIST', previousAllowlist);
    setEnvFlag('WD_USERDB_HANDSHAKE', previousHandshake);
  }
}

test('writer -> resolveConnection mantém baseConnection para entry pending com allowlist positiva', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection mantém baseConnection para entry ready sem activation.active', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId, reason: 'technical-check-ok' });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection mantém baseConnection para entry disabled mesmo com allowlist positiva', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId });
    await writer.disableUnitDatabaseRegistry({ unidadeId, reason: 'operator-disabled' });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection mantém baseConnection para entry rollback_required mesmo com allowlist positiva', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId });
    await writer.markUnitDatabaseRegistryRollbackRequired({ unidadeId, reason: 'rollback-needed' });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection abre tenant connection para entry active coerente com gates completos', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, tenantConn, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId, reason: 'technical-check-ok' });
    await writer.activateUnitDatabaseRegistry({ unidadeId });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, tenantConn);
    assert.equal(useDbCalls.length, 1);
    assert.deepEqual(useDbCalls[0], [`wdgestor_unit_${unidadeId}`, { useCache: true }]);
  });
});

test('writer -> resolveConnection volta para baseConnection quando entry active coerente perde a allowlist', async () => {
  await runContractHarness({ allowlist: false }, async ({ unidadeId, writer, registry, resolveConnection, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId });
    await writer.activateUnitDatabaseRegistry({ unidadeId });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection mantém baseConnection para entry active corrompida com routingMode=base', async () => {
  await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, harness, useDbCalls }) => {
    await writer.registerUnitDatabaseRegistryPending({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
    });
    await writer.markUnitDatabaseRegistryReady({ unidadeId });
    await writer.activateUnitDatabaseRegistry({ unidadeId });

    const corruptedEntry = harness.read(unidadeId);
    harness.write({
      ...corruptedEntry,
      routingMode: 'base',
    });

    await primeRegistryCache(registry, unidadeId);
    const result = resolveConnection({ unidadeId });

    assert.strictEqual(result, mongoose.connection);
    assert.equal(useDbCalls.length, 0);
  });
});

test('writer -> resolveConnection mantém baseConnection para entry seedada pelo writer e depois corrompida com status bloqueante', async (t) => {
  const blockedStatuses = ['disabled', 'rollback_required', 'pending', 'provisioning'];

  for (const blockedStatus of blockedStatuses) {
    await t.test(`status=${blockedStatus}`, async () => {
      await runContractHarness({}, async ({ unidadeId, writer, registry, resolveConnection, harness, useDbCalls }) => {
        await writer.registerUnitDatabaseRegistryPending({
          unidadeId,
          dbName: `wdgestor_unit_${unidadeId}`,
          databaseKey: `wdgestor_unit_${unidadeId}`,
        });

        const seededEntry = harness.read(unidadeId);
        harness.write({
          ...seededEntry,
          status: blockedStatus,
          routingMode: 'tenant',
          readiness: { ready: true },
          activation: { active: true },
        });

        await primeRegistryCache(registry, unidadeId);
        const result = resolveConnection({ unidadeId });

        assert.strictEqual(result, mongoose.connection);
        assert.equal(useDbCalls.length, 0);
      });
    });
  }
});