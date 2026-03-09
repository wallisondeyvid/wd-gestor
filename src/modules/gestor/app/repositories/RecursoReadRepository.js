import Recurso from '#models/recurso.js';
import { resolveModel } from '#shared/db/resolveModel.js';

export async function findRecursosByFiltroComUnidadeLeanRepo({ unitScope, filtro }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.find(filtro)
    .populate({ path: 'unidade_id', select: 'codigo nome' })
    .sort({ placa: 1 })
    .limit(100)
    .lean();
}

export async function findRecursoByIdComUnidadeNomeRepo({ unitScope, id, unidadeId = null }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  const filtro = { _id: id };
  if (unidadeId) filtro.unidade_id = unidadeId;

  return RecursoModel.findOne(filtro).populate('unidade_id', 'nome');
}

export async function findRecursoByPlacaUpperRepo({ unitScope, placaUpper }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ placa: placaUpper });
}

export async function findRecursoByChassiUpperRepo({ unitScope, chassiUpper }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ chassi: chassiUpper });
}

export async function findRecursoByRenavamRepo({ unitScope, renavam }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ renavam });
}

export async function createRecursoRepo({ unitScope, data }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.create(data);
}

export async function findRecursoByIdRepo({ unitScope, id }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findById(id);
}

export async function findOutroRecursoByPlacaUpperRepo({ unitScope, id, placaUpper }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ placa: placaUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByChassiUpperRepo({ unitScope, id, chassiUpper }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ chassi: chassiUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByRenavamRepo({ unitScope, id, renavam }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  return RecursoModel.findOne({ renavam, _id: { $ne: id } });
}

export async function updateRecursoByIdComUnidadeNomeRepo({ unitScope, id, data, unidadeId = null }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  const filtro = { _id: id };
  if (unidadeId) filtro.unidade_id = unidadeId;

  return RecursoModel.findOneAndUpdate(filtro, data, { new: true }).populate('unidade_id', 'nome');
}

export async function deleteRecursoByIdRepo({ unitScope, id, unidadeId = null }) {
  const RecursoModel = resolveModel({
    name: Recurso.modelName || 'Recurso',
    schema: Recurso.schema,
    unitScope,
  });

  const filtro = { _id: id };
  if (unidadeId) filtro.unidade_id = unidadeId;

  return RecursoModel.findOneAndDelete(filtro);
}