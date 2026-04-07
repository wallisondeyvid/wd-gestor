// (migrado) setorApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { createSetor, getSetoresPorUnidade, getSetor, updateSetor, listarSetores, deleteSetor, debugGetCounter, debugFixCounter } from '#modules/gestor/app/controllers/setorApiController.js';
const router = express.Router();

function isPrivilegedGestorUser(user) {
	return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => {
		const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
		if (!isPrivilegedGestorUser(req.user) && (!scopedUnitId || req.unitScope?.type !== 'unit')) {
			return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
		}
		return handler(req, res, next);
	}));
}

router.post('/api/setores', withLoginAndRequiredUnitScope(createSetor));
router.get('/api/setores/unidade/:unidadeId', withLoginAndRequiredUnitScope(getSetoresPorUnidade));
router.get('/api/setores/:id', withLoginAndRequiredUnitScope(getSetor));
router.put('/api/setores/:id', withLoginAndRequiredUnitScope(updateSetor));
router.get('/api/setores', withLoginAndRequiredUnitScope(listarSetores));
router.delete('/api/setores/:id', withLoginAndRequiredUnitScope(deleteSetor));
// Endpoints de debug (somente fora de produção)
if (process.env.NODE_ENV !== 'production') {
	router.get('/api/setores/counter', requireLogin, debugGetCounter);
	router.post('/api/setores/fix-counter', requireLogin, debugFixCounter);
}
export default router;
