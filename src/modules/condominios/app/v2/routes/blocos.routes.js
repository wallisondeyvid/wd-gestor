import { listarBlocosService, obterBlocoPorIdService, listarBlocosRelacionadosService } from '#modules/condominios/app/services/blocos.service.js';

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

export async function handleGetBlocoByIdV2(req, res, _next) {
  try {
    const payload = await obterBlocoPorIdService({
      req,
      mongoose: handleGetBlocosV2Context?.mongoose,
      CondBloco: handleGetBlocosV2Context?.CondBloco
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Bloco não encontrado' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter bloco' });
  }
}

export async function handleGetBlocosRelacionadosV2(req, res, _next) {
  try {
    const payload = await listarBlocosRelacionadosService({
      req,
      mongoose: handleGetBlocosV2Context?.mongoose,
      CondBloco: handleGetBlocosV2Context?.CondBloco,
      CondAndar: handleGetBlocosV2Context?.CondAndar
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar blocos relacionados' });
  }
}
