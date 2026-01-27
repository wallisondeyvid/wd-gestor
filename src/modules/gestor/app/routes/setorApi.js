// (migrado) setorApi
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import { createSetor, getSetoresPorUnidade, getSetor, updateSetor, listarSetores, deleteSetor, debugGetCounter, debugFixCounter } from '../controllers/setorApiController.js';
const router = express.Router();
router.post('/api/setores', requireLogin, createSetor);
router.get('/api/setores/unidade/:unidadeId', requireLogin, getSetoresPorUnidade);
router.get('/api/setores/:id', requireLogin, getSetor);
router.put('/api/setores/:id', requireLogin, updateSetor);
router.get('/api/setores', requireLogin, listarSetores);
router.delete('/api/setores/:id', requireLogin, deleteSetor);
// Endpoints de debug (somente fora de produção)
if (process.env.NODE_ENV !== 'production') {
	router.get('/api/setores/counter', requireLogin, debugGetCounter);
	router.post('/api/setores/fix-counter', requireLogin, debugFixCounter);
}
export default router;
