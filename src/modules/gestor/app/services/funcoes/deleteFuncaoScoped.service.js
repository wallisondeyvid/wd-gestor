import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findFuncaoByIdRepo,
  deleteFuncaoByIdRepo,
} from '#modules/gestor/app/repositories/FuncaoReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = normalizeUnitId(unidadeId);
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

export async function deleteFuncaoScopedService({ funcaoId, canonicalPrincipalUnitId = null }) {
  const lookupPrincipalUnitId = normalizeUnitId(canonicalPrincipalUnitId) || null;
  if (!mongoose.isValidObjectId(funcaoId)) {
    return null;
  }

  const funcao = await findFuncaoByIdRepo({
    unitScope: scopeFromUnidadeId(lookupPrincipalUnitId),
    id: funcaoId,
  });

  if (!funcao) return null;

  const effectivePrincipalUnitId = lookupPrincipalUnitId || normalizeUnitId(funcao.unidade_principal_id) || null;
  await deleteFuncaoByIdRepo({
    unitScope: scopeFromUnidadeId(effectivePrincipalUnitId),
    id: funcaoId,
  });

  return funcao;
}

export default deleteFuncaoScopedService;