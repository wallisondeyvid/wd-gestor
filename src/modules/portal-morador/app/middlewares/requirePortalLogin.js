import mongoose from 'mongoose';
import CondUsuario from '#models/cond_usuario.js';
import { connectMongo } from '#core/db/connect.js';
import { buildPortalSessionPayload } from '#modules/portal-morador/lib/portalAuth.js';
import { readPortalSessionCookie, hasPortalCookieCandidate, setPortalSessionCookie, clearPortalSessionCookie, PORTAL_SESSION_COOKIE_NAME } from '#modules/portal-morador/app/lib/portalSessionCookie.js';

// Middleware específico do Portal do Morador para validar sessão em memória
function wantsJson(req) {
  const accept = String(req.headers?.accept || '').toLowerCase();
  const requestedWith = String(req.headers?.['x-requested-with'] || '').toLowerCase();
  const original = String(req.originalUrl || req.url || '');
  return original.includes('/api/') || accept.includes('application/json') || requestedWith === 'fetch' || requestedWith === 'xmlhttprequest';
}

function getPortalSession(req) {
  try {
    const sessionUser = req?.session?.portalUser;
    if (!sessionUser) return null;
    if (sessionUser.portal_acesso_ativo === false) return null;
    return sessionUser;
  } catch (_err) {
    return null;
  }
}

function hasVinculos(sessionUser) {
  return Array.isArray(sessionUser?.vinculos) && sessionUser.vinculos.length > 0;
}

function hasSelectedContext(sessionUser) {
  const unidadeId = sessionUser?.unidade_id;
  const habId = sessionUser?.habitacao_id;
  const habLabel = sessionUser?.habitacao_label;
  // Em alguns cenários (unidade administrativa) não há habId, mas deve haver label.
  return !!(unidadeId && (habId || habLabel));
}

function isInlineCookieSessionSufficient(sessionUser) {
  // Um snapshot "tiny" (só id/nome/email) é suficiente para identificar,
  // mas NÃO é suficiente para renderizar o portal (logo/menus/seleção) sem inconsistências.
  if (!sessionUser || typeof sessionUser !== 'object') return false;
  if (sessionUser.portal_acesso_ativo === false) return false;
  if (sessionUser.portal_needs_selection) return true;
  return hasVinculos(sessionUser) || hasSelectedContext(sessionUser);
}

async function restorePortalSessionFromCookie(req, res, options = {}) {
  try {
    const { onResult } = options || {};
    const hadCookieCandidate = hasPortalCookieCandidate(req);
    const cookiePayload = readPortalSessionCookie(req);
    if (!cookiePayload) {
      onResult?.({ ok: false, reason: hadCookieCandidate ? 'cookie-invalid' : 'cookie-missing' });
      return null;
    }
    if (cookiePayload.session && typeof cookiePayload.session === 'object') {
      const sessionId = String(cookiePayload.session.cond_usuario_id || cookiePayload.session.id || '').trim();
      const payloadId = String(cookiePayload.userId || '').trim();
      // Aceita snapshots mínimos (tiny/minimal) que às vezes carregam apenas `id`.
      if (sessionId && payloadId && sessionId === payloadId) {
        if (!cookiePayload.session.cond_usuario_id) {
          cookiePayload.session.cond_usuario_id = payloadId;
        }
        if (req.session) {
          req.session.portalUser = cookiePayload.session;
        }
        setPortalSessionCookie(res, { userId: cookiePayload.userId, session: cookiePayload.session });
        onResult?.({ ok: true, source: 'cookie-inline' });
        return cookiePayload.session;
      }
    }
    if (mongoose.connection.readyState !== 1) {
      try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (uri) {
          await connectMongo(uri);
        }
      } catch {
        /* noop */
      }
      if (mongoose.connection.readyState !== 1) {
        onResult?.({ ok: false, reason: 'cookie-db-offline' });
        return null;
      }
    }
    const condUser = await CondUsuario.findById(cookiePayload.userId);
    if (!condUser) {
      clearPortalSessionCookie(res);
      onResult?.({ ok: false, reason: 'cookie-user-missing' });
      return null;
    }
    const portalSession = await buildPortalSessionPayload(condUser);
    if (req.session) {

            // Se o snapshot do cookie estiver incompleto, evite restaurar uma sessão "meio logada".
            // Em vez disso, tenta reconstruir via DB (quando disponível) para recuperar vinculos/seleção.
            if (isInlineCookieSessionSufficient(cookiePayload.session)) {
              // Normaliza: se tem vínculos mas perdeu seleção, força fluxo de seleção.
              try {
                const hasV = hasVinculos(cookiePayload.session);
                if (hasV && !cookiePayload.session.portal_needs_selection && !hasSelectedContext(cookiePayload.session)) {
                  cookiePayload.session.portal_needs_selection = true;
                  cookiePayload.session.habitacao_id = null;
                  cookiePayload.session.habitacao_label = '';
                }
              } catch { /* noop */ }

              if (req.session) {
                req.session.portalUser = cookiePayload.session;
              }
              setPortalSessionCookie(res, { userId: cookiePayload.userId, session: cookiePayload.session });
              onResult?.({ ok: true, source: 'cookie-inline' });
              return cookiePayload.session;
            }

            onResult?.({ ok: false, reason: 'cookie-inline-incomplete' });
      req.session.portalUser = portalSession;
    }
    setPortalSessionCookie(res, { userId: cookiePayload.userId, session: portalSession });
    onResult?.({ ok: true, source: 'cookie-db-restore' });
    return portalSession;
  } catch (err) {
    console.error('[requirePortalLogin] erro ao restaurar sessão via cookie:', err?.message || err);
    options?.onResult?.({ ok: false, reason: 'cookie-error', detail: err?.message || err });
    return null;
  }
}

function attachPortalUser(req, res, sessionUser) {
  req.portalUser = sessionUser;
  if (!req.user) {
    req.user = sessionUser;
  }
  try {
    res.locals.portalUser = sessionUser;
  } catch (_e) {
    /* noop */
  }
}

function ensurePortalCookie(req, res, sessionUser) {
  try {
    if (req.cookies && req.cookies[PORTAL_SESSION_COOKIE_NAME]) return;
    const userId = sessionUser?.cond_usuario_id || sessionUser?.id;
    if (!userId) return;
    setPortalSessionCookie(res, { userId, session: sessionUser });
  } catch (_err) {
    /* noop */
  }
}

function setAuthDebugHeader(res, info) {
  if (!info) return;
  try {
    const reason = info.reason || info.source || 'unknown';
    res.set('X-Portal-Auth-Debug', reason);
    if (info.detail) {
      res.set('X-Portal-Auth-Detail', String(info.detail).slice(0, 120));
    }
  } catch (_err) {
    /* noop */
  }
}

export default async function requirePortalLogin(req, res, next) {
  try {
    if (req?.skipAuth) return next();
    let authDebug = null;
    let sessionUser = getPortalSession(req);
    if (!sessionUser) {
      sessionUser = await restorePortalSessionFromCookie(req, res, {
        onResult: (info) => {
          authDebug = info;
        }
      });
    } else {
      authDebug = { ok: true, source: 'session' };
    }
    if (sessionUser) {
      ensurePortalCookie(req, res, sessionUser);
      attachPortalUser(req, res, sessionUser);

      // Novo fluxo: exige seleção de Unidade + Habitação antes de acessar o portal.
      try {
        if (sessionUser.portal_needs_selection) {
          const basePath = req?.baseUrl || '/portal-morador';
          const url = String(req.originalUrl || req.url || '');
          const path = url.startsWith(basePath) ? url.slice(basePath.length) : url;
          const allow = (
            path.startsWith('/login') ||
            path.startsWith('/api/auth/context') ||
            path.startsWith('/api/auth/selecionar') ||
            path.startsWith('/logout')
          );
          if (!allow) {
            if (wantsJson(req)) {
              setAuthDebugHeader(res, { ok: false, reason: 'selection-required' });
              return res.status(409).json({ success: false, error: 'PORTAL_SELECTION_REQUIRED', code: 'PORTAL_SELECTION_REQUIRED' });
            }
            setAuthDebugHeader(res, { ok: false, reason: 'selection-required' });
            return res.redirect(basePath + '/login?step=select');
          }
        }
      } catch { /* noop */ }

      // Ajuda a validar se o deploy/middleware está ativo (e qual caminho de auth foi usado).
      setAuthDebugHeader(res, authDebug || { ok: true, source: 'session' });
      return next();
    }

    clearPortalSessionCookie(res);
    if (!authDebug) {
      authDebug = { ok: false, reason: 'no-session' };
    }
    setAuthDebugHeader(res, authDebug);
    const basePath = req?.baseUrl || '/portal-morador';
    if (wantsJson(req)) {
      return res.status(401).json({ success: false, error: 'PORTAL_UNAUTHORIZED', code: 'PORTAL_UNAUTHORIZED' });
    }
    return res.redirect(basePath + '/login');
  } catch (err) {
    console.error('[requirePortalLogin] erro inesperado:', err?.message || err);
    clearPortalSessionCookie(res);
    const basePath = req?.baseUrl || '/portal-morador';
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: 'PORTAL_AUTH_ERROR', code: 'PORTAL_AUTH_ERROR' });
    }
    return res.redirect(basePath + '/login');
  }
}
