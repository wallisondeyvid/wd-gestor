import {
  AUTH_CONTEXT_SOURCE_V1,
  projectLegacySessionUserFromAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function hasTransportAuthContext(authContext) {
  return Boolean(authContext && typeof authContext === 'object');
}

function hasCanonicalAuthContext(authContext) {
  return hasTransportAuthContext(authContext) && authContext.source === AUTH_CONTEXT_SOURCE_V1;
}

function hasAuthoritativeContextualProjection({ authContext }) {
  return hasCanonicalAuthContext(authContext);
}

function resolveEffectiveRole({ authContext, requestUser, sessionUser }) {
  const authContextIsAuthoritative = hasCanonicalAuthContext(authContext);
  const canUseLegacyFallback = !hasTransportAuthContext(authContext);
  const globalRole = normalizeRole(
    (authContextIsAuthoritative ? authContext?.global_role : null) ||
    (authContextIsAuthoritative ? authContext?.globalRole : null) ||
    (canUseLegacyFallback ? requestUser?.global_role : null) ||
    (canUseLegacyFallback ? sessionUser?.global_role : null)
  );

  if (globalRole === 'master' || globalRole === 'admin') {
    return {
      globalRole,
      effectiveRole: globalRole,
    };
  }

  return {
    globalRole: null,
    effectiveRole: normalizeRole(
      (authContextIsAuthoritative ? authContext?.effectiveRole : null) ||
      (authContextIsAuthoritative ? authContext?.legacy_role : null) ||
      (authContextIsAuthoritative ? authContext?.legacyRole : null) ||
      (authContextIsAuthoritative ? authContext?.activeContext?.legacyRole : null) ||
      (canUseLegacyFallback ? requestUser?.role : null) ||
      (canUseLegacyFallback ? sessionUser?.role : null)
    ),
  };
}

function buildCanonicalLegacyProjection({ authContext, requestUser, sessionUser, effectiveRole, globalRole }) {
  if (!hasCanonicalAuthContext(authContext)) return null;

  const activeContext = authContext.activeContext && typeof authContext.activeContext === 'object'
    ? authContext.activeContext
    : null;
  const resolvedGlobalRole = normalizeRole(globalRole || authContext.global_role || authContext.globalRole);
  const resolvedRole = normalizeRole(
    effectiveRole ||
    authContext.effectiveRole ||
    authContext.legacy_role ||
    authContext.legacyRole ||
    activeContext?.legacyRole ||
    resolvedGlobalRole
  );
  const unidadeId = activeContext?.unidadeId ?? authContext.active_unidade_id ?? authContext.activeUnidadeId ?? null;
  const unidadePrincipalId = activeContext?.unidadePrincipalId ?? authContext.active_unidade_principal_id ?? authContext.activeUnidadePrincipalId ?? null;
  const funcionarioId = activeContext?.funcionarioId ?? authContext.active_funcionario_id ?? authContext.activeFuncionarioId ?? null;

  return projectLegacySessionUserFromAuthContext({
    authContext: {
      authenticated: true,
      identity: {
        id: requestUser?._id || requestUser?.id || sessionUser?.id || sessionUser?._id || null,
        email: requestUser?.email || sessionUser?.email || '',
      },
      globalRole: resolvedGlobalRole,
      activeContext: (unidadeId || unidadePrincipalId || funcionarioId || resolvedRole)
        ? {
            membershipId: activeContext?.membershipId || authContext.active_membership_id || authContext.activeMembershipId || null,
            unidadeId,
            unidadePrincipalId,
            papelContextual: activeContext?.papelContextual || null,
            funcionarioId,
            legacyRole: resolvedRole,
          }
        : null,
      effectiveRole: resolvedGlobalRole || resolvedRole || null,
      source: AUTH_CONTEXT_SOURCE_V1,
    },
    sessionUser,
  });
}

export function resolveRequireRoleLegacyUser({ authContext, requestUser = null, sessionUser = null } = {}) {
  if (!requestUser && !sessionUser) {
    return {
      requestUser: null,
      sessionUser,
    };
  }

  const { effectiveRole, globalRole } = resolveEffectiveRole({ authContext, requestUser, sessionUser });
  const canonicalProjection = buildCanonicalLegacyProjection({
    authContext,
    requestUser,
    sessionUser,
    effectiveRole,
    globalRole,
  });
  const authContextIsAuthoritative = hasCanonicalAuthContext(authContext);
  const canUseLegacyFallback = !hasTransportAuthContext(authContext);
  const contextualProjectionIsAuthoritative = hasAuthoritativeContextualProjection({ authContext, sessionUser });
  const resolvedRole = authContextIsAuthoritative
    ? (effectiveRole || normalizeRole(canonicalProjection?.role) || null)
    : (canUseLegacyFallback ? (effectiveRole || normalizeRole(canonicalProjection?.role) || null) : null);
  const resolvedGlobalRole = authContextIsAuthoritative
    ? (globalRole || normalizeRole(canonicalProjection?.global_role) || null)
    : (canUseLegacyFallback ? (globalRole || normalizeRole(canonicalProjection?.global_role) || null) : null);
  const resolvedUnidadeId = contextualProjectionIsAuthoritative
    ? (canonicalProjection?.unidade_id ?? null)
    : (canUseLegacyFallback ? (canonicalProjection?.unidade_id ?? requestUser?.unidade_id ?? sessionUser?.unidade_id ?? null) : null);
  const resolvedUnidadePrincipalId = contextualProjectionIsAuthoritative
    ? (canonicalProjection?.unidade_principal_id ?? null)
    : (canUseLegacyFallback ? (canonicalProjection?.unidade_principal_id ?? requestUser?.unidade_principal_id ?? sessionUser?.unidade_principal_id ?? null) : null);
  const resolvedFuncionarioId = contextualProjectionIsAuthoritative
    ? (canonicalProjection?.funcionario_id ?? null)
    : (canUseLegacyFallback ? (canonicalProjection?.funcionario_id ?? requestUser?.funcionario_id ?? sessionUser?.funcionario_id ?? null) : null);
  const isMaster = resolvedRole === 'master' || resolvedGlobalRole === 'master';

  return {
    requestUser: {
      ...(requestUser && typeof requestUser === 'object' ? requestUser : {}),
      _id: requestUser?._id || requestUser?.id || sessionUser?.id || sessionUser?._id || null,
      id: requestUser?.id || requestUser?._id || sessionUser?.id || sessionUser?._id || null,
      nome: requestUser?.nome || sessionUser?.nome || 'Usuário',
      email: requestUser?.email || sessionUser?.email || '',
      role: resolvedRole,
      global_role: resolvedGlobalRole || null,
      isMaster,
      unidade_id: resolvedUnidadeId,
      unidade_principal_id: resolvedUnidadePrincipalId,
      funcionario_id: resolvedFuncionarioId,
    },
    sessionUser: sessionUser && (canonicalProjection || authContextIsAuthoritative)
      ? {
          ...sessionUser,
          role: resolvedRole,
          global_role: resolvedGlobalRole || null,
          unidade_id: resolvedUnidadeId,
          unidade_principal_id: resolvedUnidadePrincipalId,
          funcionario_id: resolvedFuncionarioId,
          auth_version: canonicalProjection?.auth_version || sessionUser.auth_version,
        }
      : sessionUser,
  };
}