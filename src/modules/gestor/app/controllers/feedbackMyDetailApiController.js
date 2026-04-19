export function createMyFeedbackDetailHandler({
  apiOk,
  apiFail,
  feedbackPolicy,
  findFeedbackByIdLean,
  logError = console.error,
}) {
  return async function detailMyFeedback(req, res) {
    try {
      const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const fb = await findFeedbackByIdLean(id, {
        scopedUnitId,
        allowLegacyUnscoped: true,
      });
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      const ownershipResult = feedbackPolicy.ensureCreatorOwnership({
        feedback: fb,
        currentUser: req.user || null,
        scopedUnitId,
      });
      if (!ownershipResult.allowed) return apiFail(res, 403, 'Acesso negado.');

      return apiOk(res, fb);
    } catch (e) {
      logError('[feedbackApi] GET /api/feedback/meus/:id erro:', e);
      return apiFail(res, 500, 'Erro ao detalhar.');
    }
  };
}
