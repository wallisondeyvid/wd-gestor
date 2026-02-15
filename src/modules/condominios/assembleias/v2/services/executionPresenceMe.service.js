import mongoose from 'mongoose';
import CondAssembleia from '#core/models/cond_assembleia.js';
import CondAssembleiaExecution from '#core/models/cond_assembleia_execution.js';

function safeStr(v, max = 4000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function getCtxUser(req) {
  return req?.ctxUser || req?.user || req?.portalUser || req?.session?.portalUser || req?.session?.user || null;
}

function mustAuth(req, res) {
  const ctxUser = getCtxUser(req);
  if (!ctxUser && !req?.skipAuth) {
    res.status(401).json({ ok: false, error: 'Não autenticado' });
    return null;
  }
  if (req?.skipAuth) return ctxUser || { email: 'test@example.com', role: 'admin', nome: 'Test' };
  return ctxUser;
}

function isPortalRequest(req) {
  try {
    return String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
  } catch {
    return false;
  }
}

function normalizePresenceKey(v) {
  const s = safeStr(v, 90);
  if (!s) return '';
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pickUserId(ctxUser, req) {
  const pick = (v) => {
    if (!v) return '';
    if (typeof v === 'object') return String(v._id || v.id || '').trim();
    return String(v).trim();
  };
  const fromCookie = safeStr(req?.__wdgPortalCookieUserId || '', 120);
  return (
    safeStr(ctxUser?.cond_usuario_id || '', 120)
    || safeStr(ctxUser?.userId || '', 120)
    || safeStr(ctxUser?.usuarioId || '', 120)
    || safeStr(ctxUser?.usuario_id || '', 120)
    || pick(ctxUser?._id)
    || pick(ctxUser?.id)
    || fromCookie
    || safeStr(ctxUser?.email || '', 120)
  );
}

function getPortalPresenceKey(ctxUser, req) {
  const id = pickUserId(ctxUser, req);
  const raw = id ? `portal:${id}` : 'portal:unknown';
  return normalizePresenceKey(raw);
}

function getPortalHabitacaoId(ctxUser, req) {
  const b = safeStr(req?.body?.habitacaoId || req?.body?.habitacao_id || req?.query?.hab || '', 80);
  const fromUser = safeStr(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '', 80);
  if (fromUser) return fromUser;
  if (b) return b;
  try {
    const vinculos = Array.isArray(ctxUser?.vinculos) ? ctxUser.vinculos : [];
    const first = vinculos.find((v) => safeStr(v?.habitacao_id || v?.habitacaoId || '', 80));
    return safeStr(first?.habitacao_id || first?.habitacaoId || '', 80);
  } catch {
    return '';
  }
}

const PRESENCE_ROLE = {
  REPRESENTANTE: 'REPRESENTANTE',
  NAO_REPRESENTANTE: 'NAO_REPRESENTANTE'
};

const PRESENCE_STATUS = {
  PENDING_PARTICIPANT: 'PENDING_PARTICIPANT',
  PENDING_MODERATOR: 'PENDING_MODERATOR',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED'
};

function normalizePresenceRole(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === PRESENCE_ROLE.NAO_REPRESENTANTE || s === 'NAO-REPRESENTANTE') return PRESENCE_ROLE.NAO_REPRESENTANTE;
  return PRESENCE_ROLE.REPRESENTANTE;
}

function normalizePresenceStatus(v, role = PRESENCE_ROLE.REPRESENTANTE) {
  const s = String(v || '').trim().toUpperCase();
  if (s === PRESENCE_STATUS.PENDING_PARTICIPANT || s === PRESENCE_STATUS.PENDING_MODERATOR || s === PRESENCE_STATUS.CONFIRMED || s === PRESENCE_STATUS.REJECTED || s === PRESENCE_STATUS.CANCELED) {
    return s;
  }
  const legacy = String(v || '').trim().toLowerCase();
  if (legacy === 'confirmado' || legacy === 'aprovado') return PRESENCE_STATUS.CONFIRMED;
  if (legacy === 'pendente') return role === PRESENCE_ROLE.NAO_REPRESENTANTE ? PRESENCE_STATUS.CONFIRMED : PRESENCE_STATUS.PENDING_PARTICIPANT;
  if (legacy === 'recusado' || legacy === 'ausente') return PRESENCE_STATUS.REJECTED;
  return role === PRESENCE_ROLE.NAO_REPRESENTANTE ? PRESENCE_STATUS.CONFIRMED : PRESENCE_STATUS.PENDING_PARTICIPANT;
}

function serializePresence(p) {
  const role = normalizePresenceRole(p?.presence_role || p?.role || 'REPRESENTANTE');
  const status = normalizePresenceStatus(p?.status, role);
  return {
    presenceId: safeStr(p?.presenceId, 80),
    key: safeStr(p?.key, 90),
    nome: safeStr(p?.nome, 240),
    status,
    role,
    presence_role: role,
    habitacaoId: p?.habitacao_id ? String(p.habitacao_id) : null,
    pessoaId: p?.pessoa_id ? String(p.pessoa_id) : null,
    fracaoIdeal: Number(p?.fracaoIdeal || 0) || 0,
    source: safeStr(p?.source, 30),
    requestedBy: safeStr(p?.requested_by, 40),
    confirmMethod: safeStr(p?.confirm_method, 40),
    confirmedAt: p?.confirmedAt || null,
    confirmedByParticipantAt: p?.confirmed_by_participant_at || null,
    confirmedByModeratorAt: p?.confirmed_by_moderator_at || null,
    canVote: role === PRESENCE_ROLE.REPRESENTANTE && status === PRESENCE_STATUS.CONFIRMED,
    updatedAt: p?.updatedAt || null
  };
}

async function getOrCreateExecution(assembleiaId) {
  let execDoc = await CondAssembleiaExecution.findOne({ assembleia_id: assembleiaId });
  if (execDoc) return execDoc;

  const assembleia = await CondAssembleia.findById(assembleiaId).lean();
  if (!assembleia) return null;

  const agenda = (Array.isArray(assembleia.pauta) ? assembleia.pauta : []).map((it, idx) => ({
    idx,
    tipo: safeStr(it?.tipo || '', 80),
    descricao: safeStr(it?.descricao || '', 4000),
    state: idx === 0 ? 'pendente' : 'pendente',
    discussionStartedAt: null,
    discussionEndedAt: null,
    timeMs: 0
  }));

  execDoc = await CondAssembleiaExecution.create({
    assembleia_id: assembleia._id,
    unidade_id: assembleia.unidade_id || null,
    sessionStatus: 'aguardando',
    isPaused: false,
    openedAt: null,
    pausedAt: null,
    pausedMs: 0,
    closedAt: null,
    virtualLink: safeStr(assembleia.link || '', 800),
    currentAgendaIdx: 0,
    presences: [],
    agenda,
    votes: [],
    events: []
  });

  return execDoc;
}

export async function getPresenceMeByExecutionId(req, res) {
  const fromPortal = isPortalRequest(req);
  if (!fromPortal) return { kind: 'error', status: 403, body: { ok: false, error: 'Apenas Portal' } };

  const ctxUser = mustAuth(req, res);
  if (!ctxUser && !req?.skipAuth) return { kind: 'handled' };

  const { id } = req.params;
  if (!id || !mongoose.isValidObjectId(id)) return { kind: 'error', status: 400, body: { ok: false, error: 'ID inválido' } };

  const execDoc = await getOrCreateExecution(id);
  if (!execDoc) return { kind: 'error', status: 404, body: { ok: false, error: 'Execução não encontrada' } };

  const key = getPortalPresenceKey(ctxUser, req);
  const habitacaoId = getPortalHabitacaoId(ctxUser, req);
  const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
  const p = pres.find((x) => {
    const sameKey = normalizePresenceKey(x?.key) === key;
    const sameHab = habitacaoId && String(x?.habitacao_id || '') === habitacaoId;
    return sameKey || sameHab;
  }) || null;

  return {
    kind: 'ok',
    body: {
      ok: true,
      data: p ? serializePresence(p) : null
    }
  };
}
