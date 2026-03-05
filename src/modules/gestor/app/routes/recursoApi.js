// (migrado) recursoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { listarRecursosApi, getRecurso, createRecurso, updateRecurso, deleteRecurso } from '#modules/gestor/app/controllers/recursoApiController.js';
const router = express.Router();

function withRequiredUnitScope(handler) {
	return (req, res, next) => requireUnitScope(req, res, () => handler(req, res, next));
}

router.get('/api/recursos', withRequiredUnitScope(requireLogin), listarRecursosApi);
router.get('/api/recursos/:id', requireLogin, getRecurso);
router.post('/api/recursos', requireLogin, createRecurso);
router.put('/api/recursos/:id', requireLogin, updateRecurso);
router.delete('/api/recursos/:id', requireLogin, deleteRecurso);
export default router;
