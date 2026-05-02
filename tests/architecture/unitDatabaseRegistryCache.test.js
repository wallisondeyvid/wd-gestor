import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const registryModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistry.js')
).href;

let importNonce = 0;

async function loadRegistryModuleFresh() {
  importNonce += 1;
  return import(`${registryModuleUrl}?test=${importNonce}`);
}

test('readUnitDatabaseRegistry retorna null em cache miss', async () => {
  const registry = await loadRegistryModuleFresh();
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  assert.equal(
    registry.readUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
    null
  );
});

test('readUnitDatabaseRegistry retorna entry síncrona quando cache está aquecido', async () => {
  const registry = await loadRegistryModuleFresh();
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  const entry = {
    unidadeId: '000000000000000000000010',
    dbName: 'wdgestor_unit_000000000000000000000010',
    databaseKey: 'wdgestor_unit_000000000000000000000010',
    readiness: { ready: true },
    activation: { active: true },
  };

  registry.setUnitDatabaseRegistryCacheEntry({
    unidadeId: entry.unidadeId,
    entry,
  });

  assert.deepEqual(
    registry.readUnitDatabaseRegistry({ unidadeId: entry.unidadeId }),
    entry
  );
});

test('override de teste tem precedência sobre cache', async () => {
  const registry = await loadRegistryModuleFresh();
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  registry.setUnitDatabaseRegistryCacheEntry({
    unidadeId: '000000000000000000000010',
    entry: {
      unidadeId: '000000000000000000000010',
      dbName: 'wdgestor_unit_000000000000000000000010',
      databaseKey: 'wdgestor_unit_000000000000000000000010',
      readiness: { ready: true },
      activation: { active: true },
    },
  });

  registry.__setUnitDatabaseRegistryReaderForTests(() => ({
    unidadeId: '000000000000000000000010',
    source: 'override',
  }));

  assert.deepEqual(
    registry.readUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
    {
      unidadeId: '000000000000000000000010',
      source: 'override',
    }
  );
});

test('primeUnitDatabaseRegistryCache popula cache usando unitDatabaseRegistryReader', async () => {
  const registry = await loadRegistryModuleFresh();
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  const collectionCalls = [];
  const findOneCalls = [];
  const updatedAt = new Date('2026-05-02T13:00:00.000Z');
  const connection = {
    db: {
      collection(name) {
        collectionCalls.push(name);
        return {
          async findOne(filter) {
            findOneCalls.push(filter);
            return {
              unidadeId: '000000000000000000000010',
              dbName: 'wdgestor_unit_000000000000000000000010',
              databaseKey: 'wdgestor_unit_000000000000000000000010',
              routingMode: 'base',
              readiness: { ready: true },
              activation: { active: true },
              updatedAt,
              ignored: 'field',
            };
          },
        };
      },
    },
  };

  const result = await registry.primeUnitDatabaseRegistryCache({
    unidadeId: '000000000000000000000010',
    connection,
  });

  assert.deepEqual(collectionCalls, ['unit_database_registry']);
  assert.deepEqual(findOneCalls, [{ unidadeId: '000000000000000000000010' }]);
  assert.deepEqual(result, {
    unidadeId: '000000000000000000000010',
    dbName: 'wdgestor_unit_000000000000000000000010',
    databaseKey: 'wdgestor_unit_000000000000000000000010',
    routingMode: 'base',
    readiness: { ready: true },
    activation: { active: true },
    updatedAt,
  });
  assert.deepEqual(
    registry.readUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
    result
  );
});

test('erro no primeUnitDatabaseRegistryCache não contamina cache', async () => {
  const registry = await loadRegistryModuleFresh();
  registry.clearUnitDatabaseRegistryCache();
  registry.__resetUnitDatabaseRegistryReaderForTests();

  const connection = {
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

  await assert.rejects(
    () => registry.primeUnitDatabaseRegistryCache({
      unidadeId: '000000000000000000000010',
      connection,
    }),
    /REGISTRY_COLLECTION_FAILED/
  );

  assert.equal(
    registry.readUnitDatabaseRegistry({ unidadeId: '000000000000000000000010' }),
    null
  );
});