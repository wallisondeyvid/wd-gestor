import {
  deleteFuncaoByIdRepo,
  findFuncaoByIdRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';
import { scopeFromUnidadeId } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export async function findFuncaoById(id, unidadePrincipalId = null) {
  return findFuncaoByIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}

export async function deleteFuncaoById(id, unidadePrincipalId = null) {
  return deleteFuncaoByIdRepo({ unitScope: scopeFromUnidadeId(unidadePrincipalId), id });
}