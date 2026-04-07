function normalizeUnitId(value) {
	return String(value || '').trim();
}

import { deleteRecursoById } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function deleteRecursoScopedService({ recursoId, unidadeEfetiva = null }) {
	const unidadeId = normalizeUnitId(unidadeEfetiva) || null;

	return deleteRecursoById(recursoId, unidadeId);
}

export default deleteRecursoScopedService;