// (migrado) funcaoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes } from '#modules/gestor/app/controllers/funcaoApiController.js';
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

router.post('/api/funcoes', withLoginAndRequiredUnitScope(createFuncao));
router.get('/api/funcoes/:id', withLoginAndRequiredUnitScope(getFuncao));
router.put('/api/funcoes/:id', withLoginAndRequiredUnitScope(updateFuncao));
router.get('/api/funcoes/unidade/:unidadeId', withLoginAndRequiredUnitScope(getFuncoesPorUnidade));
router.get('/api/funcoes', withLoginAndRequiredUnitScope(listarFuncoesApi));
router.delete('/api/funcoes/:id', withLoginAndRequiredUnitScope(deleteFuncao));
router.post('/api/funcoes/bulk-update', withLoginAndRequiredUnitScope(bulkUpdateFuncoes));
export default router;
