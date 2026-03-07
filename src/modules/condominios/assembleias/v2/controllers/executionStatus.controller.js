import { buildExecutionStatusById, mustAuth } from '#modules/condominios/assembleias/v2/services/executionStatus.service.js';

export async function getExecutionStatus(req, res) {
  try {
    const ctxUser = mustAuth(req, res);
    if (!ctxUser && !req?.skipAuth) return;

    const { id } = req.params;
    const result = await buildExecutionStatusById(id, { req });
    if (result.kind === 'error') {
      return res.status(result.status).json(result.body);
    }

    return res.json(result.body);
  } catch (e) {
    console.error('[assembleia-execution][status] erro:', e);
    return res.status(500).json({ ok: false, error: 'Falha ao carregar status' });
  }
}
