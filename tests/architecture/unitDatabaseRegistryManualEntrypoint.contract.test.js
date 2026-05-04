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

const entrypointDocPath = path.join(
  process.cwd(),
  'docs/tenant-phase-g-manual-entrypoint-plan.md'
);

const manualOwnerSourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/unitDatabaseRegistryManualOwner.js'
);

const entrypointContractTestFilePath = path.join(
  process.cwd(),
  'tests/architecture/unitDatabaseRegistryManualEntrypoint.contract.test.js'
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

function createManualEntrypointError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
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

function validateManualEntrypointInput(input) {
  if (!input || typeof input !== 'object') {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_CONTEXT_REQUIRED',
      'Manual entrypoint requires explicit input.'
    );
  }

  const context = input.context;
  if (!context || typeof context !== 'object') {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_CONTEXT_REQUIRED',
      'Manual entrypoint requires explicit manual context.'
    );
  }

  const source = normalizeRequiredString(context.source)?.toLowerCase();
  if (source !== 'manual') {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_INVALID_SOURCE',
      'Manual entrypoint accepts only source=manual.'
    );
  }

  if (context.approved !== true) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_NOT_APPROVED',
      'Manual entrypoint requires approved=true.'
    );
  }

  const actor = normalizeRequiredString(context.actor);
  if (!actor) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_ACTOR_REQUIRED',
      'Manual entrypoint requires a non-empty actor.'
    );
  }

  const reason = normalizeRequiredString(context.reason);
  if (!reason) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_REASON_REQUIRED',
      'Manual entrypoint requires a non-empty reason.'
    );
  }

  const environment = normalizeRequiredString(input.environment)?.toLowerCase();
  if (!environment || environment === 'prod' || environment === 'production') {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_NON_PROD_REQUIRED',
      'Manual entrypoint requires a non-production environment.'
    );
  }

  if (input.syntheticUnit !== true) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_SYNTHETIC_UNIT_REQUIRED',
      'Manual entrypoint accepts only synthetic or controlled units.'
    );
  }

  const rollbackPlan = normalizeRequiredString(input.rollbackPlan);
  if (!rollbackPlan) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_ROLLBACK_PLAN_REQUIRED',
      'Manual entrypoint requires a rollback plan.'
    );
  }

  const plannedAllowlist = Array.isArray(input.plannedAllowlist)
    ? input.plannedAllowlist
        .map((value) => normalizeRequiredString(value))
        .filter(Boolean)
    : [];

  if (plannedAllowlist.length !== 1) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_PLANNED_ALLOWLIST_REQUIRED',
      'Manual entrypoint requires a single planned allowlist target.'
    );
  }

  const unidadeId = normalizeRequiredString(input.unidadeId);
  const dbName = normalizeRequiredString(input.dbName);
  const databaseKey = normalizeRequiredString(input.databaseKey);
  const expectedDbName = unidadeId ? `wdgestor_unit_${unidadeId}` : null;

  if (!unidadeId || !dbName || !databaseKey || dbName !== expectedDbName || databaseKey !== expectedDbName) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_TARGET_MISMATCH',
      'Manual entrypoint requires coherent unidadeId, dbName and databaseKey.'
    );
  }

  if (plannedAllowlist[0] !== unidadeId) {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_PLANNED_ALLOWLIST_MISMATCH',
      'Manual entrypoint requires planned allowlist matching the target unit.'
    );
  }

  return {
    unidadeId,
    dbName,
    databaseKey,
    environment,
    syntheticUnit: true,
    plannedAllowlist,
    rollbackPlan,
    context: {
      source,
      approved: true,
      actor,
      reason,
    },
  };
}

async function runManualEntrypointHarness(input, manualOwner) {
  const normalizedInput = validateManualEntrypointInput(input);
  const ownerResult = await manualOwner({
    unidadeId: normalizedInput.unidadeId,
    dbName: normalizedInput.dbName,
    databaseKey: normalizedInput.databaseKey,
    context: normalizedInput.context,
  });

  return {
    ok: true,
    unidadeId: normalizedInput.unidadeId,
    actor: normalizedInput.context.actor,
    reason: normalizedInput.context.reason,
    environment: normalizedInput.environment,
    syntheticUnit: normalizedInput.syntheticUnit,
    plannedAllowlist: normalizedInput.plannedAllowlist,
    rollbackPlan: normalizedInput.rollbackPlan,
    ownerResult,
    postConditions: [
      'owner-called',
      'routing-remains-central-routing-owned',
      'tenant-routing-validated-only-by-harness',
    ],
    rollbackHint: 'remove-allowlist-or-disable-via-writer',
  };
}

async function runManualEntrypointContractHarness(callback) {
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
      registry,
      tenantConn,
      useDbCalls,
      writerModule,
      manualOwner: manualOwnerModule.runUnitDatabaseRegistryManualOwner,
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

function collectWorkspaceFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      filePaths.push(...collectWorkspaceFiles(absolutePath));
      continue;
    }

    filePaths.push(absolutePath);
  }

  return filePaths;
}

test('helper local do entrypoint manual deliberado recusa pre-condicoes ausentes ou invalidas', async () => {
  const baseInput = {
    unidadeId: '000000000000000000000040',
    dbName: 'wdgestor_unit_000000000000000000000040',
    databaseKey: 'wdgestor_unit_000000000000000000000040',
    environment: 'staging',
    syntheticUnit: true,
    plannedAllowlist: ['000000000000000000000040'],
    rollbackPlan: 'remove allowlist then disable',
    context: {
      source: 'manual',
      approved: true,
      actor: 'operador-fase-g',
      reason: 'manual-entrypoint-contract',
    },
  };

  const invalidCases = [
    {
      label: 'ausencia de contexto manual',
      mutate(input) {
        return { ...input, context: undefined };
      },
      code: 'MANUAL_ENTRYPOINT_CONTEXT_REQUIRED',
    },
    {
      label: 'source diferente de manual',
      mutate(input) {
        return { ...input, context: { ...input.context, source: 'route' } };
      },
      code: 'MANUAL_ENTRYPOINT_INVALID_SOURCE',
    },
    {
      label: 'approved diferente de true',
      mutate(input) {
        return { ...input, context: { ...input.context, approved: false } };
      },
      code: 'MANUAL_ENTRYPOINT_NOT_APPROVED',
    },
    {
      label: 'actor vazio',
      mutate(input) {
        return { ...input, context: { ...input.context, actor: ' ' } };
      },
      code: 'MANUAL_ENTRYPOINT_ACTOR_REQUIRED',
    },
    {
      label: 'reason vazia',
      mutate(input) {
        return { ...input, context: { ...input.context, reason: ' ' } };
      },
      code: 'MANUAL_ENTRYPOINT_REASON_REQUIRED',
    },
    {
      label: 'ambiente produtivo',
      mutate(input) {
        return { ...input, environment: 'production' };
      },
      code: 'MANUAL_ENTRYPOINT_NON_PROD_REQUIRED',
    },
    {
      label: 'unidade nao sintetica',
      mutate(input) {
        return { ...input, syntheticUnit: false };
      },
      code: 'MANUAL_ENTRYPOINT_SYNTHETIC_UNIT_REQUIRED',
    },
    {
      label: 'ausencia de plano de rollback',
      mutate(input) {
        return { ...input, rollbackPlan: ' ' };
      },
      code: 'MANUAL_ENTRYPOINT_ROLLBACK_PLAN_REQUIRED',
    },
    {
      label: 'ausencia de allowlist unitaria planejada',
      mutate(input) {
        return { ...input, plannedAllowlist: [] };
      },
      code: 'MANUAL_ENTRYPOINT_PLANNED_ALLOWLIST_REQUIRED',
    },
    {
      label: 'incoerencia entre unidadeId dbName e databaseKey',
      mutate(input) {
        return {
          ...input,
          dbName: 'wdgestor_unit_incoerente',
          databaseKey: 'wdgestor_unit_incoerente',
        };
      },
      code: 'MANUAL_ENTRYPOINT_TARGET_MISMATCH',
    },
  ];

  for (const invalidCase of invalidCases) {
    await assert.rejects(
      () => runManualEntrypointHarness(invalidCase.mutate(baseInput), async () => ({ ok: true })),
      (error) => error?.code === invalidCase.code,
      invalidCase.label
    );
  }
});

test('helper local do entrypoint aceita contexto deliberado completo, chama o owner e retorna relatorio deterministico minimo', async () => {
  await runManualEntrypointContractHarness(async ({ harness, manualOwner, registry, resolveConnection, setAllowlist, tenantConn, useDbCalls, writerModule }) => {
    const unidadeId = '000000000000000000000040';
    let ownerCalls = 0;
    const countedManualOwner = async (input) => {
      ownerCalls += 1;
      return manualOwner(input);
    };

    const result = await runManualEntrypointHarness(
      {
        unidadeId,
        dbName: `wdgestor_unit_${unidadeId}`,
        databaseKey: `wdgestor_unit_${unidadeId}`,
        environment: 'staging',
        syntheticUnit: true,
        plannedAllowlist: [unidadeId],
        rollbackPlan: 'remove allowlist then mark rollback_required',
        context: {
          source: 'manual',
          approved: true,
          actor: 'operador-fase-g',
          reason: 'manual-entrypoint-approved',
        },
      },
      countedManualOwner
    );

    assert.equal(ownerCalls, 1);
    assert.deepEqual(result, {
      ok: true,
      unidadeId,
      actor: 'operador-fase-g',
      reason: 'manual-entrypoint-approved',
      environment: 'staging',
      syntheticUnit: true,
      plannedAllowlist: [unidadeId],
      rollbackPlan: 'remove allowlist then mark rollback_required',
      ownerResult: {
        ok: true,
        unidadeId,
        actor: 'operador-fase-g',
        reason: 'manual-entrypoint-approved',
        finalStatus: 'active',
      },
      postConditions: [
        'owner-called',
        'routing-remains-central-routing-owned',
        'tenant-routing-validated-only-by-harness',
      ],
      rollbackHint: 'remove-allowlist-or-disable-via-writer',
    });

    const activeEntry = harness.read(unidadeId);
    assert.ok(activeEntry);
    assert.equal(activeEntry.status, 'active');
    assert.equal(activeEntry.routingMode, 'tenant');
    assert.equal(activeEntry.activation?.active, true);

    await primeRegistryCache(registry, unidadeId);
    const withoutAllowlist = resolveConnection({ unidadeId });
    assert.strictEqual(withoutAllowlist, mongoose.connection);
    assert.equal(useDbCalls.length, 0);

    setAllowlist(unidadeId);
    const withAllowlist = resolveConnection({ unidadeId });
    assert.strictEqual(withAllowlist, tenantConn);
    assert.equal(useDbCalls.length, 1);

    await writerModule.disableUnitDatabaseRegistry({
      unidadeId,
      reason: 'manual-entrypoint-disable',
    });

    await primeRegistryCache(registry, unidadeId);
    const rollbackResult = resolveConnection({ unidadeId });
    const disabledEntry = harness.read(unidadeId);
    assert.ok(disabledEntry);
    assert.equal(disabledEntry.status, 'disabled');
    assert.equal(disabledEntry.routingMode, 'base');
    assert.equal(disabledEntry.activation?.active, false);
    assert.strictEqual(rollbackResult, mongoose.connection);
    assert.equal(useDbCalls.length, 1);
  });
});

test('contrato estrutural do helper local preserva a borda manual e nao importa superficies proibidas', async () => {
  const source = fs.readFileSync(entrypointContractTestFilePath, 'utf8');
  const helperSource = runManualEntrypointHarness.toString();
  const docSource = fs.readFileSync(entrypointDocPath, 'utf8');
  const manualOwnerSource = fs.readFileSync(manualOwnerSourceFilePath, 'utf8');

  assert.match(docSource, /wrapper manual e deliberado sobre `runUnitDatabaseRegistryManualOwner`/);
  assert.match(manualOwnerSource, /runUnitDatabaseRegistryManualOwner/);
  assert.doesNotMatch(source, /#shared\/db\/unitDatabaseRegistryPreload\.js/);
  assert.doesNotMatch(source, /pagesRouter\.js/);
  assert.doesNotMatch(source, /api\.js/);
  assert.doesNotMatch(source, /package\.json/);
  assert.doesNotMatch(helperSource, /registerUnitDatabaseRegistryPending/);
  assert.doesNotMatch(helperSource, /markUnitDatabaseRegistryReady/);
  assert.doesNotMatch(helperSource, /activateUnitDatabaseRegistry/);
  assert.doesNotMatch(helperSource, /disableUnitDatabaseRegistry/);
  assert.doesNotMatch(helperSource, /resolveConnection/);
  assert.doesNotMatch(helperSource, /useDb/);
  assert.doesNotMatch(helperSource, /bootstrap/i);
  assert.doesNotMatch(helperSource, /preload/i);
  assert.doesNotMatch(helperSource, /route/i);
  assert.doesNotMatch(helperSource, /cli/i);
  assert.doesNotMatch(helperSource, /script/i);
  assert.doesNotMatch(helperSource, /job/i);
});

test('nao ha caller real novo para runUnitDatabaseRegistryManualOwner fora do proprio modulo e dos testes', async () => {
  const srcRoot = path.join(process.cwd(), 'src');
  const srcFiles = collectWorkspaceFiles(srcRoot).filter((filePath) => filePath.endsWith('.js'));
  const matchingSrcFiles = srcFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return source.includes('runUnitDatabaseRegistryManualOwner');
  });

  assert.deepEqual(matchingSrcFiles, [manualOwnerSourceFilePath]);
});