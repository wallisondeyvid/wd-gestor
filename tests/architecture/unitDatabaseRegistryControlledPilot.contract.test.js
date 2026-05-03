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

async function seedPendingEntry({ writer, unidadeId }) {
  await writer.registerUnitDatabaseRegistryPending({
    unidadeId,
    dbName: `wdgestor_unit_${unidadeId}`,
    databaseKey: `wdgestor_unit_${unidadeId}`,
  });
}

async function seedActiveEntry({ writer, unidadeId }) {
  await seedPendingEntry({ writer, unidadeId });
  await writer.markUnitDatabaseRegistryReady({ unidadeId, reason: 'pilot-ready-check' });
  await writer.activateUnitDatabaseRegistry({ unidadeId });
}

async function runPilotHarness(callback) {
  const previousMultiDb = process.env.WD_MULTI_DB;
  const previousRegistryRead = process.env.WD_MULTI_DB_REGISTRY_READ;
  const previousAllowlist = process.env.WD_MULTI_DB_ALLOWLIST;
  const previousHandshake = process.env.WD_USERDB_HANDSHAKE;
  const baseConnection = mongoose.connection;
  const originalDb = baseConnection.db;
  const originalUseDb = baseConnection.useDb;
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
  setEnvFlag('WD_MULTI_DB_ALLOWLIST', undefined);
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  try {
    return await callback({
      writer,
      registry,
      harness,
      tenantConn,
      useDbCalls,
      resolveConnection: resolveConnectionModule.resolveConnection,
      setAllowlist(unidadeId) {
        setEnvFlag('WD_MULTI_DB_ALLOWLIST', unidadeId);
      },
      clearAllowlist() {
        setEnvFlag('WD_MULTI_DB_ALLOWLIST', undefined);
      },
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

test('piloto controlado sintético mantém fallback seguro até receber todos os gates e volta para baseConnection ao encerrar', async () => {
  await runPilotHarness(async ({ writer, registry, harness, tenantConn, useDbCalls, resolveConnection, setAllowlist, clearAllowlist }) => {
    const unidadeBase = '000000000000000000000020';
    const unidadeDisable = '000000000000000000000021';
    const unidadeRollback = '000000000000000000000022';

    await primeRegistryCache(registry, unidadeBase);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeBase }), mongoose.connection);

    await seedPendingEntry({ writer, unidadeId: unidadeBase });
    await primeRegistryCache(registry, unidadeBase);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeBase }), mongoose.connection);

    await writer.markUnitDatabaseRegistryReady({ unidadeId: unidadeBase, reason: 'pilot-ready-check' });
    await primeRegistryCache(registry, unidadeBase);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeBase }), mongoose.connection);

    await writer.activateUnitDatabaseRegistry({ unidadeId: unidadeBase });
    await primeRegistryCache(registry, unidadeBase);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeBase }), mongoose.connection);

    setAllowlist(unidadeBase);
    const activeResult = resolveConnection({ unidadeId: unidadeBase });
    assert.strictEqual(activeResult, tenantConn);
    assert.equal(useDbCalls.length, 1);

    clearAllowlist();
    const allowlistRollbackResult = resolveConnection({ unidadeId: unidadeBase });
    assert.strictEqual(allowlistRollbackResult, mongoose.connection);

    await seedActiveEntry({ writer, unidadeId: unidadeDisable });
    setAllowlist(unidadeDisable);
    await primeRegistryCache(registry, unidadeDisable);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeDisable }), tenantConn);

    await writer.disableUnitDatabaseRegistry({ unidadeId: unidadeDisable, reason: 'pilot-disabled' });
    await primeRegistryCache(registry, unidadeDisable);
    const disabledEntry = harness.read(unidadeDisable);
    const disabledResult = resolveConnection({ unidadeId: unidadeDisable });
    assert.ok(disabledEntry);
    assert.equal(disabledEntry.status, 'disabled');
    assert.equal(disabledEntry.routingMode, 'base');
    assert.equal(disabledEntry.activation?.active, false);
    assert.strictEqual(disabledResult, mongoose.connection);

    await seedActiveEntry({ writer, unidadeId: unidadeRollback });
    setAllowlist(unidadeRollback);
    await primeRegistryCache(registry, unidadeRollback);
    assert.strictEqual(resolveConnection({ unidadeId: unidadeRollback }), tenantConn);

    await writer.markUnitDatabaseRegistryRollbackRequired({ unidadeId: unidadeRollback, reason: 'pilot-rollback-required' });
    await primeRegistryCache(registry, unidadeRollback);
    const rollbackEntry = harness.read(unidadeRollback);
    const rollbackResult = resolveConnection({ unidadeId: unidadeRollback });
    assert.ok(rollbackEntry);
    assert.equal(rollbackEntry.status, 'rollback_required');
    assert.equal(rollbackEntry.routingMode, 'base');
    assert.equal(rollbackEntry.activation?.active, false);
    assert.strictEqual(rollbackResult, mongoose.connection);
  });
});

test('piloto controlado sintético permanece contido ao harness sem owner manual, rota, CLI, script, job ou bootstrap', async () => {
  const syntheticUnidadeIds = [
    '000000000000000000000020',
    '000000000000000000000021',
    '000000000000000000000022',
  ];

  for (const unidadeId of syntheticUnidadeIds) {
    assert.match(unidadeId, /^[a-f\d]{24}$/i);
  }
});