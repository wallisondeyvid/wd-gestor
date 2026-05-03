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

test('unitDatabaseRegistryWriter não importa nem chama resolveConnection', () => {
  const source = fs.readFileSync(writerSourceFilePath, 'utf8');

  assert.doesNotMatch(source, /#shared\/db\/resolveConnection\.js/);
  assert.doesNotMatch(source, /\bresolveConnection\s*\(/);
});

test('unitDatabaseRegistryWriter não importa nem chama unitDatabaseRegistryPreload', () => {
  const source = fs.readFileSync(writerSourceFilePath, 'utf8');

  assert.doesNotMatch(source, /#shared\/db\/unitDatabaseRegistryPreload\.js/);
  assert.doesNotMatch(source, /\bpreloadUnitDatabaseRegistryForUnits\s*\(/);
});