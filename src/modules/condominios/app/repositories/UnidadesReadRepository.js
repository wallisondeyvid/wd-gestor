import Unidade from '#models/unidade.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export class UnidadesReadRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getUnidadeModel() {
    return resolveModel({
      name: Unidade['modelName'],
      schema: Unidade['schema'],
      unitScope: this.getUnitScope(),
    });
  }

  async findById(id, { select } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.findById(id);
    if (select) query.select(select);
    return query.lean();
  }

  async findOne(filter, { select } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.findOne(filter || {});
    if (select) query.select(select);
    return query.lean();
  }

  async findManyByIds(ids, { select } = {}) {
    const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!safeIds.length) return [];
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.find({ _id: { $in: safeIds } });
    if (select) query.select(select);
    return query.lean();
  }

  async find(filter, { select } = {}) {
    const UnidadeModel = this.getUnidadeModel();
    const query = UnidadeModel.find(filter || {});
    if (select) query.select(select);
    return query.lean();
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
