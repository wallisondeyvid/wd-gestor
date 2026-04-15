import {
  findFuncaoCanonicalByIdRepo,
  findFuncionarioCanonicalByIdRepo,
  loadAllModulosBaseRepo,
} from '#modules/gestor/app/repositories/UserApiModulosCanonicalRepository.js';

export async function loadAllModulosBaseData() {
  return loadAllModulosBaseRepo();
}

export async function findFuncionarioCanonicalByIdData({ funcionarioId, unidadeId = null }) {
  return findFuncionarioCanonicalByIdRepo({ funcionarioId, unidadeId });
}

export async function findFuncaoCanonicalByIdData({ funcaoId, unidadeId = null }) {
  return findFuncaoCanonicalByIdRepo({ funcaoId, unidadeId });
}
