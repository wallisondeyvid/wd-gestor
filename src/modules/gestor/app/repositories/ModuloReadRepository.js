import Modulo from '#models/modulo.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findModuloByIdLeanRepo({ unitScope, id }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.findById(id).lean();
}

export async function findModulosAtivosStatusLeanRepo({ unitScope }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.find({ status: 'ativo' }).lean();
}

export async function findAllModulosLeanRepo({ unitScope }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.find().lean();
}