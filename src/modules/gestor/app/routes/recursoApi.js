// (migrado) recursoApi
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import { listarRecursosApi, getRecurso, createRecurso, updateRecurso, deleteRecurso } from '../controllers/recursoApiController.js';
const router = express.Router();
router.get('/api/recursos', requireLogin, listarRecursosApi);
router.get('/api/recursos/:id', requireLogin, getRecurso);
router.post('/api/recursos', requireLogin, createRecurso);
router.put('/api/recursos/:id', requireLogin, updateRecurso);
router.delete('/api/recursos/:id', requireLogin, deleteRecurso);
export default router;
