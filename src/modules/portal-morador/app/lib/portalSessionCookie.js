import crypto from 'crypto';

const COOKIE_NAME = 'wdg_portal';
const DEFAULT_TTL_MS = Number(process.env.PORTAL_COOKIE_TTL_MS || 1000 * 60 * 60 * 8);
const MAX_INLINE_SESSION_BYTES = Number(process.env.PORTAL_COOKIE_MAX_INLINE_BYTES || 3200);
const MAX_COOKIE_VALUE_CHARS = Number(process.env.PORTAL_COOKIE_MAX_CHARS || 3800);
const COOKIE_PATH = process.env.PORTAL_COOKIE_PATH || '/portal-morador';
const COOKIE_CLEAR_PATHS = [COOKIE_PATH, '/'];
const MAX_STRING_DEFAULT = 256;
const MAX_LOGO_CHARS = 512;

function getSecret() {
  return process.env.PORTAL_COOKIE_SECRET || process.env.SESSION_SECRET || 'portal-dev-secret';
}

function signPayload(payload) {
  const json = JSON.stringify(payload);
  const data = Buffer.from(json, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', getSecret());
  const signature = hmac.update(data).digest('base64url');
  return `${data}.${signature}`;
}

function signPayloadCapped(payload, { fallbackUserId, fallbackSession } = {}) {
  const first = signPayload(payload);
  if (typeof first === 'string' && first.length <= MAX_COOKIE_VALUE_CHARS) {
    return first;
  }

  const userId = payload?.userId || fallbackUserId;
  if (!userId) return first;
  const exp = Number(payload?.exp || (Date.now() + DEFAULT_TTL_MS));
  const v = payload?.v || 1;

  if (fallbackSession && typeof fallbackSession === 'object') {
    const tiny = { userId: String(userId), exp, v, session: tinySnapshot(fallbackSession) };
    const tinySigned = signPayload(tiny);
    if (typeof tinySigned === 'string' && tinySigned.length <= MAX_COOKIE_VALUE_CHARS) {
      return tinySigned;
    }
  }

  return signPayload({ userId: String(userId), exp, v });
}

function safeEqual(a, b) {
  try {
    const bufA = Buffer.from(a, 'base64url');
    const bufB = Buffer.from(b, 'base64url');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_e) {
    return a === b;
  }
}

function decodePayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (!payload.exp || payload.exp <= Date.now()) return null;
    if (!payload.userId) return null;
    return payload;
  } catch (_err) {
    return null;
  }
}

function tryParseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function decodeLegacyPortalCookie(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const candidates = new Set();
  const pushCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    candidates.add(trimmed.startsWith('j:') ? trimmed.slice(2) : trimmed);
  };

  pushCandidate(raw);
  try {
    pushCandidate(decodeURIComponent(raw));
  } catch (_err) {
    /* noop */
  }
  ['base64', 'base64url'].forEach((encoding) => {
    try {
      const decoded = Buffer.from(raw, encoding).toString('utf8');
      pushCandidate(decoded);
    } catch (_err) {
      /* noop */
    }
  });

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (!parsed || typeof parsed !== 'object') continue;
    const session = (typeof parsed.session === 'object' && parsed.session) || (typeof parsed.portalUser === 'object' && parsed.portalUser) || null;
    const userId = parsed.userId || parsed.cond_usuario_id || parsed.id || session?.cond_usuario_id || session?.id;
    if (!userId) continue;
    if (session && !session.cond_usuario_id) {
      session.cond_usuario_id = userId;
    }
    return {
      userId: String(userId),
      session: session || null,
      exp: Date.now() + DEFAULT_TTL_MS / 2,
      legacy: true
    };
  }

  return null;
}

function clampString(value, maxChars = MAX_STRING_DEFAULT) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function assignClamped(target, source, key, maxChars) {
  if (!Object.prototype.hasOwnProperty.call(source || {}, key)) return;
  let val = source[key];
  if (typeof val === 'string') {
    val = clampString(val, maxChars || MAX_STRING_DEFAULT);
  }
  target[key] = val;
}

function pickKeys(source, specs) {
  const out = {};
  specs.forEach((spec) => {
    if (!spec) return;
    if (typeof spec === 'string') {
      assignClamped(out, source, spec);
    } else if (spec.key) {
      assignClamped(out, source, spec.key, spec.max);
    }
  });
  return out;
}

function fitsInline(payload) {
  try {
    const bytes = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
    return bytes <= MAX_INLINE_SESSION_BYTES;
  } catch (_err) {
    return false;
  }
}

function projectPortalSession(session) {
  if (!session || typeof session !== 'object') return null;
  const base = pickKeys(session, [
    { key: 'cond_usuario_id', max: 96 },
    { key: 'id', max: 96 },
    { key: 'nome', max: 160 },
    { key: 'email', max: 254 },
    { key: 'telefone', max: 40 },
    { key: 'foto_url', max: 512 },
    { key: 'unidade_id', max: 96 },
    { key: 'unidade_nome', max: 160 },
    { key: 'unidade_codigo', max: 60 },
    { key: 'unidade_logo', max: MAX_LOGO_CHARS },
    { key: 'habitacao_id', max: 96 },
    { key: 'habitacao_label', max: 180 },
    'portal_roles',
    'portal_primeiro_acesso',
    'portal_acesso_ativo',
    'portal_needs_selection'
  ]);
  if (Array.isArray(base.portal_roles)) {
    base.portal_roles = base.portal_roles.slice(0, 4);
  }
  if (Array.isArray(session.vinculos) && session.vinculos.length) {
    base.vinculos = session.vinculos.slice(0, 3).map((v) => pickKeys(v, [
      'unidade_id',
      'unidade_nome',
      'unidade_codigo',
      'habitacao_id',
      'habitacao_label',
      'papeis'
    ]));
    base.vinculos.forEach((v) => {
      if (Array.isArray(v.papeis)) v.papeis = v.papeis.slice(0, 3);
    });
  }
  return base;
}

function minimalSnapshot(session) {
  return pickKeys(session, [
    { key: 'cond_usuario_id', max: 96 },
    { key: 'id', max: 96 },
    { key: 'nome', max: 140 },
    { key: 'email', max: 254 },
    { key: 'foto_url', max: 512 },
    { key: 'unidade_id', max: 96 },
    { key: 'unidade_nome', max: 160 },
    { key: 'unidade_codigo', max: 60 }
  ]);
}

function tinySnapshot(session) {
  const tiny = pickKeys(session, [
    { key: 'cond_usuario_id', max: 96 },
    { key: 'id', max: 96 },
    { key: 'nome', max: 80 },
    { key: 'email', max: 160 }
  ]);
  if (!tiny.cond_usuario_id && tiny.id) {
    tiny.cond_usuario_id = tiny.id;
  }
  if (!tiny.cond_usuario_id && typeof session?.email === 'string') {
    tiny.cond_usuario_id = session.email;
  }
  return tiny;
}

function maybeAttachSession(payload, session) {
  if (!session) return payload;
  try {
    let snapshot = projectPortalSession(session) || minimalSnapshot(session);
    if (snapshot && !fitsInline(snapshot)) {
      delete snapshot.vinculos;
    }
    if (snapshot && !fitsInline(snapshot)) {
      delete snapshot.portal_roles;
    }
    if (snapshot && !fitsInline(snapshot)) {
      snapshot = minimalSnapshot(session);
    }
    if (snapshot && !fitsInline(snapshot)) {
      snapshot = tinySnapshot(session);
    }
    if (snapshot && !fitsInline(snapshot)) {
      snapshot = {
        cond_usuario_id: session?.cond_usuario_id || session?.id || session?.email || `portal-${Date.now()}`
      };
    }
    if (snapshot && fitsInline(snapshot)) {
      payload.session = snapshot;
    }
  } catch (_err) {
    /* ignore */
  }
  return payload;
}

export function setPortalSessionCookie(res, { userId, session, ttlMs } = {}) {
  if (!res || !userId) return;
  const ttl = Number(ttlMs || DEFAULT_TTL_MS);
  const exp = Date.now() + ttl;
  const payload = maybeAttachSession({ userId: String(userId), exp, v: 1 }, session);
  const value = signPayloadCapped(payload, { fallbackUserId: userId, fallbackSession: session });
  try {
    res.cookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ttl,
      path: COOKIE_PATH,
      domain: process.env.PORTAL_COOKIE_DOMAIN || undefined
    });
  } catch (_err) {
    /* noop */
  }
}

export function clearPortalSessionCookie(res) {
  if (!res) return;
  try {
    const domain = process.env.PORTAL_COOKIE_DOMAIN || undefined;
    for (const path of COOKIE_CLEAR_PATHS) {
      res.clearCookie(COOKIE_NAME, { path, domain });
      // Também tenta limpar versão host-only (sem domain), caso cookies antigos tenham sido criados assim.
      if (domain) {
        res.clearCookie(COOKIE_NAME, { path });
      }
    }
  } catch (_err) {
    /* noop */
  }
}

export function readPortalSessionCookie(req) {
  try {
    const candidates = collectCookieCandidates(req);
    for (const raw of candidates) {
      const decoded = decodePayload(raw) || decodeLegacyPortalCookie(raw);
      if (decoded) {
        return decoded;
      }
    }
    return null;
  } catch (_err) {
    return null;
  }
}

export function hasPortalCookieCandidate(req) {
  try {
    if (req?.cookies?.[COOKIE_NAME]) return true;
    const header = req?.headers?.cookie;
    if (header && typeof header === 'string') {
      return header.split(/;\s*/).some((part) => part.trim().startsWith(`${COOKIE_NAME}=`));
    }
    return false;
  } catch (_err) {
    return false;
  }
}

function collectCookieCandidates(req) {
  const values = [];
  const push = (val) => {
    if (!val || typeof val !== 'string') return;
    if (!values.includes(val)) {
      values.push(val);
    }
  };
  push(req?.cookies?.[COOKIE_NAME]);
  const headerValues = getCookiesFromHeader(req);
  headerValues.forEach(push);
  return values;
}

function getCookiesFromHeader(req) {
  try {
    const header = req?.headers?.cookie;
    if (!header || typeof header !== 'string') return [];
    const parts = header.split(/;\s*/);
    const matches = [];
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      if (name !== COOKIE_NAME) continue;
      let value = part.slice(eqIdx + 1);
      if (!value) continue;
      try {
        value = decodeURIComponent(value);
      } catch (_err) {
        /* noop: keep raw value */
      }
      matches.push(value);
    }
    return matches;
  } catch (_err) {
    return [];
  }
}

export const PORTAL_SESSION_COOKIE_NAME = COOKIE_NAME;
export const PORTAL_SESSION_COOKIE_TTL_MS = DEFAULT_TTL_MS;
export const PORTAL_SESSION_COOKIE_INLINE_LIMIT = MAX_INLINE_SESSION_BYTES;
