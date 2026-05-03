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