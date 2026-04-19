import {
  deletePasswordResetByIdRepo,
  findPasswordResetByTokenRepo,
  findUserByIdRepo,
} from '#modules/gestor/app/repositories/AuthRepository.js';
import { UserRepository } from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function loadPasswordResetExecutionData({ token }) {
  const passwordReset = await findPasswordResetByTokenRepo({ unitScope: GLOBAL_SCOPE, token });
  const userId = passwordReset?.user_id || passwordReset?.userId || null;
  const user = userId ? await findUserByIdRepo({ unitScope: GLOBAL_SCOPE, id: userId }) : null;

  return { passwordReset, user };
}

export async function completePasswordResetData({ userId, passwordHash, passwordResetId }) {
  const userRepository = new UserRepository({ unitScope: GLOBAL_SCOPE });

  await userRepository.updateById({
    id: userId,
    set: { senha: passwordHash },
  });

  await deletePasswordResetByIdRepo({ unitScope: GLOBAL_SCOPE, id: passwordResetId });
}

export default {
  loadPasswordResetExecutionData,
  completePasswordResetData,
};