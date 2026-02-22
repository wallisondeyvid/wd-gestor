import CondAndar from '#core/models/cond_andar.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export class AndaresRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getAndarModel() {
    return resolveModel({
      name: CondAndar.modelName || 'CondAndar',
      schema: CondAndar.schema,
      unitScope: this.getUnitScope(),
    });
  }

  findMany({ filter, selectFields, sort } = {}) {
    const AndarModel = this.getAndarModel();
    const query = AndarModel.find(filter || {});
    if (selectFields) query.select(selectFields);
    if (sort) query.sort(sort);
    return query.lean();
  }

  findOne({ filter, selectFields } = {}) {
    const AndarModel = this.getAndarModel();
    const query = AndarModel.findOne(filter || {});
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  findById({ id, selectFields } = {}) {
    const AndarModel = this.getAndarModel();
    const query = AndarModel.findById(id);
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  create({ unidade_id, nome, numero, ordem }) {
    const AndarModel = this.getAndarModel();
    return AndarModel.create({ unidade_id, nome, numero, ordem });
  }

  updateById({ id, set }) {
    const AndarModel = this.getAndarModel();
    return AndarModel.findByIdAndUpdate(id, { $set: set || {} }, { new: true }).lean();
  }

  deleteById({ id }) {
    const AndarModel = this.getAndarModel();
    return AndarModel.findByIdAndDelete(id);
  }

  async getUnidadeIdByAndarId(andarId) {
    if (!andarId) return null;

    const AndarModel = this.getAndarModel();
    const andar = await AndarModel
      .findById(andarId)
      .select('unidade_id')
      .lean();

    return andar?.unidade_id || null;
  }
}
