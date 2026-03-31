import { processMyFeedbackListFilterCore } from './utils/processMyFeedbackListFilterCore.js';

export function createMyFeedbackListHandler({
  apiOk,
  apiFail,
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
  logError = console.error,
}) {
  return async function listMyFeedback(req, res) {
    try {
      const filterResult = await processMyFeedbackListFilterCore({
        currentUser: req.user || null,
      });
      const filter = filterResult?.filter || {};

      const items = await findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter);

      return apiOk(res, items);
    } catch (e) {
      logError('[feedbackApi] GET /api/feedback/meus erro:', e);
      return apiFail(res, 500, 'Erro ao listar.');
    }
  };
}
