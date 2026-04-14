import { createUnitScope } from '#shared/unitScope.js';
import {
  findUnidadeByIdLeanRepo,
  findUnidadeByIdRepo,
  findUnidadesByIdRepo,
  findUnidadesByMatrizOuPrincipalRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

export async function findUnidadeByIdLean(unidadeId) {
  return findUnidadeByIdLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export async function findUnidadesByMatrizOuPrincipal(matrizRef) {
  return findUnidadesByMatrizOuPrincipalRepo({
    unitScope: createUnitScope({ unidadeId: matrizRef }),
    matrizRef,
  });
}

export async function findUnidadeById(setorUnidadeId) {
  return findUnidadeByIdRepo({
    unitScope: createUnitScope({ unidadeId: setorUnidadeId }),
    setorUnidadeId,
  });
}

export async function findUnidadesById(unidadeId) {
  return findUnidadesByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

export default {
  findUnidadeById,
  findUnidadeByIdLean,
  findUnidadesByMatrizOuPrincipal,
  findUnidadesById,
};