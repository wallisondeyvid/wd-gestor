// (migrado) Rotas de API utilitárias
import express from 'express';
import { unidadesCluster, debugSession, debugWhoami, ibge, favicon } from '#modules/gestor/app/controllers/apiController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
const router = express.Router();
router.get('/api/unidades/cluster', requireLogin, unidadesCluster);
router.get('/api/debug/session', debugSession);
router.get('/api/debug/whoami', debugWhoami);
router.get('/api/ibge', ibge);
router.get('/favicon.ico', favicon);
export default router;
