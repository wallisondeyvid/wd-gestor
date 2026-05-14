import {
  deleteFuncionarioByIdRepo,
  findFuncionarioByIdRepo,
} from '#modules/gestor/app/repositories/FuncionarioRepository.js';
import { findUserByFuncionarioIdRepo } from '#modules/gestor/app/repositories/UserRepository.js';
import { GLOBAL_SCOPE, scopeFromUnidadeId } from '#modules/gestor/app/data/funcoes/funcoesScope.js';

export async function findFuncionarioForDeletePostData({ funcionarioId, unidadeId = null }) {
  return findFuncionarioByIdRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id: funcionarioId,
    unidadeId,
  });
}

function resolveLinkedUserUnitScope({ unidadeId = null, canonicalUnitId = null, unitScope = null }) {
  if (unitScope) {
    return unitScope;
  }

  const contextualUnitId = canonicalUnitId || unidadeId || null;

  if (contextualUnitId) {
    return scopeFromUnidadeId(contextualUnitId);
  }

  // Keep the legacy global branch explicit until every caller propagates tenant context.
  return GLOBAL_SCOPE;
}

export async function findLinkedUserForDeletePostData({ funcionarioId, unidadeId = null, canonicalUnitId = null, unitScope = null }) {
  return findUserByFuncionarioIdRepo({
    unitScope: resolveLinkedUserUnitScope({ unidadeId, canonicalUnitId, unitScope }),
    funcionarioId,
  });
}

export async function deleteFuncionarioForDeletePostData({ funcionarioId, unidadeId = null }) {
  return deleteFuncionarioByIdRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id: funcionarioId,
    unidadeId,
  });
}

export default {
  findFuncionarioForDeletePostData,
  findLinkedUserForDeletePostData,
  deleteFuncionarioForDeletePostData,
};