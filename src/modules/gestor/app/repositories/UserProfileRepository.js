import User from '#models/user.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

const USER_PROFILE_SELECT = '_id email role global_role isMaster foto nome cpf telefone unidade_id funcionario_id';

const USER_PROFILE_POPULATE = [
  { path: 'unidade_id', select: '_id codigo nome' },
  {
    path: 'funcionario_id',
    select: '_id nome cpf telefone unidade_id',
    populate: { path: 'unidade_id', select: '_id codigo nome' },
  },
];

export class UserProfileRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getUserModel() {
    return resolveModel({
      name: User.modelName,
      schema: User.schema,
      unitScope: this.getUnitScope(),
    });
  }

  async findByIdForProfile(id) {
    const UserModel = this.getUserModel();
    return UserModel.findById(id)
      .select(USER_PROFILE_SELECT)
      .populate(USER_PROFILE_POPULATE)
      .lean();
  }

  async findByEmailForProfile(email) {
    const UserModel = this.getUserModel();
    return UserModel.findOne({ email })
      .select(USER_PROFILE_SELECT)
      .populate(USER_PROFILE_POPULATE)
      .lean();
  }
}
