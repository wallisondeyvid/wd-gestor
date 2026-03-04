import Unidade from '#models/unidade.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function deleteUnidadeByIdRepo({ unitScope, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findByIdAndDelete(unidadeId);
}

export async function updateUnidadeByIdWithValidatorsRepo({ unitScope, unidadeId, updated }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findByIdAndUpdate(unidadeId, updated, { new: true, runValidators: true });
}