// Rotas de usuários do módulo Gestor (migrado para modules/gestor/app/routes)
import express from 'express';
import { listLockedUsers, unlockUsuario, statusUsuario } from '#modules/gestor/app/controllers/userController.js';

const router = express.Router();
router.get('/api/usuarios/bloqueados', listLockedUsers);
router.post('/api/usuarios/:id/unlock', unlockUsuario);
router.get('/api/usuarios/:id/status', statusUsuario);
export default router;
