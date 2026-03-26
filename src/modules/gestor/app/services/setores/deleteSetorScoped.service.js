import { createUnitScope } from '#shared/unitScope.js';
import {
  findSetorByIdRepo,
  findSetorByIdAndDeleteRepo,
} from '#modules/gestor/app/repositories/SetorReadRepository.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

export async function deleteSetorScopedService({ setorId, unidadeId = null }) {
  const normalizedUnitId = normalizeUnitId(unidadeId);
  const scopedUnitId = normalizedUnitId || null;
  const unitScope = scopedUnitId
    ? createUnitScope({ unidadeId: scopedUnitId })
    : { type: 'global', unidadeId: null };

  const setor = await findSetorByIdRepo({
    unitScope,
    id: setorId,
    unidadeId: scopedUnitId,
  });

  if (!setor) return null;

  await findSetorByIdAndDeleteRepo({
    unitScope,
    id: setorId,
    unidadeId: scopedUnitId,
  });

  return setor;
}

export default deleteSetorScopedService;