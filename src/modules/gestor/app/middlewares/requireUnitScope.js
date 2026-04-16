import mongoose from 'mongoose';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import {
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
  hasPendingAuthUnitSelection,
  resolveAuthContextUnidadeId,
} from '#modules/gestor/app/services/authContextResolver.js';
import { createUnitScope } from '#shared/unitScope.js';

function normalizeObjectIdString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeObjectIdString(value);
    if (normalized) return normalized;
  }
  return '';
}

function resolveUser(req) {
  return req?.user || null;
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function resolveRequestUnidadeId(req) {
  return firstNonEmpty(
    req?.query?.unidadeId,
    req?.query?.unidade_id,
    req?.params?.unidadeId,
    req?.params?.unidade_id,
    req?.body?.unidadeId,
    req?.body?.unidade_id,
  );
}

function resolveLegacyUserUnidadeId(req) {
  return '';
}

function resolveLegacyUnidadeId(req) {
  const user = resolveUser(req);
  const requestUnidadeId = resolveRequestUnidadeId(req);
  const legacyUserUnidadeId = resolveLegacyUserUnidadeId(req);

  if (!user) return '';

  if (isPrivilegedGestorUser(user)) {
    return firstNonEmpty(requestUnidadeId, legacyUserUnidadeId);
  }

  return legacyUserUnidadeId;
}

function isAuthContextResolverEnabledForRequest(req) {
  const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
  if (featureFlags && typeof featureFlags === 'object') {
    return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  }
  return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

function getStoredAuthContext(req) {
  const authContext = req.session?.gestorAuthContext;
  return authContext && typeof authContext === 'object' ? authContext : null;
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

function respondMissingUnitScope(res) {
  return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
}

export function requireUnitScope(req, res, next) {
  const authContextEnabled = isAuthContextResolverEnabledForRequest(req);
  const authContext = authContextEnabled ? getStoredAuthContext(req) : null;

  if (authContextEnabled && resolveUser(req) && hasPendingAuthUnitSelection(authContext)) {
    return respondPendingSelection(res, getRequestTransport(req));
  }

  const unidadeId = firstNonEmpty(
    authContextEnabled ? resolveAuthContextUnidadeId(authContext) : '',
    resolveLegacyUnidadeId(req)
  );

  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
    return respondMissingUnitScope(res);
  }

  req.unitScope = createUnitScope({ unidadeId });
  return next();
}

export default requireUnitScope;
