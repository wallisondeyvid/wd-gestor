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

export async function findAllModulosBaseLeanRepo({ unitScope }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.find({}).select('_id nome descricao status url_base').lean();
}

export async function findAllModulosRepo({ unitScope }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.find();
}

export async function findModuloByNomeRepo({ unitScope, nome }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.findOne({ nome });
}

export async function createModuloRepo({ unitScope, data }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.create(data);
}

export async function findModuloByIdRepo({ unitScope, id }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.findById(id);
}

export async function deleteModuloByIdRepo({ unitScope, id }) {
  const ModuloModel = resolveModel({
    name: Modulo.modelName || 'Modulo',
    schema: Modulo.schema,
    unitScope,
  });

  return ModuloModel.deleteOne({ _id: id });
}