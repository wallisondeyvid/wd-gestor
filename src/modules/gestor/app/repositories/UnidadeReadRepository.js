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

export async function findUnidadesByCondLeanRepo({ unitScope, cond }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.find(cond).select('_id').lean();
}

export async function findUnidadeByCodigoLeanRepo({ unitScope, codigo }) {
  const UnidadeModel = resolveModel({
    name: Unidade.modelName || 'Unidade',
    schema: Unidade.schema,
    unitScope,
  });

  return UnidadeModel.findOne({ codigo }).lean();
}