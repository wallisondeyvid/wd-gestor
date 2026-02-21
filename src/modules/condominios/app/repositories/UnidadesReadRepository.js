import Unidade from '#models/unidade.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export class UnidadesReadRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getUnidadeModel() {
    return resolveModel({
      name: Unidade.modelName,
      schema: Unidade.schema,
      unitScope: this.getUnitScope(),
    });
  }

  async findAtivas({ selectFields } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.find({ ativa: { $ne: false } });
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  async findDaMatriz({ matrizId, selectFields } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.find({
      $or: [{ _id: matrizId }, { unidade_principal_id: matrizId }],
    });
    if (selectFields) query.select(selectFields);
    return query.lean();
  }
}
