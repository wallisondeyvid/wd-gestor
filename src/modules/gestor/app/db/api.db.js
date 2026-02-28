import Unidade from '#models/unidade.js';
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