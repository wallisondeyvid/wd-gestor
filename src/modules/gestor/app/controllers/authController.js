import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import { resetPasswordTemplate } from '#core/mail/templates/resetPassword.js';
import {
  createPasswordReset,
  createRememberToken,
  deletePasswordResetById,
  findFuncaoByIdSelect,
  findFuncionarioByIdSelect,
  findFuncionariosByCpfSelect,
  findModuloByOr,
  findModuloLeanByOrSelect,
  findPasswordResetByToken,
  findUnidadeByIdSelect,
  findUserByEmail,
  findUserByEmailForLogin,
  findUserByIdSelect,
  findUserByIdWithMaxTime,
  findUsersByCpf,
  findUsersByFuncionarioIds,
  revokeRememberTokenByHash,
  saveUserDocument,
} from '#modules/gestor/app/services/authDbBridgeService.js';
import {
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
  resolveGestorAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';
import { primeiroAcessoExecutionService } from '#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js';
import { mutateAuthUnitContextService } from '#modules/gestor/app/services/auth/mutateAuthUnitContext.service.js';
import { resolveLoginPostAuthContext } from '#modules/gestor/app/services/auth/resolveLoginPostAuthContext.service.js';

// -----------------------------------------------------------------------------
// Helper de Autorização de Módulo
// Regras solicitadas:
//  - master: acesso irrestrito
//  - admin: acesso irrestrito
//  - diretor: acesso liberado se o módulo alvo estiver em modulosAcessiveis da unidade do usuário
//  - user: precisa ter uma função associada (funcao_id via funcionario?) e a função conter o módulo em modulos_habilitados
//          além disso, módulo também deve estar habilitado na unidade (defesa em profundidade)
//  - user sem função: nenhum acesso
// Parametros:
//   userDoc  -> documento de usuário já carregado
//   moduloAlvoNome -> string (ex: 'gestor')
// Retorno: { permitido: boolean, motivo?: string }
// -----------------------------------------------------------------------------
function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verificarAcessoModulo({ userDoc, moduloAlvoNome, basePath, authContext = null }) {
  try {
    if (!userDoc) return { permitido: false, motivo: 'usuario_invalido' };
    if (!moduloAlvoNome) return { permitido: false, motivo: 'modulo_nao_informado' };

    const role = userDoc.role;
    if (role === 'master' || role === 'admin') {
      return { permitido: true };
    }

    // Localiza módulo alvo de forma resiliente:
    // - nome (normalmente um "slug" como gestor/condominios)
    // - ou url_base (ex.: /condominios) para bases onde "nome" é descritivo (ex.: "Gestão de Condomínios")
    const nomeRx = new RegExp('^' + escapeRegex(moduloAlvoNome) + '$', 'i');
    const or = [{ nome: nomeRx }];
    const bp = String(basePath || '').trim();
    if (bp) or.push({ url_base: bp });
    // fallback comum: url_base derivado do nome
    if (moduloAlvoNome && !String(moduloAlvoNome).startsWith('/')) {
      or.push({ url_base: '/' + String(moduloAlvoNome).trim() });
    }
    // compat: portal_morador vs portal-morador
    if (String(moduloAlvoNome).toLowerCase() === 'portal_morador') {
      or.push({ nome: /^portal-morador$/i });
      or.push({ url_base: '/portal-morador' });
    }
    // compat: bases antigas usam nome descritivo para Condomínios
    const alvoLower = String(moduloAlvoNome || '').trim().toLowerCase();
    if (alvoLower === 'condominios' || alvoLower === 'condominio') {
      or.push({ nome: /^condom[ií]nios$/i });
      or.push({ nome: /^gest[aã]o de condom[ií]nios$/i });
      or.push({ nome: /^m[oó]dulo condom[ií]nios$/i });
    }
    const modulo = await findModuloByOr({
      or,
      maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
    });
    if (!modulo) return { permitido: false, motivo: 'modulo_inexistente' };

    // Diretor: checa se unidade do usuário possui esse módulo em modulosAcessiveis
    if (role === 'diretor') {
      const unidadeIdCanonica = authContext?.source === 'auth-context-v1'
        ? (authContext.activeContext?.unidadeId || authContext.active_unidade_id || null)
        : null;
      const unidadeIdEfetiva = unidadeIdCanonica || userDoc.unidade_id || null;
      if (!unidadeIdEfetiva) return { permitido: false, motivo: 'diretor_sem_unidade' };
      const unidade = await findUnidadeByIdSelect({
        id: unidadeIdEfetiva,
        select: 'modulosAcessiveis',
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
      });
      if (!unidade) return { permitido: false, motivo: 'unidade_inexistente' };
      const possui = unidade.modulosAcessiveis?.some(m => m.toString() === modulo._id.toString());
      return possui ? { permitido: true } : { permitido: false, motivo: 'modulo_nao_habilitado_unidade' };
    }

    if (role === 'user') {
      // Recupera funcionário para obter função (assumindo relacionamento via funcionario_id)
      if (!userDoc.funcionario_id) return { permitido: false, motivo: 'user_sem_funcionario' };
      const funcionario = await findFuncionarioByIdSelect({
        id: userDoc.funcionario_id,
        select: 'funcao_id unidade_id',
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
      });
      if (!funcionario) return { permitido: false, motivo: 'funcionario_inexistente' };
      if (!funcionario.funcao_id) return { permitido: false, motivo: 'user_sem_funcao' };
      const funcao = await findFuncaoByIdSelect({
        id: funcionario.funcao_id,
        select: 'modulos_habilitados ativa',
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
      });
      if (!funcao || funcao.ativa === false) return { permitido: false, motivo: 'funcao_inativa' };
      const moduloNaFuncao = funcao.modulos_habilitados?.some(m => m.toString() === modulo._id.toString());
      if (!moduloNaFuncao) return { permitido: false, motivo: 'modulo_nao_habilitado_funcao' };

      // (Defesa adicional) Confere unidade vinculada ao funcionário, se existir, também possuir módulo
      if (funcionario.unidade_id) {
        const unidade = await findUnidadeByIdSelect({
          id: funcionario.unidade_id,
          select: 'modulosAcessiveis',
          maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
        });
        if (unidade) {
          const moduloUnidade = unidade.modulosAcessiveis?.some(m => m.toString() === modulo._id.toString());
          if (!moduloUnidade) return { permitido: false, motivo: 'modulo_nao_habilitado_unidade' };
        }
      }
      return { permitido: true };
    }

    return { permitido: false, motivo: 'role_desconhecida' };
  } catch (e) {
    console.error('[verificarAcessoModulo] erro:', e.message);
    return { permitido: false, motivo: 'erro_interno' };
  }
}

// -----------------------------------------------------------------------------
// Login Lockout (proteção contra força bruta)
// Variáveis de ambiente suportadas:
//   LOGIN_MAX_ATTEMPTS   -> número máximo de tentativas de senha incorreta antes de bloquear (default 5)
//   LOGIN_LOCK_MINUTES   -> duração do bloqueio em minutos (default 15)
//   ENFORCE_MASTER_FIRST_LOGIN -> se 'true', força usuário master a passar pelo fluxo de primeiro acesso
//   LOGIN_FAILED_DELAY_BASE_MS -> atraso base (ms) após falha de senha (default 150)
//   LOGIN_FAILED_DELAY_MAX_MS  -> atraso máximo acumulado (default 3000)
//   BCRYPT_MIN_ROUNDS         -> custo mínimo aceito para hash; se hash atual menor, rehash no login (default 12)
// Campos no modelo User:
//   failed_login_attempts: Number (conta tentativas consecutivas com falha)
//   lock_until: Date (se definido no futuro, impede login até expirar)
// Regras:
//   - Ao exceder tentativas, define lock_until = agora + LOGIN_LOCK_MINUTES
//   - Em sucesso: zera failed_login_attempts e limpa lock_until
//   - Se lock_until > agora: rejeita login com erro=bloqueado
// -----------------------------------------------------------------------------

function resolveAppUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  if (isVercel && /localhost/i.test(raw)) raw = '';
  if (!raw && vercelDomain) raw = vercelDomain;
  if (raw) {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/$/, '');
  }
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

export async function checkUserStatus(req, res, next) {
  try {
    const body = req.body || {};
    const rawEmail = body.email || body.usuario;
    if (!rawEmail) return next();
  let email = String(rawEmail).toLowerCase();
  email = String(rawEmail).trim().toLowerCase();
    // Se DB não está conectado, não tentar consultar
    if (req?.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
      return next();
    }
    const user = await findUserByEmail({ email });
  const basePath = req.baseUrl || '';
  if (user && user.ativo === false) return res.redirect(basePath + '/login?erro=suspenso');
    next();
  } catch (e) {
    console.error('[checkUserStatus] erro:', e.message);
    next();
  }
}

export async function login(req, res) {
  try {
    const basePath = req.baseUrl || '';
    const body = req.body || {};
    const senha = body.senha;
    const rawEmail = body.email || body.usuario;
    const lembrar = body.lembrar; // checkbox
    // Permitimos informar alvo do módulo via hidden input ou query (ex: modulo=gestor)
    const moduloAlvo = body.modulo || req.query.modulo || 'gestor';
  let email = rawEmail ? String(rawEmail).toLowerCase() : '';
  email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
  if (!email || !senha) return res.redirect(303, basePath + '/login?erro=usuario');
    // Se DB não está conectado, responder imediatamente para evitar timeout longo
    if (req?.app?.locals?.skipDb || mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
  return res.redirect(303, basePath + '/login?erro=servidor');
    }
    // Consulta com tempo máximo limitado para não estourar o tempo da função serverless
    let user = null;
    try {
      user = await findUserByEmailForLogin({
        email: email.toLowerCase(),
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
      });
    } catch(qe){
      console.warn('[login] timeout/erro find user:', qe.message);
      return res.redirect(303, basePath + '/login?erro=servidor');
    }
  if (!user) return res.redirect(303, basePath + '/login?erro=usuario');
  if (!user.ativo) return res.redirect(303, basePath + '/login?erro=suspenso');

    // --- BLOQUEIO POR TENTATIVAS ---
  const maxTentativas = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
  const lockMinutos = Number(process.env.LOGIN_LOCK_MINUTES || 15);
    const agora = new Date();
  const isMasterRole = user.role === 'master' || user.global_role === 'master';
  const masterBypassLockout = (process.env.MASTER_BYPASS_LOCKOUT || 'true').toLowerCase() !== 'false';
  if (user.lock_until && user.lock_until > agora && !(isMasterRole && masterBypassLockout)) {
      // Usuário ainda bloqueado
      const minutosRestantes = Math.ceil((user.lock_until.getTime() - agora.getTime()) / 60000);
      console.warn('[login] tentativa durante bloqueio', { email: user.email, ate: user.lock_until });
      const retrySeconds = Math.max(1, Math.ceil((user.lock_until.getTime() - agora.getTime()) / 1000));
      res.setHeader('Retry-After', retrySeconds);
      res.setHeader('X-Account-Lock-Until', user.lock_until.toISOString());
      res.setHeader('X-Account-Lock-Seconds', String(retrySeconds));
    res.setHeader('X-Account-Lock-Minutes', String(minutosRestantes));
  return res.redirect(303, basePath + '/login?erro=bloqueado&min=' + minutosRestantes);
    } else if (user.lock_until && user.lock_until <= agora) {
      // Expirou bloqueio -> reset
      user.lock_until = null;
      user.failed_login_attempts = 0;
      try { await saveUserDocument(user); } catch(e) { console.warn('[login] falha ao resetar bloqueio expirado:', e.message); }
    }

  let ok = false;
  try {
    ok = await bcrypt.compare(senha, user.senha || '');
  } catch (cmpErr) {
    console.warn('[login] falha ao comparar senha (bcrypt):', cmpErr.message);
    ok = false; // trata como senha incorreta
  }
    if (!ok) {
      // Log leve para diagnóstico (sem vazar senha): e-mail e contagem de tentativa atual
      try { console.warn('[login] senha incorreta', { email: user.email, attempts_next: (user.failed_login_attempts||0) + 1 }); } catch {}
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
      const baseDelay = Number(process.env.LOGIN_FAILED_DELAY_BASE_MS || 150);
      const maxDelay = Number(process.env.LOGIN_FAILED_DELAY_MAX_MS || 3000);
      // Atraso exponencial leve: baseDelay * tentativas (limitado)
      const delay = Math.min(baseDelay * user.failed_login_attempts, maxDelay);
      if (user.failed_login_attempts >= maxTentativas && !(isMasterRole && masterBypassLockout)) {
        user.lock_until = new Date(Date.now() + lockMinutos * 60000);
        try { await saveUserDocument(user); } catch(e) { console.warn('[login] falha ao salvar bloqueio:', e.message); }
        console.warn('[login] usuario bloqueado por tentativas', { email: user.email, lock_until: user.lock_until, attempts: user.failed_login_attempts });
        // Pequeno atraso também antes de responder bloqueado para uniformizar timing
        if (delay) await new Promise(r => setTimeout(r, delay));
        const lockMinutes = Math.ceil((user.lock_until.getTime() - Date.now()) / 60000);
        const lockSeconds = Math.ceil((user.lock_until.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', lockSeconds);
        res.setHeader('X-Account-Lock-Until', user.lock_until.toISOString());
        res.setHeader('X-Account-Lock-Seconds', String(lockSeconds));
        res.setHeader('X-Account-Lock-Minutes', String(lockMinutes));
  return res.redirect(303, basePath + '/login?erro=bloqueado&min=' + lockMinutes);
      } else {
        try { await saveUserDocument(user); } catch(e) { console.warn('[login] falha ao salvar tentativa falhada:', e.message); }
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
      // Headers de tentativas restantes antes do bloqueio
      const restantes = (isMasterRole && masterBypassLockout)
        ? maxTentativas
        : Math.max(0, maxTentativas - user.failed_login_attempts);
      res.setHeader('X-Account-Attempts-Used', String(user.failed_login_attempts));
      res.setHeader('X-Account-Attempts-Remaining', String(restantes));
      res.setHeader('X-Account-Attempts-Limit', String(maxTentativas));
  return res.redirect(303, basePath + '/login?erro=senha&restantes=' + restantes);
    }
    // Sucesso: reset contadores se necessário
    if (user.failed_login_attempts || user.lock_until) {
      user.failed_login_attempts = 0;
      user.lock_until = null;
      try { await saveUserDocument(user); } catch(e) { console.warn('[login] falha ao resetar lockout:', e.message); }
    }

    // Mitigação de fixation: regenerar sessão antes de atribuir dados
    try {
      await new Promise((resolve, reject) => {
        req.session.regenerate(err => {
          if (err) {
            console.warn('[login] session regenerate error:', err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (e) {
      console.warn('[login] session regenerate failed, continuing without:', e.message);
      // Continue without regenerating, as it's not critical for provisional users
    }

    console.log('[login] autenticado', { id: user._id.toString(), primeiro_acesso: user.primeiro_acesso, senha_provisoria: user.senha_provisoria, role: user.role });
    clearGestorAuthContextSession(req);
    req.session.user = {
      id: user._id.toString(),
      email: user.email
    };
    let effectiveLoginUser = user;
    let resolvedLoginAuthContext = null;

    const loginPostAuthContextResult = await resolveLoginPostAuthContext({
      authenticatedUser: user,
      session: req.session,
      resolverEnabled: isAuthContextResolverEnabledForRequest(req),
      featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
      deps: req.app?.locals?.gestorAuthContextResolverDeps || undefined,
      maxTimeMS: req.app?.locals?.gestorAuthContextMaxTimeMS,
    });

    resolvedLoginAuthContext = loginPostAuthContextResult.resolvedAuthContext;
    if (loginPostAuthContextResult.kind === 'no-context') {
      await saveSessionSafe(req);
      return res.redirect(303, basePath + '/login?erro=contexto');
    }

    if (loginPostAuthContextResult.kind === 'needs-selection') {
      await saveSessionSafe(req);
      return res.redirect(303, basePath + '/login?step=select');
    }

    effectiveLoginUser = loginPostAuthContextResult.effectiveLoginUser;

    // Importante: garantir persistência da sessão antes de redirecionar.
    // Em alguns cenários (principalmente com session store remoto + redirect), a gravação pode atrasar.
    const saveSessionAfterLogin = async () => {
      try {
        if (!req.session || typeof req.session.save !== 'function') return;
        await new Promise((resolve) => req.session.save(() => resolve()));
      } catch (e) {
        try { console.warn('[login] session.save falhou:', e?.message || e); } catch {}
      }
    };

    // Se precisa trocar senha (primeiro acesso ou provisória), direciona ANTES da checagem de módulo
    const precisaTrocar = (user.senha_provisoria === true || user.primeiro_acesso === true || user.primeiro_acesso === undefined);
    const enforceMaster = String(process.env.ENFORCE_MASTER_FIRST_LOGIN || '').toLowerCase() === 'true';
    if (precisaTrocar && (!isMasterRole || (isMasterRole && enforceMaster))) {
      console.log('[login] redirecionando (senha_provisoria/primeiro_acesso)', { isMasterRole, enforceMaster });
      await saveSessionAfterLogin();
  return res.redirect(303, basePath + '/primeiroacesso');
    }

    // Rehash se custo for inferior ao mínimo configurado (mitiga hashes antigos mais fracos)
    try {
      const minRounds = Number(process.env.BCRYPT_MIN_ROUNDS || 12);
      const parts = user.senha.split('$');
      if (parts.length >= 3) {
        const rounds = parseInt(parts[2], 10);
        if (!isNaN(rounds) && rounds < minRounds) {
          user.senha = await bcrypt.hash(senha, minRounds);
          await saveUserDocument(user);
          console.info('[login] hash de senha atualizado (fortalecido)', { user: user.email, from: rounds, to: minRounds });
        }
      }
    } catch (rehashErr) { console.warn('[login] falha ao tentar rehash seguro:', rehashErr.message); }

    // Remember-me (somente se não estiver em fluxo de primeiro acesso)
    try {
      if (lembrar) {
        const days = Number(process.env.REMEMBER_TOKEN_DAYS || 30);
        const tokenPlain = crypto.randomBytes(48).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await createRememberToken({ user_id: user._id, token_hash: tokenHash, user_agent: req.headers['user-agent'] || null, ip: req.ip, expiresAt });
        const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
        res.cookie(cookieName, tokenPlain, { httpOnly: true, secure: (process.env.COOKIE_SECURE === 'true'), sameSite: 'Lax', expires: expiresAt });
      }
    } catch (rtErr) { console.warn('[login] remember token falhou:', rtErr.message); }

    // -----------------------------------------------------------------------
    // Autorização de acesso ao módulo alvo (após tratar primeiro acesso)
    // -----------------------------------------------------------------------
    // Checagem de módulo com timeout defensivo
    const checagem = await Promise.race([
      verificarAcessoModulo({ userDoc: effectiveLoginUser, moduloAlvoNome: moduloAlvo, basePath, authContext: resolvedLoginAuthContext }),
      new Promise(resolve=> setTimeout(()=> resolve({ permitido:false, motivo:'timeout_modulo' }), Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000)))
    ]);
    if (!checagem.permitido) {
      console.warn('[login] acesso negado ao modulo', { email: user.email, moduloAlvo, motivo: checagem.motivo });
      const motivo = encodeURIComponent(checagem.motivo || 'acesso_negado');
      return res.redirect(303, `${basePath}/login?erro=modulo&motivo=${motivo}`);
    }
    
    // Se o módulo estiver com status "planejado" e o usuário não for master → renderiza construcao
    try {
      const nomeRx = new RegExp('^' + escapeRegex(moduloAlvo) + '$', 'i');
      const or = [{ nome: nomeRx }];
      if (basePath) or.push({ url_base: basePath });
      if (moduloAlvo && !String(moduloAlvo).startsWith('/')) or.push({ url_base: '/' + String(moduloAlvo).trim() });
      if (String(moduloAlvo).toLowerCase() === 'portal_morador') {
        or.push({ nome: /^portal-morador$/i });
        or.push({ url_base: '/portal-morador' });
      }
      const alvoLower = String(moduloAlvo || '').trim().toLowerCase();
      if (alvoLower === 'condominios' || alvoLower === 'condominio') {
        or.push({ nome: /^condom[ií]nios$/i });
        or.push({ nome: /^gest[aã]o de condom[ií]nios$/i });
        or.push({ nome: /^m[oó]dulo condom[ií]nios$/i });
      }
      const modulo = await findModuloLeanByOrSelect({
        or,
        select: 'nome status url_base',
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000),
      });
      if (modulo && String(modulo.status||'').toLowerCase() === 'planejado' && !isMasterRole) {
        console.info('[login] módulo planejado detectado para não-master → renderizando construcao');
        try { res.setHeader('Cache-Control','no-store'); } catch(_){}
        const moduleName = (modulo.nome || moduloAlvo).toUpperCase();
        const moduleBasePath = modulo.url_base || basePath;
        return res.status(200).render('partials/construcao', { moduleName, basePath: moduleBasePath });
      }
    } catch (eCheck) { console.warn('[login] falha checando status planejado:', eCheck.message); }
    
    await saveSessionAfterLogin();
  return res.redirect(303, basePath + '/dashboard');
  } catch (e) {
    console.error('[login] erro:', e);
  const safeBase = req.baseUrl || '';
  res.setHeader('X-Login-Error', e.message || 'unknown');
  return res.redirect(303, safeBase + '/login?erro=servidor');
  }
}

export async function logout(req, res) {
  const cookieName = process.env.REMEMBER_COOKIE_NAME || 'wdg_remember';
  const tokenPlain = req.cookies ? req.cookies[cookieName] : null;
  if (tokenPlain) {
    try {
      const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
      await revokeRememberTokenByHash({ tokenHash });
    } catch (e) { console.warn('[logout] falha revogando remember token:', e.message); }
  }
  res.clearCookie(cookieName);
  const basePath = req.baseUrl || '';
  req.session.destroy(() => { res.clearCookie('wdg.sid'); res.redirect(basePath + '/login'); });
}

function buildAuthContextHttpPayload(authContext) {
  return {
    authenticated: !!authContext?.authenticated,
    source: authContext?.source || 'legacy',
    identity: authContext?.identity || {
      id: null,
      email: '',
      nome: null,
      authenticated: false,
    },
    globalRole: authContext?.globalRole || null,
    membershipCount: Number(authContext?.membershipCount || 0),
    memberships: Array.isArray(authContext?.memberships)
      ? authContext.memberships.map((membership) => ({
          membershipId: membership.membershipId,
          unidadeId: membership.unidadeId,
          unidadePrincipalId: membership.unidadePrincipalId || null,
          unidadeNome: membership.unidadeNome || null,
          unidadeCodigo: membership.unidadeCodigo || null,
          papelContextual: membership.papelContextual || null,
          legacyRole: membership.legacyRole || null,
        }))
      : [],
    needsUnitSelection: !!authContext?.needsUnitSelection,
    activeContext: authContext?.activeContext || null,
    effectiveRole: authContext?.effectiveRole || null,
  };
}

function buildAuthContextResolverOptions(req) {
  return {
    authenticatedUser: req.user || null,
    sessionUser: req.session?.user || null,
    existingAuthContext: req.session?.gestorAuthContext || null,
    featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
    deps: req.app?.locals?.gestorAuthContextResolverDeps || undefined,
    maxTimeMS: req.app?.locals?.gestorAuthContextMaxTimeMS,
  };
}

function buildRequestIdentity(req) {
  const user = req?.user || req?.session?.user || null;
  const id = user?._id || user?.id || null;
  const email = String(user?.email || '').trim().toLowerCase();
  const nome = String(user?.nome || '').trim() || null;

  return {
    id: id ? String(id).trim() : null,
    email,
    nome,
    authenticated: Boolean(id || email),
  };
}

function isAuthContextResolverEnabledForRequest(req) {
  const featureFlags = req.app?.locals?.gestorAuthContextFeatureFlags || null;
  if (featureFlags && typeof featureFlags === 'object') {
    return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  }
  return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

function clearGestorAuthContextSession(req) {
  if (!req?.session || !Object.prototype.hasOwnProperty.call(req.session, 'gestorAuthContext')) {
    return;
  }
  delete req.session.gestorAuthContext;
}

function buildLightweightAuthContextPayload(req) {
  return {
    authenticated: buildRequestIdentity(req).authenticated,
    source: isAuthContextResolverEnabledForRequest(req) ? 'auth-context-v1' : 'legacy',
    identity: buildRequestIdentity(req),
    globalRole: null,
    membershipCount: 0,
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
  };
}

function buildAuthContextMutationErrorPayload(code) {
  return {
    ok: false,
    authenticated: false,
    source: 'legacy',
    identity: {
      id: null,
      email: '',
      nome: null,
      authenticated: false,
    },
    globalRole: null,
    membershipCount: 0,
    memberships: [],
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
    code,
  };
}

function findMembershipByUnidadeId(authContext, unidadeId) {
  return Array.isArray(authContext?.memberships)
    ? authContext.memberships.find((membership) => membership.unidadeId === unidadeId) || null
    : null;
}

function persistActiveMembershipInSession(req, selectedMembership) {
  req.session = req.session || {};
  req.session.gestorAuthContext = {
    ...(req.session.gestorAuthContext && typeof req.session.gestorAuthContext === 'object'
      ? req.session.gestorAuthContext
      : {}),
    active_membership_id: selectedMembership.membershipId,
    active_unidade_id: selectedMembership.unidadeId,
    active_unidade_principal_id: selectedMembership.unidadePrincipalId,
    active_papel_contextual: selectedMembership.papelContextual,
    active_funcionario_id: selectedMembership.funcionarioId,
    legacy_role: selectedMembership.legacyRole,
    needs_selection: false,
  };
}

async function mutateAuthUnitContext(req, {
  requirePendingSelection = false,
  disabledCode = 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED',
  notRequiredCode = 'GESTOR_SELECTION_NOT_REQUIRED',
} = {}) {
  const requestIdentity = buildRequestIdentity(req);
  const lightweightPayload = buildLightweightAuthContextPayload(req);
  const semanticResult = await mutateAuthUnitContextService({
    authenticated: requestIdentity.authenticated,
    unidadeId: String(req.body?.unidade_id || '').trim(),
    session: req.session,
    resolverOptions: buildAuthContextResolverOptions(req),
    requirePendingSelection,
    deps: {
      resolveAuthContext: resolveGestorAuthContext,
      isValidObjectId: (value) => mongoose.isValidObjectId(value),
      findMembershipByUnidadeId,
      persistActiveMembershipInSession: (session, selectedMembership) => {
        persistActiveMembershipInSession({ session }, selectedMembership);
      },
      saveSession: async (session) => {
        await saveSessionSafe({ session });
      },
    },
  });

  if (semanticResult.kind === 'unauthorized') {
    return {
      status: 401,
      body: { ok: false, ...buildAuthContextHttpPayload(semanticResult.authContext), code: 'GESTOR_UNAUTHORIZED' },
    };
  }

  if (semanticResult.kind === 'invalid-unidade-id') {
    return {
      status: 400,
      body: { ok: false, ...lightweightPayload, code: 'GESTOR_INVALID_UNIDADE_ID' },
    };
  }

  if (semanticResult.kind === 'resolver-disabled') {
    return {
      status: 409,
      body: { ok: false, ...buildAuthContextHttpPayload(semanticResult.authContext), code: disabledCode },
    };
  }

  if (semanticResult.kind === 'selection-not-required') {
    return {
      status: 409,
      body: { ok: false, ...buildAuthContextHttpPayload(semanticResult.authContext), code: notRequiredCode },
    };
  }

  if (semanticResult.kind === 'unit-not-allowed') {
    return {
      status: 403,
      body: { ok: false, ...buildAuthContextHttpPayload(semanticResult.authContext), code: 'GESTOR_UNIT_NOT_ALLOWED' },
    };
  }

  return {
    status: 200,
    body: { ok: true, ...buildAuthContextHttpPayload(semanticResult.authContext) },
  };
}

async function saveSessionSafe(req) {
  if (!req?.session || typeof req.session.save !== 'function') return;
  await new Promise((resolve) => req.session.save(() => resolve()));
}

export async function getAuthContext(req, res) {
  try {
    const authContext = await resolveGestorAuthContext(buildAuthContextResolverOptions(req));

    const payload = buildAuthContextHttpPayload(authContext);
    if (!authContext?.authenticated) {
      return res.status(401).json({ ok: false, ...payload });
    }

    return res.status(200).json({ ok: true, ...payload });
  } catch (e) {
    console.error('[getAuthContext] erro:', e?.message || e);
    return res.status(500).json({
      ok: false,
      authenticated: false,
      source: 'legacy',
      identity: {
        id: null,
        email: '',
        nome: null,
        authenticated: false,
      },
      globalRole: null,
      membershipCount: 0,
      needsUnitSelection: false,
      activeContext: null,
      effectiveRole: null,
      code: 'GESTOR_AUTH_CONTEXT_ERROR',
    });
  }
}

export async function selectAuthUnit(req, res) {
  try {
    const result = await mutateAuthUnitContext(req, {
      requirePendingSelection: true,
      disabledCode: 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED',
      notRequiredCode: 'GESTOR_SELECTION_NOT_REQUIRED',
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error('[selectAuthUnit] erro:', e?.message || e);
    return res.status(500).json(buildAuthContextMutationErrorPayload('GESTOR_AUTH_CONTEXT_SELECTION_ERROR'));
  }
}

export async function switchAuthUnit(req, res) {
  try {
    const result = await mutateAuthUnitContext(req, {
      requirePendingSelection: false,
      disabledCode: 'GESTOR_AUTH_CONTEXT_SWITCH_DISABLED',
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error('[switchAuthUnit] erro:', e?.message || e);
    return res.status(500).json(buildAuthContextMutationErrorPayload('GESTOR_AUTH_CONTEXT_SWITCH_ERROR'));
  }
}

export async function renderResetPassword(req, res) {
  const { token } = req.params;
  try {
    const pr = await findPasswordResetByToken({ token });
    if (!pr || pr.expiresAt < new Date()) return res.render('reset-password-error', { title: 'Link inválido', message: 'Token inválido ou expirado', showRetry: true });
    // Opcional: tentar obter nome do usuário para saudação
    let userName = 'Usuário';
    try {
      const userIdRef = pr.user_id || pr.userId;
      if (userIdRef) {
        const u = await findUserByIdSelect({ id: userIdRef, select: 'nome email' });
        if (u?.nome) userName = u.nome.split(' ')[0];
      }
    } catch {}
    res.render('reset-password', { title: 'Redefinir Senha', token, userName });
  } catch (e) {
    console.error('[renderResetPassword] erro:', e.message);
    res.render('reset-password-error', { title: 'Erro', message: 'Erro ao validar token', showRetry: true });
  }
}

export async function postResetPassword(req, res) {
  try {
    const { token, senha } = req.body;
    if (!token || !senha) return res.render('reset-password-error', { title: 'Dados incompletos', message: 'Dados incompletos', showRetry: true });
    const pr = await findPasswordResetByToken({ token });
    if (!pr || pr.expiresAt < new Date()) return res.render('reset-password-error', { title: 'Link inválido', message: 'Token inválido ou expirado', showRetry: true });
    const userIdRef = pr.user_id || pr.userId; // compatibilidade
    const user = await findUserByIdWithMaxTime({ id: userIdRef });
    if (!user) return res.render('reset-password-error', { title: 'Usuário não encontrado', message: 'Usuário não encontrado', showRetry: false });
    user.senha = await bcrypt.hash(senha, 10);
    await saveUserDocument(user);
    await deletePasswordResetById({ id: pr._id });
  const basePath = req.baseUrl || '';
  res.render('reset-password-success', { title: 'Senha Redefinida', message: 'Sua senha foi redefinida com sucesso.', loginLink: basePath + '/login' });
  } catch (e) {
    console.error('[postResetPassword] erro:', e.message);
    res.render('reset-password-error', { title: 'Erro', message: 'Erro ao redefinir senha', showRetry: false });
  }
}

export async function postEsqueciSenha(req, res) {
  try {
    // 1. Entrada / validações básicas
    const { cpf, email, emailConfirm } = req.body;
    if (!cpf) return res.status(400).json({ success: false, message: 'CPF não informado.' });
    const cpfDigits = String(cpf).replace(/\D/g, '');
    if (cpfDigits.length !== 11) return res.status(400).json({ success: false, message: 'CPF inválido.' });

    // 2. Localiza usuários pelo CPF (direto) ou via Funcionario
    let usuarios = await findUsersByCpf({ cpf: cpfDigits });
    if (!usuarios.length) {
      const funcionarios = await findFuncionariosByCpfSelect({ cpf: cpfDigits, select: '_id' });
      if (funcionarios.length) {
        const ids = funcionarios.map(f => f._id);
        usuarios = await findUsersByFuncionarioIds({ ids });
      }
    }
    if (!usuarios.length) return res.status(404).json({ success: false, message: 'Nenhum usuário com este CPF.' });

    // 3. Se múltiplos e-mail ainda não informado -> pedir seleção
    if (usuarios.length > 1 && !email) {
      return res.status(200).json({ success: false, reason: 'multiple-users', maskedEmails: usuarios.map(u => maskEmail(u.email)) });
    }

    // 4. Define e valida e-mail escolhido
    const chosenEmail = email || (usuarios.length === 1 ? usuarios[0].email : null);
    if (!chosenEmail) return res.status(400).json({ success: false, message: 'E-mail requerido.' });
    if (emailConfirm && chosenEmail.toLowerCase() !== emailConfirm.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Confirmação de e-mail não confere.' });
    }
    const user = usuarios.find(u => u.email.toLowerCase() === chosenEmail.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'E-mail não associado a este CPF.' });

    // 5. Cria token
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
    await createPasswordReset({ user_id: user._id, token, expiresAt: expira });

  // Link externo deve respeitar o prefixo de montagem do módulo Gestor (/gestor)
  const appBase = resolveAppUrl();
  const link = `${appBase.replace(/\/$/,'')}/gestor/reset-password/${token}`;

    // 6. Monta template (compatível com string ou objeto)
    let html = '';
    let text = '';
    try {
      const tplResult = resetPasswordTemplate(user.nome || 'Usuário', link);
      if (typeof tplResult === 'string') {
        html = tplResult;
      } else if (tplResult && typeof tplResult === 'object') {
        html = tplResult.html || tplResult.HTML || tplResult.body || '';
        text = tplResult.text || tplResult.TEXT || '';
        // Fallback se nada veio
        if (!html) html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
      } else {
        html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
      }
    } catch (tplErr) {
      console.warn('[postEsqueciSenha] falha ao montar template, usando fallback:', tplErr.message);
      html = `<p>Redefina sua senha: <a href="${link}">${link}</a></p>`;
    }

    console.info('[postEsqueciSenha] template montado', { hasHtml: !!html, htmlLength: html.length, hasText: !!text });

    // 7. Configuração SMTP
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const haveCreds = !!(smtpUser && smtpPass);
    if (!haveCreds) {
      console.warn('[postEsqueciSenha] SMTP_USER/SMTP_PASS ausentes. Envio real será pulado.');
    }
    const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const ignoreTLS = String(process.env.SMTP_IGNORE_TLS || '').toLowerCase() === 'true';
    const requireTLS = String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true';
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: haveCreds ? { user: smtpUser, pass: smtpPass } : undefined,
      tls: (ignoreTLS || requireTLS) ? { rejectUnauthorized: false } : undefined,
      ignoreTLS,
      requireTLS
    });

    let debugError = null;
    let debugLink = link;
    if (haveCreds) {
      try {
        try {
          await transporter.verify();
          console.info('[postEsqueciSenha] SMTP verificado', { host: smtpHost, port: smtpPort, secure: smtpSecure, user: smtpUser });
        } catch (verErr) {
          console.warn('[postEsqueciSenha] Falha verify SMTP (prosseguindo):', verErr.message);
        }
        const mailOptions = {
          from: process.env.MAIL_FROM || smtpUser || 'no-reply@wdgestor.local',
          to: user.email,
          subject: 'Redefinição de Senha',
          html
        };
        if (text) mailOptions.text = text;
        const sendResult = await transporter.sendMail(mailOptions);
        console.info('[postEsqueciSenha] email enviado', {
          messageId: sendResult.messageId,
          accepted: sendResult.accepted,
          rejected: sendResult.rejected
        });
      } catch (sendErr) {
        debugError = sendErr.message;
        console.warn('[postEsqueciSenha] Falha ao enviar email:', sendErr.message);
        console.info('[postEsqueciSenha] Link de redefinição:', link);
        console.info('[postEsqueciSenha] HTML (fallback log)\n---INICIO---\n' + html + '\n---FIM---');
      }
    } else {
      // Sem credenciais: apenas loga o link
      console.info('[postEsqueciSenha] (modo sem credenciais) Link de redefinição:', link);
    }

    // 8. Resposta (sempre 200 para não revelar existência do e-mail)
    const payload = {
      success: true,
      message: 'Se o e-mail existir e estiver ativo, você receberá instruções em alguns instantes.'
    };
    if (process.env.NODE_ENV !== 'production') {
      payload.debugLink = debugLink;
      if (debugError) payload.debugError = debugError;
    }
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[postEsqueciSenha] erro:', e.message);
    return res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// Endpoint auxiliar para listar e-mails por CPF antes do POST final
export async function listarEmailsPorCPF(req, res) {
  try {
    const { cpf } = req.query;
    if (!cpf) return res.status(400).json({ success: false, message: 'CPF não informado.' });
    const cpfDigits = String(cpf).replace(/\D/g,'');
    if (cpfDigits.length !== 11) return res.status(400).json({ success: false, message: 'CPF inválido.' });
    let usuarios = await findUsersByCpf({ cpf: cpfDigits });
    if (!usuarios.length) {
      const funcionarios = await findFuncionariosByCpfSelect({ cpf: cpfDigits, select: '_id' });
      if (funcionarios.length) {
        const ids = funcionarios.map(f=>f._id);
        usuarios = await findUsersByFuncionarioIds({ ids });
      }
    }
    if (!usuarios.length) return res.status(404).json({ success: false, message: 'Nenhum usuário com este CPF.' });
    const masked = usuarios.map(u => ({ email: maskEmail(u.email), original: u.email }));
    return res.json({ success: true, quantidade: usuarios.length, emails: masked });
  } catch (e) {
    console.error('[listarEmailsPorCPF] erro:', e.message);
    return res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// Util para mascarar email (primeiro e último char antes do @ visíveis, resto *)
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return local[0] + '***@' + domain;
  const first = local[0];
  const last = local[local.length - 1];
  return first + '*'.repeat(local.length - 2) + last + '@' + domain;
}

// Implementação robusta de primeiro acesso (troca de senha obrigatória)
export async function primeiroAcessoPost(req, res) {
  try {
  const basePath = req.baseUrl || '';
  if (!req.session?.user?.id) return res.redirect(303, basePath + '/login');
    const { senha, confirmar_senha } = req.body || {};
    // Evitar loops: só propagar ?erro=... se a origem for realmente a página de primeiro acesso
    const ref = String(req.get('referer') || '');
    const fromPrimeiroAcesso = /\/primeiroacesso/i.test(ref);
    const errSuffix = (code) => fromPrimeiroAcesso ? (`?erro=${code}`) : '';
  if (!senha || !confirmar_senha) return res.redirect(303, basePath + '/primeiroacesso' + errSuffix('campos'));
  if (senha !== confirmar_senha) return res.redirect(303, basePath + '/primeiroacesso' + errSuffix('confirmacao'));
  if (senha.length < 8) return res.redirect(303, basePath + '/primeiroacesso' + errSuffix('tamanho'));
    // Força requisitos mínimos: maiúscula, minúscula, número
    if (!(/[A-Z]/.test(senha) && /[a-z]/.test(senha) && /\d/.test(senha))) {
  return res.redirect(303, basePath + '/primeiroacesso?erro=forca');
    }
    const result = await primeiroAcessoExecutionService({
      userId: req.session.user.id,
      senhaHash: await bcrypt.hash(senha, 10),
      maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
    });
  if (result.kind === 'not_found') return res.redirect(303, basePath + '/login');
    if (result.kind === 'already_completed') {
      // Já tratado anteriormente, apenas segue
  return res.redirect(303, basePath + '/dashboard');
    }
  if (result.kind === 'save_failed') { console.warn('[primeiroAcessoPost] falha ao salvar:', result.error?.message || result.error); return res.redirect(303, basePath + '/primeiroacesso?erro=servidor'); }
  return res.redirect(basePath + '/dashboard');
  } catch (e) {
    console.error('[primeiroAcessoPost] erro troca senha primeiro acesso:', e);
    const ref = String(req.get('referer') || '');
    const fromPrimeiroAcesso = /\/primeiroacesso/i.test(ref);
    const suffix = fromPrimeiroAcesso ? '?erro=servidor' : '';
  return res.redirect(303, basePath + '/primeiroacesso' + suffix);
  }
}
