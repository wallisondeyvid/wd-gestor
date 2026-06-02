// (migrado) moduloApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { isPrivilegedGestorContext } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { listarModulos, obterModulo, criarModulo, atualizarModulo, excluirModulo } from '#modules/gestor/app/controllers/moduloApiController.js';

function requireGestorMasterOrAdmin(req, res, next) {
	if (isPrivilegedGestorContext({
		user: req?.user || null,
		sessionUser: req?.session?.user || null,
		authContext: req?.session?.gestorAuthContext || null,
	})) {
		return next();
	}

	return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Acesso negado' });
}

const router = express.Router();
router.use(requireLogin);
router.use('/api/modulos', requireGestorMasterOrAdmin);
router.use('/api/modulos/:id', requireGestorMasterOrAdmin);
router.get('/api/modulos', listarModulos);
router.get('/api/modulos/:id', obterModulo);
router.post('/api/modulos', criarModulo);
router.put('/api/modulos/:id', atualizarModulo);
router.delete('/api/modulos/:id', excluirModulo);
export default router;
