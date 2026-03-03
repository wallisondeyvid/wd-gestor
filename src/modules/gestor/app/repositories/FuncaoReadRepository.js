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

export async function findFuncoesByUnidadeLeanRepo({ unitScope, unidadeId }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find({ unidade_principal_id: unidadeId }).lean();
}

export async function findFuncaoByNomeRepo({ unitScope, nome }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findOne({ nome });
}

export async function createFuncaoRepo({ unitScope, payload }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.create(payload);
}

export async function findFuncaoByIdPopulatedRepo({ unitScope, id }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findById(id).populate('unidade_principal_id modulos_habilitados');
}

export async function findAllFuncoesPopuladasRepo({ unitScope }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find().populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncoesByUnidadePrincipalPopuladasRepo({ unitScope, unidadePrincipalId }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find({ unidade_principal_id: unidadePrincipalId }).populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncoesByUnidadePrincipalIdsPopuladasRepo({ unitScope, unidadePrincipalIds }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find({ unidade_principal_id: { $in: unidadePrincipalIds } }).populate('unidade_principal_id modulos_habilitados');
}

export async function findFuncaoByIdRepo({ unitScope, id }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findById(id);
}

export async function findOutraFuncaoByNomeExcludingIdRepo({ unitScope, id, nome }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findOne({ nome, _id: { $ne: id } });
}

export async function updateFuncaoByIdRepo({ unitScope, id, updates }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findByIdAndUpdate(id, updates, { runValidators: true });
}

export async function findFuncoesByFiltroLeanRepo({ unitScope, filtro }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find(filtro).lean();
}

export async function findFuncoesByFiltroSelectLeanRepo({ unitScope, filtro }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find(filtro).select('codigo nome descricao').lean();
}

export async function deleteFuncaoByIdRepo({ unitScope, id }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.findByIdAndDelete(id);
}

export async function findFuncoesAtivasNomeOrdenadasSelectLeanRepo({ unitScope }) {
  const FuncaoModel = resolveModel({
    name: Funcao.modelName || 'Funcao',
    schema: Funcao.schema,
    unitScope,
  });

  return FuncaoModel.find({ ativa: true }).select('nome').sort({ nome: 1 }).lean();
}