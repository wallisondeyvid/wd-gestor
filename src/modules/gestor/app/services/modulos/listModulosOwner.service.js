import {
  findAllModulosBaseLean,
  findUnidadeByIdWithModulosAcessiveisLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeModuloList(modulos = []) {
  return modulos.map((modulo) => ({
    _id: modulo._id,
    nome: modulo.nome,
    descricao: modulo.descricao,
    status: modulo.status,
    url_base: modulo.url_base,
  }));
}

export async function listModulosOwnerService({ userRole, activeUnitId, authContext, requestUser } = {}) {
  if (userRole === 'master' || userRole === 'admin') {
    const modulos = await findAllModulosBaseLean();
    return { kind: 'ok', modulos };
  }

  const resolveEffectiveActiveUnitId = () => {
    const canonicalUnitId = String(
      authContext?.activeContext?.unidadeId || authContext?.active_unidade_id || ''
    ).trim();
    if (authContext?.source === 'auth-context-v1') {
      return canonicalUnitId;
    }

    return String(activeUnitId || requestUser?.unidade_id || '').trim();
  };

  const normalizedActiveUnitId = resolveEffectiveActiveUnitId();
  if (!normalizedActiveUnitId) {
    return { kind: 'ok', modulos: [] };
  }

  const unidade = await findUnidadeByIdWithModulosAcessiveisLean(normalizedActiveUnitId);

  return {
    kind: 'ok',
    modulos: unidade?.modulosAcessiveis ? normalizeModuloList(unidade.modulosAcessiveis) : [],
  };
}

export default {
  listModulosOwnerService,
};