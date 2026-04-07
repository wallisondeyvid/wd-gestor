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

function compatRequireLogin(req, res, next) {
  if (isLegacyAdminMutationPath(req)) return next();
  return requireLogin(req, res, next);
}

function compatRequireRole(roles, options) {
  const middleware = requireRole(roles, options);
  return (req, res, next) => {
    if (isLegacyAdminMutationPath(req)) return next();
    return middleware(req, res, next);
  };
}

function compatRequireApiAuth(req, res, next) {
  if (isLegacyAdminMutationPath(req)) return next();
  return requireApiAuth(req, res, next);
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
  requireRole: compatRequireRole,
  requireApiAuth: compatRequireApiAuth,
  requireLogin: compatRequireLogin,
  shouldResolveCanonicalModulos,
  resolveCanonicalModulos: resolveUserApiModulosCanonicalResult,
  buildSelectionRequiredPayload,
});

router.get('/api/usuarios/check-email', requireLogin, requireRole(['admin']), checkUsuarioEmail);

export default router;
