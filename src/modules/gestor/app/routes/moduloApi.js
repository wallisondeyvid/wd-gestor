// (migrado) moduloApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { listarModulos, obterModulo, criarModulo, atualizarModulo, excluirModulo } from '#modules/gestor/app/controllers/moduloApiController.js';
const router = express.Router();
router.use(requireLogin);
router.get('/api/modulos', listarModulos);
router.get('/api/modulos/:id', obterModulo);
router.post('/api/modulos', criarModulo);
router.put('/api/modulos/:id', atualizarModulo);
router.delete('/api/modulos/:id', excluirModulo);
export default router;
