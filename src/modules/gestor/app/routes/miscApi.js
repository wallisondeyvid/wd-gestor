// (migrado) miscApi
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import { obterCodigoIbge, obterClusterUnidades } from '../controllers/miscApiController.js';
const router = express.Router();
router.get('/ibge', obterCodigoIbge);
router.get('/unidades/cluster', requireLogin, obterClusterUnidades);
export default router;
