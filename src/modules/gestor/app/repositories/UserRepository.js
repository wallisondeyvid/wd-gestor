import User from '#models/user.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findUserByEmailCondLeanRepo({ unitScope, cond }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne(cond).lean();
}

export async function findUsersLockedAfterSelectLeanRepo({ unitScope, agora }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ lock_until: { $gt: agora } })
    .select('_id email role lock_until failed_login_attempts')
    .lean();
}

export async function findUserByCpfCondLeanRepo({ unitScope, cond }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne(cond).lean();
}

export async function findUserByEmailCondLeanMaxTimeMsRepo({ unitScope, cond, maxTimeMs }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne(cond).lean().maxTimeMS(maxTimeMs);
}

export async function findUserByEmailCondRepo({ unitScope, cond }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne(cond);
}

export async function findUsersByQueryLeanRepo({ unitScope, query }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find(query).lean();
}

export async function findUsersByUnidadeIdsExcludingMasterLeanRepo({ unitScope, unidadeIds }) {
  const normalizedUnitIds = Array.isArray(unidadeIds)
    ? unidadeIds.map((unidadeId) => String(unidadeId || '').trim()).filter(Boolean)
    : [];

  if (normalizedUnitIds.length === 0) return [];

  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ role: { $ne: 'master' }, unidade_id: { $in: normalizedUnitIds } }).lean();
}

export async function findUsersByIdsExcludingMasterLeanRepo({ unitScope, userIds }) {
  const normalizedUserIds = Array.isArray(userIds)
    ? userIds.map((userId) => String(userId || '').trim()).filter(Boolean)
    : [];

  if (normalizedUserIds.length === 0) return [];

  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ _id: { $in: normalizedUserIds }, role: { $ne: 'master' } }).lean();
}

export async function findUserDuplicadoByCpfUnidadeExcludingIdRepo({ unitScope, userId, cleanCpf, unidadeId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ _id: { $ne: userId }, cpf: cleanCpf, unidade_id: unidadeId });
}

export async function countUsersMastersRepo({ unitScope }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.countDocuments({ role: 'master' });
}

export async function findUserByIdSelectAuthLockInfoRepo({ unitScope, id }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findById(id).select('_id email failed_login_attempts lock_until role');
}

export async function findUsuariosDiretorAtivosPopulatedLeanRepo({ unitScope }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.find({ ativo: true, role: 'diretor' })
    .populate('funcionario_id', 'nome email')
    .lean();
}

export async function findUserByIdRepo({ unitScope, userId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findById(userId);
}

export async function deleteUserByIdRepo({ unitScope, userId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.deleteOne({ _id: userId });
}

export async function findUserByEmailRepo({ unitScope, email }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ email });
}

export async function findUserByFuncionarioIdRepo({ unitScope, funcionarioId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ funcionario_id: funcionarioId });
}

export async function updateUserUnidadeByIdRepo({ unitScope, userId, unidadeId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findByIdAndUpdate(userId, { unidade_id: unidadeId });
}

export async function findDiretorAtivoByUnidadeSelectIdRepo({ unitScope, unidadeId }) {
  const UserModel = resolveModel({
    name: User.modelName || 'User',
    schema: User.schema,
    unitScope,
  });

  return UserModel.findOne({ role: 'diretor', ativo: true, unidade_id: unidadeId }).select('_id');
}

export class UserRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getUserModel() {
    return resolveModel({
      name: User.modelName || 'User',
      schema: User.schema,
      unitScope: this.getUnitScope(),
    });
  }

  findMany({ filter, selectFields, sort } = {}) {
    const UserModel = this.getUserModel();
    const query = UserModel.find(filter || {});
    if (selectFields) query.select(selectFields);
    if (sort) query.sort(sort);
    return query.lean();
  }

  findOne({ filter, selectFields } = {}) {
    const UserModel = this.getUserModel();
    const query = UserModel.findOne(filter || {});
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  findById({ id, selectFields } = {}) {
    const UserModel = this.getUserModel();
    const query = UserModel.findById(id);
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  create(payload) {
    const UserModel = this.getUserModel();
    return UserModel.create(payload || {});
  }

  updateById({ id, set } = {}) {
    const UserModel = this.getUserModel();
    return UserModel.findByIdAndUpdate(id, { $set: set || {} }, { new: true }).lean();
  }

  deleteById({ id } = {}) {
    const UserModel = this.getUserModel();
    return UserModel.findByIdAndDelete(id);
  }
}
