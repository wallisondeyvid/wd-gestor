import {
  createPasswordResetRepo,
  deletePasswordResetsByUserIdRepo,
  findFuncionariosByCpfSelectRepo,
  findUsersByCpfRepo,
  findUsersByFuncionarioIdsRepo,
} from '#modules/gestor/app/repositories/AuthRepository.js';
import { hashPasswordRecoveryToken } from '#modules/gestor/app/data-access/auth/passwordRecoveryTokenHash.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export async function loadRecoveryUsersByCpfData({ cpfDigits }) {
  let usuarios = await findUsersByCpfRepo({ unitScope: GLOBAL_SCOPE, cpf: cpfDigits });

  if (!usuarios.length) {
    const funcionarios = await findFuncionariosByCpfSelectRepo({
      unitScope: GLOBAL_SCOPE,
      cpf: cpfDigits,
      select: '_id',
    });

    if (funcionarios.length) {
      const ids = funcionarios.map((funcionario) => funcionario._id);
      usuarios = await findUsersByFuncionarioIdsRepo({ unitScope: GLOBAL_SCOPE, ids });
    }
  }

  return usuarios;
}

export async function createPasswordRecoveryTokenData({ userId, rawToken, expiresAt }) {
  const tokenHash = hashPasswordRecoveryToken(rawToken);

  await deletePasswordResetsByUserIdRepo({
    unitScope: GLOBAL_SCOPE,
    userId,
  });

  return createPasswordResetRepo({
    unitScope: GLOBAL_SCOPE,
    payload: {
      user_id: userId,
      token: tokenHash,
      expiresAt,
    },
  });
}

export default {
  loadRecoveryUsersByCpfData,
  createPasswordRecoveryTokenData,
};