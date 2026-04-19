// (migrado) Rotas de API utilitárias
import express from 'express';
import { unidadesCluster, debugSession, ibge, favicon } from '#modules/gestor/app/controllers/apiController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
const router = express.Router();

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

router.get('/api/unidades/cluster', withLoginAndRequiredUnitScope(unidadesCluster));
router.get('/api/debug/session', debugSession);
router.get('/api/ibge', ibge);
router.get('/favicon.ico', favicon);
export default router;
