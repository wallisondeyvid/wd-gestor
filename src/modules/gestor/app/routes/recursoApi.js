// (migrado) recursoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { isPrivilegedGestorContext, requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { listarRecursosApi, getRecurso, createRecurso, updateRecurso, deleteRecurso } from '#modules/gestor/app/controllers/recursoApiController.js';
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
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

function withLoginAndReadOnlyRecursosScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

router.get('/api/recursos', withLoginAndReadOnlyRecursosScope(listarRecursosApi));
router.get('/api/recursos/:id', withLoginAndRequiredUnitScope(getRecurso));
router.post('/api/recursos', withLoginAndRequiredUnitScope(createRecurso));
router.put('/api/recursos/:id', withLoginAndRequiredUnitScope(updateRecurso));
router.delete('/api/recursos/:id', withLoginAndRequiredUnitScope(deleteRecurso));
export default router;
