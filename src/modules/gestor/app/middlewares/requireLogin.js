// (migrado) requireLogin.js
import mongoose from 'mongoose';
import User from '#models/user.js';
import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';

export const requireLogin = async (req, res, next) => { /* implementação original mantida + resposta JSON para API (ajustada para evitar loop em /login) */
  // Permitir bypass em suites de teste que não precisam de auth
  if (req.skipAuth) return next();
  // Helper para detectar erros transitórios de DB (timeouts/seleção de servidor)
  const isTransientDbError = (e) => {
    if (!e) return false;
    const name = String(e.name||'');
    const msg = String(e.message||'');
    const codeName = String(e.codeName||'');
    return (
      name.includes('MongoServerSelectionError') ||
      name.includes('MongooseServerSelectionError') ||
      codeName === 'MaxTimeMSExpired' ||
      /timed out|timeout|server selection/i.test(msg)
    );
  };
  const buildUserFromSession = (s) => ({
    _id: s.id || null,
    id: s.id || null,
    nome: s.nome || 'Usuário',
    email: s.email,
    role: s.role || 'user',
    isMaster: s.role === 'master',
    foto: s.foto || null,
    unidade_id: s.unidade_id || null,
    unidade_principal_id: s.unidade_principal_id || null,
    funcao: s.funcao || null
  });
  // Modo sem DB: não efetuar consultas a Mongo; confiar na sessão básica
  try {
    if (req.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
      const basePath = req.baseUrl || '';
      const path = req.path || req.originalUrl || '';
      const isLoginPath = path === '/login' || path === '/gestor/login';
      // Tratar como públicas as mesmas rotas consideradas no modo "full"
      const isPublicPath = (
        path.startsWith('/login') ||
        path.startsWith('/logout') ||
        path.startsWith('/esquecisenha') || path.startsWith('/esqueci-senha') ||
        path.startsWith('/reset-password') || path.startsWith('/contato') ||
        path.startsWith('/primeiroacesso') || path.startsWith('/gestor/primeiroacesso') ||
        path.startsWith('/css/') || path.startsWith('/js/') ||
        path.startsWith('/img/') || path.startsWith('/uploads/') || path.startsWith('/images/') ||
        path.startsWith('/api/recover')
      );
      if (!req.session || !req.session.user) {
        // API => JSON 401; páginas => redireciona para login
        const accept = (req.headers['accept'] || '').toLowerCase();
        const requestedWith = (req.headers['x-requested-with'] || '').toLowerCase();
        const original = req.originalUrl || '';
        const wantsJson = /\/api\//.test(original) || (accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest');
        if (wantsJson) return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
        if (isLoginPath || isPublicPath) return next();
        return res.redirect(basePath + '/login');
      }
      // Popular req.user mínimo a partir da sessão
      const s = req.session.user;
      req.user = buildUserFromSession(s);
      return next();
    }
  } catch(_) { /* segue fluxo normal */ }
  const path = req.path || req.originalUrl || '';
  // Detectar intenção JSON mesmo quando app está montado em /gestor (originalUrl começa com /gestor/...)
  const accept = (req.headers['accept'] || '').toLowerCase();
  const requestedWith = (req.headers['x-requested-with'] || '').toLowerCase();
  const original = req.originalUrl || '';
  // Quando montado em /gestor, originalUrl pode ser /gestor/api/recursos
  const isApiPath = path.startsWith('/api/'); // relativo dentro do sub-app
  const isApiOriginal = /\/api\//.test(original);
  const startsWithGestorApi = original.startsWith('/gestor/api/');
  const wantsJson = isApiPath || startsWithGestorApi || (isApiOriginal && (accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest'));
  // Bypass completo para módulo Escalas, que possui seu próprio fluxo e sessão (req.session.escalasUser)
  if (path.startsWith('/escalas')) return next();
  // Suporte a aliases prefixados /gestor/* (futura padronização). Consideramos públicas as mesmas rotas raiz.
  const isPrimeiroAcessoPath = path.startsWith('/primeiroacesso') || path.startsWith('/gestor/primeiroacesso');
  const basePath = req.baseUrl || '';
  const fullPath = basePath + path; // path já não inclui baseUrl
  const isAuthOrAsset = (
    path.startsWith('/login') || path.startsWith('/logout') ||
    path.startsWith('/esquecisenha') || path.startsWith('/esqueci-senha') ||
    path.startsWith('/reset-password') || path.startsWith('/contato') ||
    // Permitir acesso público ao formulário de primeiro acesso (GET) sem redirecionar ao login
    path.startsWith('/primeiroacesso') || path.startsWith('/gestor/primeiroacesso') ||
    path.startsWith('/css/') || path.startsWith('/js/') ||
    path.startsWith('/img/') || path.startsWith('/uploads/') || path.startsWith('/images/') ||
    path.startsWith('/api/recover')
  );
  const isLoginPath = path === '/login' || path === '/gestor/login';
  if (!req.session || !req.session.user) {
    // Páginas públicas devem seguir sem redirecionar (inclusive em modo full)
    const isPublicPath = (
      path.startsWith('/login') ||
      path.startsWith('/logout') ||
      path.startsWith('/esquecisenha') || path.startsWith('/esqueci-senha') ||
      path.startsWith('/reset-password') || path.startsWith('/contato') ||
      path.startsWith('/primeiroacesso') || path.startsWith('/gestor/primeiroacesso') ||
      path.startsWith('/css/') || path.startsWith('/js/') ||
      path.startsWith('/img/') || path.startsWith('/uploads/') || path.startsWith('/images/') ||
      path.startsWith('/api/recover')
    );
    if (wantsJson) {
      return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
    }
    // Evita loop: se já estamos em rota pública (ex.: login/primeiroacesso), não redirecionar
    if (isLoginPath || isPublicPath) return next();
    return res.redirect(basePath + '/login');
  }
  try {
    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    let user = null;
    try {
      user = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean().maxTimeMS(queryTimeout);
    } catch (e) {
      // Em timeouts/erros transitórios de DB, siga usando dados da sessão para evitar bounce pro login
      if (isTransientDbError(e)) {
        console.warn('[requireLogin] DB timeout/seleção — usando sessão como fallback para', req.session.user?.email);
        req.user = buildUserFromSession(req.session.user);
        return next();
      }
      throw e;
    }
    if (user) {
      // Enforcement de primeiro acesso ou senha provisória (exceto master, a menos que explicitamente configurado)
      const isMasterRole = user.role === 'master';
      const enforceMaster = process.env.ENFORCE_MASTER_FIRST_LOGIN === 'true';
      if (!isMasterRole && (user.primeiro_acesso || user.senha_provisoria) && !isPrimeiroAcessoPath && !isAuthOrAsset) {
  if (wantsJson) return res.status(403).json({ success:false, error:'FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED', code:'FIRST_LOGIN' });
  return res.redirect(basePath + '/primeiroacesso');
      }
      // Caso seja master e flags estejam setadas por engano, limpamos silenciosamente em memória (não persiste ainda)
      if (isMasterRole && (user.primeiro_acesso || user.senha_provisoria) && !enforceMaster) {
        user.primeiro_acesso = false; user.senha_provisoria = false;
      }
      let unidadeId = user.unidade_id || null; let unidadePrincipalId = null;
  if (user.role === 'master' && !unidadeId) { try { const unidadePrincipal = await Unidade.findOne({ is_principal: true }).lean().maxTimeMS(queryTimeout); if (unidadePrincipal) { unidadeId = unidadePrincipal._id; unidadePrincipalId = unidadePrincipal._id; } } catch {}
  } else if (unidadeId) { try { const unidadeDoc = await Unidade.findById(unidadeId).lean().maxTimeMS(queryTimeout); if (unidadeDoc) { unidadePrincipalId = unidadeDoc.is_principal ? unidadeDoc._id : (unidadeDoc.unidade_principal_id || null); } } catch {} }
  req.user = { _id: user._id, id: user._id, nome: user.nome || req.session.user.nome || 'Usuário', email: user.email, role: user.role, isMaster: user.role === 'master', foto: user.foto || null, funcionario_id: user.funcionario_id || null, unidade_id: unidadeId, unidade_principal_id: unidadePrincipalId, funcao: req.session.user.funcao || null };
      req.session.user.unidade_id = unidadeId; req.session.user.unidade_principal_id = unidadePrincipalId; if (user.foto) req.session.user.foto = user.foto;
  console.log('[requireLogin] autenticado', { email: user.email, role: user.role, isMaster: (user.role === 'master') });
      return next();
    }
  let funcionario = null;
  try {
    funcionario = await Funcionario.findOne({ email: req.session.user.email.toLowerCase() }).populate('unidade_id funcao_id').maxTimeMS(queryTimeout);
  } catch (e) {
    if (isTransientDbError(e)) {
      console.warn('[requireLogin] DB timeout ao buscar Funcionario — usando sessão como fallback para', req.session.user?.email);
      req.user = buildUserFromSession(req.session.user);
      return next();
    }
    throw e;
  }
  if (!funcionario) return res.redirect(basePath + '/login');
    // Funcionário autenticado não passa por fluxo de primeiro acesso de usuário
  req.user = { _id: funcionario._id, id: funcionario._id, nome: funcionario.nome || 'Usuário', email: funcionario.email, foto: funcionario.foto || null, unidade_id: funcionario.unidade_id ? funcionario.unidade_id._id : null, unidade_principal_id: funcionario.unidade_id && funcionario.unidade_id.is_principal ? funcionario.unidade_id._id : (funcionario.unidade_id && funcionario.unidade_id.unidade_principal_id) || null, funcao: funcionario.funcao_id ? funcionario.funcao_id.nome : null, isMaster: false, role: 'user' };
    return next();
  } catch (e) {
  // Em caso de erro inesperado: se for transitório, usar sessão; senão, não gerar loop se já estamos em /login
  if (isTransientDbError(e) && req.session?.user) {
    try { console.warn('[requireLogin] erro transitório — fallback para sessão:', e.message); } catch{}
    req.user = buildUserFromSession(req.session.user);
    return next();
  }
  if (isLoginPath) return next();
  return res.redirect(basePath + '/login');
  }
};
export default requireLogin;
