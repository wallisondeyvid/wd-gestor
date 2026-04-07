import { saveUserDoc } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function toggleUsuarioExecutionService({ user }) {
  user.ativo = !user.ativo;
  await saveUserDoc(user);
  return user;
}

export default toggleUsuarioExecutionService;