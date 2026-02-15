import express from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import CondAssembleia from '#core/models/cond_assembleia.js';
import CondAssembleiaExecution from '#core/models/cond_assembleia_execution.js';
import CondUsuario from '#core/models/cond_usuario.js';
import CondMorador from '#core/models/cond_morador.js';
import CondHabitacao from '#core/models/cond_habitacao.js';
import CondProprietario from '#core/models/cond_proprietario.js';
import { writeAuditLog } from '#modules/condominios/app/lib/auditLog.js';
import { verifyPortalPassword } from '#modules/portal-morador/lib/portalAuth.js';
import { executionCloseLogic } from '#modules/condominios/assembleias/shared/executionClose.logic.js';
import { executionPauseLogic } from '#modules/condominios/assembleias/shared/executionPause.logic.js';
import { executionPresenceLogic } from '#modules/condominios/assembleias/shared/executionPresence.logic.js';
import { executionPresenceConfirmLogic } from '#modules/condominios/assembleias/shared/executionPresenceConfirm.logic.js';
import { executionVoteOpenLogic } from '#modules/condominios/assembleias/shared/executionVoteOpen.logic.js';
import { executionVoteLogic } from '#modules/condominios/assembleias/shared/executionVote.logic.js';
import { executionVoteCloseLogic } from '#modules/condominios/assembleias/shared/executionVoteClose.logic.js';
import { executionOpenLogic } from '#modules/condominios/assembleias/shared/executionOpen.logic.js';
import { executionAgendaLogic } from '#modules/condominios/assembleias/shared/executionAgenda.logic.js';

function safeStr(v, max = 4000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function getCtxUser(req) {
  // O módulo Condomínios já implementa getCtxUser internamente.
  // Para rotas isoladas, usamos os campos já injetados pelos middlewares do módulo.
  return req?.ctxUser || req?.user || req?.portalUser || req?.session?.portalUser || req?.session?.user || null;
}

function getActorSource(req) {
  try {
    if (String(req?.headers?.['x-wdg-portal'] || '').trim() === '1') return 'portal';
  } catch { /* noop */ }
  return 'gestor';
}

function isPortalRequest(req) {
  try {
    return String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
  } catch {
    return false;
  }
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

function getPortalPresenceNome(ctxUser) {
  const nome = safeStr(ctxUser?.nome || ctxUser?.name || ctxUser?.userName || ctxUser?.username || '', 140);
  if (nome) return nome;
  const email = safeStr(ctxUser?.email || '', 140);
  return email || 'Morador';
}

function isOperatorUser(ctxUser) {
  try {
    const role = String(ctxUser?.role || '').trim().toLowerCase();
    if (role === 'master' || role === 'admin') return true;
    if (ctxUser?.isMaster) return true;

    const candidates = [];
    const push = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (s) candidates.push(s);
    };

    push(ctxUser?.role);
    push(ctxUser?.perfil);
    push(ctxUser?.nivel);
    push(ctxUser?.nivel_acesso);
    push(ctxUser?.nivelAcesso);
    push(ctxUser?.tipo);
    push(ctxUser?.tipoAcesso);
    push(ctxUser?.roleName);

    const arrs = [ctxUser?.perfis, ctxUser?.permissoes, ctxUser?.perms, ctxUser?.roles, ctxUser?.portal_roles];
    for (const a of arrs) {
      if (!Array.isArray(a)) continue;
      for (const it of a) push(it);
    }
    if (ctxUser?.perms && typeof ctxUser.perms === 'object' && !Array.isArray(ctxUser.perms)) {
      for (const [k, v] of Object.entries(ctxUser.perms)) {
        if (v === true) push(k);
      }
    }

    // Fallback: varrer strings/arrays de nível 1
    try {
      if (ctxUser && typeof ctxUser === 'object') {
        for (const v of Object.values(ctxUser)) {
          if (typeof v === 'string') push(v);
          else if (Array.isArray(v)) v.forEach(it => push(it));
        }
      }
    } catch { /* noop */ }

    const allowWords = [
      'diretor',
      'director',
      'sindico',
      'síndico',
      'conselho',
      'administradora',
      'colaborador',
      'mesa',
      'operador',
      'coordenador',
      'gerente'
    ];
    return candidates.some(s => allowWords.some(w => s === w || s.includes(w)));
  } catch {
    return false;
  }
}

function isControlUser(ctxUser) {
  return isOperatorUser(ctxUser);
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

function mustControl(req, res) {
  const ctxUser = mustAuth(req, res);
  if (!ctxUser && !req?.skipAuth) return null;
  if (req?.skipAuth) return ctxUser || { email: 'test@example.com', role: 'admin', nome: 'Test' };
  // Portal nunca controla sessão
  if (isPortalRequest(req)) {
    res.status(403).json({ ok: false, error: 'Acesso negado' });
    return null;
  }
  if (!isControlUser(ctxUser)) {
    res.status(403).json({ ok: false, error: 'Acesso negado' });
    return null;
  }
  return ctxUser;
}

function parseConvocacaoDateTime(assembleia) {
  try {
    const data = assembleia?.data ? new Date(assembleia.data) : null;
    if (!data || Number.isNaN(data.getTime())) return null;

    const hora = safeStr(assembleia?.horaUnica || assembleia?.hora1 || '');
    if (!hora) return data;

    const m = /^\s*(\d{1,2})\s*:\s*(\d{2})/.exec(hora);
    if (!m) return data;

    const hh = Math.min(23, Math.max(0, Number(m[1])));
    const mm = Math.min(59, Math.max(0, Number(m[2])));

    const dt = new Date(data);
    dt.setHours(hh, mm, 0, 0);
    return dt;
  } catch {
    return null;
  }
}

function computeSessionClockMs(execDoc) {
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

function computeQuorum(execDoc) {
  const pres = Array.isArray(execDoc?.presences) ? execDoc.presences : [];
  const confirmed = pres.filter((p) => isRepresentativeConfirmedPresence(p));
  const count = confirmed.length;
  const fracao = confirmed.reduce((acc, p) => acc + (Number(p?.fracaoIdeal || 0) || 0), 0);
  return { pessoas: count, fracaoIdeal: fracao, presentCount: count, fracaoIdealPresent: fracao };
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

function newPresenceId() {
  try {
    return String(new mongoose.Types.ObjectId());
  } catch {
    return `pres_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

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

function ensurePresenceId(p) {
  if (!p || typeof p !== 'object') return;
  if (!safeStr(p?.presenceId || '', 64)) p.presenceId = newPresenceId();
}

function toObjectOrPlain(v) {
  if (v && typeof v.toObject === 'function') return v.toObject();
  if (v && typeof v === 'object') return v;
  return {};
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

function isRepresentativePresence(p) {
  const role = normalizePresenceRole(p?.presence_role || p?.role || p?.presenceRole || 'REPRESENTANTE');
  return role === PRESENCE_ROLE.REPRESENTANTE;
}

function isRepresentativeConfirmedPresence(p) {
  if (!isRepresentativePresence(p)) return false;
  const status = normalizePresenceStatus(p?.status, PRESENCE_ROLE.REPRESENTANTE);
  return status === PRESENCE_STATUS.CONFIRMED;
}

function isPresenceConfirmed(p) {
  const role = normalizePresenceRole(p?.presence_role || p?.role || 'REPRESENTANTE');
  return normalizePresenceStatus(p?.status, role) === PRESENCE_STATUS.CONFIRMED;
}

function hasOtherConfirmedRepresentative(execDoc, { habitacaoId, excludePresenceId }) {
  const hab = safeStr(habitacaoId || '', 80);
  if (!hab) return false;
  const list = Array.isArray(execDoc?.presences) ? execDoc.presences : [];
  return list.some((p) => {
    const pid = safeStr(p?.presenceId || '', 80);
    const pHab = safeStr(p?.habitacao_id || '', 80);
    if (!pHab || pHab !== hab) return false;
    if (excludePresenceId && pid && pid === excludePresenceId) return false;
    return isRepresentativeConfirmedPresence(p);
  });
}

function finalizePresenceStatus({ role, participantAt, moderatorAt }) {
  if (role === PRESENCE_ROLE.NAO_REPRESENTANTE) return PRESENCE_STATUS.CONFIRMED;
  if (participantAt && moderatorAt) return PRESENCE_STATUS.CONFIRMED;
  if (participantAt) return PRESENCE_STATUS.PENDING_MODERATOR;
  if (moderatorAt) return PRESENCE_STATUS.PENDING_PARTICIPANT;
  return PRESENCE_STATUS.PENDING_PARTICIPANT;
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

function normalizePresenceKey(v) {
  const s = safeStr(v, 90);
  if (!s) return '';
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parsePortalUserIdFromPresenceKey(key) {
  const s = String(key || '').trim().toLowerCase();
  const m = /^portal\s*:\s*([0-9a-f]{24})$/.exec(s);
  return m ? String(m[1]) : '';
}

function buildActorSnapshot(ctxUser, req) {
  try {
    const id = pickUserId(ctxUser, req);
    const email = safeStr(ctxUser?.email || '', 140);
    const nome = safeStr(ctxUser?.nome || ctxUser?.name || '', 140);
    return {
      id: id || null,
      nome: nome || null,
      email: email || null,
      source: getActorSource(req),
      at: new Date()
    };
  } catch {
    return { source: getActorSource(req), at: new Date() };
  }
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

function pushEvent(execDoc, { type, message, actorEmail }) {
  try {
    const arr = execDoc.events || [];
    arr.push({ at: new Date(), type: safeStr(type, 60), message: safeStr(message, 600), actorEmail: safeStr(actorEmail, 120) });
    // Evita crescer infinito (operacional): mantém últimos 200
    execDoc.events = arr.slice(-200);
  } catch {
    /* noop */
  }
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

export default function assembleiaExecutionRoutes() {
  const router = express.Router();

  // Body parsers (não globais no app; aplicamos somente a este router)
  router.use(express.json({ limit: '220kb' }));
  router.use(express.urlencoded({ extended: true, limit: '220kb' }));

  // GET /api/assembleias/:id/execution/status
  router.get('/api/assembleias/:id/execution/status', async (req, res) => {
    try {
      const ctxUser = mustAuth(req, res);
      if (!ctxUser && !req?.skipAuth) return;

      const { id } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

      const execDoc = await getOrCreateExecution(id);
      if (!execDoc) return res.status(404).json({ ok: false, error: 'Assembleia não encontrada' });

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

      return res.json({
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
      });
    } catch (e) {
      console.error('[assembleia-execution][status] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao carregar status' });
    }
  });

  // POST /api/assembleias/:id/execution/open
  router.post('/api/assembleias/:id/execution/open', async (req, res) => {
    const result = await executionOpenLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        CondAssembleia,
        parseConvocacaoDateTime,
        getOrCreateExecution,
        pushEvent,
        safeStr,
        writeAuditLog,
        getActorSource
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/pause
  router.post('/api/assembleias/:id/execution/pause', async (req, res) => {
    const result = await executionPauseLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        getOrCreateExecution,
        pushEvent,
        safeStr,
        getActorSource,
        writeAuditLog
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/close
  router.post('/api/assembleias/:id/execution/close', async (req, res) => {
    const result = await executionCloseLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        getOrCreateExecution,
        pushEvent,
        safeStr,
        getActorSource,
        writeAuditLog
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/presence (compat)
  // Portal: solicitar/confirmar presença de REPRESENTANTE.
  // Gestor: registro de REPRESENTANTE iniciado pelo moderador (ou NÃO REPRESENTANTE quando explicitado).
  router.post('/api/assembleias/:id/execution/presence', async (req, res) => {
    const result = await executionPresenceLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        isPortalRequest,
        mustAuth,
        mustControl,
        getOrCreateExecution,
        PRESENCE_ROLE,
        normalizePresenceRole,
        safeStr,
        getPortalHabitacaoId,
        pickUserId,
        getPortalPresenceKey,
        normalizePresenceKey,
        getPortalPresenceNome,
        toObjectOrPlain,
        finalizePresenceStatus,
        newPresenceId,
        PRESENCE_STATUS,
        hasOtherConfirmedRepresentative,
        buildActorSnapshot,
        isPresenceConfirmed,
        pushEvent,
        writeAuditLog,
        getActorSource,
        computeQuorum,
        serializePresence
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // GET /api/assembleias/:id/execution/presence/me
  // Portal: retorna a presença do usuário logado (se existir)
  router.get('/api/assembleias/:id/execution/presence/me', async (req, res) => {
    try {
      const fromPortal = isPortalRequest(req);
      if (!fromPortal) return res.status(403).json({ ok: false, error: 'Apenas Portal' });
      const ctxUser = mustAuth(req, res);
      if (!ctxUser && !req?.skipAuth) return;

      const { id } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

      const execDoc = await getOrCreateExecution(id);
      if (!execDoc) return res.status(404).json({ ok: false, error: 'Execução não encontrada' });

      const key = getPortalPresenceKey(ctxUser, req);
      const habitacaoId = getPortalHabitacaoId(ctxUser, req);
      const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
      const p = pres.find((x) => {
        const sameKey = normalizePresenceKey(x?.key) === key;
        const sameHab = habitacaoId && String(x?.habitacao_id || '') === habitacaoId;
        return sameKey || sameHab;
      }) || null;

      return res.json({
        ok: true,
        data: p ? serializePresence(p) : null
      });
    } catch (e) {
      console.error('[assembleia-execution][presence/me] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao carregar presença' });
    }
  });

  // POST /api/assembleias/:id/execution/presence/confirm (compat)
  // Gestor: confirma participante (PIN/senha) para presença representante pendente.
  // Body: { presenceId?, presenceKey|key, senha|password }
  router.post('/api/assembleias/:id/execution/presence/confirm', async (req, res) => {
    const result = await executionPresenceConfirmLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        safeStr,
        normalizePresenceKey,
        getOrCreateExecution,
        toObjectOrPlain,
        normalizePresenceRole,
        PRESENCE_ROLE,
        parsePortalUserIdFromPresenceKey,
        CondMorador,
        CondHabitacao,
        CondProprietario,
        CondUsuario,
        verifyPortalPassword,
        finalizePresenceStatus,
        PRESENCE_STATUS,
        hasOtherConfirmedRepresentative,
        pushEvent,
        writeAuditLog,
        getActorSource,
        computeQuorum,
        serializePresence
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /condominios/administracao/assembleia/execution/:id/presencas/representante
  router.post('/condominios/administracao/assembleia/execution/:id/presencas/representante', async (req, res) => {
    req.body = {
      ...(req.body || {}),
      presence_role: PRESENCE_ROLE.REPRESENTANTE,
      requested_by: 'MODERATOR'
    };
    return router.handle({ ...req, url: `/api/assembleias/${req.params.id}/execution/presence`, method: 'POST' }, res, () => res.status(500).json({ ok: false, error: 'Falha ao registrar representante' }));
  });

  // POST /condominios/administracao/assembleia/execution/:id/presencas/nao-representante
  router.post('/condominios/administracao/assembleia/execution/:id/presencas/nao-representante', async (req, res) => {
    req.body = {
      ...(req.body || {}),
      presence_role: PRESENCE_ROLE.NAO_REPRESENTANTE,
      requested_by: 'MODERATOR'
    };
    return router.handle({ ...req, url: `/api/assembleias/${req.params.id}/execution/presence`, method: 'POST' }, res, () => res.status(500).json({ ok: false, error: 'Falha ao registrar não representante' }));
  });

  // POST /condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-moderador
  router.post('/condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-moderador', async (req, res) => {
    try {
      const ctxUser = mustControl(req, res);
      if (!ctxUser && !req?.skipAuth) return;

      const { id, presenceId } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });
      if (!presenceId) return res.status(400).json({ ok: false, error: 'presenceId é obrigatório' });

      const execDoc = await getOrCreateExecution(id);
      if (!execDoc) return res.status(404).json({ ok: false, error: 'Execução não encontrada' });
      if (String(execDoc.sessionStatus) === 'encerrada') return res.status(409).json({ ok: false, error: 'Assembleia encerrada' });

      const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
      const idx = pres.findIndex((p) => String(p?.presenceId || '') === String(presenceId));
      if (idx < 0) return res.status(404).json({ ok: false, error: 'Presença não encontrada' });

      const prevObj = toObjectOrPlain(pres[idx]);
      const role = normalizePresenceRole(prevObj?.presence_role || 'REPRESENTANTE');
      if (role !== PRESENCE_ROLE.REPRESENTANTE) return res.status(409).json({ ok: false, error: 'Ação permitida apenas para representante' });

      const now = new Date();
      const participantAt = prevObj?.confirmed_by_participant_at || null;
      const moderatorAt = now;
      const status = finalizePresenceStatus({ role, participantAt, moderatorAt });

      if (status === PRESENCE_STATUS.CONFIRMED && hasOtherConfirmedRepresentative(execDoc, {
        habitacaoId: prevObj?.habitacao_id ? String(prevObj.habitacao_id) : '',
        excludePresenceId: safeStr(prevObj?.presenceId || '', 80)
      })) {
        return res.status(409).json({ ok: false, error: 'Já existe representante confirmado para esta habitação nesta assembleia' });
      }

      const updated = {
        ...prevObj,
        status,
        requested_by: prevObj?.requested_by || 'PARTICIPANT',
        confirm_method: 'MODERATOR_CLICK',
        confirmed_by_moderator_at: moderatorAt,
        confirmedAt: status === PRESENCE_STATUS.CONFIRMED ? now : (prevObj?.confirmedAt || null),
        confirmedBy: buildActorSnapshot(ctxUser, req),
        updatedAt: now
      };
      pres[idx] = updated;
      execDoc.presences = pres;

      pushEvent(execDoc, {
        type: 'presence_confirmed_moderator',
        message: `Presença validada pelo moderador: ${safeStr(updated?.nome || '')}`,
        actorEmail: safeStr(ctxUser?.email || '')
      });

      await execDoc.save();
      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'presence_confirmed_moderator',
        payload: {
          assemblyId: String(execDoc.assembleia_id),
          presenceId: safeStr(updated?.presenceId || '', 80),
          habitacaoId: updated?.habitacao_id ? String(updated.habitacao_id) : null,
          pessoaId: updated?.pessoa_id ? String(updated.pessoa_id) : null
        }
      });

      if (status === PRESENCE_STATUS.CONFIRMED) {
        await writeAuditLog({
          req,
          ctxUser,
          source: getActorSource(req),
          unidadeId: execDoc.unidade_id,
          assembleiaId: execDoc.assembleia_id,
          entityType: 'assembleia_execution',
          entityId: execDoc._id,
          action: 'presence_confirmed_final',
          payload: {
            assemblyId: String(execDoc.assembleia_id),
            presenceId: safeStr(updated?.presenceId || '', 80),
            habitacaoId: updated?.habitacao_id ? String(updated.habitacao_id) : null,
            pessoaId: updated?.pessoa_id ? String(updated.pessoa_id) : null
          }
        });
      }

      const quorum = computeQuorum(execDoc);
      return res.json({ ok: true, data: { quorum, presence: serializePresence(updated), presences: execDoc.presences.slice(-200).map((p) => serializePresence(p)) } });
    } catch (e) {
      console.error('[assembleia-execution][confirmar-moderador] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao confirmar presença pelo moderador' });
    }
  });

  // POST /condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-pin
  router.post('/condominios/administracao/assembleia/execution/:id/presencas/:presenceId/confirmar-pin', async (req, res) => {
    req.body = {
      ...(req.body || {}),
      presenceId: req.params?.presenceId || req.body?.presenceId || ''
    };
    return router.handle({ ...req, url: `/api/assembleias/${req.params.id}/execution/presence/confirm`, method: 'POST' }, res, () => res.status(500).json({ ok: false, error: 'Falha ao confirmar por PIN' }));
  });

  // POST /api/assembleias/:id/execution/agenda
  // Body: { action: 'start_discussion'|'next'|'prev'|'set', idx? }
  router.post('/api/assembleias/:id/execution/agenda', async (req, res) => {
    const result = await executionAgendaLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        getOrCreateExecution,
        safeStr,
        pushEvent,
        writeAuditLog,
        getActorSource
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/vote/open
  // Body: { voteType, ruleType }
  router.post('/api/assembleias/:id/execution/vote/open', async (req, res) => {
    const result = await executionVoteOpenLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        getOrCreateExecution,
        safeStr,
        pushEvent,
        writeAuditLog,
        getActorSource
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/vote
  // Body: { presenceKey, choice, source }
  router.post('/api/assembleias/:id/execution/vote', async (req, res) => {
    const result = await executionVoteLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        isPortalRequest,
        mustAuth,
        mustControl,
        getOrCreateExecution,
        normalizePresenceKey,
        getPortalPresenceKey,
        safeStr,
        normalizePresenceRole,
        normalizePresenceStatus,
        PRESENCE_ROLE,
        PRESENCE_STATUS,
        pushEvent,
        writeAuditLog,
        voteSummary
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // POST /api/assembleias/:id/execution/vote/close
  router.post('/api/assembleias/:id/execution/vote/close', async (req, res) => {
    const result = await executionVoteCloseLogic({
      req,
      res,
      shadow: false,
      deps: {
        mongoose,
        mustControl,
        getOrCreateExecution,
        pushEvent,
        safeStr,
        writeAuditLog,
        getActorSource,
        voteSummary
      }
    });
    if (result?.handled) return;
    return res.status(result.status).json(result.body);
  });

  // GET /api/assembleias/:id/execution/ata
  router.get('/api/assembleias/:id/execution/ata', async (req, res) => {
    try {
      const ctxUser = mustControl(req, res);
      if (!ctxUser && !req?.skipAuth) return;

      const { id } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

      const [assembleia, execDoc] = await Promise.all([
        CondAssembleia.findById(id).lean(),
        getOrCreateExecution(id)
      ]);
      if (!assembleia || !execDoc) return res.status(404).json({ ok: false, error: 'Assembleia não encontrada' });

      const quorum = computeQuorum(execDoc);
      const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
      const votes = Array.isArray(execDoc.votes) ? execDoc.votes : [];

      const results = votes.map(v => voteSummary(v, execDoc));

      const ataText = [
        `ATA – ${safeStr(assembleia.titulo || 'Assembleia', 240)}`,
        `Data: ${assembleia.data ? new Date(assembleia.data).toLocaleDateString('pt-BR') : '—'}`,
        `Modalidade: ${safeStr(assembleia.modalidade || '—', 40)}`,
        assembleia.link ? `Link: ${safeStr(assembleia.link, 800)}` : '',
        '',
        `Status da sessão: ${safeStr(execDoc.sessionStatus, 30)}${execDoc.isPaused ? ' (pausada)' : ''}`,
        execDoc.openedAt ? `Abertura: ${new Date(execDoc.openedAt).toLocaleString('pt-BR')}` : '',
        execDoc.closedAt ? `Encerramento: ${new Date(execDoc.closedAt).toLocaleString('pt-BR')}` : '',
        '',
        `Presenças confirmadas: ${quorum.pessoas}`,
        `Fração ideal presente (somatório): ${quorum.fracaoIdeal}`,
        '',
        'Pauta e deliberações:',
        ...agenda.map((it) => `- Item ${Number(it.idx) + 1}: ${safeStr(it.tipo || '', 80)} – ${safeStr(it.descricao || '', 260)}`),
        '',
        'Votações:',
        ...results.map((r) => {
          const t = r?.totals || {};
          return `- Item ${Number(r.agendaIdx) + 1}: SIM=${t.sim || 0}, NÃO=${t.nao || 0}, ABSTENÇÃO=${t.abstencao || 0}`;
        })
      ].filter(Boolean).join('\n');

      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.ata.view',
        payload: { length: ataText.length }
      });

      return res.json({
        ok: true,
        data: {
          assembleia: {
            _id: String(assembleia._id),
            titulo: assembleia.titulo || '',
            data: assembleia.data || null,
            modalidade: assembleia.modalidade || '',
            local: assembleia.local || '',
            link: assembleia.link || ''
          },
          execution: {
            sessionStatus: execDoc.sessionStatus,
            isPaused: !!execDoc.isPaused,
            openedAt: execDoc.openedAt,
            closedAt: execDoc.closedAt,
            quorum,
            agenda: agenda.map(a => ({ idx: a.idx, tipo: a.tipo, descricao: a.descricao, timeMs: a.timeMs, state: a.state })),
            votes: results
          },
          ataText
        }
      });
    } catch (e) {
      console.error('[assembleia-execution][ata] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao gerar ata' });
    }
  });

  // GET /api/assembleias/:id/execution/ata.pdf
  router.get('/api/assembleias/:id/execution/ata.pdf', async (req, res) => {
    try {
      const ctxUser = mustControl(req, res);
      if (!ctxUser && !req?.skipAuth) return;

      const { id } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

      const ataRes = await (async () => {
        const [assembleia, execDoc] = await Promise.all([
          CondAssembleia.findById(id).lean(),
          getOrCreateExecution(id)
        ]);
        if (!assembleia || !execDoc) return null;
        const quorum = computeQuorum(execDoc);
        const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
        const votes = Array.isArray(execDoc.votes) ? execDoc.votes : [];
        const results = votes.map(v => voteSummary(v, execDoc));
        const ataText = [
          `ATA – ${safeStr(assembleia.titulo || 'Assembleia', 240)}`,
          `Data: ${assembleia.data ? new Date(assembleia.data).toLocaleDateString('pt-BR') : '—'}`,
          `Modalidade: ${safeStr(assembleia.modalidade || '—', 40)}`,
          assembleia.link ? `Link: ${safeStr(assembleia.link, 800)}` : '',
          '',
          `Status da sessão: ${safeStr(execDoc.sessionStatus, 30)}${execDoc.isPaused ? ' (pausada)' : ''}`,
          execDoc.openedAt ? `Abertura: ${new Date(execDoc.openedAt).toLocaleString('pt-BR')}` : '',
          execDoc.closedAt ? `Encerramento: ${new Date(execDoc.closedAt).toLocaleString('pt-BR')}` : '',
          '',
          `Presenças confirmadas: ${quorum.pessoas}`,
          `Fração ideal presente (somatório): ${quorum.fracaoIdeal}`,
          '',
          'Pauta e deliberações:',
          ...agenda.map((it) => `- Item ${Number(it.idx) + 1}: ${safeStr(it.tipo || '', 80)} – ${safeStr(it.descricao || '', 260)}`),
          '',
          'Votações:',
          ...results.map((r) => {
            const t = r?.totals || {};
            return `- Item ${Number(r.agendaIdx) + 1}: SIM=${t.sim || 0}, NÃO=${t.nao || 0}, ABSTENÇÃO=${t.abstencao || 0}`;
          })
        ].filter(Boolean).join('\n');
        return { assembleia, execDoc, ataText };
      })();

      if (!ataRes) return res.status(404).json({ ok: false, error: 'Assembleia não encontrada' });

      const { assembleia, execDoc, ataText } = ataRes;

      // URL para QR (best-effort)
      const host = String(req.get('host') || '').trim();
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const baseUrl = req.baseUrl || '/condominios';
      const qrUrl = host ? `${proto}://${host}${baseUrl}/administracao/assembleia/execucao?id=${encodeURIComponent(String(id))}` : '';
      const qrPng = qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 }).catch(() => '') : '';

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', () => { /* noop */ });

      doc.fontSize(16).text('Ata da Assembleia', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#111827').text(`Título: ${safeStr(assembleia.titulo || '', 240)}`);
      doc.text(`Data: ${assembleia.data ? new Date(assembleia.data).toLocaleDateString('pt-BR') : '—'}`);
      doc.text(`Modalidade: ${safeStr(assembleia.modalidade || '—', 40)}`);
      if (assembleia.link) doc.text(`Link: ${safeStr(assembleia.link, 800)}`);
      doc.moveDown(0.75);
      doc.fontSize(10).fillColor('#0f172a').text(ataText, { align: 'left' });

      if (qrPng) {
        try {
          const b64 = String(qrPng).split(',')[1] || '';
          const buf = Buffer.from(b64, 'base64');
          doc.addPage();
          doc.fontSize(14).fillColor('#111827').text('QR de referência', { align: 'center' });
          doc.moveDown(1);
          doc.image(buf, { fit: [240, 240], align: 'center' });
          doc.moveDown(0.5);
          doc.fontSize(9).fillColor('#334155').text(qrUrl, { align: 'center' });
        } catch { /* noop */ }
      }

      doc.end();

      const pdfBuf = await new Promise((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        // safety: se 'end' não disparar, resolve no próximo tick com o que tiver
        setTimeout(() => resolve(Buffer.concat(chunks)), 2000);
      });

      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.ata.export_pdf',
        payload: { bytes: pdfBuf.length }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="ata-assembleia-${String(id).slice(-6)}.pdf"`);
      return res.status(200).send(pdfBuf);
    } catch (e) {
      console.error('[assembleia-execution][ata.pdf] erro:', e);
      return res.status(500).json({ ok: false, error: 'Falha ao exportar ata' });
    }
  });

  return router;
}

export {
  mustAuth,
  mustControl,
  getOrCreateExecution,
  pushEvent,
  safeStr,
  getActorSource,
  writeAuditLog,
  isPortalRequest,
  PRESENCE_ROLE,
  PRESENCE_STATUS,
  normalizePresenceRole,
  normalizePresenceStatus,
  getPortalHabitacaoId,
  pickUserId,
  getPortalPresenceKey,
  normalizePresenceKey,
  getPortalPresenceNome,
  toObjectOrPlain,
  finalizePresenceStatus,
  newPresenceId,
  hasOtherConfirmedRepresentative,
  buildActorSnapshot,
  isPresenceConfirmed,
  computeQuorum,
  serializePresence
  ,
  parsePortalUserIdFromPresenceKey
  ,
  voteSummary,
  parseConvocacaoDateTime
};
