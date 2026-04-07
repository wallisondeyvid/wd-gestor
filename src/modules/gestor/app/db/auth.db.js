import {
  createPasswordResetRepo,
  createRememberTokenRepo,
  deletePasswordResetByIdRepo,
  findFuncionarioByEmailPopulateRepo,
  findFuncionarioByIdPopulateRepo,
  findFuncionarioByIdSelectRepo,
  findFuncaoByIdSelectRepo,
  findFuncionariosByCpfSelectRepo,
  findModuloByOrRepo,
  findModuloLeanByOrSelectRepo,
  findPasswordResetByTokenRepo,
  findUnidadeByIdSelectRepo,
  findUnidadeLeanByIdRepo,
  findUnidadePrincipalLeanRepo,
  findUserByEmailRepo,
  findUserByIdRepo,
  findUserByIdSelectRepo,
  findUserLeanByEmailRepo,
  findUsersByCpfRepo,
  findUsersByFuncionarioIdsRepo,
  revokeRememberTokenByHashRepo,
} from '#modules/gestor/app/repositories/AuthRepository.js';
import {
  findFuncaoCanonicalByIdRepo as findFuncaoCanonicalByIdUserApiRepo,
  findFuncionarioCanonicalByIdRepo as findFuncionarioCanonicalByIdUserApiRepo,
  loadAllModulosBaseRepo as loadAllModulosBaseUserApiRepo,
} from '#modules/gestor/app/repositories/UserApiModulosCanonicalRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = String(unidadeId || '').trim();
  return unidadeIdNorm && /^[a-fA-F0-9]{24}$/.test(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function findModuloByOr({ or, maxTimeMS }) {
  let query = findModuloByOrRepo({ unitScope: GLOBAL_SCOPE, or });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findModuloLeanByOrSelect({ or, select, maxTimeMS }) {
  let query = findModuloLeanByOrSelectRepo({ unitScope: GLOBAL_SCOPE, or, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeByIdSelect({ id, select, maxTimeMS }) {
  let query = findUnidadeByIdSelectRepo({ unitScope: scopeFromUnidadeId(id), id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeLeanById({ id, maxTimeMS }) {
  let query = findUnidadeLeanByIdRepo({ unitScope: scopeFromUnidadeId(id), id });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadePrincipalLean({ maxTimeMS }) {
  let query = findUnidadePrincipalLeanRepo({ unitScope: GLOBAL_SCOPE });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByIdSelect({ id, select, maxTimeMS }) {
  let query = findFuncionarioByIdSelectRepo({ unitScope: GLOBAL_SCOPE, id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByIdPopulate({ id, maxTimeMS }) {
  let query = findFuncionarioByIdPopulateRepo({ unitScope: GLOBAL_SCOPE, id });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByEmailPopulate({ email, maxTimeMS }) {
  let query = findFuncionarioByEmailPopulateRepo({ unitScope: GLOBAL_SCOPE, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionariosByCpfSelect({ cpf, select }) {
  return findFuncionariosByCpfSelectRepo({ unitScope: GLOBAL_SCOPE, cpf, select });
}

export async function findFuncaoByIdSelect({ id, select, maxTimeMS }) {
  let query = findFuncaoByIdSelectRepo({ unitScope: GLOBAL_SCOPE, id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function loadAllModulosBase() {
  return loadAllModulosBaseUserApiRepo();
}

export async function findFuncionarioCanonicalById({ funcionarioId }) {
  return findFuncionarioCanonicalByIdUserApiRepo(funcionarioId);
}

export async function findFuncaoCanonicalById({ funcaoId }) {
  return findFuncaoCanonicalByIdUserApiRepo(funcaoId);
}

export async function findUserByEmail({ email }) {
  return findUserByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
}

export async function findUserByEmailForLogin({ email, maxTimeMS }) {
  let query = findUserByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserLeanByEmail({ email, maxTimeMS }) {
  let query = findUserLeanByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserByIdSelect({ id, select }) {
  return findUserByIdSelectRepo({ unitScope: GLOBAL_SCOPE, id, select });
}

export async function findUserByIdWithMaxTime({ id, maxTimeMS }) {
  let query = findUserByIdRepo({ unitScope: GLOBAL_SCOPE, id });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUsersByCpf({ cpf }) {
  return findUsersByCpfRepo({ unitScope: GLOBAL_SCOPE, cpf });
}

export async function findUsersByFuncionarioIds({ ids }) {
  return findUsersByFuncionarioIdsRepo({ unitScope: GLOBAL_SCOPE, ids });
}

export async function saveUserDocument(user) {
  return user.save();
}

export async function createRememberToken(payload) {
  return createRememberTokenRepo({ unitScope: GLOBAL_SCOPE, payload });
}

export async function revokeRememberTokenByHash({ tokenHash }) {
  return revokeRememberTokenByHashRepo({ unitScope: GLOBAL_SCOPE, tokenHash });
}

export async function findPasswordResetByToken({ token }) {
  return findPasswordResetByTokenRepo({ unitScope: GLOBAL_SCOPE, token });
}

export async function createPasswordReset(payload) {
  return createPasswordResetRepo({ unitScope: GLOBAL_SCOPE, payload });
}

export async function deletePasswordResetById({ id }) {
  return deletePasswordResetByIdRepo({ unitScope: GLOBAL_SCOPE, id });
}