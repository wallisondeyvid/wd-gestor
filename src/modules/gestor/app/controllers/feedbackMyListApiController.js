export function createMyFeedbackListHandler({
  apiOk,
  apiFail,
  feedbackPolicy,
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
  logError = console.error,
}) {
  return async function listMyFeedback(req, res) {
    try {
      const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
      const filterResult = feedbackPolicy.buildMyFeedbackFilter({
        currentUser: req.user || null,
        scopedUnitId,
      });
      const filter = filterResult?.filter || {};

      const items = await findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter, {
        scopedUnitId,
        allowLegacyUnscoped: true,
        preferScopedRepoRead: true,
      });

      return apiOk(res, items);
    } catch (e) {
      logError('[feedbackApi] GET /api/feedback/meus erro:', e);
      return apiFail(res, 500, 'Erro ao listar.');
    }
  };
}
