// (migrado) requireLogin.js
import mongoose from 'mongoose';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import {
  findFuncionarioByIdPopulate,
  findUnidadeLeanById,
  findUnidadePrincipalLean,
  findUserLeanByEmail,
} from '#modules/gestor/app/db/auth.db.js';
import {
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
  hasPendingAuthUnitSelection,
} from '#modules/gestor/app/services/authContextResolver.js';
import {
  classifyRequireLoginEntry,
  REQUIRE_LOGIN_ENTRY_REASON,
} from '#modules/gestor/app/services/auth/classifyRequireLoginEntry.service.js';
import { resolveRequireLoginCanonicalResolvedUser } from '#modules/gestor/app/services/auth/resolveRequireLoginCanonicalResolvedUser.service.js';
import { resolveRequireLoginLegacyHydration } from '#modules/gestor/app/services/auth/resolveRequireLoginLegacyHydration.service.js';

export const requireLogin = async (req, res, next) => { /* implementação original mantida + resposta JSON para API (ajustada para evitar loop em /login) */
  // Permitir bypass em suites de teste que não precisam de auth
  if (req.skipAuth) return next();
  const headers = req?.headers || {};
  const resolvedPath = req.path || req.originalUrl || '';
  const resolvedBasePath = req.baseUrl || '';
  const resolvedOriginal = req.originalUrl || '';
  const acceptHeader = (headers['accept'] || '').toLowerCase();
  const requestedWithHeader = (headers['x-requested-with'] || '').toLowerCase();
  const isNodeTest = String(process.env.NODE_ENV || '').toLowerCase() === 'test' || process.argv.includes('--test');
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
  const sessionAuthContext = req.session?.gestorAuthContext;
  const resolveCanonicalSessionUnidadeId = (sessionUser) => (
    sessionAuthContext?.active_unidade_id || sessionUser?.unidade_id || null
  );
  const resolveCanonicalSessionFuncionarioId = (sessionUser) => (
    sessionAuthContext?.active_funcionario_id || sessionUser?.funcionario_id || null
  );
  const buildUserFromSession = (s) => {
    const fallbackRole = isNodeTest ? 'master' : 'user';
    const role = s.role || fallbackRole;
    return ({
    _id: s.id || null,
    id: s.id || null,
    nome: s.nome || 'Usuário',
    email: s.email,
    role,
    global_role: s.global_role || null,
    isMaster: role === 'master',
    foto: s.foto || null,
    funcionario_id: resolveCanonicalSessionFuncionarioId(s),
    unidade_id: resolveCanonicalSessionUnidadeId(s),
    unidade_principal_id: s.unidade_principal_id || null,
    funcao: s.funcao || null
  });
  };
  const isAuthContextSelectionGuardEnabled = () => {
    const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
    if (featureFlags && typeof featureFlags === 'object') {
      return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
    }
    return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  };
  const shouldBypassPendingSelectionGuard = () => {
    const isApiUsuarioPath = resolvedPath === '/api/usuario' || resolvedPath.startsWith('/api/usuario/');
    const isApiModulosPath = resolvedPath === '/api/modulos' || resolvedPath.startsWith('/api/modulos/');

    return (
      resolvedPath.startsWith('/login') ||
      resolvedPath.startsWith('/logout') ||
      resolvedPath.startsWith('/auth/context') ||
      resolvedPath.startsWith('/auth/select-unit') ||
      resolvedPath.startsWith('/auth/switch-unit') ||
      isApiUsuarioPath ||
      isApiModulosPath
    );
  };
  const isPendingSelectionApiRequest = (
    resolvedPath.startsWith('/api/') ||
    resolvedOriginal.startsWith('/gestor/api/') ||
    (/\/api\//.test(resolvedOriginal) && (acceptHeader.includes('application/json') || requestedWithHeader === 'fetch' || requestedWithHeader === 'xmlhttprequest'))
  );
  const enforcePendingSelectionGuard = () => {
    const decision = classifyRequireLoginEntry({
      stage: 'pending-selection',
      hasSessionUser: Boolean(req.session?.user),
      hasPendingSelection: isAuthContextSelectionGuardEnabled() && hasPendingAuthUnitSelection(req.session?.gestorAuthContext),
      shouldBypassPendingSelectionGuard: shouldBypassPendingSelectionGuard(),
    });

    if (decision.reason !== REQUIRE_LOGIN_ENTRY_REASON.SELECTION_REQUIRED) {
      return false;
    }

    const redirectBasePath = resolvedBasePath.endsWith('/api')
      ? resolvedBasePath.slice(0, -4)
      : resolvedBasePath;
    const redirect = `${redirectBasePath}/login?step=select`;
    if (isPendingSelectionApiRequest) {
      res.status(409).json({
        success: false,
        authenticated: true,
        error: 'Seleção de unidade pendente',
        code: 'GESTOR_SELECTION_REQUIRED',
        needsUnitSelection: true,
        redirect,
      });
      return true;
    }

    res.redirect(redirect);
    return true;
  };
  if (enforcePendingSelectionGuard()) return;
  // Modo sem DB: não efetuar consultas a Mongo; confiar na sessão básica
  try {
    const shouldUseNoDbFallback = req.app?.locals?.skipDb || (!!req.app && mongoose.connection.readyState !== 1 && !isNodeTest);
    if (shouldUseNoDbFallback) {
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
      const routeAccessDecision = classifyRequireLoginEntry({
        stage: 'route-access',
        hasSessionUser: Boolean(req.session?.user),
        isLoginPath,
        isPublicPath,
        isEscalasPath: false,
      });

      if (routeAccessDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.UNAUTHENTICATED) {
        // API => JSON 401; páginas => redireciona para login
        const accept = (headers['accept'] || '').toLowerCase();
        const requestedWith = (headers['x-requested-with'] || '').toLowerCase();
        const original = req.originalUrl || '';
        const wantsJson = /\/api\//.test(original) || (accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest');
        if (wantsJson) return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
        return res.redirect(basePath + '/login');
      }
      if (routeAccessDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.PUBLIC_ROUTE) return next();
      // Popular req.user mínimo a partir da sessão
      const s = req.session.user;
      req.user = buildUserFromSession(s);
      return next();
    }
  } catch(_) { /* segue fluxo normal */ }
  const path = req.path || req.originalUrl || '';
  // Detectar intenção JSON mesmo quando app está montado em /gestor (originalUrl começa com /gestor/...)
  const accept = (headers['accept'] || '').toLowerCase();
  const requestedWith = (headers['x-requested-with'] || '').toLowerCase();
  const original = req.originalUrl || '';
  // Quando montado em /gestor, originalUrl pode ser /gestor/api/recursos
  const isApiPath = path.startsWith('/api/'); // relativo dentro do sub-app
  const isApiOriginal = /\/api\//.test(original);
  const startsWithGestorApi = original.startsWith('/gestor/api/');
  const wantsJson = isApiPath || startsWithGestorApi || (isApiOriginal && (accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest'));
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
  const routeAccessDecision = classifyRequireLoginEntry({
    stage: 'route-access',
    hasSessionUser: Boolean(req.session?.user),
    isLoginPath,
    isPublicPath: isAuthOrAsset,
    isEscalasPath: path.startsWith('/escalas'),
  });
  if (routeAccessDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.ESCALAS_BYPASS) return next();
  if (routeAccessDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.UNAUTHENTICATED) {
    // Páginas públicas devem seguir sem redirecionar (inclusive em modo full)
    if (wantsJson) {
      try { console.warn('[requireLogin] 401 (sem sessão)', { original, path, basePath, accept: String(headers['accept']||''), referer: String(req.get?.('referer')||'') }); } catch {}
      return res.status(401).json({ success:false, error:'Não autenticado', code:'UNAUTHORIZED' });
    }
    try { console.warn('[requireLogin] redirect login (sem sessão)', { original, path, basePath, referer: String(req.get?.('referer')||'') }); } catch {}
    return res.redirect(basePath + '/login');
  }
  if (routeAccessDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.PUBLIC_ROUTE) return next();
  try {
    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    let user = null;
    try {
      user = await findUserLeanByEmail({
        email: req.session.user.email.toLowerCase(),
        maxTimeMS: queryTimeout,
      });
    } catch (e) {
      // Em timeouts/erros transitórios de DB, siga usando dados da sessão para evitar bounce pro login
      const transientErrorDecision = classifyRequireLoginEntry({
        stage: 'transient-error',
        hasTransientError: isTransientDbError(e),
        hasSessionUser: Boolean(req.session?.user),
      });
      if (transientErrorDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK) {
        console.warn('[requireLogin] DB timeout/seleção — usando sessão como fallback para', req.session.user?.email);
        req.user = buildUserFromSession(req.session.user);
        return next();
      }
      throw e;
    }
    const resolvedUserDecision = classifyRequireLoginEntry({
      stage: 'resolved-user',
      hasUser: Boolean(user),
      requiresFirstAccess: Boolean(
        user &&
        user.role !== 'master' &&
        (user.primeiro_acesso || user.senha_provisoria) &&
        !isPrimeiroAcessoPath &&
        !isAuthOrAsset
      ),
    });
    if (resolvedUserDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.FIRST_ACCESS_REQUIRED) {
      if (wantsJson) {
        try { console.warn('[requireLogin] 403 FIRST_LOGIN (api)', { original, path, basePath, email: user.email }); } catch {}
        return res.status(403).json({ success:false, error:'FIRST_LOGIN_PASSWORD_CHANGE_REQUIRED', code:'FIRST_LOGIN' });
      }
      try { console.warn('[requireLogin] redirect primeiroacesso (FIRST_LOGIN)', { original, path, basePath, email: user.email }); } catch {}
      return res.redirect(basePath + '/primeiroacesso');
    }
    if (resolvedUserDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.AUTHENTICATED_USER) {
      // Enforcement de primeiro acesso ou senha provisória (exceto master, a menos que explicitamente configurado)
      const isMasterRole = user.role === 'master';
      const enforceMaster = process.env.ENFORCE_MASTER_FIRST_LOGIN === 'true';
      // Caso seja master e flags estejam setadas por engano, limpamos silenciosamente em memória (não persiste ainda)
      if (isMasterRole && (user.primeiro_acesso || user.senha_provisoria) && !enforceMaster) {
        user.primeiro_acesso = false; user.senha_provisoria = false;
      }
      if (isAuthContextSelectionGuardEnabled() && req.session?.gestorAuthContext) {
        try {
          const canonicalResolvedUser = await resolveRequireLoginCanonicalResolvedUser({
            user,
            sessionUser: req.session.user,
            existingAuthContext: req.session.gestorAuthContext,
            featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
            deps: req.app?.locals?.gestorAuthContextResolverDeps || {},
            maxTimeMS: Number(req.app?.locals?.gestorAuthContextMaxTimeMS || queryTimeout),
          });

          if (canonicalResolvedUser.kind === 'authenticated') {
            req.session.user = canonicalResolvedUser.sessionUser;
            req.user = canonicalResolvedUser.reqUser;
            console.log('[requireLogin] autenticado', { email: req.user.email, role: req.user.role, isMaster: req.user.isMaster });
            return next();
          }
        } catch (e) {
          const transientErrorDecision = classifyRequireLoginEntry({
            stage: 'transient-error',
            hasTransientError: isTransientDbError(e),
            hasSessionUser: Boolean(req.session?.user),
          });
          if (transientErrorDecision.reason !== REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK) throw e;
          console.warn('[requireLogin] auth-context resolver transitório — usando fallback legado para', req.session.user?.email);
        }
      }
      const legacyHydration = await resolveRequireLoginLegacyHydration({
        user,
        sessionUser: req.session.user,
        maxTimeMS: queryTimeout,
        loadUnidadePrincipalLean: findUnidadePrincipalLean,
        loadUnidadeLeanById: findUnidadeLeanById,
      });
      req.user = legacyHydration.reqUser;
      if (legacyHydration.sessionUserPatch) {
        req.session.user = {
          ...(req.session.user || {}),
          ...legacyHydration.sessionUserPatch,
        };
      }
  console.log('[requireLogin] autenticado', { email: user.email, role: user.role, isMaster: (user.role === 'master') });
      return next();
    }
  const sessionFuncionarioId = req.session.user?.funcionario_id || null;
  const hasReliableFuncionarioId = !!(sessionFuncionarioId && mongoose.isValidObjectId(String(sessionFuncionarioId)));
  const missingFuncionarioDecision = classifyRequireLoginEntry({
    stage: 'funcionario-fallback',
    hasReliableFuncionarioId,
  });
  if (missingFuncionarioDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.LOGIN_REQUIRED) {
    try { console.warn('[requireLogin] redirect login (sem funcionario_id confiável no fallback)', { original, path, basePath, email: req.session?.user?.email, funcionario_id: sessionFuncionarioId }); } catch {}
    return res.redirect(basePath + '/login');
  }

  let funcionario = null;
  try {
    funcionario = await findFuncionarioByIdPopulate({
      id: sessionFuncionarioId,
      maxTimeMS: queryTimeout,
    });
  } catch (e) {
    const transientErrorDecision = classifyRequireLoginEntry({
      stage: 'transient-error',
      hasTransientError: isTransientDbError(e),
      hasSessionUser: Boolean(req.session?.user),
    });
    if (transientErrorDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK) {
      console.warn('[requireLogin] DB timeout ao buscar Funcionario por funcionario_id — usando sessão como fallback para', req.session.user?.email);
      req.user = buildUserFromSession(req.session.user);
      return next();
    }
    throw e;
  }
  const funcionarioFallbackDecision = classifyRequireLoginEntry({
    stage: 'funcionario-fallback',
    hasReliableFuncionarioId,
    hasFuncionario: Boolean(funcionario),
  });
  if (funcionarioFallbackDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.LOGIN_REQUIRED) {
    try { console.warn('[requireLogin] redirect login (funcionario fallback não encontrado)', { original, path, basePath, email: req.session?.user?.email, funcionario_id: sessionFuncionarioId }); } catch {}
    return res.redirect(basePath + '/login');
  }
    // Funcionário autenticado não passa por fluxo de primeiro acesso de usuário
  req.user = { _id: funcionario._id, id: funcionario._id, nome: funcionario.nome || 'Usuário', email: funcionario.email, foto: funcionario.foto || null, unidade_id: funcionario.unidade_id ? funcionario.unidade_id._id : null, unidade_principal_id: funcionario.unidade_id && funcionario.unidade_id.is_principal ? funcionario.unidade_id._id : (funcionario.unidade_id && funcionario.unidade_id.unidade_principal_id) || null, funcao: funcionario.funcao_id ? funcionario.funcao_id.nome : null, isMaster: false, role: 'user' };
    return next();
  } catch (e) {
  // Em caso de erro inesperado: se for transitório, usar sessão; senão, não gerar loop se já estamos em /login
  const transientErrorDecision = classifyRequireLoginEntry({
    stage: 'transient-error',
    hasTransientError: isTransientDbError(e),
    hasSessionUser: Boolean(req.session?.user),
  });
  if (transientErrorDecision.reason === REQUIRE_LOGIN_ENTRY_REASON.SESSION_FALLBACK) {
    try { console.warn('[requireLogin] erro transitório — fallback para sessão:', e.message); } catch{}
    req.user = buildUserFromSession(req.session.user);
    return next();
  }
  if (isLoginPath) return next();
  try { console.warn('[requireLogin] redirect login (erro inesperado)', { original, path, basePath, err: e?.message || String(e) }); } catch {}
  return res.redirect(basePath + '/login');
  }
};
export default requireLogin;
