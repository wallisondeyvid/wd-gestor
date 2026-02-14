// (migrado) unidadeApi
import express from 'express';
import { createUnidade, updateUnidade, toggleAccessUnidades, getUnidadeById, getUnidadeModulos, deleteUnidade, uploadLogoUnidade, uploadLogoUnidadeInline, getUnidadeLogo, listUnidades, getUnidadePublic } from '#modules/gestor/app/controllers/unidadeApiController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
const router = express.Router();
router.post('/api/unidades', requireLogin, createUnidade);
// Listagem para hidratação client-side quando SSR vier vazio
router.get('/api/unidades', requireLogin, listUnidades);
router.put('/api/unidades/:id', requireLogin, updateUnidade);
// Upload de logo (imagem) da unidade
router.post('/api/unidades/:id/logo', requireLogin, uploadLogoUnidade);
// Upload inline (DataURL via JSON) — alternativa serverless sem multipart
router.post('/api/unidades/:id/logo-inline', requireLogin, uploadLogoUnidadeInline);
router.post('/api/unidades/toggle-access', requireLogin, toggleAccessUnidades);
router.get('/api/unidades/:id', requireLogin, getUnidadeById);
// Público para QR (sem requireLogin) – dados limitados
router.get('/api/public/unidades/:id', getUnidadePublic);
// Leitura da logo (binário) — retorna imagem a partir do armazenamento atual (Data URL ou legado em disco)
router.get('/api/unidades/:id/logo', requireLogin, getUnidadeLogo);
router.get('/api/unidades/:id/modulos', requireLogin, getUnidadeModulos);
router.delete('/api/unidades/:id', requireLogin, deleteUnidade);
export default router;
