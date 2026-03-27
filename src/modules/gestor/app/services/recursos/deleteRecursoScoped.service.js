import { createUnitScope } from '#shared/unitScope.js';
import { deleteRecursoByIdRepo } from '#modules/gestor/app/repositories/RecursoReadRepository.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

export async function deleteRecursoScopedService({ recursoId, unidadeEfetiva = null }) {
	const unidadeId = normalizeUnitId(unidadeEfetiva) || null;
	const unitScope = unidadeId
		? createUnitScope({ unidadeId })
		: { type: 'global', unidadeId: null };

	return deleteRecursoByIdRepo({
		unitScope,
		id: recursoId,
		unidadeId,
	});
}

export default deleteRecursoScopedService;