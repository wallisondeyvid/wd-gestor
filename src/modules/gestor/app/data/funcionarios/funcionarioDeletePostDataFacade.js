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

export async function findLinkedUserForDeletePostData({ funcionarioId }) {
  return findUserByFuncionarioIdRepo({ unitScope: GLOBAL_SCOPE, funcionarioId });
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