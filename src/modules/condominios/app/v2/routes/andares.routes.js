import { listarAndaresService, obterAndarPorIdService, listarAndaresRelacionadosService } from '#modules/condominios/app/services/andares.service.js';

let handleGetAndaresV2Context = null;

export function setHandleGetAndaresV2Context(context) {
  handleGetAndaresV2Context = context || null;
}

function toErrorPayload(payload, fallbackError, fallbackCode) {
  const base = {
    error: String(payload?.error || fallbackError),
    success: false
  };
  if (String(process.env.WDG_DEBUG_ERRORS || '').trim() === '1') {
    base.code = String(payload?.code || fallbackCode);
  }
  return base;
}

export async function handleGetAndaresV2(req, res, _next) {
  try {
    const payload = await listarAndaresService({
      req,
      mongoose: handleGetAndaresV2Context?.mongoose,
      listarUnidadesParaUsuario: handleGetAndaresV2Context?.listarUnidadesParaUsuario
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) {
      return res.status(400).json(toErrorPayload(e.__httpPayload, 'unidade_id inválido', 'BAD_REQUEST'));
    }
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao listar andares', 'INTERNAL_ERROR'));
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
    if (e && e.__httpStatus === 400) return res.status(400).json(toErrorPayload(e.__httpPayload, 'Identificador inválido', 'INVALID_ID'));
    if (e && e.__httpStatus === 404) return res.status(404).json(toErrorPayload(e.__httpPayload, 'Andar não encontrado', 'NOT_FOUND'));
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao obter andar', 'INTERNAL_ERROR'));
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
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao listar andares relacionados', 'INTERNAL_ERROR'));
  }
}
