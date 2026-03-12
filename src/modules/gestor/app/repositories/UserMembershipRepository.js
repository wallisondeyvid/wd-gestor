import UserMembership from '#models/userMembership.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findActiveMembershipsByUserIdLeanRepo({ unitScope, userId }) {
  const UserMembershipModel = resolveModel({
    name: UserMembership.modelName || 'UserMembership',
    schema: UserMembership.schema,
    unitScope,
  });

  return UserMembershipModel.find({ user_id: userId, status: 'active' })
    .select('_id user_id unidade_id papel_contextual status funcionario_id')
    .sort({ createdAt: 1 })
    .lean();
}

export async function findUserMembershipsByUserIdsLeanRepo({ unitScope, userIds }) {
  const normalizedUserIds = Array.isArray(userIds)
    ? userIds.map((userId) => String(userId || '').trim()).filter(Boolean)
    : [];

  if (normalizedUserIds.length === 0) return [];

  const UserMembershipModel = resolveModel({
    name: UserMembership.modelName || 'UserMembership',
    schema: UserMembership.schema,
    unitScope,
  });

  return UserMembershipModel.find({ user_id: { $in: normalizedUserIds } })
    .select('_id user_id unidade_id papel_contextual status funcionario_id')
    .sort({ user_id: 1, createdAt: 1 })
    .lean();
}

export async function findUserMembershipByUserAndUnidadeLeanRepo({ unitScope, userId, unidadeId }) {
  const UserMembershipModel = resolveModel({
    name: UserMembership.modelName || 'UserMembership',
    schema: UserMembership.schema,
    unitScope,
  });

  return UserMembershipModel.findOne({ user_id: userId, unidade_id: unidadeId })
    .select('_id user_id unidade_id papel_contextual status funcionario_id')
    .lean();
}

export async function createUserMembershipRepo({ unitScope, data }) {
  const UserMembershipModel = resolveModel({
    name: UserMembership.modelName || 'UserMembership',
    schema: UserMembership.schema,
    unitScope,
  });

  return UserMembershipModel.create(data || {});
}

export async function setUserMembershipFuncionarioIdIfEmptyRepo({ unitScope, membershipId, funcionarioId }) {
  const UserMembershipModel = resolveModel({
    name: UserMembership.modelName || 'UserMembership',
    schema: UserMembership.schema,
    unitScope,
  });

  return UserMembershipModel.findOneAndUpdate(
    {
      _id: membershipId,
      $or: [
        { funcionario_id: null },
        { funcionario_id: { $exists: false } },
      ],
    },
    {
      $set: { funcionario_id: funcionarioId },
    },
    { new: true }
  ).lean();
}