const ALLOWED_FEEDBACK_STATUSES = new Set([
  'novo',
  'respondido',
  'aberto',
  'em_andamento',
  'resolvido',
  'cancelado',
]);

export function createAdminFeedbackListHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  normalizeTipo,
  findFeedbackByFilterSortCreatedAtDescLimit500Lean,
  sanitizeFeedback,
  logError = console.error,
}) {
  return async function listFeedbackAdmin(req, res) {
    try {
      if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');

      const q = String(req.query?.q || '').trim();
      const status = String(req.query?.status || '').trim();
      const tipo = String(req.query?.tipo || '').trim();

      const filter = {};
      if (status) {
        const normalizedStatus = normalizeStatus(status);
        if (!ALLOWED_FEEDBACK_STATUSES.has(normalizedStatus)) return apiFail(res, 400, 'Status inválido.');
        filter.status = normalizedStatus;
      }
      if (tipo) filter.tipo = normalizeTipo(tipo);

      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { mensagem: rx },
          { resposta: rx },
          { 'criadoPor.email': rx },
          { 'criadoPor.nome': rx },
        ];
      }

      const items = await findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter);
      return apiOk(res, items.map(sanitizeFeedback));
    } catch (e) {
      logError('[feedbackApi] GET /api/gestor/feedback erro:', e);
      return apiFail(res, 500, 'Erro ao listar feedbacks.');
    }
  };
}
