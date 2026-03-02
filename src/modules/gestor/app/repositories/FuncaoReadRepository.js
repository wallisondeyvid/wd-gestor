import Funcao from '#models/funcao.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findFuncaoByIdLeanRepo({ unitScope, id }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findById(id).lean();
}