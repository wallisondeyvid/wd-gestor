import {
  completePrimeiroAcessoData,
  loadPrimeiroAcessoUserData,
} from '#modules/gestor/app/data/auth/primeiroAcessoExecutionDataFacade.js';

export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS }) {
  if (!userId) return { kind: 'not_found' };

  const user = await loadPrimeiroAcessoUserData({ userId, maxTimeMS });
  if (!user) return { kind: 'not_found' };
  if (!user.primeiro_acesso) return { kind: 'already_completed' };

  try {
    await completePrimeiroAcessoData({ userId, senhaHash });
  } catch (error) {
    return { kind: 'save_failed', error };
  }

  return { kind: 'updated' };
}

export default primeiroAcessoExecutionService;