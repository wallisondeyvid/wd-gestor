// (migrado) funcionarioApi
import express from 'express';
import { requireLogin } from '#modules/gestor/app/middlewares/requireLogin.js';
import { uploadFuncionario } from '#modules/gestor/app/middlewares/uploadFuncionario.js';
import rateLimit from 'express-rate-limit';
import { createFuncionario, createFuncionarioInitial, updateFuncionarioIncremental, updateFuncionario, getFuncionario, deleteFuncionario, deleteFuncionarioPost, downloadAnexoFuncionario, listarFuncionariosDisponiveis, getFuncionarioFoto, matchFuncionario } from '#modules/gestor/app/controllers/funcionarioApiController.js';
const uploadLimiter = rateLimit({ windowMs: 15*60*1000, max: 300 });
const router = express.Router();
router.use(requireLogin);
// As rotas abaixo são relativas ao prefixo '/api/funcionarios' configurado no gestor-app
router.get('/disponiveis/:unidadeId', listarFuncionariosDisponiveis);
router.get('/match', matchFuncionario);
router.post('/initial', createFuncionarioInitial);
router.post('/', uploadLimiter, uploadFuncionario, createFuncionario);
router.put('/:id/incremental', uploadLimiter, uploadFuncionario, updateFuncionarioIncremental);
router.put('/:id', uploadLimiter, uploadFuncionario, updateFuncionario);
router.get('/:id', getFuncionario);
router.get('/:id/foto', getFuncionarioFoto);
router.delete('/:id', deleteFuncionario);
router.post('/:id/delete', deleteFuncionarioPost);
router.get('/:id/anexo/:idx', downloadAnexoFuncionario);
export default router;
