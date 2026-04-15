import { findUserByIdRepo } from '#modules/gestor/app/repositories/AuthRepository.js';
import { UserRepository } from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function loadPrimeiroAcessoUserData({ userId, maxTimeMS }) {
  let query = findUserByIdRepo({ unitScope: GLOBAL_SCOPE, id: userId });
  query = withOptionalMaxTime(query, maxTimeMS);

  const user = await query;
  if (!user) return null;

  return {
    _id: user._id,
    primeiro_acesso: user.primeiro_acesso === true,
    senha_provisoria: user.senha_provisoria === true,
  };
}

export async function completePrimeiroAcessoData({ userId, senhaHash }) {
  const userRepository = new UserRepository({ unitScope: GLOBAL_SCOPE });
  return userRepository.updateById({
    id: userId,
    set: {
      senha: senhaHash,
      primeiro_acesso: false,
      senha_provisoria: false,
    },
  });
}

export default {
  loadPrimeiroAcessoUserData,
  completePrimeiroAcessoData,
};