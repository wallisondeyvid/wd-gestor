import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import {
  AUTH_CONTEXT_SOURCE_V1,
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
  projectLegacySessionUserFromAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function isAuthContextResolverEnabledForRequest(req) {
  const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
  if (featureFlags && typeof featureFlags === 'object') {
    return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  }
  return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

function getRequestTransport(req) {
  const headers = req?.headers || {};
  const path = req.path || req.originalUrl || '';
  const originalUrl = req.originalUrl || '';
  const basePath = req.baseUrl || '';
  const accept = String(headers.accept || '').toLowerCase();
  const requestedWith = String(headers['x-requested-with'] || '').toLowerCase();
  const isApiRequest = (
    path.startsWith('/api/') ||
    originalUrl.startsWith('/gestor/api/') ||
    (/\/api\//.test(originalUrl) && (accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest'))
  );

  return {
    basePath,
    isApiRequest,
  };
}

function getStoredAuthContext(req) {
  const authContext = req.session?.gestorAuthContext;
  return authContext && typeof authContext === 'object' ? authContext : null;
}

function hasPendingUnitSelection(authContext) {
  if (!authContext || typeof authContext !== 'object') return false;

  const needsSelection = authContext.needs_selection === true || authContext.needsUnitSelection === true;
  const hasActiveContext = Boolean(
    authContext.active_membership_id ||
    authContext.activeMembershipId ||
    authContext.active_unidade_id ||
    authContext.activeUnidadeId ||
    authContext.activeContext ||
    authContext.effectiveRole ||
    authContext.legacy_role ||
    authContext.legacyRole
  );
  const hasGlobalRole = Boolean(authContext.global_role || authContext.globalRole);

  return needsSelection && !hasActiveContext && !hasGlobalRole;
}

function resolveEffectiveRole({ authContext, requestUser, sessionUser }) {
  const globalRole = normalizeRole(
    authContext?.global_role ||
    authContext?.globalRole ||
    requestUser?.global_role ||
    sessionUser?.global_role
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
      authContext?.effectiveRole ||
      authContext?.legacy_role ||
      authContext?.legacyRole ||
      authContext?.activeContext?.legacyRole ||
      requestUser?.role ||
      sessionUser?.role
    ),
  };
}

function buildCanonicalLegacyProjection({ authContext, requestUser, sessionUser, effectiveRole, globalRole }) {
  if (!authContext || typeof authContext !== 'object') return null;

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
  const hasCanonicalContext = Boolean(resolvedGlobalRole || resolvedRole || unidadeId || unidadePrincipalId || funcionarioId);

  if (!hasCanonicalContext) return null;

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

function syncLegacyUserShape(req, { authContext, effectiveRole, globalRole }) {
  const requestUser = req.user || null;
  const sessionUser = req.session?.user || null;
  if (!requestUser && !sessionUser) return null;

  const canonicalProjection = buildCanonicalLegacyProjection({
    authContext,
    requestUser,
    sessionUser,
    effectiveRole,
    globalRole,
  });
  const resolvedRole = effectiveRole || normalizeRole(canonicalProjection?.role || requestUser?.role || sessionUser?.role) || '';
  const resolvedGlobalRole = globalRole || normalizeRole(canonicalProjection?.global_role || requestUser?.global_role || sessionUser?.global_role);
  const resolvedUnidadeId = canonicalProjection?.unidade_id ?? requestUser?.unidade_id ?? sessionUser?.unidade_id ?? null;
  const resolvedUnidadePrincipalId = canonicalProjection?.unidade_principal_id ?? requestUser?.unidade_principal_id ?? sessionUser?.unidade_principal_id ?? null;
  const resolvedFuncionarioId = canonicalProjection?.funcionario_id ?? requestUser?.funcionario_id ?? sessionUser?.funcionario_id ?? null;
  const isMaster = resolvedRole === 'master' || resolvedGlobalRole === 'master';

  req.user = {
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
  };

  if (sessionUser && canonicalProjection && req.session) {
    req.session.user = {
      ...sessionUser,
      role: resolvedRole,
      global_role: resolvedGlobalRole || null,
      unidade_id: resolvedUnidadeId,
      unidade_principal_id: resolvedUnidadePrincipalId,
      funcionario_id: resolvedFuncionarioId,
      auth_version: canonicalProjection.auth_version || sessionUser.auth_version,
    };
  }

  return req.user;
}

function respondUnauthorized(req, res, transport) {
  if (transport.isApiRequest) {
    return res.status(401).json({ success: false, error: 'Não autenticado', code: 'UNAUTHORIZED' });
  }
  return res.redirect(`${transport.basePath}/login`);
}

function respondPendingSelection(res, transport) {
  const redirect = `${transport.basePath}/login?step=select`;
  if (transport.isApiRequest) {
    return res.status(409).json({
      success: false,
      authenticated: true,
      error: 'Seleção de unidade pendente',
      code: 'GESTOR_SELECTION_REQUIRED',
      needsUnitSelection: true,
      redirect,
    });
  }
  return res.redirect(redirect);
}

function respondForbidden(res, transport) {
  if (transport.isApiRequest) {
    return res.status(403).json({ success: false, error: 'Acesso negado', code: 'FORBIDDEN' });
  }
  return res.status(403).send('Acesso negado');
}

export function requireRole(roles = [], opts = {}) {
  const { allowMasterImplicit = true } = opts;
  const normalized = roles.map((role) => normalizeRole(role)).filter(Boolean);

  return function(req, res, next) {
    const transport = getRequestTransport(req);
    const authContextEnabled = isAuthContextResolverEnabledForRequest(req);
    const authContext = authContextEnabled ? getStoredAuthContext(req) : null;

    if (authContextEnabled && hasPendingUnitSelection(authContext)) {
      return respondPendingSelection(res, transport);
    }

    const requestUser = authContextEnabled
      ? syncLegacyUserShape(req, {
          authContext,
          ...resolveEffectiveRole({
            authContext,
            requestUser: req.user || null,
            sessionUser: req.session?.user || null,
          }),
        })
      : req.user;

    if (!requestUser) {
      return respondUnauthorized(req, res, transport);
    }

    const role = normalizeRole(requestUser.role);
    if (allowMasterImplicit && (requestUser.isMaster || role === 'master')) return next();
    if (role && normalized.includes(role)) return next();
    return respondForbidden(res, transport);
  };
}
export default requireRole;
