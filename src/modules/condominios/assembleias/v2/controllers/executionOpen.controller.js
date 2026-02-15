import { executeOpenV2 } from '#modules/condominios/assembleias/v2/services/executionOpen.service.js';

export async function postExecutionOpenV2Shadow(req) {
  try {
    return await executeOpenV2(req, { shadow: true });
  } catch (e) {
    console.error('[assembleia-execution][open][v2-shadow] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao abrir sessão' } };
  }
}
