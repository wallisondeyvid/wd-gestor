import {
  findSetorById,
  findSetorByIdAndDelete,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

export async function deleteSetorScopedService({ setorId, unidadeId = null }) {
  const normalizedUnitId = normalizeUnitId(unidadeId);
  const scopedUnitId = normalizedUnitId || null;

  const setor = await findSetorById(setorId, scopedUnitId);

  if (!setor) return null;

  await findSetorByIdAndDelete(setorId, scopedUnitId);

  return setor;
}

export default deleteSetorScopedService;