// (migrado) recursoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { listarRecursosApi, getRecurso, createRecurso, updateRecurso, deleteRecurso } from '#modules/gestor/app/controllers/recursoApiController.js';
const router = express.Router();

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

router.get('/api/recursos', withLoginAndRequiredUnitScope(listarRecursosApi));
router.get('/api/recursos/:id', withLoginAndRequiredUnitScope(getRecurso));
router.post('/api/recursos', withLoginAndRequiredUnitScope(createRecurso));
router.put('/api/recursos/:id', withLoginAndRequiredUnitScope(updateRecurso));
router.delete('/api/recursos/:id', withLoginAndRequiredUnitScope(deleteRecurso));
export default router;
