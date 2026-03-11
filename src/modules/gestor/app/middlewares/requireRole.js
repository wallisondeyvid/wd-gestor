import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import { GESTOR_AUTH_CONTEXT_RESOLVER_FLAG } from '#modules/gestor/app/services/authContextResolver.js';

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

function syncLegacyUserShape(req, { effectiveRole, globalRole }) {
  const requestUser = req.user || null;
  const sessionUser = req.session?.user || null;
  if (!requestUser && !sessionUser) return null;

  const resolvedRole = effectiveRole || normalizeRole(requestUser?.role || sessionUser?.role) || '';
  const isMaster = resolvedRole === 'master' || globalRole === 'master';

  req.user = {
    ...(requestUser && typeof requestUser === 'object' ? requestUser : {}),
    _id: requestUser?._id || requestUser?.id || sessionUser?.id || sessionUser?._id || null,
    id: requestUser?.id || requestUser?._id || sessionUser?.id || sessionUser?._id || null,
    nome: requestUser?.nome || sessionUser?.nome || 'Usuário',
    email: requestUser?.email || sessionUser?.email || '',
    role: resolvedRole,
    global_role: globalRole || requestUser?.global_role || sessionUser?.global_role || null,
    isMaster,
    unidade_id: requestUser?.unidade_id ?? sessionUser?.unidade_id ?? null,
    unidade_principal_id: requestUser?.unidade_principal_id ?? sessionUser?.unidade_principal_id ?? null,
    funcionario_id: requestUser?.funcionario_id ?? sessionUser?.funcionario_id ?? null,
  };

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
      ? syncLegacyUserShape(req, resolveEffectiveRole({
          authContext,
          requestUser: req.user || null,
          sessionUser: req.session?.user || null,
        }))
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
