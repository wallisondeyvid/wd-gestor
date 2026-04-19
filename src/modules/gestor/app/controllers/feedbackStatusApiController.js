const ALLOWED_FEEDBACK_STATUSES = new Set([
  'novo',
  'respondido',
  'aberto',
  'em_andamento',
  'resolvido',
  'cancelado',
]);

export function createUpdateFeedbackStatusHandler({
  apiOk,
  apiFail,
  feedbackPolicy,
  normalizeStatus,
  findFeedbackByIdAndUpdateSetNewLean,
  logError = console.error,
}) {
  return async function updateStatus(req, res) {
    try {
      const access = feedbackPolicy.ensureAdminAccess({
        currentUser: req.user || null,
        scopedUnitId: String(req.unitScope?.unidadeId || '').trim(),
      });
      if (!access.allowed) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const rawStatus = String(req.body?.status || '').trim();
      if (!rawStatus) return apiFail(res, 400, 'Status é obrigatório.');
      const status = normalizeStatus(rawStatus);
      if (!ALLOWED_FEEDBACK_STATUSES.has(status)) return apiFail(res, 400, 'Status inválido.');
      const fb = await findFeedbackByIdAndUpdateSetNewLean(id, { status }, access.feedbackMutationOptions);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
      return apiOk(res, fb);
    } catch (e) {
      logError('[feedbackApi] status update erro:', e);
      return apiFail(res, 500, 'Erro ao salvar status.');
    }
  };
}
