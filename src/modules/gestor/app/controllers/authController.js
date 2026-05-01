import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import {
  createRememberToken,
  findFuncaoByIdSelect,
  findFuncionarioByIdSelect,
  findModuloByOr,
  findModuloLeanByOrSelect,
  findUnidadeByIdSelect,
  findUserByEmail,
  revokeRememberTokenByHash,
  saveUserDocument,
} from '#modules/gestor/app/services/authDbBridgeService.js';
import {
  GESTOR_AUTH_CONTEXT_RESOLVER_FLAG,
  resolveGestorAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';
import { createAuthContextOrchestrationCore } from '#modules/gestor/app/services/auth/createAuthContextOrchestrationCore.js';
import { evaluateLoginPreAuthGateService } from '#modules/gestor/app/services/auth/evaluateLoginPreAuthGate.service.js';
import { createLoginModuleAccessCore } from '#modules/gestor/app/services/auth/createLoginModuleAccessCore.js';
import {
  loadResetPasswordRenderModelService,
  listRecoveryEmailsByCpfService,
  resetPasswordByTokenService,
  requestPasswordRecoveryService,
} from '#modules/gestor/app/services/auth/passwordRecovery.service.js';
import { primeiroAcessoExecutionService } from '#modules/gestor/app/services/auth/primeiroAcessoExecution.service.js';
import { mutateAuthUnitContextService } from '#modules/gestor/app/services/auth/mutateAuthUnitContext.service.js';
import { openLocalPostAuthSession } from '#modules/gestor/app/services/auth/openLocalPostAuthSession.service.js';
import { resolveLoginSuccessOutcome } from '#modules/gestor/app/services/auth/resolveLoginSuccessOutcome.service.js';
import {
  buildStoredGestorAuthContext,
  resolveLoginPostAuthContext,
} from '#modules/gestor/app/services/auth/resolveLoginPostAuthContext.service.js';

const authContextOrchestration = createAuthContextOrchestrationCore({
  resolveLoginPostAuthContext,
  resolveAuthContext: resolveGestorAuthContext,
  mutateAuthUnitContextService,
});

const loginModuleAccess = createLoginModuleAccessCore({
  findModuloByOr,
  findUnidadeByIdSelect,
  findFuncionarioByIdSelect,
  findFuncaoByIdSelect,
});

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const preAuthResult = await evaluateLoginPreAuthGateService({ email, senha });
    if (!preAuthResult.ok) {
      for (const [name, value] of Object.entries(preAuthResult.headers || {})) {
        res.setHeader(name, value);
      }
      if (preAuthResult.code === 'bloqueado') {
        return res.redirect(303, basePath + '/login?erro=bloqueado&min=' + preAuthResult.min);
      }
      if (preAuthResult.code === 'senha') {
        return res.redirect(303, basePath + '/login?erro=senha&restantes=' + preAuthResult.restantes);
      }
      return res.redirect(303, basePath + '/login?erro=' + preAuthResult.code);
    }

    let user = preAuthResult.user;
    const isMasterRole = user.role === 'master' || user.global_role === 'master';

    console.log('[login] autenticado', { id: user._id.toString(), primeiro_acesso: user.primeiro_acesso, senha_provisoria: user.senha_provisoria, role: user.role });
    await openLocalPostAuthSession({
      req,
      authenticatedUser: user,
      logger: console,
    });
    let effectiveLoginUser = user;
    let resolvedLoginAuthContext = null;

    const loginPostAuthContextResult = await authContextOrchestration.resolveLoginAuthContext({
      authenticatedUser: user,
      session: req.session,
      resolverEnabled: isAuthContextResolverEnabledForRequest(req),
      featureFlags: req.app?.locals?.gestorAuthContextFeatureFlags || null,
      resolverDeps: req.app?.locals?.gestorAuthContextResolverDeps || undefined,
      maxTimeMS: req.app?.locals?.gestorAuthContextMaxTimeMS,
    });

    resolvedLoginAuthContext = loginPostAuthContextResult.resolvedAuthContext;
    if (loginPostAuthContextResult.kind === 'no-context') {
      clearContextualLegacyProjection(req);
      await saveSessionSafe(req);
      return res.redirect(303, basePath + '/login?erro=contexto');
    }

    if (loginPostAuthContextResult.kind === 'needs-selection') {
      clearContextualLegacyProjection(req);
      await saveSessionSafe(req);
      return res.redirect(303, basePath + '/login?step=select');
    }

    effectiveLoginUser = loginPostAuthContextResult.effectiveLoginUser;

    const earlyLoginSuccessOutcome = await resolveLoginSuccessOutcome({
      user,
      isMasterRole,
      moduloAlvo,
      basePath,
    });
    if (earlyLoginSuccessOutcome.kind === 'redirect') {
      await saveSessionSafe(req);
      return res.redirect(303, earlyLoginSuccessOutcome.location);
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
      loginModuleAccess.evaluateModuleAccess({ userDoc: effectiveLoginUser, moduloAlvoNome: moduloAlvo, basePath, authContext: resolvedLoginAuthContext }),
      new Promise(resolve=> setTimeout(()=> resolve({ permitido:false, motivo:'timeout_modulo' }), Number(process.env.MONGO_QUERY_TIMEOUT_MS||3000)))
    ]);
    if (!checagem.permitido) {
      console.warn('[login] acesso negado ao modulo', { email: user.email, moduloAlvo, motivo: checagem.motivo });
    }

    const finalLoginSuccessOutcome = await resolveLoginSuccessOutcome({
      user,
      isMasterRole,
      moduloAlvo,
      basePath,
      moduleAccessResult: checagem,
      deps: {
        findModuloLeanByOrSelect,
      },
      logger: console,
    });
    if (finalLoginSuccessOutcome.kind === 'render') {
      try { res.setHeader('Cache-Control','no-store'); } catch(_){ }
      return res.status(finalLoginSuccessOutcome.statusCode).render(finalLoginSuccessOutcome.view, finalLoginSuccessOutcome.payload);
    }

    if (finalLoginSuccessOutcome.saveSession) {
      await saveSessionSafe(req);
    }
    return res.redirect(303, finalLoginSuccessOutcome.location);
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

function persistActiveMembershipInSession(req, selectedMembership, resolvedAuthContext = null) {
  req.session = req.session || {};
  const canonicalStoredAuthContext = buildStoredGestorAuthContext(resolvedAuthContext);

  req.session.gestorAuthContext = canonicalStoredAuthContext || {
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

  if (req.session.user && typeof req.session.user === 'object') {
    req.session.user.unidade_id = selectedMembership.unidadeId || null;
    req.session.user.unidade_principal_id = selectedMembership.unidadePrincipalId || selectedMembership.unidadeId || null;
    req.session.user.funcionario_id = selectedMembership.funcionarioId || null;
    if (selectedMembership.legacyRole) {
      req.session.user.role = selectedMembership.legacyRole;
    } else {
      delete req.session.user.role;
    }
    req.session.user.auth_version = 'phase3';
  }
}

function clearContextualLegacyProjection(req) {
  if (!req?.session?.user || typeof req.session.user !== 'object') return;

  const nextSessionUser = {
    ...req.session.user,
    auth_version: 'phase3',
  };

  delete nextSessionUser.unidade_id;
  delete nextSessionUser.unidade_principal_id;
  delete nextSessionUser.funcionario_id;

  req.session.user = nextSessionUser;
}

async function mutateAuthUnitContext(req, {
  requirePendingSelection = false,
  disabledCode = 'GESTOR_AUTH_CONTEXT_SELECTION_DISABLED',
  notRequiredCode = 'GESTOR_SELECTION_NOT_REQUIRED',
} = {}) {
  const requestIdentity = buildRequestIdentity(req);
  const lightweightPayload = buildLightweightAuthContextPayload(req);
  const semanticResult = await authContextOrchestration.mutateActiveUnitContext({
    authenticated: requestIdentity.authenticated,
    unidadeId: String(req.body?.unidade_id || '').trim(),
    session: req.session,
    resolverOptions: buildAuthContextResolverOptions(req),
    requirePendingSelection,
    mutationDeps: {
      resolveAuthContext: resolveGestorAuthContext,
      isValidObjectId: (value) => mongoose.isValidObjectId(value),
      findMembershipByUnidadeId,
      persistActiveMembershipInSession: (session, selectedMembership, resolvedAuthContext) => {
        persistActiveMembershipInSession({ session }, selectedMembership, resolvedAuthContext);
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
    const authContext = await authContextOrchestration.resolveCurrentAuthContext({
      resolverOptions: buildAuthContextResolverOptions(req),
    });

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
    const result = await loadResetPasswordRenderModelService({ token });
    return res.render(result.view, result.locals);
  } catch (e) {
    console.error('[renderResetPassword] erro:', e.message);
    return res.render('reset-password-error', { title: 'Erro', message: 'Erro ao validar token', showRetry: true });
  }
}

export async function postResetPassword(req, res) {
  try {
    const result = await resetPasswordByTokenService({
      token: req.body?.token,
      senha: req.body?.senha,
    });
    if (result.ok) {
      const basePath = req.baseUrl || '';
      return res.render(result.view, { ...result.locals, loginLink: basePath + '/login' });
    }

    return res.render(result.view, result.locals);
  } catch (e) {
    console.error('[postResetPassword] erro:', e.message);
    return res.render('reset-password-error', { title: 'Erro', message: 'Erro ao redefinir senha', showRetry: false });
  }
}

export async function postEsqueciSenha(req, res) {
  try {
    const result = await requestPasswordRecoveryService({
      cpf: req.body?.cpf,
      email: req.body?.email,
      emailConfirm: req.body?.emailConfirm,
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error('[postEsqueciSenha] erro:', e.message);
    return res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// Endpoint auxiliar para listar e-mails por CPF antes do POST final
export async function listarEmailsPorCPF(req, res) {
  try {
    const result = await listRecoveryEmailsByCpfService({
      cpf: req.query?.cpf,
    });
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error('[listarEmailsPorCPF] erro:', e.message);
    return res.status(500).json({ success: false, message: 'Erro interno.' });
  }
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
