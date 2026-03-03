import Setor from '#models/setor.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findSetorByUnidadeAndNomeNormalizadoLeanRepo({
  unitScope,
  unidadeId,
  nomeNormalizado,
}) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.findOne({ unidade_id: unidadeId, nome_normalizado: nomeNormalizado }).lean();
}

export async function findSetoresByUnidadeIdPopulateLeanRepo({ unitScope, unidadeId }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find({ unidade_id: unidadeId }).populate('unidade_id').lean();
}