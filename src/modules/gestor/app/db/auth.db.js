import {
  createPasswordResetRepo,
  createRememberTokenRepo,
  deletePasswordResetByIdRepo,
  findFuncionarioByEmailPopulateRepo,
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

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function findModuloByOr({ or, maxTimeMS }) {
  let query = findModuloByOrRepo({ unitScope: null, or });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findModuloLeanByOrSelect({ or, select, maxTimeMS }) {
  let query = findModuloLeanByOrSelectRepo({ unitScope: null, or, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeByIdSelect({ id, select, maxTimeMS }) {
  let query = findUnidadeByIdSelectRepo({ unitScope: null, id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeLeanById({ id, maxTimeMS }) {
  let query = findUnidadeLeanByIdRepo({ unitScope: null, id });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadePrincipalLean({ maxTimeMS }) {
  let query = findUnidadePrincipalLeanRepo({ unitScope: null });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByIdSelect({ id, select, maxTimeMS }) {
  let query = findFuncionarioByIdSelectRepo({ unitScope: null, id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByEmailPopulate({ email, maxTimeMS }) {
  let query = findFuncionarioByEmailPopulateRepo({ unitScope: null, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionariosByCpfSelect({ cpf, select }) {
  return findFuncionariosByCpfSelectRepo({ unitScope: null, cpf, select });
}

export async function findFuncaoByIdSelect({ id, select, maxTimeMS }) {
  let query = findFuncaoByIdSelectRepo({ unitScope: null, id, select });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserByEmail({ email }) {
  return findUserByEmailRepo({ unitScope: null, email });
}

export async function findUserByEmailForLogin({ email, maxTimeMS }) {
  let query = findUserByEmailRepo({ unitScope: null, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserLeanByEmail({ email, maxTimeMS }) {
  let query = findUserLeanByEmailRepo({ unitScope: null, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserByIdSelect({ id, select }) {
  return findUserByIdSelectRepo({ unitScope: null, id, select });
}

export async function findUserByIdWithMaxTime({ id, maxTimeMS }) {
  let query = findUserByIdRepo({ unitScope: null, id });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUsersByCpf({ cpf }) {
  return findUsersByCpfRepo({ unitScope: null, cpf });
}

export async function findUsersByFuncionarioIds({ ids }) {
  return findUsersByFuncionarioIdsRepo({ unitScope: null, ids });
}

export async function saveUserDocument(user) {
  return user.save();
}

export async function createRememberToken(payload) {
  return createRememberTokenRepo({ unitScope: null, payload });
}

export async function revokeRememberTokenByHash({ tokenHash }) {
  return revokeRememberTokenByHashRepo({ unitScope: null, tokenHash });
}

export async function findPasswordResetByToken({ token }) {
  return findPasswordResetByTokenRepo({ unitScope: null, token });
}

export async function createPasswordReset(payload) {
  return createPasswordResetRepo({ unitScope: null, payload });
}

export async function deletePasswordResetById({ id }) {
  return deletePasswordResetByIdRepo({ unitScope: null, id });
}