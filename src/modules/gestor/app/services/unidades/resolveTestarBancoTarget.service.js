import {
  findUnidadeById,
  findUnidadeByIdLean,
  findUnidadesByMatrizOuPrincipal,
  findUnidadesById,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

async function ensureCanAccessUnidade({ req, unidadeId }) {
  const targetUnitId = normalizeUnitId(unidadeId);
  if (!targetUnitId) return false;

  const scopedUnitId = normalizeUnitId(req?.unitScope?.unidadeId);
  if (scopedUnitId) {
    const scopedUnit = await findUnidadeByIdLean(scopedUnitId);
    if (!scopedUnit) return false;

    const principalUnitId = normalizeUnitId(
      scopedUnit?.is_principal
        ? scopedUnit?._id
        : scopedUnit?.unidade_principal_id || scopedUnit?.matriz_id || scopedUnit?._id,
    );

    let unidadesPermitidas = principalUnitId
      ? await findUnidadesByMatrizOuPrincipal(principalUnitId)
      : [];

    if ((!unidadesPermitidas || unidadesPermitidas.length === 0) && scopedUnitId) {
      unidadesPermitidas = await findUnidadesById(scopedUnitId);
    }

    const permitidoIds = new Set(
      (unidadesPermitidas || []).map((unidade) => normalizeUnitId(unidade?._id)).filter(Boolean),
    );

    if (permitidoIds.size > 0) {
      return permitidoIds.has(targetUnitId);
    }

    return targetUnitId === scopedUnitId;
  }

  if (isPrivilegedGestorUser(req?.user)) return true;
  return false;
}

export async function resolveTestarBancoTargetService({ req, unidadeId }) {
  const unidade = await findUnidadeById(unidadeId);
  if (!unidade) {
    return { kind: 'not_found', unidade: null };
  }

  const canAccess = await ensureCanAccessUnidade({ req, unidadeId: unidade._id });
  if (!canAccess) {
    return { kind: 'forbidden', unidade: null };
  }

  return { kind: 'authorized', unidade };
}

export default {
  resolveTestarBancoTargetService,
};