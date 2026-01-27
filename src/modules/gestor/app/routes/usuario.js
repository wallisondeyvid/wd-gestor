// Rotas de usuários do módulo Gestor (migrado para modules/gestor/app/routes)
import express from 'express';
import { toggleUsuario, atualizarUsuario, excluirUsuario, listLockedUsers, unlockUsuario, statusUsuario } from '../controllers/userController.js';

const router = express.Router();
router.post('/api/usuarios/:id/toggle', toggleUsuario);
router.post('/api/usuarios/:id/update', atualizarUsuario);
router.post('/api/usuarios/:id/delete', excluirUsuario);
router.get('/api/usuarios/bloqueados', listLockedUsers);
router.post('/api/usuarios/:id/unlock', unlockUsuario);
router.get('/api/usuarios/:id/status', statusUsuario);
export default router;
