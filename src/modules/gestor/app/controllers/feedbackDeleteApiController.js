export function createDeleteFeedbackHandler({
  isAdminLike,
  apiOk,
  apiFail,
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
      if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
      const id = String(req.params.feedbackId || '').trim();
      if (!id) return apiFail(res, 400, 'ID inválido.');

      const fb = await findFeedbackByIdAndDeleteLean(id);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      try {
        const blobToken = getBlobToken();
        const anexos = Array.isArray(fb?.anexos) ? fb.anexos : [];
        const urls = anexos.map((a) => a && a.url).filter(Boolean).map(String);
        for (const u of urls) {
          try {
            await delBlob(u, blobToken ? { token: blobToken } : undefined);
          } catch {
            // noop
          }
        }
      } catch (e) {
        logWarn('[feedbackApi] aviso: falha ao remover anexos do feedback (blob):', id, e?.message || e);
      }

      try {
        const ROOT = pathModule.join(cwdProvider());
        const absDir = pathModule.join(ROOT, 'public', 'uploads', 'feedback', String(id));
        if (fsModule.existsSync(absDir)) fsModule.rmSync(absDir, { recursive: true, force: true });
      } catch (e) {
        logWarn('[feedbackApi] aviso: falha ao remover anexos do feedback (fs):', id, e?.message || e);
      }

      return apiOk(res, { id, deleted: true });
    } catch (e) {
      logError('[feedbackApi] delete erro:', e);
      return apiFail(res, 500, 'Erro ao excluir feedback.');
    }
  };
}
