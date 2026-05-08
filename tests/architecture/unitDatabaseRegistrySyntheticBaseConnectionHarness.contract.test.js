import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { createSyntheticBaseConnectionHarness } from '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js';

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

const harnessModuleSourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js'
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

test('harness sintetico local opera somente em memoria e expoe base/global connection compativel', async () => {
  const harness = createSyntheticBaseConnectionHarness();
  const collection = harness.collection('unit_database_registry');
  const syntheticUnitId = 'synthetic-unit-0001';

  assert.equal(harness.connection.kind, 'synthetic-base-global');
  assert.equal(harness.connection.environment, 'synthetic');
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
  assert.equal(typeof harness.reset, 'function');

  harness.reset();
  assert.equal(harness.read(syntheticUnitId), null);
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
  const harnessModuleSource = fs.readFileSync(harnessModuleSourceFilePath, 'utf8');
  const importedSpecifiers = Array.from(
    source.matchAll(/^import .* from '([^']+)'/gm),
    (match) => match[1]
  ).sort();
  const forbiddenHarnessSnippets = [
    ['mongoose', 'connect'].join('.'),
    'create' + 'Connection',
    'MONGO' + '_URI',
    'MONGODB' + '_URI',
    'post' + 'gres',
    'post' + 'gresql',
    ['process', 'argv'].join('.'),
    'express',
    ['useDb', '('].join(''),
    'listen(',
    'route(',
  ];
  const forbiddenImportSpecifiers = [
    ['src', 'start.js'].join('/'),
    ['create', 'Server.js'].join(''),
    ['server', '.js'].join(''),
  ];

  assert.deepEqual(importedSpecifiers, [
    '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
    'mongoose',
    'node:assert/strict',
    'node:fs',
    'node:path',
    'node:test',
    'node:url',
  ]);

  for (const snippet of forbiddenHarnessSnippets) {
    assert.equal(harnessModuleSource.includes(snippet), false);
  }

  for (const specifier of forbiddenImportSpecifiers) {
    assert.equal(importedSpecifiers.includes(specifier), false);
  }

  assert.equal(harnessModuleSource.includes("from 'mongoose'"), false);
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