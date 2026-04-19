import { findFeedbackByIdAndUpdateSetNewLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';
import { findFeedbackByIdLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function normalizeScopedUnitId(options = {}) {
  return String(options?.scopedUnitId || options?.unitScope?.unidadeId || '').trim();
}

function feedbackMatchesScopedUnit(feedback, options = {}) {
  const scopedUnitId = normalizeScopedUnitId(options);
  if (!scopedUnitId) return true;

  const feedbackUnitId = String(feedback?.unidade_id || '').trim();
  if (!feedbackUnitId) return options?.allowLegacyUnscoped === true;
  return feedbackUnitId === scopedUnitId;
}

export async function updateFeedbackStatusLeanData(id, setData, options = {}) {
  const existing = await findFeedbackByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id });
  if (!feedbackMatchesScopedUnit(existing, options)) return null;
  return findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: GLOBAL_SCOPE, id, setData });
}