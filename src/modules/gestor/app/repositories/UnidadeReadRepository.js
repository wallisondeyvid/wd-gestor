import Unidade from '#models/unidade.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findUnidadeByIdLeanRepo({ unitScope, unidadeId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findById(unidadeId).lean();
}

export async function findSubunidadesLeanRepo({ unitScope, unidadePrincipalId }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find({ unidade_principal_id: unidadePrincipalId }).lean();
}