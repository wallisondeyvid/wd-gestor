import {
  findAllModulosBaseLean,
  findUnidadeByIdWithModulosAcessiveisLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeModuloList(modulos = []) {
  return modulos.map((modulo) => ({
    _id: modulo._id,
    nome: modulo.nome,
    descricao: modulo.descricao,
    status: modulo.status,
    url_base: modulo.url_base,
  }));
}

export async function listModulosOwnerService({ userRole, activeUnitId, authContext, requestUser } = {}) {
  const debugEnabled = typeof process !== 'undefined' && process?.env?.WD_DEBUG_MODULOS === '1';
  const normalizeRole = (value) => String(value || '').trim().toLowerCase();
  const normalizedUserRole = normalizeRole(userRole);
  const isMaster = requestUser?.isMaster === true
    || [
      normalizedUserRole,
      requestUser?.role,
      requestUser?.globalRole,
      requestUser?.global_role,
      requestUser?.effectiveRole,
      authContext?.effectiveRole,
      authContext?.effective_role,
      authContext?.globalRole,
      authContext?.global_role,
    ].some((value) => normalizeRole(value) === 'master');
  const isAdmin = [
    normalizedUserRole,
    requestUser?.role,
    requestUser?.globalRole,
    requestUser?.global_role,
    requestUser?.effectiveRole,
    authContext?.effectiveRole,
    authContext?.effective_role,
    authContext?.globalRole,
    authContext?.global_role,
  ].some((value) => normalizeRole(value) === 'admin');

  if (isMaster || isAdmin) {
    const modulos = await findAllModulosBaseLean();
    if (debugEnabled && typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[gestor][modulos][listOwner]', {
        branch: 'global',
        userRole: normalizedUserRole || null,
        isMaster,
        isAdmin,
        modulosCount: Array.isArray(modulos) ? modulos.length : 0,
      });
    }
    return { kind: 'ok', modulos };
  }

  const canonicalUnitId = String(
    authContext?.activeContext?.unidadeId || authContext?.active_unidade_id || ''
  ).trim();
  const normalizedActiveUnitId = authContext?.source === 'auth-context-v1'
    ? canonicalUnitId
    : String(activeUnitId || requestUser?.unidade_id || '').trim();
  if (!normalizedActiveUnitId) {
    return { kind: 'ok', modulos: [] };
  }

  const unidade = await findUnidadeByIdWithModulosAcessiveisLean(normalizedActiveUnitId);
  const modulos = Array.isArray(unidade?.modulosAcessiveis)
    ? normalizeModuloList(unidade.modulosAcessiveis)
    : [];

  if (debugEnabled && typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[gestor][modulos][listOwner]', {
      branch: 'contextual',
      userRole: normalizedUserRole || null,
      isMaster,
      isAdmin,
      modulosCount: modulos.length,
    });
  }

  return {
    kind: 'ok',
    modulos,
  };
}

export default {
  listModulosOwnerService,
};