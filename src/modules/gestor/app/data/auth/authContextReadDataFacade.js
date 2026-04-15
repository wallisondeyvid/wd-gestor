import { findActiveMembershipsByUserIdLeanRepo } from '#modules/gestor/app/repositories/UserMembershipRepository.js';
import { findUnidadeByIdLeanRepo } from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = String(unidadeId || '').trim();
  return unidadeIdNorm && /^[a-fA-F0-9]{24}$/.test(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function loadActiveMembershipsByUserIdData({ userId, maxTimeMS }) {
  let query = findActiveMembershipsByUserIdLeanRepo({ unitScope: GLOBAL_SCOPE, userId });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function loadUnidadeByIdData({ unidadeId, maxTimeMS }) {
  let query = findUnidadeByIdLeanRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    unidadeId,
  });
  query = withOptionalMaxTime(query, maxTimeMS);

  const unidade = await query;
  if (!unidade) return null;

  return {
    _id: unidade._id,
    nome: String(unidade.nome || '').trim() || null,
    codigo: String(unidade.codigo || '').trim() || null,
    is_principal: unidade.is_principal === true,
    unidade_principal_id: unidade.unidade_principal_id || null,
  };
}