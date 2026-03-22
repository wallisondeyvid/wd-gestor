import { createUnitScope } from '#shared/unitScope.js';
import {
  findAllModulosBaseLeanRepo,
  findModuloByIdLeanRepo,
} from '#modules/gestor/app/repositories/ModuloReadRepository.js';
import { findUnidadeByIdWithModulosAcessiveisLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function normalizeModuloList(modulos = []) {
  return modulos.map((modulo) => ({
    _id: modulo._id,
    nome: modulo.nome,
    descricao: modulo.descricao,
    status: modulo.status,
    url_base: modulo.url_base,
  }));
}

export async function listModulosRead({ user, activeUnitId }) {
  if (user?.role === 'master') {
    return findAllModulosBaseLeanRepo({ unitScope: GLOBAL_SCOPE });
  }

  if (!activeUnitId) {
    return [];
  }

  const unidade = await findUnidadeByIdWithModulosAcessiveisLeanRepo({
    unitScope: createUnitScope({ unidadeId: activeUnitId }),
    unidadeId: activeUnitId,
  });

  if (!unidade?.modulosAcessiveis) {
    return [];
  }

  return normalizeModuloList(unidade.modulosAcessiveis);
}

export async function getModuloByIdRead(id) {
  return findModuloByIdLeanRepo({ unitScope: GLOBAL_SCOPE, id });
}