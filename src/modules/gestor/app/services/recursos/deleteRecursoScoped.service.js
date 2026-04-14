function normalizeUnitId(value) {
	return String(value || '').trim();
}

import { deleteRecursoByIdLeanData } from '#modules/gestor/app/data/recursos/recursoDeleteDataFacade.js';

export async function deleteRecursoScopedService({ recursoId, unidadeEfetiva = null }) {
	const unidadeId = normalizeUnitId(unidadeEfetiva) || null;

	return deleteRecursoByIdLeanData({ id: recursoId, unidadeId });
}

export default deleteRecursoScopedService;