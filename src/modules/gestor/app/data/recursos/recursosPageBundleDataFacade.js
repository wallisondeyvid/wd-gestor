import {
  findAllUnidadesLeanRepo,
  findUnidadesPrincipaisLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { GLOBAL_SCOPE } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export async function findAllUnidadesLeanForRecursosPageData() {
  return findAllUnidadesLeanRepo({ unitScope: GLOBAL_SCOPE });
}

export async function findUnidadesPrincipaisLeanForRecursosPageData() {
  return findUnidadesPrincipaisLeanRepo({ unitScope: GLOBAL_SCOPE });
}