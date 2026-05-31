// (migrado) setorApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { isPrivilegedGestorContext, requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { createSetor, getSetoresPorUnidade, getSetor, updateSetor, listarSetores, deleteSetor, debugGetCounter, debugFixCounter } from '#modules/gestor/app/controllers/setorApiController.js';
const router = express.Router();

function isPrivilegedGestorRequest(req) {
	return isPrivilegedGestorContext({
		user: req?.user || null,
		sessionUser: req?.session?.user || null,
		authContext: req?.session?.gestorAuthContext || null,
	});
}

function hasCanonicalUnitContext(req) {
	return Boolean(
		req?.session?.gestorAuthContext?.active_unidade_id
		|| req?.query?.unidadeId
		|| req?.query?.unidade_id
		|| req?.params?.unidadeId
		|| req?.params?.unidade_id
		|| req?.body?.unidadeId
		|| req?.body?.unidade_id
	);
}

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => {
		const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
		if (!isPrivilegedGestorRequest(req) && (!scopedUnitId || req.unitScope?.type !== 'unit')) {
			return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
		}
		return handler(req, res, next);
	}));
}

function withLoginAndReadOnlySetoresScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

router.post('/api/setores', withLoginAndRequiredUnitScope(createSetor));
router.get('/api/setores/unidade/:unidadeId', withLoginAndRequiredUnitScope(getSetoresPorUnidade));
router.get('/api/setores/:id', withLoginAndRequiredUnitScope(getSetor));
router.put('/api/setores/:id', withLoginAndRequiredUnitScope(updateSetor));
router.get('/api/setores', withLoginAndReadOnlySetoresScope(listarSetores));
router.delete('/api/setores/:id', withLoginAndRequiredUnitScope(deleteSetor));
// Endpoints de debug (somente fora de produção)
if (process.env.NODE_ENV !== 'production') {
	router.get('/api/setores/counter', requireLogin, debugGetCounter);
	router.post('/api/setores/fix-counter', requireLogin, debugFixCounter);
}
export default router;
