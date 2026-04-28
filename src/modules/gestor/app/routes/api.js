// (migrado) Rotas de API utilitárias
import express from 'express';
import { unidadesCluster, debugSession, ibge, favicon } from '#modules/gestor/app/controllers/apiController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
const router = express.Router();

function isPrivilegedGestorUser(user) {
	return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function hasCanonicalUnitContext(req) {
	const authContextUnitId = String(req?.session?.gestorAuthContext?.active_unidade_id || '').trim();
	const requestUserUnitId = String(req?.user?.unidade_id || '').trim();
	return Boolean(authContextUnitId || requestUserUnitId);
}

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

function withLoginAndClusterScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (!hasCanonicalUnitContext(req) && isPrivilegedGestorUser(req.user)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

router.get('/api/unidades/cluster', withLoginAndClusterScope(unidadesCluster));
router.get('/api/debug/session', debugSession);
router.get('/api/ibge', ibge);
router.get('/favicon.ico', favicon);
export default router;
