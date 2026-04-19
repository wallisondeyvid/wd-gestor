export function createUploadFeedbackAnexoHandler({
  apiOk,
  apiFail,
  findFeedbackById,
  feedbackPolicy,
  saveFeedbackDoc,
  uploadStorageInfra,
  logError = console.error,
}) {
  return async function uploadFeedbackAnexoHandler(req, res) {
    try {
      const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
      const feedbackId = String(req.params.feedbackId || '').trim();
      if (!feedbackId) return apiFail(res, 400, 'ID inválido.');
      if (!/^[0-9a-fA-F]{24}$/.test(feedbackId)) return apiFail(res, 400, 'ID inválido.');

      const fb = await findFeedbackById(feedbackId, {
        scopedUnitId,
        allowLegacyUnscoped: true,
      });
      if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

      const access = feedbackPolicy.ensureCreatorOwnership({
        currentUser: req.user || null,
        feedback: fb,
        scopedUnitId,
      });
      if (!access.allowed) {
        return apiFail(res, 403, 'Acesso negado.');
      }

      const uploadResult = await uploadStorageInfra.processUpload({
        file: req.file,
        files: req.files,
        baseUrl: req.baseUrl || '',
        feedbackId: String(fb._id),
      });
      if (uploadResult.kind === 'missing_file') return apiFail(res, 400, 'Arquivo ausente.');

      fb.anexos = Array.isArray(fb.anexos) ? fb.anexos : [];
      fb.anexos.push({
        nome: uploadResult.stored.originalName,
        url: uploadResult.stored.url,
        mime: uploadResult.file.mimetype,
        size: uploadResult.file.size || (uploadResult.file.buffer ? uploadResult.file.buffer.length : 0)
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
