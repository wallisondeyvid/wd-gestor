// (migrado) cnaeApi
import express from 'express';
import { requireLogin } from '../middlewares/requireLogin.js';
import { listarCnaes, obterCnae } from '../controllers/cnaeApiController.js';
const router = express.Router();
router.use(requireLogin);
router.get('/cnaes', listarCnaes);
router.get('/cnaes/:codigo', obterCnae);
export default router;
