import {
  findPasswordResetByTokenRepo,
  findUserByIdSelectRepo,
} from '#modules/gestor/app/repositories/AuthRepository.js';
import { hashPasswordRecoveryToken } from '#modules/gestor/app/data-access/auth/passwordRecoveryTokenHash.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function loadPasswordResetTokenData({ token }) {
  const tokenHash = hashPasswordRecoveryToken(token);
  return findPasswordResetByTokenRepo({ unitScope: GLOBAL_SCOPE, token: tokenHash });
}

export async function loadPasswordResetUserNameData({ userId }) {
  return findUserByIdSelectRepo({ unitScope: GLOBAL_SCOPE, id: userId, select: 'nome email' });
}

export default {
  loadPasswordResetTokenData,
  loadPasswordResetUserNameData,
};