// (migrado) funcaoApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes } from '#modules/gestor/app/controllers/funcaoApiController.js';
const router = express.Router();
router.post('/api/funcoes', requireLogin, createFuncao);
router.get('/api/funcoes/:id', requireLogin, getFuncao);
router.put('/api/funcoes/:id', requireLogin, updateFuncao);
router.get('/api/funcoes/unidade/:unidadeId', requireLogin, getFuncoesPorUnidade);
router.get('/api/funcoes', requireLogin, listarFuncoesApi);
router.delete('/api/funcoes/:id', requireLogin, deleteFuncao);
router.post('/api/funcoes/bulk-update', requireLogin, bulkUpdateFuncoes);
export default router;
