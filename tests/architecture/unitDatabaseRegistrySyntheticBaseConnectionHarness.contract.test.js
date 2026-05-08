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

const connectionFactorySourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/connectionFactory.js'
);

const currentTestFilePath = path.join(
  process.cwd(),
  'tests/architecture/unitDatabaseRegistrySyntheticBaseConnectionHarness.contract.test.js'
);

let importNonce = 0;

async function loadWriterModuleFresh() {
  importNonce += 1;
  return import(`${writerModuleUrl}?test=${importNonce}`);
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

function createSyntheticBaseConnectionHarness() {
  const store = new Map();

  const db = {
    collection(name) {
      assert.equal(name, 'unit_database_registry');

      return {
        async insertOne(document) {
          const unidadeId = String(document?.unidadeId || '').trim();
          store.set(unidadeId, cloneValue(document));
          return {
            acknowledged: true,
            insertedId: unidadeId,
          };
        },
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

  const connection = {
    kind: 'synthetic-base-global',
    environment: 'test',
    mode: 'memory',
    db,
  };

  return {
    connection,
    db,
    collection(name) {
      return db.collection(name);
    },
    read(unidadeId) {
      return cloneValue(store.get(String(unidadeId || '').trim()) || null);
    },
  };
}

test('harness sintetico local opera somente em memoria e expoe base/global connection compativel', async () => {
  const harness = createSyntheticBaseConnectionHarness();
  const collection = harness.collection('unit_database_registry');
  const syntheticUnitId = 'synthetic-unit-0001';

  assert.equal(harness.connection.kind, 'synthetic-base-global');
  assert.equal(harness.connection.environment, 'test');
  assert.equal(harness.connection.mode, 'memory');
  assert.strictEqual(harness.connection.db, harness.db);
  assert.equal(typeof harness.db.collection, 'function');
  assert.equal(typeof collection.insertOne, 'function');
  assert.equal(typeof collection.findOne, 'function');
  assert.equal(typeof collection.updateOne, 'function');

  await collection.insertOne({
    unidadeId: syntheticUnitId,
    status: 'pending',
  });

  const inserted = await collection.findOne({ unidadeId: syntheticUnitId });
  assert.deepEqual(inserted, {
    unidadeId: syntheticUnitId,
    status: 'pending',
  });

  assert.equal('connect' in harness.connection, false);
  assert.equal(['create', 'Connection'].join('') in harness.connection, false);
  assert.equal('useDb' in harness.connection, false);
  assert.equal('listen' in harness.connection, false);
  assert.equal('route' in harness.connection, false);
  assert.equal('post' in harness.connection, false);
  assert.equal('get' in harness.connection, false);
  assert.equal('start' in harness.connection, false);
  assert.equal('bootstrap' in harness.connection, false);
});

test('writer permanece compativel com harness sintetico local sem Mongo real nem tenant DB real', async () => {
  const originalDb = mongoose.connection.db;
  const harness = createSyntheticBaseConnectionHarness();

  mongoose.connection.db = harness.db;

  try {
    const { registerUnitDatabaseRegistryPending, markUnitDatabaseRegistryReady } = await loadWriterModuleFresh();

    const pendingEntry = await registerUnitDatabaseRegistryPending({
      unidadeId: 'synthetic-unit-0002',
      dbName: 'wdgestor_unit_synthetic_unit_0002',
      databaseKey: 'wdgestor_unit_synthetic_unit_0002',
    });

    assert.equal(pendingEntry.status, 'pending');
    assert.equal(pendingEntry.routingMode, 'base');

    const readyEntry = await markUnitDatabaseRegistryReady({
      unidadeId: 'synthetic-unit-0002',
      reason: 'synthetic-contract-check',
    });

    assert.equal(readyEntry.status, 'ready');
    assert.equal(readyEntry.routingMode, 'base');
    assert.equal(readyEntry.readiness.ready, true);

    assert.deepEqual(harness.read('synthetic-unit-0002'), readyEntry);
  } finally {
    mongoose.connection.db = originalDb;
  }
});

test('seam atual permanece ancorado em getConnectionForUnit(null) e connection.db.collection', async () => {
  const writerSource = fs.readFileSync(writerSourceFilePath, 'utf8');
  const connectionFactorySource = fs.readFileSync(connectionFactorySourceFilePath, 'utf8');

  assert.match(writerSource, /getConnectionForUnit\(null\)/);
  assert.match(writerSource, /connection\?\.db\?\.collection/);
  assert.match(writerSource, /unit_database_registry/);
  assert.match(connectionFactorySource, /connections\.set\(key, mongoose\.connection\)/);
  assert.match(connectionFactorySource, /const key = unidadeId \?\? null/);
});

test('teste contratual do harness nao cria superficie operacional nem dependencias proibidas', async () => {
  const harness = createSyntheticBaseConnectionHarness();
  const source = fs.readFileSync(currentTestFilePath, 'utf8');
  const harnessFactorySource = createSyntheticBaseConnectionHarness.toString();
  const importedSpecifiers = Array.from(
    source.matchAll(/^import .* from '([^']+)'/gm),
    (match) => match[1]
  ).sort();
  const forbiddenHarnessSnippets = [
    ['connect', '('].join(''),
    'create' + 'Connection',
    'MONGO' + '_URI',
    'MONGODB' + '_URI',
    'post' + 'gres',
    'post' + 'gresql',
    ['useDb', '('].join(''),
  ];
  const forbiddenImportSpecifiers = [
    ['src', 'start.js'].join('/'),
    ['create', 'Server.js'].join(''),
    ['server', '.js'].join(''),
  ];

  assert.deepEqual(importedSpecifiers, [
    'mongoose',
    'node:assert/strict',
    'node:fs',
    'node:path',
    'node:test',
    'node:url',
  ]);

  for (const snippet of forbiddenHarnessSnippets) {
    assert.equal(harnessFactorySource.includes(snippet), false);
  }

  for (const specifier of forbiddenImportSpecifiers) {
    assert.equal(importedSpecifiers.includes(specifier), false);
  }

  assert.equal('listen' in harness, false);
  assert.equal('route' in harness, false);
  assert.equal('post' in harness, false);
  assert.equal('get' in harness, false);
  assert.equal('run' in harness, false);
  assert.equal('job' in harness, false);
  assert.equal('bootstrap' in harness, false);
  assert.equal('request' in harness, false);
  assert.equal('argv' in harness, false);
});