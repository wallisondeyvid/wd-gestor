// (migrado) funcionarioApi
import express from 'express';
import { requireLogin } from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { uploadFuncionario } from '#modules/gestor/app/middlewares/uploadFuncionario.js';
import rateLimit from 'express-rate-limit';
import { createFuncionario, createFuncionarioInitial, updateFuncionarioIncremental, updateFuncionario, getFuncionario, deleteFuncionario, deleteFuncionarioPost, downloadAnexoFuncionario, listarFuncionariosDisponiveis, getFuncionarioFoto, matchFuncionario } from '#modules/gestor/app/controllers/funcionarioApiController.js';
const uploadLimiter = rateLimit({ windowMs: 15*60*1000, max: 300 });
const router = express.Router();
router.use(requireLogin);

function isPrivilegedGestorUser(user) {
	return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function getLegacyAuthenticatedUnitId(req) {
	return String(req.user?.unidade_id || req.session?.user?.unidade_id || '').trim();
}

function withRequiredUnitScope(handler) {
	return (req, res, next) => requireUnitScope(req, res, () => {
		const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
		const legacyAuthenticatedUnitId = getLegacyAuthenticatedUnitId(req);
		if (!isPrivilegedGestorUser(req.user) && (!scopedUnitId || req.unitScope?.type !== 'unit') && !legacyAuthenticatedUnitId) {
			return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
		}
		return handler(req, res, next);
	});
}

// As rotas abaixo são relativas ao prefixo '/api/funcionarios' configurado no gestor-app
router.get('/disponiveis/:unidadeId', withRequiredUnitScope(listarFuncionariosDisponiveis));
router.get('/match', withRequiredUnitScope(matchFuncionario));
router.post('/initial', withRequiredUnitScope(createFuncionarioInitial));
router.post('/', uploadLimiter, uploadFuncionario, withRequiredUnitScope(createFuncionario));
router.put('/:id/incremental', uploadLimiter, uploadFuncionario, withRequiredUnitScope(updateFuncionarioIncremental));
router.put('/:id', uploadLimiter, uploadFuncionario, withRequiredUnitScope(updateFuncionario));
router.get('/:id', withRequiredUnitScope(getFuncionario));
router.get('/:id/foto', withRequiredUnitScope(getFuncionarioFoto));
router.delete('/:id', withRequiredUnitScope(deleteFuncionario));
router.post('/:id/delete', withRequiredUnitScope(deleteFuncionarioPost));
router.get('/:id/anexo/:idx', withRequiredUnitScope(downloadAnexoFuncionario));
export default router;
