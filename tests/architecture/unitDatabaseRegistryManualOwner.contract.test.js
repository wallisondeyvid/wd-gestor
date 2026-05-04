import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const resolveConnectionModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/resolveConnection.js')
).href;

const writerModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryWriter.js')
).href;

const manualOwnerModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryManualOwner.js')
).href;

const registryModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistry.js')
).href;

const manualOwnerSourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/unitDatabaseRegistryManualOwner.js'
);

let resolveConnectionImportNonce = 0;
let writerImportNonce = 0;
let manualOwnerImportNonce = 0;

async function loadResolveConnectionFresh() {
  resolveConnectionImportNonce += 1;
  return import(`${resolveConnectionModuleUrl}?test=${resolveConnectionImportNonce}`);
}

async function loadWriterModuleFresh() {
  writerImportNonce += 1;
  return import(`${writerModuleUrl}?test=${writerImportNonce}`);
}

async function loadManualOwnerModuleFresh() {
  manualOwnerImportNonce += 1;
  return import(`${manualOwnerModuleUrl}?test=${manualOwnerImportNonce}`);
}

async function loadRegistryModuleShared() {
  return import(registryModuleUrl);
}

function normalizeRequiredString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
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

async function runManualOwnerHarness(callback) {
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
  const writerModule = await loadWriterModuleFresh();
  const manualOwnerModule = await loadManualOwnerModuleFresh();
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
      harness,
      manualOwner: manualOwnerModule.runUnitDatabaseRegistryManualOwner,
      registry,
      resolveConnection: resolveConnectionModule.resolveConnection,
      setAllowlist(unidadeId) {
        setEnvFlag('WD_MULTI_DB_ALLOWLIST', unidadeId);
      },
      tenantConn,
      useDbCalls,
      writerModule,
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

test('owner manual real existe como modulo interno minimo e nao importa routing nem mutacao direta de registry', async () => {
  await runManualOwnerHarness(async ({ manualOwner }) => {
    const source = fs.readFileSync(manualOwnerSourceFilePath, 'utf8');

    assert.equal(typeof manualOwner, 'function');
    assert.match(source, /runUnitDatabaseRegistryManualOwner/);
    assert.match(source, /registerUnitDatabaseRegistryPending/);
    assert.match(source, /markUnitDatabaseRegistryReady/);
    assert.match(source, /activateUnitDatabaseRegistry/);
    assert.match(source, /from '#shared\/db\/unitDatabaseRegistryWriter\.js'/);
    assert.doesNotMatch(source, /resolveConnection/);
    assert.doesNotMatch(source, /readUnitDatabaseRegistry/);
    assert.doesNotMatch(source, /setUnitDatabaseRegistryCacheEntry/);
    assert.doesNotMatch(source, /primeUnitDatabaseRegistryCache/);
    assert.doesNotMatch(source, /collection\(/);
  });
});

test('owner manual futuro aceita apenas contexto manual explicito e recusa callers automaticos ou oportunistas', async () => {
  await runManualOwnerHarness(async ({ manualOwner }) => {
    const target = {
      unidadeId: '000000000000000000000030',
      dbName: 'wdgestor_unit_000000000000000000000030',
      databaseKey: 'wdgestor_unit_000000000000000000000030',
    };

    const accepted = await manualOwner({
      ...target,
      context: {
        source: 'manual',
        approved: true,
        reason: 'pilot-manual-owner',
        actor: 'operador-fase-f',
      },
    });

    assert.deepEqual(accepted, {
      ok: true,
      unidadeId: target.unidadeId,
      actor: 'operador-fase-f',
      reason: 'pilot-manual-owner',
      finalStatus: 'active',
    });

    const invalidCases = [
      {
        label: 'contexto ausente',
        input: undefined,
        code: 'MANUAL_OWNER_CONTEXT_REQUIRED',
      },
      {
        label: 'source automatico',
        input: { source: 'automatic', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source oportunista',
        input: { source: 'opportunistic', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source request path',
        input: { source: 'request_path', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source rota',
        input: { source: 'route', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source cli',
        input: { source: 'cli', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source script',
        input: { source: 'script', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source job',
        input: { source: 'job', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'source bootstrap',
        input: { source: 'bootstrap', approved: true, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      },
      {
        label: 'approved falso',
        input: { source: 'manual', approved: false, reason: 'x', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_NOT_APPROVED',
      },
      {
        label: 'reason vazia',
        input: { source: 'manual', approved: true, reason: ' ', actor: 'dev' },
        code: 'MANUAL_OWNER_CONTEXT_REASON_REQUIRED',
      },
      {
        label: 'actor vazio',
        input: { source: 'manual', approved: true, reason: 'x', actor: ' ' },
        code: 'MANUAL_OWNER_CONTEXT_ACTOR_REQUIRED',
      },
    ];

    for (const invalidCase of invalidCases) {
      await assert.rejects(
        () => manualOwner({
          ...target,
          context: invalidCase.input,
        }),
        (error) => error?.code === invalidCase.code,
        invalidCase.label
      );
    }
  });
});

test('owner manual futuro orquestra pending -> ready -> active so via writer e depende dos gates para abrir tenant', async () => {
  await runManualOwnerHarness(async ({ harness, manualOwner, registry, resolveConnection, setAllowlist, tenantConn, useDbCalls }) => {
    const unidadeId = '000000000000000000000031';

    const result = await manualOwner({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      context: {
        source: 'manual',
        approved: true,
        reason: 'manual-owner-approved',
        actor: 'operador-fase-f',
      },
    });

    const activeEntry = harness.read(unidadeId);
    assert.ok(activeEntry);
    assert.equal(activeEntry.status, 'active');
    assert.equal(activeEntry.routingMode, 'tenant');
    assert.equal(activeEntry.readiness?.ready, true);
    assert.equal(activeEntry.activation?.active, true);
    assert.deepEqual(result, {
      ok: true,
      unidadeId,
      actor: 'operador-fase-f',
      reason: 'manual-owner-approved',
      finalStatus: 'active',
    });

    await primeRegistryCache(registry, unidadeId);
    const withoutAllowlist = resolveConnection({ unidadeId });
    assert.strictEqual(withoutAllowlist, mongoose.connection);
    assert.equal(useDbCalls.length, 0);

    setAllowlist(unidadeId);
    const withAllowlist = resolveConnection({ unidadeId });
    assert.strictEqual(withAllowlist, tenantConn);
    assert.equal(useDbCalls.length, 1);
  });
});

test('owner manual futuro preserva rollback fail-safe via writer sem rota, CLI, script, job ou bootstrap', async () => {
  await runManualOwnerHarness(async ({ harness, manualOwner, registry, resolveConnection, setAllowlist, tenantConn, useDbCalls, writerModule }) => {
    const unidadeId = '000000000000000000000032';

    await manualOwner({
      unidadeId,
      dbName: `wdgestor_unit_${unidadeId}`,
      databaseKey: `wdgestor_unit_${unidadeId}`,
      context: {
        source: 'manual',
        approved: true,
        reason: 'manual-owner-rollback-check',
        actor: 'operador-fase-f',
      },
    });

    setAllowlist(unidadeId);
    await primeRegistryCache(registry, unidadeId);
    assert.strictEqual(resolveConnection({ unidadeId }), tenantConn);

    await writerModule.markUnitDatabaseRegistryRollbackRequired({
      unidadeId,
      reason: 'manual-owner-rollback',
    });

    await primeRegistryCache(registry, unidadeId);
    const rollbackEntry = harness.read(unidadeId);
    const rollbackResult = resolveConnection({ unidadeId });

    assert.ok(rollbackEntry);
    assert.equal(rollbackEntry.status, 'rollback_required');
    assert.equal(rollbackEntry.routingMode, 'base');
    assert.equal(rollbackEntry.activation?.active, false);
    assert.strictEqual(rollbackResult, mongoose.connection);
    assert.equal(useDbCalls.length, 1);
  });
});