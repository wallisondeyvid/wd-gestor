export function createUploadFeedbackAnexoHandler({
  apiOk,
  apiFail,
  findFeedbackById,
  saveFeedbackDoc,
  pickFile,
  storeFeedbackAnexo,
  logError = console.error,
}) {
  return async function uploadFeedbackAnexoHandler(req, res) {
    try {
      const feedbackId = String(req.params.feedbackId || '').trim();
      if (!feedbackId) return apiFail(res, 400, 'ID inválido.');

      const fb = await findFeedbackById(feedbackId);
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      // Seguranca: so o criador pode anexar
      const creator = fb?.criadoPor?.userId ? String(fb.criadoPor.userId) : '';
      const me = req.user?._id || req.user?.id;
      if (creator && me && String(me) !== creator) {
        return apiFail(res, 403, 'Acesso negado.');
      }

      const file = pickFile(req);
      if (!file || !file.buffer) return apiFail(res, 400, 'Arquivo ausente.');

      const stored = await storeFeedbackAnexo({ req, feedbackId: String(fb._id), file });

      fb.anexos = Array.isArray(fb.anexos) ? fb.anexos : [];
      fb.anexos.push({
        nome: stored.originalName,
        url: stored.url,
        mime: file.mimetype,
        size: file.size || (file.buffer ? file.buffer.length : 0)
      });
      await saveFeedbackDoc(fb);

      return apiOk(res, fb.toObject(), { id: fb._id });
    } catch (e) {
      if (e?.code === 'BLOB_NOT_CONFIGURED') {
        return apiFail(
          res,
          503,
          'Upload de anexo indisponível: configure o Vercel Blob (Store) ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN.',
          { code: 'BLOB_NOT_CONFIGURED' }
        );
      }
      if (e?.code === 'BLOB_UPLOAD_FAILED') {
        return apiFail(res, 503, 'Falha ao enviar anexo para a nuvem. Tente novamente em instantes.', { code: 'BLOB_UPLOAD_FAILED' });
      }
      logError('[feedbackApi] POST /api/feedback/:id/anexo erro:', e);
      return apiFail(res, 500, 'Erro ao anexar arquivo.');
    }
  };
}
