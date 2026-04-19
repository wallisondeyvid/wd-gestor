import { processUpdateFeedbackRespostaCore } from './utils/processUpdateFeedbackRespostaCore.js';

export function createUpdateFeedbackRespostaHandler({
  apiOk,
  apiFail,
  feedbackPolicy,
  findFeedbackByIdAndUpdateSetNewLean,
  logError = console.error,
}) {
  return async function updateResposta(req, res) {
    try {
      const access = feedbackPolicy.ensureAdminAccess({
        currentUser: req.user || null,
        scopedUnitId: String(req.unitScope?.unidadeId || '').trim(),
      });
      if (!access.allowed) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');
      const resposta = String(req.body?.resposta || req.body?.reply || '').trim();
      if (resposta.length > 4000) return apiFail(res, 400, 'Resposta deve ter no máximo 4000 caracteres.');
      const fb = await processUpdateFeedbackRespostaCore({
        id,
        resposta,
        findFeedbackByIdAndUpdateSetNewLean: (feedbackId, setData) =>
          findFeedbackByIdAndUpdateSetNewLean(feedbackId, setData, access.feedbackMutationOptions),
      });
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
      return apiOk(res, fb);
    } catch (e) {
      logError('[feedbackApi] resposta update erro:', e);
      return apiFail(res, 500, 'Erro ao salvar resposta.');
    }
  };
}
