import mongoose from 'mongoose';

import { findClusterUnidadesByAnchorLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

function scopeFromAnchor(anchor) {
  return createUnitScope({ unidadeId: anchor || null });
}

export async function findClusterUnidadesByAnchorLeanData(anchorRaw) {
  const { Types } = mongoose;
  const anchor = String(anchorRaw || '').trim();
  if (!anchor) return [];

  const conds = [];

  if (Types.ObjectId.isValid(anchor)) {
    const anchorOid = new Types.ObjectId(anchor);
    conds.push({ _id: anchorOid }, { matriz_id: anchorOid }, { unidade_principal_id: anchorOid });
  }

  conds.push({ _id: anchorRaw }, { matriz_id: anchorRaw }, { unidade_principal_id: anchorRaw });

  return findClusterUnidadesByAnchorLeanRepo({ unitScope: scopeFromAnchor(anchor), conds });
}

export default findClusterUnidadesByAnchorLeanData;