import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { createSyntheticBaseConnectionHarness } from '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js';

const manualEntrypointModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryManualEntrypoint.js')
).href;

const currentTestFilePath = path.join(
  process.cwd(),
  'tests/architecture/unitDatabaseRegistrySyntheticWriteWithHarness.contract.test.js'
);

let importNonce = 0;

async function loadManualEntrypointFresh() {
  importNonce += 1;
  return import(`${manualEntrypointModuleUrl}?test=${importNonce}`);
}

function buildSyntheticManualPayload() {
  return {
    context: {
      source: 'manual',
      approved: true,
      actor: 'synthetic-manual-operator',
      reason: 'synthetic manual controlled preparation candidate',
    },
    environment: 'non-production',
    syntheticUnit: {
      synthetic: true,
      controlled: true,
    },
    unidadeId: '000000000000000000000001',
    dbName: 'wdgestor_unit_000000000000000000000001',
    databaseKey: 'wdgestor_unit_000000000000000000000001',
    rollbackPlan: 'rollback synthetic tenant-registry-synthetic-unit-001 only',
    plannedAllowlist: ['000000000000000000000001'],
  };
}

test('manualEntrypoint -> manualOwner -> writer persiste fluxo sintetico completo em harness', async () => {
  const originalDb = mongoose.connection.db;
  const harness = createSyntheticBaseConnectionHarness();

  mongoose.connection.db = harness.db;

  try {
    const { runUnitDatabaseRegistryManualEntrypoint } = await loadManualEntrypointFresh();
    const payload = buildSyntheticManualPayload();

    const result = await runUnitDatabaseRegistryManualEntrypoint(payload);
    const persistedEntry = harness.read(payload.unidadeId);

    assert.equal(result.ok, true);
    assert.equal(result.unidadeId, payload.unidadeId);
    assert.equal(result.actor, payload.context.actor);
    assert.equal(result.reason, payload.context.reason);
    assert.equal(result.environment, payload.environment);
    assert.equal(result.syntheticUnit, true);
    assert.deepEqual(result.plannedAllowlist, payload.plannedAllowlist);
    assert.equal(result.rollbackPlan, payload.rollbackPlan);
    assert.deepEqual(result.postConditions, [
      'owner-called',
      'routing-remains-central-routing-owned',
      'resolveConnection-remains-separate-decision-point',
      'tenant-routing-validated-only-by-harness',
    ]);

    assert.equal(result.ownerResult?.ok, true);
    assert.equal(result.ownerResult?.unidadeId, payload.unidadeId);
    assert.equal(result.ownerResult?.actor, payload.context.actor);
    assert.equal(result.ownerResult?.reason, payload.context.reason);
    assert.equal(result.ownerResult?.finalStatus, 'active');

    assert.ok(persistedEntry);
    assert.equal(persistedEntry.unidadeId, payload.unidadeId);
    assert.equal(persistedEntry.dbName, payload.dbName);
    assert.equal(persistedEntry.databaseKey, payload.databaseKey);
    assert.equal(persistedEntry.status, 'active');
    assert.equal(persistedEntry.routingMode, 'tenant');
    assert.equal(persistedEntry.readiness?.ready, true);
    assert.equal(persistedEntry.readiness?.reason, payload.context.reason);
    assert.equal(persistedEntry.activation?.active, true);
    assert.ok(persistedEntry.activation?.activatedAt instanceof Date);
    assert.ok(persistedEntry.updatedAt instanceof Date);
    assert.equal('lastError' in persistedEntry, false);
    assert.equal('deactivatedAt' in (persistedEntry.activation || {}), false);
  } finally {
    mongoose.connection.db = originalDb;
    harness.reset();
  }
});

test('sem harness o fluxo continua bloqueado por base/global connection indisponivel e nao cria entry', async () => {
  const originalDb = mongoose.connection.db;
  const harness = createSyntheticBaseConnectionHarness();

  mongoose.connection.db = null;

  try {
    const { runUnitDatabaseRegistryManualEntrypoint } = await loadManualEntrypointFresh();
    const payload = buildSyntheticManualPayload();

    await assert.rejects(
      () => runUnitDatabaseRegistryManualEntrypoint(payload),
      (error) => (
        error?.code === 'UNIT_DATABASE_REGISTRY_BASE_CONNECTION_UNAVAILABLE' ||
        /BASE_CONNECTION_UNAVAILABLE/.test(String(error?.code || ''))
      )
    );

    assert.equal(harness.read(payload.unidadeId), null);
  } finally {
    mongoose.connection.db = originalDb;
    harness.reset();
  }
});

test('teste permanece restrito a tests/architecture e sem superficie operacional', async () => {
  const source = fs.readFileSync(currentTestFilePath, 'utf8');
  const importedSpecifiers = Array.from(
    source.matchAll(/^import .* from '([^']+)'/gm),
    (match) => match[1]
  ).sort();
  const forbiddenSourceSnippets = [
    ['mongoose', '.connect('].join(''),
    'create' + 'Connection(',
    'MONGO' + '_URI',
    'MONGODB' + '_URI',
    'post' + 'gres',
    'post' + 'gresql',
    ['process', 'argv'].join('.'),
    ['ex', 'press'].join(''),
    ['start', '.js'].join(''),
    ['create', 'Server.js'].join(''),
    ['server', '.js'].join(''),
    ['listen', '('].join(''),
    ['route', '('].join(''),
    ['boot', 'strap'].join(''),
    ['Por', 'tal'].join(''),
  ];

  assert.equal(currentTestFilePath.includes(path.join('tests', 'architecture')), true);
  assert.deepEqual(importedSpecifiers, [
    '../../src/shared/db/unitDatabaseRegistrySyntheticBaseConnectionHarness.js',
    'mongoose',
    'node:assert/strict',
    'node:fs',
    'node:path',
    'node:test',
    'node:url',
  ]);

  for (const snippet of forbiddenSourceSnippets) {
    assert.equal(source.includes(snippet), false);
  }
});