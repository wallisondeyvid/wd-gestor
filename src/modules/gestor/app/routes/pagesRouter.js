// (migrado) pagesRouter.js
import express from 'express';
import requireLogin from '../middlewares/requireLogin.js';
import { paginaDashboard, paginaLogin, paginaContato, paginaPrimeiroAcesso, paginaEsqueciSenha, paginaErro, paginaUsuarios, paginaUnidades, paginaEditarUnidade, paginaModulos, paginaFuncoes, paginaFuncionarios, paginaRecursos, partialEndereco, paginaSetores, paginaFeedback } from '../controllers/views/pagesController.js';
// Wrapper inline para advanced recovery (reutiliza template compartilhado)
function paginaEsqueciSenhaAvancada(req,res){
	const basePath = req.urlBasePath || '';
	return res.render('gestor/esquecisenha-avancada', { basePath, moduleLabel: 'WDGestor' });
}
const router = express.Router();
// Métricas de adoção de rotas
router.use((req,res,next)=> {
	try {
		const store = req.app.locals.routeUsage = req.app.locals.routeUsage || { auth:{ root:0, prefixed:0 }, pages:{ root:0, prefixed:0 } };
		const isPrefixed = req.path.startsWith('/gestor/');
		if (isPrefixed) store.pages.prefixed++; else store.pages.root++;
	} catch {}
	next();
});
// Rotas públicas
router.get('/login', paginaLogin); // restaurada para servir /gestor/login após mount
router.get('/contato', paginaContato);
// Primeiro acesso: permitir renderizar sem requireLogin para evitar 500 quando o banco estiver indisponível.
// A validação real ocorre no POST /primeiroacesso e durante o login.
router.get('/primeiroacesso', paginaPrimeiroAcesso);
router.get('/esquecisenha', paginaEsqueciSenha);
router.get('/dashboard', requireLogin, paginaDashboard);

// Advanced recovery (GET form)
router.get('/esquecisenha-avancada', (req,res)=> paginaEsqueciSenhaAvancada(req,res));
router.get('/usuarios', requireLogin, paginaUsuarios);
router.get('/feedback', requireLogin, paginaFeedback);
router.get('/unidades', requireLogin, paginaUnidades);
router.get('/editar-unidades/:id', requireLogin, paginaEditarUnidade);
router.get('/modulos', requireLogin, paginaModulos);
router.get('/funcoes', requireLogin, paginaFuncoes);
router.get('/funcionarios', requireLogin, paginaFuncionarios);
router.get('/recursos', requireLogin, paginaRecursos);
router.get('/setores', requireLogin, paginaSetores);
router.get('/endereco', partialEndereco);
router.get('/erro', paginaErro);
// Debug: quem sou eu (para validar isMaster/role)
router.get('/api/debug/whoami', (req,res)=>{
	res.json({ ok:true, user: req.user || null, session: req.session && req.session.user ? { email: req.session.user.email, role: req.session.user.role, id: req.session.user.id } : null });
});
export default router;
