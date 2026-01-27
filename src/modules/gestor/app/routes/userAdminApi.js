// (migrado) userAdminApi
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import requireApiAuth from '../middlewares/requireApiAuth.js';
import { toggleUsuario, updateUsuario, deleteUsuario } from '../controllers/userAdminApiController.js';
import { requireRole } from '../middlewares/requireRole.js';
const router = express.Router();
router.post('/usuarios/:id/toggle', requireLogin, requireRole(['admin']), toggleUsuario);
router.post('/usuarios/:id/update', requireLogin, requireRole(['admin']), updateUsuario);
// Para APIs críticas, usar requireApiAuth (retorno JSON) em vez de redirect-based login
router.post('/usuarios/:id/delete', requireApiAuth, requireRole(['admin']), deleteUsuario);
export default router;
