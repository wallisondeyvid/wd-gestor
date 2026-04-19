// (migrado) miscApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { obterClusterUnidades } from '#modules/gestor/app/controllers/miscApiController.js';
const router = express.Router();

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

router.get('/unidades/cluster', withLoginAndRequiredUnitScope(obterClusterUnidades));
export default router;
