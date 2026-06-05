import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SERVICE_PATH = path.join(
  process.cwd(),
  'src/modules/gestor/app/usecases/unit-provisioning/UnitProvisioningService.js',
);
const SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function extractExportedAsyncFunction(functionName) {
  const signature = `export async function ${functionName}`;
  const start = SOURCE.indexOf(signature);
  assert.ok(start >= 0, `Nao encontrou ${functionName} em UnitProvisioningService.js`);

  const paramsStart = SOURCE.indexOf('(', start);
  assert.ok(paramsStart >= 0, `Nao encontrou abertura de parametros de ${functionName}`);

  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < SOURCE.length; index += 1) {
    const char = SOURCE[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }

  assert.ok(paramsEnd >= 0, `Nao encontrou fechamento de parametros de ${functionName}`);

  const braceStart = SOURCE.indexOf('{', paramsEnd);
  assert.ok(braceStart >= 0, `Nao encontrou abertura de bloco de ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < SOURCE.length; index += 1) {
    const char = SOURCE[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, index + 1).replace(/^export\s+/, '');
    }
  }

  throw new Error(`Nao conseguiu extrair o bloco completo de ${functionName}`);
}

function buildFunctionFromSource(functionSource, context = {}) {
  const script = new vm.Script(`(${functionSource})`);
  return script.runInNewContext(context);
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractSourceBetween(startMarker, endMarker) {
  const start = SOURCE.indexOf(startMarker);
  assert.ok(start >= 0, `Nao encontrou marcador inicial: ${startMarker}`);

  const end = SOURCE.indexOf(endMarker, start);
  assert.ok(end > start, `Nao encontrou marcador final: ${endMarker}`);

  return SOURCE.slice(start, end);
}

function buildSharedBootstrapCoreSource() {
  return `async function sharedUnitProvisioningBootstrapCore({
    normalizedUnidadeId,
    dbName,
    normalizedModulos,
    targetModuleKeys,
    operation,
    retryMode,
  } = {}) {
    const baseResult = await ensureBaseIndexes({ unidadeId: normalizedUnidadeId });
    const moduleBootstrap = await dispatchModuleBootstraps({
      unidadeId: normalizedUnidadeId,
      dbName,
      modulosHabilitados: normalizedModulos,
      targetModuleKeys,
      repository: provisioningRepository,
    });
    await registerModuleBootstrapAuditEvents({
      unidadeId: normalizedUnidadeId,
      dbName,
      operation,
      moduleBootstrap,
      retryMode,
    });

    return {
      baseResult,
      moduleBootstrap,
    };
  }`;
}

function buildDelegatedEnsureSource() {
  return `async function ensureUnitProvisioned({ unidadeId, tipo, modulosHabilitados } = {}) {
    const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
    const normalizedTipo = normalizeTipo(tipo);
    const normalizedModulos = normalizeModulosHabilitados(modulosHabilitados);
    const dbName = buildUnitDbName(normalizedUnidadeId);

    await safeRegisterProvisioningAuditEvent({
      unidadeId: normalizedUnidadeId,
      dbName,
      eventType: 'unit_provisioning_started',
      scope: 'unit',
      status: 'started',
      message: 'Provisioning da unidade iniciado.',
      operation: 'ensure',
      metadata: {
        tipo: normalizedTipo,
        modulosSolicitados: normalizedModulos,
      },
    });

    try {
      const { baseResult, moduleBootstrap } = await sharedUnitProvisioningBootstrapCore({
        normalizedUnidadeId,
        dbName,
        normalizedModulos,
        operation: 'ensure',
      });

      await provisioningRepository.ensureGlobalProvisioningIndex({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        indexSpec: { unidadeId: 1 },
        indexOptions: { unique: true, name: GLOBAL_PROVISIONING_INDEX_NAME },
      });

      const existing = await provisioningRepository.findGlobalProvisioningStatusByUnidadeId({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        unidadeId: normalizedUnidadeId,
      });
      const alreadyProvisioned = existing?.ready === true;

      const now = new Date();
      const tenantBase = buildTenantBaseDescriptor({ unidadeId: normalizedUnidadeId, dbName });
      const moduleStatuses = buildPersistedModuleStatusesFromBootstrap({ moduleBootstrap, now });
      const provisioningSummary = resolveProvisioningSummaryFromModuleStatuses(moduleStatuses);

      await provisioningRepository.upsertGlobalProvisioningStatus({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        unidadeId: normalizedUnidadeId,
        payload: {
          dbName: tenantBase.dbName,
          tipo: normalizedTipo,
          modulosHabilitados: normalizedModulos,
          ready: provisioningSummary.ready,
          status: provisioningSummary.status,
          lastProvisioningError: provisioningSummary.lastProvisioningError,
          tenantBase,
          tenantBaseModel: tenantBase.model,
          tenantBaseUnidadeId: tenantBase.unidadeId,
          tenantBaseDbName: tenantBase.dbName,
          moduleStatuses,
          snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
        },
        now,
      });

      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: provisioningSummary.ready ? 'unit_provisioning_succeeded' : 'unit_provisioning_failed',
        scope: 'unit',
        status: provisioningSummary.ready ? 'success' : 'error',
        message: provisioningSummary.ready
          ? 'Provisioning da unidade concluido.'
          : 'Provisioning da unidade concluiu com falhas de modulo.',
        reason: provisioningSummary.lastProvisioningError,
        operation: 'ensure',
        metadata: {
          tipo: normalizedTipo,
          alreadyProvisioned,
        },
      });

      return {
        ok: true,
        unidadeId: normalizedUnidadeId,
        dbName,
        alreadyProvisioned,
        tenantBase: baseResult,
        tenantBaseDescriptor: tenantBase,
        moduleBootstrap,
        moduleStatuses,
        globalStatusCollection: GLOBAL_PROVISIONING_COLLECTION,
        auditTrailCollection: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
        globalStatus: provisioningSummary.status,
        snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
      };
    } catch (error) {
      await registerProvisioningErrorStatus({
        unidadeId: normalizedUnidadeId,
        dbName,
        tipo: normalizedTipo,
        modulosHabilitados: normalizedModulos,
        error,
      });

      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: 'unit_provisioning_failed',
        scope: 'unit',
        status: 'error',
        message: 'Provisioning da unidade falhou.',
        reason: normalizeErrorMessage(error),
        operation: 'ensure',
        metadata: {
          tipo: normalizedTipo,
          modulosSolicitados: normalizedModulos,
        },
      });

      throw wrapProvisioningError('ensureUnitProvisioned', normalizedUnidadeId, error);
    }
  }`;
}

function buildDelegatedRetrySelectiveSource() {
  return `async function retryUnitProvisioning({ unidadeId, tipo, modulosHabilitados, modulosRetry } = {}) {
    const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
    const currentSnapshot = await inspectUnitProvisioning({ unidadeId: normalizedUnidadeId });
    const dbName = buildUnitDbName(normalizedUnidadeId);

    const normalizedTipo = normalizeTipo(tipo ?? currentSnapshot.tipo);
    const hasInputModules = Array.isArray(modulosHabilitados) && modulosHabilitados.length > 0;
    const normalizedModulos = hasInputModules
      ? normalizeModulosHabilitados(modulosHabilitados)
      : normalizeModulosHabilitados(currentSnapshot.modulosHabilitados);

    const selectiveRetryResolution = resolveRetryModuleKeys(modulosRetry);
    const hasSelectiveRetry = selectiveRetryResolution.requestedModules.length > 0;

    const failSelectiveRetryValidation = async (message, metadata = {}) => {
      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: 'unit_retry_failed',
        scope: 'unit',
        status: 'error',
        message,
        reason: 'validation_error',
        operation: 'retry_selective',
        metadata: {
          retryMode: 'selective',
          modulosRetrySolicitados: selectiveRetryResolution.requestedModules,
          ...metadata,
        },
      });
      throw createValidationError(message);
    };

    if (!hasSelectiveRetry) {
      throw new Error('global retry path fora do recorte desta prova');
    }

    await safeRegisterProvisioningAuditEvent({
      unidadeId: normalizedUnidadeId,
      dbName,
      eventType: 'unit_retry_started',
      scope: 'unit',
      status: 'started',
      message: 'Retry seletivo de provisioning iniciado.',
      operation: 'retry_selective',
      metadata: {
        retryMode: 'selective',
        modulosRetrySolicitados: selectiveRetryResolution.requestedModules,
      },
    });

    if (selectiveRetryResolution.invalidModules.length > 0) {
      await failSelectiveRetryValidation('modulos invalidos');
    }

    const retryModuleKeys = selectiveRetryResolution.moduleKeys;
    if (retryModuleKeys.length === 0) {
      await failSelectiveRetryValidation('nenhum modulo valido');
    }

    const unsupportedRetryModuleKeys = retryModuleKeys.filter(
      (moduleKey) => !RETRY_BOOTSTRAPPABLE_MODULE_KEYS.has(moduleKey)
    );
    if (unsupportedRetryModuleKeys.length > 0) {
      await failSelectiveRetryValidation('modulo sem bootstrap');
    }

    const enabledModuleKeys = collectEnabledModuleKeys({
      modulosHabilitados: normalizedModulos,
      modulosHabilitadosDisplay: currentSnapshot.modulosHabilitadosDisplay,
      moduleStatuses: currentSnapshot.moduleStatuses,
    });
    const enabledModuleKeySet = new Set(enabledModuleKeys);
    const unavailableModuleKeys = retryModuleKeys.filter((moduleKey) => !enabledModuleKeySet.has(moduleKey));

    if (unavailableModuleKeys.length > 0) {
      await failSelectiveRetryValidation('modulo nao habilitado');
    }

    const previousModuleStatuses = normalizeModuleStatuses(currentSnapshot.moduleStatuses, {
      defaultReady: currentSnapshot.ready === true,
      defaultStatus: currentSnapshot.status,
      defaultTimestamp: currentSnapshot.lastProvisionedAt,
      defaultReason: 'loaded_from_snapshot',
      defaultSource: 'snapshot',
    });

    const tenantBase = buildTenantBaseDescriptor({ unidadeId: normalizedUnidadeId, dbName });

    try {
      const { baseResult, moduleBootstrap } = await sharedUnitProvisioningBootstrapCore({
        normalizedUnidadeId,
        dbName,
        normalizedModulos,
        targetModuleKeys: retryModuleKeys,
        operation: 'retry_selective',
        retryMode: 'selective',
      });

      const targetOutOfScopeModuleKeys = Array.isArray(moduleBootstrap.targetOutOfScopeModuleKeys)
        ? moduleBootstrap.targetOutOfScopeModuleKeys
        : [];
      if (targetOutOfScopeModuleKeys.length > 0) {
        await failSelectiveRetryValidation('modulo fora do escopo');
      }

      const selectedModuleKeys = Array.isArray(moduleBootstrap.selectedModuleKeys)
        ? moduleBootstrap.selectedModuleKeys
        : [];
      if (selectedModuleKeys.length === 0) {
        await failSelectiveRetryValidation('nenhum modulo elegivel');
      }

      const now = new Date();
      const retriedModuleStatuses = buildPersistedModuleStatusesFromBootstrap({
        moduleBootstrap,
        now,
        source: 'retry_bootstrap',
        moduleKeys: selectedModuleKeys,
        includeUnknownModules: false,
      });
      const mergedModuleStatuses = mergeCanonicalModuleStatuses(retriedModuleStatuses, previousModuleStatuses);
      const provisioningSummary = resolveProvisioningSummaryFromModuleStatuses(mergedModuleStatuses);

      await provisioningRepository.ensureGlobalProvisioningIndex({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        indexSpec: { unidadeId: 1 },
        indexOptions: { unique: true, name: GLOBAL_PROVISIONING_INDEX_NAME },
      });

      await provisioningRepository.upsertGlobalProvisioningStatus({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        unidadeId: normalizedUnidadeId,
        payload: {
          dbName: tenantBase.dbName,
          tipo: normalizedTipo,
          modulosHabilitados: normalizedModulos,
          ready: provisioningSummary.ready,
          status: provisioningSummary.status,
          lastProvisioningError: provisioningSummary.lastProvisioningError,
          tenantBase,
          tenantBaseModel: tenantBase.model,
          tenantBaseUnidadeId: tenantBase.unidadeId,
          tenantBaseDbName: tenantBase.dbName,
          moduleStatuses: mergedModuleStatuses,
          snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
        },
        now,
      });

      const snapshot = await inspectUnitProvisioning({ unidadeId: normalizedUnidadeId });

      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: provisioningSummary.ready ? 'unit_retry_succeeded' : 'unit_retry_failed',
        scope: 'unit',
        status: provisioningSummary.ready ? 'success' : 'error',
        message: provisioningSummary.ready
          ? 'Retry seletivo de provisioning concluido.'
          : 'Retry seletivo de provisioning concluiu com falhas remanescentes.',
        reason: provisioningSummary.lastProvisioningError,
        operation: 'retry_selective',
        metadata: {
          retryMode: 'selective',
          modulosRetryKeys: retryModuleKeys,
          selectedModuleKeys,
        },
      });

      return {
        ok: true,
        unidadeId: normalizedUnidadeId,
        retried: true,
        mode: 'selective',
        previousStatus: currentSnapshot.status,
        request: {
          tipo: normalizedTipo,
          modulosHabilitados: normalizedModulos,
          modulosRetry: selectiveRetryResolution.requestedModules,
          modulosRetryKeys: retryModuleKeys,
        },
        provisioningResult: {
          ok: true,
          unidadeId: normalizedUnidadeId,
          dbName,
          tenantBase: baseResult,
          tenantBaseDescriptor: tenantBase,
          moduleBootstrap,
          moduleStatuses: mergedModuleStatuses,
          globalStatusCollection: GLOBAL_PROVISIONING_COLLECTION,
          auditTrailCollection: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
          globalStatus: provisioningSummary.status,
          snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
        },
        snapshot,
      };
    } catch (error) {
      if (isUnitProvisioningValidationError(error)) {
        throw error;
      }

      const now = new Date();
      const retryErrorStatuses = buildPersistedModuleStatusesFromRequestedModules({
        modulosHabilitados: retryModuleKeys,
        status: 'error',
        ready: false,
        reason: 'retry_provisioning_error',
        now,
        source: 'retry_error',
      });
      const mergedModuleStatuses = mergeCanonicalModuleStatuses(retryErrorStatuses, previousModuleStatuses);

      await provisioningRepository.ensureGlobalProvisioningIndex({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        indexSpec: { unidadeId: 1 },
        indexOptions: { unique: true, name: GLOBAL_PROVISIONING_INDEX_NAME },
      });

      await provisioningRepository.upsertGlobalProvisioningStatus({
        collectionName: GLOBAL_PROVISIONING_COLLECTION,
        unidadeId: normalizedUnidadeId,
        payload: {
          dbName: tenantBase.dbName,
          tipo: normalizedTipo,
          modulosHabilitados: normalizedModulos,
          ready: false,
          status: 'error',
          lastProvisioningError: normalizeErrorMessage(error),
          tenantBase,
          tenantBaseModel: tenantBase.model,
          tenantBaseUnidadeId: tenantBase.unidadeId,
          tenantBaseDbName: tenantBase.dbName,
          moduleStatuses: mergedModuleStatuses,
          snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
        },
        now,
      });

      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: 'unit_retry_failed',
        scope: 'unit',
        status: 'error',
        message: 'Retry seletivo de provisioning falhou.',
        reason: normalizeErrorMessage(error),
        operation: 'retry_selective',
        metadata: {
          retryMode: 'selective',
          modulosRetryKeys: retryModuleKeys,
        },
      });

      throw wrapProvisioningError('retryUnitProvisioning', normalizedUnidadeId, error);
    }
  }`;
}

test('estado real atual: ensure e retry seletivo delegam o trio compartilhado para a seam interna', () => {
  const ensureSource = extractSourceBetween(
    'export async function ensureUnitProvisioned',
    'export async function inspectUnitProvisioning',
  );
  const retrySource = extractSourceBetween(
    'export async function retryUnitProvisioning',
    'export async function listUnitProvisioningAuditEvents',
  );

  assert.match(ensureSource, /const \{ baseResult, moduleBootstrap \} = await sharedUnitProvisioningBootstrapCore\(\{[\s\S]*operation: 'ensure',[\s\S]*\}\);/);
  assert.match(retrySource, /const \{ baseResult, moduleBootstrap \} = await sharedUnitProvisioningBootstrapCore\(\{[\s\S]*targetModuleKeys: retryModuleKeys,[\s\S]*operation: 'retry_selective',[\s\S]*retryMode: 'selective',[\s\S]*\}\);/);

  assert.doesNotMatch(ensureSource, /ensureBaseIndexes\(/);
  assert.doesNotMatch(ensureSource, /dispatchModuleBootstraps\(/);
  assert.doesNotMatch(ensureSource, /registerModuleBootstrapAuditEvents\(/);

  assert.doesNotMatch(retrySource, /ensureBaseIndexes\(/);
  assert.doesNotMatch(retrySource, /dispatchModuleBootstraps\(/);
  assert.doesNotMatch(retrySource, /registerModuleBootstrapAuditEvents\(/);

  assert.match(
    SOURCE,
    /async function sharedUnitProvisioningBootstrapCore\(\{[\s\S]*normalizedUnidadeId,[\s\S]*dbName,[\s\S]*normalizedModulos,[\s\S]*targetModuleKeys,[\s\S]*operation,[\s\S]*retryMode,[\s\S]*\}\s*=\s*\{\}\)\s*\{[\s\S]*const baseResult = await ensureBaseIndexes\(\{ unidadeId: normalizedUnidadeId \}\);[\s\S]*const moduleBootstrap = await dispatchModuleBootstraps\(\{[\s\S]*repository: provisioningRepository,[\s\S]*\}\);[\s\S]*await registerModuleBootstrapAuditEvents\(\{[\s\S]*moduleBootstrap,[\s\S]*\}\);[\s\S]*return \{[\s\S]*baseResult,[\s\S]*moduleBootstrap,[\s\S]*\};[\s\S]*\}/,
  );
});

test('futura seam compartilhada recebe apenas contexto normalizado e concentra o trio comum', async () => {
  const callOrder = [];
  let ensureBaseIndexesArg = null;
  let dispatchArg = null;
  let registerArg = null;

  const sharedUnitProvisioningBootstrapCore = buildFunctionFromSource(
    buildSharedBootstrapCoreSource(),
    {
      ensureBaseIndexes: async (arg) => {
        callOrder.push('ensureBaseIndexes');
        ensureBaseIndexesArg = arg;
        return { ok: true, marker: 'tenant-base' };
      },
      dispatchModuleBootstraps: async (arg) => {
        callOrder.push('dispatchModuleBootstraps');
        dispatchArg = arg;
        return { ok: true, selectedModuleKeys: ['clinica'] };
      },
      registerModuleBootstrapAuditEvents: async (arg) => {
        callOrder.push('registerModuleBootstrapAuditEvents');
        registerArg = arg;
      },
      provisioningRepository: { marker: 'repo' },
    },
  );

  const result = await sharedUnitProvisioningBootstrapCore({
    normalizedUnidadeId: 'u-1',
    dbName: 'gestor_u_1',
    normalizedModulos: ['clinica'],
    targetModuleKeys: ['clinica'],
    operation: 'retry_selective',
    retryMode: 'selective',
  });

  assert.deepEqual(callOrder, [
    'ensureBaseIndexes',
    'dispatchModuleBootstraps',
    'registerModuleBootstrapAuditEvents',
  ]);
  assert.deepEqual(toPlain(ensureBaseIndexesArg), { unidadeId: 'u-1' });
  assert.deepEqual(toPlain(dispatchArg), {
    unidadeId: 'u-1',
    dbName: 'gestor_u_1',
    modulosHabilitados: ['clinica'],
    targetModuleKeys: ['clinica'],
    repository: { marker: 'repo' },
  });
  assert.deepEqual(toPlain(registerArg), {
    unidadeId: 'u-1',
    dbName: 'gestor_u_1',
    operation: 'retry_selective',
    moduleBootstrap: { ok: true, selectedModuleKeys: ['clinica'] },
    retryMode: 'selective',
  });
  assert.deepEqual(toPlain(result), {
    baseResult: { ok: true, marker: 'tenant-base' },
    moduleBootstrap: { ok: true, selectedModuleKeys: ['clinica'] },
  });
});

test('ensure permanece owner semantico e delega apenas o contexto minimo para a futura seam', async () => {
  const delegatedEnsureSource = buildDelegatedEnsureSource();
  let seamArg = null;
  const auditEvents = [];

  const ensureUnitProvisioned = buildFunctionFromSource(delegatedEnsureSource, {
    normalizeUnidadeId: (value) => `norm:${value}`,
    normalizeTipo: (value) => `tipo:${value}`,
    normalizeModulosHabilitados: (values) => (Array.isArray(values) ? values : []),
    buildUnitDbName: (unidadeId) => `db:${unidadeId}`,
    safeRegisterProvisioningAuditEvent: async (payload) => {
      auditEvents.push(payload.eventType);
    },
    sharedUnitProvisioningBootstrapCore: async (payload) => {
      seamArg = payload;
      return {
        baseResult: { ok: true, marker: 'tenant-base' },
        moduleBootstrap: { resolvedModuleKeys: ['clinica'], executedModuleKeys: ['clinica'] },
      };
    },
    provisioningRepository: {
      ensureGlobalProvisioningIndex: async () => {},
      findGlobalProvisioningStatusByUnidadeId: async () => ({ ready: false }),
      upsertGlobalProvisioningStatus: async () => {},
    },
    buildTenantBaseDescriptor: ({ unidadeId, dbName }) => ({ unidadeId, dbName, model: 'unidade' }),
    buildPersistedModuleStatusesFromBootstrap: () => ['status-1'],
    resolveProvisioningSummaryFromModuleStatuses: () => ({ ready: true, status: 'ready', lastProvisioningError: null }),
    registerProvisioningErrorStatus: async () => {},
    wrapProvisioningError: (operation, unidadeId, error) => new Error(`${operation}:${unidadeId}:${error.message}`),
    normalizeErrorMessage: (error) => error.message,
    GLOBAL_PROVISIONING_COLLECTION: 'unit_provisioning_status',
    GLOBAL_PROVISIONING_EVENTS_COLLECTION: 'unit_provisioning_events',
    GLOBAL_PROVISIONING_INDEX_NAME: 'uk_unidadeId',
    SNAPSHOT_CANONICAL_VERSION: 'unit-tenant-v1',
    Date,
  });

  const result = await ensureUnitProvisioned({
    unidadeId: 'u-1',
    tipo: 'principal',
    modulosHabilitados: ['clinica'],
  });

  assert.deepEqual(Object.keys(seamArg).sort(), [
    'dbName',
    'normalizedModulos',
    'normalizedUnidadeId',
    'operation',
  ]);
  assert.deepEqual(toPlain(seamArg), {
    normalizedUnidadeId: 'norm:u-1',
    dbName: 'db:norm:u-1',
    normalizedModulos: ['clinica'],
    operation: 'ensure',
  });
  assert.deepEqual(auditEvents, ['unit_provisioning_started', 'unit_provisioning_succeeded']);
  assert.equal(result.tenantBase.marker, 'tenant-base');
  assert.equal(result.globalStatus, 'ready');

  assert.doesNotMatch(delegatedEnsureSource, /ensureBaseIndexes\(/);
  assert.doesNotMatch(delegatedEnsureSource, /dispatchModuleBootstraps\(/);
  assert.doesNotMatch(delegatedEnsureSource, /registerModuleBootstrapAuditEvents\(/);
  assert.match(delegatedEnsureSource, /safeRegisterProvisioningAuditEvent/);
  assert.match(delegatedEnsureSource, /registerProvisioningErrorStatus/);
  assert.match(delegatedEnsureSource, /upsertGlobalProvisioningStatus/);
});

test('ensure nao registra unit_provisioning_succeeded quando ha falha real agregada', async () => {
  const delegatedEnsureSource = buildDelegatedEnsureSource();
  const auditEvents = [];
  const upsertPayloads = [];

  const ensureUnitProvisioned = buildFunctionFromSource(delegatedEnsureSource, {
    normalizeUnidadeId: (value) => `norm:${value}`,
    normalizeTipo: (value) => `tipo:${value}`,
    normalizeModulosHabilitados: (values) => (Array.isArray(values) ? values : []),
    buildUnitDbName: (unidadeId) => `db:${unidadeId}`,
    safeRegisterProvisioningAuditEvent: async (payload) => {
      auditEvents.push(payload.eventType);
    },
    sharedUnitProvisioningBootstrapCore: async () => ({
      baseResult: { ok: true, marker: 'tenant-base' },
      moduleBootstrap: { unknownModules: ['Modulo X'] },
    }),
    provisioningRepository: {
      ensureGlobalProvisioningIndex: async () => {},
      findGlobalProvisioningStatusByUnidadeId: async () => ({ ready: false }),
      upsertGlobalProvisioningStatus: async ({ payload }) => {
        upsertPayloads.push(payload);
      },
    },
    buildTenantBaseDescriptor: ({ unidadeId, dbName }) => ({ unidadeId, dbName, model: 'unidade' }),
    buildPersistedModuleStatusesFromBootstrap: () => ([{ moduleKey: null, moduleLabel: 'Modulo X', requestedModule: 'Modulo X', status: 'unmapped' }]),
    resolveProvisioningSummaryFromModuleStatuses: () => ({ ready: false, status: 'error', lastProvisioningError: 'Modulo Modulo X: bootstrap_handler_not_mapped' }),
    registerProvisioningErrorStatus: async () => {},
    wrapProvisioningError: (operation, unidadeId, error) => new Error(`${operation}:${unidadeId}:${error.message}`),
    normalizeErrorMessage: (error) => error.message,
    GLOBAL_PROVISIONING_COLLECTION: 'unit_provisioning_status',
    GLOBAL_PROVISIONING_EVENTS_COLLECTION: 'unit_provisioning_events',
    GLOBAL_PROVISIONING_INDEX_NAME: 'uk_unidadeId',
    SNAPSHOT_CANONICAL_VERSION: 'unit-tenant-v1',
    Date,
  });

  const result = await ensureUnitProvisioned({
    unidadeId: 'u-erro',
    tipo: 'principal',
    modulosHabilitados: ['modulo-x'],
  });

  assert.deepEqual(auditEvents, ['unit_provisioning_started', 'unit_provisioning_failed']);
  assert.equal(result.globalStatus, 'error');
  assert.equal(upsertPayloads[0]?.status, 'error');
  assert.equal(upsertPayloads[0]?.ready, false);
});

test('retry seletivo permanece owner semantico e delega apenas o contexto minimo adicional da seam', async () => {
  const delegatedRetrySource = buildDelegatedRetrySelectiveSource();
  let seamArg = null;
  const auditEvents = [];

  const retryUnitProvisioning = buildFunctionFromSource(delegatedRetrySource, {
    normalizeUnidadeId: (value) => `norm:${value}`,
    inspectUnitProvisioning: async ({ unidadeId }) => ({
      unidadeId,
      tipo: 'filial',
      status: 'error',
      ready: false,
      modulosHabilitados: ['clinica', 'escalas'],
      modulosHabilitadosDisplay: ['Clinica', 'Escalas'],
      moduleStatuses: ['status-anterior'],
      lastProvisionedAt: '2026-04-01T10:00:00.000Z',
    }),
    buildUnitDbName: (unidadeId) => `db:${unidadeId}`,
    normalizeTipo: (value) => `tipo:${value}`,
    normalizeModulosHabilitados: (values) => (Array.isArray(values) ? values : []),
    resolveRetryModuleKeys: () => ({
      requestedModules: ['clinica'],
      moduleKeys: ['clinica'],
      invalidModules: [],
    }),
    safeRegisterProvisioningAuditEvent: async (payload) => {
      auditEvents.push(payload.eventType);
    },
    createValidationError: (message) => new Error(`validation:${message}`),
    RETRY_BOOTSTRAPPABLE_MODULE_KEYS: new Set(['clinica', 'escalas', 'condominio']),
    collectEnabledModuleKeys: () => ['clinica', 'escalas'],
    normalizeModuleStatuses: (statuses, defaults) => ({ statuses, defaults }),
    buildTenantBaseDescriptor: ({ unidadeId, dbName }) => ({ unidadeId, dbName, model: 'unidade' }),
    sharedUnitProvisioningBootstrapCore: async (payload) => {
      seamArg = payload;
      return {
        baseResult: { ok: true, marker: 'tenant-base' },
        moduleBootstrap: {
          targetOutOfScopeModuleKeys: [],
          selectedModuleKeys: ['clinica'],
        },
      };
    },
    buildPersistedModuleStatusesFromBootstrap: () => ['status-retry'],
    mergeCanonicalModuleStatuses: (retried, previous) => ({ retried, previous }),
    resolveProvisioningSummaryFromModuleStatuses: () => ({ ready: true, status: 'ready', lastProvisioningError: null }),
    provisioningRepository: {
      ensureGlobalProvisioningIndex: async () => {},
      upsertGlobalProvisioningStatus: async () => {},
    },
    buildPersistedModuleStatusesFromRequestedModules: () => ['status-error'],
    isUnitProvisioningValidationError: () => false,
    normalizeErrorMessage: (error) => error.message,
    wrapProvisioningError: (operation, unidadeId, error) => new Error(`${operation}:${unidadeId}:${error.message}`),
    GLOBAL_PROVISIONING_COLLECTION: 'unit_provisioning_status',
    GLOBAL_PROVISIONING_EVENTS_COLLECTION: 'unit_provisioning_events',
    GLOBAL_PROVISIONING_INDEX_NAME: 'uk_unidadeId',
    SNAPSHOT_CANONICAL_VERSION: 'unit-tenant-v1',
    Date,
    Set,
  });

  const result = await retryUnitProvisioning({
    unidadeId: 'u-1',
    tipo: 'filial',
    modulosHabilitados: ['clinica', 'escalas'],
    modulosRetry: ['clinica'],
  });

  assert.deepEqual(Object.keys(seamArg).sort(), [
    'dbName',
    'normalizedModulos',
    'normalizedUnidadeId',
    'operation',
    'retryMode',
    'targetModuleKeys',
  ]);
  assert.deepEqual(toPlain(seamArg), {
    normalizedUnidadeId: 'norm:u-1',
    dbName: 'db:norm:u-1',
    normalizedModulos: ['clinica', 'escalas'],
    targetModuleKeys: ['clinica'],
    operation: 'retry_selective',
    retryMode: 'selective',
  });
  assert.deepEqual(auditEvents, ['unit_retry_started', 'unit_retry_succeeded']);
  assert.equal(result.mode, 'selective');
  assert.equal(result.provisioningResult.tenantBase.marker, 'tenant-base');

  assert.doesNotMatch(delegatedRetrySource, /ensureBaseIndexes\(/);
  assert.doesNotMatch(delegatedRetrySource, /dispatchModuleBootstraps\(/);
  assert.doesNotMatch(delegatedRetrySource, /registerModuleBootstrapAuditEvents\(/);
  assert.match(delegatedRetrySource, /failSelectiveRetryValidation/);
  assert.match(delegatedRetrySource, /collectEnabledModuleKeys/);
  assert.match(delegatedRetrySource, /upsertGlobalProvisioningStatus/);
  assert.match(delegatedRetrySource, /inspectUnitProvisioning/);
});