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