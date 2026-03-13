// (migrado) Rotas de funcionários
import express from 'express';

// View /funcionarios é servida por pagesRouter com requireLogin.
// A URL pública /api/funcionarios/* deve ser atendida apenas por funcionarioApiRouter.
const router = express.Router();

export default router;
