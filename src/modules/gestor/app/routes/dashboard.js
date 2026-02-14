// (migrado) Rotas de dashboard
import express from 'express';
import { renderDashboard } from '#modules/gestor/app/controllers/dashboardController.js';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
const router = express.Router();
router.get('/dashboard', requireLogin, renderDashboard);
// Caso algum fluxo envie POST para /dashboard, redireciona para GET (sem mudar basePath)
router.post('/dashboard', (req, res) => {
	const basePath = req.baseUrl || '';
	return res.redirect(303, basePath + '/dashboard');
});
export default router;
