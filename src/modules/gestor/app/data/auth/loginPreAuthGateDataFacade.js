import { findUserByEmailRepo } from '#modules/gestor/app/repositories/AuthRepository.js';
import { UserRepository } from '#modules/gestor/app/repositories/UserRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function withOptionalMaxTime(query, maxTimeMS) {
  if (!query || typeof query.maxTimeMS !== 'function') return query;

  const parsed = Number(maxTimeMS);
  if (!Number.isFinite(parsed) || parsed <= 0) return query;

  return query.maxTimeMS(parsed);
}

export async function loadLoginPreAuthUserData({ email, maxTimeMS }) {
  let query = findUserByEmailRepo({ unitScope: GLOBAL_SCOPE, email });
  query = withOptionalMaxTime(query, maxTimeMS);
  return query;
}

export async function saveLoginPreAuthUserStateData({ user }) {
  const userRepository = new UserRepository({ unitScope: GLOBAL_SCOPE });

  return userRepository.updateById({
    id: user?._id,
    set: {
      failed_login_attempts: user?.failed_login_attempts || 0,
      lock_until: user?.lock_until || null,
    },
  });
}

export default {
  loadLoginPreAuthUserData,
  saveLoginPreAuthUserStateData,
};