import { listarAndaresService, obterAndarPorIdService, listarAndaresRelacionadosService } from '#modules/condominios/app/services/andares.service.js';

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

export async function handleGetAndarByIdV2(req, res, _next) {
  try {
    const payload = await obterAndarPorIdService({
      req,
      mongoose: handleGetAndaresV2Context?.mongoose,
      CondAndar: handleGetAndaresV2Context?.CondAndar
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Andar não encontrado' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter andar' });
  }
}

export async function handleGetAndaresRelacionadosV2(req, res, _next) {
  try {
    const payload = await listarAndaresRelacionadosService({
      req,
      mongoose: handleGetAndaresV2Context?.mongoose,
      CondAndar: handleGetAndaresV2Context?.CondAndar,
      CondBloco: handleGetAndaresV2Context?.CondBloco
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar andares relacionados' });
  }
}
