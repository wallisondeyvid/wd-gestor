import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const writerModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryWriter.js')
).href;

const writerSourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/unitDatabaseRegistryWriter.js'
);

let importNonce = 0;

async function loadWriterModuleFresh() {
  importNonce += 1;
  return import(`${writerModuleUrl}?test=${importNonce}`);
}

function createCollectionDouble({ findOneImpl, updateOneImpl, collectionCalls }) {
  return {
    collection(name) {
      collectionCalls?.push(name);
      return {
        async findOne(filter) {
          if (typeof findOneImpl === 'function') {
            return findOneImpl(filter);
          }
          return null;
        },
        async updateOne(filter, update, options) {
          if (typeof updateOneImpl === 'function') {
            return updateOneImpl(filter, update, options);
          }
          return { acknowledged: true };
        },
      };
    },
  };
}

test('registerUnitDatabaseRegistryPending grava entry inicial segura via conexão base/global', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const updateOneCalls = [];

  mongoose.connection.db = {
    collection(name) {
      collectionCalls.push(name);
      return {
        async updateOne(filter, update, options) {
          updateOneCalls.push({ filter, update, options });
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        },
      };
    },
  };

  try {
    const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

    const result = await registerUnitDatabaseRegistryPending({
      unidadeId: ' 000000000000000000000010 ',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
    });

    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].filter, {
      unidadeId: '000000000000000000000010',
    });
    assert.deepEqual(updateOneCalls[0].options, {
      upsert: true,
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.status, 'pending');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.readiness, { ready: false });
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.ok(persistedEntry.updatedAt instanceof Date);

    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('registerUnitDatabaseRegistryPending exige unidadeId', async () => {
  const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

  await assert.rejects(
    () => registerUnitDatabaseRegistryPending({
      unidadeId: '',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
    }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('registerUnitDatabaseRegistryPending exige dbName', async () => {
  const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

  await assert.rejects(
    () => registerUnitDatabaseRegistryPending({
      unidadeId: '000000000000000000000010',
      dbName: '',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
    }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('registerUnitDatabaseRegistryPending exige databaseKey', async () => {
  const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

  await assert.rejects(
    () => registerUnitDatabaseRegistryPending({
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: '',
    }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('registerUnitDatabaseRegistryPending não grava active, tenant nem allowlist', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = {
    collection() {
      return {
        async updateOne(filter, update, options) {
          updateOneCalls.push({ filter, update, options });
          return { acknowledged: true };
        },
      };
    },
  };

  try {
    const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

    await registerUnitDatabaseRegistryPending({
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'pending');
    assert.notEqual(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.notEqual(persistedEntry.routingMode, 'tenant');
    assert.equal('allowlist' in persistedEntry, false);
    assert.equal('allowlisted' in persistedEntry.activation, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('registerUnitDatabaseRegistryPending lança erro específico quando conexão base/global está indisponível', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = null;

  try {
    const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

    await assert.rejects(
      () => registerUnitDatabaseRegistryPending({
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
      }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('registerUnitDatabaseRegistryPending lança erro específico quando a persistência falha', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = {
    collection() {
      return {
        async updateOne() {
          throw new Error('UPDATE_ONE_FAILED');
        },
      };
    },
  };

  try {
    const { registerUnitDatabaseRegistryPending } = await loadWriterModuleFresh();

    await assert.rejects(
      () => registerUnitDatabaseRegistryPending({
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
      }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_PERSIST_FAILED'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady promove pending para ready seguro', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const findOneCalls = [];
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    collectionCalls,
    findOneImpl(filter) {
      findOneCalls.push(filter);
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'pending',
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    const result = await markUnitDatabaseRegistryReady({
      unidadeId: '000000000000000000000010',
      reason: 'technical-check-ok',
    });

    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].filter, {
      unidadeId: '000000000000000000000010',
    });
    assert.deepEqual(updateOneCalls[0].options, {
      upsert: false,
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.status, 'ready');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.readiness, {
      ready: true,
      reason: 'technical-check-ok',
    });
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady promove provisioning para ready seguro', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'provisioning',
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    const result = await markUnitDatabaseRegistryReady({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'ready');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.readiness, { ready: true });
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady exige unidadeId', async () => {
  const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

  await assert.rejects(
    () => markUnitDatabaseRegistryReady({ unidadeId: '' }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('markUnitDatabaseRegistryReady falha se entry não existe', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({});

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryReady({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_ENTRY_NOT_FOUND'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady falha se dbName está ausente', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: '',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'pending',
      };
    },
  });

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryReady({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady falha se databaseKey está ausente', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: '',
        status: 'pending',
      };
    },
  });

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryReady({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryReady falha se status atual não é pending ou provisioning', async () => {
  const disallowedStatuses = ['active', 'disabled', 'rollback_required', 'failed', 'ready'];

  for (const status of disallowedStatuses) {
    const originalDb = mongoose.connection.db;
    mongoose.connection.db = createCollectionDouble({
      findOneImpl() {
        return {
          unidadeId: '000000000000000000000010',
          dbName: 'wdgestor_unit_000000000000000000000010',
          databaseKey: 'wdgestor_unit_000000000000000000000010',
          status,
        };
      },
    });

    try {
      const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

      await assert.rejects(
        () => markUnitDatabaseRegistryReady({ unidadeId: '000000000000000000000010' }),
        (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
      );
    } finally {
      mongoose.connection.db = originalDb;
    }
  }
});

test('markUnitDatabaseRegistryReady não grava active, tenant, allowlist nem activation.active true', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'pending',
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    await markUnitDatabaseRegistryReady({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'ready');
    assert.notEqual(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.notEqual(persistedEntry.routingMode, 'tenant');
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.notEqual(persistedEntry.activation.active, true);
    assert.equal('allowlist' in persistedEntry, false);
    assert.equal('allowlisted' in persistedEntry.activation, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry desativa entry active com retorno seguro', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const findOneCalls = [];
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    collectionCalls,
    findOneImpl(filter) {
      findOneCalls.push(filter);
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        readiness: { ready: true, reason: 'technical-check-ok' },
        activation: { active: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    const result = await disableUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
      reason: 'manual-disable',
    });

    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].filter, {
      unidadeId: '000000000000000000000010',
    });
    assert.deepEqual(updateOneCalls[0].options, {
      upsert: false,
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'disabled');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.activation.active, false);
    assert.ok(persistedEntry.activation.deactivatedAt instanceof Date);
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.equal(persistedEntry.lastError, 'manual-disable');
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry desativa entry ready com retorno seguro', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        readiness: { ready: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    const result = await disableUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'disabled');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.readiness, { ready: true });
    assert.deepEqual(persistedEntry.activation.active, false);
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry é seguro e idempotente para disabled', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'disabled',
        readiness: { ready: false },
        activation: {
          active: false,
          deactivatedAt: new Date('2026-05-03T10:00:00.000Z'),
        },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    const result = await disableUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'disabled');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.activation.active, false);
    assert.ok(persistedEntry.activation.deactivatedAt instanceof Date);
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry exige unidadeId', async () => {
  const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

  await assert.rejects(
    () => disableUnitDatabaseRegistry({ unidadeId: '' }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('disableUnitDatabaseRegistry falha se entry não existe', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({});

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_ENTRY_NOT_FOUND'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry não remove entry', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        readiness: { ready: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    assert.equal('$unset' in updateOneCalls[0].update, false);
    assert.equal('$delete' in updateOneCalls[0].update, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry não grava active, tenant, allowlist nem activation.active true', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'rollback_required',
        readiness: { ready: false },
        activation: { active: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'disabled');
    assert.notEqual(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.notEqual(persistedEntry.routingMode, 'tenant');
    assert.deepEqual(persistedEntry.activation.active, false);
    assert.notEqual(persistedEntry.activation.active, true);
    assert.equal('allowlist' in persistedEntry, false);
    assert.equal('allowlisted' in persistedEntry.activation, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry preserva unidadeId, dbName, databaseKey e readiness', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'failed',
        readiness: { ready: true, reason: 'previous-check' },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.deepEqual(persistedEntry.readiness, {
      ready: true,
      reason: 'previous-check',
    });
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry grava reason em lastError quando informado', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'provisioning',
        readiness: { ready: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await disableUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
      reason: 'operator-disabled',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.lastError, 'operator-disabled');
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry lança erro específico quando conexão base/global está indisponível', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = null;

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('disableUnitDatabaseRegistry lança erro específico quando a persistência falha', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        readiness: { ready: true },
      };
    },
    updateOneImpl() {
      throw new Error('UPDATE_ONE_FAILED');
    },
  });

  try {
    const { disableUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => disableUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_PERSIST_FAILED'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired marca entry active como rollback_required com retorno seguro', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const findOneCalls = [];
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    collectionCalls,
    findOneImpl(filter) {
      findOneCalls.push(filter);
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        readiness: { ready: true, reason: 'technical-check-ok' },
        activation: { active: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    const result = await markUnitDatabaseRegistryRollbackRequired({
      unidadeId: '000000000000000000000010',
      reason: 'rollback-needed',
    });

    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].filter, {
      unidadeId: '000000000000000000000010',
    });
    assert.deepEqual(updateOneCalls[0].options, {
      upsert: false,
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'rollback_required');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.equal(persistedEntry.lastError, 'rollback-needed');
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired marca entry ready como rollback_required com retorno seguro', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        readiness: { ready: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    const result = await markUnitDatabaseRegistryRollbackRequired({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'rollback_required');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.readiness, { ready: true });
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired é seguro e idempotente para rollback_required', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'rollback_required',
        readiness: { ready: false },
        activation: { active: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    const result = await markUnitDatabaseRegistryRollbackRequired({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'rollback_required');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.deepEqual(persistedEntry.activation, { active: false });
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired exige unidadeId', async () => {
  const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

  await assert.rejects(
    () => markUnitDatabaseRegistryRollbackRequired({ unidadeId: '' }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('markUnitDatabaseRegistryRollbackRequired falha se entry não existe', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({});

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_ENTRY_NOT_FOUND'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired não remove entry', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'disabled',
        readiness: { ready: true },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' });

    assert.equal('$unset' in updateOneCalls[0].update, false);
    assert.equal('$delete' in updateOneCalls[0].update, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired não grava active, tenant, allowlist nem activation.active true', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'failed',
        readiness: { ready: false },
        activation: { active: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'rollback_required');
    assert.notEqual(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'base');
    assert.notEqual(persistedEntry.routingMode, 'tenant');
    assert.deepEqual(persistedEntry.activation.active, false);
    assert.notEqual(persistedEntry.activation.active, true);
    assert.equal('allowlist' in persistedEntry, false);
    assert.equal('allowlisted' in persistedEntry.activation, false);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired preserva unidadeId, dbName, databaseKey e readiness', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'pending',
        readiness: { ready: true, reason: 'previous-check' },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.deepEqual(persistedEntry.readiness, {
      ready: true,
      reason: 'previous-check',
    });
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired grava reason em lastError quando informado', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'provisioning',
        readiness: { ready: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await markUnitDatabaseRegistryRollbackRequired({
      unidadeId: '000000000000000000000010',
      reason: 'rollback-requested',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.lastError, 'rollback-requested');
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired lança erro específico quando conexão base/global está indisponível', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = null;

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('markUnitDatabaseRegistryRollbackRequired lança erro específico quando a persistência falha', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        readiness: { ready: true },
      };
    },
    updateOneImpl() {
      throw new Error('UPDATE_ONE_FAILED');
    },
  });

  try {
    const { markUnitDatabaseRegistryRollbackRequired } = await loadWriterModuleFresh();

    await assert.rejects(
      () => markUnitDatabaseRegistryRollbackRequired({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_PERSIST_FAILED'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry promove ready para active com tenant explícito', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const findOneCalls = [];
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    collectionCalls,
    findOneImpl(filter) {
      findOneCalls.push(filter);
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true, reason: 'technical-check-ok' },
        activation: { active: false },
        lastError: 'stale-error',
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    const result = await activateUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
    });

    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].filter, {
      unidadeId: '000000000000000000000010',
    });
    assert.deepEqual(updateOneCalls[0].options, {
      upsert: false,
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'tenant');
    assert.deepEqual(persistedEntry.readiness, {
      ready: true,
      reason: 'technical-check-ok',
    });
    assert.equal(persistedEntry.activation.active, true);
    assert.ok(persistedEntry.activation.activatedAt instanceof Date);
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.deepEqual(updateOneCalls[0].update.$unset, {
      lastError: '',
      'activation.deactivatedAt': '',
    });
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry é idempotente seguro para active coerente e preserva activatedAt existente', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];
  const activatedAt = new Date('2026-05-03T12:00:00.000Z');

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'active',
        routingMode: 'tenant',
        readiness: { ready: true },
        activation: {
          active: true,
          activatedAt,
        },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    const result = await activateUnitDatabaseRegistry({
      unidadeId: '000000000000000000000010',
    });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'tenant');
    assert.equal(persistedEntry.activation.active, true);
    assert.strictEqual(persistedEntry.activation.activatedAt, activatedAt);
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.deepEqual(result, persistedEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry exige unidadeId', async () => {
  const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

  await assert.rejects(
    () => activateUnitDatabaseRegistry({ unidadeId: '' }),
    (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_INPUT'
  );
});

test('activateUnitDatabaseRegistry falha se entry não existe', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({});

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_ENTRY_NOT_FOUND'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se dbName está ausente', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: '',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: { active: false },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se databaseKey está ausente', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: '',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: { active: false },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se readiness.ready não é true', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: false },
        activation: { active: false },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se status atual é pending, provisioning, failed, disabled ou rollback_required', async () => {
  const disallowedStatuses = ['pending', 'provisioning', 'failed', 'disabled', 'rollback_required'];

  for (const status of disallowedStatuses) {
    const originalDb = mongoose.connection.db;
    mongoose.connection.db = createCollectionDouble({
      findOneImpl() {
        return {
          unidadeId: '000000000000000000000010',
          dbName: 'wdgestor_unit_000000000000000000000010',
          databaseKey: 'wdgestor_unit_000000000000000000000010',
          status,
          routingMode: 'base',
          readiness: { ready: true },
          activation: { active: false },
        };
      },
    });

    try {
      const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

      await assert.rejects(
        () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
        (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
      );
    } finally {
      mongoose.connection.db = originalDb;
    }
  }
});

test('activateUnitDatabaseRegistry falha se ready está com routingMode diferente de base', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'tenant',
        readiness: { ready: true },
        activation: { active: false },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se ready está com activation.active=true', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: { active: true },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry falha se active está incoerente', async () => {
  const originalDb = mongoose.connection.db;
  const invalidActiveEntries = [
    {
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
      status: 'active',
      routingMode: 'base',
      readiness: { ready: true },
      activation: { active: true },
    },
    {
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
      status: 'active',
      routingMode: 'tenant',
      readiness: { ready: false },
      activation: { active: true },
    },
    {
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
      status: 'active',
      routingMode: 'tenant',
      readiness: { ready: true },
      activation: { active: false },
    },
  ];

  try {
    for (const entry of invalidActiveEntries) {
      mongoose.connection.db = createCollectionDouble({
        findOneImpl() {
          return entry;
        },
      });

      const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

      await assert.rejects(
        () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
        (error) => error?.code === 'UNIT_DATABASE_REGISTRY_INVALID_TRANSITION'
      );
    }
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry preserva unidadeId, dbName, databaseKey e readiness', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true, reason: 'previous-check' },
        activation: { active: false },
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal(persistedEntry.unidadeId, '000000000000000000000010');
    assert.equal(persistedEntry.dbName, 'wdgestor_unit_000000000000000000000010');
    assert.equal(persistedEntry.databaseKey, 'wdgestor_unit_000000000000000000000010');
    assert.deepEqual(persistedEntry.readiness, {
      ready: true,
      reason: 'previous-check',
    });
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry não grava allowlist e não preserva lastError nem activation.deactivatedAt no sucesso', async () => {
  const originalDb = mongoose.connection.db;
  const updateOneCalls = [];

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: {
          active: false,
          deactivatedAt: new Date('2026-05-03T10:00:00.000Z'),
        },
        lastError: 'old-error',
      };
    },
    updateOneImpl(filter, update, options) {
      updateOneCalls.push({ filter, update, options });
      return { acknowledged: true };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    const persistedEntry = updateOneCalls[0].update.$set;
    assert.equal('allowlist' in persistedEntry, false);
    assert.equal('allowlisted' in persistedEntry.activation, false);
    assert.equal('lastError' in persistedEntry, false);
    assert.equal('deactivatedAt' in persistedEntry.activation, false);
    assert.deepEqual(updateOneCalls[0].update.$unset, {
      lastError: '',
      'activation.deactivatedAt': '',
    });
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry não chama handshake, useDb nem abre tenant diretamente', async () => {
  const originalDb = mongoose.connection.db;
  const originalUseDb = mongoose.connection.useDb;
  const useDbCalls = [];

  mongoose.connection.useDb = (...args) => {
    useDbCalls.push(args);
    return { name: 'tenantConn' };
  };

  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: { active: false },
      };
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' });

    assert.equal(useDbCalls.length, 0);
  } finally {
    mongoose.connection.db = originalDb;
    mongoose.connection.useDb = originalUseDb;
  }
});

test('activateUnitDatabaseRegistry lança erro específico quando conexão base/global está indisponível', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = null;

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('activateUnitDatabaseRegistry lança erro específico quando a persistência falha', async () => {
  const originalDb = mongoose.connection.db;
  mongoose.connection.db = createCollectionDouble({
    findOneImpl() {
      return {
        unidadeId: '000000000000000000000010',
        dbName: 'wdgestor_unit_000000000000000000000010',
        databaseKey: 'wdgestor_unit_000000000000000000000010',
        status: 'ready',
        routingMode: 'base',
        readiness: { ready: true },
        activation: { active: false },
      };
    },
    updateOneImpl() {
      throw new Error('UPDATE_ONE_FAILED');
    },
  });

  try {
    const { activateUnitDatabaseRegistry } = await loadWriterModuleFresh();

    await assert.rejects(
      () => activateUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
      (error) => error?.code === 'UNIT_DATABASE_REGISTRY_PERSIST_FAILED'
    );
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('unitDatabaseRegistryWriter não importa nem chama resolveConnection', () => {
  const source = fs.readFileSync(writerSourceFilePath, 'utf8');

  assert.doesNotMatch(source, /#shared\/db\/resolveConnection\.js/);
  assert.doesNotMatch(source, /\bresolveConnection\s*\(/);
  assert.doesNotMatch(source, /\.useDb\s*\(/);
  assert.doesNotMatch(source, /#shared\/db\/userdbHandshake\.js/);
  assert.doesNotMatch(source, /\buserDbHandshake\s*\(/);
});

test('unitDatabaseRegistryWriter não importa nem chama unitDatabaseRegistryPreload', () => {
  const source = fs.readFileSync(writerSourceFilePath, 'utf8');

  assert.doesNotMatch(source, /#shared\/db\/unitDatabaseRegistryPreload\.js/);
  assert.doesNotMatch(source, /\bpreloadUnitDatabaseRegistryForUnits\s*\(/);
});