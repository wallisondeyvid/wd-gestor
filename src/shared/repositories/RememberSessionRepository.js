import RememberToken from '#models/rememberToken.js';
import User from '#models/user.js';
import { resolveModel } from '#shared/db/resolveModel.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';

function getQueryTimeoutMs() {
  return Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
}

export class RememberSessionRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getRememberTokenModel() {
    return resolveModel({
      name: RememberToken.modelName || 'RememberToken',
      schema: RememberToken.schema,
      unitScope: this.getUnitScope(),
    });
  }

  getUserModel() {
    return resolveModel({
      name: User.modelName || 'User',
      schema: User.schema,
      unitScope: this.getUnitScope(),
    });
  }

  findValidRememberTokenByHash(hash) {
    const RememberTokenModel = this.getRememberTokenModel();
    return RememberTokenModel
      .findOne({ token_hash: hash, revoked: false, expiresAt: { $gt: new Date() } })
      .maxTimeMS(getQueryTimeoutMs());
  }

  findActiveUserById(userId) {
    const UserModel = this.getUserModel();
    return UserModel.findById(userId).maxTimeMS(getQueryTimeoutMs());
  }

  async touchRememberTokenLastUsed(tokenId) {
    const RememberTokenModel = this.getRememberTokenModel();
    const token = await RememberTokenModel.findById(tokenId);
    if (!token) return null;
    token.lastUsedAt = new Date();
    return token.save();
  }
}
