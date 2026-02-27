import User from '#models/user.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

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
