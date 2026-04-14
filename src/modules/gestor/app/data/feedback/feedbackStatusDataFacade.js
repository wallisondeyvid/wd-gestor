import { findFeedbackByIdAndUpdateSetNewLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function updateFeedbackStatusLeanData(id, setData) {
  return findFeedbackByIdAndUpdateSetNewLeanRepo({ unitScope: GLOBAL_SCOPE, id, setData });
}