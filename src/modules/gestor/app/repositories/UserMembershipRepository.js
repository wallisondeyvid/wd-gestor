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