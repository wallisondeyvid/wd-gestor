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

function isPortalRequest(req) {
  try {
    return String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
  } catch {
    return false;
  }
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
    return candidates.some((s) => allowWords.some((w) => s === w || s.includes(w)));
  } catch {
    return false;
  }
}

function mustAuth(req) {
  const ctxUser = getCtxUser(req);
  if (!ctxUser && !req?.skipAuth) {
    return { ok: false, status: 401, body: { ok: false, error: 'Não autenticado' } };
  }
  if (req?.skipAuth) return { ok: true, ctxUser: ctxUser || { email: 'test@example.com', role: 'admin', nome: 'Test' } };
  return { ok: true, ctxUser };
}

function mustControl(req) {
  const auth = mustAuth(req);
  if (!auth.ok) return auth;

  const ctxUser = auth.ctxUser;
  if (req?.skipAuth) return { ok: true, ctxUser };

  if (isPortalRequest(req)) {
    return { ok: false, status: 403, body: { ok: false, error: 'Acesso negado' } };
  }
  if (!isOperatorUser(ctxUser)) {
    return { ok: false, status: 403, body: { ok: false, error: 'Acesso negado' } };
  }
  return { ok: true, ctxUser };
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

export async function executeOpenV2(req, { shadow = false } = {}) {
  const control = mustControl(req);
  if (!control.ok) {
    return { status: control.status, body: control.body };
  }

  const { id } = req.params || {};
  if (!id || !mongoose.isValidObjectId(id)) {
    return { status: 400, body: { ok: false, error: 'ID inválido' } };
  }

  const assembleia = await CondAssembleia.findById(id);
  if (!assembleia) {
    return { status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };
  }

  const convocacaoAt = parseConvocacaoDateTime(assembleia);
  if (convocacaoAt && Date.now() < convocacaoAt.getTime()) {
    return { status: 409, body: { ok: false, error: 'Sessão não pode ser aberta antes da data/hora de convocação', data: { convocacaoAt } } };
  }

  const execDoc = await getOrCreateExecution(id);
  if (!execDoc) {
    return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };
  }

  if (String(execDoc.sessionStatus) === 'encerrada') {
    return { status: 409, body: { ok: false, error: 'Sessão já encerrada' } };
  }
  if (String(execDoc.sessionStatus) !== 'aguardando') {
    return { status: 409, body: { ok: false, error: 'Sessão já está aberta' } };
  }

  const openedAt = new Date();

  if (!shadow) {
    execDoc.sessionStatus = 'aberta';
    execDoc.isPaused = false;
    execDoc.openedAt = openedAt;
    execDoc.pausedAt = null;
    execDoc.pausedMs = 0;
    execDoc.closedAt = null;
    await execDoc.save();
  }

  return { status: 200, body: { ok: true, data: { sessionStatus: 'aberta', openedAt } } };
}
