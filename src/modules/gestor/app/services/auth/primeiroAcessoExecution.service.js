import { findUserByIdRepo } from '#modules/gestor/app/repositories/AuthRepository.js';

const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

function withOptionalMaxTime(query, maxTimeMS) {
  if (Number.isFinite(maxTimeMS) && maxTimeMS > 0 && typeof query?.maxTimeMS === 'function') {
    return query.maxTimeMS(maxTimeMS);
  }
  return query;
}

export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS }) {
  let query = findUserByIdRepo({ unitScope: GLOBAL_SCOPE, id: userId });
  query = withOptionalMaxTime(query, maxTimeMS);

  const user = await query;
  if (!user) return { kind: 'not_found' };
  if (!user.primeiro_acesso) return { kind: 'already_completed' };

  user.senha = senhaHash;
  user.primeiro_acesso = false;
  user.senha_provisoria = false;

  try {
    await user.save();
  } catch (error) {
    return { kind: 'save_failed', error };
  }

  return { kind: 'updated' };
}

export default primeiroAcessoExecutionService;