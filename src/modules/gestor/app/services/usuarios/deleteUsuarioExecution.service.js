import { createUnitScope } from '#shared/unitScope.js';
import { deleteUserByIdRepo } from '#modules/gestor/app/repositories/UserRepository.js';
import { unsetFuncionarioUsuarioIdIfMatchesUserRepo } from '#modules/gestor/app/repositories/FuncionarioRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

function normalizeEntityId(value) {
  return String(value || '').trim();
}

export async function deleteUsuarioExecutionService({ userId, vinculoFuncionarioId = null }) {
  const normalizedUserId = normalizeEntityId(userId);
  const normalizedFuncionarioId = normalizeEntityId(vinculoFuncionarioId);

  await deleteUserByIdRepo({ unitScope: GLOBAL_SCOPE, userId: normalizedUserId });

  if (!normalizedFuncionarioId) return;

  try {
    await unsetFuncionarioUsuarioIdIfMatchesUserRepo({
      unitScope: GLOBAL_SCOPE,
      funcionarioId: normalizedFuncionarioId,
      userId: normalizedUserId,
    });
  } catch (unsetErr) {
    console.warn('[deleteUsuarioExecutionService] aviso ao remover vínculo de funcionário:', unsetErr?.message || unsetErr);
  }
}

export default deleteUsuarioExecutionService;