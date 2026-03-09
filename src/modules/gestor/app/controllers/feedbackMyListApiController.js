export function createMyFeedbackListHandler({
  apiOk,
  apiFail,
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
  logError = console.error,
}) {
  return async function listMyFeedback(req, res) {
    try {
      const me = req.user?._id || req.user?.id || null;
      const filter = me ? { 'criadoPor.userId': me } : { 'criadoPor.email': req.user?.email || '' };

      const items = await findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter);

      return apiOk(res, items);
    } catch (e) {
      logError('[feedbackApi] GET /api/feedback/meus erro:', e);
      return apiFail(res, 500, 'Erro ao listar.');
    }
  };
}
