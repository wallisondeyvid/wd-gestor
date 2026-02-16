import { listarAndaresService } from '#modules/condominios/app/services/andares.service.js';

let handleGetAndaresV2Context = null;

export function setHandleGetAndaresV2Context(context) {
  handleGetAndaresV2Context = context || null;
}

export async function handleGetAndaresV2(req, res, _next) {
  try {
    const payload = await listarAndaresService({
      req,
      mongoose: handleGetAndaresV2Context?.mongoose,
      listarUnidadesParaUsuario: handleGetAndaresV2Context?.listarUnidadesParaUsuario,
      CondAndar: handleGetAndaresV2Context?.CondAndar
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar andares' });
  }
}
