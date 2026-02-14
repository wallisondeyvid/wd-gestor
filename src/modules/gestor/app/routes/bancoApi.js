// Rota API bancos
import express from 'express';
import { listarBancos } from '#modules/gestor/app/controllers/bancoApiController.js';
const router = express.Router();

router.get('/bancos', listarBancos);

export default router;
