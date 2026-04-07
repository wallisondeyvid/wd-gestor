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

export async function listModulosOwnerService({ userRole, activeUnitId } = {}) {
  if (userRole === 'master') {
    const modulos = await findAllModulosBaseLean();
    return { kind: 'ok', modulos };
  }

  const normalizedActiveUnitId = String(activeUnitId || '').trim();
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