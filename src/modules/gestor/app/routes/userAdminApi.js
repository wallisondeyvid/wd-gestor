// (migrado) userAdminApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import requireApiAuth from '#modules/gestor/app/middlewares/requireApiAuth.js';
import { toggleUsuario, updateUsuario, deleteUsuario } from '#modules/gestor/app/controllers/userAdminApiController.js';
import { requireRole } from '#modules/gestor/app/middlewares/requireRole.js';
const router = express.Router();
router.post('/usuarios/:id/toggle', requireLogin, requireRole(['admin']), toggleUsuario);
router.post('/usuarios/:id/update', requireLogin, requireRole(['admin']), updateUsuario);
// Para APIs críticas, usar requireApiAuth (retorno JSON) em vez de redirect-based login
router.post('/usuarios/:id/delete', requireApiAuth, requireRole(['admin']), deleteUsuario);
export default router;
