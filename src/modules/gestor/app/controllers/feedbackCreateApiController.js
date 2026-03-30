const ALLOWED_FEEDBACK_TYPES = new Set([
  'sugestao',
  'erro',
  'elogio',
  'outro',
]);

import { processCreateFeedbackCore } from './utils/processCreateFeedbackCore.js';

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
      if (mensagem.length > 4000) return apiFail(res, 400, 'Mensagem deve ter no máximo 4000 caracteres.');

      const rawTipo = String(req.body?.tipo || req.body?.type || '').trim();
      const tipo = normalizeTipo(rawTipo);
      if (rawTipo && !ALLOWED_FEEDBACK_TYPES.has(tipo)) return apiFail(res, 400, 'Tipo inválido.');

      const fb = await processCreateFeedbackCore({
        mensagem,
        tipo,
        rawModulo: String(req.body?.module || req.body?.modulo || '').trim(),
        contexto: req.body && typeof req.body === 'object' && req.body.contexto && typeof req.body.contexto === 'object' ? req.body.contexto : null,
        bodyUrl: String(req.body?.url || '').trim(),
        bodyTimezone: String(req.body?.timezone || '').trim(),
        bodyUserAgent: String(req.body?.userAgent || '').trim(),
        referer: String(req.get('referer') || '').trim(),
        headerUserAgent: String(req.get('user-agent') || '').trim(),
        user: req.user || null,
        inferModuloFromUrl,
        createFeedback,
      });

      return apiOk(res, fb.toObject(), { id: fb._id, created: true });
    } catch (e) {
      logError('[feedbackApi] POST /api/feedback erro:', e);
      return apiFail(res, 500, 'Erro ao criar feedback.');
    }
  };
}
