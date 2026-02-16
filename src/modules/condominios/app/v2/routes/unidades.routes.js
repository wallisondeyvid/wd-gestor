import { listarUnidadesService, obterUnidadePorIdService, listarUnidadesRelacionadasService } from '#modules/condominios/app/services/unidades.service.js';

let handleGetUnidadesV2Context = null;

export function setHandleGetUnidadesV2Context(context) {
  handleGetUnidadesV2Context = context || null;
}

export async function handleGetUnidadesV2(req, res, _next) {
  try {
    const payload = await listarUnidadesService({
      req,
      mongoose: handleGetUnidadesV2Context?.mongoose,
      getCtxUser: handleGetUnidadesV2Context?.getCtxUser,
      userCanScopeAll: handleGetUnidadesV2Context?.userCanScopeAll,
      normalizeObjectIdString: handleGetUnidadesV2Context?.normalizeObjectIdString,
      getUserUnidadeId: handleGetUnidadesV2Context?.getUserUnidadeId,
      resolveUnidadeIdForNonScopedUser: handleGetUnidadesV2Context?.resolveUnidadeIdForNonScopedUser,
      listarUnidadesParaUsuario: handleGetUnidadesV2Context?.listarUnidadesParaUsuario,
      buildUnidadePayload: handleGetUnidadesV2Context?.buildUnidadePayload
    });
    return res.json(payload);
  } catch {
    return res.status(500).json({ error: 'Falha ao listar unidades' });
  }
}

export async function handleGetUnidadeByIdV2(req, res, _next) {
  try {
    const payload = await obterUnidadePorIdService({
      req,
      mongoose: handleGetUnidadesV2Context?.mongoose,
      Unidade: handleGetUnidadesV2Context?.Unidade,
      buildUnidadePayload: handleGetUnidadesV2Context?.buildUnidadePayload
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Unidade não encontrada' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter unidade' });
  }
}

export async function handleGetUnidadesRelacionadasV2(req, res, _next) {
  try {
    const payload = await listarUnidadesRelacionadasService({
      req,
      mongoose: handleGetUnidadesV2Context?.mongoose,
      Unidade: handleGetUnidadesV2Context?.Unidade,
      CondBloco: handleGetUnidadesV2Context?.CondBloco,
      CondAndar: handleGetUnidadesV2Context?.CondAndar,
      buildUnidadePayload: handleGetUnidadesV2Context?.buildUnidadePayload
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar unidades relacionadas' });
  }
}
