import { listarBlocosService, obterBlocoPorIdService, listarBlocosRelacionadosService, criarBlocoService, atualizarBlocoService, excluirBlocoService } from '#modules/condominios/app/services/blocos.service.js';

let handleGetBlocosV2Context = null;

export function setHandleGetBlocosV2Context(context) {
  handleGetBlocosV2Context = context || null;
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
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao listar blocos', 'INTERNAL_ERROR'));
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
    if (e && e.__httpStatus === 400) return res.status(400).json(toErrorPayload(e.__httpPayload, 'Identificador inválido', 'INVALID_ID'));
    if (e && e.__httpStatus === 404) return res.status(404).json(toErrorPayload(e.__httpPayload, 'Bloco não encontrado', 'NOT_FOUND'));
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao obter bloco', 'INTERNAL_ERROR'));
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
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao listar blocos relacionados', 'INTERNAL_ERROR'));
  }
}

export async function handlePostBlocosV2(req, res, _next) {
  try {
    const result = await criarBlocoService({
      unitScope: req?.unitScope,
      body: req.body,
      mongoose: handleGetBlocosV2Context?.mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco: handleGetBlocosV2Context?.CondBloco
    });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(toErrorPayload(e.__httpPayload, 'unidade_id e nome são obrigatórios', 'BAD_REQUEST'));
    if (e && e.__httpStatus === 409) return res.status(409).json(toErrorPayload(e.__httpPayload, 'Bloco já existe para este condomínio', 'CONFLICT'));
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(toErrorPayload(e.__httpPayload, 'DB indisponível', 'DB_UNAVAILABLE'));
    }
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao criar bloco', 'INTERNAL_ERROR'));
  }
}

export async function handlePutBlocosV2(req, res, _next) {
  try {
    console.warn('[handlePutBlocosV2][input]', {
      method: req?.method,
      path: req?.path,
      query: req?.query,
      unitScope: req?.unitScope ?? null
    });
    const result = await atualizarBlocoService({
      unitScope: req?.unitScope,
      id: req.params?.id,
      body: req.body,
      mongoose: handleGetBlocosV2Context?.mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco: handleGetBlocosV2Context?.CondBloco
    });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao atualizar bloco', 'INTERNAL_ERROR'));
  }
}

export async function handleDeleteBlocosV2(req, res, _next) {
  try {
    console.warn('[handleDeleteBlocosV2][input]', {
      method: req?.method,
      path: req?.path,
      query: req?.query,
      unitScope: req?.unitScope ?? null
    });
    const result = await excluirBlocoService({
      unitScope: req?.unitScope,
      id: req.params?.id,
      mongoose: handleGetBlocosV2Context?.mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco: handleGetBlocosV2Context?.CondBloco
    });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json(toErrorPayload(e && e.__httpPayload, 'Falha ao excluir bloco', 'INTERNAL_ERROR'));
  }
}
