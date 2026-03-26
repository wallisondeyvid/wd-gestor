import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import { findClusterUnidadesByAnchorLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = String(unidadeId || '').trim();
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

export async function findClusterUnidadesByAnchorService(anchorRaw) {
  const { Types } = mongoose;
  const anchor = String(anchorRaw || '').trim();
  if (!anchor) return [];

  const conds = [];

  if (Types.ObjectId.isValid(anchor)) {
    const anchorOid = new Types.ObjectId(anchor);
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });
  return findClusterUnidadesByAnchorLeanRepo({ unitScope: scopeFromUnidadeId(anchor), conds });
}

export default findClusterUnidadesByAnchorService;