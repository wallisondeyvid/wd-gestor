import CondBloco from '#models/cond_bloco.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export class BlocosRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getBlocoModel() {
    return resolveModel({
      name: CondBloco.modelName || 'CondBloco',
      schema: CondBloco.schema,
      unitScope: this.getUnitScope(),
    });
  }

  findMany({ filter, selectFields, sort } = {}) {
    const BlocoModel = this.getBlocoModel();
    const query = BlocoModel.find(filter || {});
    if (selectFields) query.select(selectFields);
    if (sort) query.sort(sort);
    return query.lean();
  }

  findOne({ filter, selectFields } = {}) {
    const BlocoModel = this.getBlocoModel();
    const query = BlocoModel.findOne(filter || {});
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  findById({ id, selectFields } = {}) {
    const BlocoModel = this.getBlocoModel();
    const query = BlocoModel.findById(id);
    if (selectFields) query.select(selectFields);
    return query.lean();
  }

  create({ unidade_id, nome, ordem }) {
    const BlocoModel = this.getBlocoModel();
    return BlocoModel.create({ unidade_id, nome, ordem });
  }

  updateById({ id, set }) {
    const BlocoModel = this.getBlocoModel();
    return BlocoModel.findByIdAndUpdate(id, { $set: set || {} }, { new: true }).lean();
  }

  deleteById({ id }) {
    const BlocoModel = this.getBlocoModel();
    return BlocoModel.findByIdAndDelete(id);
  }

  async getUnidadeIdByBlocoId(blocoId) {
    if (!blocoId) return null;

    const BlocoModel = this.getBlocoModel();
    const bloco = await BlocoModel
      .findById(blocoId)
      .select('unidade_id')
      .lean();

    return bloco?.unidade_id || null;
  }
}
