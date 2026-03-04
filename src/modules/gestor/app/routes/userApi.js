// (wrapper) userApi
import createUserApiRouter from '#shared/routes/userApi.js';
import { criarUsuario, obterUsuarioAtual, atualizarSenhaUsuario, atualizarUsuario } from '#modules/gestor/app/controllers/userController.js';
import { toggleUsuario, deleteUsuario, updateUsuario as updateUsuarioJson } from '#modules/gestor/app/controllers/userAdminApiController.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';
import requireApiAuth from '#modules/gestor/app/middlewares/requireApiAuth.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';

const router = createUserApiRouter({
  criarUsuario,
  obterUsuarioAtual,
  atualizarSenhaUsuario,
  atualizarUsuario,
  toggleUsuario,
  deleteUsuario,
  updateUsuarioJson,
  requireRole,
  requireApiAuth,
  requireLogin,
});

export default router;
