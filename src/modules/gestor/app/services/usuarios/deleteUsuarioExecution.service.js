import {
  deleteUserById,
  unsetFuncionarioUsuarioIdIfMatchesUser,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeEntityId(value) {
  return String(value || '').trim();
}

export async function deleteUsuarioExecutionService({ userId, vinculoFuncionarioId = null, unidadeId = null }) {
  const normalizedUserId = normalizeEntityId(userId);
  const normalizedFuncionarioId = normalizeEntityId(vinculoFuncionarioId);
  const normalizedUnidadeId = normalizeEntityId(unidadeId);

  await deleteUserById(normalizedUserId);

  if (!normalizedFuncionarioId) return;

  try {
    await unsetFuncionarioUsuarioIdIfMatchesUser(
      normalizedFuncionarioId,
      normalizedUserId,
      normalizedUnidadeId || null,
    );
  } catch (unsetErr) {
    console.warn('[deleteUsuarioExecutionService] aviso ao remover vínculo de funcionário:', unsetErr?.message || unsetErr);
  }
}

export default deleteUsuarioExecutionService;