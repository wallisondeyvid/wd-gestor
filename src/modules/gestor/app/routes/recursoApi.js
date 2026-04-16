// (migrado) recursoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { listarRecursosApi, getRecurso, createRecurso, updateRecurso, deleteRecurso } from '#modules/gestor/app/controllers/recursoApiController.js';
const router = express.Router();

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		const originalStatus = res.status.bind(res);
		const originalJson = res.json.bind(res);
		const originalSend = res.send.bind(res);
		let pendingStatusCode = 200;

		function restoreResponseMethods() {
			res.status = originalStatus;
			res.json = originalJson;
			res.send = originalSend;
		}

		function forwardCapturedResponse(sender, payload) {
			restoreResponseMethods();
			res.status(pendingStatusCode);
			return sender(payload);
		}

		function shouldBypassMissingUnitScope(payload) {
			return pendingStatusCode === 400 && payload?.error === 'UNIDADE_ID_REQUIRED';
		}

		res.status = (code) => {
			pendingStatusCode = code;
			return res;
		};
		res.json = (payload) => {
			if (shouldBypassMissingUnitScope(payload)) {
				restoreResponseMethods();
				return handler(req, res, next);
			}

			return forwardCapturedResponse(originalJson, payload);
		};
		res.send = (payload) => {
			if (shouldBypassMissingUnitScope(payload)) {
				restoreResponseMethods();
				return handler(req, res, next);
			}

			return forwardCapturedResponse(originalSend, payload);
		};

		return requireUnitScope(req, res, () => {
			restoreResponseMethods();
			return handler(req, res, next);
		});
	});
}

router.get('/api/recursos', withLoginAndRequiredUnitScope(listarRecursosApi));
router.get('/api/recursos/:id', withLoginAndRequiredUnitScope(getRecurso));
router.post('/api/recursos', withLoginAndRequiredUnitScope(createRecurso));
router.put('/api/recursos/:id', withLoginAndRequiredUnitScope(updateRecurso));
router.delete('/api/recursos/:id', withLoginAndRequiredUnitScope(deleteRecurso));
export default router;
