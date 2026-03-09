export function createMyFeedbackDetailHandler({
  apiOk,
  apiFail,
  findFeedbackByIdLean,
  logError = console.error,
}) {
  return async function detailMyFeedback(req, res) {
    try {
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const fb = await findFeedbackByIdLean(id);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      const creator = fb?.criadoPor?.userId ? String(fb.criadoPor.userId) : '';
      const me = req.user?._id || req.user?.id;
      if (creator && me && String(me) !== creator) return apiFail(res, 403, 'Acesso negado.');

      return apiOk(res, fb);
    } catch (e) {
      logError('[feedbackApi] GET /api/feedback/meus/:id erro:', e);
      return apiFail(res, 500, 'Erro ao detalhar.');
    }
  };
}
