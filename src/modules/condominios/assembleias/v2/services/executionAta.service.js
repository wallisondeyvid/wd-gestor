import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import CondAssembleia from '#core/models/cond_assembleia.js';
import CondAssembleiaExecution from '#core/models/cond_assembleia_execution.js';
import { writeAuditLog } from '#modules/condominios/app/lib/auditLog.js';

function safeStr(v, max = 4000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function getCtxUser(req) {
  return req?.ctxUser || req?.user || req?.portalUser || req?.session?.portalUser || req?.session?.user || null;
}

function getActorSource(req) {
  try {
    if (String(req?.headers?.['x-wdg-portal'] || '').trim() === '1') return 'portal';
  } catch {}
  return 'gestor';
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
    if (ctxUser?.perms && typeof ctxUser.perms === 'object' && !Array.isArray(ctxUser.perms)) {
      for (const [k, v] of Object.entries(ctxUser.perms)) {
        if (v === true) push(k);
      }
    }

    try {
      if (ctxUser && typeof ctxUser === 'object') {
        for (const v of Object.values(ctxUser)) {
          if (typeof v === 'string') push(v);
          else if (Array.isArray(v)) v.forEach((it) => push(it));
        }
      }
    } catch {}

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

function buildAtaText(assembleia, execDoc) {
  const quorum = computeQuorum(execDoc);
  const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
  const votes = Array.isArray(execDoc.votes) ? execDoc.votes : [];
  const results = votes.map((v) => voteSummary(v, execDoc));

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

  return { quorum, agenda, results, ataText };
}

export async function getExecutionAtaJson(req, res) {
  const ctxUser = mustControl(req, res);
  if (!ctxUser && !req?.skipAuth) return { kind: 'handled' };

  const { id } = req.params;
  if (!id || !mongoose.isValidObjectId(id)) return { kind: 'error', status: 400, body: { ok: false, error: 'ID inválido' } };

  const [assembleia, execDoc] = await Promise.all([
    CondAssembleia.findById(id).lean(),
    getOrCreateExecution(id)
  ]);
  if (!assembleia || !execDoc) return { kind: 'error', status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

  const { quorum, agenda, results, ataText } = buildAtaText(assembleia, execDoc);

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

  return {
    kind: 'ok',
    body: {
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
          agenda: agenda.map((a) => ({ idx: a.idx, tipo: a.tipo, descricao: a.descricao, timeMs: a.timeMs, state: a.state })),
          votes: results
        },
        ataText
      }
    }
  };
}

export async function getExecutionAtaPdf(req, res) {
  const ctxUser = mustControl(req, res);
  if (!ctxUser && !req?.skipAuth) return { kind: 'handled' };

  const { id } = req.params;
  if (!id || !mongoose.isValidObjectId(id)) return { kind: 'error', status: 400, body: { ok: false, error: 'ID inválido' } };

  const ataRes = await (async () => {
    const [assembleia, execDoc] = await Promise.all([
      CondAssembleia.findById(id).lean(),
      getOrCreateExecution(id)
    ]);
    if (!assembleia || !execDoc) return null;
    const { ataText } = buildAtaText(assembleia, execDoc);
    return { assembleia, execDoc, ataText };
  })();

  if (!ataRes) return { kind: 'error', status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

  const { assembleia, execDoc, ataText } = ataRes;

  const host = String(req.get('host') || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const baseUrl = req.baseUrl || '/condominios';
  const qrUrl = host ? `${proto}://${host}${baseUrl}/administracao/assembleia/execucao?id=${encodeURIComponent(String(id))}` : '';
  const qrPng = qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 }).catch(() => '') : '';

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('error', () => {});

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
    } catch {}
  }

  doc.end();

  const pdfBuf = await new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
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

  return {
    kind: 'pdf',
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="ata-assembleia-${String(id).slice(-6)}.pdf"`
    },
    buffer: pdfBuf
  };
}
