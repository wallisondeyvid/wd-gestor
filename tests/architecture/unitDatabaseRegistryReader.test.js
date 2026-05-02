import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const readerModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryReader.js')
).href;

let importNonce = 0;

async function loadReaderModuleFresh() {
  importNonce += 1;
  return import(`${readerModuleUrl}?test=${importNonce}`);
}

test('readUnitDatabaseRegistryFromBase usa conexão base/global quando connection não é injetada', async () => {
  const originalDb = mongoose.connection.db;
  const collectionCalls = [];
  const findOneCalls = [];

  mongoose.connection.db = {
    collection(name) {
      collectionCalls.push(name);
      return {
        async findOne(filter) {
          findOneCalls.push(filter);
          return null;
        },
      };
    },
  };

  try {
    const { readUnitDatabaseRegistryFromBase } = await loadReaderModuleFresh();

    const result = await readUnitDatabaseRegistryFromBase({
      unidadeId: '000000000000000000000010',
    });

    assert.equal(result, null);
    assert.deepEqual(collectionCalls, ['unit_database_registry']);
    assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('readUnitDatabaseRegistryFromBase consulta unit_database_registry filtrando por unidadeId quando connection é injetada', async () => {
  const collectionCalls = [];
  const findOneCalls = [];
  const injectedConnection = {
    db: {
      collection(name) {
        collectionCalls.push(name);
        return {
          async findOne(filter) {
            findOneCalls.push(filter);
            return null;
          },
        };
      },
    },
  };

  const { readUnitDatabaseRegistryFromBase } = await loadReaderModuleFresh();

  const result = await readUnitDatabaseRegistryFromBase({
    unidadeId: '000000000000000000000010',
    connection: injectedConnection,
  });

  assert.equal(result, null);
  assert.deepEqual(collectionCalls, ['unit_database_registry']);
  assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
});

test('readUnitDatabaseRegistryFromBase retorna null quando não encontra documento', async () => {
  const injectedConnection = {
    db: {
      collection() {
        return {
          async findOne() {
            return null;
          },
        };
      },
    },
  };

  const { readUnitDatabaseRegistryFromBase } = await loadReaderModuleFresh();

  const result = await readUnitDatabaseRegistryFromBase({
    unidadeId: '000000000000000000000010',
    connection: injectedConnection,
  });

  assert.equal(result, null);
});

test('readUnitDatabaseRegistryFromBase retorna shape mínimo normalizado quando encontra documento', async () => {
  const updatedAt = new Date('2026-05-02T12:00:00.000Z');
  const injectedConnection = {
    db: {
      collection() {
        return {
          async findOne() {
            return {
              unidadeId: '000000000000000000000010',
              dbName: 'wdgestor_unit_000000000000000000000010',
              databaseKey: 'wdgestor_unit_000000000000000000000010',
              status: 'disabled',
              routingMode: 'base',
              readiness: {
                ready: true,
                reason: 'ignored',
              },
              activation: {
                active: false,
                activatedAt: updatedAt,
              },
              updatedAt,
              extraField: 'ignored',
            };
          },
        };
      },
    },
  };

  const { readUnitDatabaseRegistryFromBase } = await loadReaderModuleFresh();

  const result = await readUnitDatabaseRegistryFromBase({
    unidadeId: '000000000000000000000010',
    connection: injectedConnection,
  });

  assert.deepEqual(result, {
    unidadeId: '000000000000000000000010',
    dbName: 'wdgestor_unit_000000000000000000000010',
    databaseKey: 'wdgestor_unit_000000000000000000000010',
    status: 'disabled',
    routingMode: 'base',
    readiness: {
      ready: true,
    },
    activation: {
      active: false,
    },
    updatedAt,
  });
});

test('readUnitDatabaseRegistryFromBase propaga erro da collection para o caller', async () => {
  const injectedConnection = {
    db: {
      collection() {
        return {
          async findOne() {
            throw new Error('REGISTRY_COLLECTION_FAILED');
          },
        };
      },
    },
  };

  const { readUnitDatabaseRegistryFromBase } = await loadReaderModuleFresh();

  await assert.rejects(
    () => readUnitDatabaseRegistryFromBase({
      unidadeId: '000000000000000000000010',
      connection: injectedConnection,
    }),
    /REGISTRY_COLLECTION_FAILED/
  );
});