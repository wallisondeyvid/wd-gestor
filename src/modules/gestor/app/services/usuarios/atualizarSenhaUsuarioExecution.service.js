import bcrypt from 'bcryptjs';
import { findUserById, saveUserDoc } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function atualizarSenhaUsuarioExecutionService({ userId, senhaAtual, novaSenha } = {}) {
  const user = await findUserById(userId);
  if (!user) {
    return { kind: 'not_found' };
  }

  const confere = await bcrypt.compare(senhaAtual, user.senha);
  if (!confere) {
    return { kind: 'invalid_current_password' };
  }

  user.senha = await bcrypt.hash(novaSenha, 10);
  if (user.primeiro_acesso) user.primeiro_acesso = false;
  if (user.senha_provisoria) user.senha_provisoria = false;
  await saveUserDoc(user);

  return { kind: 'updated', updated: true, primeiro_acesso: false, senha_provisoria: false };
}

export default atualizarSenhaUsuarioExecutionService;