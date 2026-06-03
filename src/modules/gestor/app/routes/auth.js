// (migrado) Rotas de auth
import express from 'express';
import { getAuthContext, login, logout, renderResetPassword, postResetPassword, postEsqueciSenha, primeiroAcessoPost, listarEmailsPorCPF, selectAuthUnit, switchAuthUnit } from '#modules/gestor/app/controllers/authController.js';
import { createGestorLoginHttpLimiter } from '#modules/gestor/app/middlewares/rateLimit.js';
const router = express.Router();
const gestorLoginHttpLimiter = createGestorLoginHttpLimiter();
// Métricas simples de adoção de rotas prefixadas vs raiz
router.use((req,res,next)=> {
	try {
		const store = req.app.locals.routeUsage = req.app.locals.routeUsage || { auth:{ root:0, prefixed:0 } };
		const isPrefixed = req.path.startsWith('/gestor/');
		if (isPrefixed) store.auth.prefixed++; else store.auth.root++;
	} catch {}
	next();
});
const preferPrefix = process.env.PREFER_GESTOR_PREFIX === 'true';
const disableRoot = process.env.DISABLE_ROOT_AUTH_ROUTES === 'true';

// Login (rota interna relativa; basePath externo aplica /gestor)
// Removido checkUserStatus aqui para evitar uma consulta prévia ao banco que pode estourar timeout
// em ambientes serverless. O próprio login() já valida user.ativo e retorna erro apropriado.
router.get('/auth/context', getAuthContext);
router.post('/auth/select-unit', selectAuthUnit);
router.post('/auth/switch-unit', switchAuthUnit);
router.post('/login', gestorLoginHttpLimiter, login);
router.get('/logout', logout);
// Reset password no sub-app Gestor: o redirect sem prefixo pertence ao app raiz.
router.get('/reset-password/:token', renderResetPassword);
router.post('/reset-password', postResetPassword);
// Recovery request no sub-app Gestor: o redirecionamento sem prefixo pertence ao app raiz.
router.post('/esqueci-senha', postEsqueciSenha);
router.post('/esquecisenha', postEsqueciSenha);
// Listagem de emails por CPF no sub-app Gestor: o redirecionamento sem prefixo pertence ao app raiz.
router.get('/api/recover/emails', listarEmailsPorCPF);
router.post('/primeiroacesso', primeiroAcessoPost);
export default router;
