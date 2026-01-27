// (migrado) Rotas de funcionários
import express from 'express';
import { funcionariosDisponiveis } from '../controllers/funcionarioController.js';
// View /funcionarios é servida por pagesRouter com requireLogin. Mantemos apenas API auxiliar.
const router = express.Router();
router.get('/api/funcionarios/disponiveis/:unidadeId', funcionariosDisponiveis);
export default router;
