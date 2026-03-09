export function createUpdateFeedbackStatusHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  findFeedbackByIdAndUpdateSetNewLean,
  logError = console.error,
}) {
  return async function updateStatus(req, res) {
    try {
      if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const status = normalizeStatus(req.body?.status);
      const fb = await findFeedbackByIdAndUpdateSetNewLean(id, { status });
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
      return apiOk(res, fb);
    } catch (e) {
      logError('[feedbackApi] status update erro:', e);
      return apiFail(res, 500, 'Erro ao salvar status.');
    }
  };
}
