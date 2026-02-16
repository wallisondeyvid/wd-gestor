import { listarBlocosService } from '#modules/condominios/app/services/blocos.service.js';

let handleGetBlocosV2Context = null;

export function setHandleGetBlocosV2Context(context) {
  handleGetBlocosV2Context = context || null;
}

export async function handleGetBlocosV2(req, res, _next) {
  try {
    const payload = await listarBlocosService({
      req,
      mongoose: handleGetBlocosV2Context?.mongoose,
      listarUnidadesParaUsuario: handleGetBlocosV2Context?.listarUnidadesParaUsuario,
      CondBloco: handleGetBlocosV2Context?.CondBloco
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar blocos' });
  }
}
