import {
  findPasswordResetByTokenRepo,
  findUserByIdSelectRepo,
} from '#modules/gestor/app/repositories/AuthRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function loadPasswordResetTokenData({ token }) {
  return findPasswordResetByTokenRepo({ unitScope: GLOBAL_SCOPE, token });
}

export async function loadPasswordResetUserNameData({ userId }) {
  return findUserByIdSelectRepo({ unitScope: GLOBAL_SCOPE, id: userId, select: 'nome email' });
}

export default {
  loadPasswordResetTokenData,
  loadPasswordResetUserNameData,
};