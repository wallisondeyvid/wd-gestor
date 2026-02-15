import { getPresenceMeByExecutionId } from '#modules/condominios/assembleias/v2/services/executionPresenceMe.service.js';

export async function getExecutionPresenceMe(req, res) {
  try {
    const result = await getPresenceMeByExecutionId(req, res);
    if (result.kind === 'handled') return;
    if (result.kind === 'error') {
      return res.status(result.status).json(result.body);
    }

    return res.json(result.body);
  } catch (e) {
    console.error('[assembleia-execution][presence/me] erro:', e);
    return res.status(500).json({ ok: false, error: 'Falha ao carregar presença' });
  }
}
