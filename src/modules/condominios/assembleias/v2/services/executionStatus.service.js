import mongoose from 'mongoose';
import { ExecutionRepository, resolveExecutionUnitScope } from '#modules/condominios/assembleias/v2/repositories/ExecutionRepository.js';

export function safeStr(v, max = 4000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function getCtxUser(req) {
  return req?.ctxUser || req?.user || req?.portalUser || req?.session?.portalUser || req?.session?.user || null;
}

export function mustAuth(req, res) {
  const ctxUser = getCtxUser(req);
  if (!ctxUser && !req?.skipAuth) {
    res.status(401).json({ ok: false, error: 'Não autenticado' });
    return null;
  }
  if (req?.skipAuth) return ctxUser || { email: 'test@example.com', role: 'admin', nome: 'Test' };
  return ctxUser;
}

export function computeSessionClockMs(execDoc) {
  try {
    if (!execDoc?.openedAt) return 0;
    const now = Date.now();
    const openedAt = new Date(execDoc.openedAt).getTime();
    const pausedMs = Number(execDoc.pausedMs || 0) || 0;
    const extraPause = execDoc.isPaused && execDoc.pausedAt ? (now - new Date(execDoc.pausedAt).getTime()) : 0;
    return Math.max(0, now - openedAt - pausedMs - Math.max(0, extraPause));
  } catch {
    return 0;
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

function isRepresentativePresence(p) {
  const role = normalizePresenceRole(p?.presence_role || p?.role || p?.presenceRole || 'REPRESENTANTE');
  return role === PRESENCE_ROLE.REPRESENTANTE;
}

function isRepresentativeConfirmedPresence(p) {
  if (!isRepresentativePresence(p)) return false;
  const status = normalizePresenceStatus(p?.status, PRESENCE_ROLE.REPRESENTANTE);
  return status === PRESENCE_STATUS.CONFIRMED;
}

function computeQuorum(execDoc) {
  const pres = Array.isArray(execDoc?.presences) ? execDoc.presences : [];
  const confirmed = pres.filter((p) => isRepresentativeConfirmedPresence(p));
  const count = confirmed.length;
  const fracao = confirmed.reduce((acc, p) => acc + (Number(p?.fracaoIdeal || 0) || 0), 0);
  return { pessoas: count, fracaoIdeal: fracao, presentCount: count, fracaoIdealPresent: fracao };
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

function getExecutionRepository({ unitScope, req } = {}) {
  const resolvedUnitScope = unitScope || resolveExecutionUnitScope(req);
  return new ExecutionRepository({ unitScope: resolvedUnitScope });
}

function voteSummary(vote, execDoc) {
  const ballots = Array.isArray(vote?.ballots) ? vote.ballots : [];
  const tot = { sim: 0, nao: 0, abstencao: 0, count: 0 };
  for (const b of ballots) {
    const c = String(b?.choice || '').toLowerCase();
    if (c === 'sim') tot.sim += 1;
    else if (c === 'nao') tot.nao += 1;
    else if (c === 'abstencao') tot.abstencao += 1;
    tot.count += 1;
  }
  const quorum = computeQuorum(execDoc);
  return {
    agendaIdx: vote?.agendaIdx ?? 0,
    openedAt: vote?.openedAt || null,
    closedAt: vote?.closedAt || null,
    totals: tot,
    quorum
  };
}

export async function buildExecutionStatusById(id, { unitScope, req } = {}) {
  if (!id || !mongoose.isValidObjectId(id)) {
    return { kind: 'error', status: 400, body: { ok: false, error: 'ID inválido' } };
  }

  const executionRepo = getExecutionRepository({ unitScope, req });
  const execDoc = await executionRepo.getOrCreateExecution(id);
  if (!execDoc) {
    return { kind: 'error', status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };
  }

  const clockMs = computeSessionClockMs(execDoc);
  const quorum = computeQuorum(execDoc);

  const currentIdx = Number(execDoc.currentAgendaIdx || 0) || 0;
  const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
  const currentItem = agenda.find(a => Number(a?.idx) === currentIdx) || agenda[currentIdx] || null;

  const vote = (Array.isArray(execDoc.votes) ? execDoc.votes : []).find(v => Number(v?.agendaIdx) === currentIdx && v?.openedAt && !v?.closedAt) || null;
  const voteSum = vote ? voteSummary(vote, execDoc) : null;
  const openVote = voteSum
    ? {
      agendaIdx: voteSum.agendaIdx,
      openedAt: voteSum.openedAt,
      closedAt: voteSum.closedAt,
      sim: Number(voteSum?.totals?.sim || 0) || 0,
      nao: Number(voteSum?.totals?.nao || 0) || 0,
      abstencao: Number(voteSum?.totals?.abstencao || 0) || 0,
      total: Number(voteSum?.totals?.count || 0) || 0
    }
    : null;

  return {
    kind: 'ok',
    body: {
      ok: true,
      data: {
        assembleiaId: String(execDoc.assembleia_id),
        unidadeId: execDoc.unidade_id ? String(execDoc.unidade_id) : null,
        sessionStatus: execDoc.sessionStatus,
        isPaused: !!execDoc.isPaused,
        openedAt: execDoc.openedAt,
        closedAt: execDoc.closedAt,
        virtualLink: safeStr(execDoc.virtualLink || '', 800),
        sessionClockMs: clockMs,
        quorum,
        currentAgendaIdx: currentIdx,
        agenda: agenda.map(it => ({
          idx: it.idx,
          tipo: safeStr(it.tipo, 80),
          descricao: safeStr(it.descricao, 240),
          state: it.state,
          timeMs: Number(it.timeMs || 0) || 0
        })),
        presences: (Array.isArray(execDoc.presences) ? execDoc.presences : []).map((p) => serializePresence(p)),
        currentItem: currentItem ? {
          idx: currentItem.idx,
          tipo: safeStr(currentItem.tipo, 80),
          descricao: safeStr(currentItem.descricao, 4000),
          state: currentItem.state,
          timeMs: Number(currentItem.timeMs || 0) || 0
        } : null,
        currentAgendaItem: currentItem ? {
          idx: currentItem.idx,
          tipo: safeStr(currentItem.tipo, 80),
          descricao: safeStr(currentItem.descricao, 4000),
          state: currentItem.state,
          timeMs: Number(currentItem.timeMs || 0) || 0
        } : null,
        vote: voteSum,
        openVote,
        events: (Array.isArray(execDoc.events) ? execDoc.events : []).slice(-50)
      }
    }
  };
}
