// (migrado) funcaoApi
import express from 'express';
import mongoose from 'mongoose';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes } from '#modules/gestor/app/controllers/funcaoApiController.js';
const router = express.Router();

function isPrivilegedGestorUser(user) {
	return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function normalizeUnitCandidate(value) {
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') {
		return String(value._id || value.id || '').trim();
	}
	return String(value).trim();
}

function hasCanonicalUnitContext(req) {
	const authContextUnitId = String(req?.session?.gestorAuthContext?.active_unidade_id || '').trim();
	const requestUserUnitId = String(req?.user?.unidade_id || '').trim();
	return Boolean(authContextUnitId || requestUserUnitId);
}

function resolveCreateFuncaoScopedUnitIdFromBody(req) {
	const body = req?.body && typeof req.body === 'object' ? req.body : {};
	const candidate = normalizeUnitCandidate(
		body.unidade_id
			|| body.unidadeId
			|| body.unidade_principal_id
			|| body.unidadePrincipal
			|| body.unidadePrincipalId
	);
	if (!candidate || !mongoose.isValidObjectId(candidate)) return '';
	return candidate;
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

function withLoginAndRequiredUnitScopeForCreate(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorUser(req.user) && !hasCanonicalUnitContext(req)) {
			const scopedUnitCandidate = resolveCreateFuncaoScopedUnitIdFromBody(req);
			if (scopedUnitCandidate) {
				req.body = {
					...(req.body && typeof req.body === 'object' ? req.body : {}),
					unidade_id: scopedUnitCandidate,
				};
			}
		}

		return requireUnitScope(req, res, () => {
			const scopedUnitId = String(req.unitScope?.unidadeId || '').trim();
			if (!isPrivilegedGestorUser(req.user) && (!scopedUnitId || req.unitScope?.type !== 'unit')) {
				return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
			}
			return handler(req, res, next);
		});
	});
}

router.post('/api/funcoes', withLoginAndRequiredUnitScopeForCreate(createFuncao));
router.get('/api/funcoes/:id', withLoginAndRequiredUnitScope(getFuncao));
router.put('/api/funcoes/:id', withLoginAndRequiredUnitScope(updateFuncao));
router.get('/api/funcoes/unidade/:unidadeId', withLoginAndRequiredUnitScope(getFuncoesPorUnidade));
router.get('/api/funcoes', withLoginAndRequiredUnitScope(listarFuncoesApi));
router.delete('/api/funcoes/:id', withLoginAndRequiredUnitScope(deleteFuncao));
router.post('/api/funcoes/bulk-update', withLoginAndRequiredUnitScope(bulkUpdateFuncoes));
export default router;
