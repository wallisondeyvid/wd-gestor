import { createUnitScope } from '#shared/unitScope.js';
import { findAllModulosBaseLeanRepo } from '#modules/gestor/app/repositories/ModuloReadRepository.js';
import { findUnidadeByIdWithModulosAcessiveisLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

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
    const modulos = await findAllModulosBaseLeanRepo({ unitScope: GLOBAL_SCOPE });
    return { kind: 'ok', modulos };
  }

  const normalizedActiveUnitId = String(activeUnitId || '').trim();
  if (!normalizedActiveUnitId) {
    return { kind: 'ok', modulos: [] };
  }

  const unidade = await findUnidadeByIdWithModulosAcessiveisLeanRepo({
    unitScope: createUnitScope({ unidadeId: normalizedActiveUnitId }),
    unidadeId: normalizedActiveUnitId,
  });

  return {
    kind: 'ok',
    modulos: unidade?.modulosAcessiveis ? normalizeModuloList(unidade.modulosAcessiveis) : [],
  };
}

export default {
  listModulosOwnerService,
};