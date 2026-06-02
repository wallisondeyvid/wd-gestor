// (migrado) pagesRouter.js
import express from 'express';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { isPrivilegedGestorContext, requireUnitScope } from '#modules/gestor/app/middlewares/requireUnitScope.js';
import { paginaDashboard, paginaLogin, paginaContato, paginaPrimeiroAcesso, paginaEsqueciSenha, paginaErro, paginaUsuarios, paginaUnidades, paginaEditarUnidade, paginaModulos, paginaFuncoes, paginaFuncionarios, paginaRecursos, partialEndereco, paginaSetores, paginaFeedback } from '#modules/gestor/app/controllers/views/pagesController.js';
// Wrapper inline para advanced recovery (reutiliza template compartilhado)
function paginaEsqueciSenhaAvancada(req,res){
	const basePath = req.urlBasePath || '';
	return res.render('gestor/esquecisenha-avancada', { basePath, moduleLabel: 'WDGestor' });
}

function isPrivilegedGestorRequest(req) {
	return isPrivilegedGestorContext({
		user: req?.user || null,
		sessionUser: req?.session?.user || null,
		authContext: req?.session?.gestorAuthContext || null,
	});
}

function requireGestorMasterOrAdmin(req, res, next) {
	if (isPrivilegedGestorRequest(req)) {
		return next();
	}

	return res.status(403).send('Acesso negado');
}

function hasCanonicalUnitContext(req) {
	return Boolean(
		req?.session?.gestorAuthContext?.active_unidade_id
		|| req?.query?.unidadeId
		|| req?.query?.unidade_id
		|| req?.params?.unidadeId
		|| req?.params?.unidade_id
		|| req?.body?.unidadeId
		|| req?.body?.unidade_id
	);
}

function withLoginAndRequiredUnitScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => requireUnitScope(req, res, () => handler(req, res, next)));
}

function withLoginAndUnidadesScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

function withLoginAndFuncoesScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

function withLoginAndFuncionariosScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

function withLoginAndRecursosScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
}

function withLoginAndSetoresScope(handler) {
	return (req, res, next) => requireLogin(req, res, () => {
		if (isPrivilegedGestorRequest(req) && !hasCanonicalUnitContext(req)) {
			return handler(req, res, next);
		}

		return requireUnitScope(req, res, () => handler(req, res, next));
	});
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
router.get('/unidades', withLoginAndUnidadesScope(paginaUnidades));
router.get('/editar-unidades/:id', withLoginAndRequiredUnitScope(paginaEditarUnidade));
router.get('/modulos', requireLogin, requireGestorMasterOrAdmin, paginaModulos);
router.get('/funcoes', withLoginAndFuncoesScope(paginaFuncoes));
router.get('/funcionarios', withLoginAndFuncionariosScope(paginaFuncionarios));
router.get('/recursos', withLoginAndRecursosScope(paginaRecursos));
router.get('/setores', withLoginAndSetoresScope(paginaSetores));
router.get('/endereco', partialEndereco);
router.get('/erro', paginaErro);
// Debug: quem sou eu (para validar isMaster/role)
router.get('/api/debug/whoami', (req,res)=>{
	res.json({ ok:true, user: req.user || null, session: req.session && req.session.user ? { email: req.session.user.email, role: req.session.user.role, id: req.session.user.id } : null });
});
export default router;
