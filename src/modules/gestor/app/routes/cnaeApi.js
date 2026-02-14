// (migrado) cnaeApi
import express from 'express';
import { requireLogin } from '#modules/gestor/app/middlewares/requireLogin.js';
import { listarCnaes, obterCnae } from '#modules/gestor/app/controllers/cnaeApiController.js';
const router = express.Router();
router.use(requireLogin);
router.get('/cnaes', listarCnaes);
router.get('/cnaes/:codigo', obterCnae);
export default router;
