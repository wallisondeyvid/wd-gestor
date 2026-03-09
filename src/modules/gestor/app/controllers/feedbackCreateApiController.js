export function createCreateFeedbackHandler({
  apiOk,
  apiFail,
  normalizeTipo,
  inferModuloFromUrl,
  createFeedback,
  logError = console.error,
}) {
  return async function createFeedbackHandler(req, res) {
    try {
      const mensagem = String(req.body?.mensagem || req.body?.message || '').trim();
      if (!mensagem) return apiFail(res, 400, 'Mensagem é obrigatória.');

      const tipo = normalizeTipo(req.body?.tipo || req.body?.type);

      // Compat com o widget: { contexto: { url, timezone, user_agent, page_label, viewport } }
      const ctx = (req.body && typeof req.body === 'object' && req.body.contexto && typeof req.body.contexto === 'object') ? req.body.contexto : null;
      const ctxUrl = String((ctx && (ctx.url || ctx.path)) || req.body?.url || '').trim();
      const ctxTz = String((ctx && (ctx.timezone || ctx.tz)) || req.body?.timezone || '').trim();
      const ctxUa = String((ctx && (ctx.user_agent || ctx.userAgent)) || req.body?.userAgent || '').trim();
      const inferredModulo = String(req.body?.module || req.body?.modulo || '')?.trim() || inferModuloFromUrl(ctxUrl) || inferModuloFromUrl(req.get('referer'));
      const uaFromHeader = String(req.get('user-agent') || '').trim();

      const fb = await createFeedback({
        tipo,
        status: 'novo',
        mensagem,
        criadoPor: {
          userId: req.user?._id || req.user?.id || null,
          email: req.user?.email || '',
          nome: req.user?.nome || '',
          role: req.user?.role || ''
        },
        origem: {
          modulo: String(inferredModulo || '').trim(),
          path: String(ctxUrl || '').trim(),
          userAgent: String(ctxUa || uaFromHeader || '').trim(),
          timezone: String(ctxTz || '').trim(),
        }
      });

      return apiOk(res, fb.toObject(), { id: fb._id, created: true });
    } catch (e) {
      logError('[feedbackApi] POST /api/feedback erro:', e);
      return apiFail(res, 500, 'Erro ao criar feedback.');
    }
  };
}
