import User from '#models/user.js';
import PasswordReset from '#models/passwordReset.js';
import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';
import Modulo from '#models/modulo.js';
import Funcao from '#models/funcao.js';
import RememberToken from '#models/rememberToken.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findModuloByOrRepo({ unitScope, or }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.findOne({ $or: or });
}

export async function findModuloLeanByOrSelectRepo({ unitScope, or, select }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.findOne({ $or: or }).select(select).lean();
}

export async function findUnidadeByIdSelectRepo({ unitScope, id, select }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(id).select(select);
}

export async function findUnidadeLeanByIdRepo({ unitScope, id }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(id).lean();
}

export async function findUnidadePrincipalLeanRepo({ unitScope }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ is_principal: true }).lean();
}

export async function findFuncionarioByIdSelectRepo({ unitScope, id, select }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findById(id).select(select);
}

export async function findFuncionarioByEmailPopulateRepo({ unitScope, email }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.findOne({ email }).populate('unidade_id funcao_id');
}

export async function findFuncionariosByCpfSelectRepo({ unitScope, cpf, select }) {
  const FuncionarioModel = resolveModel({
    name: Funcionario.modelName || 'Funcionario',
    schema: Funcionario.schema,
    unitScope,
  });

  return FuncionarioModel.find({ cpf }).select(select);
}

export async function findFuncaoByIdSelectRepo({ unitScope, id, select }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findById(id).select(select);
}

export async function findUserByEmailRepo({ unitScope, email }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ email });
}

export async function findUserLeanByEmailRepo({ unitScope, email }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ email }).lean();
}

export async function findUserByIdSelectRepo({ unitScope, id, select }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findById(id).select(select);
}

export async function findUserByIdRepo({ unitScope, id }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findById(id);
}

export async function findUsersByCpfRepo({ unitScope, cpf }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ cpf });
}

export async function findUsersByFuncionarioIdsRepo({ unitScope, ids }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ funcionario_id: { $in: ids } });
}

export async function createRememberTokenRepo({ unitScope, payload }) {
  const RememberTokenModel = resolveModel({
    name: RememberToken.modelName || 'RememberToken',
    schema: RememberToken.schema,
    unitScope,
  });

  return RememberTokenModel.create(payload);
}

export async function revokeRememberTokenByHashRepo({ unitScope, tokenHash }) {
  const RememberTokenModel = resolveModel({
    name: RememberToken.modelName || 'RememberToken',
    schema: RememberToken.schema,
    unitScope,
  });

  return RememberTokenModel.updateOne(
    { token_hash: tokenHash },
    { $set: { revoked: true, lastUsedAt: new Date() } },
  );
}

export async function findPasswordResetByTokenRepo({ unitScope, token }) {
  const PasswordResetModel = resolveModel({
    name: PasswordReset.modelName || 'PasswordReset',
    schema: PasswordReset.schema,
    unitScope,
  });

  return PasswordResetModel.findOne({ token });
}

export async function createPasswordResetRepo({ unitScope, payload }) {
  const PasswordResetModel = resolveModel({
    name: PasswordReset.modelName || 'PasswordReset',
    schema: PasswordReset.schema,
    unitScope,
  });

  return PasswordResetModel.create(payload);
}

export async function deletePasswordResetByIdRepo({ unitScope, id }) {
  const PasswordResetModel = resolveModel({
    name: PasswordReset.modelName || 'PasswordReset',
    schema: PasswordReset.schema,
    unitScope,
  });

  return PasswordResetModel.deleteOne({ _id: id });
}