import {
  sanitizePortalEmail,
  findPortalUserByEmail,
  verifyPortalPassword,
  registerPortalFailedAttempt,
  isPortalAccessBlocked,
  markPortalLoginSuccess,
  mustForcePortalFirstAccess,
  buildPortalSessionPayload,
  formatExpirationDescription,
  setPortalPassword,
  PORTAL_LOGIN_MAX_ATTEMPTS
} from '#modules/portal-morador/lib/portalAuth.js';
import mongoose from 'mongoose';
import { PortalAuthRepository, resolvePortalAuthUnitScope } from '#modules/portal-morador/app/repositories/PortalAuthRepository.js';
import { setPortalSessionCookie, clearPortalSessionCookie } from '#modules/portal-morador/app/lib/portalSessionCookie.js';

const FIRST_ACCESS_PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function getPortalAuthRepository(req, options = {}) {
  const unitScope = resolvePortalAuthUnitScope(req, options);
  return new PortalAuthRepository({ unitScope });
}

function persistPortalSession(req, res, portalSession, condUser) {
  if (req.session) {
    req.session.portalUser = portalSession;
  }
  const userId = portalSession?.cond_usuario_id || portalSession?.id || condUser?._id?.toString();
  if (userId) {
    // Evita duplicar cookie (paths/domains antigos). Em produção isso costuma causar 401 intermitente.
    clearPortalSessionCookie(res);
    setPortalSessionCookie(res, { userId, session: portalSession });
  }
}

function clearPortalSession(req, res) {
  try {
    if (req.session) {
      delete req.session.portalUser;
    }
  } catch (_err) {
    /* noop */
  }
  clearPortalSessionCookie(res);
}

function getBasePath(req) {
  return req.baseUrl || '/portal-morador';
}

function wantsJson(req) {
  const accept = (req.headers['accept'] || '').toLowerCase();
  const requestedWith = (req.headers['x-requested-with'] || '').toLowerCase();
  return req.originalUrl?.includes('/api/') || accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest';
}

function groupPortalVinculos(portalSession) {
  const vinculos = Array.isArray(portalSession?.vinculos) ? portalSession.vinculos : [];
  const byUnidade = new Map();
  for (const v of vinculos) {
    const unidadeId = v?.unidade_id ? String(v.unidade_id) : '';
    if (!unidadeId) continue;
    const unidadeNome = String(v?.unidade_nome || '').trim();
    const unidadeCodigo = String(v?.unidade_codigo || '').trim();
    const unidadeLogo = String(v?.unidade_logo || '').trim();
    if (!byUnidade.has(unidadeId)) {
      byUnidade.set(unidadeId, {
        id: unidadeId,
        nome: unidadeNome || 'Condomínio',
        codigo: unidadeCodigo || '',
        logoUrl: unidadeLogo || '',
        habitacoes: []
      });
    }
    const habId = v?.habitacao_id ? String(v.habitacao_id) : '';
    if (!habId) continue;
    const unidade = byUnidade.get(unidadeId);
    if (!unidade.habitacoes.some((h) => String(h.id) === habId)) {
      unidade.habitacoes.push({
        id: habId,
        label: String(v?.habitacao_label || 'Habitação').trim() || 'Habitação'
      });
    }
  }
  const unidades = Array.from(byUnidade.values());
  unidades.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  unidades.forEach((u) => {
    u.habitacoes.sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));
  });
  return unidades;
}

export async function portalLoginPost(req, res) {
  try {
    const basePath = getBasePath(req);
    const { email, senha } = req.body || {};
    const unidadeSelecionada = String(req.body?.unidade_id || req.body?.unidadeId || '').trim();
    const portalAuthRepo = getPortalAuthRepository(req, { fallbackUnidadeId: unidadeSelecionada });
    const normalizedEmail = sanitizePortalEmail(email);
    if (!normalizedEmail || !senha) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, code: 'CAMPOS', error: 'Preencha e-mail e senha.' });
      return res.redirect(303, `${basePath}/login?erro=campos`);
    }
    let user = await findPortalUserByEmail(normalizedEmail);
    // Compat: permitir login com credenciais do módulo Gestor (User) quando o CondUsuario
    // ainda não existir (ou foi criado apenas no Gestor).
    if (!user) {
      if (req?.app?.locals?.skipDb || mongoose.connection.readyState !== 1) {
        if (wantsJson(req)) return res.status(503).json({ ok: false, code: 'DB_OFFLINE', error: 'Serviço indisponível no momento.' });
        return res.redirect(303, `${basePath}/login?erro=servidor`);
      }
      const gestorUser = await portalAuthRepo.findGestorUserByEmail(normalizedEmail, {
        maxTimeMs: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000)
      });
      if (!gestorUser) {
        if (wantsJson(req)) return res.status(404).json({ ok: false, code: 'USUARIO', error: 'Não encontramos um usuário com esse e-mail.' });
        return res.redirect(303, `${basePath}/login?erro=usuario`);
      }
      const ok = await (async () => {
        try {
          const bcrypt = (await import('bcryptjs')).default;
          return bcrypt.compare(String(senha), String(gestorUser.senha || ''));
        } catch {
          return false;
        }
      })();
      if (!ok) {
        if (wantsJson(req)) return res.status(401).json({ ok: false, code: 'SENHA', error: 'Senha incorreta.' });
        return res.redirect(303, `${basePath}/login?erro=senha`);
      }
      // Cria o CondUsuario mínimo para o Portal e define senha do portal igual à senha informada.
      try {
        user = await portalAuthRepo.createPortalUserFromGestor({
          email: normalizedEmail,
          nome: gestorUser.nome || '',
          telefone: gestorUser.telefone || '',
          unidade_id: gestorUser.unidade_id || null,
        });
      } catch (_e) {
        // Se houve corrida com índice único, recarrega
        user = await findPortalUserByEmail(normalizedEmail);
      }
      if (!user) {
        if (wantsJson(req)) return res.status(503).json({ ok: false, code: 'SERVIDOR', error: 'Serviço indisponível no momento.' });
        return res.redirect(303, `${basePath}/login?erro=servidor`);
      }
      await setPortalPassword(user, String(senha), { clearToken: true });
    }
    if (user.ativo === false || user.portal_acesso_ativo === false) {
      if (wantsJson(req)) return res.status(403).json({ ok: false, code: 'SUSPENSO', error: 'Seu acesso está suspenso.' });
      return res.redirect(303, `${basePath}/login?erro=suspenso`);
    }
    const blocked = isPortalAccessBlocked(user);
    if (blocked.blocked) {
      const min = blocked.minutesRemaining || '';
      if (wantsJson(req)) return res.status(429).json({ ok: false, code: 'BLOQUEADO', error: 'Conta temporariamente bloqueada.', minutes: blocked.minutesRemaining || null });
      return res.redirect(303, `${basePath}/login?erro=bloqueado${min ? `&min=${min}` : ''}`);
    }
    let senhaOk = await verifyPortalPassword(user, senha);
    // Compat: se o usuário existe no Condomínios mas ainda não tem senha do portal,
    // aceita a senha do Gestor (se houver) e salva como senha do portal.
    if (!senhaOk && !String(user.portal_password_hash || '').trim()) {
      try {
        const gestorUser = await portalAuthRepo.findGestorUserByEmail(normalizedEmail, {
          maxTimeMs: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000)
        });
        if (gestorUser) {
          const bcrypt = (await import('bcryptjs')).default;
          const ok = await bcrypt.compare(String(senha), String(gestorUser.senha || ''));
          if (ok) {
            await setPortalPassword(user, String(senha), { clearToken: true });
            senhaOk = true;
          }
        }
      } catch {
        // mantém senhaOk=false
      }
    }
    if (!senhaOk) {
      const attemptsBefore = user.portal_login_tentativas || 0;
      await registerPortalFailedAttempt(user);
      const after = isPortalAccessBlocked(user);
      if (after.blocked) {
        const min = after.minutesRemaining || '';
        if (wantsJson(req)) return res.status(429).json({ ok: false, code: 'BLOQUEADO', error: 'Conta temporariamente bloqueada.', minutes: after.minutesRemaining || null });
        return res.redirect(303, `${basePath}/login?erro=bloqueado${min ? `&min=${min}` : ''}`);
      }
      const restantes = Math.max(PORTAL_LOGIN_MAX_ATTEMPTS - (attemptsBefore + 1), 0);
      if (wantsJson(req)) return res.status(401).json({ ok: false, code: 'SENHA', error: 'Senha incorreta.', restantes });
      return res.redirect(303, `${basePath}/login?erro=senha&restantes=${restantes}`);
    }
    // Ajuste solicitado: permitir login mesmo para usuários recém-criados no módulo de Gestão de Condomínio.
    // (O fluxo de primeiro acesso continua disponível, mas não bloqueia mais o login.)
    await markPortalLoginSuccess(user);
    const portalSession = await buildPortalSessionPayload(user);

    // Novo fluxo (AJAX): após validar e-mail/senha, o usuário escolhe Unidade e Habitação.
    if (wantsJson(req)) {
      // Mantém sessão autenticada, porém sem contexto selecionado.
      portalSession.portal_needs_selection = true;
      portalSession.unidade_id = null;
      portalSession.unidade_nome = '';
      portalSession.unidade_codigo = '';
      portalSession.unidade_logo = '';
      portalSession.unidade_cnpj = '';
      portalSession.habitacao_id = null;
      portalSession.habitacao_label = '';
      persistPortalSession(req, res, portalSession, user);

      const unidades = groupPortalVinculos(portalSession);
      return res.json({ ok: true, step: 'select', unidades });
    }

    // Se o usuário estiver vinculado a mais de um condomínio, exigir seleção no login.
    const vinculos = Array.isArray(portalSession?.vinculos) ? portalSession.vinculos : [];
    const unidadeIds = Array.from(new Set(vinculos.map(v => v?.unidade_id ? String(v.unidade_id) : '').filter(Boolean)));
    if (unidadeIds.length > 1) {
      if (!unidadeSelecionada) {
        return res.redirect(303, `${basePath}/login?erro=condominio&email=${encodeURIComponent(normalizedEmail)}`);
      }
      if (!unidadeIds.includes(String(unidadeSelecionada))) {
        return res.redirect(303, `${basePath}/login?erro=condominio&email=${encodeURIComponent(normalizedEmail)}`);
      }
      const escolhido = vinculos.find(v => v?.unidade_id && String(v.unidade_id) === String(unidadeSelecionada)) || null;
      if (escolhido) {
        portalSession.unidade_id = String(escolhido.unidade_id);
        portalSession.unidade_nome = String(escolhido.unidade_nome || '').trim();
        portalSession.unidade_codigo = String(escolhido.unidade_codigo || '').trim();
        portalSession.unidade_logo = String(escolhido.unidade_logo || '').trim();
        portalSession.unidade_cnpj = String(escolhido.unidade_cnpj || '').trim();
      }
    } else if (unidadeSelecionada && unidadeIds.length === 1 && unidadeIds[0] !== String(unidadeSelecionada)) {
      // Quando só existe um condomínio, ignora seleção inválida sem falhar o login.
    }

    // Seleção padrão de habitação (compat): mantém o fluxo antigo funcionando.
    try {
      const selectedUnidadeId = portalSession?.unidade_id ? String(portalSession.unidade_id) : null;
      const firstHab = vinculos.find(v => v?.unidade_id && String(v.unidade_id) === String(selectedUnidadeId) && v?.habitacao_id)
        || vinculos.find(v => v?.habitacao_id)
        || null;
      if (firstHab && firstHab.habitacao_id) {
        portalSession.habitacao_id = String(firstHab.habitacao_id);
        portalSession.habitacao_label = String(firstHab.habitacao_label || 'Habitação').trim();
      }
    } catch { /* noop */ }

    persistPortalSession(req, res, portalSession, user);
    return res.redirect(303, `${basePath}/home`);
  } catch (err) {
    console.error('[portalLoginPost] erro inesperado:', err);
    const basePath = getBasePath(req);
    if (wantsJson(req)) return res.status(500).json({ ok: false, code: 'SERVIDOR', error: 'Serviço indisponível no momento.' });
    return res.redirect(303, `${basePath}/login?erro=servidor`);
  }
}

export async function portalAuthContextGet(req, res) {
  try {
    const sessionUser = (req?.session?.portalUser) || (req?.user) || null;
    if (!sessionUser) {
      return res.status(401).json({ ok: false, code: 'PORTAL_UNAUTHORIZED', error: 'Não autenticado.' });
    }
    const unidades = groupPortalVinculos(sessionUser);
    return res.json({
      ok: true,
      needsSelection: !!sessionUser.portal_needs_selection,
      selected: {
        unidade_id: sessionUser.unidade_id || null,
        habitacao_id: sessionUser.habitacao_id || null,
        habitacao_label: sessionUser.habitacao_label || ''
      },
      unidades
    });
  } catch (err) {
    console.error('[portalAuthContextGet] erro inesperado:', err);
    return res.status(500).json({ ok: false, code: 'SERVIDOR', error: 'Serviço indisponível no momento.' });
  }
}

export async function portalSelectVinculoPost(req, res) {
  try {
    const basePath = getBasePath(req);
    const sessionUser = (req?.session?.portalUser) || (req?.user) || null;
    if (!sessionUser) {
      return res.status(401).json({ ok: false, code: 'PORTAL_UNAUTHORIZED', error: 'Não autenticado.' });
    }

    const unidadeId = String(req.body?.unidade_id || req.body?.unidadeId || '').trim();
    const habId = String(req.body?.habitacao_id || req.body?.habitacaoId || '').trim();
    if (!unidadeId || !habId) {
      return res.status(400).json({ ok: false, code: 'CAMPOS', error: 'Selecione a unidade e a habitação.' });
    }

    const vinculos = Array.isArray(sessionUser?.vinculos) ? sessionUser.vinculos : [];
    const match = vinculos.find(v => v?.unidade_id && v?.habitacao_id && String(v.unidade_id) === unidadeId && String(v.habitacao_id) === habId) || null;
    if (!match) {
      return res.status(400).json({ ok: false, code: 'VINCULO', error: 'Vínculo inválido para este usuário.' });
    }

    const updated = {
      ...sessionUser,
      portal_needs_selection: false,
      unidade_id: String(match.unidade_id),
      unidade_nome: String(match.unidade_nome || '').trim(),
      unidade_codigo: String(match.unidade_codigo || '').trim(),
      unidade_logo: String(match.unidade_logo || '').trim(),
      unidade_cnpj: String(match.unidade_cnpj || '').trim(),
      habitacao_id: String(match.habitacao_id),
      habitacao_label: String(match.habitacao_label || 'Habitação').trim()
    };

    persistPortalSession(req, res, updated, null);
    return res.json({ ok: true, redirect: `${basePath}/home` });
  } catch (err) {
    console.error('[portalSelectVinculoPost] erro inesperado:', err);
    return res.status(500).json({ ok: false, code: 'SERVIDOR', error: 'Serviço indisponível no momento.' });
  }
}

export function portalLogout(req, res) {
  clearPortalSession(req, res);
  const basePath = getBasePath(req);
  return res.redirect(`${basePath}/login`);
}

function renderFirstAccess(res, { basePath, state }) {
  return res.render('portal-morador/primeiro_acesso', {
    basePath,
    moduleLabel: 'Portal do Morador',
    ...state
  });
}

function getFirstAccessState({ user, token, erro, mensagem, allowSubmit }) {
  const submitEnabled = typeof allowSubmit === 'boolean' ? allowSubmit : !erro;
  return {
    token,
    email: user?.email || '',
    nome: user?.nome || '',
    unidadeNome: user?.session?.unidade_nome || '',
    unidadeCodigo: user?.session?.unidade_codigo || '',
    unidadeLogo: user?.session?.unidade_logo || '',
    validade: formatExpirationDescription(user?.portal_primeiro_acesso_expires || null),
    erro,
    mensagem,
    allowSubmit: submitEnabled
  };
}

async function loadFirstAccessUser(tokenRaw, emailRaw) {
  const token = String(tokenRaw || '').trim();
  const email = sanitizePortalEmail(emailRaw);
  if (!token || !email) return { error: 'Link inválido.', token, email };
  const user = await findPortalUserByEmail(email);
  if (!user || !user.portal_primeiro_acesso_token) {
    return { error: 'Convite não encontrado. Solicite um novo acesso.', token, email };
  }
  if (user.portal_primeiro_acesso_token !== token) {
    return { error: 'Este link já foi usado ou é inválido.', token, email };
  }
  if (user.portal_primeiro_acesso_expires && user.portal_primeiro_acesso_expires < new Date()) {
    return { error: 'Este link expirou. Solicite um novo acesso à administração do condomínio.', token, email };
  }
  let session = null;
  try {
    session = await buildPortalSessionPayload(user);
  } catch {}
  return { user, token, email, session };
}

export async function portalPrimeiroAcessoGet(req, res) {
  const basePath = getBasePath(req);
  try {
    const data = await loadFirstAccessUser(req.query?.token, req.query?.email);
    if (data.error) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: { email: data.email }, token: data.token, erro: true, mensagem: data.error })
      });
    }
    const baseUser = data.user?.toObject?.() ? data.user.toObject() : data.user;
    if (baseUser && data.session) baseUser.session = data.session;
    return renderFirstAccess(res, {
      basePath,
      state: getFirstAccessState({ user: baseUser, token: data.token })
    });
  } catch (err) {
    console.error('[portalPrimeiroAcessoGet] erro:', err);
    return renderFirstAccess(res, {
      basePath,
      state: { erro: true, mensagem: 'Falha ao carregar convite. Tente novamente mais tarde.', allowSubmit: false }
    });
  }
}

export async function portalPrimeiroAcessoPost(req, res) {
  const basePath = getBasePath(req);
  try {
    const { token, email, senhaProvisoria, senha, confirmar } = req.body || {};
    const data = await loadFirstAccessUser(token, email);
    const baseUser = data.user?.toObject?.() ? data.user.toObject() : data.user;
    if (baseUser && data.session) baseUser.session = data.session;
    if (data.error || !data.user) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: { email: data.email }, token: data.token, erro: true, mensagem: data.error || 'Link inválido.' })
      });
    }
    if (!senhaProvisoria) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: baseUser, token: data.token, erro: true, mensagem: 'Informe a senha provisória enviada ao seu e-mail.', allowSubmit: true })
      });
    }
    const provisionalOk = await verifyPortalPassword(data.user, senhaProvisoria);
    if (!provisionalOk) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: baseUser, token: data.token, erro: true, mensagem: 'Senha provisória incorreta. Confira o e-mail enviado ou solicite um novo convite.', allowSubmit: true })
      });
    }
    if (!senha || !confirmar) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: baseUser, token: data.token, erro: true, mensagem: 'Preencha os dois campos de senha.', allowSubmit: true })
      });
    }
    if (senha !== confirmar) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: baseUser, token: data.token, erro: true, mensagem: 'As senhas não conferem.', allowSubmit: true })
      });
    }
    if (!FIRST_ACCESS_PASSWORD_RULE.test(senha)) {
      return renderFirstAccess(res, {
        basePath,
        state: getFirstAccessState({ user: baseUser, token: data.token, erro: true, mensagem: 'A nova senha deve ter ao menos 8 caracteres, com letras maiúsculas, minúsculas e números.', allowSubmit: true })
      });
    }
    await setPortalPassword(data.user, senha, { clearToken: true });
    await markPortalLoginSuccess(data.user);
    const portalSession = await buildPortalSessionPayload(data.user);
    persistPortalSession(req, res, portalSession, data.user);
    return res.redirect(`${basePath}/home`);
  } catch (err) {
    console.error('[portalPrimeiroAcessoPost] erro:', err);
    const state = { erro: true, mensagem: 'Não foi possível atualizar a senha. Tente novamente em instantes.', allowSubmit: true };
    return renderFirstAccess(res, { basePath, state });
  }
}
