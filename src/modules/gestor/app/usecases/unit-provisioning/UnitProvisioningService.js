import { UnitProvisioningRepository } from '#modules/gestor/app/repositories/UnitProvisioningRepository.js';
import { dispatchModuleBootstraps } from '#modules/gestor/app/usecases/unit-provisioning/module-bootstrap/dispatchModuleBootstraps.js';

const TENANT_BOOTSTRAP_COLLECTION = '__unit_provisioning';
const TENANT_BOOTSTRAP_MARKER_KEY = 'unit_provisioned';
const TENANT_BOOTSTRAP_INDEX_NAME = 'uk_key';

const GLOBAL_PROVISIONING_COLLECTION = 'unit_provisioning_status';
const GLOBAL_PROVISIONING_INDEX_NAME = 'uk_unidadeId';
const GLOBAL_PROVISIONING_EVENTS_COLLECTION = 'unit_provisioning_events';
const GLOBAL_PROVISIONING_EVENTS_BY_UNIDADE_INDEX_NAME = 'ix_unidade_createdAt';
const GLOBAL_PROVISIONING_EVENTS_BY_OPERATION_INDEX_NAME = 'ix_unidade_operation_createdAt';
const SNAPSHOT_CANONICAL_VERSION = 'unit-tenant-v1';
const TENANT_BASE_MODEL = 'unidade';

const MODULE_LABEL_BY_KEY = Object.freeze({
  condominio: 'Gestao de Condominio',
  clinica: 'Clinica',
  escalas: 'Escalas',
  gestor: 'Gestor',
});

const MODULE_STATUS = Object.freeze({
  READY: 'ready',
  PENDING: 'pending',
  ERROR: 'error',
  UNMAPPED: 'unmapped',
});

const MODULE_STATUS_REASON = Object.freeze({
  READY: 'bootstrap_ok',
  PENDING: 'bootstrap_pending',
  ERROR: 'bootstrap_error',
  UNMAPPED: 'bootstrap_handler_not_mapped',
});

const RETRY_BOOTSTRAPPABLE_MODULE_KEYS = new Set(['condominio', 'clinica', 'escalas']);

let provisioningEventsIndexesReady = false;

class UnitProvisioningValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnitProvisioningValidationError';
    this.code = 'UNIT_PROVISIONING_VALIDATION';
  }
}

function createValidationError(message) {
  const normalizedMessage = String(message || '').trim() || 'Invalid provisioning retry request.';
  return new UnitProvisioningValidationError(normalizedMessage);
}

function normalizeUnidadeId(unidadeId) {
  const normalized = String(unidadeId || '').trim();
  if (!normalized) {
    throw new Error('[UnitProvisioningService] unidadeId obrigatorio');
  }

  return normalized;
}

function normalizeTipo(tipo) {
  const normalized = String(tipo || '').trim();
  return normalized || null;
}

function normalizeModulosHabilitados(modulosHabilitados) {
  if (!Array.isArray(modulosHabilitados)) return [];

  return Array.from(
    new Set(
      modulosHabilitados
        .map((modulo) => String(modulo || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeRetryModuleInputs(modulosRetry) {
  const items = Array.isArray(modulosRetry) ? modulosRetry : [modulosRetry];
  const normalized = [];
  const known = new Set();

  for (const rawItem of items) {
    const text = String(rawItem || '').trim();
    if (!text) continue;

    const tokens = text
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const token of tokens) {
      if (known.has(token)) continue;
      known.add(token);
      normalized.push(token);
    }
  }

  return normalized;
}

function resolveRetryModuleKeys(modulosRetry) {
  const requestedModules = normalizeRetryModuleInputs(modulosRetry);
  const moduleKeys = [];
  const invalidModules = [];
  const knownKeys = new Set();

  for (const requestedModule of requestedModules) {
    const moduleKey = resolveCanonicalModuleKey(requestedModule);
    if (!moduleKey) {
      invalidModules.push(requestedModule);
      continue;
    }

    if (knownKeys.has(moduleKey)) continue;
    knownKeys.add(moduleKey);
    moduleKeys.push(moduleKey);
  }

  return {
    requestedModules,
    moduleKeys,
    invalidModules,
  };
}

function addCanonicalModuleKeyFromValue(targetSet, rawValue) {
  if (!targetSet || typeof targetSet.add !== 'function') return;
  const moduleKey = resolveCanonicalModuleKey(rawValue);
  if (!moduleKey) return;
  targetSet.add(moduleKey);
}

function collectEnabledModuleKeys({
  modulosHabilitados,
  modulosHabilitadosDisplay,
  moduleStatuses,
} = {}) {
  const keys = new Set();

  for (const modulo of normalizeModulosHabilitados(modulosHabilitados)) {
    addCanonicalModuleKeyFromValue(keys, modulo);
  }

  for (const moduloDisplay of normalizeModulosHabilitados(modulosHabilitadosDisplay)) {
    addCanonicalModuleKeyFromValue(keys, moduloDisplay);
  }

  const normalizedStatuses = normalizeModuleStatuses(moduleStatuses, {
    defaultReady: false,
    defaultStatus: MODULE_STATUS.PENDING,
    defaultReason: 'retry_validation',
    defaultSource: 'retry_validation',
  });

  for (const entry of normalizedStatuses) {
    addCanonicalModuleKeyFromValue(keys, entry?.moduleKey);
    addCanonicalModuleKeyFromValue(keys, entry?.requestedModule);
    addCanonicalModuleKeyFromValue(keys, entry?.moduleLabel);
  }

  return Array.from(keys);
}

function normalizeDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

const provisioningRepository = new UnitProvisioningRepository();

function normalizeErrorMessage(error) {
  const message = String(error?.message || error || 'UNKNOWN_ERROR').trim();
  if (!message) return 'UNKNOWN_ERROR';
  return message.slice(0, 2000);
}

function normalizeNullableText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeProvisioningEventScope(value) {
  return String(value || '').trim().toLowerCase() === 'module'
    ? 'module'
    : 'unit';
}

function normalizeProvisioningEventScopeFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'unit' || normalized === 'module') return normalized;
  return null;
}

function normalizeProvisioningEventStatus(value, fallback = 'info') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'started') return 'started';
  if (normalized === 'success') return 'success';
  if (normalized === 'error') return 'error';
  if (normalized === 'info') return 'info';
  return fallback;
}

function normalizeProvisioningEventModuleKeyFilter(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return resolveCanonicalModuleKey(normalized) || normalized.toLowerCase();
}

function normalizeProvisioningEventOperationFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeProvisioningEventStatusFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'started' || normalized === 'success' || normalized === 'error' || normalized === 'info') {
    return normalized;
  }
  return null;
}

function normalizeProvisioningEventsBeforeCursor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const [rawDate, rawEventId = ''] = raw.split('|', 2);
  const dateText = String(rawDate || '').trim();
  if (!dateText) return null;

  const parsedDate = new Date(dateText);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const eventId = String(rawEventId || '').trim();
  if (!eventId) {
    return {
      beforeDate: parsedDate,
      beforeEventId: null,
    };
  }

  if (!looksLikeObjectId(eventId)) return null;

  return {
    beforeDate: parsedDate,
    beforeEventId: eventId,
  };
}

function buildProvisioningAuditEventDoc({
  unidadeId,
  dbName,
  eventType,
  scope = 'unit',
  moduleKey = null,
  status = 'info',
  message = null,
  reason = null,
  operation = null,
  metadata = null,
  createdAt = null,
} = {}) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
  const normalizedDbName = normalizeNullableText(dbName) || buildUnitDbName(normalizedUnidadeId);
  const normalizedEventType = normalizeNullableText(eventType) || 'unit_event';
  const normalizedScope = normalizeProvisioningEventScope(scope);
  const normalizedModuleKey = normalizeNullableText(moduleKey);
  const normalizedStatus = normalizeProvisioningEventStatus(status, 'info');
  const normalizedMessage = normalizeNullableText(message);
  const normalizedReason = normalizeNullableText(reason);
  const normalizedOperation = normalizeNullableText(operation);
  const normalizedMetadata = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
    ? metadata
    : {};
  const timestamp = createdAt || new Date();

  return {
    unidadeId: normalizedUnidadeId,
    dbName: normalizedDbName,
    eventType: normalizedEventType,
    scope: normalizedScope,
    moduleKey: normalizedScope === 'module' ? normalizedModuleKey : null,
    status: normalizedStatus,
    message: normalizedMessage,
    reason: normalizedReason,
    operation: normalizedOperation,
    metadata: normalizedMetadata,
    snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
    createdAt: timestamp,
  };
}

async function ensureProvisioningEventsIndexes() {
  if (provisioningEventsIndexesReady) return;

  await provisioningRepository.ensureGlobalProvisioningIndex({
    collectionName: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
    indexSpec: { unidadeId: 1, createdAt: -1 },
    indexOptions: { name: GLOBAL_PROVISIONING_EVENTS_BY_UNIDADE_INDEX_NAME },
  });

  await provisioningRepository.ensureGlobalProvisioningIndex({
    collectionName: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
    indexSpec: { unidadeId: 1, operation: 1, createdAt: -1 },
    indexOptions: { name: GLOBAL_PROVISIONING_EVENTS_BY_OPERATION_INDEX_NAME },
  });

  provisioningEventsIndexesReady = true;
}

async function safeRegisterProvisioningAuditEvent(eventInput) {
  try {
    await ensureProvisioningEventsIndexes();

    const eventDoc = buildProvisioningAuditEventDoc(eventInput);
    await provisioningRepository.insertGlobalProvisioningEvent({
      collectionName: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
      eventDoc,
    });
  } catch (error) {
    console.warn('[UnitProvisioningService] falha ao registrar evento de auditoria de provisioning', {
      unidadeId: normalizeNullableText(eventInput?.unidadeId),
      eventType: normalizeNullableText(eventInput?.eventType),
      operation: normalizeNullableText(eventInput?.operation),
      error: normalizeErrorMessage(error),
    });
  }
}

async function registerModuleBootstrapAuditEvents({ unidadeId, dbName, operation, moduleBootstrap, retryMode = null } = {}) {
  const safeBootstrap = (moduleBootstrap && typeof moduleBootstrap === 'object') ? moduleBootstrap : {};
  const executed = Array.isArray(safeBootstrap.executed) ? safeBootstrap.executed : [];
  const unknownModules = Array.isArray(safeBootstrap.unknownModules) ? safeBootstrap.unknownModules : [];

  for (const execution of executed) {
    const moduleKey = resolveCanonicalModuleKey(execution?.module) || normalizeNullableText(execution?.module);
    const status = execution?.ok === false ? 'error' : 'success';
    const eventType = execution?.ok === false ? 'module_bootstrap_failed' : 'module_bootstrap_succeeded';
    const reason = normalizeNullableText(execution?.reason || execution?.errorMessage);
    const message = execution?.ok === false
      ? `Bootstrap do modulo ${moduleKey || 'desconhecido'} falhou.`
      : `Bootstrap do modulo ${moduleKey || 'desconhecido'} concluido.`;

    await safeRegisterProvisioningAuditEvent({
      unidadeId,
      dbName,
      eventType,
      scope: 'module',
      moduleKey,
      status,
      message,
      reason,
      operation,
      metadata: {
        retryMode: normalizeNullableText(retryMode),
        bootstrapCollection: normalizeNullableText(execution?.collection),
        markerKey: normalizeNullableText(execution?.markerKey),
        indexName: normalizeNullableText(execution?.indexName),
      },
    });
  }

  for (const unknownModule of unknownModules) {
    const moduleText = normalizeNullableText(unknownModule);
    if (!moduleText) continue;

    await safeRegisterProvisioningAuditEvent({
      unidadeId,
      dbName,
      eventType: 'module_bootstrap_unmapped',
      scope: 'module',
      moduleKey: resolveCanonicalModuleKey(moduleText),
      status: 'error',
      message: `Modulo sem bootstrap registrado: ${moduleText}`,
      reason: MODULE_STATUS_REASON.UNMAPPED,
      operation,
      metadata: {
        retryMode: normalizeNullableText(retryMode),
        requestedModule: moduleText,
      },
    });
  }
}

function looksLikeObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

function normalizeModuloSlug(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[\s_-]+/g, '');
}

function resolveCanonicalModuleKey(rawValue) {
  const normalized = normalizeModuloSlug(rawValue);
  if (!normalized) return null;

  if (normalized.includes('condominio')) return 'condominio';
  if (normalized.includes('clinica')) return 'clinica';
  if (normalized.includes('escala')) return 'escalas';
  if (normalized.includes('gestor')) return 'gestor';

  return null;
}

function resolveCanonicalModuleLabel({ moduleKey, fallbackLabel, fallbackRequestedModule } = {}) {
  const canonicalKey = resolveCanonicalModuleKey(moduleKey);
  if (canonicalKey && MODULE_LABEL_BY_KEY[canonicalKey]) {
    return MODULE_LABEL_BY_KEY[canonicalKey];
  }

  const byLabel = normalizeNullableText(fallbackLabel);
  if (byLabel) return byLabel;

  const byRequestedModule = normalizeNullableText(fallbackRequestedModule);
  if (byRequestedModule) return byRequestedModule;

  return canonicalKey;
}

function normalizeModuleStatusValue(statusValue, readyHint = false) {
  const normalized = normalizeNullableText(statusValue);
  if (!normalized) return readyHint ? MODULE_STATUS.READY : MODULE_STATUS.PENDING;

  const slug = normalizeModuloSlug(normalized);
  if (slug.includes('ready') || slug.includes('ok') || slug.includes('success') || slug.includes('pronto')) return MODULE_STATUS.READY;
  if (slug.includes('error') || slug.includes('fail') || slug.includes('erro')) return MODULE_STATUS.ERROR;
  if (slug.includes('unmapped') || slug.includes('unknown') || slug.includes('skip') || slug.includes('naomapeado')) return MODULE_STATUS.UNMAPPED;
  if (slug.includes('pending') || slug.includes('process') || slug.includes('pendente')) return MODULE_STATUS.PENDING;

  return readyHint ? MODULE_STATUS.READY : MODULE_STATUS.PENDING;
}

function normalizeModuleStatusReason(reasonValue, {
  moduleStatus,
  moduleKey,
  fallbackReason,
} = {}) {
  const explicitReason = normalizeNullableText(reasonValue);
  if (explicitReason) return explicitReason;

  const fallback = normalizeNullableText(fallbackReason);
  if (fallback) return fallback;

  if (moduleStatus === MODULE_STATUS.UNMAPPED && !moduleKey) {
    return 'module_key_not_recognized';
  }

  if (moduleStatus === MODULE_STATUS.READY) return MODULE_STATUS_REASON.READY;
  if (moduleStatus === MODULE_STATUS.ERROR) return MODULE_STATUS_REASON.ERROR;
  if (moduleStatus === MODULE_STATUS.UNMAPPED) return MODULE_STATUS_REASON.UNMAPPED;
  return MODULE_STATUS_REASON.PENDING;
}

function buildModuleStatusIdentity(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return `item-${index}`;
  return entry.moduleKey || entry.requestedModule || entry.moduleLabel || `item-${index}`;
}

function buildTenantBaseDescriptor({ unidadeId, dbName, statusDoc } = {}) {
  const fallbackUnidadeId = normalizeUnidadeId(unidadeId);
  const fallbackDbName = normalizeNullableText(dbName) || buildUnitDbName(fallbackUnidadeId);
  const statusTenantBase = (statusDoc?.tenantBase && typeof statusDoc.tenantBase === 'object')
    ? statusDoc.tenantBase
    : null;

  const model = normalizeNullableText(statusTenantBase?.model)
    || normalizeNullableText(statusDoc?.tenantBaseModel)
    || TENANT_BASE_MODEL;
  const tenantUnidadeId = normalizeNullableText(statusTenantBase?.unidadeId)
    || normalizeNullableText(statusDoc?.tenantBaseUnidadeId)
    || fallbackUnidadeId;
  const tenantDbName = normalizeNullableText(statusTenantBase?.dbName)
    || normalizeNullableText(statusDoc?.tenantBaseDbName)
    || normalizeNullableText(statusDoc?.dbName)
    || fallbackDbName;

  return {
    model: model || TENANT_BASE_MODEL,
    unidadeId: tenantUnidadeId || fallbackUnidadeId,
    dbName: tenantDbName || fallbackDbName,
  };
}

function normalizeModuleStatusEntry(entry, {
  defaultReady = false,
  defaultStatus = MODULE_STATUS.PENDING,
  defaultTimestamp = null,
  defaultReason = null,
  defaultSource = null,
} = {}) {
  if (!entry || typeof entry !== 'object') return null;

  const requestedModule = normalizeNullableText(
    entry.requestedModule
    || entry.input
    || entry.modulo
    || entry.module
    || entry.moduleKey
  );
  const moduleKey = resolveCanonicalModuleKey(entry.moduleKey || entry.module || requestedModule);

  const status = normalizeModuleStatusValue(
    entry.status || defaultStatus,
    entry.ready === true || defaultReady
  );
  const moduleStatus = (!moduleKey && status !== MODULE_STATUS.ERROR)
    ? MODULE_STATUS.UNMAPPED
    : status;
  const ready = moduleStatus === MODULE_STATUS.READY;
  const reason = normalizeModuleStatusReason(entry.reason, {
    moduleStatus,
    moduleKey,
    fallbackReason: defaultReason,
  });
  const source = normalizeNullableText(entry.source) || normalizeNullableText(defaultSource) || null;

  return {
    moduleKey,
    moduleLabel: resolveCanonicalModuleLabel({
      moduleKey,
      fallbackLabel: entry.moduleLabel || entry.label || entry.displayName,
      fallbackRequestedModule: requestedModule,
    }),
    requestedModule: requestedModule || moduleKey || null,
    status: moduleStatus,
    ready,
    bootstrapCollection: normalizeNullableText(entry.bootstrapCollection || entry.collection),
    markerKey: normalizeNullableText(entry.markerKey),
    indexName: normalizeNullableText(entry.indexName),
    reason,
    lastBootstrapAt: normalizeDateValue(entry.lastBootstrapAt || entry?.['updatedAt'] || defaultTimestamp),
    source,
  };
}

function normalizeModuleStatuses(moduleStatuses, options = {}) {
  if (!Array.isArray(moduleStatuses)) return [];

  const normalized = [];
  const seen = new Set();

  for (let idx = 0; idx < moduleStatuses.length; idx += 1) {
    const item = normalizeModuleStatusEntry(moduleStatuses[idx], options);
    if (!item) continue;

    const dedupeKey = buildModuleStatusIdentity(item, idx);
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    normalized.push(item);
  }

  return normalized;
}

function mergeCanonicalModuleStatuses(primaryStatuses, fallbackStatuses) {
  const primary = Array.isArray(primaryStatuses) ? primaryStatuses : [];
  const fallback = Array.isArray(fallbackStatuses) ? fallbackStatuses : [];
  if (primary.length === 0) return fallback;
  if (fallback.length === 0) return primary;

  const fallbackByIdentity = new Map();
  fallback.forEach((item, idx) => {
    fallbackByIdentity.set(buildModuleStatusIdentity(item, idx), item);
  });

  const merged = [];
  const used = new Set();

  primary.forEach((item, idx) => {
    const identity = buildModuleStatusIdentity(item, idx);
    const fallbackItem = fallbackByIdentity.get(identity);

    if (!fallbackItem) {
      merged.push(item);
      used.add(identity);
      return;
    }

    merged.push({
      ...fallbackItem,
      ...item,
      moduleKey: item.moduleKey || fallbackItem.moduleKey,
      moduleLabel: item.moduleLabel || fallbackItem.moduleLabel,
      requestedModule: item.requestedModule || fallbackItem.requestedModule,
      status: item.status || fallbackItem.status,
      ready: item.ready === true || item.status === MODULE_STATUS.READY,
      reason: item.reason || fallbackItem.reason,
      source: item.source || fallbackItem.source,
      bootstrapCollection: item.bootstrapCollection || fallbackItem.bootstrapCollection,
      markerKey: item.markerKey || fallbackItem.markerKey,
      indexName: item.indexName || fallbackItem.indexName,
      lastBootstrapAt: item.lastBootstrapAt || fallbackItem.lastBootstrapAt,
    });
    used.add(identity);
  });

  fallback.forEach((item, idx) => {
    const identity = buildModuleStatusIdentity(item, idx);
    if (used.has(identity)) return;
    merged.push(item);
  });

  return merged;
}

function buildFallbackModuleStatusesFromModules({
  modulosHabilitados,
  modulosHabilitadosDisplay,
  ready,
  status,
  lastProvisionedAt,
} = {}) {
  const rawModules = normalizeModulosHabilitados(modulosHabilitados);
  const displayModules = Array.isArray(modulosHabilitadosDisplay) ? modulosHabilitadosDisplay : [];
  const globalStatus = normalizeModuleStatusValue(status, ready);

  const fallbackEntries = rawModules.map((requestedModule, idx) => {
    const moduleLabel = normalizeNullableText(displayModules[idx]) || requestedModule;
    const moduleKey = resolveCanonicalModuleKey(moduleLabel || requestedModule);
    const moduleStatus = (!moduleKey && globalStatus !== MODULE_STATUS.ERROR)
      ? MODULE_STATUS.UNMAPPED
      : globalStatus;
    const reason = moduleStatus === MODULE_STATUS.READY
      ? 'inferred_from_global_ready'
      : moduleStatus === MODULE_STATUS.ERROR
        ? 'inferred_from_global_error'
        : moduleStatus === MODULE_STATUS.UNMAPPED
          ? 'module_key_not_recognized'
          : 'inferred_from_global_pending';

    return {
      moduleKey,
      moduleLabel,
      requestedModule,
      status: moduleStatus,
      ready: moduleStatus === MODULE_STATUS.READY,
      lastBootstrapAt: lastProvisionedAt,
      reason,
      source: 'inspect_fallback',
    };
  });

  return normalizeModuleStatuses(fallbackEntries, {
    defaultReady: ready,
    defaultStatus: globalStatus,
    defaultTimestamp: lastProvisionedAt,
    defaultReason: 'inferred_from_global_status',
    defaultSource: 'inspect_fallback',
  });
}

function buildPersistedModuleStatusesFromBootstrap({
  moduleBootstrap,
  now,
  source = 'ensure_bootstrap',
  moduleKeys,
  includeUnknownModules = true,
} = {}) {
  const safeBootstrap = (moduleBootstrap && typeof moduleBootstrap === 'object') ? moduleBootstrap : {};
  const resolvedKeys = (Array.isArray(moduleKeys) && moduleKeys.length > 0)
    ? normalizeModulosHabilitados(moduleKeys)
    : (Array.isArray(safeBootstrap.resolvedModuleKeys) ? safeBootstrap.resolvedModuleKeys : []);
  const unknownModules = Array.isArray(safeBootstrap.unknownModules) ? safeBootstrap.unknownModules : [];
  const executed = Array.isArray(safeBootstrap.executed) ? safeBootstrap.executed : [];

  const executedByKey = new Map();
  for (const execution of executed) {
    const moduleKey = resolveCanonicalModuleKey(execution?.module);
    if (!moduleKey) continue;
    executedByKey.set(moduleKey, execution);
  }

  const entries = [];

  for (const moduleKeyRaw of resolvedKeys) {
    const moduleKey = resolveCanonicalModuleKey(moduleKeyRaw) || normalizeNullableText(moduleKeyRaw);
    if (!moduleKey) continue;

    const execution = executedByKey.get(moduleKey);
    const moduleStatus = execution
      ? (execution?.ok === false ? MODULE_STATUS.ERROR : MODULE_STATUS.READY)
      : MODULE_STATUS.PENDING;
    const reason = execution
      ? (execution?.ok === false
        ? normalizeNullableText(execution?.reason || execution?.errorMessage) || MODULE_STATUS_REASON.ERROR
        : MODULE_STATUS_REASON.READY)
      : 'bootstrap_not_executed';

    entries.push({
      moduleKey,
      moduleLabel: resolveCanonicalModuleLabel({ moduleKey }),
      requestedModule: normalizeNullableText(moduleKeyRaw) || moduleKey,
      status: moduleStatus,
      ready: moduleStatus === MODULE_STATUS.READY,
      bootstrapCollection: normalizeNullableText(execution?.collection),
      markerKey: normalizeNullableText(execution?.markerKey),
      indexName: normalizeNullableText(execution?.indexName),
      reason,
      lastBootstrapAt: now,
      source,
    });
  }

  if (includeUnknownModules) {
    for (const unknownModule of unknownModules) {
      const rawModule = normalizeNullableText(unknownModule);
      if (!rawModule) continue;

      entries.push({
        moduleKey: resolveCanonicalModuleKey(rawModule),
        moduleLabel: resolveCanonicalModuleLabel({ fallbackRequestedModule: rawModule }),
        requestedModule: rawModule,
        status: MODULE_STATUS.UNMAPPED,
        ready: false,
        reason: MODULE_STATUS_REASON.UNMAPPED,
        lastBootstrapAt: now,
        source,
      });
    }
  }

  return normalizeModuleStatuses(entries, {
    defaultReady: false,
    defaultStatus: MODULE_STATUS.PENDING,
    defaultTimestamp: now,
    defaultReason: MODULE_STATUS_REASON.PENDING,
    defaultSource: source,
  });
}

function buildPersistedModuleStatusesFromRequestedModules({
  modulosHabilitados,
  status,
  ready,
  reason,
  now,
  source = 'ensure_error',
} = {}) {
  const requestedModules = normalizeModulosHabilitados(modulosHabilitados);
  const requestedStatus = normalizeModuleStatusValue(status, ready);

  const entries = requestedModules.map((requestedModule) => {
    const moduleKey = resolveCanonicalModuleKey(requestedModule);
    const moduleStatus = (!moduleKey && requestedStatus !== MODULE_STATUS.ERROR)
      ? MODULE_STATUS.UNMAPPED
      : requestedStatus;
    const moduleReason = moduleStatus === MODULE_STATUS.UNMAPPED
      ? 'module_key_not_recognized'
      : reason;

    return {
      moduleKey,
      moduleLabel: resolveCanonicalModuleLabel({ moduleKey, fallbackRequestedModule: requestedModule }),
      requestedModule,
      status: moduleStatus,
      ready: moduleStatus === MODULE_STATUS.READY,
      reason: moduleReason,
      lastBootstrapAt: now,
      source,
    };
  });

  return normalizeModuleStatuses(entries, {
    defaultReady: ready,
    defaultStatus: requestedStatus,
    defaultTimestamp: now,
    defaultReason: reason,
    defaultSource: source,
  });
}

function resolveFriendlyModuloLabel(moduloDoc, fallbackValue) {
  const nome = normalizeNullableText(moduloDoc?.nome);
  if (nome) return nome;

  const urlBase = normalizeNullableText(moduloDoc?.url_base);
  const slug = normalizeModuloSlug(urlBase);

  if (slug.includes('gestor')) return 'Gestor';
  if (slug.includes('condominio')) return 'Gestao de Condominio';
  if (slug.includes('clinica')) return 'Clinica';
  if (slug.includes('escala')) return 'Escalas';

  if (urlBase) return urlBase;
  return String(fallbackValue || '').trim();
}

function buildModuloDocMap(moduloDocs) {
  const map = new Map();

  for (const moduloDoc of moduloDocs || []) {
    const id = String(moduloDoc?._id || '').trim();
    if (!id) continue;
    map.set(id, moduloDoc);
  }

  return map;
}

async function resolveFriendlyModulosHabilitados(modulosHabilitados) {
  const normalizedModules = normalizeModulosHabilitados(modulosHabilitados);
  if (normalizedModules.length === 0) return [];

  const moduloIds = [];
  const knownIds = new Set();

  for (const moduloValue of normalizedModules) {
    const moduloId = String(moduloValue || '').trim();
    if (!looksLikeObjectId(moduloId)) continue;
    if (knownIds.has(moduloId)) continue;
    knownIds.add(moduloId);
    moduloIds.push(moduloId);
  }

  if (moduloIds.length === 0) return normalizedModules;

  let moduloDocs = [];

  try {
    moduloDocs = await provisioningRepository.findGlobalModulosByIds({
      moduloIds,
    });
  } catch (error) {
    console.warn('[UnitProvisioningService] falha ao resolver nomes de modulos', {
      moduloIds,
      error: normalizeErrorMessage(error),
    });
    return normalizedModules;
  }

  const moduloDocById = buildModuloDocMap(moduloDocs);
  const displayModules = [];

  for (const moduloValue of normalizedModules) {
    const moduloId = String(moduloValue || '').trim();
    if (!moduloId) continue;

    const moduloDoc = moduloDocById.get(moduloId);
    if (!moduloDoc) {
      displayModules.push(moduloId);
      continue;
    }

    displayModules.push(resolveFriendlyModuloLabel(moduloDoc, moduloId));
  }

  return displayModules;
}

function buildProvisioningSnapshot({ unidadeId, statusDoc, modulosHabilitados, modulosHabilitadosDisplay }) {
  const fallbackDbName = buildUnitDbName(unidadeId);
  const tenantBase = buildTenantBaseDescriptor({
    unidadeId,
    dbName: fallbackDbName,
    statusDoc,
  });

  const ready = statusDoc?.ready === true;
  const status = normalizeNullableText(statusDoc?.status) || (ready ? 'ready' : 'not_provisioned');
  const createdAt = statusDoc?.createdAt || null;
  const updatedAt = statusDoc?.['updatedAt'] || null;
  const lastProvisionedAt = statusDoc?.lastProvisionedAt || null;
  const lastProvisioningError = normalizeNullableText(statusDoc?.lastProvisioningError);
  const normalizedModules = normalizeModulosHabilitados(modulosHabilitados ?? statusDoc?.modulosHabilitados);
  const normalizedDisplayModules = normalizeModulosHabilitados(modulosHabilitadosDisplay);

  const moduleStatusesFromStatus = normalizeModuleStatuses(statusDoc?.moduleStatuses, {
    defaultReady: ready,
    defaultStatus: status,
    defaultTimestamp: lastProvisionedAt,
    defaultReason: 'loaded_from_snapshot',
    defaultSource: 'snapshot',
  });
  const fallbackModuleStatuses = buildFallbackModuleStatusesFromModules({
    modulosHabilitados: normalizedModules,
    modulosHabilitadosDisplay: normalizedDisplayModules,
    ready,
    status,
    lastProvisionedAt,
  });
  const moduleStatuses = mergeCanonicalModuleStatuses(moduleStatusesFromStatus, fallbackModuleStatuses);

  const globalStatus = {
    status,
    ready,
    lastProvisioningError,
    createdAt,
    updatedAt,
    lastProvisionedAt,
  };

  return {
    unidadeId,
    dbName: tenantBase.dbName,
    status,
    ready,
    tipo: normalizeTipo(statusDoc?.tipo),
    lastProvisioningError,
    modulosHabilitados: normalizedModules,
    modulosHabilitadosDisplay: normalizedDisplayModules.length > 0 ? normalizedDisplayModules : normalizedModules,
    createdAt,
    updatedAt,
    lastProvisionedAt,
    tenantBase,
    globalStatus,
    moduleStatuses,
    snapshotVersion: normalizeNullableText(statusDoc?.snapshotVersion) || SNAPSHOT_CANONICAL_VERSION,
    inspectedAt: new Date(),
  };
}

async function registerProvisioningErrorStatus({ unidadeId, dbName, tipo, modulosHabilitados, error }) {
  const now = new Date();
  const tenantBase = buildTenantBaseDescriptor({ unidadeId, dbName });
  const moduleStatuses = buildPersistedModuleStatusesFromRequestedModules({
    modulosHabilitados,
    status: 'error',
    ready: false,
    reason: 'provisioning_error',
    now,
  });

  try {
    await provisioningRepository.ensureGlobalProvisioningIndex({
      collectionName: GLOBAL_PROVISIONING_COLLECTION,
      indexSpec: { unidadeId: 1 },
      indexOptions: { unique: true, name: GLOBAL_PROVISIONING_INDEX_NAME },
    });

    await provisioningRepository.upsertGlobalProvisioningStatus({
      collectionName: GLOBAL_PROVISIONING_COLLECTION,
      unidadeId,
      payload: {
        dbName: tenantBase.dbName,
        tipo,
        modulosHabilitados,
        ready: false,
        status: 'error',
        lastProvisioningError: normalizeErrorMessage(error),
        tenantBase,
        tenantBaseModel: tenantBase.model,
        tenantBaseUnidadeId: tenantBase.unidadeId,
        tenantBaseDbName: tenantBase.dbName,
        moduleStatuses,
        snapshotVersion: SNAPSHOT_CANONICAL_VERSION,
      },
      now,
    });
  } catch (statusError) {
    console.error('[UnitProvisioningService] falha ao registrar status error', {
      unidadeId,
      error: normalizeErrorMessage(statusError),
    });
  }
}

function wrapProvisioningError(stage, unidadeId, error) {
  const details = String(error?.message || error || 'UNKNOWN_ERROR');
  return new Error(`[UnitProvisioningService] ${stage} falhou para unidade ${unidadeId}: ${details}`);
}

export function isUnitProvisioningValidationError(error) {
  return error instanceof UnitProvisioningValidationError
    || String(error?.code || '').trim() === 'UNIT_PROVISIONING_VALIDATION';
}

export function buildUnitDbName(unidadeId) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
  return `wdgestor_unit_${normalizedUnidadeId}`;
}

export async function ensureBaseIndexes({ unidadeId }) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
  const dbName = buildUnitDbName(normalizedUnidadeId);

  try {
    await provisioningRepository.ensureTenantProvisioningCollection({
      unidadeId: normalizedUnidadeId,
      collectionName: TENANT_BOOTSTRAP_COLLECTION,
    });

    await provisioningRepository.ensureTenantProvisioningIndex({
      unidadeId: normalizedUnidadeId,
      collectionName: TENANT_BOOTSTRAP_COLLECTION,
      indexSpec: { key: 1 },
      indexOptions: { unique: true, name: TENANT_BOOTSTRAP_INDEX_NAME },
    });

    const now = new Date();
    await provisioningRepository.upsertTenantProvisioningMarker({
      unidadeId: normalizedUnidadeId,
      collectionName: TENANT_BOOTSTRAP_COLLECTION,
      markerKey: TENANT_BOOTSTRAP_MARKER_KEY,
      dbName,
      now,
    });

    return {
      ok: true,
      unidadeId: normalizedUnidadeId,
      dbName,
      collection: TENANT_BOOTSTRAP_COLLECTION,
      indexName: TENANT_BOOTSTRAP_INDEX_NAME,
      markerKey: TENANT_BOOTSTRAP_MARKER_KEY,
    };
  } catch (error) {
    throw wrapProvisioningError('ensureBaseIndexes', normalizedUnidadeId, error);
  }
}

export async function ensureUnitProvisioned({ unidadeId, tipo, modulosHabilitados } = {}) {
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
    const baseResult = await ensureBaseIndexes({ unidadeId: normalizedUnidadeId });
    const moduleBootstrap = await dispatchModuleBootstraps({
      unidadeId: normalizedUnidadeId,
      dbName,
      modulosHabilitados: normalizedModulos,
      repository: provisioningRepository,
    });
    await registerModuleBootstrapAuditEvents({
      unidadeId: normalizedUnidadeId,
      dbName,
      operation: 'ensure',
      moduleBootstrap,
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

    await provisioningRepository.upsertGlobalProvisioningStatus({
      collectionName: GLOBAL_PROVISIONING_COLLECTION,
      unidadeId: normalizedUnidadeId,
      payload: {
        dbName: tenantBase.dbName,
        tipo: normalizedTipo,
        modulosHabilitados: normalizedModulos,
        ready: true,
        status: 'ready',
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
      eventType: 'unit_provisioning_succeeded',
      scope: 'unit',
      status: 'success',
      message: 'Provisioning da unidade concluido.',
      operation: 'ensure',
      metadata: {
        tipo: normalizedTipo,
        alreadyProvisioned,
        resolvedModuleKeys: Array.isArray(moduleBootstrap?.resolvedModuleKeys)
          ? moduleBootstrap.resolvedModuleKeys
          : [],
        executedModuleKeys: Array.isArray(moduleBootstrap?.executedModuleKeys)
          ? moduleBootstrap.executedModuleKeys
          : [],
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
      globalStatus: 'ready',
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
}

export async function inspectUnitProvisioning({ unidadeId } = {}) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);

  const statusDoc = await provisioningRepository.findGlobalProvisioningStatusSnapshotByUnidadeId({
    collectionName: GLOBAL_PROVISIONING_COLLECTION,
    unidadeId: normalizedUnidadeId,
  });

  const modulosHabilitados = normalizeModulosHabilitados(statusDoc?.modulosHabilitados);
  const modulosHabilitadosDisplay = await resolveFriendlyModulosHabilitados(modulosHabilitados);

  return buildProvisioningSnapshot({
    unidadeId: normalizedUnidadeId,
    statusDoc,
    modulosHabilitados,
    modulosHabilitadosDisplay,
  });
}

export async function retryUnitProvisioning({ unidadeId, tipo, modulosHabilitados, modulosRetry } = {}) {
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
    await safeRegisterProvisioningAuditEvent({
      unidadeId: normalizedUnidadeId,
      dbName,
      eventType: 'unit_retry_started',
      scope: 'unit',
      status: 'started',
      message: 'Retry global de provisioning iniciado.',
      operation: 'retry_global',
      metadata: {
        retryMode: 'global',
        modulosSolicitados: normalizedModulos,
      },
    });

    try {
      const provisioningResult = await ensureUnitProvisioned({
        unidadeId: normalizedUnidadeId,
        tipo: normalizedTipo,
        modulosHabilitados: normalizedModulos,
      });

      const snapshot = await inspectUnitProvisioning({ unidadeId: normalizedUnidadeId });

      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: 'unit_retry_succeeded',
        scope: 'unit',
        status: 'success',
        message: 'Retry global de provisioning concluido.',
        operation: 'retry_global',
        metadata: {
          retryMode: 'global',
          modulosSolicitados: normalizedModulos,
        },
      });

      return {
        ok: true,
        unidadeId: normalizedUnidadeId,
        retried: true,
        previousStatus: currentSnapshot.status,
        request: {
          tipo: normalizedTipo,
          modulosHabilitados: normalizedModulos,
        },
        provisioningResult,
        snapshot,
      };
    } catch (error) {
      await safeRegisterProvisioningAuditEvent({
        unidadeId: normalizedUnidadeId,
        dbName,
        eventType: 'unit_retry_failed',
        scope: 'unit',
        status: 'error',
        message: 'Retry global de provisioning falhou.',
        reason: normalizeErrorMessage(error),
        operation: 'retry_global',
        metadata: {
          retryMode: 'global',
          modulosSolicitados: normalizedModulos,
        },
      });

      throw error;
    }
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
    await failSelectiveRetryValidation(
      `Modulo(s) de retry invalidos: ${selectiveRetryResolution.invalidModules.join(', ')}`,
      {
        invalidModules: selectiveRetryResolution.invalidModules,
      }
    );
  }

  const retryModuleKeys = selectiveRetryResolution.moduleKeys;
  if (retryModuleKeys.length === 0) {
    await failSelectiveRetryValidation('Informe ao menos um modulo valido para retry seletivo.');
  }

  const unsupportedRetryModuleKeys = retryModuleKeys.filter(
    (moduleKey) => !RETRY_BOOTSTRAPPABLE_MODULE_KEYS.has(moduleKey)
  );
  if (unsupportedRetryModuleKeys.length > 0) {
    await failSelectiveRetryValidation(
      `Modulo(s) sem bootstrap de retry seletivo: ${unsupportedRetryModuleKeys.join(', ')}`,
      {
        unsupportedModules: unsupportedRetryModuleKeys,
      }
    );
  }

  const enabledModuleKeys = collectEnabledModuleKeys({
    modulosHabilitados: normalizedModulos,
    modulosHabilitadosDisplay: currentSnapshot.modulosHabilitadosDisplay,
    moduleStatuses: currentSnapshot.moduleStatuses,
  });
  const enabledModuleKeySet = new Set(enabledModuleKeys);
  const unavailableModuleKeys = retryModuleKeys.filter((moduleKey) => !enabledModuleKeySet.has(moduleKey));

  if (unavailableModuleKeys.length > 0) {
    await failSelectiveRetryValidation(
      `Modulo(s) nao habilitado(s) para a unidade: ${unavailableModuleKeys.join(', ')}`,
      {
        unavailableModules: unavailableModuleKeys,
      }
    );
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
    const baseResult = await ensureBaseIndexes({ unidadeId: normalizedUnidadeId });
    const moduleBootstrap = await dispatchModuleBootstraps({
      unidadeId: normalizedUnidadeId,
      dbName,
      modulosHabilitados: normalizedModulos,
      targetModuleKeys: retryModuleKeys,
      repository: provisioningRepository,
    });
    await registerModuleBootstrapAuditEvents({
      unidadeId: normalizedUnidadeId,
      dbName,
      operation: 'retry_selective',
      moduleBootstrap,
      retryMode: 'selective',
    });

    const targetOutOfScopeModuleKeys = Array.isArray(moduleBootstrap.targetOutOfScopeModuleKeys)
      ? moduleBootstrap.targetOutOfScopeModuleKeys
      : [];
    if (targetOutOfScopeModuleKeys.length > 0) {
      await failSelectiveRetryValidation(
        `Modulo(s) fora do escopo habilitado: ${targetOutOfScopeModuleKeys.join(', ')}`,
        {
          targetOutOfScopeModules: targetOutOfScopeModuleKeys,
        }
      );
    }

    const selectedModuleKeys = Array.isArray(moduleBootstrap.selectedModuleKeys)
      ? moduleBootstrap.selectedModuleKeys
      : [];
    if (selectedModuleKeys.length === 0) {
      await failSelectiveRetryValidation('Nenhum modulo elegivel para retry seletivo foi encontrado.');
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
        ready: true,
        status: 'ready',
        lastProvisioningError: null,
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
      eventType: 'unit_retry_succeeded',
      scope: 'unit',
      status: 'success',
      message: 'Retry seletivo de provisioning concluido.',
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
        globalStatus: 'ready',
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

    try {
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
    } catch (statusError) {
      console.error('[UnitProvisioningService] falha ao registrar status de retry seletivo em erro', {
        unidadeId: normalizedUnidadeId,
        error: normalizeErrorMessage(statusError),
      });
    }

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
}

export async function listUnitProvisioningAuditEvents({
  unidadeId,
  limit = 100,
  scope,
  moduleKey,
  operation,
  status,
  before,
} = {}) {
  const normalizedUnidadeId = normalizeUnidadeId(unidadeId);
  const normalizedScope = normalizeProvisioningEventScopeFilter(scope);
  const normalizedModuleKey = normalizeProvisioningEventModuleKeyFilter(moduleKey);
  const normalizedOperation = normalizeProvisioningEventOperationFilter(operation);
  const normalizedStatus = normalizeProvisioningEventStatusFilter(status);
  const normalizedBefore = normalizeProvisioningEventsBeforeCursor(before);
  await ensureProvisioningEventsIndexes();

  const eventDocs = await provisioningRepository.listGlobalProvisioningEventsByUnidadeId({
    collectionName: GLOBAL_PROVISIONING_EVENTS_COLLECTION,
    unidadeId: normalizedUnidadeId,
    limit,
    scope: normalizedScope,
    moduleKey: normalizedModuleKey,
    operation: normalizedOperation,
    status: normalizedStatus,
    beforeDate: normalizedBefore?.beforeDate,
    beforeEventId: normalizedBefore?.beforeEventId,
  });

  return eventDocs.map((eventDoc) => ({
    eventId: normalizeNullableText(eventDoc?._id),
    unidadeId: normalizeNullableText(eventDoc?.unidadeId) || normalizedUnidadeId,
    dbName: normalizeNullableText(eventDoc?.dbName) || buildUnitDbName(normalizedUnidadeId),
    eventType: normalizeNullableText(eventDoc?.eventType) || 'unit_event',
    scope: normalizeProvisioningEventScope(eventDoc?.scope),
    moduleKey: normalizeNullableText(eventDoc?.moduleKey),
    status: normalizeProvisioningEventStatus(eventDoc?.status, 'info'),
    message: normalizeNullableText(eventDoc?.message),
    reason: normalizeNullableText(eventDoc?.reason),
    operation: normalizeNullableText(eventDoc?.operation),
    metadata: (eventDoc?.metadata && typeof eventDoc.metadata === 'object' && !Array.isArray(eventDoc.metadata))
      ? eventDoc.metadata
      : {},
    createdAt: normalizeDateValue(eventDoc?.createdAt) || null,
  }));
}
