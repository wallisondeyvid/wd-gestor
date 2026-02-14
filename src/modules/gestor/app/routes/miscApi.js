// (migrado) miscApi
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { obterCodigoIbge, obterClusterUnidades } from '#modules/gestor/app/controllers/miscApiController.js';
const router = express.Router();
router.get('/ibge', obterCodigoIbge);
router.get('/unidades/cluster', requireLogin, obterClusterUnidades);
export default router;
