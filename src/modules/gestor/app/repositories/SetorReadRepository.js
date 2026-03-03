import mongoose from 'mongoose';
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

export async function createSetorRepo({ unitScope, data }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.create(data);
}

export async function findSetorByIdPopulateUnidadeRepo({ unitScope, id }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.findById(id).populate('unidade_id');
}

export async function findSetorByIdRepo({ unitScope, id }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.findById(id);
}

export async function findSetorDupByNomeNormalizadoExcludingIdRepo({ unitScope, setorId, unidadeId, nomeNormalizado }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.findOne({ _id: { $ne: setorId }, unidade_id: unidadeId, nome_normalizado: nomeNormalizado });
}

export async function findSetoresByFiltroPopulateUnidadeLeanRepo({ unitScope, filtro }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find(filtro)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .lean();
}

export async function findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo({ unitScope, filtroAtivo }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find(filtroAtivo)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .sort({ nome: 1 })
    .lean();
}

export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo({ unitScope, filtroSetores }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find(filtroSetores)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .sort({ nome: 1 })
    .lean();
}

export async function findSetorByIdAndDeleteRepo({ unitScope, id }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.findByIdAndDelete(id);
}

export async function findMaxSetorCodigoLeanRepo({ unitScope }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find({ codigo: { $exists: true } })
    .sort({ codigo: -1 })
    .limit(1)
    .select('codigo')
    .lean();
}

export async function findSetoresAtivosNomeOrdenadosSelectLeanRepo({ unitScope }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find({ ativo: true }).select('nome').sort({ nome: 1 }).lean();
}

export async function findSetoresByCondNomeOrdenadosSelectLeanRepo({ unitScope, cond }) {
  const SetorModel = resolveModel({
    name: Setor.modelName || 'Setor',
    schema: Setor.schema,
    unitScope,
  });

  return SetorModel.find(cond).select('nome').sort({ nome: 1 }).lean();
}

export async function findCounterSetorCodigoLeanRepo({ unitScope }) {
  const Counter = mongoose.models._Counter;
  const CounterModel = resolveModel({
    name: Counter.modelName || 'Counter',
    schema: Counter.schema,
    unitScope,
  });

  return CounterModel.findOne({ _id: 'setor_codigo' }).lean();
}

export async function findOneAndUpdateCounterSetorCodigoRepo({ unitScope, targetSeq }) {
  const Counter = mongoose.models._Counter;
  const CounterModel = resolveModel({
    name: Counter.modelName || 'Counter',
    schema: Counter.schema,
    unitScope,
  });

  return CounterModel.findOneAndUpdate(
    { _id: 'setor_codigo', seq: { $lt: targetSeq } },
    { $set: { seq: targetSeq } },
    { new: true, upsert: true }
  );
}