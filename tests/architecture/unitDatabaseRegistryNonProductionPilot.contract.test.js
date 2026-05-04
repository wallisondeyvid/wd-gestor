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

const manualEntrypointModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistryManualEntrypoint.js')
).href;

const registryModuleUrl = pathToFileURL(
  path.join(process.cwd(), 'src/shared/db/unitDatabaseRegistry.js')
).href;

const pilotDocPath = path.join(
  process.cwd(),
  'docs/tenant-phase-g-non-production-pilot-plan.md'
);

const manualEntrypointSourceFilePath = path.join(
  process.cwd(),
  'src/shared/db/unitDatabaseRegistryManualEntrypoint.js'
);

const nonProductionPilotContractTestFilePath = path.join(
  process.cwd(),
  'tests/architecture/unitDatabaseRegistryNonProductionPilot.contract.test.js'
);

let resolveConnectionImportNonce = 0;
let writerImportNonce = 0;
let manualEntrypointImportNonce = 0;

async function loadResolveConnectionFresh() {
  resolveConnectionImportNonce += 1;
  return import(`${resolveConnectionModuleUrl}?test=${resolveConnectionImportNonce}`);
}

async function loadWriterModuleFresh() {
  writerImportNonce += 1;
  return import(`${writerModuleUrl}?test=${writerImportNonce}`);
}

async function loadManualEntrypointModuleFresh() {
  manualEntrypointImportNonce += 1;
  return import(`${manualEntrypointModuleUrl}?test=${manualEntrypointImportNonce}`);
}

async function loadRegistryModuleShared() {
  return import(registryModuleUrl);
}

function createPilotHarnessError(code, message, cause) {
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

function normalizeSyntheticUnit(input) {
  if (input === true) {
    return {
      enabled: true,
      realUnit: false,
      realData: false,
      realTraffic: false,
    };
  }

  if (!input || typeof input !== 'object') {
    return {
      enabled: false,
      realUnit: false,
      realData: false,
      realTraffic: false,
    };
  }

  return {
    enabled: input.synthetic === true || input.controlled === true,
    realUnit: input.realUnit === true,
    realData: input.realData === true,
    realTraffic: input.realTraffic === true,
  };
}

function buildDerivedUnitId(unidadeId, suffix) {
  return `${String(unidadeId).slice(0, 22)}${suffix}`;
}

function validateNonProductionPilotInput(input = {}) {
  const environment = normalizeRequiredString(input.environment)?.toLowerCase();
  if (!environment || environment === 'production' || environment === 'prod' || environment === 'producao') {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_NON_PROD_REQUIRED',
      'Non-production pilot requires a non-production environment.'
    );
  }

  const syntheticUnit = normalizeSyntheticUnit(input.syntheticUnit);
  if (!syntheticUnit.enabled) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_SYNTHETIC_UNIT_REQUIRED',
      'Non-production pilot requires a synthetic or controlled unit.'
    );
  }

  if (syntheticUnit.realUnit === true) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_REAL_UNIT_FORBIDDEN',
      'Non-production pilot forbids real units.'
    );
  }

  if (syntheticUnit.realData === true) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_REAL_DATA_FORBIDDEN',
      'Non-production pilot forbids real data.'
    );
  }

  if (syntheticUnit.realTraffic === true) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_REAL_TRAFFIC_FORBIDDEN',
      'Non-production pilot forbids real traffic.'
    );
  }

  const rollbackPlan = normalizeRequiredString(input.rollbackPlan);
  if (!rollbackPlan) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_ROLLBACK_PLAN_REQUIRED',
      'Non-production pilot requires a rollback plan.'
    );
  }

  const plannedAllowlist = Array.isArray(input.plannedAllowlist)
    ? input.plannedAllowlist.map((value) => normalizeRequiredString(value)).filter(Boolean)
    : [];

  if (plannedAllowlist.length === 0) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_ALLOWLIST_REQUIRED',
      'Non-production pilot requires a planned allowlist target.'
    );
  }

  if (plannedAllowlist.length !== 1) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_ALLOWLIST_UNITARY_REQUIRED',
      'Non-production pilot requires a single planned allowlist target.'
    );
  }

  const context = input.context;
  const source = normalizeRequiredString(context?.source)?.toLowerCase();
  if (source !== 'manual') {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_CONTEXT_MANUAL_REQUIRED',
      'Non-production pilot requires source=manual.'
    );
  }

  if (context?.approved !== true) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_CONTEXT_APPROVED_REQUIRED',
      'Non-production pilot requires approved=true.'
    );
  }

  const actor = normalizeRequiredString(context?.actor);
  if (!actor) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_CONTEXT_ACTOR_REQUIRED',
      'Non-production pilot requires a non-empty actor.'
    );
  }

  const reason = normalizeRequiredString(context?.reason);
  if (!reason) {
    throw createPilotHarnessError(
      'NON_PRODUCTION_PILOT_CONTEXT_REASON_REQUIRED',
      'Non-production pilot requires a non-empty reason.'
    );
  }

  return {
    unidadeId: normalizeRequiredString(input.unidadeId),
    dbName: normalizeRequiredString(input.dbName),
    databaseKey: normalizeRequiredString(input.databaseKey),
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

async function runNonProductionPilotHarness(input, deps) {
  const normalizedInput = validateNonProductionPilotInput(input);
  const pendingUnitId = buildDerivedUnitId(normalizedInput.unidadeId, 'a1');
  const readyUnitId = buildDerivedUnitId(normalizedInput.unidadeId, 'a2');
  const useDbCallsBeforePositiveCase = deps.useDbCalls.length;

  await deps.writerModule.registerUnitDatabaseRegistryPending({
    unidadeId: pendingUnitId,
    dbName: `wdgestor_unit_${pendingUnitId}`,
    databaseKey: `wdgestor_unit_${pendingUnitId}`,
  });
  await primeRegistryCache(deps.registry, pendingUnitId);
  const pendingResult = deps.resolveConnection({ unidadeId: pendingUnitId });
  assert.strictEqual(pendingResult, mongoose.connection);

  await deps.writerModule.registerUnitDatabaseRegistryPending({
    unidadeId: readyUnitId,
    dbName: `wdgestor_unit_${readyUnitId}`,
    databaseKey: `wdgestor_unit_${readyUnitId}`,
  });
  await deps.writerModule.markUnitDatabaseRegistryReady({
    unidadeId: readyUnitId,
    reason: 'non-production-pilot-ready-check',
  });
  await primeRegistryCache(deps.registry, readyUnitId);
  const readyResult = deps.resolveConnection({ unidadeId: readyUnitId });
  assert.strictEqual(readyResult, mongoose.connection);

  const entrypointResult = await deps.manualEntrypoint({
    unidadeId: normalizedInput.unidadeId,
    dbName: normalizedInput.dbName,
    databaseKey: normalizedInput.databaseKey,
    environment: normalizedInput.environment,
    syntheticUnit: true,
    plannedAllowlist: normalizedInput.plannedAllowlist,
    rollbackPlan: normalizedInput.rollbackPlan,
    context: normalizedInput.context,
  });

  await primeRegistryCache(deps.registry, normalizedInput.unidadeId);
  const activeWithoutAllowlist = deps.resolveConnection({ unidadeId: normalizedInput.unidadeId });
  assert.strictEqual(activeWithoutAllowlist, mongoose.connection);
  assert.equal(deps.useDbCalls.length, useDbCallsBeforePositiveCase);

  deps.setAllowlist(normalizedInput.unidadeId);
  const activeWithAllowlist = deps.resolveConnection({ unidadeId: normalizedInput.unidadeId });
  assert.strictEqual(activeWithAllowlist, deps.tenantConn);
  assert.equal(deps.useDbCalls.length, useDbCallsBeforePositiveCase + 1);

  deps.clearAllowlist();
  const missingGateResult = deps.resolveConnection({ unidadeId: normalizedInput.unidadeId });
  assert.strictEqual(missingGateResult, mongoose.connection);

  await deps.writerModule.disableUnitDatabaseRegistry({
    unidadeId: normalizedInput.unidadeId,
    reason: 'non-production-pilot-rollback',
  });
  await primeRegistryCache(deps.registry, normalizedInput.unidadeId);
  const rollbackConnection = deps.resolveConnection({ unidadeId: normalizedInput.unidadeId });
  assert.strictEqual(rollbackConnection, mongoose.connection);

  const finalEntry = deps.harness.read(normalizedInput.unidadeId);
  assert.ok(finalEntry);
  assert.equal(finalEntry.status, 'disabled');
  assert.equal(finalEntry.routingMode, 'base');
  assert.equal(finalEntry.activation?.active, false);

  return {
    ok: true,
    unidadeId: normalizedInput.unidadeId,
    environment: normalizedInput.environment,
    syntheticUnit: normalizedInput.syntheticUnit,
    plannedAllowlist: normalizedInput.plannedAllowlist,
    rollbackPlan: normalizedInput.rollbackPlan,
    entrypointResult,
    evidence: [
      'entrypoint-executed',
      'owner-called-indirectly',
      'pending-does-not-open-tenant',
      'ready-does-not-open-tenant',
      'active-without-allowlist-does-not-open-tenant',
      'active-with-gates-opens-tenant',
      'missing-gate-returns-to-baseConnection',
      'rollback-returns-to-baseConnection',
      'no-real-caller',
      'no-real-traffic',
      'no-real-data',
    ],
    successCriteria: [
      'single-controlled-unit-only',
      'positive-case-requires-all-gates',
      'fallback-restored-when-gate-removed',
      'rollback-restores-baseConnection',
      'no-new-operational-surface',
      'no-real-data',
      'no-real-caller',
    ],
    abortCriteria: [
      'real-unit-detected',
      'real-data-detected',
      'real-traffic-detected',
      'new-operational-surface-detected',
      'owner-bypass-detected',
      'direct-registry-write-detected',
      'entrypoint-routing-decision-detected',
      'resolveConnection-change-required',
      'fallback-or-rollback-failed',
    ],
    rollbackResult: {
      connection: 'baseConnection',
      status: finalEntry.status,
      routingMode: finalEntry.routingMode,
      activationActive: finalEntry.activation?.active === true,
    },
    finalState: {
      status: finalEntry.status,
      routingMode: finalEntry.routingMode,
      activationActive: finalEntry.activation?.active === true,
      activeConnection: 'baseConnection',
    },
  };
}

async function runNonProductionPilotContractHarness(callback) {
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
  const manualEntrypointModule = await loadManualEntrypointModuleFresh();
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
      manualEntrypoint: manualEntrypointModule.runUnitDatabaseRegistryManualEntrypoint,
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

test('harness do piloto nao produtivo recusa pre-condicoes proibidas antes de chamar o entrypoint', async () => {
  const baseInput = {
    unidadeId: '000000000000000000000050',
    dbName: 'wdgestor_unit_000000000000000000000050',
    databaseKey: 'wdgestor_unit_000000000000000000000050',
    environment: 'staging',
    syntheticUnit: {
      controlled: true,
      realUnit: false,
      realData: false,
      realTraffic: false,
    },
    plannedAllowlist: ['000000000000000000000050'],
    rollbackPlan: 'remove allowlist then disable',
    context: {
      source: 'manual',
      approved: true,
      actor: 'operador-fase-g',
      reason: 'non-production-pilot-contract',
    },
  };

  const invalidCases = [
    {
      label: 'ambiente produtivo',
      mutate(input) {
        return { ...input, environment: 'production' };
      },
      code: 'NON_PRODUCTION_PILOT_NON_PROD_REQUIRED',
    },
    {
      label: 'unidade real',
      mutate(input) {
        return {
          ...input,
          syntheticUnit: { ...input.syntheticUnit, realUnit: true },
        };
      },
      code: 'NON_PRODUCTION_PILOT_REAL_UNIT_FORBIDDEN',
    },
    {
      label: 'dados reais',
      mutate(input) {
        return {
          ...input,
          syntheticUnit: { ...input.syntheticUnit, realData: true },
        };
      },
      code: 'NON_PRODUCTION_PILOT_REAL_DATA_FORBIDDEN',
    },
    {
      label: 'trafego real',
      mutate(input) {
        return {
          ...input,
          syntheticUnit: { ...input.syntheticUnit, realTraffic: true },
        };
      },
      code: 'NON_PRODUCTION_PILOT_REAL_TRAFFIC_FORBIDDEN',
    },
    {
      label: 'ausencia de rollbackPlan',
      mutate(input) {
        return { ...input, rollbackPlan: ' ' };
      },
      code: 'NON_PRODUCTION_PILOT_ROLLBACK_PLAN_REQUIRED',
    },
    {
      label: 'allowlist multipla',
      mutate(input) {
        return { ...input, plannedAllowlist: ['000000000000000000000050', '000000000000000000000051'] };
      },
      code: 'NON_PRODUCTION_PILOT_ALLOWLIST_UNITARY_REQUIRED',
    },
    {
      label: 'contexto nao manual',
      mutate(input) {
        return { ...input, context: { ...input.context, source: 'automatic' } };
      },
      code: 'NON_PRODUCTION_PILOT_CONTEXT_MANUAL_REQUIRED',
    },
    {
      label: 'approved diferente de true',
      mutate(input) {
        return { ...input, context: { ...input.context, approved: false } };
      },
      code: 'NON_PRODUCTION_PILOT_CONTEXT_APPROVED_REQUIRED',
    },
    {
      label: 'actor vazio',
      mutate(input) {
        return { ...input, context: { ...input.context, actor: ' ' } };
      },
      code: 'NON_PRODUCTION_PILOT_CONTEXT_ACTOR_REQUIRED',
    },
    {
      label: 'reason vazia',
      mutate(input) {
        return { ...input, context: { ...input.context, reason: ' ' } };
      },
      code: 'NON_PRODUCTION_PILOT_CONTEXT_REASON_REQUIRED',
    },
  ];

  await runNonProductionPilotContractHarness(async ({ manualEntrypoint, ...deps }) => {
    for (const invalidCase of invalidCases) {
      let entrypointCalls = 0;
      const countedManualEntrypoint = async (...args) => {
        entrypointCalls += 1;
        return manualEntrypoint(...args);
      };

      await assert.rejects(
        () => runNonProductionPilotHarness(invalidCase.mutate(baseInput), {
          ...deps,
          manualEntrypoint: countedManualEntrypoint,
        }),
        (error) => error?.code === invalidCase.code,
        invalidCase.label
      );

      assert.equal(entrypointCalls, 0, invalidCase.label);
    }
  });
});

test('harness do piloto nao produtivo aceita unidade controlada, usa o entrypoint real e produz evidencias deterministicas', async () => {
  await runNonProductionPilotContractHarness(async ({ manualEntrypoint, ...deps }) => {
    const unidadeId = '000000000000000000000050';
    const result = await runNonProductionPilotHarness(
      {
        unidadeId,
        dbName: `wdgestor_unit_${unidadeId}`,
        databaseKey: `wdgestor_unit_${unidadeId}`,
        environment: 'staging',
        syntheticUnit: {
          controlled: true,
          realUnit: false,
          realData: false,
          realTraffic: false,
        },
        plannedAllowlist: [unidadeId],
        rollbackPlan: 'remove allowlist then disable',
        context: {
          source: 'manual',
          approved: true,
          actor: 'operador-fase-g',
          reason: 'non-production-pilot-approved',
        },
      },
      {
        ...deps,
        manualEntrypoint,
      }
    );

    assert.deepEqual(result, {
      ok: true,
      unidadeId,
      environment: 'staging',
      syntheticUnit: true,
      plannedAllowlist: [unidadeId],
      rollbackPlan: 'remove allowlist then disable',
      entrypointResult: {
        ok: true,
        unidadeId,
        actor: 'operador-fase-g',
        reason: 'non-production-pilot-approved',
        environment: 'staging',
        syntheticUnit: true,
        plannedAllowlist: [unidadeId],
        rollbackPlan: 'remove allowlist then disable',
        ownerResult: {
          ok: true,
          unidadeId,
          actor: 'operador-fase-g',
          reason: 'non-production-pilot-approved',
          finalStatus: 'active',
        },
        postConditions: [
          'owner-called',
          'routing-remains-central-routing-owned',
          'resolveConnection-remains-separate-decision-point',
          'tenant-routing-validated-only-by-harness',
        ],
        rollbackHint: [
          'remove-allowlist',
          'deactivate-activation',
          'use-disabled-or-rollback_required',
          'preserve-baseConnection-fallback',
          'do-not-delete-entry-first',
        ],
      },
      evidence: [
        'entrypoint-executed',
        'owner-called-indirectly',
        'pending-does-not-open-tenant',
        'ready-does-not-open-tenant',
        'active-without-allowlist-does-not-open-tenant',
        'active-with-gates-opens-tenant',
        'missing-gate-returns-to-baseConnection',
        'rollback-returns-to-baseConnection',
        'no-real-caller',
        'no-real-traffic',
        'no-real-data',
      ],
      successCriteria: [
        'single-controlled-unit-only',
        'positive-case-requires-all-gates',
        'fallback-restored-when-gate-removed',
        'rollback-restores-baseConnection',
        'no-new-operational-surface',
        'no-real-data',
        'no-real-caller',
      ],
      abortCriteria: [
        'real-unit-detected',
        'real-data-detected',
        'real-traffic-detected',
        'new-operational-surface-detected',
        'owner-bypass-detected',
        'direct-registry-write-detected',
        'entrypoint-routing-decision-detected',
        'resolveConnection-change-required',
        'fallback-or-rollback-failed',
      ],
      rollbackResult: {
        connection: 'baseConnection',
        status: 'disabled',
        routingMode: 'base',
        activationActive: false,
      },
      finalState: {
        status: 'disabled',
        routingMode: 'base',
        activationActive: false,
        activeConnection: 'baseConnection',
      },
    });
  });
});

test('contrato estrutural do harness de piloto nao produtivo permanece contido ao teste sem superficie operacional nova', async () => {
  const testSource = fs.readFileSync(nonProductionPilotContractTestFilePath, 'utf8');
  const helperSource = runNonProductionPilotHarness.toString();
  const pilotDocSource = fs.readFileSync(pilotDocPath, 'utf8');
  const manualEntrypointSource = fs.readFileSync(manualEntrypointSourceFilePath, 'utf8');

  assert.match(pilotDocSource, /Contrato do Piloto Nao Produtivo Multi-DB - Fase G/);
  assert.match(pilotDocSource, /entrypoint manual minimo interno/);
  assert.match(manualEntrypointSource, /runUnitDatabaseRegistryManualEntrypoint/);
  assert.match(helperSource, /manualEntrypoint/);
  assert.match(helperSource, /resolveConnection/);
  assert.doesNotMatch(helperSource, /pagesRouter\.js/);
  assert.doesNotMatch(helperSource, /api\.js/);
  assert.doesNotMatch(helperSource, /package\.json/);
  assert.doesNotMatch(helperSource, /express\s*\(/);
  assert.doesNotMatch(helperSource, /app\.(get|post|put|patch|delete)\s*\(/);
  assert.doesNotMatch(helperSource, /bootstrap/i);
  assert.doesNotMatch(helperSource, /cli/i);
  assert.doesNotMatch(helperSource, /script/i);
  assert.doesNotMatch(helperSource, /job/i);
  assert.match(testSource, /runUnitDatabaseRegistryManualEntrypoint/);
});

test('nao ha caller real novo para runUnitDatabaseRegistryManualEntrypoint fora do proprio modulo e dos testes', async () => {
  const srcRoot = path.join(process.cwd(), 'src');
  const srcFiles = collectWorkspaceFiles(srcRoot).filter((filePath) => filePath.endsWith('.js'));
  const matchingSrcFiles = srcFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    return source.includes('runUnitDatabaseRegistryManualEntrypoint');
  });

  assert.deepEqual(matchingSrcFiles, [manualEntrypointSourceFilePath]);
});