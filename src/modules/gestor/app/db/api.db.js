import Unidade from '#models/unidade.js';
import User from '#models/user.js';
import Modulo from '#models/modulo.js';
import Recurso from '#models/recurso.js';
import Setor from '#models/setor.js';
import mongoose from 'mongoose';

export async function findUnidadeByIdLean(id) {
  return Unidade.findById(id).lean();
}

export async function findUnidadeByCodigoLean(codigo) {
  return Unidade.findOne({ codigo }).lean();
}

export async function findUnidadeUserBaseLean(id) {
  return Unidade.findById(id)
    .select('_id is_principal unidade_principal_id matriz_id')
    .lean();
}

export async function findSubunidadesLean(unidadePrincipalId) {
  return Unidade.find({ unidade_principal_id: unidadePrincipalId }).lean();
}

export async function findUnidadesByCondLean(cond) {
  return Unidade.find(cond).select('_id').lean();
}

export async function existsUnidadeByCond(cond) {
  const registros = await findUnidadesByCondLean(cond);
  return Array.isArray(registros) && registros.length > 0;
}

export async function findUnidadeByIdOrRawLean(unidadeId) {
  const { Types } = mongoose;
  const oid = Types.ObjectId.isValid(unidadeId) ? new Types.ObjectId(unidadeId) : null;
  return Unidade.findOne(oid ? { _id: oid } : { _id: unidadeId }).lean();
}

export async function findClusterUnidadesByAnchorLean(anchorRaw) {
  const { Types } = mongoose;
  const conds = [];

  if (Types.ObjectId.isValid(String(anchorRaw))) {
    const anchorOid = new Types.ObjectId(String(anchorRaw));
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });
  return Unidade.find({ $or: conds }).lean();
}

export async function findUserByEmailCondLean(cond) {
  return User.findOne(cond).lean();
}

export async function findUserByCpfCondLean(cond) {
  return User.findOne(cond).lean();
}

export async function findAllUnidadesLean() {
  return Unidade.find({}).lean();
}

export async function findUnidadePrincipalLean() {
  return Unidade.findOne({ is_principal: true }).lean();
}

export async function findUserByEmailCond(cond) {
  return User.findOne(cond);
}

export async function deleteUserById(userId) {
  return User.deleteOne({ _id: userId });
}

export async function findAllModulosBaseLean() {
  return Modulo.find({}).select('_id nome descricao status url_base').lean();
}

export async function findUnidadeByIdWithModulosAcessiveisLean(unidadeId) {
  return Unidade.findById(unidadeId).populate('modulosAcessiveis').lean();
}

export async function findModuloByIdLean(id) {
  return Modulo.findById(id).lean();
}

export async function findModuloByNome(nome) {
  return Modulo.findOne({ nome });
}

export async function createModulo(data) {
  return Modulo.create(data);
}

export async function findModuloById(id) {
  return Modulo.findById(id);
}

export async function saveModulo(modulo) {
  return modulo.save();
}

export async function deleteModuloById(id) {
  return Modulo.deleteOne({ _id: id });
}

export async function findRecursosByFiltroComUnidadeLean(filtro) {
  return Recurso.find(filtro)
    .populate({ path: 'unidade_id', select: 'codigo nome' })
    .sort({ placa: 1 })
    .limit(100)
    .lean();
}

export async function findRecursoByIdComUnidadeNome(id) {
  return Recurso.findById(id).populate('unidade_id', 'nome');
}

export async function findRecursoByPlacaUpper(placaUpper) {
  return Recurso.findOne({ placa: placaUpper });
}

export async function findRecursoByChassiUpper(chassiUpper) {
  return Recurso.findOne({ chassi: chassiUpper });
}

export async function findRecursoByRenavam(renavam) {
  return Recurso.findOne({ renavam });
}

export async function createRecurso(data) {
  return Recurso.create(data);
}

export async function findRecursoById(id) {
  return Recurso.findById(id);
}

export async function findOutroRecursoByPlacaUpper(id, placaUpper) {
  return Recurso.findOne({ placa: placaUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByChassiUpper(id, chassiUpper) {
  return Recurso.findOne({ chassi: chassiUpper, _id: { $ne: id } });
}

export async function findOutroRecursoByRenavam(id, renavam) {
  return Recurso.findOne({ renavam, _id: { $ne: id } });
}

export async function updateRecursoByIdComUnidadeNome(id, data) {
  return Recurso.findByIdAndUpdate(id, data, { new: true }).populate('unidade_id', 'nome');
}

export async function deleteRecursoById(id) {
  return Recurso.findByIdAndDelete(id);
}

export async function findUnidadeById(setorUnidadeId) {
  return Unidade.findById(setorUnidadeId);
}

export async function findSetorByUnidadeAndNomeNormalizadoLean(unidadeId, nomeNormalizado) {
  return Setor.findOne({ unidade_id: unidadeId, nome_normalizado: nomeNormalizado }).lean();
}

export async function createSetor(data) {
  return Setor.create(data);
}

export async function findSetoresByUnidadeIdPopulateLean(unidadeId) {
  return Setor.find({ unidade_id: unidadeId }).populate('unidade_id').lean();
}

export async function findSetorByIdPopulateUnidade(id) {
  return Setor.findById(id).populate('unidade_id');
}

export async function findSetorById(id) {
  return Setor.findById(id);
}

export async function findSetorDupByNomeNormalizadoExcludingId(setorId, unidadeId, nomeNormalizado) {
  return Setor.findOne({ _id: { $ne: setorId }, unidade_id: unidadeId, nome_normalizado: nomeNormalizado });
}

export async function saveSetor(setor) {
  return setor.save();
}

export async function findUnidadeUserBaseSetorLean(id) {
  return Unidade.findById(id)
    .select('_id is_principal unidade_principal_id')
    .lean();
}

export async function findSetoresByFiltroPopulateUnidadeLean(filtro) {
  return Setor.find(filtro)
    .select('nome descricao unidade_id')
    .populate({ path: 'unidade_id', select: 'nome codigo' })
    .lean();
}

export async function findUnidadesByIdsNomeCodigoLean(unidadeIds) {
  return Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
}

export async function findSetorByIdAndDelete(id) {
  return Setor.findByIdAndDelete(id);
}

export async function findCounterSetorCodigoLean() {
  const Counter = mongoose.models._Counter;
  return Counter.findOne({ _id: 'setor_codigo' }).lean();
}

export async function findMaxSetorCodigoLean() {
  return Setor.find({ codigo: { $exists: true } })
    .sort({ codigo: -1 })
    .limit(1)
    .select('codigo')
    .lean();
}

export async function findOneAndUpdateCounterSetorCodigo(targetSeq) {
  const Counter = mongoose.models._Counter;
  return Counter.findOneAndUpdate(
    { _id: 'setor_codigo', seq: { $lt: targetSeq } },
    { $set: { seq: targetSeq } },
    { new: true, upsert: true }
  );
}