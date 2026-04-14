import mongoose from 'mongoose';
import {
  deleteFuncaoById,
  findFuncaoById,
} from '#modules/gestor/app/data/funcoes/funcoesDeleteDataFacade.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

export async function deleteFuncaoScopedService({ funcaoId, canonicalPrincipalUnitId = null }) {
  const lookupPrincipalUnitId = normalizeUnitId(canonicalPrincipalUnitId) || null;
  if (!mongoose.isValidObjectId(funcaoId)) {
    return null;
  }

  const funcao = await findFuncaoById(funcaoId, lookupPrincipalUnitId);

  if (!funcao) return null;

  const effectivePrincipalUnitId = lookupPrincipalUnitId || normalizeUnitId(funcao.unidade_principal_id) || null;
  await deleteFuncaoById(funcaoId, effectivePrincipalUnitId);

  return funcao;
}

export default deleteFuncaoScopedService;