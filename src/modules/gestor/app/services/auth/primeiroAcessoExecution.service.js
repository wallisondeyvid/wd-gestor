import {
  findUserByIdWithMaxTime,
  saveUserDocument,
} from '#modules/gestor/app/services/authDbBridgeService.js';

export async function primeiroAcessoExecutionService({ userId, senhaHash, maxTimeMS }) {
  const user = await findUserByIdWithMaxTime({ id: userId, maxTimeMS });
  if (!user) return { kind: 'not_found' };
  if (!user.primeiro_acesso) return { kind: 'already_completed' };

  user.senha = senhaHash;
  user.primeiro_acesso = false;
  user.senha_provisoria = false;

  try {
    await saveUserDocument(user);
  } catch (error) {
    return { kind: 'save_failed', error };
  }

  return { kind: 'updated' };
}

export default primeiroAcessoExecutionService;