import { processFeedbackDeleteCleanupCore } from './utils/processFeedbackDeleteCleanupCore.js';

export function createDeleteFeedbackHandler({
  apiOk,
  apiFail,
  feedbackPolicy,
  findFeedbackByIdAndDeleteLean,
  getBlobToken,
  delBlob,
  fsModule,
  pathModule,
  cwdProvider = () => process.cwd(),
  logWarn = console.warn,
  logError = console.error,
}) {
  return async function deleteFeedback(req, res) {
    try {
      const access = feedbackPolicy.ensureAdminAccess({
        currentUser: req.user || null,
        scopedUnitId: String(req.unitScope?.unidadeId || '').trim(),
      });
      if (!access.allowed) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!id) return apiFail(res, 400, 'ID inválido.');
      if (!/^[0-9a-fA-F]{24}$/.test(id)) return apiFail(res, 400, 'ID inválido.');

      const fb = await findFeedbackByIdAndDeleteLean(id, access.feedbackMutationOptions);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      await processFeedbackDeleteCleanupCore({
        id,
        fb,
        getBlobToken,
        delBlob,
        fsModule,
        pathModule,
        cwdProvider,
        logWarn,
      });

      return apiOk(res, { id, deleted: true });
    } catch (e) {
      logError('[feedbackApi] delete erro:', e);
      return apiFail(res, 500, 'Erro ao excluir feedback.');
    }
  };
}
