import { runUnitDatabaseRegistryManualOwner } from '#shared/db/unitDatabaseRegistryManualOwner.js';

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

function isSyntheticUnit(input) {
  if (input === true) {
    return true;
  }

  if (!input || typeof input !== 'object') {
    return false;
  }

  return input.synthetic === true || input.controlled === true;
}

function validateManualEntrypointInput(input = {}) {
  const context = input?.context;
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
  if (!environment || environment === 'production' || environment === 'producao' || environment === 'prod') {
    throw createManualEntrypointError(
      'MANUAL_ENTRYPOINT_NON_PROD_REQUIRED',
      'Manual entrypoint requires a non-production environment.'
    );
  }

  if (!isSyntheticUnit(input.syntheticUnit)) {
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

export async function runUnitDatabaseRegistryManualEntrypoint(input = {}) {
  const normalizedInput = validateManualEntrypointInput(input);
  const ownerResult = await runUnitDatabaseRegistryManualOwner({
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
  };
}