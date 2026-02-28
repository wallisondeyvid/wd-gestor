import User from '#models/user.js';
import PasswordReset from '#models/passwordReset.js';
import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';
import Modulo from '#models/modulo.js';
import Funcao from '#models/funcao.js';
import RememberToken from '#models/rememberToken.js';

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function findModuloByOr({ or, maxTimeMS }) {
  let query = Modulo.findOne({ $or: or });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findModuloLeanByOrSelect({ or, select, maxTimeMS }) {
  let query = Modulo.findOne({ $or: or }).select(select).lean();
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeByIdSelect({ id, select, maxTimeMS }) {
  let query = Unidade.findById(id).select(select);
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadeLeanById({ id, maxTimeMS }) {
  let query = Unidade.findById(id).lean();
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUnidadePrincipalLean({ maxTimeMS }) {
  let query = Unidade.findOne({ is_principal: true }).lean();
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByIdSelect({ id, select, maxTimeMS }) {
  let query = Funcionario.findById(id).select(select);
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionarioByEmailPopulate({ email, maxTimeMS }) {
  let query = Funcionario.findOne({ email }).populate('unidade_id funcao_id');
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findFuncionariosByCpfSelect({ cpf, select }) {
  return Funcionario.find({ cpf }).select(select);
}

export async function findFuncaoByIdSelect({ id, select, maxTimeMS }) {
  let query = Funcao.findById(id).select(select);
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserByEmail({ email }) {
  return User.findOne({ email });
}

export async function findUserByEmailForLogin({ email, maxTimeMS }) {
  let query = User.findOne({ email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserLeanByEmail({ email, maxTimeMS }) {
  let query = User.findOne({ email }).lean();
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUserByIdSelect({ id, select }) {
  return User.findById(id).select(select);
}

export async function findUserByIdWithMaxTime({ id, maxTimeMS }) {
  let query = User.findById(id);
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function findUsersByCpf({ cpf }) {
  return User.find({ cpf });
}

export async function findUsersByFuncionarioIds({ ids }) {
  return User.find({ funcionario_id: { $in: ids } });
}

export async function saveUserDocument(user) {
  return user.save();
}

export async function createRememberToken(payload) {
  return RememberToken.create(payload);
}

export async function revokeRememberTokenByHash({ tokenHash }) {
  return RememberToken.updateOne(
    { token_hash: tokenHash },
    { $set: { revoked: true, lastUsedAt: new Date() } },
  );
}

export async function findPasswordResetByToken({ token }) {
  return PasswordReset.findOne({ token });
}

export async function createPasswordReset(payload) {
  return PasswordReset.create(payload);
}

export async function deletePasswordResetById({ id }) {
  return PasswordReset.deleteOne({ _id: id });
}