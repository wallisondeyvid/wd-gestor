// (migrado) Rotas de unidades
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { testarBanco } from '#modules/gestor/app/controllers/unidadeController.js';

const router = express.Router();

router.post('/unidades/:id/testar-banco', requireLogin, requireUnitScope, testarBanco);

export default router;
