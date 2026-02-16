import { listarUnidadesService } from '#modules/condominios/app/services/unidades.service.js';

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
