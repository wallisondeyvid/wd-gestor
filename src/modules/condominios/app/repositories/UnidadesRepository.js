import Unidade from '#core/models/unidade.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export class UnidadesRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getUnidadeModel() {
    return resolveModel({
      name: Unidade['modelName'] || 'Unidade',
      schema: Unidade['schema'],
      unitScope: this.getUnitScope(),
    });
  }

  findById({ id, selectFields } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.findById(id);
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  findMany({ filter, selectFields, sort } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.find(filter || {});
    if (selectFields) query.select(selectFields);
    if (sort) query.sort(sort);
    return query.lean();
  }
}
