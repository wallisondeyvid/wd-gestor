import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import {
  findUnidadesByIdRepo,
  findUnidadesByMatrizOuPrincipalRepo,
  findUnidadeByIdLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';
import { findUnidadeById } from '#modules/gestor/app/services/apiDbBridgeService.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = String(unidadeId || '').trim();
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

async function findUnidadeByIdLean(unidadeId) {
  return findUnidadeByIdLeanRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

async function findUnidadesByMatrizOuPrincipal(matrizRef) {
  return findUnidadesByMatrizOuPrincipalRepo({
    unitScope: scopeFromUnidadeId(matrizRef),
    matrizRef,
  });
}

async function findUnidadesById(unidadeId) {
  return findUnidadesByIdRepo({
    unitScope: createUnitScope({ unidadeId }),
    unidadeId,
  });
}

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