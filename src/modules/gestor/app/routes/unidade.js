// (migrado) Rotas de unidades
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import { testarBanco } from '../controllers/unidadeController.js';

const router = express.Router();

router.post('/unidades/:id/testar-banco', requireLogin, testarBanco);

export default router;
