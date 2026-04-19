// Rota API bancos
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { listarBancos } from '#modules/gestor/app/controllers/bancoApiController.js';
const router = express.Router();

router.get('/bancos', requireLogin, listarBancos);

export default router;
