import { findFeedbackByIdAndUpdateSetNewLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';
import { findFeedbackByIdLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function normalizeScopedUnitId(options = {}) {
  return String(options?.scopedUnitId || options?.unitScope?.unidadeId || '').trim();
}

function resolveScopedUnitScope(options = {}) {
  const scopedUnitId = normalizeScopedUnitId(options);
  if (!scopedUnitId) return GLOBAL_SCOPE;

  if (options?.unitScope && typeof options.unitScope === 'object') {
    return { ...options.unitScope, unidadeId: scopedUnitId };
  }

  return { type: 'unit', unidadeId: scopedUnitId };
}

function feedbackMatchesScopedUnit(feedback, options = {}) {
  const scopedUnitId = normalizeScopedUnitId(options);
  if (!scopedUnitId) return true;

  const feedbackUnitId = String(feedback?.unidade_id || '').trim();
  if (!feedbackUnitId) return options?.allowLegacyUnscoped === true;
  return feedbackUnitId === scopedUnitId;
}

async function findFeedbackForStatusUpdate(id, options = {}) {
  const scopedUnitId = normalizeScopedUnitId(options);
  if (!scopedUnitId) {
    return {
      existing: await findFeedbackByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id }),
      writeUnitScope: GLOBAL_SCOPE,
    };
  }

  const scopedUnitScope = resolveScopedUnitScope(options);
  const scopedExisting = await findFeedbackByIdLeanRepo({ unitScope: scopedUnitScope, id });
  if (scopedExisting) {
    return { existing: scopedExisting, writeUnitScope: scopedUnitScope };
  }

  if (options?.allowLegacyUnscoped !== true) {
    return { existing: null, writeUnitScope: scopedUnitScope };
  }

  const fallbackExisting = await findFeedbackByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id });
  if (!fallbackExisting) {
    return { existing: null, writeUnitScope: scopedUnitScope };
  }

  const fallbackUnitId = String(fallbackExisting?.unidade_id || '').trim();
  return {
    existing: fallbackExisting,
    writeUnitScope: fallbackUnitId ? scopedUnitScope : GLOBAL_SCOPE,
  };
}

export async function updateFeedbackStatusLeanData(id, setData, options = {}) {
  const { existing, writeUnitScope } = await findFeedbackForStatusUpdate(id, options);
  if (!feedbackMatchesScopedUnit(existing, options)) return null;
  if (!existing) return null;
  return findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: writeUnitScope, id, setData });
}