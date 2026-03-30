const ALLOWED_FEEDBACK_STATUSES = new Set([
  'novo',
  'respondido',
  'aberto',
  'em_andamento',
  'resolvido',
  'cancelado',
]);

const ALLOWED_FEEDBACK_TYPES = new Set([
  'sugestao',
  'erro',
  'elogio',
  'outro',
]);

import { processAdminFeedbackListFilterCore } from './utils/processAdminFeedbackListFilterCore.js';

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

      const filterResult = await processAdminFeedbackListFilterCore({
        q: String(req.query?.q || '').trim(),
        status: String(req.query?.status || '').trim(),
        tipo: String(req.query?.tipo || '').trim(),
        normalizeStatus,
        normalizeTipo,
      });
      if (filterResult?.error === 'invalid_status') return apiFail(res, 400, 'Status inválido.');
      if (filterResult?.error === 'invalid_tipo') return apiFail(res, 400, 'Tipo inválido.');

      const filter = filterResult?.filter || {};

      const items = await findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter);
      return apiOk(res, items.map(sanitizeFeedback));
    } catch (e) {
      logError('[feedbackApi] GET /api/gestor/feedback erro:', e);
      return apiFail(res, 500, 'Erro ao listar feedbacks.');
    }
  };
}
