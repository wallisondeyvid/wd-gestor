export function createAdminFeedbackDetailHandler({
  isAdminLike,
  apiOk,
  apiFail,
  findFeedbackByIdLean,
  sanitizeFeedback,
  logError = console.error,
}) {
  return async function detailFeedbackAdmin(req, res) {
    try {
      if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const fb = await findFeedbackByIdLean(id);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
      return apiOk(res, sanitizeFeedback(fb));
    } catch (e) {
      logError('[feedbackApi] GET /api/gestor/feedback/:id erro:', e);
      return apiFail(res, 500, 'Erro ao detalhar.');
    }
  };
}
