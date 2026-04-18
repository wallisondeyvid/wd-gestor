// (wrapper) userApi
import createUserApiRouter from '#shared/routes/userApi.js';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import { criarUsuario, checkUsuarioEmail, obterUsuarioAtual, atualizarSenhaUsuario, atualizarUsuario, toggleUsuario, excluirUsuario } from '#modules/gestor/app/controllers/userController.js';
import { updateUsuario as updateUsuarioJson } from '#modules/gestor/app/controllers/userAdminApiController.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';
import requireApiAuth from '#modules/gestor/app/middlewares/requireApiAuth.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import {
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
} from '#modules/gestor/app/services/authContextResolver.js';
import { resolveUserApiModulosCanonicalResult } from '#modules/gestor/app/services/auth/resolveUserApiModulosCanonicalResult.service.js';

function isLegacyAdminMutationPath(req) {
  const raw = String(req.originalUrl || req.url || '');
  return /\/api\/usuarios\/[^/]+\/(?:update|toggle|delete)(?:\?|$)/.test(raw);
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function compatRequireLogin(req, res, next) {
  if (isLegacyAdminMutationPath(req)) return next();
  return requireLogin(req, res, next);
}

function requireLegacyAdminMutationAccess(req, res, next) {
  const requestUser = req.user || null;
  if (!requestUser) {
    return res.status(401).send('Não autenticado');
  }

  const authContext = req.session?.gestorAuthContext;
  const hasAuthoritativeAuthContext = authContext?.source === 'auth-context-v1';
  const globalRole = normalizeRole(
    authContext?.global_role ||
    authContext?.globalRole ||
    requestUser?.global_role
  );
  const effectiveRole = normalizeRole(requestUser?.role);
  const isGlobalAdminOrMaster = requestUser?.isMaster === true || globalRole === 'master' || globalRole === 'admin';
  const isLegacyAdminOrMaster = effectiveRole === 'master' || effectiveRole === 'admin';

  if (hasAuthoritativeAuthContext) {
    if (!isGlobalAdminOrMaster) {
      return res.status(403).send('Acesso negado');
    }

    return next();
  }

  if (!isGlobalAdminOrMaster && !isLegacyAdminOrMaster) {
    return res.status(403).send('Acesso negado');
  }

  return next();
}

function shouldResolveCanonicalModulos(req) {
  const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
  if (featureFlags && typeof featureFlags === 'object') {
    return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  }
  return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

function buildSelectionRequiredPayload() {
  return {
    success: false,
    authenticated: true,
    error: 'Seleção de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  };
}

const router = createUserApiRouter({
  criarUsuario,
  obterUsuarioAtual,
  atualizarSenhaUsuario,
  atualizarUsuario,
  toggleUsuario,
  deleteUsuario: excluirUsuario,
  updateUsuarioJson,
  requireRole,
  requireApiAuth,
  requireLogin: compatRequireLogin,
  requireLegacyAdminMutationAccess,
  shouldResolveCanonicalModulos,
  resolveCanonicalModulos: resolveUserApiModulosCanonicalResult,
  buildSelectionRequiredPayload,
});

router.get('/api/usuarios/check-email', requireLogin, requireRole(['admin']), checkUsuarioEmail);

export default router;
