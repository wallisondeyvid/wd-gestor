import {
  activateUnitDatabaseRegistry,
  markUnitDatabaseRegistryReady,
  registerUnitDatabaseRegistryPending,
} from '#shared/db/unitDatabaseRegistryWriter.js';

function createManualOwnerError(code, message, cause) {
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

function validateManualOwnerContext(context) {
  if (!context || typeof context !== 'object') {
    throw createManualOwnerError(
      'MANUAL_OWNER_CONTEXT_REQUIRED',
      'Manual owner requires explicit context.'
    );
  }

  const source = normalizeRequiredString(context.source)?.toLowerCase();
  if (source !== 'manual') {
    throw createManualOwnerError(
      'MANUAL_OWNER_CONTEXT_INVALID_SOURCE',
      'Manual owner accepts only source=manual.'
    );
  }

  if (context.approved !== true) {
    throw createManualOwnerError(
      'MANUAL_OWNER_CONTEXT_NOT_APPROVED',
      'Manual owner requires approved=true.'
    );
  }

  const reason = normalizeRequiredString(context.reason);
  if (!reason) {
    throw createManualOwnerError(
      'MANUAL_OWNER_CONTEXT_REASON_REQUIRED',
      'Manual owner requires a non-empty reason.'
    );
  }

  const actor = normalizeRequiredString(context.actor);
  if (!actor) {
    throw createManualOwnerError(
      'MANUAL_OWNER_CONTEXT_ACTOR_REQUIRED',
      'Manual owner requires a non-empty actor.'
    );
  }

  return {
    source,
    approved: true,
    reason,
    actor,
  };
}

function validateManualOwnerInput(input) {
  const unidadeId = normalizeRequiredString(input?.unidadeId);
  const dbName = normalizeRequiredString(input?.dbName);
  const databaseKey = normalizeRequiredString(input?.databaseKey);
  const context = validateManualOwnerContext(input?.context);

  if (!unidadeId || !dbName || !databaseKey) {
    throw createManualOwnerError(
      'MANUAL_OWNER_TARGET_INVALID',
      'Manual owner requires unidadeId, dbName and databaseKey.'
    );
  }

  return {
    unidadeId,
    dbName,
    databaseKey,
    context,
  };
}

export async function runUnitDatabaseRegistryManualOwner(input = {}) {
  const { unidadeId, dbName, databaseKey, context } = validateManualOwnerInput(input);

  await registerUnitDatabaseRegistryPending({
    unidadeId,
    dbName,
    databaseKey,
  });

  await markUnitDatabaseRegistryReady({
    unidadeId,
    reason: context.reason,
  });

  await activateUnitDatabaseRegistry({ unidadeId });

  return {
    ok: true,
    unidadeId,
    actor: context.actor,
    reason: context.reason,
    finalStatus: 'active',
  };
}