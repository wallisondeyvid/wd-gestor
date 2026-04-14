import { deleteRecursoByIdRepo } from '#modules/gestor/app/repositories/RecursoReadRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

function scopeFromUnidadeId(unidadeId) {
  return createUnitScope({ unidadeId: unidadeId || null });
}

export async function deleteRecursoByIdLeanData({ id, unidadeId = null }) {
  return deleteRecursoByIdRepo({
    unitScope: scopeFromUnidadeId(unidadeId),
    id,
    unidadeId,
  });
}

export default deleteRecursoByIdLeanData;