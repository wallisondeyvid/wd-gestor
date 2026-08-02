import path from 'path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import crypto from 'crypto';
import { put, del } from '@vercel/blob';
import { connectMongo } from '#core/db/connect.js';
import { createUnitScope } from '#shared/unitScope.js';
import { DocumentosPort } from '#shared/ports/documentos.port.js';
// Reutiliza API de usuário do módulo Gestor (perfil/foto/senha)
import gestorUserApi from '#modules/gestor/app/routes/userApi.js';
import { excluirUsuario as gestorExcluirUsuario } from '#modules/gestor/app/controllers/userController.js';
import User from '#models/user.js'; // apenas leitura (Gestor)
import CondUsuario from '#models/cond_usuario.js';
import Funcionario from '#models/Funcionario.js';
// Models do módulo Condomínios
import CondHabitacao from '#models/cond_habitacao.js';
import CondMorador from '#models/cond_morador.js';
import CondProprietario from '#models/cond_proprietario.js';
import CondBloco from '#models/cond_bloco.js';
import CondAndar from '#models/cond_andar.js';
import CondVagaGaragem from '#models/cond_vaga_garagem.js';
import CondAreaComum from '#models/cond_area_comum.js';
import CondAreaCessao from '#models/cond_area_cessao.js';
import CondNatMaterial from '#models/cond_nat_material.js';
import CondBemMaterial from '#models/cond_bem_material.js';
import CondQRCodeMaterial from '#models/cond_qrcode_material.js';
import CondMaterialTransferencia from '#models/cond_material_transferencia.js';
import CondVisitante from '#models/cond_visitante.js';
import CondAcessoMorador from '#models/cond_acesso_morador.js';
import { issuePortalInvite } from '#modules/portal-morador/lib/portalAuth.js';
import { readPortalSessionCookie } from '#modules/portal-morador/app/lib/portalSessionCookie.js';
import CondSolicitacaoServico from '#models/cond_solicitacao_servico.js';
import {
  notifyServicoStatusPush,
  notifyVisitaChegadaPush,
  notifyEnqueteNovaPush,
  notifyComunicadoNovoPush,
  sendPortalPush,
  isPortalPushConfigured
} from '#modules/portal-morador/lib/pushNotifications.js';
import CondEnquete from '#models/cond_enquete.js';
import CondEnqueteVoto from '#models/cond_enquete_voto.js';
import CondComunicado from '#models/cond_comunicado.js';
import CondAssembleia from '#models/cond_assembleia.js';
import CondAssembleiaExecution from '#models/cond_assembleia_execution.js';
import CondAssembleiaSettings from '#models/cond_assembleia_settings.js';
import mountAssembleias from '#modules/condominios/assembleias/index.js';
import { requireUnitScope } from '#modules/condominios/app/middlewares/requireUnitScope.js';
import { handleGetAndaresV2, handleGetAndarByIdV2, handleGetAndaresRelacionadosV2, setHandleGetAndaresV2Context } from '#modules/condominios/app/v2/routes/andares.routes.js';
import { handleGetBlocosV2 as handleGetBlocosV2Raw, handleGetBlocoByIdV2, handleGetBlocosRelacionadosV2, handlePostBlocosV2 as handlePostBlocosV2Raw, handlePutBlocosV2 as handlePutBlocosV2Raw, handleDeleteBlocosV2 as handleDeleteBlocosV2Raw, setHandleGetBlocosV2Context } from '#modules/condominios/app/v2/routes/blocos.routes.js';
import { handleGetUnidadesV2, handleGetUnidadeByIdV2 as handleGetUnidadeByIdV2Raw, handleGetUnidadesRelacionadasV2, setHandleGetUnidadesV2Context } from '#modules/condominios/app/v2/routes/unidades.routes.js';
import { listarUnidadesService, obterUnidadePorIdService, listarUnidadesRelacionadasService } from '#modules/condominios/app/services/unidades.service.js';
import { UnidadesReadRepository } from '#modules/condominios/app/repositories/UnidadesReadRepository.js';
import { listarBlocosService, obterBlocoPorIdService, listarBlocosRelacionadosService, criarBlocoService, atualizarBlocoService, excluirBlocoService } from '#modules/condominios/app/services/blocos.service.js';
import { listarAndaresService, obterAndarPorIdService, listarAndaresRelacionadosService } from '#modules/condominios/app/services/andares.service.js';
import DocumentoValidado from '#models/DocumentoValidado.js';
import CondMsgMailbox from '#models/cond_msg_mailbox.js';
import CondMsgSettings from '#models/cond_msg_settings.js';
import CondDirigenciaSettings from '#models/cond_dirigencia_settings.js';
import CondDirigenciaCargo from '#models/cond_dirigencia_cargo.js';
import CondDirigenciaMandato from '#models/cond_dirigencia_mandato.js';
import CondMsgMessage from '#models/cond_msg_message.js';
import PDFDocument from 'pdfkit';
// Service de criação de usuário com senha provisória (reutiliza fluxo do Gestor)
// Não criar usuários no módulo Gestor a partir do Condomínios
// Helper: localizar ou criar CondUsuario com fallback por email e cpf+unidade
async function findOrCreateCondUsuario({ email, cpfDigits, unidadeId, fields }){
  const emailNorm = (email||'').toString().trim().toLowerCase();
  const emailRx = emailNorm ? new RegExp('^\\s*' + escapeRegExp(emailNorm) + '\\s*$', 'i') : null;
  let doc = null;
  if(emailNorm){
    doc = await CondUsuario.findOne({ email: emailNorm });
    // Compat/legado: alguns registros antigos podem ter e-mail com case diferente.
    if(!doc && emailRx) doc = await CondUsuario.findOne({ email: emailRx });
  }
  if(!doc && cpfDigits){
    try { doc = await CondUsuario.findOne({ cpf: cpfDigits, ...(unidadeId ? { unidade_id: unidadeId } : {}) }); } catch(_e){}
  }
  if(!doc){
    doc = new CondUsuario({
      email: emailNorm || undefined,
      cpf: cpfDigits || '',
      unidade_id: unidadeId || null,
      ativo: true
    });
  }
  else if(unidadeId){
    const currentUnit = doc.unidade_id ? String(doc.unidade_id) : '';
    const desiredUnit = String(unidadeId);
    if(!currentUnit || currentUnit !== desiredUnit){
      doc.unidade_id = unidadeId;
    }
  }

  // Normaliza o e-mail persistido para lowercase quando conhecido.
  if (doc && emailNorm) {
    const curr = String(doc.email || '').trim().toLowerCase();
    if (curr !== emailNorm) doc.email = emailNorm;
  }
  // Atualiza campos pessoais se fornecidos
  try { await updateUserPersonalFields(doc, fields||{}); } catch(_e){}
  // Tenta salvar, tratando violação de índice
  try { await doc.save(); }
  catch(err){
    const msg = String(err && err.message || '');
    if(/E11000/.test(msg)){
      // Recarrega por email ou cpf (unidade)
      try {
        if (emailNorm) {
          doc = await CondUsuario.findOne({ email: emailNorm });
          if (!doc && emailRx) doc = await CondUsuario.findOne({ email: emailRx });
        } else {
          doc = await CondUsuario.findOne({ cpf: cpfDigits, ...(unidadeId ? { unidade_id: unidadeId } : {}) });
        }
        if(doc){
          if(unidadeId){
            const currentUnit = doc.unidade_id ? String(doc.unidade_id) : '';
            const desiredUnit = String(unidadeId);
            if(!currentUnit || currentUnit !== desiredUnit){
              doc.unidade_id = unidadeId;
            }
          }
          if (emailNorm) {
            const curr = String(doc.email || '').trim().toLowerCase();
            if (curr !== emailNorm) doc.email = emailNorm;
          }
          await updateUserPersonalFields(doc, fields||{});
          await doc.save();
        }
      } catch(_e2){}
    } else { throw err; }
  }
  return doc;
}
// Helper: atualiza campos pessoais no User sem apagar dados não enviados
async function updateUserPersonalFields(userDoc, fields){
  if(!userDoc || !fields) return userDoc;
  try{
    const {
      nome, rg, cpf, data_nascimento, sexo,
      pai, mae, telefone, whatsapp
    } = fields;
    if(nome !== undefined) userDoc.nome = String(nome||'').trim();
    if(rg !== undefined) userDoc.rg = String(rg||'').trim();
    if(cpf !== undefined) userDoc.cpf = String(cpf||'').replace(/\D/g,'');
    if(data_nascimento !== undefined){
      let dt = null; try {
        const s = String(data_nascimento||'').trim();
        if(!s) dt = null; else {
          const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (m) dt = new Date(+m[3], +m[2]-1, +m[1]); else dt = new Date(s);
          if (isNaN(dt)) dt = null;
        }
      } catch { dt = null; }
      userDoc.data_nascimento = dt;
    }
    if(sexo !== undefined) userDoc.sexo = String(sexo||'N');
    if(pai !== undefined) userDoc.pai = String(pai||'');
    if(mae !== undefined) userDoc.mae = String(mae||'');
    if(telefone !== undefined) userDoc.telefone = String(telefone||'').replace(/\D/g,'');
    if(whatsapp !== undefined) userDoc.whatsapp = !!whatsapp;
    await userDoc.save();
  } catch(_e) {}
  return userDoc;
}

const SEXO_LABEL_MAP = {
  M: 'Masculino',
  F: 'Feminino',
  O: 'Outro',
  N: 'Não informado'
};

function normalizeSexoCode(value){
  if(value === null || value === undefined) return '';
  const text = String(value).trim();
  if(!text) return '';
  const simple = text.toUpperCase();
  if(SEXO_LABEL_MAP[simple]) return simple;
  const lower = text.toLowerCase();
  if(lower === 'm' || lower.startsWith('masc')) return 'M';
  if(lower === 'f' || lower.startsWith('fem')) return 'F';
  if(lower.startsWith('out')) return 'O';
  if(lower.startsWith('n')) return 'N';
  return '';
}

function resolveSexoLabelFromCode(code, fallback){
  const normalized = normalizeSexoCode(code);
  if(normalized) return SEXO_LABEL_MAP[normalized] || fallback || '';
  return fallback || '';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const app = express();

function unidadesReadRepoFromReq(req) {
  return new UnidadesReadRepository({ unitScope: getUnitScope(req) });
}

function getUnitScope(req) {
  if (req?.unitScope) return req.unitScope;
  if (req?.ctx?.unitScope) return req.ctx.unitScope;
  return { type: 'global', unidadeId: null };
}

function withRequiredUnitScope(handler) {
  return (req, res, next) => requireUnitScope(req, res, () => handler(req, res, next));
}

const handlePostBlocosV1Scoped = withRequiredUnitScope(handlePostBlocosV1);
const handleGetUnidadeByIdV2 = withRequiredUnitScope(handleGetUnidadeByIdV2Raw);
const handleGetBlocosV2 = withRequiredUnitScope(handleGetBlocosV2Raw);
const handleGetBlocoByIdV2Scoped = withRequiredUnitScope(handleGetBlocoByIdV2);
const handleGetBlocosRelacionadosV2Scoped = withRequiredUnitScope(handleGetBlocosRelacionadosV2);
const handleGetAndarByIdV2Scoped = withRequiredUnitScope(handleGetAndarByIdV2);
const handleGetAndaresRelacionadosV2Scoped = withRequiredUnitScope(handleGetAndaresRelacionadosV2);
const handleGetUnidadesRelacionadasV2Scoped = withRequiredUnitScope(handleGetUnidadesRelacionadasV2);
const handlePostBlocosV2 = withRequiredUnitScope(handlePostBlocosV2Raw);
const handlePutBlocosV2 = withRequiredUnitScope(handlePutBlocosV2Raw);
const handleDeleteBlocosV2 = withRequiredUnitScope(handleDeleteBlocosV2Raw);

// Retenção: remove enquetes finalizadas/encerradas após 3 meses para evitar crescimento do banco
const ENQUETE_RETENTION_MONTHS = 3;
const ENQUETE_CLEANUP_BATCH = 500;
let enqueteCleanupScheduled = false;
const backgroundTimers = [];

function registerTimer(t) {
  backgroundTimers.push(t);
  return t;
}

function getEnqueteRetentionCutoff(now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - ENQUETE_RETENTION_MONTHS);
  return d;
}

async function cleanupOldEnquetesOnce() {
  if (mongoose.connection.readyState !== 1) return { ok: false, skipped: true, reason: 'mongo-not-connected' };

  const cutoff = getEnqueteRetentionCutoff(new Date());
  let deletedEnquetes = 0;
  let deletedVotos = 0;

  for (;;) {
    const docs = await CondEnquete.find({
      $or: [
        { finalizadaEm: { $type: 'date', $lte: cutoff } },
        { finalizadaEm: null, vigencia_fim: { $type: 'date', $lte: cutoff } }
      ]
    })
      .select('_id')
      .limit(ENQUETE_CLEANUP_BATCH)
      .lean();

    const ids = (Array.isArray(docs) ? docs : []).map(d => d?._id).filter(Boolean);
    if (!ids.length) break;

    const vr = await CondEnqueteVoto.deleteMany({ enquete_id: { $in: ids } });
    const er = await CondEnquete.deleteMany({ _id: { $in: ids } });

    deletedVotos += Number(vr?.deletedCount || 0);
    deletedEnquetes += Number(er?.deletedCount || 0);

    if (ids.length < ENQUETE_CLEANUP_BATCH) break;
  }

  return { ok: true, cutoff, deletedEnquetes, deletedVotos };
}

function scheduleEnqueteCleanup() {
  if (enqueteCleanupScheduled) return;
  enqueteCleanupScheduled = true;

  const run = async () => {
    try {
      const r = await cleanupOldEnquetesOnce();
      if (r && r.ok && (r.deletedEnquetes || r.deletedVotos)) {
        console.log('[condominios][enquetes][cleanup] removidos:', {
          cutoff: r.cutoff,
          enquetes: r.deletedEnquetes,
          votos: r.deletedVotos
        });
      }
    } catch (err) {
      console.error('[condominios][enquetes][cleanup] erro:', err);
    }
  };

  // primeira execução após o startup, depois periodicamente
  try {
    const t1 = registerTimer(setTimeout(run, 45 * 1000));
    // Não manter o event-loop vivo (evita travar testes/CLI)
    if (typeof t1?.unref === 'function') t1.unref();
  } catch { /* noop */ }
  try {
    const t2 = registerTimer(setInterval(run, 6 * 60 * 60 * 1000));
    if (typeof t2?.unref === 'function') t2.unref();
  } catch { /* noop */ }
}

export function startBackgroundTimers() {
  // Em testes, evitar jobs de background que podem segurar o processo.
  try {
    const isTest = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
    const isParity = String(process.env.PARITY || '').toLowerCase() === '1';
    const disable = ['1', 'true', 'yes', 'on'].includes(String(process.env.DISABLE_CONDOMINIOS_BG_JOBS || '').toLowerCase());
    if (!isTest && !isParity && !disable) scheduleEnqueteCleanup();
  } catch { /* noop */ }

  try {
    startCondMsgRetentionInterval();
  } catch { /* noop */ }
}

export function stopBackgroundTimers() {
  while (backgroundTimers.length) {
    const timerRef = backgroundTimers.pop();
    try { clearTimeout(timerRef); } catch { /* noop */ }
    try { clearInterval(timerRef); } catch { /* noop */ }
  }

  try {
    enqueteCleanupScheduled = false;
  } catch { /* noop */ }

  try {
    const g = __condMsgRetentionGlobals();
    if (g.intervalTimer) {
      try { clearInterval(g.intervalTimer); } catch { /* noop */ }
      g.intervalTimer = null;
    }
    g.intervalStarted = false;
  } catch { /* noop */ }
}

function isMongoOfflineError(err) {
  try {
    if (!err) return false;

    const seen = new Set();
    const stack = [err];
    while (stack.length) {
      const e = stack.pop();
      if (!e || typeof e !== 'object') continue;
      if (seen.has(e)) continue;
      seen.add(e);

      const name = String(e?.name || '');
      const msg = String(e?.message || '');
      const code = String(e?.code || '');

      if (name === 'MongoServerSelectionError') return true;
      if (/ServerSelectionError/i.test(name)) return true;
      if (/MongoNetworkError|MongoNotConnectedError|MongoTopologyClosedError/i.test(name)) return true;

      if (msg.includes('Server selection timed out')) return true;
      if (msg.includes('ReplicaSetNoPrimary')) return true;
      if (msg.includes('Topology is closed')) return true;
      if (/buffering timed out/i.test(msg)) return true;
      if (/client must be connected/i.test(msg)) return true;
      if (/not connected/i.test(msg)) return true;

      if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')) return true;
      if (code && /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(code)) return true;

      const reasonType = String(e?.reason?.type || '');
      if (reasonType === 'ReplicaSetNoPrimary') return true;

      if (e.cause) stack.push(e.cause);
      if (e.reason && typeof e.reason === 'object') stack.push(e.reason);
      if (e.errors && typeof e.errors === 'object') {
        for (const v of Object.values(e.errors)) stack.push(v);
      }
    }
    return false;
  } catch {
    return false;
  }
}

function getEffectiveSkipDb(req) {
  try {
    const local = !!req?.app?.locals?.skipDb;
    return local;
  } catch {
    return false;
  }
}

function hasForcedLocalSkipDb(req) {
  try {
    return !!req?.app?.locals?.__skipDbForced;
  } catch {
    return false;
  }
}

function respondDbOffline(res, req) {
  try {
    if (!res.get('X-Condominios-Db-Mode')) res.set('X-Condominios-Db-Mode', 'offline');
    res.set('Retry-After', '5');
    res.set('X-Condominios-Effective-SkipDb', String(!!getEffectiveSkipDb(req)));
    res.set('X-Condominios-SubApp-SkipDb', String(!!req?.app?.locals?.skipDb));
    res.set('X-Condominios-Mongo-State', String(mongoose.connection.readyState));
    res.set('X-Condominios-Mongo-Uri-Present', String(!!(process.env.MONGO_URI || process.env.MONGODB_URI)));
  } catch {
    /* noop */
  }

  const debugErrors = ['1', 'true', 'yes', 'on'].includes(String(process.env.WDG_DEBUG_ERRORS || '').trim().toLowerCase());

  return res.status(503).json({
    success: false,
    error: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
    ...(debugErrors ? { code: 'DB_OFFLINE' } : {}),
    meta: {
      mongoReadyState: mongoose.connection.readyState,
      mongoUriPresent: !!(process.env.MONGO_URI || process.env.MONGODB_URI),
      effectiveSkipDb: !!getEffectiveSkipDb(req),
      subAppSkipDb: !!req?.app?.locals?.skipDb,
    }
  });
}

async function ensurePortalEmailInCtxUser(ctxUser, req) {
  try {
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    if (!fromPortal) return ctxUser;

    let em = String(ctxUser?.email || ctxUser?.userEmail || ctxUser?.contato_email || ctxUser?.contatoEmail || '').trim().toLowerCase();
    if (isEmailish(em)) return ctxUser;

    const userIdRaw = String(req?.__wdgPortalCookieUserId || ctxUser?.cond_usuario_id || ctxUser?.condUsuarioId || ctxUser?.id || '').trim();
    if (isEmailish(userIdRaw)) {
      em = String(userIdRaw).trim().toLowerCase();
      return { ...(ctxUser || {}), email: em, userEmail: em };
    }

    if (userIdRaw && mongoose.isValidObjectId(userIdRaw)) {
      try {
        const u = await CondUsuario.findById(userIdRaw).select('email').lean().catch(() => null);
        const cand = String(u?.email || '').trim().toLowerCase();
        if (isEmailish(cand)) {
          em = cand;
          return { ...(ctxUser || {}), email: em, userEmail: em };
        }
      } catch { /* noop */ }
    }

    // Fallback: resolve e-mail via vínculos (CondMorador/CondProprietario) usando cond_usuario_id.
    // Observação: em serverless, o cookie pode trazer uma sessão reduzida sem email.
    if (userIdRaw) {
      try {
        const m = await CondMorador.findOne({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('email responsavel_email')
          .lean()
          .catch(() => null);
        const cand1 = String(m?.email || '').trim().toLowerCase();
        const cand2 = String(m?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(cand1)) em = cand1;
        else if (isEmailish(cand2)) em = cand2;
        if (isEmailish(em)) return { ...(ctxUser || {}), email: em, userEmail: em };
      } catch { /* noop */ }
      try {
        // Proprietário guarda email em `contato_email`.
        const p = await CondProprietario.findOne({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('contato_email')
          .lean()
          .catch(() => null);
        const cand = String(p?.contato_email || '').trim().toLowerCase();
        if (isEmailish(cand)) {
          em = cand;
          return { ...(ctxUser || {}), email: em, userEmail: em };
        }
      } catch { /* noop */ }
    }

    const habIdRaw = String(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '').trim();
    if (habIdRaw && mongoose.isValidObjectId(habIdRaw)) {
      try {
        const m = await CondMorador.findOne({ habitacao_id: habIdRaw, ativo: { $ne: false } })
          .select('email responsavel_email')
          .lean()
          .catch(() => null);
        const cand1 = String(m?.email || '').trim().toLowerCase();
        const cand2 = String(m?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(cand1)) em = cand1;
        else if (isEmailish(cand2)) em = cand2;
        if (isEmailish(em)) return { ...(ctxUser || {}), email: em, userEmail: em };
      } catch { /* noop */ }
    }

    // Fallback extra: tenta habitações presentes em `vinculos`.
    try {
      const habIds = extractPortalHabitacaoIds(ctxUser, '');
      for (const hid of habIds) {
        if (isEmailish(em)) break;
        try {
          const m = await CondMorador.findOne({ habitacao_id: hid, ativo: { $ne: false } })
            .select('email responsavel_email')
            .lean()
            .catch(() => null);
          const cand1 = String(m?.email || '').trim().toLowerCase();
          const cand2 = String(m?.responsavel_email || '').trim().toLowerCase();
          if (isEmailish(cand1)) em = cand1;
          else if (isEmailish(cand2)) em = cand2;
        } catch { /* noop */ }
      }
      if (isEmailish(em)) return { ...(ctxUser || {}), email: em, userEmail: em };
    } catch { /* noop */ }

    return ctxUser;
  } catch {
    return ctxUser;
  }
}

async function collectPortalEmailCandidatesLower(ctxUser, req) {
  try {
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    if (!fromPortal) return [];

    const out = [];
    const add = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!isEmailish(s)) return;
      if (!out.includes(s)) out.push(s);
    };

    // snapshot/session
    add(ctxUser?.email);
    add(ctxUser?.userEmail);
    add(ctxUser?.contato_email);
    add(ctxUser?.contatoEmail);

    const userIdRaw = String(req?.__wdgPortalCookieUserId || ctxUser?.cond_usuario_id || ctxUser?.condUsuarioId || ctxUser?.id || '').trim();
    const habIdRaw = String(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '').trim();

    // legado: id já pode ser email
    add(userIdRaw);

    // CondUsuario
    if (userIdRaw && mongoose.isValidObjectId(userIdRaw)) {
      try {
        const u = await CondUsuario.findById(userIdRaw).select('email').lean().catch(() => null);
        add(u?.email);
      } catch { /* noop */ }
    }

    // vínculos por cond_usuario_id
    if (userIdRaw) {
      try {
        const moradores = await CondMorador.find({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('email responsavel_email')
          .limit(10)
          .lean()
          .catch(() => []);
        (moradores || []).forEach(m => {
          add(m?.email);
          add(m?.responsavel_email);
        });
      } catch { /* noop */ }

      try {
        const proprietarios = await CondProprietario.find({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('contato_email')
          .limit(10)
          .lean()
          .catch(() => []);
        (proprietarios || []).forEach(p => add(p?.contato_email));
      } catch { /* noop */ }
    }

    const collectFromHabitacaoId = async (hid) => {
      if (!hid || !mongoose.isValidObjectId(hid)) return;

      try {
        const moradores = await CondMorador.find({ habitacao_id: hid, ativo: { $ne: false } })
          .select('email responsavel_email')
          .limit(10)
          .lean()
          .catch(() => []);
        (moradores || []).forEach(m => {
          add(m?.email);
          add(m?.responsavel_email);
        });
      } catch { /* noop */ }

      try {
        const hab = await CondHabitacao.findById(hid)
          .select('proprietario_id contrato_locacao.responsavel_morador_id')
          .lean()
          .catch(() => null);

        const respMoradorId = hab?.contrato_locacao?.responsavel_morador_id ? String(hab.contrato_locacao.responsavel_morador_id) : '';
        if (respMoradorId && mongoose.isValidObjectId(respMoradorId)) {
          const m = await CondMorador.findById(respMoradorId).select('email responsavel_email').lean().catch(() => null);
          add(m?.email);
          add(m?.responsavel_email);
        }

        const propId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
        if (propId && mongoose.isValidObjectId(propId)) {
          const p = await CondProprietario.findById(propId).select('contato_email').lean().catch(() => null);
          add(p?.contato_email);
        }
      } catch { /* noop */ }
    };

    // habitação no snapshot
    await collectFromHabitacaoId(habIdRaw);

    // habitações dos vínculos
    try {
      const habIds = extractPortalHabitacaoIds(ctxUser, '');
      for (const hid of habIds) {
        await collectFromHabitacaoId(hid);
      }
    } catch { /* noop */ }

    return out;
  } catch {
    return [];
  }
}

function maskEmailForDebug(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return '';
  const [local, domain] = e.split('@');
  const l = local ? local.slice(0, 1) + '***' : '***';
  const d = domain ? domain : '***';
  return `${l}@${d}`;
}

function buildMailboxesDebugMeta(ctxUser, req, extra = {}) {
  try {
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    const admin = userCanScopeAll(ctxUser);
    const email = String(ctxUser?.email || ctxUser?.userEmail || '').trim().toLowerCase();
    const idRaw = String(ctxUser?.cond_usuario_id || ctxUser?.id || '').trim();
    const habRaw = String(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '').trim();
    const vinculos = Array.isArray(ctxUser?.vinculos) ? ctxUser.vinculos : [];

    const identityKey = getUserIdentityKey(ctxUser);
    const identityKeyType = email
      ? 'email'
      : (String(idRaw || '').includes('@') ? 'id-email' : (identityKey ? 'nome' : 'none'));

    return {
      fromPortal,
      admin,
      mongoReadyState: mongoose.connection.readyState,
      ctx: {
        hasEmail: !!email,
        emailMasked: email ? maskEmailForDebug(email) : '',
        identityKeyType,
        hasCondUsuarioId: !!idRaw,
        hasHabitacaoId: !!(habRaw && mongoose.isValidObjectId(habRaw)),
        vinculosCount: vinculos.length,
        cookieUserIdPresent: !!req?.__wdgPortalCookieUserId,
      },
      ...extra
    };
  } catch {
    return { ...extra };
  }
}

function isServerlessRuntime() {
  return !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function getMongoWaitTimeoutMs() {
  const raw = Number(process.env.MONGO_CONNECT_WAIT_MS || 0);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return isServerlessRuntime() ? 8000 : 3000;
}

async function waitForMongoReady(timeoutMs = 3000) {
  try {
    if (mongoose.connection.readyState === 1) return true;

    const ms = Math.max(250, Number(timeoutMs) || 0);
    return await new Promise((resolve) => {
      const conn = mongoose.connection;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { conn.off('connected', onConnected); } catch {}
        try { conn.off('error', onError); } catch {}
        resolve(mongoose.connection.readyState === 1);
      }, ms);
      try { if (typeof timer?.unref === 'function') timer.unref(); } catch {}

      function cleanup(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { conn.off('connected', onConnected); } catch {}
        try { conn.off('error', onError); } catch {}
        resolve(!!ok);
      }

      function onConnected() { cleanup(true); }
      function onError() { cleanup(false); }

      try { conn.once('connected', onConnected); } catch { /* noop */ }
      try { conn.once('error', onError); } catch { /* noop */ }
    });
  } catch {
    return mongoose.connection.readyState === 1;
  }
}

async function tryReconnectMongo() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) return false;
    await connectMongo(uri);
    return mongoose.connection.readyState === 1;
  } catch {
    return false;
  }
}

async function ensureCondominiosMongoOnline(req, res) {
  try {
    if (hasForcedLocalSkipDb(req)) {
      respondDbOffline(res, req);
      return false;
    }

    if (mongoose.connection.readyState === 1) return true;

    const uriPresent = !!(process.env.MONGO_URI || process.env.MONGODB_URI);
    if (!uriPresent) {
      respondDbOffline(res, req);
      return false;
    }

    const timeout = getMongoWaitTimeoutMs();
    if (mongoose.connection.readyState === 2) {
      const ok = await waitForMongoReady(timeout);
      if (ok) return true;
    }

    await tryReconnectMongo();

    if (mongoose.connection.readyState !== 1) {
      const ok = await waitForMongoReady(timeout);
      if (!ok) {
        respondDbOffline(res, req);
        return false;
      }
    }

    try {
      if (!hasForcedLocalSkipDb(req)) {
        if (req?.app?.locals) req.app.locals.skipDb = false;
      }
    } catch {
      /* noop */
    }

    return mongoose.connection.readyState === 1;
  } catch {
    if (mongoose.connection.readyState !== 1) respondDbOffline(res, req);
    return mongoose.connection.readyState === 1;
  }
}

// Injeção de basePath e user para as views compartilhadas
app.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '/condominios';
  try { res.locals.user = req.user || (req.session && req.session.user) || null; } catch { res.locals.user = null; }
  // Versão de assets para cache-busting (principalmente no Vercel/CDN)
  try {
    res.locals.assetVersion = process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.VERCEL_DEPLOYMENT_ID
      || process.env.VERCEL_BUILD_ID
      || process.env.VERCEL_URL
      || 'dev';
  } catch {
    res.locals.assetVersion = 'dev';
  }
  next();
});

// Expor ctxUser no req para routers isolados (ex.: Execução de Assembleia) reutilizarem a lógica do módulo
app.use((req, _res, next) => {
  try { req.ctxUser = getCtxUser(req); } catch { req.ctxUser = null; }
  next();
});

// API: Execução da Assembleia (status/presença/votos/ata)
try {
  mountAssembleias(app);
} catch (e) {
  console.error('[condominios][assembleiaExecutionRoutes] falha ao montar rotas:', e);
}

// Views: prioriza /views/condominios, com fallback para /views
app.set('views', [
  path.join(ROOT, 'views/condominios'),
  path.join(ROOT, 'views')
]);
app.set('view engine', 'ejs');

// Assets compartilhados (servidos das pastas globais; o prefixo público é adicionado no mount)
app.use('/css', express.static(path.join(ROOT, 'public/css')));
app.use('/js', express.static(path.join(ROOT, 'public/js')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use('/img', express.static(path.join(ROOT, 'public/img')));
app.use('/data', express.static(path.join(ROOT, 'public/data')));

// Proteção geral das páginas HTML internas do módulo Condomínios.
// Mantém públicas rotas de login/recuperação, assets e APIs; páginas internas exigem sessão.
function isCondominiosPublicOrNonPageRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();

  // Não transformar POST/API em redirect HTML aqui. Cada endpoint mantém sua própria regra.
  if (method !== 'GET' && method !== 'HEAD') return true;

  const pathOnly = String(req.path || req.url || '').split('?')[0] || '/';

  // Raiz do módulo é página interna; deve cair no dashboard se logado ou login se deslogado.
  if (pathOnly === '/') return false;

  // Páginas públicas.
  if (/^\/(?:login|logout|esquecisenha|esqueci-senha|primeiroacesso|reset-password)(?:\/|$)/i.test(pathOnly)) {
    return true;
  }

  // APIs e assets.
  if (/^\/(?:api|css|js|images|img|uploads|fonts|assets|data)(?:\/|$)/i.test(pathOnly)) {
    return true;
  }

  if (/^\/favicon\.ico$/i.test(pathOnly)) {
    return true;
  }

  return false;
}

app.use((req, res, next) => {
  try {
    if (isCondominiosPublicOrNonPageRequest(req)) return next();

    const ctxUser = getCtxUser(req);
    if (ctxUser) {
      req.user = req.user || ctxUser;
      res.locals.user = res.locals.user || ctxUser;
      return next();
    }

    const basePath = req.baseUrl || '/condominios';
    const nextUrl = encodeURIComponent(String(req.originalUrl || `${basePath}${req.url || ''}`));
    return res.redirect(`${basePath}/login?next=${nextUrl}`);
  } catch {
    return next();
  }
});

// GET /api/usuarios/foto?email=...|id=... — serve foto de perfil por e-mail ou id (Gestor ou Portal)
// Motivo: `foto` pode estar salvo como caminho relativo e nem sempre está exposto por static.
app.get('/api/usuarios/foto', async (req, res) => {
  try {
    // Placeholders
    const placeholderSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
    const placeholderPng = path.join(ROOT, 'images', 'usuario.png');
    const sendPlaceholder = () => {
      const target = fs.existsSync(placeholderSvg) ? placeholderSvg : (fs.existsSync(placeholderPng) ? placeholderPng : null);
      if (!target) return res.status(404).end();
      const ext = path.extname(target).toLowerCase();
      if (ext === '.svg') res.type('image/svg+xml');
      else if (ext === '.png') res.type('image/png');
      res.set('Cache-Control', 'private, max-age=300');
      return res.sendFile(target);
    };

    // Segurança/UX: se não estiver autenticado, não devolver 401 (evita poluir console e quebrar avatares).
    // Importante: sem ctxUser nunca retornamos foto real, apenas placeholder.
    // No Portal do Morador, a autenticação pode vir via cookie assinado `wdg_portal`
    // (encaminhado pelo proxy com header x-wdg-portal=1). Então usamos getCtxUser().
    const ctxUser = getCtxUser(req);
    if (!ctxUser) {
      try { res.set('X-WDG-Photo-Auth', 'none'); } catch { /* noop */ }
      return sendPlaceholder();
    }
    try {
      const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
      res.set('X-WDG-Photo-Auth', fromPortal ? 'portal' : 'session');
    } catch { /* noop */ }

    // Quando a chamada vem do Portal, evita usar a sessão do Gestor (se existir no mesmo navegador).
    // Aqui não precisamos do ctxUser diretamente, mas mantemos o comportamento consistente.
    // (A autorização continua sendo apenas "estar autenticado".)

    const email = String(req.query?.email || '').toLowerCase().trim();
    const idRaw = String(req.query?.id || '').trim();
    const hasId = !!(idRaw && mongoose.isValidObjectId(idRaw));
    try {
      res.set('X-WDG-Photo-Lookup', email ? 'email' : (hasId ? 'id' : 'none'));
    } catch { /* noop */ }
    if (!email && !hasId) return sendPlaceholder();

    if (mongoose.connection.readyState !== 1) {
      // Sem banco, não dá pra descobrir foto do usuário alvo
      return sendPlaceholder();
    }

    let foto = '';
    let userId = null;
    let targetUserId = hasId ? idRaw : null;

    const pickFotoValue = (doc) => {
      if (!doc || typeof doc !== 'object') return '';
      const v = String(
        doc.foto
        || doc.fotoUrl
        || doc.foto_url
        || doc.photo
        || doc.avatar
        || doc.avatarUrl
        || doc.avatar_url
        || ''
      ).trim();
      return v;
    };

    // 0) Atalho: se a foto solicitada é do próprio usuário autenticado, tente usar o valor
    // já presente no ctxUser/sessão (mais robusto e evita depender do DB para imagem).
    try {
      const ctxEmail = String(ctxUser?.email || ctxUser?.userEmail || '').trim().toLowerCase();
      const ctxIdRaw = String(ctxUser?._id || ctxUser?.id || ctxUser?.userId || '').trim();
      const sameEmail = !!(email && ctxEmail && email === ctxEmail);
      const sameId = !!(hasId && ctxIdRaw && mongoose.isValidObjectId(ctxIdRaw) && String(ctxIdRaw) === String(idRaw));
      if ((sameEmail || sameId) && !foto) {
        const sessUser = (req.session && (req.session.user || req.session.portalUser)) || null;
        foto = pickFotoValue(ctxUser) || pickFotoValue(sessUser) || foto;
        try { res.set('X-WDG-Photo-FromCtx', foto ? '1' : '0'); } catch { /* noop */ }
      }
    } catch { /* noop */ }

    // 1) Resolve por e-mail (quando houver)
    if (!foto && email) {
      try {
        const userDoc = await User.findOne({ email }).select('_id foto fotoUrl foto_url photo avatar avatarUrl avatar_url').lean();
        if (userDoc && userDoc._id) {
          userId = userDoc._id;
          if (!targetUserId) targetUserId = String(userDoc._id);
        }
        foto = pickFotoValue(userDoc) || foto;
      } catch {}
      if (!foto) {
        try {
          const condDoc = await CondUsuario.findOne({ email }).select('foto fotoUrl foto_url photo avatar avatarUrl avatar_url').lean();
          foto = pickFotoValue(condDoc) || foto;
        } catch {}
      }
      if (!foto && userId) {
        try {
          const funcDoc = await Funcionario.findOne({ usuario_id: userId }).select('foto').lean();
          if (funcDoc && funcDoc.foto) foto = String(funcDoc.foto || '').trim();
        } catch {}
      }
    }

    // 2) Resolve por id (ObjectId) quando houver (ex.: dados legados onde from_owner não é e-mail)
    if (!foto && targetUserId) {
      try {
        const userDocById = await User.findById(targetUserId).select('_id foto fotoUrl foto_url photo avatar avatarUrl avatar_url').lean();
        foto = pickFotoValue(userDocById) || foto;
      } catch {}
      if (!foto) {
        try {
          const condDocById = await CondUsuario.findById(targetUserId).select('foto fotoUrl foto_url photo avatar avatarUrl avatar_url').lean();
          foto = pickFotoValue(condDocById) || foto;
        } catch {}
      }
      if (!foto) {
        try {
          const funcDoc = await Funcionario.findOne({ usuario_id: targetUserId }).select('foto').lean();
          if (funcDoc && funcDoc.foto) foto = String(funcDoc.foto || '').trim();
        } catch {}
      }
    }
    if (!foto) {
      try { res.set('X-WDG-Photo-Found', '0'); } catch { /* noop */ }
      return sendPlaceholder();
    }
    try { res.set('X-WDG-Photo-Found', '1'); } catch { /* noop */ }

    // data URL
    if (/^data:/i.test(foto)) {
      try {
        const [header, base64] = String(foto).split(',');
        const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
        const buffer = Buffer.from(base64 || '', 'base64');
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(buffer);
      } catch {
        return sendPlaceholder();
      }
    }

    // URL externa
    if (/^https?:\/\//i.test(foto)) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.redirect(foto);
    }

    // Caminho relativo
    const relRaw = String(foto).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relRaw || relRaw.includes('..')) return sendPlaceholder();

    const relNoPublic = relRaw.replace(/^public\//, '');
    const relNoUploads = relNoPublic.replace(/^uploads\//, '');
    const candidates = [
      path.join(ROOT, 'public', relNoPublic),
      path.join(ROOT, relNoPublic),
      path.join(ROOT, 'public', 'uploads', relNoUploads),
      path.join(ROOT, 'uploads', relNoUploads)
    ];

    for (const p of candidates) {
      try {
        const st = fs.statSync(p);
        if (!st || !st.isFile()) continue;
        const ext = path.extname(p).toLowerCase();
        const type = ext === '.svg' ? 'image/svg+xml'
          : ext === '.png' ? 'image/png'
          : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
          : ext === '.webp' ? 'image/webp'
          : 'application/octet-stream';
        res.set('Content-Type', type);
        res.set('Cache-Control', 'private, max-age=300');
        return res.sendFile(p);
      } catch {
        // try next
      }
    }

    return sendPlaceholder();
  } catch (e) {
    console.error('[condominios][api/usuarios/foto] erro:', e);
    try { return res.status(404).end(); } catch { return; }
  }
});

// APIs de usuário sob /condominios/api/* — reutiliza rotas do Gestor
// Importante: vem DEPOIS do /api/usuarios/foto para evitar conflito e 503.
// ATENÇÃO: o router do Gestor aplica `requireLogin` via `router.use('/api', requireLogin)`.
// Se montarmos o router inteiro aqui, ele intercepta QUALQUER rota que comece com `/api/*`
// (ex.: `/api/msg/*`, `/api/unidades`, `/api/usuarios/busca`) e devolve 401 antes dos
// handlers deste módulo — quebrando o Portal do Morador.
// Então, delegamos ao router do Gestor apenas para os endpoints que ele realmente implementa.
app.use((req, res, next) => {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const pathOnly = String(req.path || (req.originalUrl || req.url || '')).split('?')[0];
    const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || ''));

    const isGestorUserApiRoute = (() => {
      if (!pathOnly.startsWith('/api/')) return false;

      if (pathOnly === '/api/usuario') return true;
      if (pathOnly === '/api/usuario/foto') return true;
      if (pathOnly === '/api/usuario/senha') return true;

      if (pathOnly === '/api/modulos' && method === 'GET') return true;

      if (pathOnly === '/api/usuarios' && method === 'POST') return true;

      const m = pathOnly.match(/^\/api\/usuarios\/([^\/]+)\/(update|toggle|delete)$/i);
      if (m && isObjectId(m[1])) return true;

      return false;
    })();

    if (!isGestorUserApiRoute) return next();
    return gestorUserApi(req, res, next);
  } catch {
    return next();
  }
});

// APIs de configuração bancária
// Exclusão de usuário (somente quando não há vínculos no módulo Condomínios)
app.delete('/api/usuarios/:id', async (req, res, next) => {
  try {
    // Segurança básica: precisa estar autenticado; lógica de permissão detalhada fica no controller do Gestor (master-only)
    if (!req.user && !(req.session && req.session.user)) {
      return res.status(401).json({ success:false, error:'Não autenticado' });
    }
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ success:false, error:'ID inválido' });
    // Verificar vínculos no módulo (proprietário/morador)
    const [hasProps, hasMoras] = await Promise.all([
      CondProprietario.exists({ usuario_id: userId, ativo: { $ne: false } }),
      CondMorador.exists({ usuario_id: userId, ativo: { $ne: false } })
    ]);
    if (hasProps || hasMoras) {
      return res.status(409).json({ success:false, error:'Usuário possui vínculos no módulo de Condomínios' });
    }
    // Força resposta JSON no controller do Gestor
    try { req.headers['x-requested-with'] = 'XMLHttpRequest'; } catch {}
    return gestorExcluirUsuario(req, res, next);
  } catch (e) {
    console.error('[condominios][DELETE /api/usuarios/:id] erro:', e);
    return res.status(500).json({ success:false, error:'Falha ao excluir usuário' });
  }
});

// Exclusão de usuário apenas do módulo Condôminos (CondUsuario) quando não possui vínculos
app.delete('/api/cond-usuarios/:id', async (req, res) => {
  try {
    if (!req.user && !(req.session && req.session.user)) {
      return res.status(401).json({ success:false, error:'Não autenticado' });
    }
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success:false, error:'Identificador inválido' });
    }
    const condUser = await CondUsuario.findById(id);
    if (!condUser) {
      return res.status(404).json({ success:false, error:'Usuário não encontrado' });
    }
    const [hasProps, hasMoras] = await Promise.all([
      CondProprietario.exists({ cond_usuario_id: id, ativo: { $ne: false } }),
      CondMorador.exists({ cond_usuario_id: id, ativo: { $ne: false } })
    ]);
    if (hasProps || hasMoras) {
      return res.status(409).json({ success:false, error:'Usuário possui vínculos ativos no condomínio' });
    }
    await CondUsuario.deleteOne({ _id: id });
    return res.json({ success:true, deleted:true, id });
  } catch (e) {
    console.error('[condominios][DELETE /api/cond-usuarios/:id] erro:', e);
    return res.status(500).json({ success:false, error:'Falha ao excluir usuário do módulo Condôminos' });
  }
});

// API: listar unidades acessíveis ao usuário atual (para combos)
async function handleGetUnidadesV1(req, res, _next) {
  try{
    const unidadesReadRepository = new UnidadesReadRepository({ unitScope: getUnitScope(req) });
    const listarUnidadesParaUsuarioScoped = async (user) => {
      try {
        const unidadeSelectFields = '_id codigo nome razaoSocial cnpj cpf pessoaTipo inscricaoEstadual inscricaoMunicipal cnaePrincipal cnaeSecundarios regimeTributario naturezaJuridica tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal diretor_usuario_id pixChave tipoPix banco agencia contaCorrente is_principal subunidade unidade_principal_id dataAbertura';
        if (userCanScopeAll(user)) {
          return await unidadesReadRepository.findAtivas({ selectFields: unidadeSelectFields });
        }
        if (user && (user.matriz_unidade_id || user.unidade_principal_id || user.unidade_id)) {
          const matrizRef = user.matriz_unidade_id || user.unidade_principal_id || user.unidade_id;
          const matrizId = (matrizRef && typeof matrizRef === 'object') ? (matrizRef._id || matrizRef.id || matrizRef) : matrizRef;
          return await unidadesReadRepository.findDaMatriz({ matrizId, selectFields: unidadeSelectFields });
        }
        return [];
      } catch {
        return [];
      }
    };

    const payload = await listarUnidadesService({
      req,
      mongoose,
      getCtxUser,
      userCanScopeAll,
      normalizeObjectIdString,
      getUserUnidadeId,
      resolveUnidadeIdForNonScopedUser,
      listarUnidadesParaUsuario: listarUnidadesParaUsuarioScoped,
      buildUnidadePayload
    });
    return res.json(payload);
  }catch(e){
    return res.status(500).json({ error: 'Falha ao listar unidades' });
  }
}

setHandleGetUnidadesV2Context({
  mongoose,
  CondBloco,
  CondAndar,
  getCtxUser,
  userCanScopeAll,
  normalizeObjectIdString,
  getUserUnidadeId,
  resolveUnidadeIdForNonScopedUser,
  listarUnidadesParaUsuario,
  buildUnidadePayload
});

app.get('/api/unidades', (req, res, next) => {
  if (getEffectiveSkipDb(req)) {
    return respondDbOffline(res, req);
  }
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetUnidadesV2(req, res, next);
  return handleGetUnidadesV1(req, res, next);
});

async function handleGetUnidadeByIdV1(req, res, _next) {
  try {
    const payload = await obterUnidadePorIdService({
      req,
      mongoose,
      buildUnidadePayload
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Unidade não encontrada' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter unidade' });
  }
}

app.get('/api/unidades/:id([0-9a-fA-F]{24})', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetUnidadeByIdV2(req, res, next);
  return handleGetUnidadeByIdV1(req, res, next);
});

async function handleGetUnidadesRelacionadasV1(req, res, _next) {
  try {
    const payload = await listarUnidadesRelacionadasService({
      req,
      mongoose,
      CondBloco,
      CondAndar,
      buildUnidadePayload
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar unidades relacionadas' });
  }
}

app.get('/api/unidades/relacionadas', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetUnidadesRelacionadasV2Scoped(req, res, next);
  return handleGetUnidadesRelacionadasV1(req, res, next);
});

// API: logo da unidade (para cabeçalhos/prints e combobox)
// Serve logo salva como URL pública, Data URL (base64) ou caminho legado em disco.
app.get('/api/unidades/:id/logo', async (req, res) => {
  try {
    const sendPlaceholder = () => {
      try {
        const ph = path.join(ROOT, 'public', 'img', 'placeholder-logo.svg');
        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=600');
        return res.sendFile(ph, (err) => err ? res.status(204).end() : undefined);
      } catch {
        return res.status(204).end();
      }
    };

    // UX/print: não devolver 401 para <img>; retornar placeholder.
    // (Evita quebrar cabeçalhos em previews/prints quando a sessão expira entre requisições.)
    if (!req.user && !(req.session && req.session.user) && !(req.session && req.session.portalUser)) {
      return sendPlaceholder();
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return sendPlaceholder();
    }

    const unidade = await unidadesReadRepoFromReq(req).findById(id, { select: '_id logo' });
    if (!unidade) return sendPlaceholder();

    const logo = String(unidade.logo || '').trim();

    // 0) URL pública (S3/Blob/etc): proxy server-side (evita bloqueio por hotlink/CORS no print)
    if (/^https?:\/\//i.test(logo)) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4500);
        if (typeof t?.unref === 'function') t.unref();
        try {
          const r = await fetch(logo, { signal: ctl.signal, redirect: 'follow' });
          if (!r.ok) throw new Error('fetch externo falhou: ' + r.status);

          const ct = String(r.headers.get('content-type') || '').trim() || 'image/*';
          // limite simples para evitar respostas gigantes
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 8 * 1024 * 1024) throw new Error('logo externa muito grande');

          res.set('Content-Type', ct);
          res.set('Cache-Control', 'public, max-age=300');
          return res.send(buf);
        } finally {
          clearTimeout(t);
        }
      } catch (e) {
        console.warn('[condominios][logo] proxy externo falhou:', e?.message || e);
        // cai para placeholder abaixo
      }
    }

    // 1) Data URL (base64)
    if (/^data:/i.test(logo)) {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(logo);
      if (!m) return res.status(204).end();
      const contentType = m[1] || 'application/octet-stream';
      const base64 = m[2] || '';
      const buffer = Buffer.from(base64, 'base64');
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(buffer);
    }

    // 2) Caminho legado em disco (best-effort)
    if (logo) {
      try {
        const rel = logo.replace(/^\/*/, '');
        const candidates = [
          path.join(ROOT, 'public', rel),
          path.join(ROOT, rel),
          path.join(ROOT, 'public/uploads', rel),
        ];

        for (const p of candidates) {
          const st = await fs.promises.stat(p).catch(() => null);
          if (st && st.isFile()) {
            const ext = path.extname(p).toLowerCase();
            const type = ext === '.svg' ? 'image/svg+xml'
              : ext === '.png' ? 'image/png'
              : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
              : ext === '.webp' ? 'image/webp'
              : 'application/octet-stream';
            res.set('Content-Type', type);
            res.set('Cache-Control', 'private, max-age=300');
            return res.sendFile(p);
          }
        }
      } catch {
        // noop
      }
    }

    // 3) Placeholder do app (não falhar hard)
    return sendPlaceholder();
  } catch (e) {
    console.error('[condominios][GET /api/unidades/:id/logo] erro:', e);
    return res.status(500).end();
  }
});

// Proxy de assets (imagens) para uso em PDF/snapshot (evita CORS/hotlink no browser)
// Uso: /condominios/api/assets/proxy?url=https%3A%2F%2F...
app.get('/api/assets/proxy', async (req, res) => {
  try {
    if (!req.user && !(req.session && req.session.user) && !(req.session && req.session.portalUser)) {
      return res.status(401).end();
    }

    const raw = String(req.query.url || '').trim();
    if (!raw || raw.length > 2048) return res.status(400).end();

    let u;
    try { u = new URL(raw); } catch { return res.status(400).end(); }
    if (!/^https?:$/i.test(u.protocol)) return res.status(400).end();

    const host = String(u.hostname || '').trim().toLowerCase();
    if (!host) return res.status(400).end();

    // Bloqueios básicos anti-SSRF (best-effort)
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return res.status(403).end();
    }

    const responseType = String(req.query.responseType || '').trim().toLowerCase();

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    if (typeof t?.unref === 'function') t.unref();
    const r = await fetch(raw, { signal: ctl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!r.ok) return res.status(502).end();

    const ct = String(r.headers.get('content-type') || '').trim();
    if (ct && !/^image\//i.test(ct)) {
      return res.status(415).end();
    }

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(413).end();

    res.set('Cache-Control', 'private, max-age=600');
    // Ajuda browsers a aceitarem o recurso em contextos de captura/print
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');

    // Compat com html2canvas proxy: pode pedir como texto (data URL) ou blob
    if (responseType && responseType !== 'text' && responseType !== 'blob') {
      return res.status(400).end();
    }

    if (responseType === 'blob') {
      res.set('Content-Type', ct || 'image/*');
      return res.send(buf);
    }

    // default/text
    res.set('Content-Type', 'text/plain; charset=utf-8');
    const dataUrl = `data:${ct || 'application/octet-stream'};base64,${buf.toString('base64')}`;
    return res.send(dataUrl);
  } catch (e) {
    console.error('[condominios][GET /api/assets/proxy] erro:', e);
    return res.status(500).end();
  }
});

// Dirigência (Organograma): persistência em nuvem (MongoDB)
app.get('/api/dirigencia/:unidadeId/state', async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { unidadeId } = req.params;
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).json({ success: false, error: 'Unidade inválida' });
    }

    const canScopeAll = userCanScopeAll(ctxUser);
    const unidadesOptions = canScopeAll ? [] : await listarUnidadesParaUsuario(ctxUser);
    const allowed = canScopeAll
      || (await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))
      || (unidadesOptions || []).some(u => String(u?._id || '') === String(unidadeId));
    if (!allowed) return res.status(403).json({ success: false, error: 'Acesso negado' });

    const doc = await CondDirigenciaSettings.findOne({ unidade_id: unidadeId }).lean();
    if (!doc) {
      // Primeiro acesso: ainda não há doc persistido. Retornamos 200 para não gerar erro/retry no browser.
      return res.json({ success: true, unidadeId: String(unidadeId), notFound: true, state: null });
    }

    const stateOut = (doc.state && typeof doc.state === 'object') ? doc.state : {};

    // Dirigência institucional: garante cargos persistidos e migra vínculos diretos (assignments)
    // para mandatos ativos quando ainda não existe histórico.
    try {
      await syncDirigenciaCargosFromState(unidadeId, stateOut);
      await migrateLegacyAssignmentsToMandatos({ unidadeId, state: stateOut, ctxUser });
      const derivedAssignments = await buildAssignmentsFromActiveMandatos(unidadeId);
      if (derivedAssignments && typeof derivedAssignments === 'object') {
        stateOut.assignments = derivedAssignments;
      }
    } catch (e) {
      console.error('[condominios][dirigencia] sync/migrate erro:', e);
    }

    return res.json({
      success: true,
      unidadeId: String(unidadeId),
      schemaVersion: doc.schemaVersion || 1,
      state: stateOut,
      updatedAt: doc.updatedAt || null,
      updatedBy: doc.updatedBy || ''
    });
  } catch (e) {
    console.error('[condominios][GET /api/dirigencia/:unidadeId/state] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao carregar Dirigência' });
  }
});

app.put('/api/dirigencia/:unidadeId/state', express.json({ limit: '800kb' }), async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { unidadeId } = req.params;
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).json({ success: false, error: 'Unidade inválida' });
    }

    if (!(await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))) {
      return res.status(403).json({ success: false, error: 'Sem permissão para editar Dirigência (apenas Master/Admin/Diretor).' });
    }

    const incoming = (req.body && typeof req.body === 'object') ? (req.body.state != null ? req.body.state : req.body) : null;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload inválido' });
    }

    // Validações básicas para evitar abuso/acidente
    const roles = Array.isArray(incoming.roles) ? incoming.roles : null;
    const assignments = (incoming.assignments && typeof incoming.assignments === 'object') ? incoming.assignments : {};
    if (!roles || roles.length > 500) {
      return res.status(400).json({ success: false, error: 'Lista de cargos inválida' });
    }
    // `assignments` pode ser omitido; o GET rederiva a partir de mandatos ativos.
    incoming.assignments = assignments;
    if (Object.keys(assignments).length > 1000) {
      return res.status(400).json({ success: false, error: 'Atribuições inválidas' });
    }

    const updatedBy = (() => {
      try { return String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase(); } catch { return ''; }
    })();

    await CondDirigenciaSettings.updateOne(
      { unidade_id: unidadeId },
      {
        $set: {
          unidade_id: unidadeId,
          state: incoming,
          schemaVersion: 1,
          updatedBy
        }
      },
      { upsert: true }
    );

    // Mantém coleção de cargos em sincronia (não apaga histórico).
    try {
      await syncDirigenciaCargosFromState(unidadeId, incoming);
    } catch (e) {
      console.error('[condominios][dirigencia] sync cargos erro:', e);
    }

    const doc = await CondDirigenciaSettings.findOne({ unidade_id: unidadeId }).select('updatedAt updatedBy schemaVersion').lean();

    return res.json({
      success: true,
      unidadeId: String(unidadeId),
      schemaVersion: doc?.schemaVersion || 1,
      updatedAt: doc?.updatedAt || null,
      updatedBy: doc?.updatedBy || updatedBy
    });
  } catch (e) {
    console.error('[condominios][PUT /api/dirigencia/:unidadeId/state] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao salvar Dirigência' });
  }
});

function buildDirigenciaCargoId(unidadeId, roleId) {
  const uid = String(unidadeId || '').trim();
  const rid = String(roleId || '').trim();
  if (!uid || !rid) return '';
  return `${uid}:${rid}`;
}

function getDirigenciaRoleIdFromCargoId(cargoId) {
  const s = String(cargoId || '').trim();
  const i = s.indexOf(':');
  if (i < 0) return '';
  return s.slice(i + 1);
}

function parseDateInput(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // 1) ISO / yyyy-mm-dd (input[type=date])
  // 2) dd/mm/yyyy (formato comum pt-BR)
  // 3) fallback para Date() nativo
  const mBr = s.match(/^([0-3]?\d)\/([01]?\d)\/(\d{4})(?:\s+.*)?$/);
  if (mBr) {
    const dd = Number(mBr[1]);
    const mm = Number(mBr[2]);
    const yyyy = Number(mBr[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 9999) {
      const d = new Date(yyyy, mm - 1, dd);
      if (Number.isFinite(d.getTime())) return d;
    }
    return null;
  }

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

async function expireVencidosMandatos({ unidadeId, cargoId } = {}) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return { matched: 0, modified: 0 };
  const cid = String(cargoId || '').trim();

  const now = new Date();
  const filter = {
    unidadeId: uid,
    ativo: true,
    fim: { $ne: null, $lt: now }
  };
  if (cid) filter.cargoId = cid;

  try {
    const res = await CondDirigenciaMandato.updateMany(
      filter,
      {
        $set: {
          ativo: false,
          encerradoEm: now,
          encerradoPor: 'system'
        }
      }
    );
    return {
      matched: Number(res?.matchedCount || res?.n || 0) || 0,
      modified: Number(res?.modifiedCount || res?.nModified || 0) || 0
    };
  } catch {
    return { matched: 0, modified: 0 };
  }
}

function normalizeMandatoOrigem(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'assembleia' || v === 'assembléia') return 'assembleia';
  if (v === 'provisorio' || v === 'provisório') return 'provisorio';
  if (v === 'judicial') return 'judicial';
  return '';
}

async function syncDirigenciaCargosFromState(unidadeId, state) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return;
  const roles = Array.isArray(state?.roles) ? state.roles : [];
  if (!roles.length) return;

  const ops = [];
  for (const r of roles) {
    const roleId = String(r?.id || '').trim();
    if (!roleId) continue;
    const cargoId = buildDirigenciaCargoId(uid, roleId);
    if (!cargoId) continue;

    const parentRoleId = String(r?.parentId || '').trim();
    const subordinacao = parentRoleId ? buildDirigenciaCargoId(uid, parentRoleId) : '';
    const nome = String(r?.nome || '').trim() || roleId;
    const tipo = r?.mandatory ? 'sindico' : (String(r?.tipo || '').trim() || '');

    ops.push({
      updateOne: {
        filter: { _id: cargoId },
        update: {
          $setOnInsert: { _id: cargoId, unidadeId: uid },
          $set: { nome, subordinacao, tipo }
        },
        upsert: true
      }
    });
  }

  if (!ops.length) return;
  await CondDirigenciaCargo.bulkWrite(ops, { ordered: false });
}

async function migrateLegacyAssignmentsToMandatos({ unidadeId, state, ctxUser }) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return;
  const assignments = (state?.assignments && typeof state.assignments === 'object') ? state.assignments : null;
  if (!assignments) return;

  const roles = Array.isArray(state?.roles) ? state.roles : [];
  const knownRoleIds = new Set(roles.map(r => String(r?.id || '').trim()).filter(Boolean));

  const createdBy = (() => {
    try { return String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase(); } catch { return ''; }
  })();

  const now = new Date();
  for (const [roleIdRaw, userIdRaw] of Object.entries(assignments)) {
    const roleId = String(roleIdRaw || '').trim();
    const userId = String(userIdRaw || '').trim();
    if (!roleId || !userId) continue;
    if (!knownRoleIds.has(roleId)) continue;
    if (!mongoose.isValidObjectId(userId)) continue;

    const cargoId = buildDirigenciaCargoId(uid, roleId);
    if (!cargoId) continue;

    // Se já existe mandato ativo, não cria outro (mandato vira fonte de verdade).
    const hasActive = await CondDirigenciaMandato.exists({
      unidadeId: uid,
      cargoId,
      ativo: true,
      $or: [
        { fim: null },
        { fim: { $gte: now } }
      ]
    });
    if (hasActive) continue;

    const condUsuarioId = await resolveCondUsuarioIdFromAnyUserId(userId);
    if (!condUsuarioId) continue;

    try {
      await CondDirigenciaMandato.create({
        cargoId,
        unidadeId: uid,
        usuarioId: condUsuarioId,
        inicio: now,
        fim: null,
        origem: 'provisorio',
        observacao: `Migrado automaticamente do vínculo direto (atribuição de cargo) em ${now.toISOString()}.`,
        ativo: true,
        criadoEm: now,
        criadoPor: createdBy
      });
    } catch (e) {
      // Em corrida (ex.: múltiplas abas), o índice parcial pode bloquear; ignore.
      if (String(e?.code) !== '11000') {
        console.error('[condominios][dirigencia] falha ao migrar assignment -> mandato', { unidadeId: uid, roleId, userId, err: e });
      }
    }
  }
}

async function buildAssignmentsFromActiveMandatos(unidadeId) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return {};
  // Defesa: evita que mandatos vencidos (fim < agora) permaneçam como "ativos".
  try { await expireVencidosMandatos({ unidadeId: uid }); } catch { /* noop */ }

  const now = new Date();
  const active = await CondDirigenciaMandato.find({
    unidadeId: uid,
    ativo: true,
    $or: [
      { fim: null },
      { fim: { $gte: now } }
    ]
  })
    .select('cargoId usuarioId')
    .lean();

  const out = {};
  for (const m of active || []) {
    const roleId = getDirigenciaRoleIdFromCargoId(m?.cargoId);
    const userId = String(m?.usuarioId || '').trim();
    if (!roleId || !userId) continue;
    out[roleId] = userId;
  }
  return out;
}

async function resolveCondUsuarioIdFromAnyUserId(usuarioId, opts = {}) {
  const raw = String(usuarioId || '').trim();
  if (!raw) return '';

  const allowCreate = !!opts?.allowCreate;
  const unidadeId = String(opts?.unidadeId || '').trim();

  // Se vier e-mail, tenta resolver (ou criar) CondUsuario diretamente.
  if (raw.includes('@')) {
    const email = raw.toLowerCase().trim();
    if (!email) return '';
    const existing = await CondUsuario.findOne({ email }).select('_id').lean();
    if (existing && existing._id) return String(existing._id);
    if (!allowCreate) return '';
    if (unidadeId && !mongoose.isValidObjectId(unidadeId)) return '';
    const created = await CondUsuario.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, ...(unidadeId ? { unidade_id: unidadeId } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('_id').lean();
    return created && created._id ? String(created._id) : '';
  }

  if (!mongoose.isValidObjectId(raw)) return '';

  // Já é CondUsuario?
  try {
    const exists = await CondUsuario.findById(raw).select('_id email').lean();
    if (exists && exists._id) return String(exists._id);
  } catch { /* noop */ }

  // Pode ser User (Gestor) -> mapear por e-mail
  try {
    const u = await User.findById(raw).select('_id email nome foto').lean();
    const email = String(u?.email || '').trim().toLowerCase();
    if (!email) return '';
    const cu = await CondUsuario.findOne({ email }).select('_id').lean();
    if (cu && cu._id) return String(cu._id);

    // Se não existir CondUsuario, opcionalmente cria para permitir mandato do diretor/admin.
    if (!allowCreate) return '';
    if (unidadeId && !mongoose.isValidObjectId(unidadeId)) return '';
    const nome = String(u?.nome || '').trim();
    const foto = String(u?.foto || '').trim();
    const created = await CondUsuario.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, ...(unidadeId ? { unidade_id: unidadeId } : {}), ...(nome ? { nome } : {}), ...(foto ? { foto } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select('_id').lean();
    return created && created._id ? String(created._id) : '';
  } catch {
    return '';
  }
}

async function userCanEditDirigenciaForUnidade(user, unidadeId, repo) {
  try {
    const unidadeRepo = repo || new UnidadesReadRepository({ unitScope: createUnitScope({ unidadeId }) });
    if (!user) return false;
    if (userCanScopeAll(user)) return true;

    const target = String(unidadeId || '').trim();
    if (!target || !mongoose.isValidObjectId(target)) return false;

    // Caminho rápido: Diretor identificado por papel + unidade no próprio ctxUser.
    try {
      if (userIsDiretor(user)) {
        const uid = String(getUserUnidadeId(user) || '').trim();
        if (uid && uid === target) return true;
      }
    } catch { /* noop */ }

    // Fallback robusto: considerar Diretor quando o usuário for o diretor cadastrado na unidade.
    // (Há cenários onde o ctxUser não traz role/nivel/unidade corretamente.)
    const pickId = (v) => {
      if (!v) return '';
      if (typeof v === 'object') return String(v._id || v.id || '').trim();
      return String(v).trim();
    };

    const userId = pickId(user?._id) || pickId(user?.id) || pickId(user?.userId) || pickId(user?.usuarioId) || pickId(user?.usuario_id);
    if (!userId || !mongoose.isValidObjectId(userId)) return false;

    try {
      const unit = await unidadeRepo.findById(target, { select: 'diretor_usuario_id' });
      const diretorId = unit?.diretor_usuario_id ? String(unit.diretor_usuario_id) : '';
      return !!(diretorId && diretorId === String(userId));
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

// API Mandatos (Dirigência)
app.get('/api/dirigencia/:unidadeId/mandatos/ativos', async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { unidadeId } = req.params;
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).json({ success: false, error: 'Unidade inválida' });
    }

    const canScopeAll = userCanScopeAll(ctxUser);
    const unidadesOptions = canScopeAll ? [] : await listarUnidadesParaUsuario(ctxUser);
    const allowed = canScopeAll
      || (await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))
      || (unidadesOptions || []).some(u => String(u?._id || '') === String(unidadeId));
    if (!allowed) return res.status(403).json({ success: false, error: 'Acesso negado' });

    // Evita "mandatos ativos" vencidos por data fim.
    try { await expireVencidosMandatos({ unidadeId }); } catch { /* noop */ }

    const now = new Date();
    const nowTs = now.getTime();

    const docs = await CondDirigenciaMandato.find({ unidadeId, ativo: true })
      .populate({ path: 'usuarioId', select: 'nome email foto ativo' })
      .select('cargoId usuarioId inicio fim origem observacao documento ativo criadoEm')
      .lean();

    const data = {};
    for (const m of docs || []) {
      const roleId = getDirigenciaRoleIdFromCargoId(m?.cargoId);
      if (!roleId) continue;
      const u = m?.usuarioId && typeof m.usuarioId === 'object' ? m.usuarioId : null;
      data[roleId] = {
        id: String(m?._id || ''),
        cargoId: String(m?.cargoId || ''),
        roleId,
        usuario: u ? {
          id: String(u?._id || ''),
          nome: String(u?.nome || '').trim(),
          email: String(u?.email || '').trim(),
          foto: String(u?.foto || '').trim(),
          ativo: !!u?.ativo
        } : {
          id: String(m?.usuarioId || ''),
          nome: '',
          email: '',
          foto: '',
          ativo: true
        },
        inicio: m?.inicio || null,
        fim: m?.fim || null,
        origem: String(m?.origem || ''),
        observacao: String(m?.observacao || ''),
        documento: (() => {
          const d = m?.documento && typeof m.documento === 'object' ? m.documento : null;
          const url = String(d?.url || '').trim();
          if (!url) return null;
          return {
            url,
            originalName: String(d?.originalName || '').trim(),
            mime: String(d?.mime || '').trim(),
            size: Number(d?.size || 0) || 0,
            uploadedAt: d?.uploadedAt || null
          };
        })(),
        ativo: !!m?.ativo && (!m?.fim || (new Date(m.fim).getTime() >= nowTs)),
        criadoEm: m?.criadoEm || null
      };
    }

    return res.json({ success: true, unidadeId: String(unidadeId), data });
  } catch (e) {
    console.error('[condominios][GET /api/dirigencia/:unidadeId/mandatos/ativos] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao carregar mandatos ativos' });
  }
});

app.get('/api/dirigencia/:unidadeId/cargos/:roleId/mandatos/historico', async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { unidadeId, roleId } = req.params;
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).json({ success: false, error: 'Unidade inválida' });
    }
    const rid = String(roleId || '').trim();
    if (!rid) return res.status(400).json({ success: false, error: 'Cargo inválido' });

    const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
    const allowed = userCanScopeAll(ctxUser)
      || (await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))
      || (unidadesOptions || []).some(u => String(u?._id || '') === String(unidadeId));
    if (!allowed) return res.status(403).json({ success: false, error: 'Acesso negado' });

    const cargoId = buildDirigenciaCargoId(unidadeId, rid);

    // Evita status inconsistente quando existir mandato vencido ainda marcado como ativo.
    try { await expireVencidosMandatos({ unidadeId, cargoId }); } catch { /* noop */ }

    const now = new Date();
    const nowTs = now.getTime();
    const docs = await CondDirigenciaMandato.find({ unidadeId, cargoId })
      .populate({ path: 'usuarioId', select: 'nome email foto ativo' })
      .sort({ inicio: -1, createdAt: -1 })
      .select('cargoId usuarioId inicio fim origem observacao documento ativo criadoEm encerradoEm')
      .lean();

    const data = (docs || []).map(m => {
      const u = m?.usuarioId && typeof m.usuarioId === 'object' ? m.usuarioId : null;
      return {
        id: String(m?._id || ''),
        cargoId: String(m?.cargoId || ''),
        roleId: rid,
        usuario: u ? {
          id: String(u?._id || ''),
          nome: String(u?.nome || '').trim(),
          email: String(u?.email || '').trim(),
          foto: String(u?.foto || '').trim(),
          ativo: !!u?.ativo
        } : {
          id: String(m?.usuarioId || ''),
          nome: '',
          email: '',
          foto: '',
          ativo: true
        },
        inicio: m?.inicio || null,
        fim: m?.fim || null,
        origem: String(m?.origem || ''),
        observacao: String(m?.observacao || ''),
        documento: (() => {
          const d = m?.documento && typeof m.documento === 'object' ? m.documento : null;
          const url = String(d?.url || '').trim();
          if (!url) return null;
          return {
            url,
            originalName: String(d?.originalName || '').trim(),
            mime: String(d?.mime || '').trim(),
            size: Number(d?.size || 0) || 0,
            uploadedAt: d?.uploadedAt || null
          };
        })(),
        ativo: !!m?.ativo && (!m?.fim || (new Date(m.fim).getTime() >= nowTs)),
        criadoEm: m?.criadoEm || null,
        encerradoEm: m?.encerradoEm || null
      };
    });

    return res.json({ success: true, unidadeId: String(unidadeId), roleId: rid, data });
  } catch (e) {
    console.error('[condominios][GET /api/dirigencia/:unidadeId/cargos/:roleId/mandatos/historico] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao carregar histórico' });
  }
});

const mandatoDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ]);
    if (!file || !file.mimetype) return cb(null, true);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', String(file.fieldname || 'documento')));
  }
});

function parseMandatoCreateBody(req, res, next) {
  try {
    if (req && typeof req.is === 'function' && req.is('multipart/form-data')) {
      return mandatoDocUpload.single('documento')(req, res, (err) => {
        if (!err) return next();
        const msg = (err && err.code === 'LIMIT_FILE_SIZE')
          ? 'Arquivo muito grande (limite 20MB)'
          : 'Arquivo inválido (use PDF, imagem, DOC ou DOCX)';
        return res.status(400).json({ success: false, error: msg });
      });
    }
    return express.json({ limit: '120kb' })(req, res, next);
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Payload inválido' });
  }
}

app.post('/api/dirigencia/:unidadeId/mandatos', parseMandatoCreateBody, async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { unidadeId } = req.params;
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).json({ success: false, error: 'Unidade inválida' });
    }

    if (!(await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))) {
      return res.status(403).json({ success: false, error: 'Sem permissão para editar Dirigência (apenas Master/Admin/Diretor).' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const roleId = String(body.roleId || '').trim();
    const usuarioIdRaw = String(body.usuarioId || '').trim();
    if (!roleId) return res.status(400).json({ success: false, error: 'Cargo inválido' });

    const usuarioId = await resolveCondUsuarioIdFromAnyUserId(usuarioIdRaw, { unidadeId, allowCreate: true });
    if (!usuarioId) {
      return res.status(400).json({
        success: false,
        error: 'Usuário inválido ou sem cadastro de condômino (CondUsuario).',
        fields: { usuarioId: usuarioIdRaw }
      });
    }

    const inicio = parseDateInput(body.inicio) || null;
    const fim = parseDateInput(body.fim) || null;
    if (!inicio) return res.status(400).json({ success: false, error: 'Data de início obrigatória' });
    if (fim && fim.getTime() < inicio.getTime()) {
      return res.status(400).json({ success: false, error: 'Data fim não pode ser anterior ao início' });
    }

    const origem = normalizeMandatoOrigem(body.origem);
    if (!origem) return res.status(400).json({ success: false, error: 'Origem inválida' });

    const observacao = String(body.observacao || '').trim();
    const cargoId = buildDirigenciaCargoId(unidadeId, roleId);

    // Garante que mandatos vencidos não bloqueiem criação (ativo=true mas fim < hoje).
    try { await expireVencidosMandatos({ unidadeId, cargoId }); } catch { /* noop */ }

    // Garante Cargo persistido (para memória institucional)
    try {
      const settings = await CondDirigenciaSettings.findOne({ unidade_id: unidadeId }).lean();
      const roles = Array.isArray(settings?.state?.roles) ? settings.state.roles : [];
      const r = roles.find(x => String(x?.id || '') === roleId) || null;
      const parentRoleId = String(r?.parentId || '').trim();
      const subordinacao = parentRoleId ? buildDirigenciaCargoId(unidadeId, parentRoleId) : '';
      const nome = String(r?.nome || '').trim() || roleId;
      const tipo = r?.mandatory ? 'sindico' : '';

      await CondDirigenciaCargo.updateOne(
        { _id: cargoId },
        { $setOnInsert: { _id: cargoId, unidadeId }, $set: { nome, subordinacao, tipo } },
        { upsert: true }
      );
    } catch { /* noop */ }

    // Validação: impedir 2 ativos
    const existingActive = await CondDirigenciaMandato.findOne({ unidadeId, cargoId, ativo: true }).select('_id').lean();
    if (existingActive) {
      return res.status(409).json({ success: false, error: 'Este cargo já possui um mandato ativo. Encerre o mandato atual antes de criar outro.' });
    }

    // Validação: impedir datas sobrepostas
    const endForQuery = fim || new Date('9999-12-31T23:59:59.999Z');
    const overlap = await CondDirigenciaMandato.findOne({
      unidadeId,
      cargoId,
      inicio: { $lte: endForQuery },
      $or: [
        { fim: null },
        { fim: { $gte: inicio } }
      ]
    }).select('_id inicio fim').lean();

    if (overlap) {
      return res.status(409).json({ success: false, error: 'Já existe um mandato com datas sobrepostas para este cargo.' });
    }

    const createdBy = (() => {
      try { return String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase(); } catch { return ''; }
    })();

    const now = new Date();
    const ativo = !fim || fim.getTime() >= now.getTime();

    const doc = await CondDirigenciaMandato.create({
      cargoId,
      unidadeId,
      usuarioId,
      inicio,
      fim: fim || null,
      origem,
      observacao,
      ativo,
      criadoEm: now,
      criadoPor: createdBy
    });

    let uploadWarning = '';

    // Upload opcional de documento (ata / ordem judicial / etc)
    try {
      const file = req && req.file ? req.file : null;
      const buf = file && file.buffer ? file.buffer : null;
      if (file && buf && buf.length) {
        const mime = String(file.mimetype || '').trim();
        const originalNameRaw = String(file.originalname || 'documento').trim();
        const safeName = originalNameRaw
          .replace(/[^a-zA-Z0-9._\-\s]+/g, '')
          .replace(/\s+/g, '_')
          .slice(0, 180) || 'documento';

        const fileName = `dirigencia/mandatos/${String(unidadeId)}/${String(doc._id)}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN
          || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
          || process.env.VERCEL_BLOB_RW_TOKEN
          || '';

        const inVercel = !!process.env.VERCEL;
        let url = '';

        if (inVercel || blobToken) {
          const uploaded = await put(fileName, buf, {
            access: 'public',
            contentType: mime || 'application/octet-stream',
            cacheControl: 'public, max-age=31536000, immutable',
            ...(blobToken ? { token: blobToken } : {})
          });
          url = String(uploaded?.url || '').trim();
        } else {
          const rel = fileName;
          const absDir = path.join(ROOT, 'public', 'uploads', path.dirname(rel));
          await fs.promises.mkdir(absDir, { recursive: true });
          const abs = path.join(ROOT, 'public', 'uploads', rel);
          await fs.promises.writeFile(abs, buf);
          url = `/uploads/${rel.replace(/\\/g, '/')}`;
        }

        if (url) {
          await CondDirigenciaMandato.updateOne(
            { _id: doc._id },
            {
              $set: {
                documento: {
                  url,
                  originalName: originalNameRaw.slice(0, 240),
                  mime: mime.slice(0, 120),
                  size: Number(file.size || buf.length || 0) || 0,
                  uploadedAt: new Date(),
                  uploadedBy: createdBy
                }
              }
            }
          );
        } else {
          uploadWarning = 'Não foi possível salvar o documento anexado (tente novamente).';
        }
      }
    } catch (upErr) {
      console.error('[condominios][dirigencia][mandato-create][upload] erro:', upErr);
      // Mantém o mandato criado, mas informa que o anexo falhou.
      // (Evita perder dados por falha de upload.)
      uploadWarning = 'Mandato criado, mas o upload do documento falhou.';
    }

    console.info('[audit-dirigencia-mandato-criado]', {
      unidadeId: String(unidadeId),
      cargoId,
      roleId,
      usuarioId,
      inicio: inicio.toISOString(),
      fim: fim ? fim.toISOString() : null,
      origem,
      by: createdBy
    });

    return res.json({ success: true, id: String(doc?._id || ''), ativo, warning: uploadWarning || null });
  } catch (e) {
    if (String(e?.code) === '11000') {
      return res.status(409).json({ success: false, error: 'Este cargo já possui um mandato ativo.' });
    }
    console.error('[condominios][POST /api/dirigencia/:unidadeId/mandatos] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao criar mandato' });
  }
});

app.post('/api/dirigencia/mandatos/:mandatoId/encerrar', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const { mandatoId } = req.params;
    if (!mandatoId || !mongoose.isValidObjectId(mandatoId)) {
      return res.status(400).json({ success: false, error: 'Mandato inválido' });
    }

    const mandato = await CondDirigenciaMandato.findById(mandatoId).select('unidadeId cargoId ativo inicio').lean();
    if (!mandato) return res.status(404).json({ success: false, error: 'Mandato não encontrado' });

    const unidadeId = String(mandato?.unidadeId || '').trim();
    if (!unidadeId) return res.status(400).json({ success: false, error: 'Unidade inválida' });

    if (!(await userCanEditDirigenciaForUnidade(ctxUser, unidadeId, unidadesReadRepoFromReq(req)))) {
      return res.status(403).json({ success: false, error: 'Sem permissão para editar Dirigência (apenas Master/Admin/Diretor).' });
    }

    if (!mandato.ativo) {
      return res.status(409).json({ success: false, error: 'Mandato já está encerrado.' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const fim = parseDateInput(body.fim) || new Date();
    try {
      const inicioTs = mandato?.inicio ? new Date(mandato.inicio).getTime() : NaN;
      if (Number.isFinite(inicioTs) && fim && fim.getTime() < inicioTs) {
        return res.status(400).json({ success: false, error: 'Data de encerramento não pode ser anterior ao início do mandato.' });
      }
    } catch { /* noop */ }
    const obsExtra = String(body.observacao || '').trim();

    const by = (() => {
      try { return String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase(); } catch { return ''; }
    })();

    const encerradoEm = new Date();
    const setFields = {
      fim,
      ativo: false,
      encerradoEm,
      encerradoPor: by
    };
    if (obsExtra) setFields.observacao = obsExtra;

    await CondDirigenciaMandato.updateOne(
      { _id: mandatoId, ativo: true },
      {
        $set: setFields
      }
    );

    console.info('[audit-dirigencia-mandato-encerrado]', {
      unidadeId,
      mandatoId: String(mandatoId),
      cargoId: String(mandato?.cargoId || ''),
      by,
      fim: fim.toISOString()
    });

    return res.json({ success: true });
  } catch (e) {
    console.error('[condominios][POST /api/dirigencia/mandatos/:mandatoId/encerrar] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao encerrar mandato' });
  }
});

// Exclusão de mandato (somente Master).
app.delete('/api/dirigencia/mandatos/:mandatoId', async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const isMaster = !!(ctxUser?.isMaster || String(ctxUser?.role || '').trim().toLowerCase() === 'master');
    if (!isMaster) return res.status(403).json({ success: false, error: 'Apenas Master pode excluir mandatos.' });

    const { mandatoId } = req.params;
    if (!mandatoId || !mongoose.isValidObjectId(mandatoId)) {
      return res.status(400).json({ success: false, error: 'Mandato inválido' });
    }

    const mandato = await CondDirigenciaMandato.findById(mandatoId).select('_id unidadeId cargoId ativo inicio fim usuarioId origem documento').lean();
    if (!mandato) return res.status(404).json({ success: false, error: 'Mandato não encontrado' });

    // Best-effort: remover arquivo local quando armazenado em /uploads.
    try {
      const url = String(mandato?.documento?.url || '').trim();
      if (url && url.startsWith('/uploads/')) {
        const abs = path.join(ROOT, 'public', url.replace(/^\/+/, ''));
        await fs.promises.unlink(abs);
      }
    } catch { /* noop */ }

    await CondDirigenciaMandato.deleteOne({ _id: mandatoId });

    console.info('[audit-dirigencia-mandato-excluido]', {
      unidadeId: String(mandato?.unidadeId || ''),
      cargoId: String(mandato?.cargoId || ''),
      mandatoId: String(mandatoId),
      ativo: !!mandato?.ativo,
      by: String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase()
    });

    return res.json({ success: true, deleted: true, id: String(mandatoId) });
  } catch (e) {
    console.error('[condominios][DELETE /api/dirigencia/mandatos/:mandatoId] erro:', e);
    return res.status(500).json({ success: false, error: 'Falha ao excluir mandato' });
  }
});

function getUserIdentityKey(user) {

  // Preferir e-mail sempre que disponível, pois é a chave usada na caixa pessoal.
  const email = String(
    user?.email ||
    user?.userEmail ||
    user?.contato_email ||
    user?.contatoEmail ||
    ''
  ).trim().toLowerCase();
  if (email) return email;

  // Fallback para sessões reduzidas (cookie) do Portal, onde às vezes sobra apenas o identificador.
  // Importante: NÃO exigir "@" aqui; cond_usuario_id (ObjectId) é uma chave estável.
  const portalId = String(user?.cond_usuario_id || user?.condUsuarioId || user?._id || user?.id || '').trim().toLowerCase();
  if (portalId) return portalId;

  const nome = String(user?.nome || user?.name || user?.username || '').trim().toLowerCase();
  return nome;
}

function getUserIdentityKeyCandidates(user) {
  try {
    const out = [];
    const add = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!s) return;
      if (out.includes(s)) return;
      out.push(s);
    };

    // Preferência: e-mail (caixa pessoal), mas inclui também IDs estáveis (habitação/portal).
    add(user?.email);
    add(user?.userEmail);
    add(user?.contato_email);
    add(user?.contatoEmail);
    add(user?.cond_usuario_id);
    add(user?.condUsuarioId);
    add(user?._id);
    add(user?.id);

    return out;
  } catch {
    return [];
  }
}

// Mensagens (Caixa): NÃO use nome como chave.
// Nome colide entre usuários diferentes (ex.: dois "Wallison...") e quebra lida/não-lida e contadores.
function getMsgIdentityKey(user, req) {
  // Preferir e-mail sempre que disponível, pois é a chave usada na caixa pessoal.
  const email = String(
    user?.email ||
    user?.userEmail ||
    user?.contato_email ||
    user?.contatoEmail ||
    ''
  ).trim().toLowerCase();
  if (email) return email;

  // Fallback: IDs estáveis (Portal/cookie reduzido/legado). Pode ser ObjectId ou, em alguns casos, o próprio e-mail.
  const id = String(
    req?.__wdgPortalCookieUserId ||
    user?.cond_usuario_id ||
    user?.condUsuarioId ||
    user?._id ||
    user?.id ||
    ''
  ).trim().toLowerCase();
  if (id) return id;

  return '';
}

function getMsgOwnerKey(user, req) {
  // A caixa pessoal deve ser única por usuário.
  // Portanto, o owner NÃO deve variar por módulo/habitação (ex.: email::portal::hab:* / email::colab).
  // Compatibilidade com dados antigos (owners com sufixo) é tratada nas queries via base e-mail/prefixo.
  return getMsgIdentityKey(user, req);
}

function defaultCreatorPermsServer() {
  return {
    administrar: true,
    gerenciarMarcador: true,
    lerMensagem: true,
    criarMensagem: true,
    gerenciarGrupos: true,
    mensagemGeral: false,
    excluirMensagem: true
  };
}

function defaultHabPublicMemberPermsServer() {
  return {
    lerMensagem: true,
    criarMensagem: true
  };
}

function normalizeEmailKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  // Compat: alguns legados prefixavam chaves (ex.: userkey:email@..., user:email@...).
  const cleaned = raw
    .replace(/^userkey:\s*/i, '')
    .replace(/^user:\s*/i, '')
    .replace(/^email:\s*/i, '');
  const base = ownerKeyBaseEmailLower(cleaned) || cleaned;
  return base && base.includes('@') ? base : '';
}

function clampMailboxName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  return s.length <= 80 ? s : s.slice(0, 80).trim();
}

function formatBlocoLabel(nome) {
  const n = String(nome || '').trim();
  if (!n) return '';
  const low = n.toLowerCase();
  if (low.startsWith('bloco')) return n;
  return `Bloco ${n}`;
}

function formatTipoLabel(tipo) {
  const t = String(tipo || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function buildHabPublicMailboxName(hab) {
  const blocoId = String(hab?.bloco_id || '').trim();
  const andarId = String(hab?.andar_id || '').trim();
  const tipo = formatTipoLabel(hab?.tipo);
  const numero = String(hab?.numero || '').trim();

  let blocoNome = '';
  let andarNome = '';

  try {
    const [bloco, andar] = await Promise.all([
      blocoId && mongoose.isValidObjectId(blocoId) ? CondBloco.findById(blocoId).select('nome').lean() : Promise.resolve(null),
      andarId && mongoose.isValidObjectId(andarId) ? CondAndar.findById(andarId).select('nome').lean() : Promise.resolve(null)
    ]);
    blocoNome = String(bloco?.nome || '').trim();
    andarNome = String(andar?.nome || '').trim();
  } catch {
    blocoNome = '';
    andarNome = '';
  }

  const parts = [];
  const blocoLabel = formatBlocoLabel(blocoNome);
  if (blocoLabel) parts.push(blocoLabel);
  if (andarNome) parts.push(andarNome);

  const tipoNumero = [tipo, numero].filter(Boolean).join(' ').trim();
  if (tipoNumero) parts.push(tipoNumero);

  return clampMailboxName(parts.join(', ') || (numero ? `Habitação ${numero}` : 'Habitação'));
}

async function resolveHabPublicMailboxAdminKey(hab) {
  const isAlugada = !!hab?.alugado;
  const habId = String(hab?._id || hab?.id || '').trim();
  const respMoradorId = hab?.contrato_locacao?.responsavel_morador_id ? String(hab.contrato_locacao.responsavel_morador_id) : '';

  const out = { adminKey: '', proprietorKey: '' };

  // Primeiro: resolve proprietário (usado também para o caso "proprietário é morador").
  const propId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
  if (propId && mongoose.isValidObjectId(propId)) {
    try {
      const prop = await CondProprietario.findById(propId).select('cond_usuario_id contato_email ativo').lean();
      const idKey = String(prop?.cond_usuario_id || '').trim().toLowerCase();
      const email = normalizeEmailKey(prop?.contato_email);
      out.proprietorKey = idKey || email || '';
    } catch {}
  }

  // Regra de negócio: se o proprietário também é morador desta habitação, ele deve ser considerado o responsável/admin.
  // (Evita duplicidade e prioriza o vínculo mais forte.)
  if (out.proprietorKey && mongoose.isValidObjectId(out.proprietorKey) && habId && mongoose.isValidObjectId(habId)) {
    try {
      const exists = await CondMorador.exists({ habitacao_id: habId, cond_usuario_id: out.proprietorKey, ativo: { $ne: false } });
      if (exists) {
        out.adminKey = out.proprietorKey;
        return out;
      }
    } catch {}
  }

  // Se estiver alugada, por padrão o responsável do contrato é o admin.
  if (isAlugada && respMoradorId && mongoose.isValidObjectId(respMoradorId)) {
    try {
      const mor = await CondMorador.findById(respMoradorId).select('cond_usuario_id email ativo').lean();
      const idKey = String(mor?.cond_usuario_id || '').trim().toLowerCase();
      if (idKey) {
        out.adminKey = idKey;
        return out;
      }
      const email = normalizeEmailKey(mor?.email);
      if (email) {
        out.adminKey = email;
        return out;
      }
    } catch {}
  }

  // Fallback: proprietário.
  out.adminKey = out.proprietorKey || '';
  return out;
}

async function resolveHabPublicMailboxMemberKeys(hab) {
  const habId = String(hab?._id || hab?.id || '').trim();
  const members = new Set();

  if (habId) {
    try {
      const moradores = await CondMorador.find({ habitacao_id: habId, ativo: { $ne: false } })
        .select('cond_usuario_id email')
        .lean();
      (moradores || []).forEach(m => {
        const idKey = String(m?.cond_usuario_id || '').trim().toLowerCase();
        // Preferir cond_usuario_id como chave canônica para evitar duplicidade (email + id).
        if (idKey) {
          members.add(idKey);
          return;
        }
        const email = normalizeEmailKey(m?.email);
        if (email) members.add(email);
      });
    } catch {}
  }

  const propId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
  if (propId && mongoose.isValidObjectId(propId)) {
    try {
      const prop = await CondProprietario.findById(propId).select('cond_usuario_id contato_email').lean();
      const idKey = String(prop?.cond_usuario_id || '').trim().toLowerCase();
      // Preferir cond_usuario_id como chave canônica para evitar duplicidade (email + id).
      if (idKey) {
        members.add(idKey);
      } else {
        const email = normalizeEmailKey(prop?.contato_email);
        if (email) members.add(email);
      }
    } catch {}
  }

  return Array.from(members);
}

async function ensureHabPublicMailboxForHabitacao(hab, opts = {}, repo) {
  const strict = !!opts.strict;
  const habId = String(hab?._id || hab?.id || '').trim();
  const unidadeId = String(hab?.unidade_id || '').trim();

  if (!habId || !mongoose.isValidObjectId(habId) || !unidadeId || !mongoose.isValidObjectId(unidadeId)) {
    if (strict) {
      const err = new Error('Habitação inválida para criação de caixa pública');
      err.status = 400;
      throw err;
    }
    return null;
  }

  const unidadeRepo = repo || new UnidadesReadRepository({ unitScope: createUnitScope({ unidadeId }) });

  const filter = {
    ativo: { $ne: false },
    unidade_id: unidadeId,
    link_type: 'habitacao',
    link_id: habId
  };

  const adminInfo = await resolveHabPublicMailboxAdminKey(hab);
  let adminKey = String(adminInfo?.adminKey || '').trim().toLowerCase();

  const desiredName = await buildHabPublicMailboxName(hab);
  let unidadeNome = '';
  try {
    const u = await unidadeRepo.findById(unidadeId, { select: 'nome nomeFantasia razaoSocial codigo' });
    unidadeNome = String(u?.nome || u?.nomeFantasia || u?.razaoSocial || u?.codigo || '').trim();
  } catch { unidadeNome = ''; }
  let mailbox = await CondMsgMailbox.findOne(filter);

  if (!mailbox) {
    mailbox = await CondMsgMailbox.create({
      name: desiredName,
      type: 'grupo',
      unidade_id: unidadeId,
      unidade_nome: unidadeNome,
      link_type: 'habitacao',
      link_id: habId,
      public: false,
      createdBy: adminKey || '',
      operators: adminKey ? [{ user: adminKey, perms: defaultCreatorPermsServer() }] : [],
      ativo: true
    });
  }

  const memberKeys = await resolveHabPublicMailboxMemberKeys(hab);

  // Se o proprietário também é morador (mesma chave canônica), ele deve ser admin/responsável.
  try {
    const proprietorKey = String(adminInfo?.proprietorKey || '').trim().toLowerCase();
    if (proprietorKey && memberKeys.includes(proprietorKey)) adminKey = proprietorKey;
  } catch {}

  const want = new Set(memberKeys);
  if (adminKey) want.add(adminKey);

  const currentOps = Array.isArray(mailbox.operators) ? mailbox.operators : [];
  const nextOpsMap = new Map();

  currentOps.forEach(op => {
    const key = String((typeof op === 'string') ? op : (op?.user || '')).trim().toLowerCase();
    if (!key) return;
    if (!want.has(key)) return;
    if (adminKey && key === adminKey) {
      nextOpsMap.set(key, { user: key, perms: defaultCreatorPermsServer() });
      return;
    }
    nextOpsMap.set(key, { user: key, perms: defaultHabPublicMemberPermsServer() });
  });

  want.forEach(key => {
    if (nextOpsMap.has(key)) return;
    if (adminKey && key === adminKey) {
      nextOpsMap.set(key, { user: key, perms: defaultCreatorPermsServer() });
      return;
    }
    nextOpsMap.set(key, { user: key, perms: defaultHabPublicMemberPermsServer() });
  });

  mailbox.name = desiredName;
  mailbox.link_type = 'habitacao';
  mailbox.link_id = habId;
  mailbox.public = false;
  if (unidadeNome) mailbox.unidade_nome = unidadeNome;
  mailbox.operators = Array.from(nextOpsMap.values());
  if (adminKey) mailbox.createdBy = adminKey;

  await mailbox.save();
  return mailbox;
}

async function syncHabPublicMailboxForHabitacaoId(habId, opts = {}) {
  const id = String(habId || '').trim();
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const hab = await CondHabitacao.findById(id)
    .select('_id unidade_id bloco_id andar_id tipo numero proprietario_id alugado contrato_locacao')
    .lean();
  if (!hab) return null;
  return ensureHabPublicMailboxForHabitacao(hab, opts);
}

function extractPortalHabitacaoIds(ctxUser, unidadeId) {
  const ids = [];
  try {
    const direct = String(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '').trim();
    if (direct && mongoose.isValidObjectId(direct)) ids.push(direct);
  } catch {}
  try {
    const vinculos = Array.isArray(ctxUser?.vinculos) ? ctxUser.vinculos : [];
    for (const v of vinculos) {
      if (ids.length >= 10) break;
      const uid = String(v?.unidade_id || v?.unidadeId || '').trim();
      if (unidadeId && uid && String(uid) !== String(unidadeId)) continue;
      const hid = String(v?.habitacao_id || v?.habitacaoId || '').trim();
      if (!hid || !mongoose.isValidObjectId(hid)) continue;
      if (!ids.includes(hid)) ids.push(hid);
    }
  } catch {}
  return ids;
}

async function collectPortalHabitacaoIds(ctxUser, req, unidadeId) {
  try {
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    if (!fromPortal) return [];

    const out = [];
    const add = (v) => {
      const s = String(v || '').trim();
      if (!s || !mongoose.isValidObjectId(s)) return;
      if (!out.includes(s)) out.push(s);
    };

    // 0) melhor esforço a partir do snapshot
    const direct = extractPortalHabitacaoIds(ctxUser, unidadeId);
    direct.forEach(add);
    if (out.length) return out;

    const userIdRaw = String(req?.__wdgPortalCookieUserId || ctxUser?.cond_usuario_id || ctxUser?.condUsuarioId || ctxUser?.id || '').trim();
    const unitObj = unidadeId && mongoose.isValidObjectId(unidadeId) ? new mongoose.Types.ObjectId(unidadeId) : null;

    // 1) por cond_usuario_id (Morador)
    if (userIdRaw) {
      try {
        const q = { cond_usuario_id: userIdRaw, ativo: { $ne: false } };
        if (unitObj) q.unidade_id = unitObj;
        const moradores = await CondMorador.find(q).select('habitacao_id').limit(20).lean().catch(() => []);
        (moradores || []).forEach(m => add(m?.habitacao_id));
      } catch { /* noop */ }
    }

    // 2) por cond_usuario_id (Proprietário -> Habitação)
    if (userIdRaw) {
      try {
        const props = await CondProprietario.find({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('_id')
          .limit(10)
          .lean()
          .catch(() => []);
        const propIds = (props || []).map(p => String(p?._id || '')).filter(mongoose.isValidObjectId);
        if (propIds.length) {
          const q = { proprietario_id: { $in: propIds.map(id => new mongoose.Types.ObjectId(id)) } };
          if (unitObj) q.unidade_id = unitObj;
          const habs = await CondHabitacao.find(q).select('_id').limit(30).lean().catch(() => []);
          (habs || []).forEach(h => add(h?._id));
        }
      } catch { /* noop */ }
    }

    // 3) por e-mails candidatos (quando cond_usuario_id não bate)
    if (!out.length) {
      try {
        const emails = await collectPortalEmailCandidatesLower(ctxUser, req);
        if (emails.length) {
          const emailRxs = emails
            .map(e => String(e || '').trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 12)
            .map(e => new RegExp('^\\s*' + escapeRegExp(e) + '\\s*$', 'i'));

          const q = {
            ativo: { $ne: false },
            $or: emailRxs.length
              ? [
                  { email: { $in: emailRxs } },
                  { responsavel_email: { $in: emailRxs } }
                ]
              : [
                  { email: { $in: emails } },
                  { responsavel_email: { $in: emails } }
                ]
          };
          if (unitObj) q.unidade_id = unitObj;
          const moradores = await CondMorador.find(q).select('habitacao_id').limit(30).lean().catch(() => []);
          (moradores || []).forEach(m => add(m?.habitacao_id));

          if (!out.length) {
            const propQuery = emailRxs.length
              ? { ativo: { $ne: false }, contato_email: { $in: emailRxs } }
              : { ativo: { $ne: false }, contato_email: { $in: emails } };
            const props = await CondProprietario.find(propQuery)
              .select('_id')
              .limit(15)
              .lean()
              .catch(() => []);
            const propIds = (props || []).map(p => String(p?._id || '')).filter(mongoose.isValidObjectId);
            if (propIds.length) {
              const qh = { proprietario_id: { $in: propIds.map(id => new mongoose.Types.ObjectId(id)) } };
              if (unitObj) qh.unidade_id = unitObj;
              const habs = await CondHabitacao.find(qh).select('_id').limit(30).lean().catch(() => []);
              (habs || []).forEach(h => add(h?._id));
            }
          }
        }
      } catch { /* noop */ }
    }

    return out.slice(0, 10);
  } catch {
    return [];
  }
}

function mailboxMatchesHabitacaoIds(mailboxDoc, habIds) {
  try {
    if (!mailboxDoc) return false;
    const linkType = String(mailboxDoc.link_type || '').trim().toLowerCase();
    if (linkType !== 'habitacao') return false;
    const linkId = String(mailboxDoc.link_id || '').trim();
    if (!linkId) return false;
    const list = Array.isArray(habIds) ? habIds : [];
    return list.includes(linkId);
  } catch {
    return false;
  }
}

function mailboxIsMember(mailboxDoc, user) {
  if (!mailboxDoc || !user) return false;
  const meList = getUserIdentityKeyCandidates(user);
  if (!meList.length) return false;
  const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
  if (createdBy && meList.includes(createdBy)) return true;
  const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
  return ops.some(op => {
    const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
    const k = String(u || '').trim().toLowerCase();
    if (!k) return false;
    return meList.includes(k);
  });
}

function mailboxMatchesPortalHabitacoes(mailboxDoc, ctxUser, unidadeId) {
  try {
    if (!mailboxDoc || !ctxUser) return false;
    const linkType = String(mailboxDoc.link_type || '').trim().toLowerCase();
    if (linkType !== 'habitacao') return false;
    const linkId = String(mailboxDoc.link_id || '').trim();
    if (!linkId) return false;
    const habIds = extractPortalHabitacaoIds(ctxUser, unidadeId);
    return habIds.includes(linkId);
  } catch {
    return false;
  }
}

function mailboxIsHabitacao(mailboxDoc) {
  try {
    const linkType = String(mailboxDoc?.link_type || '').trim().toLowerCase();
    return linkType === 'habitacao';
  } catch {
    return false;
  }
}

// Regra de privacidade: caixas vinculadas à habitação são exclusivas de moradores/proprietário.
// Mesmo usuário master/admin do Gestor NÃO deve ter acesso por padrão.
async function canAccessMsgMailbox(mailboxDoc, ctxUser, req) {
  try {
    if (!mailboxDoc) return true;

    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    const admin = userCanScopeAll(ctxUser);

    // Habitação: somente via Portal e apenas quando a habitação pertence ao usuário.
    if (mailboxIsHabitacao(mailboxDoc)) {
      if (!fromPortal) return false;

      let u = ctxUser;
      try {
        // Melhorar a chance de ter e-mail no ctxUser do Portal.
        if (!admin) u = await ensurePortalEmailInCtxUser(u, req);
      } catch {
        /* noop */
      }

      const unidadeId = mailboxDoc?.unidade_id ? String(mailboxDoc.unidade_id) : getUserUnidadeId(u);

      // Preferir checagens sem DB (snapshot/vínculos). Se não bater, cai para o coletor (DB) do Portal.
      try {
        if (mailboxMatchesPortalHabitacoes(mailboxDoc, u, unidadeId)) return true;
      } catch { /* noop */ }

      try {
        const habIds = await collectPortalHabitacaoIds(u, req, unidadeId);
        if (habIds.length && mailboxMatchesHabitacaoIds(mailboxDoc, habIds)) return true;
      } catch {
        /* noop */
      }

      return false;
    }

    // Caixas públicas do condomínio podem ser lidas pelo Portal.
    if (fromPortal && mailboxIsPublic(mailboxDoc)) return true;

    // Demais caixas: admin pode, senão precisa ser membro.
    if (admin) return true;
    return mailboxIsMember(mailboxDoc, ctxUser);
  } catch {
    return false;
  }
}

function mailboxIsPublic(mailboxDoc) {
  if (!mailboxDoc) return false;

  // Caixas vinculadas à habitação são compartilhadas apenas entre moradores/proprietário,
  // portanto não entram como "públicas" no escopo da unidade.
  const linkType = String(mailboxDoc.link_type || '').trim().toLowerCase();
  if (linkType === 'habitacao') return false;

  // Caixa pública deve ser explícita no schema; heurísticas aqui causam vazamento de acesso.
  const explicit = !!(mailboxDoc.public || mailboxDoc.publica || mailboxDoc.isPublic || mailboxDoc.visivel_publico || mailboxDoc.visivelPublico);
  return explicit;
}

function mailboxIsGroup(mailboxDoc) {
  try {
    const t = String(mailboxDoc?.type || 'grupo').trim().toLowerCase();
    return t === 'grupo';
  } catch {
    return false;
  }
}

function mailboxHasPerm(perms, key) {
  try {
    if (!perms || typeof perms !== 'object') return false;
    return !!perms[key];
  } catch {
    return false;
  }
}

function mailboxCanEdit(mailboxDoc, user) {
  if (!mailboxDoc || !user) return false;
  if (userCanScopeAll(user)) return true;
  const meList = getUserIdentityKeyCandidates(user);
  if (!meList.length) return false;
  const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
  const found = ops.find(op => {
    const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
    const k = String(u || '').trim().toLowerCase();
    return k && meList.includes(k);
  });
  const hasExplicitOverride = !!(found && typeof found === 'object' && found.perms && typeof found.perms === 'object');
  const perms = hasExplicitOverride ? found.perms : null;
  if (perms && typeof perms === 'object') {
    // Administração é separada de "gerenciar grupos":
    // - Quem tem apenas gerenciarGrupos NÃO deve conseguir editar permissões/caixa.
    if (perms.administrar) return true;
    return false;
  }

  // Criador: permitido por padrão, mas apenas quando NÃO há override explícito em operators[].
  const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
  if (createdBy && meList.includes(createdBy)) return true;
  return false;
}

function mailboxCanSendMessage(mailboxDoc, user) {
  if (!mailboxDoc || !user) return false;
  if (userCanScopeAll(user)) return true;

  const meList = getUserIdentityKeyCandidates(user);
  if (!meList.length) return false;

  const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
  const found = ops.find(op => {
    const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
    const k = String(u || '').trim().toLowerCase();
    return k && meList.includes(k);
  });
  const hasExplicitOverride = !!(found && typeof found === 'object' && found.perms && typeof found.perms === 'object');
  const perms = hasExplicitOverride ? found.perms : null;
  if (perms && typeof perms === 'object') {
    if (perms.administrar) return true;
    if (perms.criarMensagem) return true;
    return false;
  }

  // Criador: permitido por padrão, mas apenas quando NÃO há override explícito em operators[].
  const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
  if (createdBy && meList.includes(createdBy)) return true;
  return false;
}

function mailboxCanManageMarker(mailboxDoc, user) {
  if (!mailboxDoc || !user) return false;
  if (userCanScopeAll(user)) return true;

  const meList = getUserIdentityKeyCandidates(user);
  if (!meList.length) return false;

  const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
  const found = ops.find(op => {
    const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
    const k = String(u || '').trim().toLowerCase();
    return k && meList.includes(k);
  });
  const hasExplicitOverride = !!(found && typeof found === 'object' && found.perms && typeof found.perms === 'object');
  const perms = hasExplicitOverride ? found.perms : null;
  if (perms && typeof perms === 'object') {
    if (perms.administrar) return true;
    if (perms.gerenciarMarcador) return true;
    return false;
  }

  // Criador: permitido por padrão, mas apenas quando NÃO há override explícito em operators[].
  const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
  if (createdBy && meList.includes(createdBy)) return true;
  return false;
}

function mailboxCanManageGroups(mailboxDoc, user) {
  if (!mailboxDoc || !user) return false;
  if (userCanScopeAll(user)) return true;
  const meList = getUserIdentityKeyCandidates(user);
  if (!meList.length) return false;
  const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
  const found = ops.find(op => {
    const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
    const k = String(u || '').trim().toLowerCase();
    return k && meList.includes(k);
  });
  const hasExplicitOverride = !!(found && typeof found === 'object' && found.perms && typeof found.perms === 'object');
  const perms = hasExplicitOverride ? found.perms : null;
  if (perms && typeof perms === 'object') {
    if (perms.administrar) return true;
    if (perms.gerenciarGrupos) return true;
    return false;
  }

  // Criador: permitido por padrão, mas apenas quando NÃO há override explícito em operators[].
  const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
  if (createdBy && meList.includes(createdBy)) return true;
  return false;
}

const MAILBOX_PERM_KEYS = [
  'administrar',
  'gerenciarMarcador',
  'lerMensagem',
  'criarMensagem',
  'gerenciarGrupos',
  'mensagemGeral',
  'excluirMensagem'
];

function mailboxGetUserPerms(mailboxDoc, user) {
  try {
    if (!mailboxDoc || !user) return {};
    if (userCanScopeAll(user)) return { administrar: true };
    const meList = getUserIdentityKeyCandidates(user);
    if (!meList.length) return {};
    const ops = Array.isArray(mailboxDoc.operators) ? mailboxDoc.operators : [];
    const found = ops.find(op => {
      const u = (typeof op === 'string') ? op : (op && typeof op === 'object' ? op.user : '');
      const k = String(u || '').trim().toLowerCase();
      return k && meList.includes(k);
    });

    // Se existe override explícito no operador, ele prevalece (inclusive para o criador).
    const perms = found && typeof found === 'object' && found.perms && typeof found.perms === 'object' ? found.perms : null;
    if (perms && typeof perms === 'object') return perms;

    // Criador: default completo quando não existe override.
    const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
    if (createdBy && meList.includes(createdBy)) return defaultCreatorPermsServer();

    return {};
  } catch {
    return {};
  }
}

function sanitizeMailboxPerms(raw) {
  const inPerms = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const k of MAILBOX_PERM_KEYS) {
    out[k] = !!inPerms[k];
  }
  return out;
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureMongoReady() {
  try {
    if (mongoose.connection.readyState === 1) return true;
    const mongoUrl = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
    if (!mongoUrl) return false;
    await connectMongo(mongoUrl);
    return mongoose.connection.readyState === 1;
  } catch {
    return mongoose.connection.readyState === 1;
  }
}
// Retenção automática da Caixa de Mensagens
// - Entrada/Saída -> Lixeira após 3 meses
// - Lixeira -> exclusão definitiva após 10 dias
// - Arquivo não é apagado automaticamente
const COND_MSG_RETENTION_MOVE_TO_TRASH_MONTHS = 3;
const COND_MSG_RETENTION_DELETE_TRASH_DAYS = 10;
const COND_MSG_RETENTION_THROTTLE_MS = 15 * 60 * 1000;

function __condMsgRetentionGlobals() {
  const g = globalThis;
  if (!g.__COND_MSG_RETENTION) {
    g.__COND_MSG_RETENTION = { lastRunAt: 0, inflight: null, intervalStarted: false };
  }
  return g.__COND_MSG_RETENTION;
}

function __utcMonthsAgo(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - Math.max(0, Number(months) || 0));
  return d;
}

function __daysAgo(days) {
  const ms = Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

async function runCondMsgRetention(reason) {
  // Não roda sem Mongo pronto
  if (mongoose.connection.readyState !== 1) return { ok: false, skipped: true, reason: 'db-not-ready' };

  const now = new Date();
  const cutoffOld = __utcMonthsAgo(COND_MSG_RETENTION_MOVE_TO_TRASH_MONTHS);
  const cutoffTrash = __daysAgo(COND_MSG_RETENTION_DELETE_TRASH_DAYS);

  // 1) Move para lixeira: qualquer state ainda em Entrada/Saída (não arquivado e não na lixeira)
  // Observação: a diferença entre Entrada/Saída é inferida pelo remetente (from_*).
  // Isso mantém a restauração coerente (lixeira_de = entrada/saida).
  try {
    await CondMsgMessage.updateMany(
      {
        ativo: { $ne: false },
        createdAt: { $lt: cutoffOld },
        states: { $elemMatch: { lixeira_em: null, arquivada_em: null } }
      },
      [
        {
          $set: {
            states: {
              $map: {
                input: '$states',
                as: 'st',
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$$st.lixeira_em', null] },
                        { $eq: ['$$st.arquivada_em', null] }
                      ]
                    },
                    {
                      $mergeObjects: [
                        '$$st',
                        {
                          lixeira_em: now,
                          lixeira_de: {
                            $cond: [
                              {
                                $and: [
                                  { $eq: ['$$st.mailbox_id', '$from_mailbox_id'] },
                                  {
                                    $cond: [
                                      { $eq: ['$$st.mailbox_id', 'pessoal'] },
                                      { $eq: ['$$st.owner', '$from_owner'] },
                                      true
                                    ]
                                  }
                                ]
                              },
                              'saida',
                              'entrada'
                            ]
                          },
                          arquivada_em: null,
                          arquivada_de: '',
                          fixada_em: null
                        }
                      ]
                    },
                    '$$st'
                  ]
                }
              }
            }
          }
        }
      ]
    );
  } catch (e) {
    console.warn('[condominios][msg-retention] falha ao mover para lixeira:', e?.message || e);
  }

  // 2) Exclusão definitiva: remove o state quando estiver na lixeira há 10 dias.
  // Regra: independe da origem (entrada/saida/arquivo).
  try {
    await CondMsgMessage.updateMany(
      {
        ativo: { $ne: false },
        states: { $elemMatch: { lixeira_em: { $type: 'date' } } }
      },
      [
        {
          $set: {
            states: {
              $filter: {
                input: '$states',
                as: 'st',
                cond: {
                  $not: {
                    $and: [
                      { $ne: ['$$st.lixeira_em', null] },
                      { $lte: ['$$st.lixeira_em', cutoffTrash] }
                    ]
                  }
                }
              }
            }
          }
        },
        {
          $set: {
            ativo: {
              $cond: [
                { $gt: [{ $size: '$states' }, 0] },
                '$ativo',
                false
              ]
            }
          }
        }
      ]
    );
  } catch (e) {
    console.warn('[condominios][msg-retention] falha ao excluir lixeira:', e?.message || e);
  }

  return { ok: true, reason: String(reason || '') };
}

async function maybeRunCondMsgRetention(reason) {
  const g = __condMsgRetentionGlobals();
  const now = Date.now();

  // throttling + in-flight guard
  if (g.inflight) return g.inflight;
  if (g.lastRunAt && (now - g.lastRunAt) < COND_MSG_RETENTION_THROTTLE_MS) return null;

  g.inflight = (async () => {
    try {
      const r = await runCondMsgRetention(reason);
      g.lastRunAt = Date.now();
      return r;
    } finally {
      g.inflight = null;
    }
  })();

  return g.inflight;
}

function startCondMsgRetentionInterval() {
  const g = __condMsgRetentionGlobals();
  if (g.intervalStarted) return;
  const isTest = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
  const isParity = String(process.env.PARITY || '').toLowerCase() === '1';
  if (isTest || isParity) return;
  g.intervalStarted = true;
  try {
    const t = registerTimer(setInterval(() => {
      // Best-effort; não bloquear a thread.
      maybeRunCondMsgRetention('interval').catch(() => { /* noop */ });
    }, 60 * 60 * 1000));
    g.intervalTimer = t;
    if (typeof t?.unref === 'function') t.unref();
  } catch {
    // ignore
  }
}

function resolveMailboxScope(ctxUser, mailboxId, req) {
  const mb = String(mailboxId || '').trim() || 'pessoal';
  if (mb === 'pessoal') {
    const owner = getMsgOwnerKey(ctxUser, req);
    return { mailboxId: 'pessoal', owner: String(owner || '').trim().toLowerCase() };
  }
  return { mailboxId: mb, owner: '' };
}

function isGoodPersonalMailboxOwnerKey(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (isEmailish(normalized)) return true;
  if (ownerKeyBaseEmailLower(normalized)) return true;
  if (mongoose.isValidObjectId(normalized)) return true;
  return false;
}

async function resolvePortalPersonalReadCtxUser(ctxUser, req) {
  let nextCtxUser = ctxUser;

  try {
    nextCtxUser = await ensurePortalEmailInCtxUser(nextCtxUser, req);
  } catch {
    nextCtxUser = ctxUser;
  }

  let email = String(
    nextCtxUser?.email ||
    nextCtxUser?.userEmail ||
    nextCtxUser?.contato_email ||
    nextCtxUser?.contatoEmail ||
    ''
  ).trim().toLowerCase();
  if (isEmailish(email)) return nextCtxUser;

  const userIdRaw = String(
    req?.__wdgPortalCookieUserId ||
    nextCtxUser?.cond_usuario_id ||
    nextCtxUser?.condUsuarioId ||
    nextCtxUser?.id ||
    ''
  ).trim();
  const habIdRaw = String(nextCtxUser?.habitacao_id || nextCtxUser?.habitacaoId || '').trim();

  if (isEmailish(userIdRaw)) {
    email = String(userIdRaw).trim().toLowerCase();
  }

  if (!isEmailish(email) && userIdRaw && mongoose.isValidObjectId(userIdRaw)) {
    try {
      const condUser = await CondUsuario.findById(userIdRaw).select('email').lean().catch(() => null);
      const candidate = String(condUser?.email || '').trim().toLowerCase();
      if (isEmailish(candidate)) email = candidate;
    } catch { /* noop */ }

    if (!isEmailish(email)) {
      try {
        if (User) {
          const gestorUser = await User.findById(userIdRaw).select('email').lean().catch(() => null);
          const candidate = String(gestorUser?.email || '').trim().toLowerCase();
          if (isEmailish(candidate)) email = candidate;
        }
      } catch { /* noop */ }
    }

    if (!isEmailish(email)) {
      try {
        const morador = await CondMorador.findOne({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('email responsavel_email')
          .lean()
          .catch(() => null);
        const candidateEmail = String(morador?.email || '').trim().toLowerCase();
        const candidateResponsavel = String(morador?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(candidateEmail)) email = candidateEmail;
        else if (isEmailish(candidateResponsavel)) email = candidateResponsavel;
      } catch { /* noop */ }
    }

    if (!isEmailish(email)) {
      try {
        const proprietario = await CondProprietario.findOne({ cond_usuario_id: userIdRaw, ativo: { $ne: false } })
          .select('contato_email')
          .lean()
          .catch(() => null);
        const candidate = String(proprietario?.contato_email || '').trim().toLowerCase();
        if (isEmailish(candidate)) email = candidate;
      } catch { /* noop */ }
    }

    if (!isEmailish(email)) {
      try {
        const moradorById = await CondMorador.findById(userIdRaw).select('email responsavel_email').lean().catch(() => null);
        const candidateEmail = String(moradorById?.email || '').trim().toLowerCase();
        const candidateResponsavel = String(moradorById?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(candidateEmail)) email = candidateEmail;
        else if (isEmailish(candidateResponsavel)) email = candidateResponsavel;
      } catch { /* noop */ }
    }

    if (!isEmailish(email)) {
      try {
        const proprietarioById = await CondProprietario.findById(userIdRaw).select('contato_email').lean().catch(() => null);
        const candidate = String(proprietarioById?.contato_email || '').trim().toLowerCase();
        if (isEmailish(candidate)) email = candidate;
      } catch { /* noop */ }
    }
  }

  if (!isEmailish(email) && habIdRaw && mongoose.isValidObjectId(habIdRaw)) {
    try {
      const hab = await CondHabitacao.findById(habIdRaw)
        .select('proprietario_id contrato_locacao.responsavel_morador_id')
        .lean()
        .catch(() => null);

      const respMoradorId = hab?.contrato_locacao?.responsavel_morador_id
        ? String(hab.contrato_locacao.responsavel_morador_id)
        : '';
      if (respMoradorId && mongoose.isValidObjectId(respMoradorId)) {
        const morador = await CondMorador.findById(respMoradorId).select('email responsavel_email').lean().catch(() => null);
        const candidateEmail = String(morador?.email || '').trim().toLowerCase();
        const candidateResponsavel = String(morador?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(candidateEmail)) email = candidateEmail;
        else if (isEmailish(candidateResponsavel)) email = candidateResponsavel;
      }

      if (!isEmailish(email)) {
        const moradorDaHabitacao = await CondMorador.findOne({ habitacao_id: habIdRaw, ativo: { $ne: false }, email: { $ne: '' } })
          .select('email')
          .lean()
          .catch(() => null);
        const candidate = String(moradorDaHabitacao?.email || '').trim().toLowerCase();
        if (isEmailish(candidate)) email = candidate;
      }

      if (!isEmailish(email)) {
        const moradorResponsavel = await CondMorador.findOne({ habitacao_id: habIdRaw, ativo: { $ne: false }, responsavel_email: { $ne: '' } })
          .select('responsavel_email')
          .lean()
          .catch(() => null);
        const candidate = String(moradorResponsavel?.responsavel_email || '').trim().toLowerCase();
        if (isEmailish(candidate)) email = candidate;
      }

      const proprietarioId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
      if (!isEmailish(email) && proprietarioId && mongoose.isValidObjectId(proprietarioId)) {
        const proprietario = await CondProprietario.findById(proprietarioId).select('contato_email').lean().catch(() => null);
        const candidate = String(proprietario?.contato_email || '').trim().toLowerCase();
        if (isEmailish(candidate)) email = candidate;
      }
    } catch { /* noop */ }
  }

  if (!isEmailish(email)) return nextCtxUser;
  return { ...(nextCtxUser || {}), email, userEmail: email };
}

function buildMsgPersonalReadOwnerCandidates({ scope, ctxUser, req, fromPortal, admin, portalEmailCandidatesLower, includePortalEmailCandidates = false, includePortalHabitacaoOwnerVariants = false }) {
  if (scope.mailboxId !== 'pessoal') return [];

  const out = [];
  const add = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return;
    if (!isGoodPersonalMailboxOwnerKey(normalized)) return;
    if (!out.includes(normalized)) out.push(normalized);
  };

  const ownerExact = String(scope.owner || '').trim().toLowerCase();
  const baseEmail = ownerKeyBaseEmailLower(ownerExact) || '';

  add(ownerExact);
  add(ctxUser?.email);
  add(ctxUser?.userEmail);
  add(ctxUser?.contato_email);
  add(ctxUser?.contatoEmail);
  add(ctxUser?.cond_usuario_id);
  add(ctxUser?.condUsuarioId);
  add(ctxUser?._id);
  add(ctxUser?.id);
  add(req?.__wdgPortalCookieUserId);

  if (baseEmail) {
    add(baseEmail);
    add(`${baseEmail}::portal`);
    add(`${baseEmail}::colab`);
  }

  if (includePortalHabitacaoOwnerVariants && fromPortal && !admin) {
    const habIdRaw = String(ctxUser?.habitacao_id || ctxUser?.habitacaoId || '').trim();
    const ownerBaseEmail = ownerKeyBaseEmailLower(ownerExact) || normalizeEmailKey(ownerExact)
      || String(ctxUser?.email || ctxUser?.userEmail || ctxUser?.contato_email || ctxUser?.contatoEmail || '').trim().toLowerCase();
    if (isEmailish(ownerBaseEmail)) {
      add(ownerBaseEmail);
      add(`${ownerBaseEmail}::portal`);
      add(`${ownerBaseEmail}::colab`);
      if (habIdRaw && mongoose.isValidObjectId(habIdRaw)) {
        add(`${ownerBaseEmail}::portal::hab:${habIdRaw}`);
      }
    }
  }

  if (includePortalEmailCandidates || !(fromPortal && !admin)) {
    (Array.isArray(portalEmailCandidatesLower) ? portalEmailCandidatesLower : []).forEach(add);
  }

  return out;
}

function buildMsgPersonalReadNameFallback({ scope, ctxUser, fromPortal, allowNameFallbackWhenEmailResolved = false }) {
  if (!fromPortal) return null;
  if (scope.mailboxId !== 'pessoal') return null;

  const ownerExact = String(scope.owner || '').trim().toLowerCase();
  const ownerBase = ownerKeyBaseEmailLower(ownerExact) || '';
  if (!allowNameFallbackWhenEmailResolved && (isEmailish(ownerExact) || isEmailish(ownerBase))) {
    return null;
  }

  const rawName = String(ctxUser?.nome || ctxUser?.name || ctxUser?.username || '').trim();
  const normalizedName = rawName.replace(/\s+/g, ' ').trim();
  if (!normalizedName) return null;

  const unidadeIdRaw = getUserUnidadeId(ctxUser);
  if (!unidadeIdRaw || !mongoose.isValidObjectId(unidadeIdRaw)) return null;

  return {
    unidadeId: String(unidadeIdRaw),
    nameRx: new RegExp('^\\s*' + escapeRegExp(normalizedName) + '\\s*$', 'i')
  };
}

async function preparePortalMailboxReadSideContext({
  ctxUser,
  req,
  qUnidade = '',
  includeAllowedUnitIds = false,
}) {
  const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
  const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
    || refLower.includes('/portal-morador');
  const admin = userCanScopeAll(ctxUser);

  let nextCtxUser = ctxUser;
  if (fromPortal && !admin) {
    try {
      nextCtxUser = await ensurePortalEmailInCtxUser(nextCtxUser, req);
    } catch { /* noop */ }
  }

  const unidadeId = admin
    ? String(qUnidade || '').trim()
    : getUserUnidadeId(nextCtxUser);
  let allowedUnitIds = [];
  if (includeAllowedUnitIds && fromPortal && !admin) {
    try {
      const unidadesOptions = await listarUnidadesParaUsuario(nextCtxUser);
      const unitIds = (unidadesOptions || []).map(u => u?._id).filter(Boolean).map(String);
      allowedUnitIds = unitIds.filter(mongoose.isValidObjectId);
    } catch {
      allowedUnitIds = [];
    }
  }

  let portalHabIds = [];
  if (fromPortal && !admin) {
    try {
      portalHabIds = await collectPortalHabitacaoIds(nextCtxUser, req, unidadeId);
      for (const hid of portalHabIds) {
        try { await syncHabPublicMailboxForHabitacaoId(hid); } catch { /* noop */ }
      }
    } catch {
      portalHabIds = [];
    }
  }

  return {
    ctxUser: nextCtxUser,
    admin,
    fromPortal,
    unidadeId,
    allowedUnitIds,
    portalHabIds,
  };
}

async function preparePortalMailboxWriteSideContext({
  ctxUser,
  req,
  qUnidade = '',
}) {
  const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
  const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
    || refLower.includes('/portal-morador');
  const admin = userCanScopeAll(ctxUser);

  let nextCtxUser = ctxUser;
  if (fromPortal && !admin) {
    try {
      nextCtxUser = await ensurePortalEmailInCtxUser(nextCtxUser, req);
    } catch { /* noop */ }
  }

  const unidadeId = admin
    ? normalizeObjectIdString(qUnidade)
    : normalizeObjectIdString(getUserUnidadeId(nextCtxUser));

  return {
    ctxUser: nextCtxUser,
    admin,
    fromPortal,
    unidadeId,
  };
}

function ensureMessageState(doc, scope) {
  if (!doc) return null;
  const states = Array.isArray(doc.states) ? doc.states : [];
  const mb = String(scope?.mailboxId || '').trim();
  const owner = String(scope?.owner || '').trim().toLowerCase();
  let st = states.find(s => String(s?.mailbox_id || '').trim() === mb && String(s?.owner || '').trim().toLowerCase() === owner);
  if (!st) {
    const newState = { mailbox_id: mb, owner, lida_em: null, arquivada_em: null, arquivada_de: '', lixeira_em: null, lixeira_de: '', excluida_em: null, fixada_em: null, marcadores: [] };
    // Preferir push para manter o tipo do array/subdoc do Mongoose.
    try {
      if (doc.states && typeof doc.states.push === 'function') {
        doc.states.push(newState);
        st = doc.states[doc.states.length - 1];
      } else {
        st = newState;
        doc.states = [...states, st];
      }
    } catch {
      st = newState;
      doc.states = [...states, st];
    }
    try { if (typeof doc.markModified === 'function') doc.markModified('states'); } catch { /* noop */ }
  }
  return st;
}

function memberToScopeKeys(member) {
  const type = String(member?.type || '').trim().toLowerCase();
  if (type === 'mailbox' || member?.mailboxId) {
    const mailboxId = String(member?.mailboxId || member?.id || '').trim();
    if (!mailboxId) return null;
    return { mailboxId, owner: '' };
  }

  // Preferir chave contextual quando disponível
  const ownerKey = String(member?.ownerKey || member?.owner_key || '').trim().toLowerCase();
  if (ownerKey) {
    const base = ownerKeyBaseEmailLower(ownerKey) || normalizeEmailKey(ownerKey) || ownerKey;
    return { mailboxId: 'pessoal', owner: String(base || '').trim().toLowerCase() };
  }

  const email = String(member?.email || '').trim().toLowerCase();
  if (!email) return null;

  const origemRaw = String(member?.origem || member?.origin || '').trim().toLowerCase();
  // Caixa pessoal unificada: origem/habitação não devem fragmentar o owner.
  if (origemRaw === 'portal') return { mailboxId: 'pessoal', owner: email };
  if (origemRaw === 'colaborador' || origemRaw === 'colab' || origemRaw === 'funcionario' || origemRaw === 'funcionário') return { mailboxId: 'pessoal', owner: email };

  // Legado: sem origem/contexto
  return { mailboxId: 'pessoal', owner: email };
}

function normalizeMarkerName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.replace(/\s+/g, ' ').slice(0, 60);
}

function normalizeMarkerColorKey(cor) {
  const k = String(cor || '').trim().toLowerCase();
  if (!k) return '';
  const allowed = new Set([
    'blue', 'indigo', 'purple', 'pink',
    'red', 'orange', 'yellow', 'green',
    'teal', 'cyan', 'gray', 'gray-300', 'gray-700', 'gray-dark',
    'info', 'warning', 'light', 'dark',
    'primary', 'secondary', 'success', 'danger',
    'blue-soft', 'indigo-soft', 'purple-soft', 'pink-soft',
    'red-soft', 'orange-soft', 'yellow-soft', 'green-soft',
    'teal-soft', 'cyan-soft',
    'primary-soft', 'secondary-soft', 'success-soft', 'danger-soft'
  ]);
  return allowed.has(k) ? k : '';
}

function padN(n, size) {
  try {
    const s = String(n ?? '');
    const w = Math.max(0, Number(size) || 0);
    return w ? s.padStart(w, '0') : s;
  } catch {
    return String(n ?? '');
  }
}

function inferDocCreatedAt(doc) {
  try {
    if (!doc || typeof doc !== 'object') return null;
    if (doc.createdAt instanceof Date && !isNaN(doc.createdAt)) return doc.createdAt;

    const id = doc._id;
    if (id && typeof id.getTimestamp === 'function') {
      const ts = id.getTimestamp();
      if (ts instanceof Date && !isNaN(ts)) return ts;
    }

    const raw = String(id || '').trim();
    if (raw && mongoose.isValidObjectId(raw)) {
      const oid = new mongoose.Types.ObjectId(raw);
      const ts = oid.getTimestamp();
      if (ts instanceof Date && !isNaN(ts)) return ts;
    }
  } catch {
    /* noop */
  }
  return null;
}

function toMessageListItem(doc, scope, folder) {
  if (!doc) return null;
  const mb = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();
  const states = Array.isArray(doc.states) ? doc.states : [];
  const baseEmail = (mb === 'pessoal') ? (ownerKeyBaseEmailLower(owner) || '') : '';
  const mailboxOk = (s) => String(s?.mailbox_id || '').trim() === mb;
  const ownerLowerOf = (v) => String(v || '').trim().toLowerCase();
  const baseOf = (v) => {
    const low = ownerLowerOf(v);
    return ownerKeyBaseEmailLower(low) || normalizeEmailKey(low) || '';
  };
  const ownerMatches = (emailOrOwner) => {
    const v = ownerLowerOf(emailOrOwner);
    if (!v || !owner) return false;
    if (v === owner) return true;
    if (mb === 'pessoal' && baseEmail) {
      const b = baseOf(v);
      return !!b && b === baseEmail;
    }
    return false;
  };

  let st = states.find(s => mailboxOk(s) && ownerLowerOf(s?.owner) === owner) || null;
  if (!st && mb === 'pessoal' && baseEmail) {
    const byBase = states.filter(s => mailboxOk(s) && baseOf(s?.owner) === baseEmail);
    const readOne = byBase.find(s => !!s?.lida_em);
    st = readOne || byBase[0] || null;
  }

  const createdAt = inferDocCreatedAt(doc);

  const sentFromThisScope = (String(doc.from_mailbox_id || '').trim() === mb)
    && (mb !== 'pessoal' || ownerMatches(doc.from_owner));

  // Caso especial: usuário enviou para si mesmo (pessoal -> pessoal com o próprio email em To/CC).
  // A mensagem deve aparecer como recebida na Entrada/Arquivo/Lixeira (e respeitar lida_em),
  // mas como enviada na Saída.
  const sentToSelf = (() => {
    try {
      if (mb !== 'pessoal') return false;
      if (!sentFromThisScope) return false;
      const listTo = Array.isArray(doc.to) ? doc.to : [];
      const listCc = Array.isArray(doc.cc) ? doc.cc : [];
      const isMe = (m) => ownerMatches(String(m?.email || '').trim().toLowerCase());
      return listTo.some(isMe) || listCc.some(isMe);
    } catch {
      return false;
    }
  })();

  let treatAsSent = (folder === 'saida') || ((folder === 'lixeira' || folder === 'arquivo') && sentFromThisScope);
  if (sentToSelf && folder !== 'saida') treatAsSent = false;

  // Identifica se esta caixa/usuário recebeu como destinatário principal (Para) ou como Cópia (CC)
  // Regra: só considera "Cópia" quando está em CC e não está em Para.
  let receivedAsCopy = false;
  if (!treatAsSent) {
    const listTo = Array.isArray(doc.to) ? doc.to : [];
    const listCc = Array.isArray(doc.cc) ? doc.cc : [];
    if (mb === 'pessoal') {
      const isTo = listTo.some(m => ownerMatches(String(m?.email || '').trim().toLowerCase()));
      const isCc = listCc.some(m => ownerMatches(String(m?.email || '').trim().toLowerCase()));
      receivedAsCopy = !!(isCc && !isTo);
    } else {
      const isTo = listTo.some(m => String(m?.mailboxId || '').trim() === mb);
      const isCc = listCc.some(m => String(m?.mailboxId || '').trim() === mb);
      receivedAsCopy = !!(isCc && !isTo);
    }
  }

  // Para mensagens tratadas como "enviadas" (Saída e equivalentes), não exibimos estado de "não lida".
  const isRead = treatAsSent ? true : !!(st && st.lida_em);
  const isPinned = !!(st && st.fixada_em);
  const hasAttachment = Array.isArray(doc.anexos) && doc.anexos.length > 0;

  let remetente = String(doc.from_mailbox_name || doc.from_mailbox_id || '').trim();
  if (treatAsSent) {
    const list = [...(doc.to || []), ...(doc.cc || [])].filter(Boolean);
    const first = list[0];
    if (first) {
      const t = String(first?.type || '').trim().toLowerCase();
      if (t === 'mailbox') remetente = String(first?.name || '').trim() || remetente;
      else remetente = String(first?.nome || '').trim() || String(first?.email || '').trim() || remetente;
    }

    // Override opcional (best-effort) para padronizar exibição do destinatário na Saída,
    // alinhando com a padronização feita para remetente na Entrada.
    try {
      const v = String(doc.__destinatario_display || '').trim();
      if (v) remetente = v;
    } catch { /* noop */ }
  }

  // Override opcional (best-effort) para padronizar exibição do remetente na listagem
  if (!treatAsSent && doc && doc.__remetente_display) {
    const v = String(doc.__remetente_display || '').trim();
    if (v) remetente = v;
  }

  return {
    id: String(doc._id || ''),
    protocolo: String(doc.protocolo || '').trim(),
    remetente,
    assunto: String(doc.assunto || '').trim(),
    data: createdAt || null,
    lida: isRead,
    fixada: isPinned,
    comAnexo: hasAttachment,
    copia: receivedAsCopy,
    marcadores: Array.isArray(st?.marcadores) ? st.marcadores : [],
    threadRootId: doc.thread_root_id ? String(doc.thread_root_id) : '',
    inReplyToId: doc.in_reply_to ? String(doc.in_reply_to) : '',
    forwardedFromId: doc.forwarded_from_id ? String(doc.forwarded_from_id) : '',
    threadCount: Number(doc.__thread_count) || 0,
    threadHasReply: !!doc.__thread_has_reply,
    threadHasForward: !!doc.__thread_has_forward,
    threadIsRoot: !!doc.__thread_is_root
  };
}

function isEmailish(value) {
  const s = String(value || '').trim();
  return !!(s && s.includes('@') && s.length >= 5);
}

function stripMailboxPrefix(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  // Ex: "Pessoal - Fulano" -> "Fulano"
  const m = /^\s*[^-]{1,60}\s-\s(.+)$/.exec(s);
  if (m && m[1]) return String(m[1]).trim();
  return s;
}

function normalizeAndarLabel(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/\bandar\b/i.test(s)) return s;
  return `${s} Andar`;
}

function buildSenderHabitacaoLabel(habDoc, blocoDoc, andarDoc) {
  if (!habDoc) return '';
  const parts = [];
  if (blocoDoc && (blocoDoc.nome || blocoDoc.codigo)) {
    parts.push(`Bloco ${String(blocoDoc.nome || blocoDoc.codigo).trim()}`);
  }
  if (andarDoc && (andarDoc.nome || andarDoc.codigo)) {
    parts.push(normalizeAndarLabel(andarDoc.nome || andarDoc.codigo));
  }
  const tipo = String(habDoc.tipo || '').trim() || 'Habitação';
  const numero = String(habDoc.numero || '').trim();
  if (numero) parts.push(`${tipo} ${numero}`);
  return parts.filter(Boolean).join(' - ');
}

function memberDisplayName(m) {
  if (!m) return '';
  const t = String(m.type || '').trim().toLowerCase();
  if (t === 'mailbox') return String(m.name || m.nome || m.display || '').trim();
  return String(m.display || m.nome || m.name || m.email || '').trim();
}

async function buildRecipientDisplayMapForUnit(unidadeIdRaw, emailsLower) {
  try {
    const unidadeId = String(unidadeIdRaw || '').trim();
    const emails = Array.isArray(emailsLower) ? emailsLower.map(e => String(e || '').trim().toLowerCase()).filter(Boolean) : [];
    if (!emails.length) return new Map();
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) return new Map();

    const unidadeObjId = new mongoose.Types.ObjectId(unidadeId);
    const emailRxs = emails.map(e => new RegExp('^\\s*' + escapeRegExp(e) + '\\s*$', 'i'));

    const [moradores, proprietarios, users, condUsers] = await Promise.all([
      CondMorador.find({
        unidade_id: unidadeObjId,
        ativo: { $ne: false },
        $or: [
          { email: { $in: emailRxs } },
          { responsavel_email: { $in: emailRxs } }
        ]
      })
        .select('unidade_id email responsavel_email nome habitacao_id')
        .lean(),
      CondProprietario.find({
        unidade_id: unidadeObjId,
        ativo: { $ne: false },
        contato_email: { $in: emailRxs }
      })
        .select('unidade_id contato_email nome')
        .lean(),
      (User ? User.find({ email: { $in: emailRxs }, ativo: { $ne: false } }).select('email nome name username role').lean() : Promise.resolve([])),
      CondUsuario.find({ email: { $in: emailRxs } }).select('email nome name').lean()
    ]);

    const moradorByEmail = new Map();
    const propByEmail = new Map();
    const userByEmail = new Map();
    const condUserByEmail = new Map();

    (moradores || []).forEach(m => {
      const e1 = String(m?.email || '').trim().toLowerCase();
      const e2 = String(m?.responsavel_email || '').trim().toLowerCase();
      if (e1) moradorByEmail.set(e1, m);
      if (e2) moradorByEmail.set(e2, m);
    });
    (proprietarios || []).forEach(p => {
      const e = String(p?.contato_email || '').trim().toLowerCase();
      if (e) propByEmail.set(e, p);
    });
    (users || []).forEach(u => {
      const e = String(u?.email || '').trim().toLowerCase();
      if (e) userByEmail.set(e, u);
    });
    (condUsers || []).forEach(u => {
      const e = String(u?.email || '').trim().toLowerCase();
      if (e) condUserByEmail.set(e, u);
    });

    // Habitacões relacionadas (morador via habitacao_id; proprietário via vínculo na habitação)
    const habitacaoIds = new Set();
    (moradores || []).forEach(m => { if (m?.habitacao_id) habitacaoIds.add(String(m.habitacao_id)); });

    const propIds = (proprietarios || []).map(p => (p && p._id ? String(p._id) : null)).filter(Boolean);
    const habByProp = new Map();
    if (propIds.length) {
      const habs = await CondHabitacao.find({
        unidade_id: unidadeObjId,
        proprietario_id: { $in: propIds.filter(mongoose.isValidObjectId).map(id => new mongoose.Types.ObjectId(id)) },
        ativa: { $ne: false }
      })
        .select('_id unidade_id proprietario_id bloco_id andar_id numero tipo')
        .sort({ numero: 1 })
        .lean();

      (habs || []).forEach(h => {
        const pid = h?.proprietario_id ? String(h.proprietario_id) : '';
        if (!pid) return;
        if (!habByProp.has(pid)) habByProp.set(pid, h);
        if (h?._id) habitacaoIds.add(String(h._id));
      });
    }

    const habMap = new Map();
    const blocoIds = new Set();
    const andarIds = new Set();
    const habIdList = Array.from(habitacaoIds).filter(mongoose.isValidObjectId);
    if (habIdList.length) {
      const habDocs = await CondHabitacao.find({ _id: { $in: habIdList.map(id => new mongoose.Types.ObjectId(id)) } })
        .select('_id bloco_id andar_id numero tipo')
        .lean();
      (habDocs || []).forEach(h => {
        const hid = h?._id ? String(h._id) : '';
        if (!hid) return;
        habMap.set(hid, h);
        if (h?.bloco_id) blocoIds.add(String(h.bloco_id));
        if (h?.andar_id) andarIds.add(String(h.andar_id));
      });
    }

    const [blocos, andares] = await Promise.all([
      blocoIds.size
        ? CondBloco.find({ _id: { $in: Array.from(blocoIds).filter(mongoose.isValidObjectId).map(id => new mongoose.Types.ObjectId(id)) } })
          .select('_id nome codigo')
          .lean()
        : [],
      andarIds.size
        ? CondAndar.find({ _id: { $in: Array.from(andarIds).filter(mongoose.isValidObjectId).map(id => new mongoose.Types.ObjectId(id)) } })
          .select('_id nome codigo')
          .lean()
        : []
    ]);

    const blocoMap = new Map((blocos || []).map(b => [String(b._id), b]));
    const andarMap = new Map((andares || []).map(a => [String(a._id), a]));

    const out = new Map();
    for (const email of emails) {
      const mor = moradorByEmail.get(email) || null;
      const prop = propByEmail.get(email) || null;

      if (mor) {
        const nome = String(mor?.nome || '').trim();
        const hid = mor?.habitacao_id ? String(mor.habitacao_id) : '';
        const hab = hid ? (habMap.get(hid) || null) : null;
        const bloco = hab?.bloco_id ? (blocoMap.get(String(hab.bloco_id)) || null) : null;
        const andar = hab?.andar_id ? (andarMap.get(String(hab.andar_id)) || null) : null;
        const habLabel = buildSenderHabitacaoLabel(hab, bloco, andar);
        if (nome && habLabel) out.set(email, `${nome} (${habLabel})`);
        else if (nome) out.set(email, nome);
        continue;
      }

      if (prop) {
        const nome = String(prop?.nome || '').trim();
        const pid = prop?._id ? String(prop._id) : '';
        const hab0 = pid ? (habByProp.get(pid) || null) : null;
        const hid = hab0?._id ? String(hab0._id) : '';
        const hab = hid ? (habMap.get(hid) || hab0) : hab0;
        const bloco = hab?.bloco_id ? (blocoMap.get(String(hab.bloco_id)) || null) : null;
        const andar = hab?.andar_id ? (andarMap.get(String(hab.andar_id)) || null) : null;
        const habLabel = buildSenderHabitacaoLabel(hab, bloco, andar);
        if (nome && habLabel) out.set(email, `${nome} (${habLabel})`);
        else if (nome) out.set(email, nome);
        continue;
      }

      // Colaborador (somente quando existe registro no User do Gestor)
      const u = userByEmail.get(email) || null;
      if (u) {
        const nome = String(u?.nome || u?.name || u?.username || '').trim();
        if (nome) out.set(email, `${nome} (Colaborador)`);
        continue;
      }

      // CondUsuario (Portal) sem rótulo extra por segurança
      const cu = condUserByEmail.get(email) || null;
      if (cu) {
        const nome = String(cu?.nome || cu?.name || '').trim();
        if (nome) out.set(email, nome);
      }
    }

    return out;
  } catch {
    return new Map();
  }
}

async function enrichRecipientsDisplayForDocs(docs) {
  const list = Array.isArray(docs) ? docs.filter(Boolean) : [];
  if (!list.length) return;

  const byUnit = new Map();
  const getUnitId = (d) => (d?.unidade_id ? String(d.unidade_id) : '');
  const addEmail = (set, v) => {
    const em = String(v || '').trim().toLowerCase();
    if (!isEmailish(em)) return;
    set.add(em);
  };

  list.forEach(d => {
    const uid = getUnitId(d);
    if (!uid || !mongoose.isValidObjectId(uid)) return;
    let set = byUnit.get(uid);
    if (!set) { set = new Set(); byUnit.set(uid, set); }
    (Array.isArray(d?.to) ? d.to : []).forEach(m => addEmail(set, m?.email));
    (Array.isArray(d?.cc) ? d.cc : []).forEach(m => addEmail(set, m?.email));
    try {
      const fromMailboxId = String(d?.from_mailbox_id || '').trim();
      if (fromMailboxId === 'pessoal') {
        const fromOwner = String(d?.from_owner || '').trim().toLowerCase();
        const base = ownerKeyBaseEmailLower(fromOwner) || '';
        if (isEmailish(fromOwner)) addEmail(set, fromOwner);
        else if (isEmailish(base)) addEmail(set, base);
        const createdBy = String(d?.createdBy || '').trim().toLowerCase();
        if (isEmailish(createdBy)) addEmail(set, createdBy);
      }
    } catch { /* noop */ }
  });

  const displayByUnit = new Map();
  for (const [uid, emailSet] of byUnit.entries()) {
    const map = await buildRecipientDisplayMapForUnit(uid, Array.from(emailSet));
    displayByUnit.set(uid, map);
  }

  list.forEach(d => {
    const uid = getUnitId(d);
    const map = uid ? (displayByUnit.get(uid) || null) : null;
    if (!map || !map.size) return;

    const apply = (m) => {
      if (!m || typeof m !== 'object') return;
      const t = String(m?.type || '').trim().toLowerCase();
      if (t === 'mailbox') return;
      const em = String(m?.email || '').trim().toLowerCase();
      if (!isEmailish(em)) return;
      const disp = map.get(em);
      if (disp) m.display = disp;
    };

    (Array.isArray(d?.to) ? d.to : []).forEach(apply);
    (Array.isArray(d?.cc) ? d.cc : []).forEach(apply);

    try {
      const fromMailboxId = String(d?.from_mailbox_id || '').trim();
      if (fromMailboxId === 'pessoal') {
        const fromOwner = String(d?.from_owner || '').trim().toLowerCase();
        const base = ownerKeyBaseEmailLower(fromOwner) || '';
        let senderEmail = '';
        if (isEmailish(fromOwner)) senderEmail = fromOwner;
        else if (isEmailish(base)) senderEmail = base;
        if (!senderEmail) {
          const createdBy = String(d?.createdBy || '').trim().toLowerCase();
          if (isEmailish(createdBy)) senderEmail = createdBy;
        }
        if (senderEmail) {
          const disp = map.get(senderEmail);
          if (disp) d.__remetente_display = disp;
        }
      }
    } catch { /* noop */ }
  });
}

async function resolveUserDisplayNameByEmail(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return '';
  try {
    const userDoc = await User.findOne({ email }).select('nome name username').lean();
    const name = String(userDoc?.nome || userDoc?.name || userDoc?.username || '').trim();
    if (name) return name;
  } catch {}
  try {
    const condDoc = await CondUsuario.findOne({ email }).select('nome name').lean();
    const name = String(condDoc?.nome || condDoc?.name || '').trim();
    if (name) return name;
  } catch {}
  // Busca em moradores do portal
  try {
    const moradorDoc = await CondMorador.findOne({
      $or: [{ email }, { responsavel_email: email }],
      ativo: { $ne: false }
    }).select('nome responsavel_nome').lean();
    const name = String(moradorDoc?.nome || moradorDoc?.responsavel_nome || '').trim();
    if (name) return name;
  } catch {}
  // Busca em proprietários do portal
  try {
    const propDoc = await CondProprietario.findOne({
      contato_email: email,
      ativo: { $ne: false }
    }).select('nome').lean();
    const name = String(propDoc?.nome || '').trim();
    if (name) return name;
  } catch {}
  return '';
}

async function resolveUserEmailByDisplayName(nameRaw, cache) {
  const cacheMap = (cache && typeof cache.get === 'function') ? cache : null;
  const name = String(nameRaw || '').trim();
  if (!name) return '';
  if (name.includes('@')) return '';
  if (name.length < 3) return '';
  const key = `name:${name.toLowerCase()}`;
  if (cacheMap && cacheMap.has(key)) return String(cacheMap.get(key) || '');

  let email = '';
  // Busca exata (case-insensitive) para evitar matches frouxos
  const re = new RegExp(`^${escapeRegex(name)}$`, 'i');
  try {
    const userDoc = await User.findOne({ $or: [{ nome: re }, { name: re }, { username: re }] }).select('email').lean();
    const e = String(userDoc?.email || '').trim().toLowerCase();
    if (e && e.includes('@')) email = e;
  } catch { /* noop */ }
  if (!email) {
    try {
      const condDoc = await CondUsuario.findOne({ $or: [{ nome: re }, { name: re }] }).select('email').lean();
      const e = String(condDoc?.email || '').trim().toLowerCase();
      if (e && e.includes('@')) email = e;
    } catch { /* noop */ }
  }

  if (cacheMap) cacheMap.set(key, email);
  return email;
}

async function resolveMailboxCreatedByEmail(mailboxIdRaw, cache) {
  const cacheMap = (cache && typeof cache.get === 'function') ? cache : null;
  const mailboxId = String(mailboxIdRaw || '').trim();
  if (!mailboxId || mailboxId === 'pessoal') return '';
  if (!mongoose.isValidObjectId(mailboxId)) return '';
  if (cacheMap && cacheMap.has(mailboxId)) return String(cacheMap.get(mailboxId) || '');

  let email = '';
  try {
    const mb = await CondMsgMailbox.findById(mailboxId).select('createdBy').lean();
    const createdBy = String(mb?.createdBy || '').trim().toLowerCase();
    if (createdBy && createdBy.includes('@')) email = createdBy;
  } catch {
    /* noop */
  }

  if (cacheMap) cacheMap.set(mailboxId, email);
  return email;
}

async function resolveMasterEmailForMessageDoc(doc, cache) {
  const cacheMap = (cache && typeof cache.get === 'function') ? cache : null;
  try {
    const unidadeIdRaw = doc?.unidade_id ? String(doc.unidade_id) : '';
    const unidadeId = (unidadeIdRaw && mongoose.isValidObjectId(unidadeIdRaw)) ? unidadeIdRaw : '';
    const key = `master:${unidadeId || 'any'}`;
    if (cacheMap && cacheMap.has(key)) return String(cacheMap.get(key) || '');

    let email = '';

    // Preferir master vinculado à unidade (mais determinístico)
    if (unidadeId) {
      try {
        const u = await User.findOne({ unidade_id: unidadeId, role: 'master', ativo: { $ne: false } }).select('email').lean();
        const cand = String(u?.email || '').trim().toLowerCase();
        if (isEmailish(cand)) email = cand;
      } catch { /* noop */ }
    }

    // Fallback: qualquer master (ambientes antigos podem não ter unidade_id no user)
    if (!email) {
      try {
        const u = await User.findOne({ role: 'master', ativo: { $ne: false } }).select('email').lean();
        const cand = String(u?.email || '').trim().toLowerCase();
        if (isEmailish(cand)) email = cand;
      } catch { /* noop */ }
    }

    if (cacheMap) cacheMap.set(key, email);
    return email;
  } catch {
    return '';
  }
}

async function resolveSenderEmailFromMessageDoc(doc, cache, ctxUser) {
  try {
    const fromOwner = String(doc?.from_owner || '').trim().toLowerCase();
    if (fromOwner && fromOwner.includes('@')) return fromOwner;

    const createdBy = String(doc?.createdBy || '').trim().toLowerCase();
    if (createdBy && createdBy.includes('@')) return createdBy;

    const fromMailboxId = String(doc?.from_mailbox_id || '').trim();
    if (fromMailboxId && fromMailboxId !== 'pessoal') {
      const mbEmail = await resolveMailboxCreatedByEmail(fromMailboxId, cache);
      if (mbEmail) return mbEmail;
    }

    // Último fallback: alguns legados salvam apenas o nome (ex.: "Master User") em createdBy/from_owner.
    // Tenta mapear nome -> e-mail via User/CondUsuario (match exato).
    const createdByRaw = String(doc?.createdBy || '').trim();
    if (createdByRaw && !createdByRaw.includes('@')) {
      const byName = await resolveUserEmailByDisplayName(createdByRaw, cache);
      if (byName) return byName;
    }
    const fromOwnerRaw = String(doc?.from_owner || '').trim();
    if (fromOwnerRaw && !fromOwnerRaw.includes('@')) {
      const byName = await resolveUserEmailByDisplayName(fromOwnerRaw, cache);
      if (byName) return byName;
    }

    // Fallback específico: alguns legados registram apenas "Master User".
    // Resolver para o e-mail real do master da unidade via coleção User (role=master).
    // Isso funciona tanto no Gestão quanto no Portal (independe de ctxUser.role/isMaster).
    try {
      const label1 = String(doc?.createdBy || '').trim();
      const label2 = String(doc?.from_owner || '').trim();
      const isMasterLabel = (v) => /^\s*master(\s+user)?\s*$/i.test(String(v || '').trim());
      if (isMasterLabel(label1) || isMasterLabel(label2)) {
        const byUnitMaster = await resolveMasterEmailForMessageDoc(doc, cache);
        if (byUnitMaster) return byUnitMaster;
      }
    } catch { /* noop */ }

    // Último fallback (menos confiável): se quem está autenticado tem e-mail, use como quebra-galho
    // APENAS quando a mensagem estiver marcada como "Master User".
    try {
      const ctxEmail = String(ctxUser?.email || ctxUser?.userEmail || '').trim().toLowerCase();
      if (isEmailish(ctxEmail)) {
        const label1 = String(doc?.createdBy || '').trim();
        const label2 = String(doc?.from_owner || '').trim();
        const isMasterLabel = (v) => /^\s*master(\s+user)?\s*$/i.test(String(v || '').trim());
        if (isMasterLabel(label1) || isMasterLabel(label2)) return ctxEmail;
      }
    } catch { /* noop */ }
  } catch {
    /* noop */
  }
  return '';
}

function toMessageDetailItem(doc, scope, extra) {
  if (!doc) return null;
  const mb = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();
  const st = (Array.isArray(doc.states) ? doc.states : []).find(s => String(s?.mailbox_id || '').trim() === mb && String(s?.owner || '').trim().toLowerCase() === owner) || null;

  const createdAt = inferDocCreatedAt(doc);

  const listTo = Array.isArray(doc.to) ? doc.to : [];
  const listCc = Array.isArray(doc.cc) ? doc.cc : [];
  const isTo = (mb === 'pessoal')
    ? listTo.some(m => String(m?.email || '').trim().toLowerCase() === owner)
    : listTo.some(m => String(m?.mailboxId || '').trim() === mb);
  const isCc = (mb === 'pessoal')
    ? listCc.some(m => String(m?.email || '').trim().toLowerCase() === owner)
    : listCc.some(m => String(m?.mailboxId || '').trim() === mb);
  const copia = !!(isCc && !isTo);

  const fromMailboxId = String(doc.from_mailbox_id || '').trim();
  const fromMailboxName = String(doc.from_mailbox_name || '').trim() || fromMailboxId;
  const fromOwnerRaw = String(doc.from_owner || '').trim();
  const fromOwner = fromOwnerRaw ? fromOwnerRaw.trim().toLowerCase() : '';
  const baseFromOwnerEmail = ownerKeyBaseEmailLower(fromOwner) || '';
  const fromOwnerEmail = baseFromOwnerEmail || (isEmailish(fromOwnerRaw) ? fromOwnerRaw.trim().toLowerCase() : '');
  const createdByRaw = String(doc.createdBy || '').trim();
  const createdByEmail = isEmailish(createdByRaw) ? createdByRaw.trim().toLowerCase() : '';
  const senderDisplayOverride = String(doc?.__remetente_display || '').trim();
  const fromCreatedBy = senderDisplayOverride || String(extra?.senderName || '').trim() || createdByRaw;
  const extraEmail = isEmailish(extra?.senderEmail) ? String(extra?.senderEmail || '').trim().toLowerCase() : '';
  const fromEmail = fromOwnerEmail || createdByEmail || extraEmail;
  const fromDisplay = (fromMailboxId === 'pessoal')
    ? (fromCreatedBy || fromOwnerRaw || 'Pessoal')
    : fromMailboxName;

  return {
    id: String(doc._id || ''),
    protocolo: String(doc.protocolo || '').trim(),
    assunto: String(doc.assunto || '').trim(),
    bodyHtml: String(doc.body_html || ''),
    bodyText: String(doc.body_text || ''),
    createdAt: createdAt || null,
    copia,
    from: {
      mailboxId: fromMailboxId,
      mailboxName: fromMailboxName,
      owner: fromOwner,
      email: fromEmail,
      createdBy: fromCreatedBy,
      display: fromDisplay
    },
    to: listTo.map(m => ({
      type: String(m?.type || '').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || '').trim(),
      fotoUrl: String(m?.fotoUrl || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      name: String(m?.name || '').trim(),
      display: memberDisplayName(m)
    })),
    cc: listCc.map(m => ({
      type: String(m?.type || '').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || '').trim(),
      fotoUrl: String(m?.fotoUrl || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      name: String(m?.name || '').trim(),
      display: memberDisplayName(m)
    })),
    anexos: Array.isArray(doc.anexos) ? doc.anexos.map(a => ({
      nome: String(a?.nome || '').trim(),
      mime: String(a?.mime || '').trim(),
      tamanho: Number(a?.tamanho) || 0,
      url: String(a?.url || '').trim(),
      caminho: String(a?.caminho || '').trim()
    })) : [],
    thread: {
      rootId: doc.thread_root_id ? String(doc.thread_root_id) : '',
      inReplyToId: doc.in_reply_to ? String(doc.in_reply_to) : '',
      forwardedFromId: doc.forwarded_from_id ? String(doc.forwarded_from_id) : ''
    },
    acessos: Array.isArray(doc.acessos)
      ? doc.acessos
        .slice(-200)
        .map(a => ({
          mailboxId: String(a?.mailbox_id || a?.mailboxId || '').trim(),
          owner: String(a?.owner || '').trim().toLowerCase(),
          user: String(a?.user || '').trim(),
          at: a?.at || null
        }))
      : [],
    state: {
      lida: !!st?.lida_em,
      lidaEm: st?.lida_em || null,
      arquivadaEm: st?.arquivada_em || null,
      lixeiraEm: st?.lixeira_em || null,
      fixadaEm: st?.fixada_em || null,
      marcadores: Array.isArray(st?.marcadores) ? st.marcadores : []
    }
  };
}

function hasScopeAsRecipient(doc, scope) {
  const mb = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();
  const list = [...(doc?.to || []), ...(doc?.cc || [])];
  if (mb === 'pessoal') {
    if (!owner) return false;
    // Compat: no Portal, o owner pode ser `email::portal::hab:<id>`; destinatários normalmente têm só o e-mail.
    const baseEmail = ownerKeyBaseEmailLower(owner) || '';
    return list.some(m => {
      const em = String(m?.email || '').trim().toLowerCase();
      if (!em) return false;
      if (em === owner) return true;
      if (baseEmail && em === baseEmail) return true;
      return false;
    });
  }
  return list.some(m => String(m?.mailboxId || '').trim() === mb);
}

function isScopeSender(doc, scope) {
  const mb = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();
  if (String(doc?.from_mailbox_id || '').trim() !== mb) return false;
  if (mb !== 'pessoal') return true;
  const fromOwner = String(doc?.from_owner || '').trim().toLowerCase();
  if (!fromOwner || !owner) return false;
  if (fromOwner === owner) return true;
  const baseEmail = ownerKeyBaseEmailLower(owner);
  if (baseEmail && fromOwner === baseEmail) return true;
  // Caso inverso: mensagem legada pode ter from_owner com sufixo, e owner atual ser e-mail puro.
  const fromBase = ownerKeyBaseEmailLower(fromOwner);
  if (fromBase && fromBase === owner) return true;
  return false;
}

// Caixa de Mensagens foi migrada para o módulo standalone /mensagens.
// As rotas antigas em /condominios/api/msg/* ficam bloqueadas para evitar
// uso acidental do backend legado dentro de Condomínios.
app.use('/api/msg', (req, res) => {
  return res.status(410).json({
    error: 'Caixa de Mensagens migrada para /mensagens/api/msg'
  });
});

// Rotas HTTP legadas de Caixa de Mensagens removidas.
// O bloqueio acima em /api/msg preserva resposta 410 para chamadas antigas.

// API: blocos por unidade (stub seguro; tenta usar model se existir)
async function handleGetBlocosV1(req, res, _next) {
  try {
    const payload = await listarBlocosService({
      req,
      mongoose,
      listarUnidadesParaUsuario,
      CondBloco
    });
    return res.json(payload);
  } catch(e){
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    console.error('[api/blocos] erro GET', e);
    return res.status(500).json({ error: 'Falha ao listar blocos' });
  }
}

setHandleGetBlocosV2Context({
  mongoose,
  listarUnidadesParaUsuario,
  CondBloco,
  CondAndar
});

app.get('/api/blocos', (req, res, next) => {
  if (getEffectiveSkipDb(req)) {
    return respondDbOffline(res, req);
  }
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetBlocosV2(req, res, next);
  return handleGetBlocosV1(req, res, next);
});

async function handleGetBlocoByIdV1(req, res, _next) {
  try {
    const payload = await obterBlocoPorIdService({
      req,
      mongoose,
      CondBloco
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Bloco não encontrado' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter bloco' });
  }
}

app.get('/api/blocos/:id([0-9a-fA-F]{24})', (req, res, next) => {
  if (getEffectiveSkipDb(req)) {
    return respondDbOffline(res, req);
  }
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetBlocoByIdV2Scoped(req, res, next);
  return handleGetBlocoByIdV1(req, res, next);
});

async function handleGetBlocosRelacionadosV1(req, res, _next) {
  try {
    const payload = await listarBlocosRelacionadosService({
      req,
      mongoose,
      CondBloco,
      CondAndar
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar blocos relacionados' });
  }
}

app.get('/api/blocos/relacionados', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetBlocosRelacionadosV2Scoped(req, res, next);
  return handleGetBlocosRelacionadosV1(req, res, next);
});

async function handlePostBlocosV1(req, res, _next) {
  try {
    const result = await criarBlocoService({
      unitScope: req?.unitScope,
      body: req.body,
      mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco
    });
    if (result.created) {
      try {
        console.info('[api/blocos] criado', {
          id: String(result.payload?._id),
          unidade_id: String(result.payload?.unidade_id),
          nome: result.payload?.nome
        });
      } catch {}
    }
    return res.status(result.status).json(result.payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'unidade_id e nome são obrigatórios' });
    if (e && e.__httpStatus === 409) return res.status(409).json(e.__httpPayload || { error: 'Bloco já existe para este condomínio' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    try { console.error('[api/blocos] erro POST', e && (e.__cause || e)); } catch {}
    return res.status(500).json({ error: 'Falha ao criar bloco' });
  }
}

app.post('/api/blocos', express.json(), (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handlePostBlocosV2(req, res, next);
  return handlePostBlocosV1Scoped(req, res, next);
});

async function handlePutBlocosV1(req, res, _next) {
  try {
    const result = await atualizarBlocoService({
      id: req.params?.id,
      body: req.body,
      mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco
    });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json((e && e.__httpPayload) || { error: 'Falha ao atualizar bloco' });
  }
}

app.put('/api/blocos/:id', express.json(), (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handlePutBlocosV2(req, res, next);
  return handlePutBlocosV1(req, res, next);
});

async function handleDeleteBlocosV1(req, res, _next) {
  try {
    const result = await excluirBlocoService({
      id: req.params?.id,
      mongoose,
      skipDb: req?.app?.locals?.skipDb,
      CondBloco
    });
    return res.status(result.status).json(result.payload);
  } catch (e) {
    return res.status(500).json((e && e.__httpPayload) || { error: 'Falha ao excluir bloco' });
  }
}

app.delete('/api/blocos/:id', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleDeleteBlocosV2(req, res, next);
  return handleDeleteBlocosV1(req, res, next);
});

// API: andares por unidade (stub seguro; tenta usar model se existir)
async function handleGetAndaresV1(req, res, _next) {
  try {
    const payload = await listarAndaresService({
      req,
      mongoose,
      listarUnidadesParaUsuario
    });
    return res.json(payload);
  } catch(e){
    if (e && e.__httpStatus === 400) {
      return res.status(400).json(e.__httpPayload || { error: 'unidade_id inválido' });
    }
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    console.error('[api/andares] erro GET', e);
    return res.status(500).json({ error: 'Falha ao listar andares' });
  }
}

setHandleGetAndaresV2Context({
  mongoose,
  listarUnidadesParaUsuario,
  CondAndar,
  CondBloco
});

app.get('/api/andares', (req, res, next) => {
  if (getEffectiveSkipDb(req)) {
    return respondDbOffline(res, req);
  }
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetAndaresV2(req, res, next);
  return handleGetAndaresV1(req, res, next);
});

async function handleGetAndarByIdV1(req, res, _next) {
  try {
    const payload = await obterAndarPorIdService({
      req,
      mongoose,
      CondAndar
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 400) return res.status(400).json(e.__httpPayload || { error: 'Identificador inválido' });
    if (e && e.__httpStatus === 404) return res.status(404).json(e.__httpPayload || { error: 'Andar não encontrado' });
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao obter andar' });
  }
}

app.get('/api/andares/:id([0-9a-fA-F]{24})', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetAndarByIdV2Scoped(req, res, next);
  return handleGetAndarByIdV1(req, res, next);
});

async function handleGetAndaresRelacionadosV1(req, res, _next) {
  try {
    const payload = await listarAndaresRelacionadosService({
      req,
      mongoose,
      CondAndar,
      CondBloco
    });
    return res.json(payload);
  } catch (e) {
    if (e && e.__httpStatus === 503) {
      try { res.set('Retry-After', e.__retryAfter || '5'); } catch {}
      return res.status(503).json(e.__httpPayload || { error: 'DB indisponível' });
    }
    return res.status(500).json({ error: 'Falha ao listar andares relacionados' });
  }
}

app.get('/api/andares/relacionados', (req, res, next) => {
  const isV2On = String(process.env.WDG_FLAG_CONDOMINIOS_APP_V2 ?? '').trim() === '1';
  if (isV2On) return handleGetAndaresRelacionadosV2Scoped(req, res, next);
  return handleGetAndaresRelacionadosV1(req, res, next);
});

app.post('/api/andares', express.json(), async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }
    const { unidade_id, nome, numero, ordem } = req.body || {};
    if(!unidade_id || !nome) return res.status(400).json({ error: 'unidade_id e nome são obrigatórios' });
    const nomeNorm = String(nome).trim();
    const existente = await CondAndar.findOne({ unidade_id, nome: nomeNorm }).lean();
    if(existente) return res.json(existente);
    const novo = await CondAndar.create({ unidade_id, nome: nomeNorm, numero: (numero!=null? Number(numero):null), ordem: Number(ordem)||0 });
    try { console.info('[api/andares] criado', { id: String(novo._id), unidade_id: String(novo.unidade_id), nome: novo.nome }); } catch {}
    res.status(201).json(novo);
  }catch(e){
    const isDup = e && (e.code === 11000 || (e.message||'').includes('duplicate key'));
    if(isDup) return res.status(409).json({ error: 'Andar já existe para este condomínio' });
    console.error('[api/andares] erro POST', e);
    res.status(500).json({ error: 'Falha ao criar andar' });
  }
});

// Diagnóstico rápido do módulo: status de DB e contagens
app.get('/metrics', async (req, res) => {
  try {
    const stateMap = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' };
    const st = stateMap[mongoose.connection.readyState] || String(mongoose.connection.readyState);
    const unidade = req.query.unidade || req.query.unidade_id || null;
    const filtro = unidade ? { unidade_id: unidade } : {};
    let counts = { blocos:null, andares:null, habitacoes:null, garagens:null };
    try { counts.blocos = await CondBloco.countDocuments(filtro); } catch {}
    try { counts.andares = await CondAndar.countDocuments(filtro); } catch {}
    try { counts.habitacoes = await CondHabitacao.countDocuments(filtro); } catch {}
    try { counts.garagens = await CondVagaGaragem.countDocuments(filtro); } catch {}
    res.json({ ok: st==='connected', db:{ status: st }, counts });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.put('/api/andares/:id', express.json(), async (req, res) => {
  try{
    const id = req.params.id; const { nome, numero, ordem, ativo } = req.body || {};
    const upd = {};
    if(nome!=null) upd.nome = String(nome).trim();
    if(numero!=null) upd.numero = Number(numero);
    if(ordem!=null) upd.ordem = Number(ordem)||0;
    if(ativo!=null) upd.ativo = !!ativo;
    const doc = await CondAndar.findByIdAndUpdate(id, { $set: upd }, { new: true }).lean();
    res.json(doc);
  }catch(e){ res.status(500).json({ error: 'Falha ao atualizar andar' }); }
});

app.delete('/api/andares/:id', async (req, res) => {
  try{ await CondAndar.findByIdAndDelete(req.params.id); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ error: 'Falha ao excluir andar' }); }
});

// API: sugestões de habitações (autocomplete de número/identificação)
app.get('/api/habitacoes/sugestoes', async (req, res) => {
  const unidade = req.query.unidade || '';
  const termo = (req.query.termo || '').toString().trim();
  try {
    if(!unidade){ return res.json([]); }
    const filtro = { unidade_id: unidade };
    if(termo){ filtro.numero = { $regex: termo, $options: 'i' }; }
    const numeros = await CondHabitacao.find(filtro).select('numero').limit(20).lean();
    const arr = [...new Set(numeros.map(n => n.numero).filter(Boolean))];
    res.json(arr);
  } catch(e){
    console.error('[api/habitacoes/sugestoes] erro GET', e);
    res.status(500).json({ error: 'Falha ao listar sugestões' });
  }
});

// API: busca de habitações
app.get('/api/habitacoes/busca', async (req, res) => {
  const { unidade, bloco, andar, numero } = req.query || {};
  try{
    const filtro = {};
    // Escopo por usuário quando nenhuma unidade é informada
    if(unidade) {
      const ctxUser = req.user || (req.session && req.session.user) || null;
      const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
      if (!isAdmin) {
        try {
          const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
          const unitIds = (unidadesOptions || []).map(u => String(u._id));
          if (!unitIds.includes(String(unidade))) {
            return res.json([]);
          }
        } catch(_e) {
          return res.json([]);
        }
      }
      filtro.unidade_id = unidade;
    } else {
      try {
        const ctxUser = req.user || (req.session && req.session.user) || null;
        const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
        const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
        if (!isAdmin) {
          const unitIds = (unidadesOptions||[]).map(u => u._id);
          if (!unitIds.length) {
            filtro._id = { $exists: false };
          } else {
            filtro.unidade_id = { $in: unitIds };
          }
        }
      } catch(_e){ }
    }
    if(bloco) filtro.bloco_id = bloco;
    if(andar) filtro.andar_id = andar;
    if(numero) filtro.numero = { $regex: numero, $options: 'i' };

    const light = String(req.query.light || '').trim() === '1';

    const habQuery = CondHabitacao.find(filtro);
    if(light){
      habQuery.select('_id unidade_id bloco_id andar_id numero tipo');
    }

    const habs = await habQuery.lean();
    // Pré-carregar maps para reduzir queries repetidas
    const blocoIds = [...new Set(habs.map(h => h.bloco_id).filter(Boolean))];
    const andarIds = [...new Set(habs.map(h => h.andar_id).filter(Boolean))];
    const propIds = [...new Set(habs.map(h => h.proprietario_id).filter(Boolean))];
    const habIds = habs.map(h => h._id).filter(Boolean);
    const unitIds = [...new Set(habs.map(h => h.unidade_id).filter(Boolean))];
    if(light){
      const [blocosLight, andaresLight] = await Promise.all([
        blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome codigo').lean() : [],
        andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome codigo').lean() : []
      ]);

      const blocoLightMap = new Map(blocosLight.map(b => [String(b._id), b]));
      const andarLightMap = new Map(andaresLight.map(a => [String(a._id), a]));

      return res.json(habs.map(h => ({
        _id: h._id,
        id: h._id ? String(h._id) : '',
        unidade_id: h.unidade_id || null,
        unidadeId: h.unidade_id || null,
        unidade: { _id: h.unidade_id || null },
        bloco: h.bloco_id ? (blocoLightMap.get(String(h.bloco_id)) || null) : null,
        andar: h.andar_id ? (andarLightMap.get(String(h.andar_id)) || null) : null,
        bloco_id: h.bloco_id || null,
        andar_id: h.andar_id || null,
        tipo: h.tipo || '',
        numero: h.numero || ''
      })));
    }
    const unidadeSelectFields = '_id codigo nome razaoSocial cnpj cpf pessoaTipo inscricaoEstadual inscricaoMunicipal cnaePrincipal cnaeSecundarios regimeTributario naturezaJuridica tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal diretor_usuario_id pixChave tipoPix banco agencia contaCorrente is_principal subunidade unidade_principal_id dataAbertura';

    const habIdStrings = habIds.map(h => String(h));
    const habIdObjectIds = habIdStrings
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const unitIdStrings = unitIds.map((id) => String(id));

    const [blocos, andares, proprietarios, moradores, unidades, vagas, servicosAgg, visitasAgg] = await Promise.all([
      blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
      andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : [],
      propIds.length ? CondProprietario.find({ _id: { $in: propIds } }).select('_id nome tipo cpf cnpj').lean() : [],
      habIds.length ? CondMorador.find({ habitacao_id: { $in: habIds }, ativo: { $ne: false } })
        .select('_id nome data_nascimento inquilino habitacao_id cpf rg email telefone cond_usuario_id pai mae sexo whatsapp responsavel_email responsavel_nome')
        .lean() : [],
      unitIds.length ? unidadesReadRepoFromReq(req).find({ _id: { $in: unitIds } }, { select: unidadeSelectFields }) : [],
      habIds.length ? CondVagaGaragem.find({ link_type: 'hab', link_id: { $in: habIds } })
        .select('_id nome obs foto link_id ativa')
        .lean() : [],
      habIds.length ? CondSolicitacaoServico.aggregate([
        { $match: {
          $or: [
            { habitacao_id: { $in: habIdStrings } },
            ...(habIdObjectIds.length ? [{ habitacao_id: { $in: habIdObjectIds } }] : [])
          ]
        } },
        { $sort: { createdAt: -1 } },
        { $addFields: { _status_norm: { $toLower: { $ifNull: ['$status', ''] } } } },
        { $match: { _status_norm: { $not: /aceit|rejeit|recus/ } } },
        { $group: {
          _id: '$habitacao_id',
          items: { $push: {
            _id: '$_id',
            protocolo: '$protocolo',
            nova: '$nova',
            titulo: '$titulo',
            createdAt: '$createdAt'
          } }
        } },
        { $project: { items: { $slice: ['$items', 5] } } }
      ]).exec() : [],
      habIds.length ? CondVisitante.aggregate([
        {
          $match: {
            unidade_id: { $in: unitIdStrings },
            habitacaoId: { $in: habIdStrings }
          }
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$habitacaoId',
            items: {
              $push: {
                _id: '$_id',
                unidade_id: '$unidade_id',
                morador_email: '$morador_email',
                habitacaoId: '$habitacaoId',
                habitacaoNome: '$habitacaoNome',
                visitanteNome: '$visitanteNome',
                visitanteRg: '$visitanteRg',
                visitanteCpf: '$visitanteCpf',
                visitanteTel: '$visitanteTel',
                finalidade: '$finalidade',
                finalidadeLabel: '$finalidadeLabel',
                periodoInicio: '$periodoInicio',
                periodoFim: '$periodoFim',
                observacoes: '$observacoes',
                veiculo: '$veiculo',
                createdAt: '$createdAt'
              }
            }
          }
        },
        { $project: { items: { $slice: ['$items', 5] } } }
      ]).exec() : []
    ]);

    // Status de presença do morador (derivado do último acesso registrado)
    const moradorIdStrings = (Array.isArray(moradores) ? moradores : [])
      .map(m => (m && m._id ? String(m._id) : ''))
      .filter(Boolean);
    const presencaPorMorador = new Map();
    try {
      if (habIdStrings.length && moradorIdStrings.length) {
        const lastAcessos = await CondAcessoMorador.aggregate([
          {
            $match: {
              habitacaoId: { $in: habIdStrings },
              moradorId: { $in: moradorIdStrings },
              tipo: { $in: ['MORADOR_ENTRADA', 'MORADOR_SAIDA'] }
            }
          },
          { $sort: { ocorridoEm: -1, registradoEm: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$moradorId',
              tipo: { $first: '$tipo' },
              ocorridoEm: { $first: '$ocorridoEm' },
              registradoEm: { $first: '$registradoEm' }
            }
          }
        ]).exec();
        (Array.isArray(lastAcessos) ? lastAcessos : []).forEach((row) => {
          const mid = row && row._id ? String(row._id) : '';
          if (!mid) return;
          const tipo = String(row?.tipo || '').trim();
          presencaPorMorador.set(mid, {
            presente: tipo === 'MORADOR_ENTRADA',
            tipo,
            ocorridoEm: row?.ocorridoEm || null,
            registradoEm: row?.registradoEm || null
          });
        });
      }
    } catch (_e) {
      // Best-effort: se falhar, segue sem status
    }
        const vagasPorHab = new Map();
        vagas.forEach(v => {
          if(!v || !v.link_id) return;
          const hid = String(v.link_id);
          if(!hid) return;
          if(!vagasPorHab.has(hid)) vagasPorHab.set(hid, []);
          vagasPorHab.get(hid).push({
            _id: v._id,
            nome: v.nome || '',
            obs: v.obs || '',
            foto: v.foto || '',
            ativa: v.ativa !== false
          });
        });
    const condUsuarioIds = [...new Set(moradores.map(m => m.cond_usuario_id ? String(m.cond_usuario_id) : null).filter(Boolean))];
    const condUsuarios = condUsuarioIds.length
      ? await CondUsuario.find({ _id: { $in: condUsuarioIds } })
          .select('_id nome email telefone whatsapp data_nascimento cpf rg sexo pai mae')
          .lean()
      : [];
    const condUsuarioMap = new Map();
    const condUsuarioByEmail = new Map();
    const condUsuarioByCpf = new Map();
    const registerCondUsuario = user => {
      if(!user) return;
      const id = user._id ? String(user._id) : null;
      if(id) condUsuarioMap.set(id, user);
      const email = user.email ? String(user.email).trim().toLowerCase() : '';
      if(email) condUsuarioByEmail.set(email, user);
      const cpf = user.cpf ? String(user.cpf).replace(/\D/g,'') : '';
      if(cpf) condUsuarioByCpf.set(cpf, user);
    };
    condUsuarios.forEach(registerCondUsuario);

    const moradorEmails = new Set();
    const moradorCpfs = new Set();
    moradores.forEach(m => {
      const email = m.email ? String(m.email).trim().toLowerCase() : '';
      if(email && !condUsuarioByEmail.has(email)) moradorEmails.add(email);
      const cpf = m.cpf ? String(m.cpf).replace(/\D/g,'') : '';
      if(cpf && !condUsuarioByCpf.has(cpf)) moradorCpfs.add(cpf);
    });

    if(moradorEmails.size){
      const extraByEmail = await CondUsuario.find({ email: { $in: Array.from(moradorEmails) } })
        .select('_id nome email telefone whatsapp data_nascimento cpf rg sexo pai mae')
        .lean();
      extraByEmail.forEach(registerCondUsuario);
    }
    if(moradorCpfs.size){
      const extraByCpf = await CondUsuario.find({ cpf: { $in: Array.from(moradorCpfs) } })
        .select('_id nome email telefone whatsapp data_nascimento cpf rg sexo pai mae')
        .lean();
      extraByCpf.forEach(registerCondUsuario);
    }
    const blocoMap = new Map(blocos.map(b => [String(b._id), b]));
    const andarMap = new Map(andares.map(a => [String(a._id), a]));
    const propMap = new Map(proprietarios.map(p => [String(p._id), p]));
    const unidadePayloadMap = new Map();
    unidades.forEach(u => {
      const payload = buildUnidadePayload(u);
      if(payload) unidadePayloadMap.set(String(u._id), payload);
    });
    const moradoresPorHab = new Map();
    for(const m of moradores){
        const hid = String(m.habitacao_id);
      if(!moradoresPorHab.has(hid)) moradoresPorHab.set(hid, []);
      let condUser = m.cond_usuario_id ? condUsuarioMap.get(String(m.cond_usuario_id)) || null : null;
      if(!condUser && m.email){
        const lookupEmail = String(m.email).trim().toLowerCase();
        condUser = condUsuarioByEmail.get(lookupEmail) || condUser;
      }
      if(!condUser && m.cpf){
        const lookupCpf = String(m.cpf).replace(/\D/g,'');
        condUser = condUsuarioByCpf.get(lookupCpf) || condUser;
      }
      const mergedSexo = normalizeSexoCode((condUser && condUser.sexo) || m.sexo || 'N');
      const mergedSexoLabel = resolveSexoLabelFromCode(mergedSexo, '');
      const presenca = presencaPorMorador.get(String(m._id)) || null;
      moradoresPorHab.get(hid).push({
        _id: m._id,
        nome: m.nome || (condUser && condUser.nome) || '',
        data_nascimento: m.data_nascimento || (condUser && condUser.data_nascimento) || null,
        inquilino: !!m.inquilino,
        cpf: m.cpf || (condUser && condUser.cpf) || '',
        rg: m.rg || (condUser && condUser.rg) || '',
        email: m.email || (condUser && condUser.email) || '',
        telefone: m.telefone || (condUser && condUser.telefone) || '',
        telefone_whatsapp: typeof m.whatsapp === 'boolean' ? m.whatsapp : (condUser ? condUser.whatsapp : undefined),
        cond_usuario_id: m.cond_usuario_id ? String(m.cond_usuario_id) : null,
        pai: m.pai || (condUser && condUser.pai) || '',
        mae: m.mae || (condUser && condUser.mae) || '',
        sexo: mergedSexo,
        sexo_label: mergedSexoLabel,
        acesso_presente: presenca ? !!presenca.presente : false,
        acesso_ultimo_em: presenca ? (presenca.ocorridoEm || presenca.registradoEm || null) : null,
        responsavel_email: m.responsavel_email || '',
        responsavel_nome: m.responsavel_nome || ''
      });
    }

    const servicosPorHab = new Map();
    (Array.isArray(servicosAgg) ? servicosAgg : []).forEach(g => {
      if(!g || g._id == null) return;
      servicosPorHab.set(String(g._id), Array.isArray(g.items) ? g.items : []);
    });

    const visitasPorHab = new Map();
    (Array.isArray(visitasAgg) ? visitasAgg : []).forEach(g => {
      if(!g || g._id == null) return;
      visitasPorHab.set(String(g._id), Array.isArray(g.items) ? g.items : []);
    });

    // Best-effort: algumas solicitações antigas podem ter sido gravadas sem `habitacao_id`
    // (ou com valores inválidos, como "[object Object]").
    // Para não sumirem do "slot da moradia", tenta mapear pelo e-mail do morador.
    try {
      const unidadeIdStr = unidade ? String(unidade).trim() : '';
      if (unidadeIdStr && Array.isArray(moradores) && moradores.length) {
        const emailToHab = new Map();
        moradores.forEach(m => {
          const email = m && m.email ? String(m.email).trim().toLowerCase() : '';
          const hid = m && m.habitacao_id ? String(m.habitacao_id) : '';
          if (!email || !hid) return;
          if (!emailToHab.has(email)) emailToHab.set(email, hid);
        });

        const allowedHabIds = new Set(habIdStrings);
        const hasAnyEmail = emailToHab.size > 0;

        if (hasAnyEmail) {
          const emails = Array.from(emailToHab.keys());
          const since = new Date(Date.now() - (120 * 24 * 60 * 60 * 1000));
          const orphanDocs = await CondSolicitacaoServico.find({
            unidade_id: unidadeIdStr,
            createdAt: { $gte: since },
            morador_email: { $in: emails },
            status: { $not: /aceit|rejeit|recus/i },
            $or: [
              { habitacao_id: { $exists: false } },
              { habitacao_id: null },
              { habitacao_id: '' },
              { habitacao_id: 'null' },
              { habitacao_id: 'undefined' },
              { habitacao_id: '[object Object]' },
              // Quando o campo existe mas não parece um ObjectId, tratamos como órfão.
              { habitacao_id: { $not: /^[a-f0-9]{24}$/i } }
            ]
          })
            .select('_id protocolo nova titulo createdAt morador_email')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

          if (Array.isArray(orphanDocs) && orphanDocs.length) {
            orphanDocs.forEach(doc => {
              const email = doc && doc.morador_email ? String(doc.morador_email).trim().toLowerCase() : '';
              const hid = email ? (emailToHab.get(email) || '') : '';
              if (!hid || !allowedHabIds.has(hid)) return;

              const current = servicosPorHab.get(hid) || [];
              const already = current.some(it => String(it && it._id ? it._id : '') === String(doc._id));
              if (already) return;

              const item = {
                _id: doc._id,
                protocolo: doc.protocolo,
                nova: doc.nova,
                titulo: doc.titulo,
                createdAt: doc.createdAt
              };
              const next = [item, ...current].sort((a, b) => {
                const da = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const db = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return (db || 0) - (da || 0);
              });
              servicosPorHab.set(hid, next.slice(0, 5));
            });
          }
        }
      }
    } catch (e) {
      console.warn('[api/habitacoes/busca] falha ao mapear solicitações sem/invalid habitacao_id', e?.message || e);
    }

    const result = habs.map(h => {
      const habKey = String(h._id);
      const rawVisitas = visitasPorHab.get(habKey) || [];
      const visitasMerged = Array.isArray(h?.permissoes_visita) ? [...h.permissoes_visita] : [];
      const seenVisitIds = new Set(visitasMerged.map(v => String(v && v._id ? v._id : '')).filter(Boolean));
      rawVisitas.forEach(v => {
        const vid = String(v && v._id ? v._id : '');
        if(!vid || seenVisitIds.has(vid)) return;
        seenVisitIds.add(vid);
        visitasMerged.push(v);
      });

      const now = new Date();
      const visitasMergedSanitized = visitasMerged.map(v => {
        if(!v || typeof v !== 'object') return v;
        const out = { ...v };
        if(out.chegadaEm && !isSameLocalDay(out.chegadaEm, now)){
          out.chegadaEm = null;
          out.chegadaVisitantes = [];
          return out;
        }
        if(Array.isArray(out.chegadaVisitantes) && out.chegadaVisitantes.length){
          out.chegadaVisitantes = out.chegadaVisitantes.filter(vv => {
            if(!vv) return false;
            if(vv.principal === true) return true;
            if(!vv.criadoEm) return false;
            return isSameLocalDay(vv.criadoEm, now);
          });
        }
        return out;
      });
      const solicitacoesVisita = Array.isArray(h?.solicitacoes_visita) ? h.solicitacoes_visita : [];

      return {
        _id: h._id,
        unidade: unidadePayloadMap.get(String(h.unidade_id)) || { _id: h.unidade_id },
        bloco: h.bloco_id ? blocoMap.get(String(h.bloco_id)) || null : null,
        andar: h.andar_id ? andarMap.get(String(h.andar_id)) || null : null,
        tipo: h.tipo || '',
        numero: h.numero,
        proprietario: h.proprietario_id ? propMap.get(String(h.proprietario_id)) || null : null,
        alugado: !!h.alugado,
        contrato_locacao: h.contrato_locacao || null,
        contratos_locacao: Array.isArray(h.contratos_locacao) ? h.contratos_locacao : [],
        moradores: moradoresPorHab.get(habKey) || [],
        vagas_garagem: vagasPorHab.get(habKey) || [],
        veiculos: h.veiculos || [],
        pets: h.pets || [],
        solicitacoes_servico: servicosPorHab.get(habKey) || [],
        solicitacoes_visita: solicitacoesVisita,
        permissoes_visita: visitasMergedSanitized,
        // Campos estendidos para exibição/edição
        area_m2: h.area_m2 != null ? h.area_m2 : null,
        fracao_ideal: h.fracao_ideal != null ? h.fracao_ideal : null,
        vencimento_contribuicao_dia: h.vencimento_contribuicao_dia != null ? h.vencimento_contribuicao_dia : null,
        descricao: h.descricao || '',
        foto: h.foto || ''
      };
    });
    res.json(result);
  }catch(e){ res.status(200).json([]); }
});

async function resolveEmailsMoradoresDaHabitacao({ habitacaoId, moradorEmail }){
  const emails = new Set();
  const extra = String(moradorEmail || '').trim().toLowerCase();
  if(extra) emails.add(extra);

  const habIdStr = String(habitacaoId || '').trim();
  if(!habIdStr) return [...emails];
  if(!mongoose.Types.ObjectId.isValid(habIdStr)) return [...emails];

  const habObjId = new mongoose.Types.ObjectId(habIdStr);
  const moradores = await CondMorador.find({ habitacao_id: habObjId, ativo: { $ne: false } })
    .select('email cond_usuario_id')
    .lean();

  const condUsuarioIds = [];
  (moradores || []).forEach(m => {
    const e = String(m?.email || '').trim().toLowerCase();
    if(e) emails.add(e);
    const cid = m?.cond_usuario_id ? String(m.cond_usuario_id) : '';
    if(cid && mongoose.Types.ObjectId.isValid(cid)) condUsuarioIds.push(new mongoose.Types.ObjectId(cid));
  });

  if(condUsuarioIds.length){
    const users = await CondUsuario.find({ _id: { $in: condUsuarioIds }, ativo: { $ne: false } }).select('email').lean();
    (users || []).forEach(u => {
      const e = String(u?.email || '').trim().toLowerCase();
      if(e) emails.add(e);
    });
  }

  return [...emails];
}

function normalizeDigits(val){
  return String(val || '').replace(/\D/g, '');
}

async function resolveEmailsUsuariosPortalDaUnidadeParaEnquete({ unidadeId, restricoes }){
  const uid = String(unidadeId || '').trim();
  if(!uid || !mongoose.Types.ObjectId.isValid(uid)) return [];

  const r = (restricoes && typeof restricoes === 'object') ? restricoes : {};
  const excEmails = new Set((Array.isArray(r.excluirMoradorEmails) ? r.excluirMoradorEmails : [])
    .map(s => String(s || '').trim().toLowerCase()).filter(Boolean));
  const excCpfs = new Set((Array.isArray(r.excluirMoradorCpfs) ? r.excluirMoradorCpfs : [])
    .map(normalizeDigits).filter(s => s.length >= 5));

  const rawIds = Array.isArray(r.excluirMoradorIds) ? r.excluirMoradorIds : [];
  const moradorObjectIds = [];
  rawIds.forEach(v => {
    const s = String(v || '').trim();
    if(!s) return;
    if(s.includes('@')) { excEmails.add(s.toLowerCase()); return; }
    const cpf = normalizeDigits(s);
    if(cpf && cpf.length >= 5) { excCpfs.add(cpf); return; }
    if(mongoose.Types.ObjectId.isValid(s)) moradorObjectIds.push(new mongoose.Types.ObjectId(s));
  });

  const habIds = (Array.isArray(r.excluirHabitacaoIds) ? r.excluirHabitacaoIds : [])
    .map(s => String(s || '').trim())
    .filter(s => mongoose.Types.ObjectId.isValid(s))
    .map(s => new mongoose.Types.ObjectId(s));

  // Compat: se vierem IDs de CondMorador ou habitações, converte para email/cpf para filtrar CondUsuario.
  try{
    if(moradorObjectIds.length){
      const mor = await CondMorador.find({ _id: { $in: moradorObjectIds } })
        .select('email cpf')
        .lean();
      (mor || []).forEach(m => {
        const e = String(m?.email || '').trim().toLowerCase();
        if(e) excEmails.add(e);
        const c = normalizeDigits(m?.cpf || '');
        if(c && c.length >= 5) excCpfs.add(c);
      });
    }
  } catch { /* noop */ }

  try{
    if(habIds.length){
      const mor = await CondMorador.find({ unidade_id: new mongoose.Types.ObjectId(uid), habitacao_id: { $in: habIds }, ativo: { $ne: false } })
        .select('email cpf')
        .lean();
      (mor || []).forEach(m => {
        const e = String(m?.email || '').trim().toLowerCase();
        if(e) excEmails.add(e);
        const c = normalizeDigits(m?.cpf || '');
        if(c && c.length >= 5) excCpfs.add(c);
      });
    }
  } catch { /* noop */ }

  const outSet = new Set();
  const unidadeObjId = new mongoose.Types.ObjectId(uid);

  const ruleNaoExibirDesabitadas = !!r.naoExibirHabDesabitadas;
  const ruleApenasResponsavel = !!r.apenasResponsavelHabitacao;
  const ruleApenasProprietario = !!r.apenasProprietario;
  const hasRules = ruleNaoExibirDesabitadas || ruleApenasResponsavel || ruleApenasProprietario;

  // Quando há regras (além de listas de exclusão), os destinatários devem ser calculados por habitação,
  // para não notificar quem não vai enxergar o conteúdo no Portal.
  if (hasRules) {
    try {
      const habQ = { unidade_id: unidadeObjId, ativa: { $ne: false } };
      if (habIds.length) habQ._id = { $nin: habIds };
      const habDocs = await CondHabitacao.find(habQ)
        .select('_id proprietario_id contrato_locacao.responsavel_morador_id contratos_locacao.responsavel_morador_id')
        .lean();

      const habComMoradorAtivo = new Set();
      if (ruleNaoExibirDesabitadas) {
        try {
          const mq = { unidade_id: unidadeObjId, ativo: { $ne: false } };
          if (habIds.length) mq.habitacao_id = { $nin: habIds };
          const mor = await CondMorador.find(mq).select('habitacao_id').lean();
          (mor || []).forEach(m => {
            const hid = m?.habitacao_id ? String(m.habitacao_id) : '';
            if (hid) habComMoradorAtivo.add(hid);
          });
        } catch { /* noop */ }
      }

      const responsavelMoradorIds = new Set();
      const proprietarioIds = new Set();
      const habIdsElegiveis = [];

      (habDocs || []).forEach(h => {
        const hid = h?._id ? String(h._id) : '';
        if (!hid) return;
        if (ruleNaoExibirDesabitadas && !habComMoradorAtivo.has(hid)) return;
        habIdsElegiveis.push(new mongoose.Types.ObjectId(hid));

        const propId = h?.proprietario_id ? String(h.proprietario_id) : '';

        let respId = '';
        try {
          const a = h?.contrato_locacao?.responsavel_morador_id ? String(h.contrato_locacao.responsavel_morador_id) : '';
          respId = a;
        } catch { /* noop */ }
        if (!respId) {
          try {
            const list = Array.isArray(h?.contratos_locacao) ? h.contratos_locacao : [];
            for (let i = list.length - 1; i >= 0; i--) {
              const cand = list[i]?.responsavel_morador_id ? String(list[i].responsavel_morador_id) : '';
              if (cand) { respId = cand; break; }
            }
          } catch { /* noop */ }
        }

        if (ruleApenasProprietario) {
          if (propId && mongoose.Types.ObjectId.isValid(propId)) proprietarioIds.add(propId);
          return;
        }

        if (ruleApenasResponsavel) {
          if (respId && mongoose.Types.ObjectId.isValid(respId)) {
            responsavelMoradorIds.add(respId);
            return;
          }
          // Fallback (igual Portal): sem responsável, trata proprietário como responsável
          if (propId && mongoose.Types.ObjectId.isValid(propId)) proprietarioIds.add(propId);
          return;
        }
      });

      const condUsuarioIds = [];

      // Caso seja apenas "não exibir desabitadas" (sem restringir a responsável/proprietário): notifica moradores elegíveis.
      if (!ruleApenasProprietario && !ruleApenasResponsavel) {
        try {
          if (habIdsElegiveis.length) {
            const mor = await CondMorador.find({ unidade_id: unidadeObjId, habitacao_id: { $in: habIdsElegiveis }, ativo: { $ne: false } })
              .select('email cpf cond_usuario_id')
              .lean();
            (mor || []).forEach(m => {
              const e = String(m?.email || '').trim().toLowerCase();
              if (e && !excEmails.has(e)) outSet.add(e);
              const cpf = normalizeDigits(m?.cpf || '');
              if (cpf && excCpfs.has(cpf) && e) outSet.delete(e);
              const cid = m?.cond_usuario_id ? String(m.cond_usuario_id) : '';
              if (cid && mongoose.Types.ObjectId.isValid(cid)) condUsuarioIds.push(new mongoose.Types.ObjectId(cid));
            });
          }
        } catch { /* noop */ }
      }

      // Responsáveis (via CondMorador)
      try {
        const ids = Array.from(responsavelMoradorIds).filter(v => mongoose.Types.ObjectId.isValid(v));
        if (ids.length) {
          const mor = await CondMorador.find({ _id: { $in: ids.map(v => new mongoose.Types.ObjectId(v)) }, ativo: { $ne: false } })
            .select('email cpf cond_usuario_id')
            .lean();
          (mor || []).forEach(m => {
            const e = String(m?.email || '').trim().toLowerCase();
            if (e && !excEmails.has(e)) outSet.add(e);
            const cpf = normalizeDigits(m?.cpf || '');
            if (cpf && excCpfs.has(cpf) && e) outSet.delete(e);
            const cid = m?.cond_usuario_id ? String(m.cond_usuario_id) : '';
            if (cid && mongoose.Types.ObjectId.isValid(cid)) condUsuarioIds.push(new mongoose.Types.ObjectId(cid));
          });
        }
      } catch { /* noop */ }

      // Proprietários (via CondProprietario -> CondUsuario)
      try {
        const pids = Array.from(proprietarioIds).filter(v => mongoose.Types.ObjectId.isValid(v));
        if (pids.length) {
          const props = await CondProprietario.find({ _id: { $in: pids.map(v => new mongoose.Types.ObjectId(v)) }, ativo: { $ne: false } })
            .select('cond_usuario_id contato_email cpf')
            .lean();
          (props || []).forEach(p => {
            const contato = String(p?.contato_email || '').trim().toLowerCase();
            if (contato && !excEmails.has(contato)) outSet.add(contato);
            const cpf = normalizeDigits(p?.cpf || '');
            if (cpf && excCpfs.has(cpf) && contato) outSet.delete(contato);
            const cid = p?.cond_usuario_id ? String(p.cond_usuario_id) : '';
            if (cid && mongoose.Types.ObjectId.isValid(cid)) condUsuarioIds.push(new mongoose.Types.ObjectId(cid));
          });
        }
      } catch { /* noop */ }

      // Resolve e-mails finais via CondUsuario (para cobrir casos sem email em CondMorador/Proprietario)
      try {
        if (condUsuarioIds.length) {
          const uniq = Array.from(new Set(condUsuarioIds.map(x => String(x)))).slice(0, 5000);
          const usersById = await CondUsuario.find({ _id: { $in: uniq.map(v => new mongoose.Types.ObjectId(v)) }, ativo: { $ne: false }, portal_acesso_ativo: { $ne: false } })
            .select('email cpf')
            .lean();
          (usersById || []).forEach(u => {
            const e = String(u?.email || '').trim().toLowerCase();
            if(!e) return;
            if(excEmails.has(e)) return;
            const cpf = normalizeDigits(u?.cpf || '');
            if(cpf && excCpfs.has(cpf)) return;
            outSet.add(e);
          });
        }
      } catch { /* noop */ }

      return Array.from(outSet).slice(0, 2000);
    } catch {
      // Se falhar por qualquer motivo, cai para a estratégia antiga (mais permissiva)
    }
  }

  // Base principal: moradores vinculados à unidade (mais alinhado com a elegibilidade real do Portal)
  try{
    const q = { unidade_id: unidadeObjId, ativo: { $ne: false } };
    if(habIds.length) q.habitacao_id = { $nin: habIds };
    const moradores = await CondMorador.find(q)
      .select('email cpf cond_usuario_id')
      .lean();

    const condIds = [];
    (moradores || []).forEach(m => {
      const e = String(m?.email || '').trim().toLowerCase();
      if(e && !excEmails.has(e)) outSet.add(e);
      const cpf = normalizeDigits(m?.cpf || '');
      if(cpf && excCpfs.has(cpf) && e) outSet.delete(e);

      const cid = m?.cond_usuario_id ? String(m.cond_usuario_id) : '';
      if(cid && mongoose.Types.ObjectId.isValid(cid)) condIds.push(new mongoose.Types.ObjectId(cid));
    });

    if(condIds.length){
      const usersById = await CondUsuario.find({ _id: { $in: condIds }, ativo: { $ne: false }, portal_acesso_ativo: { $ne: false } })
        .select('email cpf')
        .lean();
      (usersById || []).forEach(u => {
        const e = String(u?.email || '').trim().toLowerCase();
        if(!e) return;
        if(excEmails.has(e)) return;
        const cpf = normalizeDigits(u?.cpf || '');
        if(cpf && excCpfs.has(cpf)) return;
        outSet.add(e);
      });
    }
  } catch { /* noop */ }

  // Fallback complementar: usuários da unidade (caso existam sem CondMorador)
  try{
    const users = await CondUsuario.find({
      unidade_id: unidadeObjId,
      ativo: { $ne: false },
      portal_acesso_ativo: { $ne: false },
      email: { $exists: true, $ne: '' }
    })
      .select('email cpf')
      .lean();

    (users || []).forEach(u => {
      const e = String(u?.email || '').trim().toLowerCase();
      if(!e) return;
      if(excEmails.has(e)) return;
      const cpf = normalizeDigits(u?.cpf || '');
      if(cpf && excCpfs.has(cpf)) return;
      outSet.add(e);
    });
  } catch { /* noop */ }

  return Array.from(outSet).slice(0, 2000);
}

function isSameLocalDay(a, b){
  if(!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if(!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function resolveActorFromCtxUser(ctxUser){
  if(!ctxUser) return null;
  const id = String(ctxUser?._id || ctxUser?.id || '').trim();
  const nome = String(ctxUser?.nome || ctxUser?.name || ctxUser?.username || '').trim();
  const email = String(ctxUser?.email || '').trim().toLowerCase();
  const label = nome || email || '';
  return {
    tipo: 'COLABORADOR',
    id: id || null,
    nome: label || null,
    email: email || null
  };
}

function visitanteKeyFrom(v){
  if(!v) return '';
  const nome = String(v?.nome || '').trim().toLowerCase();
  const rg = String(v?.rg || '').trim();
  const cpf = String(v?.cpf || '').trim();
  return `${nome}|${rg}|${cpf}`;
}

function hasEventSameDay(list, tipo, day, visitanteKey){
  if(!Array.isArray(list) || !tipo || !day) return false;
  const keyNorm = visitanteKey ? String(visitanteKey).trim() : '';
  for(const ev of list){
    if(!ev) continue;
    if(String(ev.tipo || '').trim() !== String(tipo)) continue;
    if(!ev.em) continue;
    if(!isSameLocalDay(ev.em, day)) continue;
    if(keyNorm){
      if(String(ev.visitanteKey || '').trim() !== keyNorm) continue;
    }
    return true;
  }
  return false;
}

function isAdminLike(ctxUser){
  return !!(ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin'));
}

async function assertCanAccessVisita(ctxUser, visita){
  if(!ctxUser) throw Object.assign(new Error('Não autorizado'), { statusCode: 401 });
  if(!visita) throw Object.assign(new Error('Visita não encontrada'), { statusCode: 404 });
  if(isAdminLike(ctxUser)) return true;
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const unitIds = (unidadesOptions||[]).map(u => String(u._id));
  const vUnit = String(visita.unidade_id || '');
  if(vUnit && unitIds.length && !unitIds.includes(vUnit)){
    throw Object.assign(new Error('Sem permissão para esta unidade'), { statusCode: 403 });
  }
  return true;
}

app.get('/api/visitas/:id', async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const ctxUser = req.user || (req.session && req.session.user) || null;
    if(!ctxUser) return res.status(401).json({ error: 'Não autorizado' });

    const visitaId = String(req.params.id || '').trim();
    if(!visitaId) return res.status(400).json({ error: 'id é obrigatório' });

    const visita = await CondVisitante.findById(visitaId);
    await assertCanAccessVisita(ctxUser, visita);

    return res.json({ ok: true, visita: visita.toObject() });
  } catch (e){
    const sc = e?.statusCode ? Number(e.statusCode) : 500;
    if(sc !== 500){
      return res.status(sc).json({ error: e?.message || 'Falha ao consultar visita' });
    }
    console.error('[api/visitas/:id GET] erro', e);
    return res.status(500).json({ error: 'Falha ao consultar visita' });
  }
});

app.post('/api/visitas/:id/chegada', express.json(), async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const ctxUser = req.user || (req.session && req.session.user) || null;
    if(!ctxUser) return res.status(401).json({ error: 'Não autorizado' });

    const visitaId = String(req.params.id || '').trim();
    if(!visitaId) return res.status(400).json({ error: 'id é obrigatório' });

    const visita = await CondVisitante.findById(visitaId);
    if(!visita) return res.status(404).json({ error: 'Visita não encontrada' });

    try { await assertCanAccessVisita(ctxUser, visita); } catch(e){
      const sc = e?.statusCode ? Number(e.statusCode) : 403;
      return res.status(sc).json({ error: e?.message || 'Sem permissão' });
    }

    const now = new Date();
    const alreadyToday = visita.chegadaEm && isSameLocalDay(visita.chegadaEm, now);

    const principalBody = req.body?.principal && typeof req.body.principal === 'object' ? req.body.principal : null;
    if(principalBody){
      const nome = String(principalBody?.nome || '').trim();
      if(nome) visita.visitanteNome = nome;
      visita.visitanteRg = String(principalBody?.rg || '').trim();
      visita.visitanteCpf = String(principalBody?.cpf || '').trim();
      visita.visitanteTel = String(principalBody?.tel || '').trim();

      // Observações da visita (principal)
      const obs = String(principalBody?.observacoes || '').trim();
      if(obs || visita.observacoes){
        visita.observacoes = obs;
      }

      // Veículo da visita (principal): pode ser null para remover
      const veicIn = principalBody?.veiculo;
      if(veicIn === null){
        visita.veiculo = null;
      } else if(veicIn && typeof veicIn === 'object'){
        const v = {
          tipo: String(veicIn?.tipo || '').trim(),
          placa: String(veicIn?.placa || '').trim(),
          marca: String(veicIn?.marca || '').trim(),
          modelo: String(veicIn?.modelo || '').trim(),
          cor: String(veicIn?.cor || '').trim(),
          ano: String(veicIn?.ano || '').trim()
        };
        const hasAny = !!(v.tipo || v.placa || v.marca || v.modelo || v.cor || v.ano);
        visita.veiculo = hasAny ? v : null;
      }
    }

    const bodyVisitantes = Array.isArray(req.body?.visitantes) ? req.body.visitantes : null;
    const visitantesPayload = (bodyVisitantes || [])
      .filter(Boolean)
      .map(v => {
        const veiculoIn = v?.veiculo && typeof v.veiculo === 'object' ? v.veiculo : null;
        const veiculo = veiculoIn
          ? {
              tipo: String(veiculoIn?.tipo || '').trim(),
              placa: String(veiculoIn?.placa || '').trim(),
              marca: String(veiculoIn?.marca || '').trim(),
              modelo: String(veiculoIn?.modelo || '').trim(),
              cor: String(veiculoIn?.cor || '').trim(),
              ano: String(veiculoIn?.ano || '').trim()
            }
          : null;
        const veiculoHasAny = !!(veiculo && (veiculo.tipo || veiculo.placa || veiculo.marca || veiculo.modelo || veiculo.cor || veiculo.ano));

        const motivo = String(v?.motivo || '').trim();
        const observacoes = String(v?.observacoes || '').trim() || motivo;

        return {
          nome: String(v?.nome || '').trim(),
          rg: String(v?.rg || '').trim(),
          cpf: String(v?.cpf || '').trim(),
          tel: String(v?.tel || '').trim(),
          motivo,
          observacoes,
          veiculo: veiculoHasAny ? veiculo : null
        };
      })
      .filter(v => v.nome);
    const principalNome = String(visita.visitanteNome || '').trim();
    const principal = principalNome ? {
      nome: principalNome,
      rg: String(visita.visitanteRg || '').trim(),
      cpf: String(visita.visitanteCpf || '').trim(),
      tel: String(visita.visitanteTel || '').trim(),
      motivo: String(visita.finalidadeLabel || visita.finalidade || '').trim(),
      observacoes: String(visita.observacoes || '').trim(),
      veiculo: visita.veiculo && typeof visita.veiculo === 'object'
        ? {
            tipo: String(visita.veiculo.tipo || '').trim(),
            placa: String(visita.veiculo.placa || '').trim(),
            marca: String(visita.veiculo.marca || '').trim(),
            modelo: String(visita.veiculo.modelo || '').trim(),
            cor: String(visita.veiculo.cor || '').trim(),
            ano: String(visita.veiculo.ano || '').trim()
          }
        : null,
      principal: true,
      criadoEm: now
    } : null;

    function uniqKey(v){
      return `${String(v?.nome || '').toLowerCase()}|${String(v?.rg || '')}|${String(v?.cpf || '')}`;
    }

    let shouldSave = false;

    if(principalBody){
      shouldSave = true;
    }

    // Se comunicando em um novo dia, registra a chegada.
    if(!alreadyToday){
      visita.chegadaEm = now;
      shouldSave = true;
    }

    // Registra evento de fluxo (idempotente por dia): Chegada comunicada → Aguardando confirmação
    // Importante: mesmo se alreadyToday=true (chegada já registrada por versões antigas),
    // garantimos que o evento exista para o dia atual.
    {
      const dayRef = visita.chegadaEm ? new Date(visita.chegadaEm) : null;
      const sameDay = dayRef && Number.isFinite(dayRef.getTime()) ? isSameLocalDay(dayRef, now) : false;
      if(sameDay){
        visita.comunicacoesAcesso = Array.isArray(visita.comunicacoesAcesso) ? visita.comunicacoesAcesso : [];
        const visitantesDia = Array.isArray(visita.chegadaVisitantes) ? visita.chegadaVisitantes : [];
        for(const vv of visitantesDia){
          if(!vv) continue;
          // somente visitantes do dia atual (principal sempre entra)
          if(vv.principal !== true){
            if(!vv.criadoEm) continue;
            if(!isSameLocalDay(vv.criadoEm, dayRef)) continue;
          }
          const key = visitanteKeyFrom(vv);
          if(!key) continue;
          const has = hasEventSameDay(visita.comunicacoesAcesso, 'CHEGADA_COMUNICADA', dayRef, key);
          if(has) continue;
          visita.comunicacoesAcesso.push({
            tipo: 'CHEGADA_COMUNICADA',
            status: 'AGUARDANDO_CONFIRMACAO',
            em: now,
            visitanteKey: key,
            visitante: {
              nome: String(vv?.nome || '').trim(),
              rg: String(vv?.rg || '').trim(),
              cpf: String(vv?.cpf || '').trim(),
              tel: String(vv?.tel || '').trim(),
              principal: vv?.principal === true
            },
            por: resolveActorFromCtxUser(ctxUser)
          });
          shouldSave = true;
        }
      }
    }

    // Se o front enviou a lista, ela substitui os acompanhantes do dia.
    if(bodyVisitantes){
      const merged = [];
      if(principal) merged.push(principal);

      const seen = new Set(merged.map(uniqKey));
      visitantesPayload.forEach(v => {
        const k = uniqKey(v);
        if(seen.has(k)) return;
        seen.add(k);
        merged.push({
          nome: v.nome,
          rg: v.rg,
          cpf: v.cpf,
          tel: v.tel,
          motivo: v.motivo,
          observacoes: v.observacoes,
          veiculo: v.veiculo,
          principal: false,
          criadoEm: now
        });
      });

      visita.chegadaVisitantes = merged;
      shouldSave = true;
    } else if(!alreadyToday) {
      // Sem payload: em novo dia, mantém somente principal (não reaproveita antigos).
      visita.chegadaVisitantes = principal ? [principal] : [];
      shouldSave = true;
    }

    let notified = null;
    if(shouldSave){
      await visita.save();
    }

    if(!alreadyToday){
      // Em serverless, "background" após res.json pode ser interrompido.
      // Então tentamos enviar o push antes de responder, mas com timeout curto.
      try{
        const timeoutMs = Math.max(500, Number(process.env.PORTAL_PUSH_TIMEOUT_MS || 2500));
        const emails = await resolveEmailsMoradoresDaHabitacao({ habitacaoId: visita.habitacaoId, moradorEmail: visita.morador_email });
        const pushPromise = notifyVisitaChegadaPush({
          emails,
          habitacaoNome: visita.habitacaoNome,
          visitaId: String(visita._id),
          visitantes: visita.chegadaVisitantes,
          criadoEm: visita.chegadaEm ? visita.chegadaEm.toISOString() : null
        });

        notified = await Promise.race([
          pushPromise,
          new Promise((resolve) => {
            const t = setTimeout(() => resolve({ ok: false, queued: true, reason: 'timeout' }), timeoutMs);
            if (typeof t?.unref === 'function') t.unref();
          })
        ]);
      } catch(err){
        console.warn('[api/visitas/:id/chegada] falha ao enviar push:', err?.message || err);
        notified = { ok: false, reason: 'push-error' };
      }
    }

    res.json({ ok: true, visita: visita.toObject(), notified, alreadyToday: Boolean(alreadyToday) });
  } catch(e){
    console.error('[api/visitas/:id/chegada] erro', e);
    res.status(500).json({ error: 'Falha ao comunicar chegada' });
  }
});

app.post('/api/visitas/:id/autorizar-manual', express.json(), async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const ctxUser = req.user || (req.session && req.session.user) || null;
    if(!ctxUser) return res.status(401).json({ error: 'Não autorizado' });

    const visitaId = String(req.params.id || '').trim();
    if(!visitaId) return res.status(400).json({ error: 'id é obrigatório' });

    const visita = await CondVisitante.findById(visitaId);
    await assertCanAccessVisita(ctxUser, visita);

    const day = visita?.chegadaEm ? new Date(visita.chegadaEm) : null;
    if(!day || !Number.isFinite(day.getTime())){
      return res.status(409).json({ error: 'Chegada ainda não foi comunicada' });
    }

    const visitanteKey = String(req.body?.visitanteKey || '').trim();
    if(!visitanteKey){
      return res.status(400).json({ error: 'visitanteKey é obrigatório' });
    }

    visita.comunicacoesAcesso = Array.isArray(visita.comunicacoesAcesso) ? visita.comunicacoesAcesso : [];
    const hasChegadaHoje = hasEventSameDay(visita.comunicacoesAcesso, 'CHEGADA_COMUNICADA', day, visitanteKey);
    if(!hasChegadaHoje){
      // Compat: em bases antigas pode existir `chegadaEm` sem o evento por visitante.
      // Neste caso, cria o evento de chegada para permitir autorizar manualmente.
      let visitanteSnap0 = null;
      try{
        const vv0 = (Array.isArray(visita.chegadaVisitantes) ? visita.chegadaVisitantes : []).find(x => visitanteKeyFrom(x) === visitanteKey) || null;
        if(vv0){
          visitanteSnap0 = {
            nome: String(vv0?.nome || '').trim(),
            rg: String(vv0?.rg || '').trim(),
            cpf: String(vv0?.cpf || '').trim(),
            tel: String(vv0?.tel || '').trim(),
            principal: vv0?.principal === true
          };
        }
      } catch(_e){ visitanteSnap0 = null; }

      visita.comunicacoesAcesso.push({
        tipo: 'CHEGADA_COMUNICADA',
        status: 'AGUARDANDO_CONFIRMACAO',
        em: new Date(day),
        visitanteKey,
        visitante: visitanteSnap0,
        por: resolveActorFromCtxUser(ctxUser)
      });
    }
    const alreadyAuthorized = hasEventSameDay(visita.comunicacoesAcesso, 'ENTRADA_AUTORIZADA', day, visitanteKey);
    if(alreadyAuthorized){
      return res.status(409).json({ error: 'Entrada já foi autorizada' });
    }
    const alreadyExit = hasEventSameDay(visita.comunicacoesAcesso, 'SAIDA_COMUNICADA', day, visitanteKey);
    if(alreadyExit){
      return res.status(409).json({ error: 'Saída já foi comunicada' });
    }

    const justificativa = String(req.body?.justificativa || '').trim();
    if(!justificativa){
      return res.status(400).json({ error: 'Justificativa é obrigatória' });
    }

    // Mantém o evento no mesmo “dia” da chegada para consistência do fluxo por dia
    // (e para evitar sumir no front caso a autorização ocorra após meia-noite).
    const now = new Date();
    const occurredRaw = String(req.body?.ocorridoEm || '').trim();
    const occurred = occurredRaw ? new Date(occurredRaw) : null;
    const occurredOk = occurred && Number.isFinite(occurred.getTime()) ? occurred : null;
    const hh = occurredOk ? occurredOk.getHours() : now.getHours();
    const mm = occurredOk ? occurredOk.getMinutes() : now.getMinutes();
    const anchor = day && Number.isFinite(day.getTime())
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    let visitanteSnap = null;
    try{
      const vv = (Array.isArray(visita.chegadaVisitantes) ? visita.chegadaVisitantes : []).find(x => visitanteKeyFrom(x) === visitanteKey) || null;
      if(vv){
        visitanteSnap = {
          nome: String(vv?.nome || '').trim(),
          rg: String(vv?.rg || '').trim(),
          cpf: String(vv?.cpf || '').trim(),
          tel: String(vv?.tel || '').trim(),
          principal: vv?.principal === true
        };
      }
    } catch(_e){ /* noop */ }

    visita.comunicacoesAcesso.push({
      tipo: 'ENTRADA_AUTORIZADA',
      status: 'AUTORIZADO_MANUAL',
      em: anchor,
      ocorridoEm: occurredOk || anchor,
      registradoEm: now,
      visitanteKey,
      visitante: visitanteSnap,
      por: resolveActorFromCtxUser(ctxUser),
      justificativa
    });
    await visita.save();

    return res.json({ ok: true, visita: visita.toObject() });
  } catch (e){
    const sc = e?.statusCode ? Number(e.statusCode) : 500;
    if(sc !== 500) return res.status(sc).json({ error: e?.message || 'Falha ao autorizar' });
    console.error('[api/visitas/:id/autorizar-manual] erro', e);
    return res.status(500).json({ error: 'Falha ao autorizar entrada' });
  }
});

app.post('/api/visitas/:id/saida', express.json(), async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const ctxUser = req.user || (req.session && req.session.user) || null;
    if(!ctxUser) return res.status(401).json({ error: 'Não autorizado' });

    const visitaId = String(req.params.id || '').trim();
    if(!visitaId) return res.status(400).json({ error: 'id é obrigatório' });

    const visita = await CondVisitante.findById(visitaId);
    await assertCanAccessVisita(ctxUser, visita);

    const day = visita?.chegadaEm ? new Date(visita.chegadaEm) : null;
    if(!day || !Number.isFinite(day.getTime())){
      return res.status(409).json({ error: 'Chegada ainda não foi comunicada' });
    }

    const visitanteKey = String(req.body?.visitanteKey || '').trim();
    if(!visitanteKey){
      return res.status(400).json({ error: 'visitanteKey é obrigatório' });
    }

    visita.comunicacoesAcesso = Array.isArray(visita.comunicacoesAcesso) ? visita.comunicacoesAcesso : [];
    const alreadyAuthorized = hasEventSameDay(visita.comunicacoesAcesso, 'ENTRADA_AUTORIZADA', day, visitanteKey);
    if(!alreadyAuthorized){
      return res.status(409).json({ error: 'Entrada ainda não foi autorizada' });
    }
    const alreadyExit = hasEventSameDay(visita.comunicacoesAcesso, 'SAIDA_COMUNICADA', day, visitanteKey);
    if(alreadyExit){
      return res.status(409).json({ error: 'Saída já foi comunicada' });
    }

    let visitanteSnap = null;
    try{
      const vv = (Array.isArray(visita.chegadaVisitantes) ? visita.chegadaVisitantes : []).find(x => visitanteKeyFrom(x) === visitanteKey) || null;
      if(vv){
        visitanteSnap = {
          nome: String(vv?.nome || '').trim(),
          rg: String(vv?.rg || '').trim(),
          cpf: String(vv?.cpf || '').trim(),
          tel: String(vv?.tel || '').trim(),
          principal: vv?.principal === true
        };
      }
    } catch(_e){ /* noop */ }

    // Mantém o evento no mesmo “dia” da chegada para consistência do fluxo por dia.
    const now = new Date();
    const occurredRaw = String(req.body?.ocorridoEm || '').trim();
    const occurred = occurredRaw ? new Date(occurredRaw) : null;
    const occurredOk = occurred && Number.isFinite(occurred.getTime()) ? occurred : null;
    const hh = occurredOk ? occurredOk.getHours() : now.getHours();
    const mm = occurredOk ? occurredOk.getMinutes() : now.getMinutes();
    const anchor = day && Number.isFinite(day.getTime())
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    visita.comunicacoesAcesso.push({
      tipo: 'SAIDA_COMUNICADA',
      status: 'SAIDA',
      em: anchor,
      ocorridoEm: occurredOk || anchor,
      registradoEm: now,
      visitanteKey,
      visitante: visitanteSnap,
      por: resolveActorFromCtxUser(ctxUser)
    });
    await visita.save();

    return res.json({ ok: true, visita: visita.toObject() });
  } catch (e){
    const sc = e?.statusCode ? Number(e.statusCode) : 500;
    if(sc !== 500) return res.status(sc).json({ error: e?.message || 'Falha ao comunicar saída' });
    console.error('[api/visitas/:id/saida] erro', e);
    return res.status(500).json({ error: 'Falha ao comunicar saída' });
  }
});

app.post('/api/visitas/:id/chegada/visitantes', express.json(), async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const ctxUser = req.user || (req.session && req.session.user) || null;
    if(!ctxUser) return res.status(401).json({ error: 'Não autorizado' });

    const visitaId = String(req.params.id || '').trim();
    if(!visitaId) return res.status(400).json({ error: 'id é obrigatório' });

    const visita = await CondVisitante.findById(visitaId);
    if(!visita) return res.status(404).json({ error: 'Visita não encontrada' });

    const nome = String(req.body?.nome || '').trim();
    const rg = String(req.body?.rg || '').trim();
    const cpf = String(req.body?.cpf || '').trim();
    const motivo = String(req.body?.motivo || '').trim();
    if(!nome) return res.status(400).json({ error: 'nome é obrigatório' });

    const entry = {
      nome,
      rg,
      cpf,
      motivo,
      principal: false,
      criadoEm: new Date()
    };

    visita.chegadaVisitantes = Array.isArray(visita.chegadaVisitantes) ? visita.chegadaVisitantes : [];
    visita.chegadaVisitantes.push(entry);
    await visita.save();

    // Não notifica automaticamente o Portal do Morador ao inserir acompanhante.
    // A notificação deve ocorrer apenas ao comunicar a chegada.
    res.json({ ok: true, visita: visita.toObject(), notified: null });
  } catch(e){
    console.error('[api/visitas/:id/chegada/visitantes] erro', e);
    res.status(500).json({ error: 'Falha ao adicionar visitante' });
  }
});

async function resolveServiceRequestDetailRead({ req, id }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
  const doc = await CondSolicitacaoServico.findById(id).lean();

  if(!doc) return { error: { status: 404, body: { error: 'Solicitação não encontrada' } } };

  if(!isAdmin){
    const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
    const allowed = new Set((unidadesOptions || []).map(u => String(u._id)));
    const unidadeIdStr = doc.unidade_id ? String(doc.unidade_id) : '';
    if(allowed.size && unidadeIdStr && !allowed.has(unidadeIdStr)){
      return { error: { status: 403, body: { error: 'Solicitação fora do escopo do usuário' } } };
    }
  }

  return { doc };
}

async function markServiceRequestDetailAsSeen({ id, doc }) {
  if(!doc || doc.nova === false) return doc;

  const updatedDoc = await CondSolicitacaoServico.findByIdAndUpdate(
    id,
    { $set: { nova: false } },
    { new: true }
  ).lean();

  return updatedDoc || { ...doc, nova: false };
}

async function buildServiceRequestDetailResponsePayload({ doc }) {
  return { data: doc };
}

async function resolveServiceRequestAcceptanceRead({ req, id }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
  const doc = await CondSolicitacaoServico.findById(id).lean();

  if(!doc){
    return { error: { status: 404, body: { error: 'Solicitação não encontrada' } } };
  }

  if(!isAdmin){
    const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
    const allowed = new Set((unidadesOptions || []).map(u => String(u._id)));
    const unidadeIdStr = doc.unidade_id ? String(doc.unidade_id) : '';
    if(allowed.size && unidadeIdStr && !allowed.has(unidadeIdStr)){
      return { error: { status: 403, body: { error: 'Solicitação fora do escopo do usuário' } } };
    }
  }

  return { doc, ctxUser };
}

async function applyServiceRequestAcceptance({ id, doc, ctxUser }) {
  const userId = ctxUser && (ctxUser._id || ctxUser.id);

  await CondSolicitacaoServico.updateOne(
    { _id: id },
    {
      $set: {
        status: 'aceita',
        nova: false,
        aceita_em: new Date(),
        aceita_por: userId ? String(userId) : null,
        aceita_por_nome: ctxUser && ctxUser.nome ? ctxUser.nome : null,
        rejeitada_em: null,
        rejeitada_por: null,
        rejeitada_por_nome: null,
        rejeicao_motivo: null
      }
    }
  );

  return doc;
}

async function emitServiceRequestAcceptedPush({ id, doc }) {
  try {
    const pushResult = await notifyServicoStatusPush({
      email: doc?.morador_email || '',
      protocolo: doc?.protocolo || doc?._id || id,
      status: 'aceita',
      assunto: doc?.titulo || null,
      unidadeId: doc?.unidade_id || null,
      servicoId: doc?._id ? String(doc._id) : id
    });
    if (!pushResult?.ok) {
      console.warn('[api/solicitacoes-servico/:id/aceitar] push não enviado', pushResult?.reason || pushResult);
    }
  } catch (pushErr) {
    console.error('[api/solicitacoes-servico/:id/aceitar] push erro', pushErr?.message || pushErr);
  }
}

function buildServiceRequestAcceptanceResponsePayload() {
  return { ok: true };
}

async function resolveServiceRequestRejectionRead({ req, id }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
  const doc = await CondSolicitacaoServico.findById(id).lean();

  if(!doc){
    return { error: { status: 404, body: { error: 'Solicitação não encontrada' } } };
  }

  if(!isAdmin){
    const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
    const allowed = new Set((unidadesOptions || []).map(u => String(u._id)));
    const unidadeIdStr = doc.unidade_id ? String(doc.unidade_id) : '';
    if(allowed.size && unidadeIdStr && !allowed.has(unidadeIdStr)){
      return { error: { status: 403, body: { error: 'Solicitação fora do escopo do usuário' } } };
    }
  }

  return { doc, ctxUser };
}

async function applyServiceRequestRejection({ id, doc, ctxUser, motivo }) {
  const userId = ctxUser && (ctxUser._id || ctxUser.id);

  await CondSolicitacaoServico.updateOne(
    { _id: id },
    {
      $set: {
        status: 'rejeitada',
        nova: false,
        rejeitada_em: new Date(),
        rejeitada_por: userId ? String(userId) : null,
        rejeitada_por_nome: ctxUser && ctxUser.nome ? ctxUser.nome : null,
        rejeicao_motivo: motivo,
        aceita_em: null,
        aceita_por: null,
        aceita_por_nome: null
      }
    }
  );

  return doc;
}

async function emitServiceRequestRejectedPush({ id, doc, motivo }) {
  try {
    const pushResult = await notifyServicoStatusPush({
      email: doc?.morador_email || '',
      protocolo: doc?.protocolo || doc?._id || id,
      status: 'rejeitada',
      motivo,
      assunto: doc?.titulo || null,
      unidadeId: doc?.unidade_id || null,
      servicoId: doc?._id ? String(doc._id) : id
    });
    if (!pushResult?.ok) {
      console.warn('[api/solicitacoes-servico/:id/rejeitar] push não enviado', pushResult?.reason || pushResult);
    }
  } catch (pushErr) {
    console.error('[api/solicitacoes-servico/:id/rejeitar] push erro', pushErr?.message || pushErr);
  }
}

function buildServiceRequestRejectionResponsePayload() {
  return { ok: true };
}

async function resolveServiceRequestListReadScope({ req, unidadeParam }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');

  if (isAdmin) {
    return { unidadeFilter: unidadeParam || null };
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const allowed = (unidadesOptions || []).map(u => String(u._id));
  if (!allowed.length) {
    return { empty: true };
  }

  if (unidadeParam) {
    if (!allowed.includes(unidadeParam)) {
      return { error: { status: 403, body: { error: 'Unidade fora do escopo do usuário' } } };
    }
    return { unidadeFilter: unidadeParam };
  }

  return { unidadeFilter: { $in: allowed } };
}

function buildServiceRequestListQueryFilter({ statusParam, unidadeFilter }) {
  const statusArray = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : [];
  const filter = {
    status: statusArray.length ? { $in: statusArray } : { $in: ['aberto', 'aceita'] }
  };

  if (unidadeFilter) {
    filter.unidade_id = unidadeFilter;
  }

  return filter;
}

async function buildServiceRequestListResponsePayload({ filter }) {
  const docs = await CondSolicitacaoServico.find(filter)
    .sort({ createdAt: -1 })
    .limit(120)
    .select('_id protocolo titulo descricao habitacao_label habitacao_id unidade_id morador_email status nova createdAt aceita_em aceita_por rejeitada_em rejeicao_motivo')
    .lean();

  return { data: docs || [] };
}

app.get('/api/solicitacoes-servico/:id', async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if(!id) return res.status(400).json({ error: 'ID inválido' });
  if(!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Solicitação não encontrada' });
  try{
    if(mongoose.connection.readyState !== 1){
      try { res.set('Retry-After','5'); } catch(_e){}
      return res.status(503).json({ error: 'Banco indisponível, tente novamente' });
    }

    const detailRead = await resolveServiceRequestDetailRead({ req, id });
    if(detailRead.error){
      return res.status(detailRead.error.status).json(detailRead.error.body);
    }

    const detailDoc = await markServiceRequestDetailAsSeen({
      id,
      doc: detailRead.doc
    });

    return res.json(await buildServiceRequestDetailResponsePayload({ doc: detailDoc }));
  }catch(err){
    console.error('[api/solicitacoes-servico/:id] erro GET', err);
    return res.status(500).json({ error: 'Falha ao consultar solicitação', detail: err.message });
  }
});

app.post('/api/solicitacoes-servico/:id/aceitar', express.json(), async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido' });
  try{
    if(mongoose.connection.readyState !== 1){
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const acceptanceRead = await resolveServiceRequestAcceptanceRead({ req, id });
    if(acceptanceRead.error){
      return res.status(acceptanceRead.error.status).json(acceptanceRead.error.body);
    }

    await applyServiceRequestAcceptance({
      id,
      doc: acceptanceRead.doc,
      ctxUser: acceptanceRead.ctxUser
    });
    await emitServiceRequestAcceptedPush({
      id,
      doc: acceptanceRead.doc
    });

    return res.json(buildServiceRequestAcceptanceResponsePayload());
  }catch(err){
    console.error('[api/solicitacoes-servico/:id/aceitar] erro POST', err);
    return res.status(500).json({ error: 'Falha ao aceitar solicitação', detail: err?.message });
  }
});

app.post('/api/solicitacoes-servico/:id/rejeitar', express.json(), async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido' });
  const motivoRaw = String(req.body?.motivo || '').trim();
  if(!motivoRaw) return res.status(400).json({ error: 'Informe a justificativa da rejeição' });

  try{
    if(mongoose.connection.readyState !== 1){
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const rejectionRead = await resolveServiceRequestRejectionRead({ req, id });
    if(rejectionRead.error){
      return res.status(rejectionRead.error.status).json(rejectionRead.error.body);
    }

    await applyServiceRequestRejection({
      id,
      doc: rejectionRead.doc,
      ctxUser: rejectionRead.ctxUser,
      motivo: motivoRaw
    });
    await emitServiceRequestRejectedPush({
      id,
      doc: rejectionRead.doc,
      motivo: motivoRaw
    });

    return res.json(buildServiceRequestRejectionResponsePayload());
  }catch(err){
    console.error('[api/solicitacoes-servico/:id/rejeitar] erro POST', err);
    return res.status(500).json({ error: 'Falha ao rejeitar solicitação', detail: err?.message });
  }
});

// API: solicitações abertas (Portal do Morador) visíveis no módulo gestor
app.get('/api/servicos/solicitacoes', async (req, res) => {
  try {
    const statusParam = String(req.query?.status || '').trim();
    const unidadeParam = String(req.query?.unidade || '').trim();

    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After', '5'); } catch {}
      return res.status(503).json({ error: 'DB indisponível' });
    }

    const listScope = await resolveServiceRequestListReadScope({ req, unidadeParam });
    if (listScope.error) {
      return res.status(listScope.error.status).json(listScope.error.body);
    }
    if (listScope.empty) {
      return res.json({ data: [] });
    }

    const filter = buildServiceRequestListQueryFilter({
      statusParam,
      unidadeFilter: listScope.unidadeFilter
    });

    return res.json(await buildServiceRequestListResponsePayload({ filter }));
  } catch (err) {
    console.error('[api/servicos/solicitacoes] erro GET', err);
    return res.status(500).json({ error: 'Falha ao listar solicitações', detail: err?.message });
  }
});

app.get('/api/habitacoes/:id/reservas', async (req, res) => {
  const habIdParam = req.params && req.params.id ? String(req.params.id).trim() : '';
  if(!habIdParam){
    return res.status(400).json({ error: 'Identificador da habitação é obrigatório' });
  }
  try{
    if(mongoose.connection.readyState !== 1){
      try { res.set('Retry-After','5'); } catch(_setErr){}
      return res.status(503).json({ error: 'Banco indisponível, tente novamente' });
    }

    const habDoc = await CondHabitacao.findById(habIdParam)
      .select('_id unidade_id bloco_id andar_id numero tipo area_m2 fracao_ideal vencimento_contribuicao_dia descricao foto')
      .lean();
    if(!habDoc) return res.status(404).json({ error: 'Habitação não encontrada' });

    const ctxUser = req.user || (req.session && req.session.user) || null;
    const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
    if(!isAdmin){
      const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
      const allowed = new Set((unidadesOptions || []).map(u => String(u._id)));
      const unidadeIdStr = habDoc.unidade_id ? String(habDoc.unidade_id) : '';
      if(allowed.size && unidadeIdStr && !allowed.has(unidadeIdStr)){
        return res.status(403).json({ error: 'Habitação fora do escopo do usuário' });
      }
    }

    const habIdStr = String(habDoc._id);
    const matchFilters = [{ 'cessoes.habitacao_id': habIdStr }];
    if(mongoose.Types.ObjectId.isValid(habIdStr)){
      matchFilters.push({ 'cessoes.habitacao_id': new mongoose.Types.ObjectId(habIdStr) });
    }
    const cessaoFilter = matchFilters.length > 1 ? { $or: matchFilters } : matchFilters[0];

    const cessaoDocs = await CondAreaCessao.find(cessaoFilter)
      .select('area_id cessoes updatedAt')
      .lean();

    const areaIds = [...new Set(cessaoDocs.map(doc => doc && doc.area_id ? String(doc.area_id) : null).filter(Boolean))];
    const [unidadeDoc, blocoDoc, andarDoc, areaDocs] = await Promise.all([
      habDoc.unidade_id ? unidadesReadRepoFromReq(req).findById(habDoc.unidade_id, { select: '_id codigo nome' }) : null,
      habDoc.bloco_id ? CondBloco.findById(habDoc.bloco_id).select('_id nome codigo').lean() : null,
      habDoc.andar_id ? CondAndar.findById(habDoc.andar_id).select('_id nome codigo').lean() : null,
      areaIds.length ? CondAreaComum.find({ _id: { $in: areaIds } }).select('_id nome codigo').lean() : []
    ]);

    const unidadePayload = unidadeDoc ? buildUnidadePayload(unidadeDoc) : null;
    const habSummary = {
      _id: habIdStr,
      numero: habDoc.numero || '',
      tipo: habDoc.tipo || '',
      bloco: blocoDoc ? { _id: String(blocoDoc._id), nome: blocoDoc.nome || blocoDoc.codigo || '' } : null,
      andar: andarDoc ? { _id: String(andarDoc._id), nome: andarDoc.nome || andarDoc.codigo || '' } : null,
      unidade: unidadePayload,
      label: buildHabitacaoLabel(habDoc, unidadePayload, blocoDoc, andarDoc)
    };

    const areaMap = new Map(areaDocs.map(area => [String(area._id), {
      _id: String(area._id),
      nome: area.nome || '',
      codigo: area.codigo || ''
    }]));

    const reservas = [];
    cessaoDocs.forEach(doc => {
      if(!doc || !Array.isArray(doc.cessoes)) return;
      const assignments = sanitizeAssignments(doc.cessoes);
      const areaPayload = areaMap.get(doc.area_id ? String(doc.area_id) : '') || null;
      assignments.forEach(item => {
        if(!item) return;
        const itemHabId = item.habitacao_id ? String(item.habitacao_id) : '';
        if(itemHabId !== habIdStr) return;
        reservas.push({
          id: item.id,
          area: areaPayload,
          date: item.date,
          date_end: item.date_end,
          start: item.start,
          end: item.end,
          morador_nome: item.morador_nome,
          observacao: item.observacao,
          termo_status: item.termo_status,
          pagamento_status_label: item.pagamento_status_label,
          enviar_comunicado: item.enviar_comunicado,
          cessionario: item.cessionario || null,
          preposto: item.preposto || null,
          financeiro: item.financeiro || null
        });
      });
    });

    reservas.sort((a, b) => {
      const dateA = buildReservationSortKey(a);
      const dateB = buildReservationSortKey(b);
      return dateB - dateA;
    });

    res.json({ habitacao: habSummary, reservas });
  }catch(err){
    console.error('[api/habitacoes/:id/reservas] erro GET', err);
    res.status(500).json({ error: 'Falha ao consultar reservas da habitação', detail: err.message });
  }
});

// Registrar acesso (entrada/saída) de morador para uma habitação.
app.post('/api/habitacoes/:habId/moradores/:moradorId/acesso', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const habId = String(req.params?.habId || '').trim();
    const moradorId = String(req.params?.moradorId || '').trim();
    const acao = String(req.body?.acao || req.body?.tipo || '').trim().toLowerCase();
    const ocorridoRaw = req.body?.ocorridoEm || req.body?.em || null;

    if (!habId || !moradorId) return res.status(400).json({ ok: false, error: 'Parâmetros inválidos.' });
    if (acao !== 'entrada' && acao !== 'saida' && acao !== 'saída') return res.status(400).json({ ok: false, error: 'Ação inválida.' });

    const tipo = (acao === 'entrada') ? 'MORADOR_ENTRADA' : 'MORADOR_SAIDA';
    let ocorridoEm = null;
    try {
      if (ocorridoRaw) {
        const d = new Date(String(ocorridoRaw));
        if (!Number.isNaN(d.getTime())) ocorridoEm = d;
      }
    } catch { ocorridoEm = null; }
    if (!ocorridoEm) ocorridoEm = new Date();
    const registradoEm = new Date();

    // valida vínculo
    const morador = await CondMorador.findOne({ _id: moradorId, habitacao_id: habId, ativo: { $ne: false } })
      .select('_id nome habitacao_id')
      .lean();
    if (!morador) return res.status(404).json({ ok: false, error: 'Morador não encontrado nesta habitação.' });

    const hab = await CondHabitacao.findById(habId).select('_id unidade_id numero').lean();
    if (!hab) return res.status(404).json({ ok: false, error: 'Habitação não encontrada.' });

    const actorUser = req.user || (req.session && req.session.user) || null;
    const por = actorUser
      ? {
          tipo: 'COLABORADOR',
          id: actorUser._id ? String(actorUser._id) : (actorUser.id ? String(actorUser.id) : ''),
          nome: String(actorUser.nome || actorUser.name || '').trim() || null,
          email: String(actorUser.email || '').trim() || null
        }
      : null;

    await CondAcessoMorador.create({
      unidade_id: hab?.unidade_id ? String(hab.unidade_id) : null,
      habitacaoId: String(habId),
      habitacaoNome: hab?.numero ? String(hab.numero) : null,
      moradorId: String(moradorId),
      moradorNome: String(morador?.nome || '').trim() || null,
      tipo,
      ocorridoEm,
      registradoEm,
      por
    });

    return res.json({
      ok: true,
      data: {
        habId,
        moradorId,
        tipo,
        acesso_presente: tipo === 'MORADOR_ENTRADA',
        ocorridoEm: ocorridoEm.toISOString(),
        registradoEm: registradoEm.toISOString()
      }
    });
  } catch (e) {
    console.error('[api/habitacoes/:habId/moradores/:moradorId/acesso] erro', e);
    return res.status(500).json({ ok: false, error: 'Falha ao registrar acesso do morador.' });
  }
});

app.get('/api/colaboradores', async (req, res) => {
  const rawUnidade = req.query && req.query.unidade ? String(req.query.unidade).trim() : '';
  if(!rawUnidade){
    return res.json([]);
  }
  try {
    if(mongoose.connection.readyState !== 1){
      try { res.set('Retry-After','5'); } catch(_e){}
      return res.status(503).json([]);
    }
    const unidadeId = rawUnidade;
    const funcionarios = await Funcionario.find({ unidade_id: unidadeId, ativo: { $ne: false } })
      .select('_id codigo nome nome_social nome_mae nome_pai rg cpf data_nascimento sexo estado_civil nacionalidade email telefone telefone2 whatsapp endereco unidade_id funcao_id cargo')
      .populate({ path: 'funcao_id', select: 'nome', options: { lean: true } })
      .sort({ nome: 1 })
      .lean();

    let unidadeLabel = '';
    try {
      const unidadeDoc = await unidadesReadRepoFromReq(req).findById(unidadeId, { select: 'codigo nome' });
      if(unidadeDoc){
        const codigo = unidadeDoc.codigo ? String(unidadeDoc.codigo).trim() : '';
        const nome = unidadeDoc.nome ? String(unidadeDoc.nome).trim() : '';
        unidadeLabel = [codigo, nome].filter(Boolean).join(' - ') || nome || codigo || '';
      }
    } catch(_lookupErr){ unidadeLabel = ''; }

    const formatCpf = value => {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      if(digits.length <= 3) return digits;
      if(digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
      if(digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    };

    const formatTelefone = value => {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      if(!digits) return '';
      if(digits.length < 3) return `(${digits}`;
      const ddd = digits.slice(0, 2);
      const local = digits.slice(2);
      if(!local) return `(${ddd}`;
      if(local.length <= 5) return `(${ddd}) ${local}`;
      if(local.length <= 8) return `(${ddd}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
      return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
    };

    const formatDateBr = value => {
      if(!value) return '';
      const date = value instanceof Date ? value : new Date(value);
      if(Number.isNaN(date.getTime())) return '';
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const ano = date.getFullYear();
      return `${dia}/${mes}/${ano}`;
    };

    const formatEndereco = endereco => {
      if(!endereco || typeof endereco !== 'object') return '';
      const parts = [];
      const logradouroParts = [endereco.tipo_logradouro, endereco.logradouro].filter(Boolean).map(v => String(v).trim());
      if(logradouroParts.length) parts.push(logradouroParts.join(' '));
      const numero = endereco.numero ? String(endereco.numero).trim() : '';
      if(numero) parts.push(`nº ${numero}`);
      const complemento = endereco.complemento ? String(endereco.complemento).trim() : '';
      if(complemento) parts.push(complemento);
      const bairro = endereco.bairro ? String(endereco.bairro).trim() : '';
      const cidade = endereco.cidade ? String(endereco.cidade).trim() : '';
      const estado = endereco.estado ? String(endereco.estado).trim() : '';
      const cidadeEstado = [cidade, estado].filter(Boolean).join(' - ');
      if(bairro) parts.push(bairro);
      if(cidadeEstado) parts.push(cidadeEstado);
      const cep = endereco.cep ? String(endereco.cep).replace(/\D/g, '') : '';
      if(cep){
        const cepFmt = cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
        parts.push(`CEP ${cepFmt}`);
      }
      return parts.filter(Boolean).join(', ');
    };

    const payload = funcionarios.map(func => {
      const cpfDigits = String(func.cpf || '').replace(/\D/g, '').slice(0, 11);
      const telefonePreferencial = func.telefone || func.telefone2 || '';
      const telefoneDigits = String(telefonePreferencial || '').replace(/\D/g, '').slice(0, 11);
      const dataIso = func.data_nascimento ? new Date(func.data_nascimento).toISOString() : '';
      const dataBr = func.data_nascimento ? formatDateBr(func.data_nascimento) : '';
      const endereco = formatEndereco(func.endereco || {});
      const funcaoId = func.funcao_id && typeof func.funcao_id === 'object' ? func.funcao_id._id || func.funcao_id.id || func.funcao_id : func.funcao_id;
      const funcaoNome = func.funcao_id && typeof func.funcao_id === 'object' ? func.funcao_id.nome || '' : '';
      const profissao = funcaoNome || func.cargo || '';

      const snapshot = {
        ...func,
        _id: func._id ? String(func._id) : func._id,
        unidade_id: func.unidade_id ? String(func.unidade_id) : unidadeId,
        cpf: cpfDigits,
        telefone: telefonePreferencial,
        funcao_id: funcaoId ? String(funcaoId) : funcaoId,
        funcao_nome: funcaoNome,
        profissao
      };
      return {
        _id: func._id ? String(func._id) : func._id,
        id: func._id ? String(func._id) : func._id,
        codigo: func.codigo || '',
        nome: func.nome || '',
        nome_social: func.nome_social || '',
        colaborador_label: func.codigo ? `${func.codigo} - ${func.nome}` : (func.nome || ''),
        mae: func.nome_mae || '',
        nome_mae: func.nome_mae || '',
        pai: func.nome_pai || '',
        nome_pai: func.nome_pai || '',
        rg: func.rg || '',
        cpf: cpfDigits,
        cpf_formatado: formatCpf(cpfDigits),
        data_nascimento: dataIso,
        data_nascimento_br: dataBr,
        sexo: func.sexo || '',
        estado_civil: func.estado_civil || '',
        nacionalidade: func.nacionalidade || '',
        profissao,
        funcao_id: funcaoId ? String(funcaoId) : funcaoId,
        funcao_nome: funcaoNome,
        email: func.email || '',
        telefone: telefoneDigits,
        telefone_digits: telefoneDigits,
        telefone_formatado: telefoneDigits ? formatTelefone(telefoneDigits) : formatTelefone(telefonePreferencial),
        whatsapp: typeof func.whatsapp === 'boolean' ? func.whatsapp : false,
        unidade_id: unidadeId,
        unidade_label: unidadeLabel,
        endereco,
        snapshot
      };
    });

    return res.json(payload);
  } catch (error) {
    console.error('[condominios][GET /api/colaboradores] erro', error);
    return res.status(500).json([]);
  }
});

// ======================= Pessoas (Proprietários, Moradores, Usuários) =======================
// Lista proprietários filtrados por escopo do operador e opcionalmente por unidade
async function resolveProprietarioSearchScope({ req }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
  const unitIds = (unidadesOptions || []).map(u => u._id);

  return { isAdmin, unitIds };
}

function buildProprietarioSearchFilter({ scope, unidadeParam }) {
  const filter = { ativo: { $ne: false } };

  if (unidadeParam) filter.unidade_id = unidadeParam;
  else if (!scope.isAdmin) {
    if (!scope.unitIds.length) filter._id = { $exists: false };
    else filter.unidade_id = { $in: scope.unitIds };
  }

  return filter;
}

async function readProprietarioSearchList({ filter }) {
  const props = await CondProprietario.find(filter).select('_id unidade_id cond_usuario_id usuario_id nome tipo rg cpf cnpj data_nascimento sexo pai mae contato_email contato_telefone whatsapp ativo').lean();
  if (!props.length) {
    return { props: [], cUsers: [], habs: [], moradores: [], blocos: [], andares: [] };
  }

  const cUserIds = props.map(p => p.cond_usuario_id).filter(Boolean);
  const cUsers = cUserIds.length
    ? await CondUsuario.find({ _id: { $in: cUserIds } }).select('_id email nome rg cpf data_nascimento sexo pai mae telefone whatsapp').lean()
    : [];

  const propIds = props.map(p => p._id);
  const habs = await CondHabitacao.find({ proprietario_id: { $in: propIds } }).select('_id unidade_id proprietario_id bloco_id andar_id numero tipo descricao').lean();
  const habIds = habs.map(h => h._id).filter(Boolean);
  const moradores = habIds.length
    ? await CondMorador.find({ habitacao_id: { $in: habIds }, ativo: { $ne: false } }).select('_id habitacao_id cond_usuario_id email cpf').lean()
    : [];
  const blocoIds = [...new Set(habs.map(h => h.bloco_id).filter(Boolean))];
  const andarIds = [...new Set(habs.map(h => h.andar_id).filter(Boolean))];
  const [blocos, andares] = await Promise.all([
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
  ]);

  return { props, cUsers, habs, moradores, blocos, andares };
}

function buildProprietarioSearchResponse(list) {
  if (!(list.props || []).length) return [];

  const propById = new Map((list.props || []).map(p => [String(p._id), p]));
  const cUserById = new Map((list.cUsers || []).map(u => [String(u._id), u]));
  const blocoMap = new Map((list.blocos || []).map(b => [String(b._id), b]));
  const andarMap = new Map((list.andares || []).map(a => [String(a._id), a]));
  const morByHab = new Map();

  for (const mor of (list.moradores || [])) {
    const key = String(mor.habitacao_id);
    if (!morByHab.has(key)) morByHab.set(key, []);
    morByHab.get(key).push(mor);
  }

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const normalizeCpf = value => String(value || '').replace(/\D/g, '');
  const habsPorProp = new Map();

  for (const h of (list.habs || [])) {
    const key = String(h.proprietario_id);
    if (!habsPorProp.has(key)) habsPorProp.set(key, []);

    const blocoNome = h.bloco_id ? (blocoMap.get(String(h.bloco_id))?.nome || '') : '';
    const andarNome = h.andar_id ? (andarMap.get(String(h.andar_id))?.nome || '') : '';
    const numero = h.numero || h.identificador || h.label || '';
    const parts = [blocoNome, andarNome, numero].filter(Boolean);
    let hab_label = parts.join(' - ');

    if (!hab_label) {
      const fallback = [h.tipo || '', numero || '', String(h._id || '').slice(-6)];
      hab_label = fallback.filter(Boolean).join(' - ') || String(h._id || '');
    }

    const owner = propById.get(key) || null;
    const ownerUser = owner?.cond_usuario_id ? cUserById.get(String(owner.cond_usuario_id)) || null : null;
    const ownerEmail = normalizeEmail(ownerUser?.email || owner?.contato_email || '');
    const ownerCpf = normalizeCpf(ownerUser?.cpf || owner?.cpf || '');
    const moradoresHab = morByHab.get(String(h._id)) || [];
    const ownerIsMorador = moradoresHab.some(mor => {
      if (owner?.cond_usuario_id && mor.cond_usuario_id && String(mor.cond_usuario_id) === String(owner.cond_usuario_id)) return true;
      const morEmail = normalizeEmail(mor.email);
      if (ownerEmail && morEmail && morEmail === ownerEmail) return true;
      const morCpf = normalizeCpf(mor.cpf);
      return !!(ownerCpf && morCpf && morCpf === ownerCpf);
    });

    habsPorProp.get(key).push({ unidade_id: h.unidade_id, habitacao_id: h._id, morador: ownerIsMorador, proprietario: true, hab_label });
  }

  return (list.props || []).map(p => {
    const u = p.cond_usuario_id ? cUserById.get(String(p.cond_usuario_id)) : null;

    return {
      _id: p._id,
      unidade_id: p.unidade_id,
      usuario_id: p.usuario_id || null,
      nome: (u?.nome || p.nome || ''),
      tipo: p.tipo || 'pf',
      rg: (u?.rg || p.rg || ''),
      cpf: (u?.cpf || p.cpf || ''),
      cnpj: p.cnpj || '',
      data_nascimento: (u?.data_nascimento || p.data_nascimento || null),
      sexo: (u?.sexo || p.sexo || 'N'),
      pai: (u?.pai || p.pai || ''),
      mae: (u?.mae || p.mae || ''),
      email: (u?.email || p.contato_email || ''),
      telefone: (u?.telefone || p.contato_telefone || ''),
      whatsapp: (typeof u?.whatsapp === 'boolean' ? u.whatsapp : !!p.whatsapp),
      ativo: p.ativo !== false,
      vinculos: habsPorProp.get(String(p._id)) || []
    };
  });
}

app.get('/api/proprietarios/busca', async (req, res) => {
  const { unidade } = req.query || {};
  try {
    try { res.set('Cache-Control','no-store, max-age=0, must-revalidate'); res.set('Pragma','no-cache'); res.set('Expires','0'); } catch {}
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json([]);
    }

    const scopeResolution = await resolveProprietarioSearchScope({ req });
    const filter = buildProprietarioSearchFilter({
      scope: scopeResolution,
      unidadeParam: unidade
    });
    const list = await readProprietarioSearchList({ filter });
    return res.json(buildProprietarioSearchResponse(list));
  } catch (e) {
    console.error('[api/proprietarios/busca] erro GET', e);
    return res.status(200).json([]);
  }
});

// Criar/atualizar proprietários e vincular às habitações
app.post('/api/proprietarios', express.json(), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
  const { email, nome, rg, cpf, data_nascimento, sexo, pai, mae, telefone, whatsapp, vinculos } = req.body || {};
    if (!nome) return res.status(400).json({ ok:false, error:'Nome é obrigatório' });
    const contato_email = (email||'').toString().trim().toLowerCase();
    const contato_telefone = (telefone||'').toString().replace(/\D/g,'');
    const cpfDigits = (cpf||'').toString().replace(/\D/g,'');
    // Converter data BR/ISO para Date
    let dtNasc = null;
    if (data_nascimento) {
      try {
        const s = String(data_nascimento).trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) dtNasc = new Date(+m[3], +m[2]-1, +m[1]); else dtNasc = new Date(s);
        if (isNaN(dtNasc)) dtNasc = null;
      } catch { dtNasc = null; }
    }
    const vincArr = Array.isArray(vinculos) ? vinculos : [];

    const desiredMoradorHabIds = new Set();
    let hasMoradorFlag = false;
    // Agrupa vínculos por unidade_id
    const byUnidade = new Map();
    for (const v of vincArr) {
      const uid = v && v.unidade_id ? String(v.unidade_id) : null;
      const hid = v && v.habitacao_id ? String(v.habitacao_id) : null;
      if (!uid || !hid) continue;
      if (!byUnidade.has(uid)) byUnidade.set(uid, new Set());
      byUnidade.get(uid).add(hid);
      if (v && v.morador === true) {
        hasMoradorFlag = true;
        desiredMoradorHabIds.add(hid);
      }
    }

    async function reconcileMoradoresForOwner({ condUserDoc, email, cpfDigits, keepHabSet }) {
      try {
        if (!keepHabSet || !(keepHabSet instanceof Set)) return;
        const orConditions = [];
        if (condUserDoc && condUserDoc._id) orConditions.push({ cond_usuario_id: condUserDoc._id });
        if (email) orConditions.push({ email });
        if (cpfDigits) orConditions.push({ cpf: cpfDigits });
        if (!orConditions.length) return;
        const existentes = await CondMorador.find({ $or: orConditions, ativo: { $ne: false } }).lean();
        for (const mor of existentes) {
          const hidStr = String(mor.habitacao_id || '');
          if (keepHabSet.has(hidStr)) continue;
          await CondMorador.deleteOne({ _id: mor._id });
          try { await CondHabitacao.updateOne({ _id: mor.habitacao_id }, { $pull: { moradores_ids: mor._id } }); } catch(_) {}
          try {
            if (mor.inquilino) {
              const stillHasInq = await CondMorador.exists({ habitacao_id: mor.habitacao_id, inquilino: true, ativo: { $ne: false } });
              if (!stillHasInq) {
                await CondHabitacao.updateOne({ _id: mor.habitacao_id }, { $set: { alugado: false } });
              }
            }
          } catch(_) {}
        }
      } catch(reconcileErr) {
        console.warn('[api/proprietarios] aviso ao reconciliar moradores do proprietário:', reconcileErr?.message || reconcileErr);
      }
    }
    // Cria/obtém usuário por e-mail para representar o Proprietário (e eventualmente Morador)
    // Usuário independente do módulo Condomínios
    let condUser = null;
    let portalInviteUnitId = null;
    try {
      const firstUnitId = byUnidade.size ? Array.from(byUnidade.keys())[0] : null;
      portalInviteUnitId = firstUnitId || null;
      condUser = await findOrCreateCondUsuario({
        email: contato_email,
        cpfDigits,
        unidadeId: firstUnitId || null,
        fields: { nome, rg, cpf, data_nascimento, sexo, pai, mae, telefone: contato_telefone, whatsapp }
      });
      if (condUser && !condUser.portal_password_hash) {
        try {
          await issuePortalInvite({ condUsuario: condUser, unidadeId: portalInviteUnitId || null });
        } catch (inviteErr) {
          console.warn('[api/proprietarios] falha ao enviar convite do portal:', inviteErr?.message || inviteErr);
        }
      }
    } catch (userErr) {
      console.warn('[api/proprietarios] aviso ao criar/obter usuário (Condomínios):', userErr?.message || userErr);
    }

    const createdOrUpdated = [];
    const habsToSync = new Set();
    for (const [uid, habSet] of byUnidade.entries()) {
      // Tenta localizar por unidade+email (contato)
      let propDoc = await CondProprietario.findOne({ unidade_id: uid, contato_email: contato_email });
      if (!propDoc) {
        propDoc = new CondProprietario({
          unidade_id: uid,
          cond_usuario_id: condUser?._id || null,
          tipo: 'pf',
          nome: nome,
          rg: (rg||'').toString().trim(),
          cpf: cpfDigits || '',
          cnpj: '',
          data_nascimento: dtNasc,
          sexo: (sexo||'N').toString(),
          pai: (pai||'').toString(),
          mae: (mae||'').toString(),
          contato_email,
          contato_telefone,
          whatsapp: !!whatsapp,
          ativo: true
        });
      } else {
        // Atualiza dados básicos
        propDoc.nome = nome || propDoc.nome;
        if (rg != null) propDoc.rg = String(rg).trim();
        propDoc.cpf = cpfDigits || propDoc.cpf;
        if (sexo != null) propDoc.sexo = String(sexo);
        if (pai != null) propDoc.pai = String(pai);
        if (mae != null) propDoc.mae = String(mae);
        if (contato_email) propDoc.contato_email = contato_email;
        if (contato_telefone) propDoc.contato_telefone = contato_telefone;
        if (data_nascimento !== undefined) propDoc.data_nascimento = dtNasc;
        if (whatsapp !== undefined) propDoc.whatsapp = !!whatsapp;
        propDoc.ativo = true;
        // Garante vínculo usuário_id se disponível
  // Não vincular ao usuário do Gestor; usar CondUsuario
  if (!propDoc.cond_usuario_id && condUser?._id) propDoc.cond_usuario_id = condUser._id;
      }
      // Sempre refletir dados do usuário no documento de proprietário (replicação)
      try{
        if(condUser){
          propDoc.nome = condUser.nome || propDoc.nome;
          propDoc.rg = condUser.rg || propDoc.rg;
          propDoc.cpf = condUser.cpf || propDoc.cpf;
          propDoc.data_nascimento = condUser.data_nascimento || propDoc.data_nascimento;
          propDoc.sexo = condUser.sexo || propDoc.sexo;
          propDoc.pai = condUser.pai || propDoc.pai;
          propDoc.mae = condUser.mae || propDoc.mae;
          propDoc.contato_email = condUser.email || propDoc.contato_email;
          propDoc.contato_telefone = condUser.telefone || propDoc.contato_telefone;
          propDoc.whatsapp = (typeof condUser.whatsapp==='boolean') ? condUser.whatsapp : propDoc.whatsapp;
          propDoc.cond_usuario_id = condUser._id;
        }
      } catch(_r) {}
      await propDoc.save();

      const habIdsArr = Array.from(habSet);
      habIdsArr.forEach(hid => { if (hid) habsToSync.add(String(hid)); });
      const currentHabDocs = await CondHabitacao.find({ proprietario_id: propDoc._id, unidade_id: uid }).select('_id').lean();
      const currentHabIdSet = new Set((currentHabDocs||[]).map(h => String(h._id)));
      const desiredHabIdSet = new Set(habIdsArr.map(h => String(h)));
      const toAssign = habIdsArr.filter(hid => !currentHabIdSet.has(String(hid)));
      const toRemove = [...currentHabIdSet].filter(hid => !desiredHabIdSet.has(String(hid)));
      if (toAssign.length) {
        await CondHabitacao.updateMany({ _id: { $in: toAssign }, unidade_id: uid }, { $set: { proprietario_id: propDoc._id } });
      }
      if (toRemove.length) {
        await CondHabitacao.updateMany({ _id: { $in: toRemove }, unidade_id: uid }, { $unset: { proprietario_id: 1 } });
      }
      toAssign.forEach(hid => { if (hid) habsToSync.add(String(hid)); });
      toRemove.forEach(hid => { if (hid) habsToSync.add(String(hid)); });
      // Se algum dos vínculos vier marcado como morador=true, cria/atualiza CondMorador para a(s) habitação(ões)
      try {
        if (vincArr && vincArr.length) {
          const moraHabIds = new Set(vincArr.filter(v => String(v.unidade_id)===String(uid) && v.morador === true && v.habitacao_id).map(v => String(v.habitacao_id)));
          for (const hid of moraHabIds) {
            const where = { habitacao_id: hid, ...(contato_email ? { email: contato_email } : {}) };
            let morDoc = await CondMorador.findOne(where);
            if (!morDoc) morDoc = new CondMorador({ habitacao_id: hid });
            if (uid) {
              const currentUnit = morDoc.unidade_id ? String(morDoc.unidade_id) : '';
              if (!currentUnit || currentUnit !== String(uid)) {
                morDoc.unidade_id = uid;
              }
            }
            if (condUser?._id) morDoc.cond_usuario_id = condUser._id;
            morDoc.nome = nome || morDoc.nome || (contato_email || '');
            if (rg != null) morDoc.rg = String(rg).trim() || morDoc.rg;
            if (cpfDigits) morDoc.cpf = cpfDigits;
            if (dtNasc !== undefined) morDoc.data_nascimento = dtNasc;
            if (sexo != null) morDoc.sexo = String(sexo);
            if (contato_email) morDoc.email = contato_email;
            if (contato_telefone) morDoc.telefone = contato_telefone;
            if (whatsapp !== undefined) morDoc.whatsapp = !!whatsapp;
            morDoc.inquilino = false; // proprietário morador não é inquilino
            morDoc.ativo = true;
            await morDoc.save();
            // Sincroniza referência na habitação
            try { await CondHabitacao.updateOne({ _id: hid }, { $addToSet: { moradores_ids: morDoc._id } }); } catch(_u) {}
          }
        }
      } catch(mErr) {
        console.warn('[api/proprietarios] aviso ao upsert morador para proprietário-morador:', mErr?.message || mErr);
      }
      createdOrUpdated.push({ _id: propDoc._id, unidade_id: uid, contato_email, nome: propDoc.nome });
    }

    if (hasMoradorFlag) {
      await reconcileMoradoresForOwner({ condUserDoc: condUser, email: contato_email, cpfDigits, keepHabSet: desiredMoradorHabIds });
    }

    // Best-effort: refletir mudanças na caixa vinculada da habitação.
    try { habsToSync.forEach(hid => { void syncHabPublicMailboxForHabitacaoId(hid).catch(() => {}); }); } catch {}

    return res.json({ ok:true, proprietarios: createdOrUpdated });
  } catch (e) {
    console.error('[api/proprietarios] erro POST', e);
    return res.status(500).json({ ok:false, error:'Falha ao salvar proprietário' });
  }
});

// Atualizar dados básicos do proprietário
app.put('/api/proprietarios/:id', express.json(), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const id = req.params.id;
  const { nome, rg, cpf, data_nascimento, sexo, pai, mae, contato_email, contato_telefone, whatsapp, ativo } = req.body || {};
    const upd = {};
    if (nome != null) upd.nome = String(nome).trim();
    if (rg != null) upd.rg = String(rg).trim();
    if (cpf != null) upd.cpf = String(cpf).replace(/\D/g,'');
  if (sexo != null) upd.sexo = String(sexo);
  if (pai != null) upd.pai = String(pai);
  if (mae != null) upd.mae = String(mae);
    if (data_nascimento != null) {
      let dt = null; try {
        const s = String(data_nascimento).trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) dt = new Date(+m[3], +m[2]-1, +m[1]); else dt = new Date(s);
        if (isNaN(dt)) dt = null;
      } catch { dt = null; }
      upd.data_nascimento = dt;
    }
    if (contato_email != null) upd.contato_email = String(contato_email).trim().toLowerCase();
    if (contato_telefone != null) upd.contato_telefone = String(contato_telefone).replace(/\D/g,'');
  if (whatsapp != null) upd.whatsapp = !!whatsapp;
    if (ativo != null) upd.ativo = !!ativo;
    const doc = await CondProprietario.findByIdAndUpdate(id, { $set: upd }, { new: true });
    // Atualiza também o usuário do módulo Condomínios vinculado (ou pelo e-mail de contato)
    try {
      let cuser = null;
      if (doc && doc.cond_usuario_id) cuser = await CondUsuario.findById(doc.cond_usuario_id);
      if (!cuser && (upd.contato_email || doc?.contato_email)) cuser = await CondUsuario.findOne({ email: (upd.contato_email||doc.contato_email||'').toString().toLowerCase() });
      if (cuser) {
        await updateUserPersonalFields(cuser, {
          nome: upd.nome,
          rg: upd.rg,
          cpf: upd.cpf,
          data_nascimento: req.body?.data_nascimento,
          sexo: upd.sexo,
          pai: upd.pai,
          mae: upd.mae,
          telefone: upd.contato_telefone,
          whatsapp: req.body?.whatsapp
        });
      }
    } catch(_e) {}

    // Best-effort: mudança do proprietário pode alterar membros/admin.
    try {
      const habs = await CondHabitacao.find({ proprietario_id: id }).select('_id').lean();
      (habs || []).forEach(h => { void syncHabPublicMailboxForHabitacaoId(h?._id).catch(() => {}); });
    } catch {}

    return res.json({ ok:true, proprietario: doc?.toObject ? doc.toObject() : doc });
  } catch (e) {
    console.error('[api/proprietarios/:id] erro PUT', e);
    return res.status(500).json({ ok:false, error:'Falha ao atualizar proprietário' });
  }
});

// Remover proprietário (soft ou hard delete) e desvincular de habitações
app.delete('/api/proprietarios/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const id = req.params.id;
    const hard = String(req.query.hard||'').trim()==='1' || String(req.headers['x-hard-delete']||'').trim()==='1';
    if(hard){
      await CondProprietario.deleteOne({ _id: id });
    } else {
      await CondProprietario.findByIdAndUpdate(id, { $set: { ativo: false } });
    }
    const affected = await CondHabitacao.find({ proprietario_id: id }).select('_id').lean();
    await CondHabitacao.updateMany({ proprietario_id: id }, { $unset: { proprietario_id: 1 } });
    try { (affected || []).forEach(h => { void syncHabPublicMailboxForHabitacaoId(h?._id).catch(() => {}); }); } catch {}
    return res.json({ ok:true, hard: !!hard });
  } catch (e) {
    console.error('[api/proprietarios/:id] erro DELETE', e);
    return res.status(500).json({ ok:false, error:'Falha ao remover proprietário' });
  }
});

// Desvincular proprietário de uma habitação específica
app.delete('/api/proprietarios/:id/habitacoes/:habId', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const id = req.params.id;
    const habId = req.params.habId;
    await CondHabitacao.updateOne({ _id: habId, proprietario_id: id }, { $unset: { proprietario_id: 1 } });
    try { await syncHabPublicMailboxForHabitacaoId(habId); } catch {}
    return res.json({ ok:true });
  } catch (e) {
    console.error('[api/proprietarios/:id/habitacoes/:habId] erro DELETE', e);
    return res.status(500).json({ ok:false, error:'Falha ao desvincular habitação' });
  }
});

// Lista moradores filtrados pelo escopo do operador e opcionalmente por unidade
async function resolveMoradorSearchScope({ req }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
  const unitIds = (unidadesOptions || []).map(u => u._id);

  return { isAdmin, unitIds };
}

function buildMoradorSearchHabitacaoFilter({ scope, unidadeParam }) {
  const filter = {};

  if (unidadeParam) filter.unidade_id = unidadeParam;
  else if (!scope.isAdmin) {
    if (!scope.unitIds.length) filter._id = { $exists: false };
    else filter.unidade_id = { $in: scope.unitIds };
  }

  return filter;
}

async function readMoradorSearchList({ filterHab }) {
  const habs = await CondHabitacao.find(filterHab).select('_id unidade_id bloco_id andar_id numero tipo').lean();
  const habIds = habs.map(h => h._id);
  if (!habIds.length) {
    return { habs: [], blocos: [], andares: [], moradores: [], cUsers: [] };
  }

  const blocoIds = [...new Set(habs.map(h => h.bloco_id).filter(Boolean))];
  const andarIds = [...new Set(habs.map(h => h.andar_id).filter(Boolean))];
  const [blocos, andares, moradores] = await Promise.all([
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : [],
    CondMorador.find({ habitacao_id: { $in: habIds }, ativo: { $ne: false } })
      .select('_id cond_usuario_id usuario_id nome rg cpf data_nascimento sexo telefone email pai mae whatsapp responsavel_email responsavel_nome inquilino ativo habitacao_id')
      .lean()
  ]);
  const cUserIds = moradores.map(m => m.cond_usuario_id).filter(Boolean);
  const cUsers = cUserIds.length
    ? await CondUsuario.find({ _id: { $in: cUserIds } }).select('_id email nome rg cpf data_nascimento sexo telefone pai mae whatsapp').lean()
    : [];

  return { habs, blocos, andares, moradores, cUsers };
}

function buildMoradorSearchResponse(list) {
  const blocoMap = new Map((list.blocos || []).map(b => [String(b._id), b]));
  const andarMap = new Map((list.andares || []).map(a => [String(a._id), a]));
  const habById = new Map((list.habs || []).map(h => [String(h._id), h]));
  const cUserById = new Map((list.cUsers || []).map(u => [String(u._id), u]));
  const unidadePorHab = new Map((list.habs || []).map(h => [String(h._id), h.unidade_id]));

  return (list.moradores || []).map(m => {
    const u = m.cond_usuario_id ? cUserById.get(String(m.cond_usuario_id)) : null;
    const uid = unidadePorHab.get(String(m.habitacao_id)) || null;
    const h = habById.get(String(m.habitacao_id)) || null;
    let hab_label = '';

    if (h) {
      const blocoNome = h.bloco_id ? (blocoMap.get(String(h.bloco_id))?.nome || '') : '';
      const andarNome = h.andar_id ? (andarMap.get(String(h.andar_id))?.nome || '') : '';
      const numero = h.numero || '';
      hab_label = [blocoNome, andarNome, numero].filter(Boolean).join(' - ');
    }

    return {
      _id: m._id,
      unidade_id: m.unidade_id || uid,
      usuario_id: m.usuario_id || null,
      nome: (u?.nome || m.nome || ''),
      rg: (u?.rg || m.rg || ''),
      cpf: (u?.cpf || m.cpf || ''),
      data_nascimento: (u?.data_nascimento || m.data_nascimento || null),
      sexo: (u?.sexo || m.sexo || 'N'),
      telefone: (u?.telefone || m.telefone || ''),
      email: (u?.email || m.email || ''),
      pai: (u?.pai || m.pai || ''),
      mae: (u?.mae || m.mae || ''),
      whatsapp: (typeof u?.whatsapp === 'boolean' ? u.whatsapp : !!m.whatsapp),
      responsavel_email: m.responsavel_email || '',
      responsavel_nome: m.responsavel_nome || '',
      inquilino: !!m.inquilino,
      ativo: m.ativo !== false,
      vinculos: [{ unidade_id: uid, habitacao_id: m.habitacao_id, morador: true, inquilino: !!m.inquilino, hab_label }]
    };
  });
}

app.get('/api/moradores/busca', async (req, res) => {
  const { unidade } = req.query || {};
  try {
    try { res.set('Cache-Control','no-store, max-age=0, must-revalidate'); res.set('Pragma','no-cache'); res.set('Expires','0'); } catch {}
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json([]);
    }

    const scopeResolution = await resolveMoradorSearchScope({ req });
    const filterHab = buildMoradorSearchHabitacaoFilter({
      scope: scopeResolution,
      unidadeParam: unidade
    });
    const list = await readMoradorSearchList({ filterHab });
    return res.json(buildMoradorSearchResponse(list));
  } catch (e) {
    console.error('[api/moradores/busca] erro GET', e);
    return res.status(200).json([]);
  }
});

// Criar/atualizar moradores (um documento por habitação vinculada)
app.post('/api/moradores', express.json(), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const {
      email,
      nome,
      rg,
      cpf,
      data_nascimento,
      sexo,
      telefone,
      pai,
      mae,
      whatsapp,
      responsavel_email,
      responsavel_nome,
      unidade_id,
      vinculos
    } = req.body || {};

    if (!nome) return res.status(400).json({ ok:false, error:'Nome é obrigatório' });
    const emailNorm = (email||'').toString().trim().toLowerCase();
    const telDigits = (telefone||'').toString().replace(/\D/g,'');
    const cpfDigits = (cpf||'').toString().replace(/\D/g,'');
    // Converter data BR/ISO para Date
    let dt = null;
    if (data_nascimento) {
      try {
        const s = String(data_nascimento).trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) dt = new Date(+m[3], +m[2]-1, +m[1]); else dt = new Date(s);
        if (isNaN(dt)) dt = null;
      } catch { dt = null; }
    }
    const vincArr = Array.isArray(vinculos) ? vinculos : [];
    if (!vincArr.length) return res.status(400).json({ ok:false, error:'Informe ao menos uma habitação' });

    const unidadeSelecionada = unidade_id ? String(unidade_id) : null;
    const habIds = [...new Set(vincArr.map(v => v && v.habitacao_id ? String(v.habitacao_id) : null).filter(Boolean))];
    let habUnitMap = new Map();
    if (habIds.length) {
      try {
        const habDocs = await CondHabitacao.find({ _id: { $in: habIds } }).select('_id unidade_id').lean();
        habUnitMap = new Map((habDocs||[]).map(h => [String(h._id), h.unidade_id || null]));
      } catch(_mapErr) {
        habUnitMap = new Map();
      }
    }

    // Tentar relacionar a um usuário existente pelo e-mail; se não existir, criar automaticamente usando a unidade da primeira habitação
  let condUserId = null;
  let condUserDoc = null;
  let portalInviteUnitId = unidadeSelecionada || null;
    try {
      if (emailNorm) {
        // Detectar unidade_id a partir da primeira habitação do vínculo ou do payload principal
        let unitRef = unidadeSelecionada || null;
        if (!unitRef && vincArr.length) {
          const firstHabId = vincArr.find(v => v && v.habitacao_id)?.habitacao_id ? String(vincArr.find(v => v && v.habitacao_id).habitacao_id) : null;
          if (firstHabId) {
            unitRef = habUnitMap.get(firstHabId) || (vincArr.find(v => String(v.habitacao_id) === firstHabId)?.unidade_id) || null;
          }
        }
        portalInviteUnitId = unitRef || unidadeSelecionada || null;
        condUserDoc = await findOrCreateCondUsuario({
          email: emailNorm,
          cpfDigits,
          unidadeId: unitRef || null,
          fields: { nome, rg, cpf, data_nascimento, sexo, pai, mae, telefone: telDigits, whatsapp }
        });
        condUserId = condUserDoc?._id || null;
        if (condUserDoc && !condUserDoc.portal_password_hash) {
          try {
            await issuePortalInvite({ condUsuario: condUserDoc, unidadeId: portalInviteUnitId || null });
          } catch (inviteErr) {
            console.warn('[api/moradores] falha ao enviar convite do portal:', inviteErr?.message || inviteErr);
          }
        }
      }
    } catch (e) {}

    const saved = [];
    for (const v of vincArr) {
      const hid = v && v.habitacao_id ? String(v.habitacao_id) : null;
      if (!hid) continue;
      // Upsert por (habitacao_id + email|cpf)
      const where = { habitacao_id: hid };
      if (emailNorm) where.email = emailNorm; else if (cpfDigits) where.cpf = cpfDigits;
      let doc = await CondMorador.findOne(where);
      if (!doc) {
        doc = new CondMorador({ habitacao_id: hid });
      }
      const habUnidade = habUnitMap.get(hid) || (v && v.unidade_id ? String(v.unidade_id) : null) || unidadeSelecionada;
      if (habUnidade) {
        const currentUnit = doc.unidade_id ? String(doc.unidade_id) : '';
        if (!currentUnit || currentUnit !== String(habUnidade)) {
          doc.unidade_id = habUnidade;
        }
      }
      doc.cond_usuario_id = condUserId || doc.cond_usuario_id || null;
      doc.nome = nome || doc.nome;
      if (rg != null) doc.rg = String(rg).trim();
      if (cpfDigits) doc.cpf = cpfDigits;
      doc.data_nascimento = dt;
      doc.sexo = (sexo||doc.sexo||'N');
  if (telDigits) doc.telefone = telDigits;
      if (emailNorm) doc.email = emailNorm;
  if (pai != null) doc.pai = String(pai);
  if (mae != null) doc.mae = String(mae);
  if (whatsapp !== undefined) doc.whatsapp = !!whatsapp;
  if (responsavel_email != null) doc.responsavel_email = String(responsavel_email).trim().toLowerCase();
  if (responsavel_nome != null) doc.responsavel_nome = String(responsavel_nome);
      doc.inquilino = !!(v && v.inquilino);
        doc.ativo = true;
        await doc.save();
      // Sincroniza referência na habitação
      try {
        await CondHabitacao.updateOne({ _id: hid }, { $addToSet: { moradores_ids: doc._id }, ...(doc.inquilino ? { $set: { alugado: true } } : {}) });
      } catch(_e) {}
      saved.push({ _id: doc._id, habitacao_id: doc.habitacao_id, unidade_id: doc.unidade_id || null, email: doc.email, nome: doc.nome });
    }

    // Best-effort: manter membros da caixa da habitação sincronizados.
    try {
      const habTouched = new Set(saved.map(s => String(s.habitacao_id || '')).filter(Boolean));
      habTouched.forEach(hid => { void syncHabPublicMailboxForHabitacaoId(hid).catch(() => {}); });
    } catch {}

    return res.json({ ok:true, moradores: saved });
  } catch (e) {
    console.error('[api/moradores] erro POST', e);
    return res.status(500).json({ ok:false, error:'Falha ao salvar morador' });
  }
});

// Atualizar dados do morador
app.put('/api/moradores/:id', express.json(), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
  const id = req.params.id;
  const { nome, rg, cpf, data_nascimento, sexo, telefone, email, pai, mae, whatsapp, responsavel_email, responsavel_nome, inquilino, ativo, unidade_id } = req.body || {};
    const upd = {};
    if (nome != null) upd.nome = String(nome).trim();
  if (rg != null) upd.rg = String(rg).trim();
    if (cpf != null) upd.cpf = String(cpf).replace(/\D/g,'');
    if (data_nascimento != null) {
      let dt = null; try {
        const s = String(data_nascimento).trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) dt = new Date(+m[3], +m[2]-1, +m[1]); else dt = new Date(s);
        if (isNaN(dt)) dt = null;
      } catch { dt = null; }
      upd.data_nascimento = dt;
    }
    if (sexo != null) upd.sexo = String(sexo);
    if (telefone != null) upd.telefone = String(telefone).replace(/\D/g,'');
    if (email != null) upd.email = String(email).trim().toLowerCase();
  if (pai != null) upd.pai = String(pai);
  if (mae != null) upd.mae = String(mae);
  if (whatsapp != null) upd.whatsapp = !!whatsapp;
  if (responsavel_email != null) upd.responsavel_email = String(responsavel_email).trim().toLowerCase();
  if (responsavel_nome != null) upd.responsavel_nome = String(responsavel_nome);
    if (inquilino != null) upd.inquilino = !!inquilino;
    if (unidade_id != null) upd.unidade_id = unidade_id || null;
    if (ativo != null) upd.ativo = !!ativo;
    const doc = await CondMorador.findByIdAndUpdate(id, { $set: upd }, { new: true });
    // Atualiza também o CondUsuario vinculado (ou localizado pelo e-mail informado)
    try {
      let cuser = null;
      if (doc && doc.cond_usuario_id) cuser = await CondUsuario.findById(doc.cond_usuario_id);
      if (!cuser && (upd.email || doc?.email)) cuser = await CondUsuario.findOne({ email: (upd.email||doc.email||'').toString().toLowerCase() });
      if (cuser) {
        if (unidade_id !== undefined) {
          cuser.unidade_id = unidade_id || null;
        }
        await updateUserPersonalFields(cuser, {
          nome: upd.nome,
          rg: upd.rg,
          cpf: upd.cpf,
          data_nascimento: req.body?.data_nascimento,
          sexo: upd.sexo,
          pai: upd.pai,
          mae: upd.mae,
          telefone: upd.telefone,
          whatsapp: req.body?.whatsapp
        });
      }
    } catch(_e) {}

    // Best-effort: mudança de morador pode afetar membros/admin.
    try {
      const habId = doc?.habitacao_id ? String(doc.habitacao_id) : '';
      if (habId) await syncHabPublicMailboxForHabitacaoId(habId);
    } catch {}

    return res.json({ ok:true, morador: doc?.toObject ? doc.toObject() : doc });
  } catch (e) {
    console.error('[api/moradores/:id] erro PUT', e);
    return res.status(500).json({ ok:false, error:'Falha ao atualizar morador' });
  }
});

// Remover morador (soft delete)
app.delete('/api/moradores/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const id = req.params.id;
    const hard = String(req.query.hard||'').trim() === '1' || String(req.headers['x-hard-delete']||'').trim() === '1';
    // Obter doc antes para sincronização posterior
    const before = await CondMorador.findById(id).lean();
    if(!before){ return res.json({ ok:true, missing:true }); }
    if(hard){
      await CondMorador.deleteOne({ _id: id });
    } else {
      await CondMorador.findByIdAndUpdate(id, { $set: { ativo: false } }, { new: false }).lean();
    }
    // Retirar vínculo em moradores_ids na habitação
    try { if(before && before.habitacao_id){ await CondHabitacao.updateOne({ _id: before.habitacao_id }, { $pull: { moradores_ids: before._id } }); } } catch(_e) {}
    // Se era inquilino, reavaliar flag alugado considerando inquilinos ativos restantes
    try {
      if(before && before.habitacao_id && before.inquilino){
        const stillHasInq = await CondMorador.exists({ habitacao_id: before.habitacao_id, inquilino: true, ativo: { $ne: false } });
        if(!stillHasInq){ await CondHabitacao.updateOne({ _id: before.habitacao_id }, { $set: { alugado: false } }); }
      }
    } catch(_e) {}
    // Best-effort: remoção afeta membros.
    try {
      const habId = before?.habitacao_id ? String(before.habitacao_id) : '';
      if (habId) await syncHabPublicMailboxForHabitacaoId(habId);
    } catch {}
    return res.json({ ok:true, hard: !!hard });
  } catch (e) {
    console.error('[api/moradores/:id] erro DELETE', e);
    return res.status(500).json({ ok:false, error:'Falha ao remover morador' });
  }
});

// Lista usuários (Gestor) enriquecidos com papéis no módulo a partir de vínculos no banco (proprietário/morador)
app.get('/api/usuarios/busca', async (req, res) => {
  try {
    // Evita cache do navegador/edge que pode devolver 304 e quebrar o fetch do front
    try {
      res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } catch {}
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json([]);
    }
    let habs = [];
    let habsMor = [];
    const ctxUser = getCtxUser(req);
    const { existingUsers } = await carregarExistingUsers(ctxUser);
    if (!existingUsers || !existingUsers.length) return res.json([]);
    const userIds = existingUsers.map(u => u._id).filter(Boolean);
    // Mapear papéis via coleções do módulo
    let props = [];
    let moras = [];
      const habsByProp = new Map();
    try {
      props = await CondProprietario.find({ usuario_id: { $in: userIds } }).select('_id usuario_id unidade_id').lean();
    } catch {}
    try {
      moras = await CondMorador.find({ usuario_id: { $in: userIds }, ativo: { $ne: false } }).select('_id usuario_id habitacao_id inquilino').lean();
    } catch {}
      const unidadeByHab = new Map();
      const habById = new Map();
      for (const h of habsMor) {
        unidadeByHab.set(String(h._id), h.unidade_id || null);
        habById.set(String(h._id), h);
      }

      // Carregar nomes de bloco/andar para compor rótulo
      try {
        const blocoIds = [
          ...new Set([
            ...habs.map(h => String(h.bloco_id || '')).filter(Boolean),
            ...habsMor.map(h => String(h.bloco_id || '')).filter(Boolean)
          ])
        ];
        const andarIds = [
          ...new Set([
            ...habs.map(h => String(h.andar_id || '')).filter(Boolean),
            ...habsMor.map(h => String(h.andar_id || '')).filter(Boolean)
          ])
        ];
        const [blocos, andares] = await Promise.all([
          blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
          andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
        ]);
        var blocoMap = new Map((blocos||[]).map(b => [String(b._id), b]));
        var andarMap = new Map((andares||[]).map(a => [String(a._id), a]));
        var buildHabLabel = function(h){
          if(!h) return '';
          const blocoNome = h.bloco_id ? (blocoMap.get(String(h.bloco_id))?.nome || '') : '';
          const andarNome = h.andar_id ? (andarMap.get(String(h.andar_id))?.nome || '') : '';
          const tipo = h.tipo || '';
          const numero = h.numero || '';
          return [blocoNome, andarNome, tipo, numero].filter(Boolean).join(' - ');
        };

        // Montar resultado final
        const result = existingUsers.map(u => {
          const uid = String(u._id||'');
          const userProps = propByUser.get(uid) || [];
          const userMoras = moraByUser.get(uid) || [];
          const perms = [];
          if (userProps.length) perms.push('Prop');
          if (userMoras.length) perms.push('Mora');
          const vinculos = [];
          for (const p of userProps) {
            const hs = habsByProp.get(String(p._id)) || [];
            for (const h of hs) vinculos.push({ unidade_id: h.unidade_id, habitacao_id: String(h._id), morador: false, proprietario: true, hab_label: buildHabLabel(h) });
          }
          for (const m of userMoras) {
            const h = habById.get(String(m.habitacao_id)) || null;
            const uId = h ? (h.unidade_id || null) : (unidadeByHab.get(String(m.habitacao_id)) || null);
            vinculos.push({ unidade_id: uId, habitacao_id: String(m.habitacao_id), morador: true, inquilino: !!m.inquilino, hab_label: buildHabLabel(h) });
          }
          return {
            _id: u._id || null,
            email: (u.email||'').toLowerCase(),
            nome: u.nome || '',
            foto: u.foto || '',
            role: u.role || u.nivel || '',
            unidade_id: u.unidade_id || null,
            is_funcionario: !!u.isFuncionario,
            perms,
            vinculos
          };
        });
        return res.json(result);
      } catch(_comp){ /* fallback para caso de falha na composição */ }
      // fallback (sem labels)
      const responsavelIds = new Set();
      const collectResp = (contrato) => {
        if(contrato && contrato.responsavel_morador_id){ responsavelIds.add(String(contrato.responsavel_morador_id)); }
      };
      [...habs, ...habsMor].forEach(h => {
        if(!h) return;
        collectResp(h.contrato_locacao);
        if(Array.isArray(h.contratos_locacao)) h.contratos_locacao.forEach(collectResp);
      });
      const result = existingUsers.map(u => {
        const uid = String(u._id||'');
        const userProps = propByUser.get(uid) || [];
        const userMoras = moraByUser.get(uid) || [];
        const perms = [];
        if (userProps.length) perms.push('Prop');
        if (userMoras.length) perms.push('Mora');
        if (userMoras.some(m => responsavelIds.has(String(m._id)))) perms.push('resp');
        const vinculos = [];
        for (const p of userProps) {
          const hs = habsByProp.get(String(p._id)) || [];
          for (const h of hs) vinculos.push({ unidade_id: h.unidade_id, habitacao_id: String(h._id), morador: false, proprietario: true });
        }
        for (const m of userMoras) {
          const uId = unidadeByHab.get(String(m.habitacao_id)) || null;
          vinculos.push({ unidade_id: uId, habitacao_id: String(m.habitacao_id), morador: true, inquilino: !!m.inquilino });
        }
        return { _id: u._id || null, email: (u.email||'').toLowerCase(), nome: u.nome || '', foto: u.foto || '', role: u.role || u.nivel || '', unidade_id: u.unidade_id || null, is_funcionario: !!u.isFuncionario, perms, vinculos };
      });
      return res.json(result);
  } catch (e) {
    console.error('[api/usuarios/busca] erro GET', e);
    res.status(200).json([]);
  }
});

// ======================= Vagas de Garagem =======================
// Listar vagas (busca enriquecida simples)
async function resolveGarageSearchScope({ req, unidadeParam }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');

  if (isAdmin) {
    return { unidadeFilter: unidadeParam || null };
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const allowed = (unidadesOptions || []).map(u => String(u._id));
  if (!allowed.length) {
    return { empty: true };
  }

  if (unidadeParam) {
    if (!allowed.includes(String(unidadeParam))) {
      return { error: { status: 403, body: { success: false, error: 'Unidade fora do escopo do usuário' } } };
    }
    return { unidadeFilter: unidadeParam };
  }

  return { unidadeFilter: { $in: allowed } };
}

function buildGarageSearchFilter({ unidadeFilter, nome }) {
  const filter = {};

  if (unidadeFilter) filter.unidade_id = unidadeFilter;
  if (nome) filter.nome = { $regex: nome, $options: 'i' };

  return filter;
}

async function readGarageSearchList({ req, filter }) {
  const vagas = await CondVagaGaragem.find(filter).lean();
  const unitIds = [...new Set(vagas.map(v => v.unidade_id).filter(Boolean))];
  const unidades = unitIds.length
    ? await unidadesReadRepoFromReq(req).find({ _id: { $in: unitIds } }, { select: '_id codigo nome' })
    : [];

  return { vagas, unidades };
}

function buildGarageSearchResponse(list) {
  const unidadeMap = new Map((list.unidades || []).map(u => [String(u._id), u]));
  return (list.vagas || []).map(v => ({
    _id: v._id,
    unidade_id: v.unidade_id || null,
    unidade: unidadeMap.get(String(v.unidade_id)) || { _id: v.unidade_id },
    nome: v.nome,
    link_type: v.link_type || '',
    link_id: v.link_id || null,
    obs: v.obs || '',
    foto: v.foto || ''
  }));
}

app.get('/api/garagens/busca', async (req, res) => {
  const { unidade, nome } = req.query || {};
  try {
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json([]);
    }

    const scopeResolution = await resolveGarageSearchScope({ req, unidadeParam: unidade });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (scopeResolution.empty) {
      return res.json([]);
    }

    const filter = buildGarageSearchFilter({
      unidadeFilter: scopeResolution.unidadeFilter,
      nome
    });
    const list = await readGarageSearchList({ req, filter });
    return res.json(buildGarageSearchResponse(list));
  } catch(e){ console.error('[api/garagens/busca] erro GET', e); return res.status(200).json([]); }
});

const garagemFotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!file || !file.mimetype) return cb(null, true);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', String(file.fieldname || 'foto')));
  }
});

function parseGaragemBody(req, res, next) {
  try {
    if (req && typeof req.is === 'function' && req.is('multipart/form-data')) {
      return garagemFotoUpload.single('foto')(req, res, (err) => {
        if (!err) return next();

        const msg = err && err.code === 'LIMIT_FILE_SIZE'
          ? 'Imagem muito grande (limite 2MB)'
          : 'Imagem inválida. Use PNG, JPG, JPEG ou WEBP.';

        return res.status(err && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
      });
    }

    return express.json({ limit: '2mb' })(req, res, next);
  } catch (_e) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
}

async function uploadGaragemFotoFile(file) {
  if (!file || !file.buffer) return '';

  const mime = String(file.mimetype || '').toLowerCase();
  const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  if (!allowed.has(mime)) {
    const err = new Error('Tipo não suportado');
    err.status = 400;
    throw err;
  }

  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp'
  };

  const ext = extMap[mime] || 'bin';
  const fileName = `garagens/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';

  const uploaded = await put(fileName, file.buffer, {
    access: 'public',
    contentType: mime,
    cacheControl: 'public, max-age=31536000, immutable',
    ...(blobToken ? { token: blobToken } : {})
  });

  return uploaded.url;
}

// Criar vaga
app.post('/api/garagens', parseGaragemBody, async (req, res) => {
  try {
    const { unidade_id, nome, link_type, link_id, obs, foto } = req.body || {};
    if(!unidade_id || !nome) return res.status(400).json({ error: 'unidade_id e nome são obrigatórios' });

    let fotoUrl=''; let blobFailed=false; let blobMissingToken=false; let blobTried=false;

    if (req.file) {
      blobTried = true;
      try {
        fotoUrl = await uploadGaragemFotoFile(req.file);
      } catch (e) {
        console.error('[api/garagens] POST upload blob erro', e);
        blobFailed = true;
        if (e && /No token found/i.test(e.message || '')) blobMissingToken = true;
      }
    } else if(typeof foto === 'string' && foto.startsWith('data:')){
      if(foto.length > 2_000_000) return res.status(413).json({ error: 'Imagem muito grande (~2MB limite)' });
      blobTried=true;
      try{
        const match = /^data:(.+?);base64,(.+)$/.exec(foto);
        if(!match) return res.status(400).json({ error: 'Formato de imagem inválido (data URL)' });
        const mime = match[1]; const b64 = match[2];
        const allowed = ['image/png','image/jpeg','image/jpg','image/webp'];
        if(!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
        const buf = Buffer.from(b64,'base64');
        const extMap = { 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext = extMap[mime]||'bin';
        const fileName = `garagens/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
        const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
        fotoUrl = uploaded.url;
      }catch(e){
        console.error('[api/garagens] erro upload blob', e);
        blobFailed=true;
        if(e && /No token found/i.test(e.message||'')) blobMissingToken=true;
      }
    }

    const doc = await CondVagaGaragem.create({
      unidade_id,
      nome: String(nome).trim(),
      link_type: link_type||'',
      link_id: link_id||null,
      obs: (obs||'').toString(),
      foto: fotoUrl
    });

    const plain = doc.toObject();
    res.status(201).json({
      ...plain,
      foto_saved: !!plain.foto,
      blob_tried: blobTried,
      blob_failed: blobFailed,
      blob_missing_token: blobMissingToken
    });
  } catch(e){
    console.error('[api/garagens] POST erro', e);
    res.status(500).json({ error:'Falha ao criar vaga', detail: e.message });
  }
});

// Atualizar vaga
app.put('/api/garagens/:id', parseGaragemBody, async (req, res) => {
  try{
    const id = req.params.id; const { unidade_id, nome, link_type, link_id, obs, foto } = req.body || {};
    const upd = {};
    if(unidade_id!=null) upd.unidade_id = unidade_id;
    if(nome!=null) upd.nome = String(nome).trim();
    if(link_type!==undefined) upd.link_type = link_type||'';
    if(link_id!==undefined) upd.link_id = link_id||null;
    if(obs!=null) upd.obs = String(obs);
    let blobFailed=false; let blobMissingToken=false; let blobTried=false;

    if(req.file){
      blobTried = true;
      try{
        const atual = await CondVagaGaragem.findById(id).select('foto').lean();
        upd.foto = await uploadGaragemFotoFile(req.file);

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
        if(process.env.ENABLE_DELETE_OLD_BLOB === '1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)){
          try{ await del(atual.foto, blobToken ? { token: blobToken } : undefined); }catch(_e){}
        }
      }catch(e){
        console.error('[api/garagens] PUT upload blob erro', e);
        blobFailed = true;
        if(e && /No token found/i.test(e.message || '')) blobMissingToken = true;
      }
    } else if(foto!==undefined){
      if(foto==='' || foto===null){ upd.foto=''; }
      else if(typeof foto==='string' && foto.startsWith('data:')){
        if(foto.length > 2_000_000) return res.status(413).json({ error:'Imagem muito grande (~2MB limite)' });
        blobTried=true;
        try{
          const atual = await CondVagaGaragem.findById(id).select('foto').lean();
          const match = /^data:(.+?);base64,(.+)$/.exec(foto);
          if(!match) return res.status(400).json({ error:'Formato imagem inválido' });
          const mime = match[1]; const b64 = match[2]; const allowed=['image/png','image/jpeg','image/jpg','image/webp'];
          if(!allowed.includes(mime)) return res.status(400).json({ error:'Tipo não suportado' });
          const buf = Buffer.from(b64,'base64'); const extMap={ 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext=extMap[mime]||'bin';
          const fileName = `garagens/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
          const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
          upd.foto = uploaded.url;
          if(process.env.ENABLE_DELETE_OLD_BLOB==='1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)){
            try{ await del(atual.foto, blobToken?{token:blobToken}:undefined); }catch(_e){}
          }
        }catch(e){ console.error('[api/garagens] PUT upload blob erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
      } else if(/^https?:\/\//.test(foto)){ upd.foto=foto; }
      else { return res.status(400).json({ error:'Foto deve ser data URL ou URL http(s)' }); }
    }
    const doc = await CondVagaGaragem.findByIdAndUpdate(id, { $set: upd }, { new:true }).lean();
    res.json({ ...doc, foto_saved: !!(doc&&doc.foto), blob_tried: blobTried, blob_failed: blobFailed, blob_missing_token: blobMissingToken });
  }catch(e){ console.error('[api/garagens] PUT erro', e); res.status(500).json({ error:'Falha ao atualizar vaga', detail:e.message }); }
});

// Excluir vaga
app.delete('/api/garagens/:id', async (req, res) => {
  try{ await CondVagaGaragem.findByIdAndDelete(req.params.id); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ error:'Falha ao excluir vaga' }); }
});

// ======================= Áreas Comuns =======================
const AREA_WEEKDAYS = [
  { id: 'sunday', index: 0, label: 'Domingo', aliases: ['0','dom','domingo','sun','sunday'] },
  { id: 'monday', index: 1, label: 'Segunda-feira', aliases: ['1','seg','segunda','segunda-feira','mon','monday'] },
  { id: 'tuesday', index: 2, label: 'Terça-feira', aliases: ['2','ter','terça','terca','terça-feira','terca-feira','tue','tuesday'] },
  { id: 'wednesday', index: 3, label: 'Quarta-feira', aliases: ['3','qua','quarta','quarta-feira','wed','wednesday'] },
  { id: 'thursday', index: 4, label: 'Quinta-feira', aliases: ['4','qui','quinta','quinta-feira','thu','thursday'] },
  { id: 'friday', index: 5, label: 'Sexta-feira', aliases: ['5','sex','sexta','sexta-feira','fri','friday'] },
  { id: 'saturday', index: 6, label: 'Sábado', aliases: ['6','sab','sáb','sabado','sábado','sat','saturday'] }
];
const AREA_WEEKDAY_ALIAS = AREA_WEEKDAYS.reduce((map, item) => {
  map[item.id] = item.id;
  (item.aliases || []).forEach(alias => { map[String(alias).toLowerCase()] = item.id; });
  return map;
}, {});

function normalizeAreaTime(value){
  if(value == null) return null;
  let str = String(value).trim();
  if(!str) return null;
  str = str.replace(/[hH]/g, ':').replace(/[^0-9:]/g, '');
  if(/^\d{5,6}$/.test(str)){
    str = str.slice(0, str.length - 4) + ':' + str.slice(-4, -2) + ':' + str.slice(-2);
  }
  if(/^\d{3,4}$/.test(str)){
    str = str.slice(0, str.length - 2) + ':' + str.slice(-2);
  }
  const parts = str.split(':').filter(Boolean);
  if(parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if(Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if(hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0');
}

function minutesFromTime(time){
  if(!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [h,m] = time.split(':').map(Number);
  return (h*60) + m;
}

function normalizeAreaDateFromList(values){
  if(!Array.isArray(values)) return null;
  for(const value of values){
    const normalized = normalizeAreaDate(value);
    if(normalized) return normalized;
  }
  return null;
}

function normalizeAreaTimeFromList(values){
  if(!Array.isArray(values)) return null;
  for(const value of values){
    const normalized = normalizeAreaTime(value);
    if(normalized) return normalized;
  }
  return null;
}

function extractPeriodoTimes(raw){
  if(typeof raw !== 'string') return null;
  const normalized = raw.replace(/[hH]/g, ':');
  const matches = normalized.match(/\b(\d{1,2}:\d{2})\b/g);
  if(!matches || !matches.length) return null;
  const start = matches[0];
  const end = matches.length > 1 ? matches[matches.length - 1] : null;
  if(!start) return null;
  return { start, end };
}

function extractPeriodoDates(raw){
  if(typeof raw !== 'string') return null;
  const matches = raw.match(/\b(\d{4}[-\.\/_]\d{1,2}[-\.\/_]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g);
  if(!matches || !matches.length) return null;
  const start = normalizeAreaDate(matches[0]);
  let end = null;
  if(matches.length > 1){
    end = normalizeAreaDate(matches[matches.length - 1]);
  }
  if(!start && !end) return null;
  return { start, end };
}

function extractTextValue(value, depth = 0){
  if(value === null || value === undefined) return '';
  if(typeof value === 'string'){
    const trimmed = value.trim();
    return trimmed && trimmed !== '[object Object]' ? trimmed : '';
  }
  if(typeof value === 'number' || typeof value === 'boolean'){
    return String(value);
  }
  if(Array.isArray(value)){
    for(const item of value){
      const resolved = extractTextValue(item, depth + 1);
      if(resolved) return resolved;
    }
    return '';
  }
  if(typeof value === 'object'){
    if(depth > 4) return '';
    const textKeys = ['label','nome','name','descricao','descricao_curta','descricaoCurta','texto','title','value','display','displayName'];
    for(const key of textKeys){
      if(Object.prototype.hasOwnProperty.call(value, key)){
        const resolved = extractTextValue(value[key], depth + 1);
        if(resolved) return resolved;
      }
    }
    if(typeof value.toString === 'function' && value.toString !== Object.prototype.toString){
      const custom = String(value).trim();
      if(custom && custom !== '[object Object]') return custom;
    }
  }
  return '';
}

function extractIdValue(value, depth = 0){
  if(value === null || value === undefined) return '';
  if(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'){
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text : '';
  }
  if(Array.isArray(value)){
    for(const item of value){
      const resolved = extractIdValue(item, depth + 1);
      if(resolved) return resolved;
    }
    return '';
  }
  if(typeof value === 'object'){
    if(depth > 4) return '';
    const idKeys = ['id','_id','uuid','codigo','code','value','key'];
    for(const key of idKeys){
      if(Object.prototype.hasOwnProperty.call(value, key)){
        const resolved = extractIdValue(value[key], depth + 1);
        if(resolved) return resolved;
      }
    }
  }
  return '';
}

function resolveAreaDayId(value){
  if(value == null) return null;
  if(typeof value === 'number' && value >= 0 && value <= 6){
    const found = AREA_WEEKDAYS[value];
    return found ? found.id : null;
  }
  const str = String(value).trim().toLowerCase();
  if(!str) return null;
  if(AREA_WEEKDAY_ALIAS[str]) return AREA_WEEKDAY_ALIAS[str];
  if(/^\d$/.test(str)){
    const idx = Number(str);
    return AREA_WEEKDAYS[idx] ? AREA_WEEKDAYS[idx].id : null;
  }
  return null;
}

function sanitizeAreaSchedule(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach(entry => {
    if(!entry) return;
    let dayId = resolveAreaDayId(entry.day);
    if(dayId == null && entry.weekday != null) dayId = resolveAreaDayId(entry.weekday);
    if(dayId == null && entry.weekday_index != null) dayId = resolveAreaDayId(entry.weekday_index);
    if(dayId == null && entry.dia != null) dayId = resolveAreaDayId(entry.dia);
    if(dayId == null && entry.dia_semana != null) dayId = resolveAreaDayId(entry.dia_semana);
    if(dayId == null && entry.index != null) dayId = resolveAreaDayId(entry.index);
    if(dayId == null && typeof entry === 'object' && entry.day_id != null) dayId = resolveAreaDayId(entry.day_id);
    if(dayId == null) return;
    const dayInfo = AREA_WEEKDAYS.find(d => d.id === dayId) || { id: dayId, label: dayId, index: null };
    const slotsRaw = Array.isArray(entry.intervals) ? entry.intervals : (Array.isArray(entry.slots) ? entry.slots : (Array.isArray(entry.horarios) ? entry.horarios : []));
    const slots = [];
    slotsRaw.forEach(slot => {
      if(slot == null) return;
      let start = null;
      let end = null;
      if(typeof slot === 'string'){
        const parts = slot.split(/\s*(?:-|→|a|até|\/)\s*/i);
        if(parts.length === 2){
          start = normalizeAreaTime(parts[0]);
          end = normalizeAreaTime(parts[1]);
        }
      } else if(typeof slot === 'object'){
        start = normalizeAreaTime(slot.start || slot.inicio || slot.de || slot.from || slot.hora_inicio || slot.horaInicio);
        end = normalizeAreaTime(slot.end || slot.fim || slot.ate || slot.to || slot.hora_fim || slot.horaFim || slot.termino);
      }
      if(!start || !end) return;
      if(minutesFromTime(end) <= minutesFromTime(start)) return;
      slots.push({ start, end });
    });
    if(!slots.length) return;
    slots.sort((a,b) => minutesFromTime(a.start) - minutesFromTime(b.start));
    out.push({
      day: dayInfo.id,
      label: entry.label || entry.day_label || dayInfo.label,
      day_index: Number.isInteger(dayInfo.index) ? dayInfo.index : null,
      intervals: slots
    });
  });
  return out;
}

function mapAreaScheduleForResponse(raw){
  const list = sanitizeAreaSchedule(raw);
  const labelMap = AREA_WEEKDAYS.reduce((acc, day) => { acc[day.id] = day.label; return acc; }, {});
  return list.map(item => ({
    ...item,
    label: item.label || labelMap[item.day] || item.day
  }));
}

function formatCep(value){
  const digits = String(value || '').replace(/\D/g, '');
  if(digits.length === 8) return digits.slice(0, 5) + '-' + digits.slice(5);
  return digits || '';
}

function buildEnderecoCompleto(unit){
  if(!unit) return '';
  if(unit.endereco) return unit.endereco;
  const parts = [];
  const logradouro = [unit.tipoLogradouro, unit.logradouro].filter(Boolean).join(' ').trim();
  if(logradouro) parts.push(logradouro);
  if(unit.numero) parts.push('nº ' + unit.numero);
  if(unit.complemento) parts.push(unit.complemento);
  if(unit.bairro) parts.push(unit.bairro);
  const cidadeEstado = [unit.cidade, unit.estado].filter(Boolean).join(' / ').trim();
  if(cidadeEstado) parts.push(cidadeEstado);
  const cep = formatCep(unit.cep);
  if(cep) parts.push('CEP ' + cep);
  return parts.join(', ');
}

function buildUnidadePayload(unit){
  if(!unit) return null;
  const id = unit._id || unit.id || unit.codigo || unit.nome || '';
  const unidadePrincipalId = unit.unidade_principal_id ? String(unit.unidade_principal_id) : null;
  const diretorId = unit.diretor_usuario_id ? String(unit.diretor_usuario_id) : null;
  const unitId = String(id || '');
  return {
    _id: String(id || ''),
    codigo: unit.codigo ? String(unit.codigo) : '',
    nome: unit.nome ? String(unit.nome) : '',
    razaoSocial: unit.razaoSocial ? String(unit.razaoSocial) : '',
    pessoaTipo: unit.pessoaTipo || '',
    cnpj: unit.cnpj ? String(unit.cnpj) : '',
    cpf: unit.cpf ? String(unit.cpf) : '',
    inscricaoEstadual: unit.inscricaoEstadual ? String(unit.inscricaoEstadual) : '',
    inscricaoMunicipal: unit.inscricaoMunicipal ? String(unit.inscricaoMunicipal) : '',
    cnaePrincipal: unit.cnaePrincipal ? String(unit.cnaePrincipal) : '',
    cnaeSecundarios: unit.cnaeSecundarios ? String(unit.cnaeSecundarios) : '',
    regimeTributario: unit.regimeTributario ? String(unit.regimeTributario) : '',
    naturezaJuridica: unit.naturezaJuridica ? String(unit.naturezaJuridica) : '',
    tipoLogradouro: unit.tipoLogradouro || '',
    logradouro: unit.logradouro || '',
    numero: unit.numero || '',
    complemento: unit.complemento || '',
    bairro: unit.bairro || '',
    cep: unit.cep || '',
    cepFormatado: formatCep(unit.cep),
    cidade: unit.cidade || '',
    estado: unit.estado || '',
    endereco: unit.endereco || buildEnderecoCompleto(unit),
    telefoneFixo: unit.telefoneFixo || '',
    telefoneCelular: unit.telefoneCelular || '',
    telefonePrincipal: unit.telefoneFixo || unit.telefoneCelular || '',
    emailPrincipal: unit.emailPrincipal || '',
    emailFiscal: unit.emailFiscal || '',
    banco: unit.banco ? String(unit.banco) : '',
    agencia: unit.agencia ? String(unit.agencia) : '',
    contaCorrente: unit.contaCorrente ? String(unit.contaCorrente) : '',
    diretor_usuario_id: diretorId,
    pixChave: unit.pixChave || '',
    tipoPix: unit.tipoPix || '',
    is_principal: !!unit.is_principal,
    subunidade: !!unit.subunidade,
    unidade_principal_id: unidadePrincipalId,
    dataAbertura: unit.dataAbertura || null,

    // Logo: entregar URL estável para o front (não expor base64 no payload)
    logoUrl: unitId ? `/api/unidades/${unitId}/logo` : null
  };
}

function toIsoString(value){
  if(!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if(Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isValidObjectId(value){
  try{
    if(value === null || value === undefined) return false;
    const str = String(value);
    if(!str) return false;
    if(typeof mongoose.isValidObjectId === 'function') return mongoose.isValidObjectId(str);
    return mongoose.Types.ObjectId.isValid(str);
  }catch{ return false; }
}

function buildAreaContextPayload(areaDoc, unidadePayload){
  if(!areaDoc) return null;
  const id = areaDoc._id || areaDoc.id || areaDoc.codigo || areaDoc.uuid || areaDoc.key;
  const areaId = id ? String(id) : '';
  const unidadeId = areaDoc.unidade_id ? String(areaDoc.unidade_id) : null;
  const unidadeLabelParts = [];
  if(unidadePayload){
    if(unidadePayload.codigo) unidadeLabelParts.push(unidadePayload.codigo);
    if(unidadePayload.nome) unidadeLabelParts.push(unidadePayload.nome);
  }
  const unidadeLabel = unidadeLabelParts.join(' - ');
  return {
    _id: areaId,
    id: areaId,
    areaId,
    nome: areaDoc.nome || '',
    codigo: areaDoc.codigo || '',
    descricao: areaDoc.descricao || '',
    obs: areaDoc.obs || '',
    foto: areaDoc.foto || '',
    unidade_id: unidadeId,
    unidade: unidadePayload || null,
    _unidadeLabel: unidadeLabel || '',
    area_m2: areaDoc.area_m2 != null ? Number(areaDoc.area_m2) : null,
    capacidade: areaDoc.capacidade != null ? Number(areaDoc.capacidade) : null,
    disponibilidades: mapAreaScheduleForResponse(areaDoc.disponibilidades),
    restricoes: mapAreaRestrictionsForResponse(areaDoc.restricoes)
  };
}

const AREA_PANEL_RESERVA_LIMIT = 12;

function combineDateTimeLocal(dateStr, timeStr){
  if(!dateStr) return null;
  const day = String(dateStr).trim();
  if(!day) return null;
  const parts = String(timeStr || '00:00').split(':');
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  const hour = Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0;
  const minute = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0;
  const iso = `${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return null;
  return { iso, date, minutes: hour * 60 + minute };
}

function buildReservaResponsavelSnapshot(entry){
  if(!entry || typeof entry !== 'object'){
    return { nome: 'Solicitante', telefone: '', email: '', documento: '' };
  }
  const snapshot = entry.cessionario || entry.responsavel || entry.preposto || null;
  const nomeCandidates = [
    entry.responsavel_nome,
    entry.morador_nome,
    snapshot && snapshot.nome,
    snapshot && snapshot.label,
    snapshot && snapshot.dados && snapshot.dados.nome
  ];
  let nome = '';
  for(const value of nomeCandidates){
    const text = extractTextValue(value);
    if(text){ nome = text.slice(0, 180); break; }
  }
  if(!nome) nome = 'Solicitante';
  const telefone = snapshot && (snapshot.telefone || snapshot.telefone1 || snapshot.telefone2 || (snapshot.dados && (snapshot.dados.telefone || snapshot.dados.whatsapp)))
    || entry.responsavel_telefone
    || '';
  const email = snapshot && (snapshot.email || (snapshot.dados && snapshot.dados.email))
    || entry.responsavel_email
    || '';
  const documento = snapshot && (snapshot.cpf || snapshot.cnpj || snapshot.documento)
    || entry.responsavel_documento
    || '';
  return {
    nome,
    telefone: telefone ? String(telefone).trim() : '',
    email: email ? String(email).trim() : '',
    documento: documento ? String(documento).trim() : ''
  };
}

function determineAssignmentWindowStatus(startMs, endMs, nowMs){
  if(startMs <= nowMs && nowMs <= endMs) return 'em_andamento';
  if(startMs > nowMs) return 'futuro';
  return 'encerrado';
}

function buildReservasPanelSnapshot(assignments, now){
  if(!Array.isArray(assignments) || !assignments.length){
    return { itens: [], reservadoHoje: false };
  }
  const nowMs = now.getTime();
  const todayIso = now.toISOString().slice(0, 10);
  const itens = [];
  let reservadoHoje = false;
  assignments.forEach(entry => {
    const startCombo = combineDateTimeLocal(entry.date, entry.start);
    const endCombo = combineDateTimeLocal(entry.date_end || entry.date, entry.end);
    if(!startCombo || !endCombo) return;
    const startMs = startCombo.date.getTime();
    const endMs = endCombo.date.getTime();
    if(endMs < nowMs && startMs < nowMs) return;
    const responsavel = buildReservaResponsavelSnapshot(entry);
    const status = determineAssignmentWindowStatus(startMs, endMs, nowMs);
    itens.push({
      id: entry.id,
      inicio: startCombo.iso,
      fim: endCombo.iso,
      responsavel,
      responsavel_nome: responsavel.nome || entry.morador_nome || '',
      habitacao_id: entry.habitacao_id ? String(entry.habitacao_id) : null,
      habitacao_label: entry.habitacao_label || '',
      observacao: entry.observacao || '',
      termo_status: entry.termo_status || '',
      financeiro: entry.financeiro || null,
      status
    });
    if(!reservadoHoje){
      const dateEnd = entry.date_end || entry.date;
      const coversToday = entry.date <= todayIso && dateEnd >= todayIso;
      if(coversToday && (status === 'em_andamento' || entry.date === todayIso)){
        reservadoHoje = true;
      }
    }
  });
  itens.sort((a, b) => {
    const startA = a.inicio ? new Date(a.inicio).getTime() : 0;
    const startB = b.inicio ? new Date(b.inicio).getTime() : 0;
    return startA - startB;
  });
  return {
    itens: itens.slice(0, AREA_PANEL_RESERVA_LIMIT),
    reservadoHoje
  };
}

function determineAreaMaintenanceFlag(areaDoc, restricoes, todayIso, nowMinutes){
  if(areaDoc && areaDoc.ativa === false) return true;
  if(!Array.isArray(restricoes) || !restricoes.length) return false;
  return restricoes.some(item => {
    if(!item || item.date !== todayIso) return false;
    const start = minutesFromTime(item.start);
    const end = minutesFromTime(item.end);
    if(typeof start === 'number' && typeof end === 'number' && nowMinutes >= start && nowMinutes <= end){
      return true;
    }
    const obs = (item.observacao || '').toLowerCase();
    return /manuten|obra|interdit|reforma|limpez/.test(obs);
  });
}

function summarizeRulesText(value){
  const text = extractTextValue(value || '');
  if(!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if(!normalized) return '';
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function escapeRegex(value){
  if(value === null || value === undefined) return '';
  return String(value).replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
}

function buildDestinoPayload(areaDoc, unidadePayload){
  if(!areaDoc) return null;
  const id = areaDoc._id || areaDoc.id || areaDoc.codigo || areaDoc.uuid || '';
  const areaId = id ? String(id) : '';
  return {
    id: areaId,
    _id: areaId,
    areaId,
    nome: areaDoc.nome || '',
    codigo: areaDoc.codigo || '',
    unidade_id: areaDoc.unidade_id ? String(areaDoc.unidade_id) : null,
    unidade: unidadePayload || null
  };
}

function buildMaterialSnapshot(materialDoc, maps){
  if(!materialDoc) return null;
  const { naturezaMap = new Map(), unidadeMap = new Map(), areaMap = new Map() } = maps || {};
  const id = materialDoc._id ? String(materialDoc._id) : '';
  const unidadeId = materialDoc.unidade_id ? String(materialDoc.unidade_id) : '';
  const naturezaId = materialDoc.natureza_id ? String(materialDoc.natureza_id) : '';
  const areaId = materialDoc.vinculo_area && materialDoc.vinculo_area.area_id ? String(materialDoc.vinculo_area.area_id) : '';
  const naturezaInfo = naturezaMap.get(naturezaId) || {};
  const unidadePayload = unidadeMap.get(unidadeId) || null;
  const areaPayload = areaMap.get(areaId) || null;
  const nomeBase = naturezaInfo.nome || materialDoc.descricao || '';
  const nome = nomeBase || 'Material';
  const tipo = materialDoc.tipo ? String(materialDoc.tipo) : (naturezaInfo.tipo || '');
  const patrimonio = materialDoc.serie ? String(materialDoc.serie) : '';
  const descricao = materialDoc.descricao || '';
  const status = materialDoc.ativa === false ? 'Inativo' : 'Disponível';
  const origemSnapshot = areaPayload ? {
    id: areaPayload._id,
    _id: areaPayload._id,
    areaId: areaPayload._id,
    nome: areaPayload.nome,
    unidade: unidadePayload || null
  } : null;

  const payload = {
    id,
    _id: id,
    materialId: id,
    nome,
    tipo,
    categoria: naturezaInfo.nome || '',
    patrimonio,
    serie: patrimonio,
    descricao,
    quantidade: 1,
    status,
    unidadeId,
    unidade: unidadePayload || null,
    origem: origemSnapshot,
    areaOrigem: origemSnapshot,
    destino: null,
    areaDestino: null,
    vinculo_area: {
      unidade_id: materialDoc.vinculo_area && materialDoc.vinculo_area.unidade_id ? String(materialDoc.vinculo_area.unidade_id) : (unidadeId || null),
      area_id: areaId || null
    },
    natureza: naturezaId ? { _id: naturezaId, nome: naturezaInfo.nome || '', tipo: naturezaInfo.tipo || '' } : undefined,
    atualizadoEm: toIsoString(materialDoc.updatedAt),
    criadoEm: toIsoString(materialDoc.createdAt)
  };

  return payload;
}

function buildTransferMaterialSnapshot(materialDoc, transferDoc, context){
  if(!materialDoc || !transferDoc) return null;
  const naturezaMap = (context && context.naturezaMap) || new Map();
  const unidadeMap = (context && context.unidadeMap) || new Map();
  const areaMap = (context && context.areaMap) || new Map();
  const role = context && context.role ? String(context.role) : '';
  const base = buildMaterialSnapshot(materialDoc, { naturezaMap, unidadeMap, areaMap });
  if(!base) return null;
  const transferenciaId = transferDoc._id ? String(transferDoc._id) : '';
  const status = transferDoc.status || 'pendente';
  const createdAt = toIsoString(transferDoc.createdAt);
  const updatedAt = toIsoString(transferDoc.updatedAt);
  if(transferenciaId) base.transferenciaId = transferenciaId;
  base.transferencia = {
    id: transferenciaId,
    status,
    criadoEm: createdAt,
    atualizadoEm: updatedAt
  };
  base.transferenciaStatus = status;
  base.transferenciaCriadaEm = createdAt;
  base.transferenciaAtualizadaEm = updatedAt;
  if(updatedAt) base.atualizadoEm = updatedAt;
  if(role === 'origem'){
    base.status = 'Aguardando aceite do destino';
    const destinoId = transferDoc.destino_area_id ? String(transferDoc.destino_area_id) : '';
    if(destinoId && areaMap.has(destinoId)){
      const destinoArea = areaMap.get(destinoId);
      base.destino = {
        id: destinoArea._id,
        _id: destinoArea._id,
        areaId: destinoArea._id,
        nome: destinoArea.nome,
        codigo: destinoArea.codigo,
        unidade: destinoArea.unidade || null
      };
      base.areaDestino = base.destino;
      base.destinoLabel = destinoArea.nome || destinoArea.codigo || '';
    }
  } else if(role === 'destino'){
    base.status = 'Aguardando seu aceite';
    const origemId = transferDoc.origem_area_id ? String(transferDoc.origem_area_id) : '';
    if(origemId && areaMap.has(origemId)){
      const origemArea = areaMap.get(origemId);
      base.origem = {
        id: origemArea._id,
        _id: origemArea._id,
        areaId: origemArea._id,
        nome: origemArea.nome,
        codigo: origemArea.codigo,
        unidade: origemArea.unidade || null
      };
      base.areaOrigem = base.origem;
      base.origemLabel = origemArea.nome || origemArea.codigo || '';
    }
  }
  return base;
}

async function buildMaterialLogsForArea(areaDoc, repo){
  if(!areaDoc) return [];
  const areaId = areaDoc._id ? String(areaDoc._id) : '';
  if(!areaId) return [];
  const transferDocs = await CondMaterialTransferencia.find({
    $or: [
      { origem_area_id: areaDoc._id },
      { destino_area_id: areaDoc._id }
    ]
  }).sort({ updatedAt: -1, createdAt: -1 }).limit(200).lean();
  if(!transferDocs.length) return [];

  const materialIds = [...new Set(transferDocs.map(doc => doc && doc.material_id ? String(doc.material_id) : null).filter(Boolean))];
  const materialDocs = materialIds.length ? await CondBemMaterial.find({ _id: { $in: materialIds } })
    .select('_id unidade_id natureza_id serie tipo descricao vinculo_area createdAt updatedAt')
    .lean() : [];

  const naturezaIds = [...new Set(materialDocs.map(doc => doc && doc.natureza_id ? String(doc.natureza_id) : null).filter(Boolean))];
  const naturezaDocs = naturezaIds.length ? await CondNatMaterial.find({ _id: { $in: naturezaIds } }).select('_id nome tipo').lean() : [];
  const naturezaMap = new Map(naturezaDocs.map(doc => [String(doc._id), {
    _id: String(doc._id),
    nome: doc && doc.nome ? doc.nome : '',
    tipo: doc && doc.tipo ? doc.tipo : ''
  }]));

  const areaIds = new Set();
  transferDocs.forEach(doc => {
    if(doc && doc.origem_area_id) areaIds.add(String(doc.origem_area_id));
    if(doc && doc.destino_area_id) areaIds.add(String(doc.destino_area_id));
  });
  areaIds.add(areaId);
  const areaDocs = areaIds.size ? await CondAreaComum.find({ _id: { $in: Array.from(areaIds) } })
    .select('_id nome codigo unidade_id')
    .lean() : [];

  const unidadeIds = new Set();
  areaDocs.forEach(doc => { if(doc && doc.unidade_id) unidadeIds.add(String(doc.unidade_id)); });
  materialDocs.forEach(doc => { if(doc && doc.unidade_id) unidadeIds.add(String(doc.unidade_id)); });
  if(areaDoc.unidade_id) unidadeIds.add(String(areaDoc.unidade_id));

  const pickUnidadeIdFromArea = (doc, ids) => {
    const fromArea = String(doc?.unidade_id || '').trim();
    if (fromArea && mongoose.isValidObjectId(fromArea)) return fromArea;

    const firstFromSet = String(Array.from(ids || [])[0] || '').trim();
    if (firstFromSet && mongoose.isValidObjectId(firstFromSet)) return firstFromSet;

    return '';
  };

  const unidadeId = pickUnidadeIdFromArea(areaDoc, unidadeIds);
  const unidadeRepo = repo || new UnidadesReadRepository({
    unitScope: unidadeId ? createUnitScope({ unidadeId }) : { type: 'global', unidadeId: null }
  });

  const unidadeDocs = unidadeIds.size ? await unidadeRepo.find({ _id: { $in: Array.from(unidadeIds) } }) : [];
  const unidadeMap = new Map();
  unidadeDocs.forEach(doc => {
    const payload = buildUnidadePayload(doc);
    if(payload) unidadeMap.set(String(doc._id), payload);
  });

  const areaMap = new Map();
  areaDocs.forEach(doc => {
    if(!doc || !doc._id) return;
    const unidadePayload = doc.unidade_id ? (unidadeMap.get(String(doc.unidade_id)) || null) : null;
    const payload = buildAreaContextPayload(doc, unidadePayload);
    if(payload) areaMap.set(payload._id, payload);
  });
  if(!areaMap.has(areaId)){
    const unidadePayload = areaDoc.unidade_id ? (unidadeMap.get(String(areaDoc.unidade_id)) || null) : null;
    const payload = buildAreaContextPayload(areaDoc, unidadePayload);
    if(payload) areaMap.set(payload._id, payload);
  }

  const materialMap = new Map();
  materialDocs.forEach(doc => {
    if(!doc || !doc._id) return;
    const payload = buildMaterialSnapshot(doc, { naturezaMap, unidadeMap, areaMap });
    if(payload) materialMap.set(String(doc._id), payload);
  });

  const logs = [];
  let counter = 0;
  transferDocs.forEach(doc => {
    if(!doc) return;
    const role = determineTransferRole(areaId, doc);
    if(!role) return;
    const transferId = doc._id ? String(doc._id) : '';
    const materialPayload = doc.material_id ? (materialMap.get(String(doc.material_id)) || null) : null;
    const origemPayload = doc.origem_area_id ? (areaMap.get(String(doc.origem_area_id)) || null) : null;
    const destinoPayload = doc.destino_area_id ? (areaMap.get(String(doc.destino_area_id)) || null) : null;
    const solicitanteNome = getActorDisplayName(doc.solicitante);
    const baseObs = extractTransferObservation(doc);

    const createdEntry = createTransferLogEntry({
      transferId,
      acao: role === 'origem' ? 'Transferência enviada' : 'Transferência aguardando aceite',
      timestamp: doc.createdAt || doc.updatedAt || new Date(),
      usuario: solicitanteNome,
      observacao: '',
      materialPayload,
      origemPayload,
      destinoPayload,
      sequence: ++counter
    });
    if(createdEntry) logs.push(createdEntry);

    const status = (doc.status || '').toLowerCase();
    if(status === 'aceito' || status === 'concluido'){
      const actorNome = getActorDisplayName(doc.aceite);
      const acceptanceEntry = createTransferLogEntry({
        transferId,
        acao: role === 'destino' ? 'Transferência aceita' : 'Transferência concluída pelo destino',
        timestamp: doc.aceite_em || doc.updatedAt || doc.createdAt,
        usuario: actorNome,
        observacao: baseObs,
        materialPayload,
        origemPayload,
        destinoPayload,
        sequence: ++counter
      });
      if(acceptanceEntry) logs.push(acceptanceEntry);
    } else if(status === 'recusado'){
      const actorNome = getActorDisplayName(doc.cancelado);
      const refusalEntry = createTransferLogEntry({
        transferId,
        acao: role === 'destino' ? 'Transferência recusada' : 'Transferência recusada pelo destino',
        timestamp: doc.cancelado_em || doc.updatedAt || doc.createdAt,
        usuario: actorNome,
        observacao: baseObs,
        materialPayload,
        origemPayload,
        destinoPayload,
        sequence: ++counter
      });
      if(refusalEntry) logs.push(refusalEntry);
    } else if(status === 'cancelado'){
      const actorNome = getActorDisplayName(doc.cancelado);
      const cancelEntry = createTransferLogEntry({
        transferId,
        acao: role === 'origem' ? 'Transferência cancelada' : 'Transferência cancelada pela origem',
        timestamp: doc.cancelado_em || doc.updatedAt || doc.createdAt,
        usuario: actorNome,
        observacao: baseObs,
        materialPayload,
        origemPayload,
        destinoPayload,
        sequence: ++counter
      });
      if(cancelEntry) logs.push(cancelEntry);
    }
  });

  logs.sort((a, b) => parseLogTimestamp(b.data) - parseLogTimestamp(a.data));
  return logs;
}

function determineTransferRole(areaId, transferDoc){
  if(!transferDoc) return '';
  const origemId = transferDoc.origem_area_id ? String(transferDoc.origem_area_id) : '';
  const destinoId = transferDoc.destino_area_id ? String(transferDoc.destino_area_id) : '';
  if(areaId && origemId === areaId) return 'origem';
  if(areaId && destinoId === areaId) return 'destino';
  return '';
}

function getActorDisplayName(actor){
  if(!actor || typeof actor !== 'object') return '';
  const nome = actor.nome && String(actor.nome).trim();
  if(nome) return nome;
  const email = actor.email && String(actor.email).trim();
  if(email) return email;
  if(actor.referencia_id) return String(actor.referencia_id);
  return '';
}

function extractTransferObservation(transferDoc){
  if(!transferDoc || typeof transferDoc !== 'object') return '';
  const candidates = [
    transferDoc.observacao,
    transferDoc.obs,
    transferDoc.motivo,
    transferDoc.justificativa,
    transferDoc.meta && transferDoc.meta.observacao,
    transferDoc.meta && transferDoc.meta.obs,
    transferDoc.meta && transferDoc.meta.motivo,
    transferDoc.meta && transferDoc.meta.justificativa
  ];
  for(const value of candidates){
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(trimmed) return trimmed;
    }
  }
  return '';
}

function createTransferLogEntry({ transferId, acao, timestamp, usuario, observacao, materialPayload, origemPayload, destinoPayload, sequence }){
  if(!acao) return null;
  const iso = toIsoString(timestamp || new Date());
  const formatted = iso ? formatLogDisplayDate(iso) : '';
  const materialLabel = buildLogMaterialLabel(materialPayload);
  const materialPatrimonio = buildLogMaterialPatrimonio(materialPayload);
  const origemLabel = buildLogAreaLabel(origemPayload);
  const destinoLabel = buildLogAreaLabel(destinoPayload);
  const idBase = transferId || 'log';
  const idx = sequence != null ? sequence : Date.now();
  return {
    id: `${idBase}:${idx}`,
    transferenciaId: transferId || null,
    acao,
    material: materialLabel,
    patrimonio: materialPatrimonio,
    origem: origemLabel,
    destino: destinoLabel,
    usuario: usuario || '',
    data: iso,
    dataFormatada: formatted,
    obs: observacao || ''
  };
}

function buildLogMaterialLabel(material){
  if(!material || typeof material !== 'object') return 'Material';
  const nome = material.nome && String(material.nome).trim();
  if(nome) return nome;
  const patrimonio = material.patrimonio && String(material.patrimonio).trim();
  if(patrimonio) return patrimonio;
  return 'Material';
}

function buildLogMaterialPatrimonio(material){
  if(!material || typeof material !== 'object') return '';
  if(material.patrimonio) return String(material.patrimonio).trim();
  if(material.serie) return String(material.serie).trim();
  if(material.material && typeof material.material === 'object'){
    const nested = material.material;
    if(nested.patrimonio) return String(nested.patrimonio).trim();
    if(nested.serie) return String(nested.serie).trim();
  }
  return '';
}

function buildLogAreaLabel(area){
  if(!area || typeof area !== 'object') return '';
  const nome = area.nome && String(area.nome).trim();
  if(nome) return nome;
  const codigo = area.codigo && String(area.codigo).trim();
  if(codigo) return codigo;
  return '';
}

function formatLogDisplayDate(iso){
  if(!iso) return '';
  try{
    const date = new Date(iso);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }catch{ return ''; }
}

function parseLogTimestamp(value){
  if(!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function buildActorFromUser(user){
  if(!user) return null;
  const actor = {};
  if(user._id && isValidObjectId(user._id)) actor.referencia_id = user._id;
  const nome = user.nome || user.name || user.fullName || '';
  if(nome) actor.nome = String(nome);
  const email = user.email || user.login || user.username || '';
  if(email) actor.email = String(email).toLowerCase();
  return Object.keys(actor).length ? actor : null;
}

function buildHabitacaoLabel(habDoc, unidadePayload, blocoDoc, andarDoc){
  if(!habDoc) return '';
  const parts = [];
  if(unidadePayload){
    const unidadeRotulo = [unidadePayload.codigo, unidadePayload.nome].filter(Boolean).join(' - ');
    if(unidadeRotulo) parts.push(unidadeRotulo);
  }
  if(blocoDoc){
    const blocoLabel = blocoDoc.nome || blocoDoc.codigo;
    if(blocoLabel) parts.push(`Bloco ${blocoLabel}`);
  }
  if(andarDoc){
    const andarLabel = andarDoc.nome || andarDoc.codigo;
    if(andarLabel) parts.push(andarLabel);
  }
  if(habDoc.numero) parts.push(`Hab. ${habDoc.numero}`);
  return parts.filter(Boolean).join(' · ');
}

function buildReservationSortKey(entry){
  if(!entry) return 0;
  const dateValue = entry.date || entry.date_end;
  const base = dateValue ? Date.parse(`${dateValue}T00:00:00`) : 0;
  const minutes = minutesFromTime(entry.start || '00:00');
  if(Number.isNaN(base)) return minutes;
  return base + (Number.isFinite(minutes) ? minutes * 60000 : 0);
}

function normalizeAreaDate(value){
  if(value == null) return null;
  let str = String(value).trim();
  if(!str) return null;
  const isoMatch = /^([0-9]{4})[-\.\/_]([0-9]{1,2})[-\.\/_]([0-9]{1,2})$/.exec(str);
  const brMatch = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(str);
  const buildIso = (year, month, day) => {
    const y = Number(year), m = Number(month), d = Number(day);
    if(!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if(date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };
  if(isoMatch) return buildIso(isoMatch[1], isoMatch[2], isoMatch[3]);
  if(brMatch) return buildIso(brMatch[3], brMatch[2], brMatch[1]);
  const parsed = new Date(str);
  if(Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sanitizeAreaRestrictions(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach(entry => {
    if(!entry) return;
    const date = normalizeAreaDate(entry.date || entry.data || entry.dia || entry.day);
    const start = normalizeAreaTime(entry.start || entry.inicio || entry.from || entry.de || entry.hora_inicio || entry.horaInicio);
    const end = normalizeAreaTime(entry.end || entry.fim || entry.to || entry.ate || entry.hora_fim || entry.horaFim);
    if(!date || !start || !end) return;
    if(minutesFromTime(end) <= minutesFromTime(start)) return;
    const observacao = entry.observacao != null ? String(entry.observacao).trim() : (entry.obs != null ? String(entry.obs).trim() : (entry.justificativa != null ? String(entry.justificativa).trim() : (entry.motivo != null ? String(entry.motivo).trim() : '')));
    out.push({ date, start, end, observacao });
  });
  out.sort((a, b) => {
    if(a.date === b.date) return minutesFromTime(a.start) - minutesFromTime(b.start);
    return a.date < b.date ? -1 : 1;
  });
  return out;
}

function mapAreaRestrictionsForResponse(raw){
  const list = sanitizeAreaRestrictions(raw);
  return list.map(item => ({
    ...item,
    observacao: item.observacao || ''
  }));
}

function sanitizeAreaUsageRuleText(value){
  if(value === null || value === undefined) return '';
  if(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'){
    let text = String(value).replace(/\s+/g, ' ').trim();
    if(!text || text === '[object Object]') return '';
    if(text.length > 8000) text = text.slice(0, 8000);
    return text;
  }
  if(Array.isArray(value)){
    for(const item of value){
      const resolved = sanitizeAreaUsageRuleText(item);
      if(resolved) return resolved;
    }
    return '';
  }
  if(typeof value === 'object'){
    if(Object.prototype.hasOwnProperty.call(value, 'text')){
      return sanitizeAreaUsageRuleText(value.text);
    }
    if(Object.prototype.hasOwnProperty.call(value, 'rule')){
      return sanitizeAreaUsageRuleText(value.rule);
    }
    if(Object.prototype.hasOwnProperty.call(value, 'descricao')){
      return sanitizeAreaUsageRuleText(value.descricao);
    }
    const resolved = extractTextValue(value);
    return sanitizeAreaUsageRuleText(resolved);
  }
  return '';
}

function sanitizeAreaUsageRules(raw){
  if(raw === null || raw === undefined) return '';
  const collected = [];
  const collect = (value, depth = 0) => {
    if(value === null || value === undefined || depth > 6) return;
    if(typeof value === 'string'){
      value.split(/\r?\n+/).forEach(part => {
        const normalized = sanitizeAreaUsageRuleText(part);
        if(normalized) collected.push(normalized);
      });
      return;
    }
    if(typeof value === 'number' || typeof value === 'boolean'){
      const normalized = sanitizeAreaUsageRuleText(value);
      if(normalized) collected.push(normalized);
      return;
    }
    if(Array.isArray(value)){
      value.forEach(item => collect(item, depth + 1));
      return;
    }
    if(typeof value === 'object'){
      if(Object.prototype.hasOwnProperty.call(value, 'rules')) collect(value.rules, depth + 1);
      if(Object.prototype.hasOwnProperty.call(value, 'regras')) collect(value.regras, depth + 1);
      if(Object.prototype.hasOwnProperty.call(value, 'itens')) collect(value.itens, depth + 1);
      if(Object.prototype.hasOwnProperty.call(value, 'items')) collect(value.items, depth + 1);
      if(Object.prototype.hasOwnProperty.call(value, 'text')) collect(value.text, depth + 1);
      const keys = Object.keys(value).filter(k => !['rules','regras','itens','items','text'].includes(k));
      keys.forEach(key => collect(value[key], depth + 1));
      return;
    }
  };
  collect(raw);
  if(!collected.length) return '';
  const seen = new Set();
  const unique = [];
  collected.forEach(rule => {
    const normalized = sanitizeAreaUsageRuleText(rule);
    if(!normalized) return;
    if(seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(normalized);
  });
  if(!unique.length) return '';
  const limited = unique.slice(0, 100);
  const joined = limited.join('\n');
  return joined.length > 32000 ? joined.slice(0, 32000) : joined;
}

function parseNumberLike(value){
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'number') return Number.isFinite(value) ? value : null;
  let normalized = String(value).trim();
  if(!normalized) return null;
  normalized = normalized.replace(/\s+/g, '');
  if(normalized.includes(',') && normalized.includes('.')){
    normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
  } else if(normalized.includes(',')){
    normalized = normalized.replace(/,/g, '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeAbatimentosList(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach(item => {
    if(!item) return;
    if(typeof item === 'string'){
      const texto = item.trim();
      if(texto) out.push({ titulo: texto, percentual: null, descricao: '' });
      return;
    }
    if(typeof item !== 'object') return;
    const titulo = item.titulo || item.nome || item.label || '';
    const percentual = parseNumberLike(item.percentual ?? item.percent ?? item.percentagem ?? item.percentual_desconto);
    const descricao = item.descricao || item.obs || item.condicao || item.detalhe || '';
    if(!titulo && !descricao && percentual === null) return;
    out.push({
      titulo: String(titulo || '').trim(),
      percentual: percentual !== null ? percentual : null,
      descricao: String(descricao || '').trim()
    });
  });
  return out;
}

const UF_ALIAS = {
  'ACRE': 'AC',
  'ALAGOAS': 'AL',
  'AMAPA': 'AP',
  'AMAPÁ': 'AP',
  'AMAZONAS': 'AM',
  'BAHIA': 'BA',
  'CEARA': 'CE',
  'CEARÁ': 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  'ESPÍRITO SANTO': 'ES',
  'GOIAS': 'GO',
  'GOIÁS': 'GO',
  'MARANHAO': 'MA',
  'MARANHÃO': 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  'PARA': 'PA',
  'PARÁ': 'PA',
  'PARAIBA': 'PB',
  'PARAÍBA': 'PB',
  'PARANA': 'PR',
  'PARANÁ': 'PR',
  'PERNAMBUCO': 'PE',
  'PIAUI': 'PI',
  'PIAUÍ': 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  'RONDONIA': 'RO',
  'RONDÔNIA': 'RO',
  'RORAIMA': 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  'SÃO PAULO': 'SP',
  'SERGIPE': 'SE',
  'TOCANTINS': 'TO'
};

function normalizeUf(value){
  if(!value) return '';
  const str = String(value).trim().toUpperCase();
  if(/^[A-Z]{2}$/.test(str)) return str;
  return UF_ALIAS[str] || '';
}

function normalizeMunicipio(value){
  if(!value) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeVara(value){
  if(!value) return '';
  return String(value).trim().toUpperCase();
}

function cloneJson(value, maxStringLength = 4000){
  if(value === null || value === undefined) return value === undefined ? null : null;
  return JSON.parse(JSON.stringify(value, (key, val) => {
    if(typeof val === 'string' && val.length > maxStringLength){
      return val.slice(0, maxStringLength);
    }
    return val;
  }));
}

function sanitizePessoa(raw){
  if(!raw || typeof raw !== 'object') return null;
  const clone = cloneJson(raw);
  if(clone.unidadeId !== undefined) clone.unidadeId = extractIdValue(clone.unidadeId);
  if(clone.unidade_id !== undefined) clone.unidade_id = extractIdValue(clone.unidade_id);
  if(clone.habitacaoId !== undefined) clone.habitacaoId = extractIdValue(clone.habitacaoId);
  if(clone.habitacao_id !== undefined) clone.habitacao_id = extractIdValue(clone.habitacao_id);
  if(clone.moradorId !== undefined) clone.moradorId = extractIdValue(clone.moradorId);
  if(clone.morador_id !== undefined) clone.morador_id = extractIdValue(clone.morador_id);
  if(clone.dados && typeof clone.dados === 'object'){
    Object.keys(clone.dados).forEach(key => {
      const val = clone.dados[key];
      if(typeof val === 'string'){
        let texto = val.trim();
        if(texto.length > 4000) texto = texto.slice(0, 4000);
        clone.dados[key] = texto;
      } else if(val !== null && val !== undefined){
        const resolved = extractTextValue(val);
        if(resolved){
          clone.dados[key] = resolved.length > 4000 ? resolved.slice(0, 4000) : resolved;
        } else if(typeof val === 'number' || typeof val === 'boolean'){
          clone.dados[key] = String(val);
        } else {
          delete clone.dados[key];
        }
      }
    });
  }
  return clone;
}

const MAX_MATERIAIS_REGISTROS = 200;

function sanitizeMateriaisList(list){
  if(!Array.isArray(list)) return [];
  return list.slice(0, MAX_MATERIAIS_REGISTROS).map(entry => cloneJson(entry));
}

function sanitizeMateriaisPayload(raw){
  const payload = raw && typeof raw === 'object' ? raw : {};
  const resumoRaw = payload.resumo ?? payload.materiais_resumo ?? payload.materiaisResumo ?? '';
  const resumoTexto = extractTextValue(resumoRaw);
  const resumoSanitizado = resumoTexto ? resumoTexto.slice(0, 2000) : '';
  const sanitized = {
    disponiveis: sanitizeMateriaisList(
      payload.disponiveis
      || payload.materiais_disponiveis
      || payload.materiaisDisponiveis
      || []
    ),
    extraidos: sanitizeMateriaisList(
      payload.extraidos
      || payload.materiais_extraidos
      || payload.materiaisExtraidos
      || []
    )
  };
  if(resumoSanitizado){
    sanitized.resumo = resumoSanitizado;
  }
  return sanitized;
}

function sanitizeFinanceiro(raw){
  if(!raw || typeof raw !== 'object') return null;
  const clone = cloneJson(raw);

  const modalidadeLabelRaw = extractTextValue(raw.modalidade_label ?? clone.modalidade_label ?? raw.modalidade ?? clone.modalidade ?? '');
  const modalidadeKeyRaw = extractTextValue(raw.modalidade ?? clone.modalidade ?? '');
  const modalidadeIdRaw = extractIdValue(raw.modalidade ?? clone.modalidade ?? '');

  const valorParsed = parseNumberLike(raw.valor ?? clone.valor ?? raw.taxa_valor ?? clone.taxa_valor);
  clone.valor = valorParsed !== null ? valorParsed : null;

  let modalidadeResolved = '';
  const normalizedKey = (modalidadeIdRaw || modalidadeKeyRaw || '').trim().toLowerCase();
  if(normalizedKey === 'tarifada' || normalizedKey === 'tarifado' || normalizedKey === 'paga' || normalizedKey === 'tarif'){
    modalidadeResolved = 'tarifada';
  } else if(normalizedKey && normalizedKey.includes('tarif')){
    modalidadeResolved = 'tarifada';
  }
  if(!modalidadeResolved && valorParsed !== null && valorParsed > 0){
    modalidadeResolved = 'tarifada';
  }
  clone.modalidade = modalidadeResolved || 'gratuita';
  clone.modalidade_label = modalidadeLabelRaw || (clone.modalidade === 'tarifada' ? 'Tarifada' : 'Gratuita');

  const vencimentoRaw = raw.vencimento || raw.data_vencimento || clone.vencimento || '';
  const vencimentoNormalized = vencimentoRaw ? normalizeAreaDate(vencimentoRaw) || extractTextValue(vencimentoRaw) : '';
  clone.vencimento = vencimentoNormalized ? vencimentoNormalized.slice(0, 32) : '';

  const observacaoRaw = raw.observacao ?? clone.observacao;
  const observacaoText = extractTextValue(observacaoRaw);
  clone.observacao = observacaoText ? observacaoText.slice(0, 8000) : '';

  const observacaoAutoRaw = raw.observacaoAuto;
  clone.observacaoAuto = typeof observacaoAutoRaw === 'boolean' ? observacaoAutoRaw : true;

  clone.abatimentos = sanitizeAbatimentosList(raw.abatimentos || clone.abatimentos);

  const fundoRaw = raw.fundo_destinacao || raw.fundo || raw.destinacao || clone.fundo_destinacao || '';
  const fundamentoRaw = raw.fundamento || raw.deliberacao || raw.base_legal || clone.fundamento || '';
  clone.fundo_destinacao = extractTextValue(fundoRaw).slice(0, 240);
  clone.fundamento = extractTextValue(fundamentoRaw).slice(0, 240);

  const statusLabel = extractTextValue(raw.status_label ?? clone.status_label ?? raw.pagamento_status_label ?? clone.pagamento_status_label ?? raw.status ?? clone.status ?? raw.pagamento_status ?? clone.pagamento_status ?? '');
  if(statusLabel){
    clone.status_label = statusLabel.slice(0, 180);
    clone.pagamento_status_label = clone.status_label;
  }

  const statusKey = extractIdValue(raw.status ?? clone.status ?? raw.pagamento_status ?? clone.pagamento_status ?? '');
  clone.status = statusKey || (statusLabel ? statusLabel.toLowerCase() : '');
  if(clone.pagamento_status == null && clone.status)
    clone.pagamento_status = clone.status;

  return clone;
}

function sanitizeForo(raw){
  if(!raw || typeof raw !== 'object') return { estado: '', municipio: '', vara: '' };
  return {
    estado: normalizeUf(raw.estado || raw.uf || ''),
    municipio: normalizeMunicipio(raw.municipio || raw.cidade || raw.comarca || raw.nome || ''),
    vara: normalizeVara(raw.vara || raw.vara_nome || raw.varaNome || '')
  };
}

const MAX_CONTRATOS_REGISTROS = 100;

function sanitizeContract(entry){
  if(!entry) return null;
  const clone = cloneJson(entry);
  const idRaw = clone.id || clone._id || clone.codigo || clone.uuid;
  clone.id = idRaw ? String(idRaw) : `contrato-${new mongoose.Types.ObjectId().toString()}`;
  const nome = clone.nome || clone.name || 'Contrato de cessão de uso';
  clone.nome = String(nome).trim().slice(0, 240);
  clone.name = clone.nome;
  if(clone.fileName) clone.fileName = String(clone.fileName).trim().slice(0, 240);
  const createdAtRaw = clone.createdAt || clone.created_at || clone.criado_em || clone.data || null;
  if(createdAtRaw){
    const parsed = new Date(createdAtRaw);
    clone.createdAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  } else {
    clone.createdAt = new Date().toISOString();
  }
  clone.origin = clone.origin === 'local' ? 'local' : 'remote';
  if(clone.origin === 'local'){
    if(typeof clone.dataUri === 'string' && clone.dataUri.length > 500000) delete clone.dataUri;
  } else if(typeof clone.downloadUrl === 'string'){
    clone.downloadUrl = clone.downloadUrl.slice(0, 1024);
  }
  if(clone.objectUrl) delete clone.objectUrl;
  return clone;
}

function sanitizeContracts(raw){
  if(!Array.isArray(raw)) return [];
  const list = [];
  raw.slice(0, MAX_CONTRATOS_REGISTROS).forEach(entry => {
    const normalized = sanitizeContract(entry);
    if(normalized) list.push(normalized);
  });
  return list;
}

function sanitizeResponsabilidades(raw){
  if(!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  raw.forEach(item => {
    if(!item) return;
    if(typeof item === 'string'){
      const texto = item.trim();
      if(!texto) return;
      const id = `resp-${new mongoose.Types.ObjectId().toString()}`;
      out.push({ id, texto: texto.slice(0, 4000), origem: 'texto' });
      seen.add(id);
      return;
    }
    if(typeof item === 'object'){
      const texto = (item.texto || item.descricao || item.obrigacao || item.frase || item.label || '').toString().trim();
      if(!texto) return;
      let id = item.id || item._id || item.uuid || item.codigo || null;
      id = id ? String(id) : `resp-${new mongoose.Types.ObjectId().toString()}`;
      while(seen.has(id)){
        id = `${id}-${out.length + 1}`;
      }
      seen.add(id);
      out.push({
        id,
        texto: texto.slice(0, 4000),
        origem: item.origem || item.fonte || null
      });
    }
  });
  return out;
}

function toPlainObject(entry){
  if(!entry || typeof entry !== 'object') return null;
  if(typeof entry.toObject === 'function'){
    try{ return entry.toObject(); }catch(_){ }
  }
  if(typeof entry.toJSON === 'function'){
    try{ return entry.toJSON(); }catch(_){ }
  }
  try{ return { ...entry }; }catch(_){ }
  return null;
}

function sanitizeAssignment(entry){
  if(!entry || typeof entry !== 'object') return null;

  let clone = null;
  try{
    clone = cloneJson(entry);
  }catch(_){
    clone = toPlainObject(entry);
  }
  if(!clone) return null;
  const periodoDates = clone.periodo ? extractPeriodoDates(clone.periodo) : null;

  let date = normalizeAreaDateFromList([
    clone.date,
    clone.date_inicio,
    clone.data_inicio,
    clone.dataInicio,
    clone.dataInicial,
    clone.data_inicial,
    clone.inicio_data,
    clone.inicioData,
    clone.data,
    clone.inicio,
    clone.periodo_inicio,
    clone.reserva_data_inicio,
    clone.reservaDataInicio
  ]);
  if(!date && periodoDates && periodoDates.start){
    date = periodoDates.start;
  }

  let start = normalizeAreaTimeFromList([
    clone.start,
    clone.hora_inicio,
    clone.horaInicio,
    clone.hora_inicial,
    clone.horaInicial,
    clone.inicio_hora,
    clone.inicioHora,
    clone.hora,
    clone.hora_reserva_inicio,
    clone.horaReservaInicio,
    clone.periodo_inicio_hora,
    clone.periodoInicioHora
  ]);

  let end = normalizeAreaTimeFromList([
    clone.end,
    clone.hora_fim,
    clone.horaFim,
    clone.hora_final,
    clone.horaFinal,
    clone.fim_hora,
    clone.fimHora,
    clone.termino,
    clone.hora_reserva_fim,
    clone.horaReservaFim,
    clone.periodo_fim_hora,
    clone.periodoFimHora
  ]);

  if((!start || !end) && clone.periodo){
    const periodoTimes = extractPeriodoTimes(clone.periodo);
    if(periodoTimes){
      if(!start) start = normalizeAreaTime(periodoTimes.start);
      if(!end && periodoTimes.end) end = normalizeAreaTime(periodoTimes.end);
    }
  }

  if(!date || !start || !end) return null;
  if(minutesFromTime(end) <= minutesFromTime(start)) return null;

  let dateEnd = normalizeAreaDateFromList([
    clone.date_end,
    clone.data_fim,
    clone.dataFim,
    clone.dataFinal,
    clone.data_final,
    clone.fim_data,
    clone.fimData,
    clone.termino_data,
    clone.terminoData,
    clone.reserva_data_fim,
    clone.reservaDataFim
  ]);
  if(!dateEnd && periodoDates && periodoDates.end){
    dateEnd = periodoDates.end;
  }
  if(!dateEnd || dateEnd < date){
    dateEnd = date;
  }

  let id = clone.id || clone._id || clone.uuid || clone.codigo || clone.key || null;
  if(id) id = String(id);
  clone.id = id || `assignment-${new mongoose.Types.ObjectId().toString()}`;

  clone.date = date;
  clone.date_end = dateEnd;
  clone.start = start;
  clone.end = end;

  const habId = extractIdValue(entry.habitacao_id ?? entry.habitacaoId ?? clone.habitacao_id ?? clone.habitacaoId ?? '');
  clone.habitacao_id = habId;

  const habLabel = extractTextValue(entry.habitacao_label ?? entry.habitacaoLabel ?? entry.habitacao_nome ?? clone.habitacao_label ?? '');
  clone.habitacao_label = habLabel ? habLabel.slice(0, 180) : '';

  const moradorId = extractIdValue(entry.morador_id ?? entry.moradorId ?? clone.morador_id ?? '');
  clone.morador_id = moradorId;

  const moradorNome = extractTextValue(entry.morador_nome ?? entry.moradorNome ?? clone.morador_nome ?? '');
  clone.morador_nome = moradorNome ? moradorNome.slice(0, 180) : '';

  const observacaoRaw = entry.observacao ?? entry.obs ?? clone.observacao ?? '';
  const observacaoText = extractTextValue(observacaoRaw);
  clone.observacao = observacaoText ? observacaoText.slice(0, 4000) : '';

  const enviarRaw = entry.enviar_comunicado ?? entry.notificar ?? clone.enviar_comunicado;
  clone.enviar_comunicado = enviarRaw === false ? false : !!enviarRaw;

  const termoRaw = extractTextValue(entry.termo_status ?? entry.status_termo ?? clone.termo_status ?? 'pending');
  clone.termo_status = termoRaw ? termoRaw.slice(0, 64).toLowerCase() : 'pending';

  clone.financeiro = sanitizeFinanceiro(entry.financeiro || clone.financeiro);
  clone.cessionario = sanitizePessoa(entry.cessionario || entry.responsavel || entry.cessionario_detalhes || clone.cessionario);
  const prepostoSnapshot = sanitizePessoa(entry.preposto || entry.preposto_dados || entry.prepostoDetalhes || clone.preposto);
  clone.preposto = prepostoSnapshot;

  const prepostoNomeRaw = entry.preposto_nome ?? clone.preposto_nome ?? (prepostoSnapshot && prepostoSnapshot.nome) ?? '';
  let prepostoNome = extractTextValue(prepostoNomeRaw);
  if(!prepostoNome && prepostoSnapshot && typeof prepostoSnapshot === 'object'){
    const dadosNome = prepostoSnapshot.dados && extractTextValue(prepostoSnapshot.dados.nome || prepostoSnapshot.dados);
    if(dadosNome) prepostoNome = dadosNome;
    else {
      prepostoNome = extractTextValue(prepostoSnapshot.nome || prepostoSnapshot.label || prepostoSnapshot.titulo);
    }
  }
  clone.preposto_nome = prepostoNome ? prepostoNome.slice(0, 180) : '';

  const prepostoFuncaoRaw = entry.preposto_funcao ?? clone.preposto_funcao ?? (prepostoSnapshot && prepostoSnapshot.funcao) ?? '';
  let prepostoFuncao = extractTextValue(prepostoFuncaoRaw);
  if(!prepostoFuncao && prepostoSnapshot && typeof prepostoSnapshot === 'object'){
    const dadosFuncao = prepostoSnapshot.dados && extractTextValue(prepostoSnapshot.dados.funcao || prepostoSnapshot.dados.cargo);
    if(dadosFuncao) prepostoFuncao = dadosFuncao;
    else {
      prepostoFuncao = extractTextValue(prepostoSnapshot.funcao || prepostoSnapshot.cargo || prepostoSnapshot.titulo);
    }
  }
  clone.preposto_funcao = prepostoFuncao ? prepostoFuncao.slice(0, 120) : '';

  if(!clone.preposto_nome && clone.preposto && typeof clone.preposto === 'object'){
    const nomeFromSnapshot = extractTextValue((clone.preposto.dados && clone.preposto.dados.nome) ? clone.preposto.dados.nome : clone.preposto.dados || clone.preposto.nome || clone.preposto.label || '');
    if(nomeFromSnapshot) clone.preposto_nome = nomeFromSnapshot.slice(0, 180);
  }

  if(!clone.preposto_funcao && clone.preposto && typeof clone.preposto === 'object'){
    const funcaoFromSnapshot = extractTextValue((clone.preposto.dados && (clone.preposto.dados.funcao || clone.preposto.dados.cargo || clone.preposto.dados.titulo)) || clone.preposto.funcao || clone.preposto.cargo || '');
    if(funcaoFromSnapshot) clone.preposto_funcao = funcaoFromSnapshot.slice(0, 120);
  }

  clone.materiais = sanitizeMateriaisList(entry.materiais || clone.materiais);

  const materiaisResumo = extractTextValue(entry.materiais_resumo ?? clone.materiais_resumo ?? '');
  clone.materiais_resumo = materiaisResumo ? materiaisResumo.slice(0, 2000) : '';

  clone.foro = sanitizeForo(entry.foro || entry.foro_detalhes || clone.foro);

  const pagamentoLabel = extractTextValue(entry.pagamento_status_label ?? clone.pagamento_status_label ?? '');
  clone.pagamento_status_label = pagamentoLabel ? pagamentoLabel.slice(0, 120) : '';

  delete clone.__persisted;
  delete clone._persisted;
  delete clone.persisted;

  return clone;
}

function sanitizeAssignments(raw){
  if(!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];

  raw.forEach(entry => {
    const normalized = sanitizeAssignment(entry);
    if(!normalized) return;

    let id = normalized.id || `assignment-${new mongoose.Types.ObjectId().toString()}`;
    const baseId = id;
    let suffix = 1;
    while(seen.has(id)){
      suffix += 1;
      id = `${baseId}-${suffix}`;
    }
    normalized.id = id;
    seen.add(id);
    out.push(normalized);
  });

  out.sort((a, b) => {
    if(a.date === b.date){
      const diff = minutesFromTime(a.start) - minutesFromTime(b.start);
      if(diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    }
    return a.date < b.date ? -1 : 1;
  });

  return out;
}

function sanitizeCessaoPayload(body){
  const payload = body && typeof body === 'object' ? body : {};
  const prepostoPayload = payload.preposto || payload.preposto_dados || payload.prepostoDetalhes || null;
  const materiaisPayloadBase = payload.materiais && typeof payload.materiais === 'object'
    ? cloneJson(payload.materiais)
    : {};
  if(!Array.isArray(materiaisPayloadBase.disponiveis)){
    materiaisPayloadBase.disponiveis = payload.materiais_disponiveis
      || payload.materiaisDisponiveis
      || payload.materiaisDisponivel
      || [];
  }
  if(!Array.isArray(materiaisPayloadBase.extraidos)){
    materiaisPayloadBase.extraidos = payload.materiais_extraidos
      || payload.materiaisExtraidos
      || [];
  }
  const materiaisPayload = materiaisPayloadBase;
  const materiais = sanitizeMateriaisPayload(materiaisPayload);
  let materiaisResumo = extractTextValue(payload.materiais_resumo ?? payload.materiaisResumo ?? materiais.resumo ?? '');
  if(materiaisResumo){
    materiaisResumo = materiaisResumo.slice(0, 2000);
    materiais.resumo = materiaisResumo;
  } else if(materiais.resumo){
    materiaisResumo = materiais.resumo;
  } else {
    materiaisResumo = '';
  }
  return {
    cessoes: sanitizeAssignments(payload.cessoes || payload.emprestimos || payload.reservas || []),
    contratos: sanitizeContracts(payload.contratos || payload.contracts || []),
    responsabilidades: sanitizeResponsabilidades(payload.responsabilidades),
    materiais,
    materiais_resumo: materiaisResumo,
    financeiro: sanitizeFinanceiro(payload.financeiro),
    foro: sanitizeForo(payload.foro),
    preposto: sanitizePessoa(prepostoPayload)
  };
}

function prepareAssignmentForResponse(entry){
  if(!entry) return null;
  const normalized = sanitizeAssignment(entry);
  let clone = normalized;
  if(!clone){
    try{
      clone = cloneJson(entry);
    }catch(_){
      clone = toPlainObject(entry);
    }
  }
  if(!clone) return null;
  clone.__persisted = true;
  clone._persisted = true;
  clone.persisted = true;
  return clone;
}

function buildCessaoResponse(doc){
  if(!doc){
    return {
      areaId: null,
      cessoes: [],
      contratos: [],
      responsabilidades: [],
      materiais: { disponiveis: [], extraidos: [] },
      materiais_disponiveis: [],
      materiaisDisponiveis: [],
      materiais_extraidos: [],
      materiaisExtraidos: [],
      materiais_resumo: '',
      materiaisResumo: '',
      financeiro: null,
      foro: { estado: '', municipio: '', vara: '' },
      preposto: null,
      updatedAt: null,
      updatedBy: null,
      updatedByNome: ''
    };
  }
  const materiaisResumoDoc = typeof doc.materiais_resumo === 'string' ? doc.materiais_resumo.trim() : '';
  const materiaisResumoEmbedded = doc.materiais && typeof doc.materiais === 'object' && typeof doc.materiais.resumo === 'string'
    ? doc.materiais.resumo.trim()
    : '';
  const materiaisResumo = materiaisResumoDoc || materiaisResumoEmbedded;
  const cessoes = Array.isArray(doc.cessoes) ? doc.cessoes.map(prepareAssignmentForResponse).filter(Boolean) : [];
  const contratos = Array.isArray(doc.contratos) ? doc.contratos.map(entry => cloneJson(entry)) : [];
  const responsabilidades = Array.isArray(doc.responsabilidades) ? doc.responsabilidades.map(entry => cloneJson(entry)) : [];
  const materiais = doc.materiais && typeof doc.materiais === 'object'
    ? {
        disponiveis: Array.isArray(doc.materiais.disponiveis) ? doc.materiais.disponiveis.map(entry => cloneJson(entry)) : [],
        extraidos: Array.isArray(doc.materiais.extraidos) ? doc.materiais.extraidos.map(entry => cloneJson(entry)) : []
      }
    : { disponiveis: [], extraidos: [] };
  if(materiaisResumo){
    materiais.resumo = materiaisResumo;
  }
  const materiaisDisponiveis = (materiais.disponiveis || []).map(entry => cloneJson(entry));
  const materiaisExtraidos = (materiais.extraidos || []).map(entry => cloneJson(entry));
  const fallbackMateriais = Array.isArray(materiais.extraidos) ? materiais.extraidos.filter(Boolean) : [];
  if((fallbackMateriais.length || materiaisResumo) && cessoes.length){
    cessoes.forEach(item => {
      if(!item || typeof item !== 'object') return;
      const needsMateriais = !Array.isArray(item.materiais) || !item.materiais.length;
      if(needsMateriais && fallbackMateriais.length){
        item.materiais = fallbackMateriais.map(entry => cloneJson(entry));
      }
      const hasResumo = typeof item.materiais_resumo === 'string' && item.materiais_resumo.trim();
      if(!hasResumo && materiaisResumo){
        item.materiais_resumo = materiaisResumo;
      }
    });
  }
  const financeiro = doc.financeiro ? cloneJson(doc.financeiro) : null;
  const foro = doc.foro ? { ...doc.foro } : { estado: '', municipio: '', vara: '' };
  return {
    areaId: doc.area_id ? String(doc.area_id) : null,
    cessoes,
    contratos,
    responsabilidades,
    materiais,
     materiais_disponiveis: materiaisDisponiveis,
     materiaisDisponiveis,
     materiais_extraidos: materiaisExtraidos,
     materiaisExtraidos,
    materiais_resumo: materiaisResumo,
    materiaisResumo,
    financeiro,
    foro,
    preposto: doc.preposto ? sanitizePessoa(doc.preposto) : null,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updated_by || null,
    updatedByNome: doc.updated_by_nome || ''
  };
}

// Listagem/busca com escopo por unidade e enriquecimento de unidade
app.get('/api/areas-comuns/busca', async (req, res) => {
  const { unidade, nome } = req.query || {};
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json([]); }
    const filtro = {};
    if(unidade){ filtro.unidade_id = unidade; }
    else {
      try{
        const ctxUser = req.user || (req.session && req.session.user) || null;
        const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
        const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
        if(!isAdmin){
          const unitIds = (unidadesOptions||[]).map(u => u._id);
          if (!unitIds.length) {
            filtro._id = { $exists: false };
          } else {
            filtro.unidade_id = { $in: unitIds };
          }
        }
      }catch{}
    }
    if(nome){ filtro.nome = { $regex: nome, $options: 'i' }; }
    const list = await CondAreaComum.find(filtro).lean();
    const areaIds = list.map(a => a && a._id ? a._id : null).filter(Boolean);
    const unitIds = [...new Set(list.map(a => a.unidade_id).filter(Boolean))];

    const unidadeSelectFields = '_id codigo nome razaoSocial cnpj cpf pessoaTipo inscricaoEstadual inscricaoMunicipal cnaePrincipal cnaeSecundarios regimeTributario naturezaJuridica tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal diretor_usuario_id pixChave tipoPix banco agencia contaCorrente is_principal subunidade unidade_principal_id dataAbertura';

    const [unidades, materiaisVinculados] = await Promise.all([
      unitIds.length ? unidadesReadRepoFromReq(req).find({ _id: { $in: unitIds } }, { select: unidadeSelectFields }) : [],
      areaIds.length ? CondBemMaterial.find({ 'vinculo_area.area_id': { $in: areaIds } })
        .select('_id unidade_id tipo natureza_id serie data_aquisicao marca modelo num_serie peso cor descricao foto anexo vinculo_area ativa createdAt updatedAt')
        .lean() : []
    ]);

    const unidadePayloadMap = new Map();
    unidades.forEach(u => {
      const payload = buildUnidadePayload(u);
      if(payload) unidadePayloadMap.set(String(u._id), payload);
    });

    const areaPayloadMap = new Map();
    list.forEach(a => {
      if(!a || !a._id) return;
      const key = String(a._id);
      const unidade = a.unidade_id ? unidadePayloadMap.get(String(a.unidade_id)) || null : null;
      areaPayloadMap.set(key, {
        _id: key,
        id: key,
        areaId: key,
        nome: a.nome || '',
        codigo: a.codigo || '',
        unidade_id: a.unidade_id ? String(a.unidade_id) : null,
        unidade
      });
    });

    let materiaisPorArea = new Map();
    if(materiaisVinculados.length){
      const naturezaIds = [...new Set(materiaisVinculados.map(m => m && m.natureza_id ? String(m.natureza_id) : null).filter(Boolean))];
      const naturezas = naturezaIds.length ? await CondNatMaterial.find({ _id: { $in: naturezaIds } }).select('_id nome tipo').lean() : [];
      const naturezaMap = new Map(naturezas.map(n => [String(n._id), {
        _id: String(n._id),
        nome: n && n.nome ? n.nome : '',
        tipo: n && n.tipo ? n.tipo : ''
      }]));

      materiaisPorArea = materiaisVinculados.reduce((map, mat) => {
        if(!mat || mat.ativa === false) return map;
        const areaId = mat.vinculo_area && mat.vinculo_area.area_id ? String(mat.vinculo_area.area_id) : '';
        if(!areaId) return map;
        if(!map.has(areaId)) map.set(areaId, []);
        const unidadeId = mat && mat.unidade_id ? String(mat.unidade_id) : '';
        if(unidadeId && !unidadePayloadMap.has(unidadeId)){
          const unitDoc = unidades.find(u => u && String(u._id) === unidadeId);
          if(unitDoc){
            const payload = buildUnidadePayload(unitDoc);
            if(payload){
              unidadePayloadMap.set(unidadeId, payload);
              if(areaPayloadMap.has(areaId)){
                const areaPayload = areaPayloadMap.get(areaId) || {};
                areaPayloadMap.set(areaId, {
                  ...areaPayload,
                  unidade: payload,
                  unidade_id: payload._id || areaPayload.unidade_id || null
                });
              }
            }
          }
        }
        const payload = buildMaterialSnapshot(mat, {
          naturezaMap,
          unidadeMap: unidadePayloadMap,
          areaMap: areaPayloadMap
        });
        if(payload) map.get(areaId).push(payload);
        return map;
      }, new Map());
    }
    const buildMateriais = areaId => {
      const lista = materiaisPorArea.get(String(areaId));
      if(!Array.isArray(lista)) return [];
      return lista.slice().sort((a, b) => {
        const nomeA = (a && a.nome) ? String(a.nome) : '';
        const nomeB = (b && b.nome) ? String(b.nome) : '';
        const nomeComp = nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        if(nomeComp !== 0) return nomeComp;
        const patA = a && (a.patrimonio || a.serie) ? String(a.patrimonio || a.serie) : '';
        const patB = b && (b.patrimonio || b.serie) ? String(b.patrimonio || b.serie) : '';
        return patA.localeCompare(patB, 'pt-BR', { sensitivity: 'base' });
      });
    };

    const result = list.map(a => ({
      _id: a._id,
      unidade: unidadePayloadMap.get(String(a.unidade_id)) || { _id: a.unidade_id },
      nome: a.nome,
      area_m2: a.area_m2 != null ? a.area_m2 : null,
      capacidade: a.capacidade != null ? Number(a.capacidade) : null,
      taxa_reserva: a.taxa_reserva != null ? Number(a.taxa_reserva) : null,
      regras_uso: a.regras_uso || '',
      obs: a.obs || '',
      foto: a.foto || '',
      materiais: buildMateriais(a._id),
      disponibilidades: mapAreaScheduleForResponse(a.disponibilidades),
      restricoes: mapAreaRestrictionsForResponse(a.restricoes)
    }));
    res.json(result);
  }catch(e){ console.error('[api/areas-comuns/busca] erro GET', e); res.status(200).json([]); }
});

app.get('/api/areas-comuns/lista', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const unidadeParam = req.query && (req.query.unidade || req.query.unidade_id || req.query.unidadeId)
    ? String(req.query.unidade || req.query.unidade_id || req.query.unidadeId).trim()
    : '';
  const searchTerm = req.query && (req.query.nome || req.query.search || req.query.q || req.query.termo)
    ? String(req.query.nome || req.query.search || req.query.q || req.query.termo).trim()
    : '';
  const includeInactiveRaw = req.query && (req.query.inativas || req.query.includeInactive || req.query.incluirInativas || req.query.showInativas);
  const includeInactive = typeof includeInactiveRaw === 'string'
    ? includeInactiveRaw.toLowerCase()
    : (includeInactiveRaw === true ? 'true' : '');
  const tipoFilterRaw = req.query && req.query.tipo ? String(req.query.tipo).trim() : '';
  const tipoFilter = tipoFilterRaw ? tipoFilterRaw.toLowerCase() : '';
  const limitParam = Number(req.query && req.query.limit ? req.query.limit : 0);

  if(!unidadeParam){
    return res.status(400).json({ error:'Parâmetro unidade é obrigatório' });
  }

  try{
    if(mongoose.connection.readyState !== 1){
      try{ res.set('Retry-After','5'); }catch{}
      return res.status(503).json({ error:'Banco indisponível, tente novamente' });
    }
    const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
    if(!isAdmin){
      const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
      const allowed = new Set((unidadesOptions || []).map(u => String(u._id)));
      if(allowed.size && !allowed.has(unidadeParam)){
        return res.status(403).json({ error:'Unidade não autorizada para este usuário' });
      }
    }

    const filtro = { unidade_id: unidadeParam };
    if(searchTerm){
      filtro.nome = { $regex: escapeRegex(searchTerm), $options: 'i' };
    }
    if(includeInactive !== 'true' && includeInactive !== '1'){
      filtro.ativa = { $ne: false };
    }

    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.max(Math.floor(limitParam), 1), 500) : null;
    const query = CondAreaComum.find(filtro)
      .select('_id unidade_id nome tipo capacidade area_m2 regras_uso obs foto disponibilidades restricoes taxa_reserva ativa codigo descricao updatedAt createdAt');
    if(limit) query.limit(limit);
    const docs = await query.sort({ nome: 1 }).lean();

    if(!docs.length) return res.json([]);

    const areaIds = docs.map(doc => doc && doc._id ? doc._id : null).filter(Boolean);
    const unidadeIds = [...new Set(docs.map(doc => doc && doc.unidade_id ? String(doc.unidade_id) : null).filter(Boolean))];
    const [unidadeDocs, cessaoDocs] = await Promise.all([
      unidadeIds.length
        ? unidadesReadRepoFromReq(req).find(
            { _id: { $in: unidadeIds } },
            { select: '_id codigo nome razaoSocial endereco telefoneFixo telefoneCelular logo pixChave tipoPix cnpj cpf pessoaTipo cidade estado' }
          )
        : [],
      areaIds.length
        ? CondAreaCessao.find({ area_id: { $in: areaIds } })
            .select('area_id cessoes updatedAt')
            .lean()
        : []
    ]);
    const unidadeMap = new Map(unidadeDocs.map(doc => [String(doc._id), buildUnidadePayload(doc)]));
    const cessaoMap = new Map(cessaoDocs.map(doc => [String(doc.area_id), doc]));

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const payload = docs.map(doc => {
      const unidadePayload = unidadeMap.get(String(doc.unidade_id)) || null;
      const cessao = cessaoMap.get(String(doc._id)) || null;
      const assignments = sanitizeAssignments(cessao && Array.isArray(cessao.cessoes) ? cessao.cessoes : []);
      const reservasInfo = buildReservasPanelSnapshot(assignments, now);
      const restricoes = mapAreaRestrictionsForResponse(doc.restricoes);
      const emManutencao = determineAreaMaintenanceFlag(doc, restricoes, todayIso, nowMinutes);
      const tipoValue = doc.tipo && typeof doc.tipo === 'object' ? doc.tipo : (doc.tipo || '');
      return {
        _id: String(doc._id),
        id: String(doc._id),
        nome: doc.nome || '',
        codigo: doc.codigo || '',
        unidade_id: doc.unidade_id ? String(doc.unidade_id) : null,
        unidade: unidadePayload,
        tipo: tipoValue,
        tipo_area: tipoValue,
        capacidade: doc.capacidade != null ? Number(doc.capacidade) : null,
        area_m2: doc.area_m2 != null ? Number(doc.area_m2) : null,
        taxa_reserva: doc.taxa_reserva != null ? Number(doc.taxa_reserva) : null,
        regras: doc.regras_uso || '',
        regras_resumo: summarizeRulesText(doc.regras_uso),
        localizacao: doc.obs || '',
        obs: doc.obs || '',
        foto: doc.foto || '',
        disponibilidades: mapAreaScheduleForResponse(doc.disponibilidades),
        restricoes,
        reservas_ativas: reservasInfo.itens,
        reservado_no_dia: reservasInfo.reservadoHoje,
        em_manutencao: emManutencao,
        status_operacional: doc.ativa === false ? 'inativa' : (emManutencao ? 'manutencao' : (reservasInfo.reservadoHoje ? 'reservado' : 'disponivel')),
        ativa: doc.ativa !== false,
        atualizado_em: doc.updatedAt || null,
        criado_em: doc.createdAt || null
      };
    });

    let filtered = payload;
    if(tipoFilter){
      filtered = payload.filter(area => {
        const tipoValue = typeof area.tipo === 'string'
          ? area.tipo
          : (area.tipo && (area.tipo.slug || area.tipo.nome || area.tipo.id) || '');
        return tipoValue && tipoValue.toLowerCase() === tipoFilter;
      });
    }

    return res.json(filtered);
  }catch(e){
    console.error('[api/areas-comuns/lista] GET erro', e);
    return res.status(500).json({ error:'Falha ao listar áreas comuns', detail:e.message });
  }
});

async function resolveAreaMaterialContextRead({ req, areaId }) {
  const areaDoc = await CondAreaComum.findById(areaId).lean();
  if (!areaDoc) return { status: 404, error: 'Área comum não encontrada' };

  const unidadeDoc = areaDoc.unidade_id ? await unidadesReadRepoFromReq(req).findById(areaDoc.unidade_id) : null;
  const unidadePayload = unidadeDoc ? buildUnidadePayload(unidadeDoc) : null;
  const areaPayload = buildAreaContextPayload(areaDoc, unidadePayload);

  const materiaisOrigemDocs = await CondBemMaterial.find({ 'vinculo_area.area_id': areaDoc._id, ativa: { $ne: false } })
    .select('_id unidade_id natureza_id serie tipo descricao vinculo_area createdAt updatedAt')
    .lean();
  const materialMap = new Map();
  materiaisOrigemDocs.forEach(doc => {
    if(doc && doc._id){
      materialMap.set(String(doc._id), doc);
    }
  });

  const destinosDocs = await CondAreaComum.find({ unidade_id: areaDoc.unidade_id, _id: { $ne: areaDoc._id } })
    .select('_id nome unidade_id codigo')
    .lean();

  const areaMap = new Map();
  if (areaPayload) areaMap.set(areaPayload._id, areaPayload);

  const destinos = [];
  destinosDocs.forEach(doc => {
    const destinoPayload = buildDestinoPayload(doc, unidadePayload);
    if(destinoPayload) destinos.push(destinoPayload);
    const ctxPayload = buildAreaContextPayload(doc, unidadePayload);
    if(ctxPayload) areaMap.set(ctxPayload._id, ctxPayload);
  });

  return {
    areaDoc,
    areaPayload,
    unidadePayload,
    materiaisOrigemDocs,
    materialMap,
    areaMap,
    destinos,
  };
}

async function resolveAreaMaterialPendingTransferRead({ areaDoc, unidadePayload, materialMap, areaMap }) {
  const transferDocs = await CondMaterialTransferencia.find({
    status: 'pendente',
    $or: [
      { origem_area_id: areaDoc._id },
      { destino_area_id: areaDoc._id }
    ]
  }).lean();

  const transferMaterialIds = new Set();
  transferDocs.forEach(tr => {
    if(tr && tr.material_id){
      transferMaterialIds.add(String(tr.material_id));
    }
  });
  const missingMaterialIds = [...transferMaterialIds].filter(id => !materialMap.has(id));
  if(missingMaterialIds.length){
    const extraMaterials = await CondBemMaterial.find({ _id: { $in: missingMaterialIds } })
      .select('_id unidade_id natureza_id serie tipo descricao vinculo_area createdAt updatedAt')
      .lean();
    extraMaterials.forEach(doc => {
      if(doc && doc._id){
        materialMap.set(String(doc._id), doc);
      }
    });
  }

  const transferAreaIds = new Set();
  transferDocs.forEach(tr => {
    if(tr && tr.origem_area_id){
      const origemId = String(tr.origem_area_id);
      if(!areaMap.has(origemId)) transferAreaIds.add(origemId);
    }
    if(tr && tr.destino_area_id){
      const destinoId = String(tr.destino_area_id);
      if(!areaMap.has(destinoId)) transferAreaIds.add(destinoId);
    }
  });
  if(transferAreaIds.size){
    const extraAreas = await CondAreaComum.find({ _id: { $in: Array.from(transferAreaIds) } })
      .select('_id nome unidade_id codigo')
      .lean();
    extraAreas.forEach(doc => {
      if(!doc || !doc._id) return;
      const ctxPayload = buildAreaContextPayload(doc, unidadePayload);
      if(ctxPayload) areaMap.set(ctxPayload._id, ctxPayload);
    });
  }

  return { transferDocs, materialMap, areaMap };
}

async function buildAreaMaterialContextResponsePayload({ areaIdParam, areaPayload, unidadePayload, materiaisOrigemDocs, materialMap, areaMap, destinos, transferDocs }) {
  const allMaterialDocs = Array.from(materialMap.values());
  const naturezaIds = [...new Set(allMaterialDocs.map(doc => doc && doc.natureza_id ? String(doc.natureza_id) : null).filter(Boolean))];
  const naturezas = naturezaIds.length ? await CondNatMaterial.find({ _id: { $in: naturezaIds } }).select('_id nome tipo').lean() : [];
  const naturezaMap = new Map(naturezas.map(n => [String(n._id), { _id: String(n._id), nome: n && n.nome ? n.nome : '', tipo: n && n.tipo ? n.tipo : '' }]));
  const unidadeMap = new Map();
  if(unidadePayload) unidadeMap.set(String(unidadePayload._id), unidadePayload);

  const areaId = areaPayload ? String(areaPayload._id) : areaIdParam;
  const pendentesOrigemIds = new Set(
    transferDocs
      .filter(tr => tr && tr.origem_area_id && String(tr.origem_area_id) === areaId)
      .map(tr => String(tr.material_id))
  );

  const materiaisArea = materiaisOrigemDocs
    .filter(doc => {
      const idStr = doc && doc._id ? String(doc._id) : '';
      if(!idStr) return true;
      return !pendentesOrigemIds.has(idStr);
    })
    .map(doc => buildMaterialSnapshot(doc, { naturezaMap, unidadeMap, areaMap }))
    .filter(Boolean);

  const compareByNome = (a, b) => {
    const nomeA = (a && a.nome) ? String(a.nome) : '';
    const nomeB = (b && b.nome) ? String(b.nome) : '';
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
  };

  materiaisArea.sort((a, b) => {
    const nomeCmp = compareByNome(a, b);
    if(nomeCmp !== 0) return nomeCmp;
    const patA = (a && a.patrimonio) ? String(a.patrimonio) : '';
    const patB = (b && b.patrimonio) ? String(b.patrimonio) : '';
    return patA.localeCompare(patB, 'pt-BR', { sensitivity: 'base' });
  });

  destinos.sort((a, b) => compareByNome(a, b));

  const materiaisReceber = [];
  const materiaisTransferidos = [];
  transferDocs.forEach(tr => {
    if(!tr || !tr.material_id) return;
    const materialDoc = materialMap.get(String(tr.material_id));
    if(!materialDoc) return;
    const destinoId = tr.destino_area_id ? String(tr.destino_area_id) : '';
    const origemId = tr.origem_area_id ? String(tr.origem_area_id) : '';
    let role = '';
    if(destinoId && destinoId === areaId) role = 'destino';
    else if(origemId && origemId === areaId) role = 'origem';
    if(!role) return;
    const payload = buildTransferMaterialSnapshot(materialDoc, tr, {
      naturezaMap,
      unidadeMap,
      areaMap,
      role
    });
    if(!payload) return;
    if(role === 'destino') materiaisReceber.push(payload);
    else materiaisTransferidos.push(payload);
  });

  const sortByTransferChrono = list => {
    list.sort((a, b) => {
      const getTime = item => {
        const source = (item && item.transferencia && item.transferencia.atualizadoEm)
          || item.transferenciaAtualizadaEm
          || item.atualizadoEm;
        const parsed = source ? Date.parse(source) : 0;
        if(Number.isNaN(parsed)) return 0;
        return parsed;
      };
      const diff = getTime(b) - getTime(a);
      if(diff !== 0) return diff;
      return compareByNome(a, b);
    });
  };

  sortByTransferChrono(materiaisReceber);
  sortByTransferChrono(materiaisTransferidos);

  return {
    area: areaPayload,
    unidade: unidadePayload,
    areaId: areaPayload ? areaPayload._id : null,
    unidadeId: unidadePayload ? unidadePayload._id : null,
    materiaisArea,
    materiaisReceber,
    materiaisTransferidos,
    destinos
  };
}

async function resolvePendingMaterialTransferRequest({ areaId, materialId, destinoId }) {
  const [areaDoc, destinoDoc, materialDoc] = await Promise.all([
    CondAreaComum.findById(areaId).lean(),
    CondAreaComum.findById(destinoId).lean(),
    CondBemMaterial.findById(materialId).lean()
  ]);

  if (!areaDoc) return { status: 404, error: 'Área de origem não encontrada' };
  if (!materialDoc) return { status: 404, error: 'Material não encontrado' };
  if (!destinoDoc) return { status: 404, error: 'Área de destino não encontrada' };

  if (String(destinoDoc._id) === String(areaDoc._id)) {
    return { status: 400, error: 'Área de destino deve ser diferente da área de origem' };
  }

  const origemAreaId = materialDoc.vinculo_area && materialDoc.vinculo_area.area_id ? String(materialDoc.vinculo_area.area_id) : null;
  if (origemAreaId && origemAreaId !== areaId) {
    return { status: 409, error: 'Material não está vinculado à área informada' };
  }

  const origemUnidadeId = areaDoc.unidade_id ? String(areaDoc.unidade_id) : null;
  const destinoUnidadeId = destinoDoc.unidade_id ? String(destinoDoc.unidade_id) : null;
  if (origemUnidadeId && destinoUnidadeId && origemUnidadeId !== destinoUnidadeId) {
    return { status: 400, error: 'Área de destino pertence a outro condomínio' };
  }
  if (materialDoc.unidade_id && origemUnidadeId && String(materialDoc.unidade_id) !== origemUnidadeId) {
    return { status: 409, error: 'Material pertence a outro condomínio' };
  }

  const existingPending = await CondMaterialTransferencia.findOne({
    material_id: materialDoc._id,
    status: 'pendente'
  }).lean();
  if (existingPending) {
    return { status: 409, error: 'Este material já possui uma transferência pendente.' };
  }

  return {
    areaDoc,
    destinoDoc,
    materialDoc,
    unidadeId: origemUnidadeId || destinoUnidadeId || (materialDoc.unidade_id ? String(materialDoc.unidade_id) : null)
  };
}

function buildPendingMaterialTransferResponse(transferDoc) {
  return {
    ok: true,
    transferencia: {
      id: String(transferDoc._id),
      materialId: String(transferDoc.material_id),
      origemId: String(transferDoc.origem_area_id),
      destinoId: String(transferDoc.destino_area_id),
      status: transferDoc.status || 'pendente',
      criadoEm: toIsoString(transferDoc.createdAt)
    }
  };
}

async function resolvePendingMaterialReceiptRequest({ areaId, transferenciaId, materialId }) {
  const [destinoAreaDoc, transferDoc] = await Promise.all([
    CondAreaComum.findById(areaId).lean(),
    CondMaterialTransferencia.findById(transferenciaId)
  ]);
  if (!destinoAreaDoc) return { status: 404, error: 'Área de destino não encontrada' };
  if (!transferDoc) return { status: 404, error: 'Transferência não encontrada' };

  if (String(transferDoc.destino_area_id) !== areaId) {
    return { status: 409, error: 'A transferência não pertence a esta área' };
  }
  if (String(transferDoc.material_id) !== String(materialId)) {
    return { status: 409, error: 'Material divergente da transferência' };
  }
  if (transferDoc.status && transferDoc.status !== 'pendente') {
    return { status: 409, error: 'Transferência já processada' };
  }

  const materialDoc = await CondBemMaterial.findById(materialId).lean();
  if (!materialDoc) return { status: 404, error: 'Material não encontrado' };

  const origemAreaId = transferDoc.origem_area_id ? String(transferDoc.origem_area_id) : '';
  const unidadeId = transferDoc.unidade_id
    || (destinoAreaDoc.unidade_id ? String(destinoAreaDoc.unidade_id) : '')
    || (materialDoc.unidade_id ? String(materialDoc.unidade_id) : '');

  return {
    destinoAreaDoc,
    transferDoc,
    materialDoc,
    origemAreaId,
    unidadeId,
  };
}

async function applyPendingMaterialReceiptDecision({ isApprove, transferenciaId, materialId, transferDoc, destinoAreaDoc, materialDoc, actor }) {
  let updatedMaterialDoc = materialDoc;
  if (isApprove) {
    const updateSet = {
      'vinculo_area.area_id': transferDoc.destino_area_id,
      'vinculo_area.unidade_id': transferDoc.unidade_id || destinoAreaDoc.unidade_id || materialDoc.unidade_id || null
    };
    updatedMaterialDoc = await CondBemMaterial.findByIdAndUpdate(
      materialId,
      { $set: updateSet },
      { new: true, runValidators: true, timestamps: true }
    ).lean();
    if (!updatedMaterialDoc) return { status: 500, error: 'Falha ao atualizar o material' };
  }

  const now = new Date();
  const transferUpdate = {
    status: isApprove ? 'aceito' : 'recusado'
  };
  if (isApprove) {
    transferUpdate.aceite = actor || null;
    transferUpdate.aceite_em = now;
  } else {
    transferUpdate.cancelado = actor || null;
    transferUpdate.cancelado_em = now;
  }

  const updatedTransfer = await CondMaterialTransferencia.findByIdAndUpdate(
    transferenciaId,
    { $set: transferUpdate },
    { new: true }
  ).lean();

  return {
    updatedMaterialDoc,
    updatedTransfer,
    now,
  };
}

async function buildPendingMaterialReceiptResponsePayload({ req, updatedTransfer, updatedMaterialDoc, origemAreaId, destinoAreaDoc, unidadeId, now }) {
  const origemAreaDocPromise = origemAreaId ? CondAreaComum.findById(origemAreaId).lean() : Promise.resolve(null);
  const unidadeDocPromise = unidadeId ? unidadesReadRepoFromReq(req).findById(unidadeId) : Promise.resolve(null);
  const [origemAreaDoc, unidadeDoc] = await Promise.all([origemAreaDocPromise, unidadeDocPromise]);

  const unidadePayload = unidadeDoc ? buildUnidadePayload(unidadeDoc) : null;
  const areaMap = new Map();
  if (origemAreaDoc) {
    const payload = buildAreaContextPayload(origemAreaDoc, unidadePayload);
    if (payload) areaMap.set(payload._id, payload);
  }
  const destinoPayload = buildAreaContextPayload(destinoAreaDoc, unidadePayload);
  if (destinoPayload) areaMap.set(destinoPayload._id, destinoPayload);

  const naturezaId = updatedMaterialDoc && updatedMaterialDoc.natureza_id ? String(updatedMaterialDoc.natureza_id) : null;
  const naturezaDoc = naturezaId ? await CondNatMaterial.findById(naturezaId).select('_id nome tipo').lean() : null;
  const naturezaMap = new Map();
  if (naturezaDoc) {
    naturezaMap.set(String(naturezaDoc._id), {
      _id: String(naturezaDoc._id),
      nome: naturezaDoc.nome || '',
      tipo: naturezaDoc.tipo || ''
    });
  }
  const unidadeMap = new Map();
  if (unidadePayload) unidadeMap.set(String(unidadePayload._id), unidadePayload);

  const materialPayload = buildMaterialSnapshot(updatedMaterialDoc, { naturezaMap, unidadeMap, areaMap });

  return {
    ok: true,
    transferencia: {
      id: String(updatedTransfer._id),
      status: updatedTransfer.status,
      materialId: String(updatedTransfer.material_id),
      origemId: String(updatedTransfer.origem_area_id),
      destinoId: String(updatedTransfer.destino_area_id),
      atualizadoEm: toIsoString(updatedTransfer.updatedAt || now),
      aceiteEm: updatedTransfer.aceite_em ? toIsoString(updatedTransfer.aceite_em) : null,
      canceladoEm: updatedTransfer.cancelado_em ? toIsoString(updatedTransfer.cancelado_em) : null
    },
    material: materialPayload
  };
}

app.post('/api/areas-comuns/:id/materiais/recebimentos', express.json({ limit: '1mb' }), async (req, res) => {
  const areaIdParam = req.params && req.params.id ? String(req.params.id) : '';
  if(!isValidObjectId(areaIdParam)) return res.status(400).json({ error: 'Área inválida' });
  const transferenciaIdRaw = req.body && req.body.transferenciaId;
  const materialIdRaw = req.body && req.body.materialId;
  if(!isValidObjectId(transferenciaIdRaw) || !isValidObjectId(materialIdRaw)){
    return res.status(400).json({ error: 'Dados da transferência inválidos' });
  }
  const actionRaw = req.body && (req.body.acao || req.body.action || req.body.status || '');
  const action = String(actionRaw || '').trim().toLowerCase();
  const isApprove = action === '' || action === 'confirmar' || action === 'aceitar' || action === 'aprovar';
  const isReject = action === 'rejeitar' || action === 'recusar' || action === 'negar';
  if(!isApprove && !isReject){
    return res.status(400).json({ error: 'Ação inválida' });
  }
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error: 'Banco indisponível, tente novamente' }); }
    const receiptResolution = await resolvePendingMaterialReceiptRequest({
      areaId: areaIdParam,
      transferenciaId: transferenciaIdRaw,
      materialId: materialIdRaw
    });
    if(receiptResolution.error){
      return res.status(receiptResolution.status).json({ error: receiptResolution.error });
    }

    const { destinoAreaDoc, transferDoc, materialDoc, origemAreaId, unidadeId } = receiptResolution;
    const actor = buildActorFromUser(req.user || (req.session && req.session.user) || null);
    const receiptDecision = await applyPendingMaterialReceiptDecision({
      isApprove,
      transferenciaId: transferenciaIdRaw,
      materialId: materialIdRaw,
      transferDoc,
      destinoAreaDoc,
      materialDoc,
      actor
    });
    if(receiptDecision.error){
      return res.status(receiptDecision.status).json({ error: receiptDecision.error });
    }

    const { updatedMaterialDoc, updatedTransfer, now } = receiptDecision;
    return res.json(await buildPendingMaterialReceiptResponsePayload({
      req,
      updatedTransfer,
      updatedMaterialDoc,
      origemAreaId,
      destinoAreaDoc,
      unidadeId,
      now
    }));
  }catch(e){
    console.error('[api/areas-comuns/:id/materiais/recebimentos] POST erro', e);
    const message = e && e.message ? e.message : 'Falha ao processar recebimento';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/areas-comuns/:id/materiais/transferencias', express.json({ limit: '1mb' }), async (req, res) => {
  const areaIdParam = req.params && req.params.id ? String(req.params.id) : '';
  if(!isValidObjectId(areaIdParam)) return res.status(400).json({ error: 'Identificador de área inválido' });
  const materialIdRaw = req.body && req.body.materialId;
  const destinoIdRaw = req.body && req.body.destinoId;
  if(!isValidObjectId(materialIdRaw) || !isValidObjectId(destinoIdRaw)){
    return res.status(400).json({ error: 'Dados da transferência inválidos' });
  }
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error: 'Banco indisponível, tente novamente' }); }
    const transferResolution = await resolvePendingMaterialTransferRequest({
      areaId: areaIdParam,
      materialId: materialIdRaw,
      destinoId: destinoIdRaw
    });
    if(transferResolution.error){
      return res.status(transferResolution.status).json({ error: transferResolution.error });
    }

    const { areaDoc, destinoDoc, materialDoc, unidadeId } = transferResolution;

    const solicitante = buildActorFromUser(req.user || (req.session && req.session.user) || null);
    const transferDoc = await CondMaterialTransferencia.create({
      unidade_id: unidadeId || areaDoc.unidade_id,
      material_id: materialDoc._id,
      origem_area_id: areaDoc._id,
      destino_area_id: destinoDoc._id,
      status: 'pendente',
      ...(solicitante ? { solicitante } : {})
    });

    return res.status(201).json(buildPendingMaterialTransferResponse(transferDoc));
  }catch(e){
    console.error('[api/areas-comuns/:id/materiais/transferencias] POST erro', e);
    const message = e && e.message ? e.message : 'Falha ao registrar transferência';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/areas-comuns/:id/materiais/contexto', async (req, res) => {
  const areaIdParam = req.params && req.params.id ? String(req.params.id) : '';
  const secaoRaw = req.query && req.query.secao ? String(req.query.secao) : '';
  if(!isValidObjectId(areaIdParam)) return res.status(400).json({ error: 'Identificador de área inválido' });
  const secao = secaoRaw ? secaoRaw.toLowerCase() : '';
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error: 'Banco indisponível, tente novamente' }); }
    const areaResolution = await resolveAreaMaterialContextRead({ req, areaId: areaIdParam });
    if(areaResolution.error) return res.status(areaResolution.status).json({ error: areaResolution.error });
    const { areaDoc, areaPayload, unidadePayload, materiaisOrigemDocs, materialMap, areaMap, destinos } = areaResolution;
    if(secao === 'logs'){
      const logs = await buildMaterialLogsForArea(areaDoc, unidadesReadRepoFromReq(req));
      return res.json({ logs });
    }
    const pendingTransferRead = await resolveAreaMaterialPendingTransferRead({
      areaDoc,
      unidadePayload,
      materialMap,
      areaMap,
    });
    const { transferDocs } = pendingTransferRead;

    return res.json(await buildAreaMaterialContextResponsePayload({
      areaIdParam,
      areaPayload,
      unidadePayload,
      materiaisOrigemDocs,
      materialMap,
      areaMap,
      destinos,
      transferDocs,
    }));
  }catch(e){
    console.error('[api/areas-comuns/:id/materiais/contexto] GET erro', e);
    const message = e && e.message ? e.message : 'Falha ao carregar contexto de materiais';
    return res.status(500).json({ error: message });
  }
});

const areaComumFotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!file || !file.mimetype) return cb(null, true);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', String(file.fieldname || 'foto')));
  }
});

function parseAreaComumBody(req, res, next) {
  try {
    if (req && typeof req.is === 'function' && req.is('multipart/form-data')) {
      return areaComumFotoUpload.single('foto')(req, res, (err) => {
        if (!err) return next();

        const msg = err && err.code === 'LIMIT_FILE_SIZE'
          ? 'Imagem muito grande (limite 2MB)'
          : 'Imagem inválida. Use PNG, JPG, JPEG ou WEBP.';

        return res.status(err && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
      });
    }

    return express.json({ limit: '2mb' })(req, res, next);
  } catch (_e) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
}

async function uploadAreaComumFotoFile(file) {
  if (!file || !file.buffer) return '';

  const mime = String(file.mimetype || '').toLowerCase();
  const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  if (!allowed.has(mime)) {
    const err = new Error('Tipo não suportado');
    err.status = 400;
    throw err;
  }

  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp'
  };

  const ext = extMap[mime] || 'bin';
  const fileName = `areas-comuns/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';

  const uploaded = await put(fileName, file.buffer, {
    access: 'public',
    contentType: mime,
    cacheControl: 'public, max-age=31536000, immutable',
    ...(blobToken ? { token: blobToken } : {})
  });

  return uploaded.url;
}

// Criar área comum
app.post('/api/areas-comuns', parseAreaComumBody, async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const { unidade_id, nome, area_m2, capacidade, obs, foto } = req.body || {};
    const rawSchedule = req.body && (req.body.disponibilidades || req.body.schedule || req.body.agenda || []);
    const schedule = sanitizeAreaSchedule(rawSchedule);
    const rawRestrictions = req.body && (req.body.restricoes || req.body.restrictions || req.body.bloqueios || req.body.restricoes_agenda || []);
    const restrictions = sanitizeAreaRestrictions(rawRestrictions);
    if(!unidade_id || !nome) return res.status(400).json({ error: 'unidade_id e nome são obrigatórios' });
    let fotoUrl = '';
    let blobFailed=false, blobMissingToken=false, blobTried=false;
    if (req.file) {
      blobTried = true;
      try {
        fotoUrl = await uploadAreaComumFotoFile(req.file);
      } catch (e) {
        console.error('[api/areas-comuns] POST upload blob erro', e);
        blobFailed = true;
        if (e && /No token found/i.test(e.message || '')) blobMissingToken = true;
      }
    } else if(typeof foto === 'string' && foto.startsWith('data:')){
      if(foto.length > 2_000_000) return res.status(413).json({ error: 'Imagem muito grande (~2MB limite)' });
      blobTried = true;
      try{
        const match = /^data:(.+?);base64,(.+)$/.exec(foto);
        if(!match) return res.status(400).json({ error: 'Formato de imagem inválido (data URL)' });
        const mime = match[1]; const b64 = match[2];
        const allowed = ['image/png','image/jpeg','image/jpg','image/webp'];
        if(!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
        const buf = Buffer.from(b64,'base64');
        const extMap = { 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext = extMap[mime]||'bin';
        const fileName = `areas-comuns/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
        const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
        fotoUrl = uploaded.url;
      }catch(e){
        console.error('[api/areas-comuns] erro upload blob', e);
        blobFailed=true;
        if(e && /No token found/i.test(e.message||'')) blobMissingToken=true;
      }
    }
    const areaNum = area_m2!=null && area_m2!=='' ? Number(area_m2) : null;
    if(areaNum!=null && Number.isNaN(areaNum)) return res.status(400).json({ error:'area_m2 inválida' });
    const capInput = (typeof capacidade !== 'undefined') ? capacidade : (req.body && (req.body.capacidade_total ?? req.body.capacidadeMaxima ?? req.body.capacidade_maxima ?? null));
    let capNum = null;
    if(capInput !== undefined && capInput !== null){
      if(typeof capInput === 'string' && capInput.trim() === ''){ capNum = null; }
      else {
        const parsedCap = Number(capInput);
        if(Number.isNaN(parsedCap) || parsedCap < 0 || parsedCap > 999999){ return res.status(400).json({ error:'capacidade inválida' }); }
        capNum = parsedCap;
      }
    }
    try{
      const doc = await CondAreaComum.create({ unidade_id, nome: String(nome).trim(), area_m2: areaNum, capacidade: capNum, obs: (obs||'').toString(), foto: fotoUrl, disponibilidades: schedule, restricoes: restrictions });
      const plain = doc.toObject();
      return res.status(201).json({
        ...plain,
        capacidade: plain.capacidade != null ? Number(plain.capacidade) : null,
        disponibilidades: mapAreaScheduleForResponse(plain.disponibilidades),
        restricoes: mapAreaRestrictionsForResponse(plain.restricoes),
        foto_saved: !!plain.foto,
        blob_tried: blobTried,
        blob_failed: blobFailed,
        blob_missing_token: blobMissingToken
      });
    }catch(e){
      if(e && (e.code === 11000 || (e.name === 'MongoServerError' && e.message && e.message.includes('E11000')))){
        return res.status(409).json({ error:'Já existe uma área com este nome neste condomínio' });
      }
      console.error('[api/areas-comuns] POST erro', e);
      return res.status(500).json({ error:'Falha ao criar área comum', detail: e.message });
    }
  }catch(e){ console.error('[api/areas-comuns] POST erro (outer)', e); res.status(500).json({ error:'Falha ao criar área comum', detail: e.message }); }
});

// Atualizar área comum
app.put('/api/areas-comuns/:id', parseAreaComumBody, async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const id = req.params.id;
    const { unidade_id, nome, area_m2, capacidade, obs, foto } = req.body || {};
    const hasScheduleField = req.body && (Object.prototype.hasOwnProperty.call(req.body, 'disponibilidades') || Object.prototype.hasOwnProperty.call(req.body, 'schedule') || Object.prototype.hasOwnProperty.call(req.body, 'agenda'));
    const hasRestrictionField = req.body && (Object.prototype.hasOwnProperty.call(req.body, 'restricoes') || Object.prototype.hasOwnProperty.call(req.body, 'restrictions') || Object.prototype.hasOwnProperty.call(req.body, 'bloqueios') || Object.prototype.hasOwnProperty.call(req.body, 'restricoes_agenda'));
    const hasUsageRulesField = req.body && (Object.prototype.hasOwnProperty.call(req.body, 'regras_uso') || Object.prototype.hasOwnProperty.call(req.body, 'regrasUso') || Object.prototype.hasOwnProperty.call(req.body, 'regras'));
    const upd = {};
    if(unidade_id!==undefined) upd.unidade_id = unidade_id;
    if(nome!==undefined) upd.nome = String(nome).trim();
    if(area_m2!==undefined){ const val = (area_m2===''||area_m2==null) ? null : Number(area_m2); if(val!==null && Number.isNaN(val)) return res.status(400).json({ error:'area_m2 inválida' }); upd.area_m2 = val; }
    const hasCapacidadeField = req.body && (
      Object.prototype.hasOwnProperty.call(req.body, 'capacidade') ||
      Object.prototype.hasOwnProperty.call(req.body, 'capacidade_total') ||
      Object.prototype.hasOwnProperty.call(req.body, 'capacidadeMaxima') ||
      Object.prototype.hasOwnProperty.call(req.body, 'capacidade_maxima')
    );
    if(hasCapacidadeField){
      const capRaw = (typeof capacidade !== 'undefined') ? capacidade : (req.body.capacidade_total ?? req.body.capacidadeMaxima ?? req.body.capacidade_maxima ?? null);
      if(capRaw === '' || capRaw === null){ upd.capacidade = null; }
      else {
        const capParsed = Number(capRaw);
        if(Number.isNaN(capParsed) || capParsed < 0 || capParsed > 999999){ return res.status(400).json({ error:'capacidade inválida' }); }
        upd.capacidade = capParsed;
      }
    }
    if(obs!==undefined) upd.obs = String(obs||'');
    if(hasScheduleField){
      const rawSchedule = req.body.disponibilidades || req.body.schedule || req.body.agenda || [];
      upd.disponibilidades = sanitizeAreaSchedule(rawSchedule);
    }
    if(hasRestrictionField){
      const rawRestrictions = req.body.restricoes || req.body.restrictions || req.body.bloqueios || req.body.restricoes_agenda || [];
      upd.restricoes = sanitizeAreaRestrictions(rawRestrictions);
    }
    if(hasUsageRulesField){
      const rawRules = req.body.regras_uso ?? req.body.regrasUso ?? req.body.regras ?? '';
      upd.regras_uso = sanitizeAreaUsageRules(rawRules);
    }
    let blobFailed=false, blobMissingToken=false, blobTried=false;
    if(req.file){
      blobTried = true;
      try{
        const atual = await CondAreaComum.findById(id).select('foto').lean();
        upd.foto = await uploadAreaComumFotoFile(req.file);

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
        if(process.env.ENABLE_DELETE_OLD_BLOB === '1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)){
          try{ await del(atual.foto, blobToken ? { token: blobToken } : undefined); }catch(_e){}
        }
      }catch(e){
        console.error('[api/areas-comuns] PUT upload blob erro', e);
        blobFailed = true;
        if(e && /No token found/i.test(e.message || '')) blobMissingToken = true;
      }
    } else if(foto!==undefined){
      if(foto==='' || foto===null){ upd.foto=''; }
      else if(typeof foto==='string' && foto.startsWith('data:')){
        if(foto.length > 2_000_000) return res.status(413).json({ error:'Imagem muito grande (~2MB limite)' });
        blobTried=true;
        try{
          const atual = await CondAreaComum.findById(id).select('foto').lean();
          const match = /^data:(.+?);base64,(.+)$/.exec(foto);
          if(!match) return res.status(400).json({ error:'Formato imagem inválido' });
          const mime = match[1]; const b64 = match[2]; const allowed=['image/png','image/jpeg','image/jpg','image/webp'];
          if(!allowed.includes(mime)) return res.status(400).json({ error:'Tipo não suportado' });
          const buf = Buffer.from(b64,'base64'); const extMap={ 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext=extMap[mime]||'bin';
          const fileName = `areas-comuns/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
          const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
          upd.foto = uploaded.url;
          if(process.env.ENABLE_DELETE_OLD_BLOB==='1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)){
            try{ await del(atual.foto, blobToken?{token:blobToken}:undefined); }catch(_e){}
          }
        }catch(e){
          console.error('[api/areas-comuns] PUT upload blob erro', e);
          blobFailed=true;
          if(e && /No token found/i.test(e.message||'')) blobMissingToken=true;
        }
      } else if(/^https?:\/\//.test(foto)){ upd.foto = foto; }
      else { return res.status(400).json({ error:'Foto deve ser data URL ou URL http(s)' }); }
    }
    try{
      const doc = await CondAreaComum.findByIdAndUpdate(id, { $set: upd }, { new:true, runValidators:true }).lean();
      const docResp = doc ? {
        ...doc,
        capacidade: doc.capacidade != null ? Number(doc.capacidade) : null,
        regras_uso: doc.regras_uso || '',
        disponibilidades: mapAreaScheduleForResponse(doc.disponibilidades),
        restricoes: mapAreaRestrictionsForResponse(doc.restricoes)
      } : doc;
      return res.json({ ...docResp, foto_saved: !!(doc&&doc.foto), blob_tried: blobTried, blob_failed: blobFailed, blob_missing_token: blobMissingToken });
    }catch(e){
      if(e && (e.code === 11000 || (e.name === 'MongoServerError' && e.message && e.message.includes('E11000')))){
        return res.status(409).json({ error:'Já existe uma área com este nome neste condomínio' });
      }
      console.error('[api/areas-comuns] PUT erro', e);
      return res.status(500).json({ error:'Falha ao atualizar área comum', detail:e.message });
    }
  }catch(e){ console.error('[api/areas-comuns] PUT erro (outer)', e); res.status(500).json({ error:'Falha ao atualizar área comum', detail:e.message }); }
});

app.get('/api/areas-comuns/:id/cessoes', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){
      try{ res.set('Retry-After','5'); }catch{}
      return res.status(503).json({ error:'Banco indisponível, tente novamente' });
    }
    const id = req.params.id;
    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({ error:'Área inválida' });
    }
    const doc = await CondAreaCessao.findOne({ area_id: id }).lean();
    const response = buildCessaoResponse(doc);
    try {
      console.info('[cessoes][GET] preposto snapshot', {
        persistedPreposto: doc && doc.preposto ? doc.preposto : null,
        firstAssignment: Array.isArray(doc && doc.cessoes) && doc.cessoes.length ? doc.cessoes[0] : null
      });
    } catch(_dbgErr) {}
    response.areaId = doc && doc.area_id ? String(doc.area_id) : String(id);
    return res.json(response);
  }catch(e){
    console.error('[api/areas-comuns/:id/cessoes] GET erro', e);
    return res.status(500).json({ error:'Falha ao carregar cessões', detail:e.message });
  }
});

app.put('/api/areas-comuns/:id/cessoes', express.json({ limit: '6mb' }), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){
      try{ res.set('Retry-After','5'); }catch{}
      return res.status(503).json({ error:'Banco indisponível, tente novamente' });
    }
    const id = req.params.id;
    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({ error:'Área inválida' });
    }
    const area = await CondAreaComum.findById(id).select('_id unidade_id').lean();
    if(!area) return res.status(404).json({ error:'Área comum não encontrada' });
    const sanitized = sanitizeCessaoPayload(req.body || {});
    try {
      console.info('[cessoes][PUT] preposto payload snapshot', {
        preposto: sanitized.preposto ? { ...sanitized.preposto } : null,
        assignmentsPreposto: Array.isArray(sanitized.cessoes) ? sanitized.cessoes.map((entry, idx) => ({ idx, hasPreposto: !!(entry && entry.preposto), preposto_nome: entry ? entry.preposto_nome : null, preposto_funcao: entry ? entry.preposto_funcao : null })) : []
      });
    } catch(_dbgErr) {}
    const ctxUser = req.user || (req.session && req.session.user) || null;
    const updatedBy = ctxUser && ctxUser._id ? String(ctxUser._id) : null;
    const updatedByNome = ctxUser && (ctxUser.nome || ctxUser.name) ? String(ctxUser.nome || ctxUser.name) : '';
    const updateDoc = {
      unidade_id: area.unidade_id || null,
      cessoes: sanitized.cessoes,
      contratos: sanitized.contratos,
      responsabilidades: sanitized.responsabilidades,
      materiais: sanitized.materiais,
      materiais_resumo: sanitized.materiais_resumo,
      materiaisResumo: sanitized.materiais_resumo,
      financeiro: sanitized.financeiro,
      foro: sanitized.foro,
      preposto: sanitized.preposto,
      updated_by: updatedBy,
      updated_by_nome: updatedByNome
    };
    const saved = await CondAreaCessao.findOneAndUpdate(
      { area_id: area._id },
      { $set: updateDoc, $setOnInsert: { area_id: area._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const response = buildCessaoResponse(saved ? saved.toObject() : null);
    response.areaId = String(area._id);
    return res.json(response);
  }catch(e){
    console.error('[api/areas-comuns/:id/cessoes] PUT erro', e);
    return res.status(500).json({ error:'Falha ao salvar cessões', detail:e.message });
  }
});

app.delete('/api/areas-comuns/:id/cessoes/:cessaoId', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){
      try{ res.set('Retry-After','5'); }catch{}
      return res.status(503).json({ error:'Banco indisponível, tente novamente' });
    }
    const areaId = req.params.id;
    const cessaoIdRaw = req.params.cessaoId;
    if(!mongoose.Types.ObjectId.isValid(areaId)){
      return res.status(400).json({ error:'Área inválida' });
    }
    const cessaoId = (cessaoIdRaw ? String(cessaoIdRaw) : '').trim();
    if(!cessaoId){
      return res.status(400).json({ error:'Cessão inválida' });
    }
    const area = await CondAreaComum.findById(areaId).select('_id unidade_id').lean();
    if(!area){
      return res.status(404).json({ error:'Área comum não encontrada' });
    }
    const doc = await CondAreaCessao.findOne({ area_id: area._id });
    if (!doc || !Array.isArray(doc.cessoes) || !doc.cessoes.length) {
      return res.status(404).json({ error:'Cessão não encontrada' });
    }
    const matchesRequestedId = (entry) => {
      if(!entry || typeof entry !== 'object') return false;
      const candidates = [
        entry.id,
        entry._id,
        entry.codigo,
        entry.hash,
        entry.uuid,
        entry.chave,
        entry.identificador
      ].filter(Boolean).map(value => String(value).trim());
      if(candidates.includes(cessaoId)) return true;
      if(entry && entry.id && String(entry.id) === cessaoId) return true;
      return false;
    };
    const removedAssignments = [];
    const originalLength = doc.cessoes.length;
    doc.cessoes = doc.cessoes.filter(entry => {
      const match = matchesRequestedId(entry);
      if (match) {
        removedAssignments.push(entry);
      }
      return !match;
    });
    if (doc.cessoes.length === originalLength) {
      return res.status(404).json({ error:'Cessão não encontrada' });
    }
    doc.markModified('cessoes');
    const ctxUser = req.user || (req.session && req.session.user) || null;
    doc.updated_by = ctxUser && ctxUser._id ? String(ctxUser._id) : doc.updated_by || null;
    doc.updated_by_nome = ctxUser && (ctxUser.nome || ctxUser.name) ? String(ctxUser.nome || ctxUser.name) : doc.updated_by_nome || '';
    const saved = await doc.save();
    const response = buildCessaoResponse(saved ? saved.toObject() : null);
    response.areaId = String(area._id);
    return res.json(response);
  }catch(e){
    console.error('[api/areas-comuns/:id/cessoes/:cessaoId] DELETE erro', e);
    return res.status(500).json({ error:'Falha ao excluir cessão', detail:e.message });
      const contractsBefore = Array.isArray(doc.contratos) ? doc.contratos.length : 0;
      if (contractsBefore && contractsBefore > 0) {
        const shouldRemoveContract = (contract) => {
          if (!contract || typeof contract !== 'object') return false;
          const assignmentRef = contract.assignment || contract.cessao || contract.reserva || null;
          const idCandidates = [
            contract.assignmentId,
            contract.assignment_id,
            contract.cessao_id,
            contract.cessaoId,
            contract.periodo_id,
            contract.periodoId
          ];
          if (assignmentRef && typeof assignmentRef === 'object') {
            idCandidates.push(
              assignmentRef.id,
              assignmentRef._id,
              assignmentRef.codigo,
              assignmentRef.hash,
              assignmentRef.uuid,
              assignmentRef.chave,
              assignmentRef.identificador
            );
          }
          const normalizedIds = idCandidates
            .filter(value => value !== undefined && value !== null)
            .map(value => String(value).trim())
            .filter(Boolean);
          if (normalizedIds.includes(cessaoId)) return true;
          if (!assignmentRef || removedAssignments.length === 0) return false;
          return removedAssignments.some(removed => {
            if (!removed || typeof removed !== 'object') return false;
            const removedIdCandidates = [
              removed.id,
              removed._id,
              removed.codigo,
              removed.hash,
              removed.uuid,
              removed.chave,
              removed.identificador
            ].filter(Boolean).map(value => String(value).trim());
            if (removedIdCandidates.some(value => normalizedIds.includes(value))) return true;
            const refDate = assignmentRef.date || assignmentRef.date_inicio || assignmentRef.data_inicio || assignmentRef.data;
            const refEndDate = assignmentRef.date_end || assignmentRef.data_fim;
            const refStart = assignmentRef.start || assignmentRef.hora_inicio || assignmentRef.horaInicio;
            const refEnd = assignmentRef.end || assignmentRef.hora_fim || assignmentRef.horaFim;
            const removedDate = removed.date || removed.date_inicio || removed.data_inicio || removed.data;
            const removedEndDate = removed.date_end || removed.data_fim;
            const removedStart = removed.start || removed.hora_inicio || removed.horaInicio;
            const removedEnd = removed.end || removed.hora_fim || removed.horaFim;
            if (refDate && removedDate && String(refDate).slice(0, 10) === String(removedDate).slice(0, 10)) {
              const sameStart = refStart && removedStart && String(refStart).trim() === String(removedStart).trim();
              const sameEnd = refEnd && removedEnd && String(refEnd).trim() === String(removedEnd).trim();
              if (sameStart && sameEnd) {
                const refHab = assignmentRef.habitacao_id || assignmentRef.habitacaoId || assignmentRef.habitacao;
                const removedHab = removed.habitacao_id || removed.habitacaoId || removed.habitacao;
                if (refHab && removedHab && String(refHab) !== String(removedHab)) return false;
                return true;
              }
            }
            if (refEndDate && removedEndDate && String(refEndDate).slice(0, 10) === String(removedEndDate).slice(0, 10)) {
              if (refStart && removedStart && String(refStart).trim() === String(removedStart).trim()) {
                return true;
              }
            }
            return false;
          });
        };

        const filteredContracts = doc.contratos.filter(contract => !shouldRemoveContract(contract));
        if (filteredContracts.length !== contractsBefore) {
          doc.contratos = filteredContracts;
          doc.markModified('contratos');
        }
      }
  }
});

// Excluir área comum
app.delete('/api/areas-comuns/:id', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    await CondAreaComum.findByIdAndDelete(req.params.id); res.json({ ok:true });
  }
  catch(e){ res.status(500).json({ error:'Falha ao excluir área comum' }); }
});

// ======================= Naturezas de Materiais =======================
// Listagem/busca com escopo por usuário
async function resolveMaterialNatureSearchScope({ req, unidadeParam }) {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');

  if (isAdmin) {
    return { unidadeFilter: unidadeParam || null };
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const allowed = (unidadesOptions || []).map(u => String(u._id));
  if (!allowed.length) {
    return { empty: true };
  }

  if (unidadeParam) {
    if (!allowed.includes(String(unidadeParam))) {
      return { error: { status: 403, body: { success: false, error: 'Unidade fora do escopo do usuário' } } };
    }
    return { unidadeFilter: unidadeParam };
  }

  return { unidadeFilter: { $in: allowed } };
}

function buildMaterialNatureSearchFilter({ unidadeFilter, tipo, nome }) {
  const filter = {};

  if (unidadeFilter) filter.unidade_id = unidadeFilter;
  if (tipo) filter.tipo = tipo;
  if (nome) filter.nome = { $regex: nome, $options: 'i' };

  return filter;
}

async function readMaterialNatureSearchList({ req, filter }) {
  const list = await CondNatMaterial.find(filter).lean();
  const unitIds = [...new Set(list.map(item => item.unidade_id).filter(Boolean))];
  const unidades = unitIds.length
    ? await unidadesReadRepoFromReq(req).find({ _id: { $in: unitIds } }, { select: '_id codigo nome' })
    : [];

  return { list, unidades };
}

function buildMaterialNatureSearchResponse(list) {
  const unidadeMap = new Map((list.unidades || []).map(u => [String(u._id), u]));
  return (list.list || []).map(n => ({
    _id: n._id,
    unidade: unidadeMap.get(String(n.unidade_id)) || { _id: n.unidade_id },
    tipo: n.tipo,
    nome: n.nome
  }));
}

app.get('/api/materiais/naturezas/busca', async (req, res) => {
  const { unidade, tipo, nome } = req.query || {};
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json([]); }

    const scopeResolution = await resolveMaterialNatureSearchScope({ req, unidadeParam: unidade });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (scopeResolution.empty) {
      return res.json([]);
    }

    const filter = buildMaterialNatureSearchFilter({
      unidadeFilter: scopeResolution.unidadeFilter,
      tipo,
      nome
    });
    const list = await readMaterialNatureSearchList({ req, filter });
    return res.json(buildMaterialNatureSearchResponse(list));
  }catch(e){ console.error('[api/materiais/naturezas/busca] erro GET', e); return res.status(200).json([]); }
});

// Criar natureza
app.post('/api/materiais/naturezas', express.json(), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const { unidade_id, tipo, nome } = req.body || {};
    if(!unidade_id || !tipo || !nome) return res.status(400).json({ error:'unidade_id, tipo e nome são obrigatórios' });
    if(!mongoose.isValidObjectId(unidade_id)) return res.status(400).json({ error:'unidade_id inválido' });
    const trimmedNome = String(nome).trim();
    if(!trimmedNome) return res.status(400).json({ error:'Nome inválido' });
    const tipoNormalizado = String(tipo);
    if(!['Fixo','Móvel'].includes(tipoNormalizado)) return res.status(400).json({ error:'Tipo inválido' });
    try{
      const novo = await CondNatMaterial.create({ unidade_id, tipo: tipoNormalizado, nome: trimmedNome });
      const plain = novo.toObject();
      return res.status(201).json({ _id: plain._id, unidade_id: plain.unidade_id, tipo: plain.tipo, nome: plain.nome });
    }catch(e){
      if(e && (e.code === 11000 || (e.name==='MongoServerError' && e.message && e.message.includes('E11000')))){
        return res.status(409).json({ error:'Já existe natureza com este nome para este tipo neste condomínio' });
      }
      console.error('[api/materiais/naturezas] POST erro', e);
      return res.status(500).json({ error:'Falha ao criar natureza', detail:e.message });
    }
  }catch(e){ console.error('[api/materiais/naturezas] POST erro (outer)', e); res.status(500).json({ error:'Falha ao criar natureza', detail:e.message }); }
});

app.put('/api/materiais/naturezas/:id', express.json(), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const { id } = req.params;
    if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error:'Identificador inválido' });
    const { unidade_id, tipo, nome } = req.body || {};
    if(!unidade_id || !tipo || !nome) return res.status(400).json({ error:'unidade_id, tipo e nome são obrigatórios' });
    if(!mongoose.isValidObjectId(unidade_id)) return res.status(400).json({ error:'unidade_id inválido' });
    const trimmedNome = String(nome).trim();
    if(!trimmedNome) return res.status(400).json({ error:'Nome inválido' });
    const tipoNormalizado = String(tipo);
    if(!['Fixo','Móvel'].includes(tipoNormalizado)) return res.status(400).json({ error:'Tipo inválido' });

    const existente = await CondNatMaterial.findById(id);
    if(!existente) return res.status(404).json({ error:'Natureza não encontrada' });

    const conflito = await CondNatMaterial.findOne({
      _id: { $ne: id },
      unidade_id,
      tipo: tipoNormalizado,
      nome: trimmedNome
    }).lean();
    if(conflito){
      return res.status(409).json({ error:'Já existe natureza com este nome para este tipo neste condomínio' });
    }

    existente.unidade_id = unidade_id;
    existente.tipo = tipoNormalizado;
    existente.nome = trimmedNome;
    await existente.save();

    const plain = existente.toObject();
    res.json({ _id: plain._id, unidade_id: plain.unidade_id, tipo: plain.tipo, nome: plain.nome });
  }catch(e){
    console.error('[api/materiais/naturezas] PUT erro', e);
    res.status(500).json({ error:'Falha ao atualizar natureza', detail:e.message });
  }
});

app.delete('/api/materiais/naturezas/:id', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const { id } = req.params;
    if(!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ error:'Identificador inválido' });

    const naturezaObjId = new mongoose.Types.ObjectId(id);
    const vinculados = await CondBemMaterial.countDocuments({ natureza_id: naturezaObjId });
    if(vinculados > 0){
      return res.status(409).json({ error:'Não é possível excluir: existem materiais vinculados a esta natureza.' });
    }

    const removido = await CondNatMaterial.findByIdAndDelete(id).lean();
    if(!removido) return res.status(404).json({ error:'Natureza não encontrada' });
    res.json({ _id: removido._id, unidade_id: removido.unidade_id, tipo: removido.tipo, nome: removido.nome, deleted: true });
  }catch(e){
    console.error('[api/materiais/naturezas] DELETE erro', e);
    res.status(500).json({ error:'Falha ao excluir natureza', detail:e.message });
  }
});

// Usuários Condôminos: busca unificada (Gestor + CondUsuario)
app.get('/api/usuarios/busca.v2', async (req, res) => {
  try {
    try {
      res.set('Cache-Control','no-store, max-age=0, must-revalidate');
      res.set('Pragma','no-cache');
      res.set('Expires','0');
    } catch {}
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json([]);
    }
    const ctxUser = getCtxUser(req);
    const { existingUsers = [], unidadesOptions = [] } = await carregarExistingUsers(ctxUser);
    const unitIds = (unidadesOptions || []).map(u => String(u._id || '')).filter(Boolean);
    const isAdmin = !!(ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin'));

    const requestedUnitIdRaw = String((req.query && (req.query.unidade_id || req.query.unidadeId || req.query.unidade)) || '').trim();
    const requestedUnitId = (requestedUnitIdRaw && mongoose.isValidObjectId(requestedUnitIdRaw)) ? String(requestedUnitIdRaw) : '';
    if (requestedUnitId && !isAdmin) {
      // Mesmo para usuário não-admin, só permite filtrar dentro do escopo já autorizado.
      if (!unitIds.includes(String(requestedUnitId))) {
        return res.json([]);
      }
    }

    const searchTermRaw = String((req.query && (req.query.nome || req.query.search || req.query.q || req.query.termo || req.query.texto)) || '').trim();
    const searchTerm = searchTermRaw ? searchTermRaw.trim() : '';
    const limitRaw = Number((req.query && (req.query.limit || req.query.limite)) || 0);
    // Compat: se não vier limit, não limita (comportamento antigo)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.max(10, Math.round(limitRaw))) : 0;

    const escapeRegexLocal = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizeLoose = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!isAdmin && !unitIds.length) {
      return res.json(existingUsers.length ? [] : []);
    }

    const habFiltro = { ativa: { $ne: false } };
    if (requestedUnitId) {
      habFiltro.unidade_id = requestedUnitId;
    } else if (!isAdmin && unitIds.length) {
      habFiltro.unidade_id = { $in: unitIds };
    }
    const habitacoes = await CondHabitacao.find(habFiltro)
      .select('_id unidade_id proprietario_id bloco_id andar_id numero tipo contrato_locacao contratos_locacao')
      .lean();

    const habIds = habitacoes.map(h => h._id);
    const propFiltro = { ativo: { $ne: false } };
    if (requestedUnitId) {
      propFiltro.unidade_id = requestedUnitId;
    } else if (!isAdmin && unitIds.length) {
      propFiltro.unidade_id = { $in: unitIds };
    }
    let props = [];
    try {
      props = await CondProprietario.find(propFiltro)
        .select('_id usuario_id cond_usuario_id unidade_id contato_email')
        .lean();
    } catch {}

    let moras = [];
    if (habIds.length) {
      try {
        moras = await CondMorador.find({ habitacao_id: { $in: habIds }, ativo: { $ne: false } })
          .select('_id usuario_id cond_usuario_id habitacao_id inquilino')
          .lean();
      } catch {}
    }

    const condUserIdsSet = new Set();
    props.forEach(p => { if (p?.cond_usuario_id) condUserIdsSet.add(String(p.cond_usuario_id)); });
    moras.forEach(m => { if (m?.cond_usuario_id) condUserIdsSet.add(String(m.cond_usuario_id)); });

    const condSelect = '_id email nome unidade_id permissoes perfis ativo cpf rg data_nascimento telefone whatsapp sexo foto';
    let condUsuariosDocs = [];
    if (isAdmin) {
      condUsuariosDocs = await CondUsuario.find({ ativo: { $ne: false }, ...(requestedUnitId ? { unidade_id: requestedUnitId } : {}) }).select(condSelect).lean();
    } else {
      const condOr = [];
      if (requestedUnitId) condOr.push({ unidade_id: requestedUnitId });
      else if (unitIds.length) condOr.push({ unidade_id: { $in: unitIds } });
      if (condUserIdsSet.size) condOr.push({ _id: { $in: Array.from(condUserIdsSet) } });
      if (condOr.length === 0) {
        condUsuariosDocs = [];
      } else if (condOr.length === 1) {
        condUsuariosDocs = await CondUsuario.find({ ativo: { $ne: false }, ...condOr[0] }).select(condSelect).lean();
      } else {
        condUsuariosDocs = await CondUsuario.find({ ativo: { $ne: false }, $or: condOr }).select(condSelect).lean();
      }
    }

    const knownCondIds = new Set(condUsuariosDocs.map(cu => String(cu._id)));
    const emailToCondUserId = new Map(condUsuariosDocs.map(cu => [String((cu.email || '').toLowerCase()), String(cu._id)]));
    const emailToCondUserDoc = new Map(condUsuariosDocs.map(cu => [String((cu.email || '').toLowerCase()), cu]));
    const emailToUserId = new Map((existingUsers || []).map(u => [String((u.email || '').toLowerCase()), String(u._id || '')]));
    const emailToUserDoc = new Map((existingUsers || []).map(u => [String((u.email || '').toLowerCase()), u]));

    props.forEach(p => {
      const emailLower = String(p?.contato_email || '').toLowerCase();
      if (!p.usuario_id && emailLower) {
        const uid = emailToUserId.get(emailLower);
        if (uid) p.usuario_id = uid;
      }
      if (!p.cond_usuario_id && emailLower) {
        const cid = emailToCondUserId.get(emailLower);
        if (cid) {
          p.cond_usuario_id = cid;
          condUserIdsSet.add(String(cid));
        }
      }
    });

    const missingCondIds = Array.from(condUserIdsSet).filter(id => !knownCondIds.has(String(id)));
    if (missingCondIds.length) {
      const extraCondUsers = await CondUsuario.find({ _id: { $in: missingCondIds } })
        .select(condSelect)
        .lean();
      extraCondUsers.forEach(cu => {
        condUsuariosDocs.push(cu);
        knownCondIds.add(String(cu._id));
        emailToCondUserId.set(String((cu.email || '').toLowerCase()), String(cu._id));
      });
    }

    const propByUser = new Map();
    const propByCondUser = new Map();
    props.forEach(p => {
      if (p?.usuario_id) {
        const key = String(p.usuario_id);
        if (!propByUser.has(key)) propByUser.set(key, []);
        propByUser.get(key).push(p);
      }
      if (p?.cond_usuario_id) {
        const key = String(p.cond_usuario_id);
        if (!propByCondUser.has(key)) propByCondUser.set(key, []);
        propByCondUser.get(key).push(p);
      }
    });

    const moraByUser = new Map();
    const moraByCondUser = new Map();
    moras.forEach(m => {
      if (m?.usuario_id) {
        const key = String(m.usuario_id);
        if (!moraByUser.has(key)) moraByUser.set(key, []);
        moraByUser.get(key).push(m);
      }
      if (m?.cond_usuario_id) {
        const key = String(m.cond_usuario_id);
        if (!moraByCondUser.has(key)) moraByCondUser.set(key, []);
        moraByCondUser.get(key).push(m);
      }
    });

    const habById = new Map(habitacoes.map(h => [String(h._id), h]));
    const habsByProp = new Map();
    habitacoes.forEach(h => {
      if (!h?.proprietario_id) return;
      const key = String(h.proprietario_id);
      if (!habsByProp.has(key)) habsByProp.set(key, []);
      habsByProp.get(key).push(h);
    });
    const unidadeByHab = new Map(habitacoes.map(h => [String(h._id), h.unidade_id || null]));
    const blocoIds = [...new Set(habitacoes.map(h => String(h.bloco_id || '')).filter(Boolean))];
    const andarIds = [...new Set(habitacoes.map(h => String(h.andar_id || '')).filter(Boolean))];
    const [blocos, andares] = await Promise.all([
      blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
      andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
    ]);
    const blocoMap = new Map(blocos.map(b => [String(b._id), b]));
    const andarMap = new Map(andares.map(a => [String(a._id), a]));
    const buildHabLabel = (h) => {
      if (!h) return '';
      const blocoNome = h.bloco_id ? (blocoMap.get(String(h.bloco_id))?.nome || '') : '';
      const andarNome = h.andar_id ? (andarMap.get(String(h.andar_id))?.nome || '') : '';
      const tipo = h.tipo || '';
      const numero = h.numero || '';
      return [blocoNome, andarNome, tipo, numero].filter(Boolean).join(' - ');
    };

    const responsavelIds = new Set();
    const collectResp = (contrato) => {
      if (contrato && contrato.responsavel_morador_id) {
        responsavelIds.add(String(contrato.responsavel_morador_id));
      }
    };
    habitacoes.forEach(h => {
      collectResp(h?.contrato_locacao);
      if (Array.isArray(h?.contratos_locacao)) {
        h.contratos_locacao.forEach(collectResp);
      }
    });

    const formatDateBr = (value) => {
      if (!value) return '';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${date.getFullYear()}`;
    };

    const existingResult = (existingUsers || []).map(u => {
      const uid = String(u._id || '');
      const userProps = propByUser.get(uid) || [];
      const userMoras = moraByUser.get(uid) || [];
      const permsSet = new Set();
      if (userProps.length) permsSet.add('Prop');
      if (userMoras.length) permsSet.add('Mora');
      if (userMoras.some(m => responsavelIds.has(String(m._id)))) permsSet.add('resp');
      const vinculos = [];
      userProps.forEach(p => {
        const hs = habsByProp.get(String(p._id)) || [];
        hs.forEach(h => {
          vinculos.push({
            unidade_id: h.unidade_id || null,
            habitacao_id: String(h._id),
            morador: false,
            proprietario: true,
            hab_label: buildHabLabel(h)
          });
        });
      });
      userMoras.forEach(m => {
        const h = habById.get(String(m.habitacao_id)) || null;
        const uId = h ? (h.unidade_id || null) : (unidadeByHab.get(String(m.habitacao_id)) || null);
        vinculos.push({
          unidade_id: uId,
          habitacao_id: String(m.habitacao_id),
          morador: true,
          inquilino: !!m.inquilino,
          hab_label: buildHabLabel(h)
        });
      });
      const emailLower = (u.email || '').toLowerCase();
      let condUsuarioId = null;
      const moraCond = userMoras.find(m => m?.cond_usuario_id);
      if (moraCond && moraCond.cond_usuario_id) condUsuarioId = String(moraCond.cond_usuario_id);
      if (!condUsuarioId) {
        const propCond = userProps.find(p => p?.cond_usuario_id);
        if (propCond && propCond.cond_usuario_id) condUsuarioId = String(propCond.cond_usuario_id);
      }
      if (!condUsuarioId && emailLower) {
        const mapped = emailToCondUserId.get(emailLower);
        if (mapped) condUsuarioId = mapped;
      }
      const condDoc = emailLower ? emailToCondUserDoc.get(emailLower) : null;
      const foto = u.foto || (condDoc && condDoc.foto) || '';
      const cpfDigits = (u.cpf || (condDoc && condDoc.cpf) || '').replace(/\D/g, '');
      const dataNascimento = u.data_nascimento || (condDoc && condDoc.data_nascimento) || null;
      const dataNascimentoBr = u.data_nascimento_br || (dataNascimento ? formatDateBr(dataNascimento) : '');
      const telefone = u.telefone || (condDoc && condDoc.telefone) || '';
      const perfis = Array.isArray(condDoc?.perfis) ? condDoc.perfis.map(String) : [];
      perfis.forEach(p => permsSet.add(p));
      const rg = condDoc?.rg || u.rg || '';
      const whatsapp = typeof condDoc?.whatsapp === 'boolean' ? condDoc.whatsapp : (typeof u.whatsapp === 'boolean' ? u.whatsapp : false);
      const sexo = condDoc?.sexo || u.sexo || 'N';
      const nomePai = u.pai || u.nome_pai || u.filiacao_pai || condDoc?.pai || '';
      const nomeMae = u.mae || u.nome_mae || u.filiacao_mae || condDoc?.mae || '';
      const funcaoNome = u.funcao_nome || u.funcao || '';
      const profissao = u.profissao || funcaoNome || '';
      const moradorRef = userMoras.find(m => m?._id) || null;
      const detalhes = {
        cpf: cpfDigits,
        data_nascimento: dataNascimento,
        dataNascimento: dataNascimento,
        data_nascimento_br: dataNascimentoBr,
        telefone,
        perfis,
        rg,
        whatsapp,
        telefone_whatsapp: whatsapp,
        sexo,
        pai: nomePai,
        mae: nomeMae,
        nome_pai: nomePai,
        nome_mae: nomeMae,
        funcao: funcaoNome,
        profissao,
        email: emailLower,
        foto
      };
      return {
        _id: u._id || null,
        usuario_id: u._id || null,
        cond_usuario_id: condUsuarioId || null,
        email: emailLower,
        nome: u.nome || '',
        foto,
        role: u.role || u.nivel || '',
        unidade_id: u.unidade_id || null,
        is_funcionario: !!u.isFuncionario,
        funcao_nome: u.funcao_nome || '',
        funcao: funcaoNome || '',
        profissao,
        cpf: cpfDigits,
        data_nascimento: dataNascimento,
        data_nascimento_br: dataNascimentoBr,
        telefone,
        perfis,
        rg,
        whatsapp,
        telefone_whatsapp: whatsapp,
        sexo,
        nome_pai: nomePai,
        nome_mae: nomeMae,
        pai: nomePai,
        mae: nomeMae,
        morador_id: moradorRef ? String(moradorRef._id) : null,
        perms: Array.from(permsSet),
        vinculos,
        dados: detalhes,
        perfil: detalhes,
        gestor: detalhes
      };
    });

    const seenEmails = new Set(existingResult.map(r => r.email));
    const condResult = condUsuariosDocs.map(cu => {
      const cid = String(cu._id || '');
      const userProps = propByCondUser.get(cid) || [];
      const userMoras = moraByCondUser.get(cid) || [];
      const permsSet = new Set(Array.isArray(cu.permissoes) ? cu.permissoes.map(String) : []);
      if (userProps.length) permsSet.add('Prop');
      if (userMoras.length) permsSet.add('Mora');
      if (userMoras.some(m => responsavelIds.has(String(m._id)))) permsSet.add('resp');
      const perfis = Array.isArray(cu.perfis) ? cu.perfis.map(String) : [];
      perfis.forEach(p => permsSet.add(p));
      const vinculos = [];
      userProps.forEach(p => {
        const hs = habsByProp.get(String(p._id)) || [];
        hs.forEach(h => {
          vinculos.push({
            unidade_id: h.unidade_id || null,
            habitacao_id: String(h._id),
            morador: false,
            proprietario: true,
            hab_label: buildHabLabel(h)
          });
        });
      });
      userMoras.forEach(m => {
        const h = habById.get(String(m.habitacao_id)) || null;
        const uId = h ? (h.unidade_id || null) : (unidadeByHab.get(String(m.habitacao_id)) || null);
        vinculos.push({
          unidade_id: uId,
          habitacao_id: String(m.habitacao_id),
          morador: true,
          inquilino: !!m.inquilino,
          hab_label: buildHabLabel(h)
        });
      });
      const email = (cu.email || '').toLowerCase();
      const gestorUserDoc = email ? (emailToUserDoc.get(email) || null) : null;
      const foto = cu.foto || gestorUserDoc?.foto || '';
      const cpfDigits = (cu.cpf || '').replace(/\D/g, '');
      const dataNascimento = cu.data_nascimento || null;
      const dataNascimentoBr = dataNascimento ? formatDateBr(dataNascimento) : '';
      const telefone = cu.telefone || '';
      const rg = cu.rg || '';
      const whatsapp = typeof cu.whatsapp === 'boolean' ? cu.whatsapp : false;
      const sexo = cu.sexo || 'N';
      const detalhes = {
        cpf: cpfDigits,
        data_nascimento: dataNascimento,
        dataNascimento: dataNascimento,
        data_nascimento_br: dataNascimentoBr,
        telefone,
        perfis,
        rg,
        whatsapp,
        sexo,
        foto
      };
      return {
        _id: cu._id || null,
        cond_usuario_id: cu._id || null,
        usuario_id: email ? (emailToUserId.get(email) || null) : null,
        email,
        nome: cu.nome || '',
        foto,
        role: 'condominio',
        unidade_id: cu.unidade_id || null,
        is_funcionario: false,
        funcao_nome: '',
        cpf: cpfDigits,
        data_nascimento: dataNascimento,
        data_nascimento_br: dataNascimentoBr,
        telefone,
        perfis,
        rg,
        whatsapp,
        sexo,
        perms: Array.from(permsSet),
        vinculos,
        dados: detalhes,
        perfil: detalhes,
        gestor: detalhes
      };
    });

    const filteredCondResult = condResult.filter(entry => !entry.email || !seenEmails.has(entry.email));
    filteredCondResult.forEach(entry => {
      if (entry.email) seenEmails.add(entry.email);
    });

    let result = existingResult.concat(filteredCondResult);

    if (requestedUnitId) {
      const uKey = String(requestedUnitId);
      result = result.filter(r => {
        // Regra: contas Master/Admin (Gestor) não podem aparecer como usuários de unidade.
        const roleLower = String(r?.role || r?.nivel || '').toLowerCase().trim();
        if (roleLower === 'master' || roleLower === 'admin') return false;

        const direct = r && r.unidade_id ? String(r.unidade_id) : '';
        if (direct && direct === uKey) return true;
        const vinculos = Array.isArray(r && r.vinculos) ? r.vinculos : [];
        return vinculos.some(v => (v && v.unidade_id) ? String(v.unidade_id) === uKey : false);
      });
    }

    if (searchTerm) {
      const qn = normalizeLoose(searchTerm);
      const qre = new RegExp(escapeRegexLocal(searchTerm), 'i');
      result = result.filter(r => {
        const nome = String(r?.nome || '');
        const email = String(r?.email || '');
        const cpf = String(r?.cpf || '').replace(/\D/g, '');
        if (qre.test(nome) || qre.test(email)) return true;
        if (cpf && qn && cpf.includes(qn.replace(/\D/g, ''))) return true;
        return false;
      });
    }

    // Opção: retornar apenas usuários com CondUsuario (útil para APIs que exigem ref CondUsuario).
    const requireCondUsuarioRaw = String((req.query && (req.query.require_cond_usuario || req.query.requireCondUsuario || req.query.requireCondUsuarioId)) || '').trim();
    const requireCondUsuario = requireCondUsuarioRaw && requireCondUsuarioRaw !== '0' && requireCondUsuarioRaw.toLowerCase() !== 'false';
    if (requireCondUsuario) {
      result = result.filter(r => {
        const cid = String(r?.cond_usuario_id || '').trim();
        return !!(cid && mongoose.isValidObjectId(cid));
      });
    }

    if (limit > 0 && result.length > limit) result = result.slice(0, limit);
    return res.json(result);
  } catch (e) {
    console.error('[api/usuarios/busca.v2] erro GET', e);
    return res.status(200).json([]);
  }
});

// ======================= Materiais =======================
// Listagem/busca com escopo por unidade e enriquecimento básico
app.get('/api/materiais/busca', async (req, res) => {
  const { unidade, tipo, natureza } = req.query || {};
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json([]); }
    const filtro = {};
    if(unidade){
      const ctxUser = req.user || (req.session && req.session.user) || null;
      const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
      if(!isAdmin){
        try{
          const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
          const unitIds = (unidadesOptions || []).map((u) => String(u._id));
          if(!unitIds.includes(String(unidade))){
            return res.json([]);
          }
        }catch{
          return res.json([]);
        }
      }
      filtro.unidade_id = unidade;
    }
    else {
      try{
        const ctxUser = req.user || (req.session && req.session.user) || null;
        const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
        const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
        if(!isAdmin){
          const unitIds = (unidadesOptions||[]).map(u => u._id);
          if (!unitIds.length) {
            filtro._id = { $exists: false };
          } else {
            filtro.unidade_id = { $in: unitIds };
          }
        }
      }catch{}
    }
    if(tipo){ filtro.tipo = tipo; }
    if(natureza){ filtro.natureza_id = natureza; }
    const docs = await CondBemMaterial.find(filtro).sort({ createdAt:-1 }).lean();
    if(!docs.length) return res.json([]);
    const unidadeIds = new Set();
    const naturezaIds = new Set();
    const areaIds = new Set();
    docs.forEach(doc => {
      if(doc.unidade_id) unidadeIds.add(String(doc.unidade_id));
      if(doc.natureza_id) naturezaIds.add(String(doc.natureza_id));
      if(doc.vinculo_area){
        if(doc.vinculo_area.unidade_id) unidadeIds.add(String(doc.vinculo_area.unidade_id));
        if(doc.vinculo_area.area_id) areaIds.add(String(doc.vinculo_area.area_id));
      }
    });
    const [unidades, naturezas, areas] = await Promise.all([
      unidadeIds.size ? unidadesReadRepoFromReq(req).find({ _id: { $in: Array.from(unidadeIds) } }, { select: '_id codigo nome' }) : [],
      naturezaIds.size ? CondNatMaterial.find({ _id: { $in: Array.from(naturezaIds) } }).select('_id nome tipo unidade_id').lean() : [],
      areaIds.size ? CondAreaComum.find({ _id: { $in: Array.from(areaIds) } }).select('_id nome unidade_id').lean() : []
    ]);
    const unidadeMap = new Map(unidades.map(u => [String(u._id), u]));
    const naturezaMap = new Map(naturezas.map(n => [String(n._id), n]));
    const areaMap = new Map(areas.map(a => [String(a._id), a]));
    const buildUnidadeRotulo = (u) => {
      if(!u) return '';
      const codigo = u.codigo ? `${u.codigo} - ` : '';
      return `${codigo}${u.nome || ''}`.trim();
    };
    const result = docs.map(doc => {
      const unidadeDoc = unidadeMap.get(String(doc.unidade_id)) || { _id: doc.unidade_id };
      const naturezaDoc = naturezaMap.get(String(doc.natureza_id)) || null;
      const vinculo = doc.vinculo_area && doc.vinculo_area.unidade_id && doc.vinculo_area.area_id ? {
        unidade_id: doc.vinculo_area.unidade_id,
        area_id: doc.vinculo_area.area_id
      } : (doc.vinculo_area ? doc.vinculo_area : null);
      let areaRotulo = '';
      if(vinculo && vinculo.area_id){
        const areaDoc = areaMap.get(String(vinculo.area_id));
        const unidadeArea = vinculo.unidade_id ? (unidadeMap.get(String(vinculo.unidade_id)) || null) : null;
        const unidadeTxt = buildUnidadeRotulo(unidadeArea);
        const areaNome = areaDoc && areaDoc.nome ? areaDoc.nome : '';
        areaRotulo = [unidadeTxt, areaNome].filter(Boolean).join(' - ');
      }
      return {
        _id: doc._id,
        unidade_id: doc.unidade_id || null,
        unidade: unidadeDoc,
        tipo: doc.tipo,
        natureza: naturezaDoc ? { _id: naturezaDoc._id, nome: naturezaDoc.nome, tipo: naturezaDoc.tipo, unidade_id: naturezaDoc.unidade_id } : null,
        nome: naturezaDoc ? naturezaDoc.nome : '',
        natureza_id: doc.natureza_id,
        serie: doc.serie || '',
        data_aquisicao: doc.data_aquisicao || null,
        marca: doc.marca || '',
        modelo: doc.modelo || '',
        num_serie: doc.num_serie || '',
        peso: doc.peso || '',
        cor: doc.cor || '',
        descricao: doc.descricao || '',
        foto: doc.foto || '',
        anexo: doc.anexo || '',
        vinculo_area: vinculo,
        area_rotulo: areaRotulo,
        ativa: doc.ativa !== false,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
      };
    });
    res.json(result);
  }catch(e){ console.error('[api/materiais/busca] erro GET', e); res.status(200).json([]); }
});

app.post('/api/materiais', express.json({ limit: '4mb' }), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const { unidade_id, tipo, natureza_id, serie, data_aquisicao, marca, modelo, num_serie, peso, cor, descricao, foto, anexo, vinculo_area } = req.body || {};
    if(!unidade_id) return res.status(400).json({ error:'unidade_id é obrigatório' });
    if(!tipo) return res.status(400).json({ error:'tipo é obrigatório' });
    if(serie){
      const dup = await CondBemMaterial.findOne({ unidade_id, serie: String(serie) }).select('_id').lean();
      if(dup) return res.status(409).json({ error:'Já existe um material com este nº de patrimônio nesta unidade' });
    }
    let fotoUrl='', anexoUrl='';
    let blobFailed=false, blobMissingToken=false, blobTried=false;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
    // Foto (imagem)
    if(typeof foto==='string' && foto.startsWith('data:')){
      if(foto.length > 2_000_000) return res.status(413).json({ error:'Imagem muito grande (~2MB limite)' });
      blobTried=true;
      try{
        const m = /^data:(.+?);base64,(.+)$/.exec(foto); if(!m) return res.status(400).json({ error:'Formato de imagem inválido' });
        const mime=m[1], b64=m[2]; const allowed=['image/png','image/jpeg','image/jpg','image/webp']; if(!allowed.includes(mime)) return res.status(400).json({ error:'Tipo de imagem não suportado' });
        const buf = Buffer.from(b64,'base64'); const extMap={ 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext=extMap[mime]||'bin';
        const fileName=`materiais/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
        fotoUrl = uploaded.url;
      }catch(e){ console.error('[api/materiais] upload foto erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
    }
    // Anexo (PDF)
    if(typeof anexo==='string' && anexo.startsWith('data:')){
      if(anexo.length > 4_000_000) return res.status(413).json({ error:'Anexo muito grande (~4MB limite)' });
      blobTried=true;
      try{
        const m = /^data:(.+?);base64,(.+)$/.exec(anexo); if(!m) return res.status(400).json({ error:'Formato de anexo inválido' });
        const mime=m[1], b64=m[2]; if(mime!=='application/pdf') return res.status(400).json({ error:'Anexo deve ser PDF' });
        const buf = Buffer.from(b64,'base64');
        const fileName=`materiais/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
        const uploaded = await put(fileName, buf, { access:'public', contentType:'application/pdf', cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
        anexoUrl = uploaded.url;
      }catch(e){ console.error('[api/materiais] upload anexo erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
    }
    const dataISO = data_aquisicao ? new Date(data_aquisicao) : null;
    const vinc = (vinculo_area && vinculo_area.unidade_id && vinculo_area.area_id) ? { unidade_id: vinculo_area.unidade_id, area_id: vinculo_area.area_id } : null;
    const doc = await CondBemMaterial.create({
      unidade_id, tipo, natureza_id,
      serie: (serie||'').toString(), data_aquisicao: dataISO,
      marca: (marca||'').toString(), modelo: (modelo||'').toString(), num_serie: (num_serie||'').toString(), peso: (peso||'').toString(), cor: (cor||'').toString(),
      descricao: (descricao||'').toString(), foto: fotoUrl, anexo: anexoUrl,
      ...(vinc ? { vinculo_area: vinc } : {})
    });
    const plain = doc.toObject();
    res.status(201).json({ ...plain, foto_saved: !!plain.foto, anexo_saved: !!plain.anexo, blob_tried: blobTried, blob_failed: blobFailed, blob_missing_token: blobMissingToken });
  }catch(e){ console.error('[api/materiais] POST erro', e); res.status(500).json({ error:'Falha ao criar material', detail:e.message }); }
});

// Atualizar material
app.put('/api/materiais/:id', express.json({ limit: '4mb' }), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const id = req.params.id;
    const { unidade_id, tipo, natureza_id, serie, data_aquisicao, marca, modelo, num_serie, peso, cor, descricao, foto, anexo, vinculo_area } = req.body || {};
    const upd = {};
    if(unidade_id!==undefined) upd.unidade_id = unidade_id;
    if(tipo!==undefined) upd.tipo = String(tipo);
    if(natureza_id!==undefined) upd.natureza_id = natureza_id;
    if(serie!==undefined) upd.serie = (serie||'').toString();
    if(data_aquisicao!==undefined) upd.data_aquisicao = data_aquisicao ? new Date(data_aquisicao) : null;
    if(marca!==undefined) upd.marca = (marca||'').toString();
    if(modelo!==undefined) upd.modelo = (modelo||'').toString();
    if(num_serie!==undefined) upd.num_serie = (num_serie||'').toString();
    if(peso!==undefined) upd.peso = (peso||'').toString();
    if(cor!==undefined) upd.cor = (cor||'').toString();
    if(descricao!==undefined) upd.descricao = (descricao||'').toString();
    if(vinculo_area!==undefined){ if(vinculo_area && vinculo_area.unidade_id && vinculo_area.area_id){ upd.vinculo_area = { unidade_id: vinculo_area.unidade_id, area_id: vinculo_area.area_id }; } else { upd.vinculo_area = null; } }

    let blobFailed=false, blobMissingToken=false, blobTried=false;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
    if(foto!==undefined){
      if(foto==='' || foto===null){ upd.foto=''; }
      else if(typeof foto==='string' && foto.startsWith('data:')){
        if(foto.length > 2_000_000) return res.status(413).json({ error:'Imagem muito grande (~2MB limite)' });
        blobTried=true;
        try{
          const atual = await CondBemMaterial.findById(id).select('foto').lean();
          const m = /^data:(.+?);base64,(.+)$/.exec(foto); if(!m) return res.status(400).json({ error:'Formato imagem inválido' });
          const mime=m[1], b64=m[2]; const allowed=['image/png','image/jpeg','image/jpg','image/webp']; if(!allowed.includes(mime)) return res.status(400).json({ error:'Tipo não suportado' });
          const buf = Buffer.from(b64,'base64'); const extMap={ 'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' }; const ext=extMap[mime]||'bin';
          const fileName=`materiais/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`; const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
          upd.foto = uploaded.url;
          if(process.env.ENABLE_DELETE_OLD_BLOB==='1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)){
            try{ await del(atual.foto, blobToken?{token:blobToken}:undefined); }catch(_e){}
          }
        }catch(e){ console.error('[api/materiais] PUT upload foto erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
      } else if(/^https?:\/\//.test(foto)){ upd.foto=foto; }
      else { return res.status(400).json({ error:'Foto deve ser data URL ou URL http(s)' }); }
    }
    if(anexo!==undefined){
      if(anexo==='' || anexo===null){ upd.anexo=''; }
      else if(typeof anexo==='string' && anexo.startsWith('data:')){
        if(anexo.length > 4_000_000) return res.status(413).json({ error:'Anexo muito grande (~4MB limite)' });
        blobTried=true;
        try{
          const atual = await CondBemMaterial.findById(id).select('anexo').lean();
          const m = /^data:(.+?);base64,(.+)$/.exec(anexo); if(!m) return res.status(400).json({ error:'Formato anexo inválido' });
          const mime=m[1], b64=m[2]; if(mime!=='application/pdf') return res.status(400).json({ error:'Anexo deve ser PDF' });
          const buf = Buffer.from(b64,'base64'); const fileName=`materiais/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
          const uploaded = await put(fileName, buf, { access:'public', contentType:'application/pdf', cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
          upd.anexo = uploaded.url;
          if(process.env.ENABLE_DELETE_OLD_BLOB==='1' && atual && atual.anexo && /vercel-storage\.com/.test(atual.anexo)){
            try{ await del(atual.anexo, blobToken?{token:blobToken}:undefined); }catch(_e){}
          }
        }catch(e){ console.error('[api/materiais] PUT upload anexo erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
      } else if(/^https?:\/\//.test(anexo)){ upd.anexo=anexo; }
      else { return res.status(400).json({ error:'Anexo deve ser data URL ou URL http(s)' }); }
    }
    try{
      // Checar duplicidade da série na mesma unidade, se alterada
      if(upd.serie){
        const atual = await CondBemMaterial.findById(id).select('unidade_id serie').lean();
        const sameSerie = await CondBemMaterial.findOne({ _id: { $ne: id }, unidade_id: (upd.unidade_id||atual.unidade_id), serie: upd.serie }).select('_id').lean();
        if(sameSerie) return res.status(409).json({ error:'Já existe um material com este nº de patrimônio nesta unidade' });
      }
      const doc = await CondBemMaterial.findByIdAndUpdate(id, { $set: upd }, { new:true, runValidators:true }).lean();
      return res.json({ ...doc, foto_saved: !!(doc&&doc.foto), anexo_saved: !!(doc&&doc.anexo), blob_tried: blobTried, blob_failed: blobFailed, blob_missing_token: blobMissingToken });
    }catch(e){ console.error('[api/materiais] PUT erro', e); return res.status(500).json({ error:'Falha ao atualizar material', detail:e.message }); }
  }catch(e){ console.error('[api/materiais] PUT erro (outer)', e); res.status(500).json({ error:'Falha ao atualizar material', detail:e.message }); }
});

// Excluir material
app.delete('/api/materiais/:id', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível, tente novamente' }); }
    const id = req.params.id;
    // Apaga o material
    await CondBemMaterial.findByIdAndDelete(id);
    // Também apaga o QR Code associado, se existir
    try { await CondQRCodeMaterial.deleteOne({ material_id: id }); } catch(_e) { /* silencioso */ }
    res.json({ ok:true, deleted:true });
  }catch(e){ res.status(500).json({ error:'Falha ao excluir material' }); }
});

// ======================= QR Code de Materiais =======================
// Obter QR Code salvo para um material
app.get('/api/materiais/:id/qrcode', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível' }); }
    const materialId = req.params.id;
    if(!isValidObjectId(materialId)) return res.status(400).json({ error:'ID do material inválido' });
    const doc = await CondQRCodeMaterial.findOne({ material_id: materialId }).lean();
    if(!doc) {
      return res.json({
        ok: true,
        exists: false,
        material_id: materialId,
        url: '',
        payload: {},
        img: '',
        formato: 'png'
      });
    }
    return res.json({ ok: true, exists: true, _id: doc._id, material_id: doc.material_id, unidade_id: doc.unidade_id, url: doc.url||'', payload: doc.payload||{}, img: doc.img||'', formato: doc.formato||'png', createdAt: doc.createdAt, updatedAt: doc.updatedAt });
  }catch(e){ console.error('[api/materiais/:id/qrcode] GET erro', e); return res.status(500).json({ error:'Falha ao obter QR Code' }); }
});

// Criar/atualizar QR Code de um material (persiste imagem do QR como blob)
app.post('/api/materiais/:id/qrcode', express.json({ limit: '2mb' }), async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ error:'Banco indisponível' }); }
    const materialId = req.params.id;
    const { url, payload, img, formato } = req.body || {};
    const mat = await CondBemMaterial.findById(materialId).select('_id unidade_id').lean();
    if(!mat) return res.status(404).json({ error:'Material não encontrado' });
    let imgUrl=''; let blobFailed=false, blobMissingToken=false, blobTried=false;
    if(typeof img==='string' && img.startsWith('data:')){
      if(img.length > 1_500_000) return res.status(413).json({ error:'Imagem do QR muito grande (~1.5MB limite)' });
      blobTried=true;
      try{
        const m = /^data:(.+?);base64,(.+)$/.exec(img); if(!m) return res.status(400).json({ error:'Formato de imagem inválido' });
        const mime=m[1], b64=m[2]; const allowed=['image/png','image/svg+xml']; if(!allowed.includes(mime)) return res.status(400).json({ error:'Tipo de imagem não suportado' });
        const buf = Buffer.from(b64,'base64');
        const ext = (mime==='image/png') ? 'png' : 'svg';
        const fileName=`materiais/qrcodes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
        const uploaded = await put(fileName, buf, { access:'public', contentType:mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
        imgUrl = uploaded.url;
      }catch(e){ console.error('[api/materiais/:id/qrcode] upload erro', e); blobFailed=true; if(e && /No token found/i.test(e.message||'')) blobMissingToken=true; }
    } else if(typeof img==='string' && /^https?:\/\//.test(img)){
      imgUrl = img;
    }
    const data = { material_id: mat._id, unidade_id: mat.unidade_id, url: String(url||''), payload: (payload && typeof payload==='object') ? payload : {}, formato: (formato|| (imgUrl && imgUrl.endsWith('.svg') ? 'svg' : 'png')), ...(imgUrl ? { img: imgUrl } : {}) };
    const saved = await CondQRCodeMaterial.findOneAndUpdate({ material_id: mat._id }, { $set: data }, { new:true, upsert:true, setDefaultsOnInsert:true }).lean();
    return res.status(201).json({ _id: saved._id, material_id: saved.material_id, unidade_id: saved.unidade_id, url: saved.url, payload: saved.payload||{}, img: saved.img||'', formato: saved.formato||'png', foto_saved: !!saved.img, blob_tried: blobTried, blob_failed: blobFailed, blob_missing_token: blobMissingToken });
  }catch(e){ console.error('[api/materiais/:id/qrcode] POST erro', e); return res.status(500).json({ error:'Falha ao salvar QR Code' }); }
});

// Informações públicas do material (utilizado pelo QR Code)
app.get('/api/public/materiais/:id', async (req, res) => {
  try{
    if(mongoose.connection.readyState !== 1){ try{ res.set('Retry-After','5'); }catch{} return res.status(503).json({ ok:false, error:'Banco indisponível, tente novamente' }); }
    const materialId = req.params.id;
    if(!isValidObjectId(materialId)) return res.status(400).json({ ok:false, error:'ID do material inválido' });

    const materialDoc = await CondBemMaterial.findById(materialId)
      .select('_id unidade_id natureza_id serie tipo marca modelo cor descricao foto vinculo_area ativa updatedAt createdAt')
      .lean();
    if(!materialDoc) return res.status(404).json({ ok:false, error:'Material não encontrado' });

    const unidadeQuery = String(req.query.unidade || req.query.unidadeId || req.query.unidade_id || '').trim();
    const unidadeId = materialDoc.unidade_id ? String(materialDoc.unidade_id) : '';
    if(unidadeQuery && unidadeId && unidadeQuery !== unidadeId) return res.status(404).json({ ok:false, error:'Material não encontrado' });

    const naturezaId = materialDoc.natureza_id ? String(materialDoc.natureza_id) : '';
    const areaId = materialDoc.vinculo_area && materialDoc.vinculo_area.area_id ? String(materialDoc.vinculo_area.area_id) : '';

    const [naturezaDoc, unidadeDoc, areaDoc] = await Promise.all([
      naturezaId ? CondNatMaterial.findById(naturezaId).select('_id nome tipo').lean() : Promise.resolve(null),
      unidadeId ? unidadesReadRepoFromReq(req).findById(
        unidadeId,
        { select: '_id codigo nome razaoSocial cnpj endereco telefoneFixo telefoneCelular logo tipoLogradouro logradouro numero complemento bairro cep cidade estado' }
      ) : Promise.resolve(null),
      areaId ? CondAreaComum.findById(areaId).select('_id nome capacidade unidade_id').lean() : Promise.resolve(null)
    ]);

    const unidadePublic = unidadeDoc ? {
      _id: String(unidadeDoc._id),
      codigo: unidadeDoc.codigo || '',
      nome: unidadeDoc.nome || '',
      razao: unidadeDoc.razaoSocial || unidadeDoc.nome || '',
      cnpj: unidadeDoc.cnpj || '',
      endereco: unidadeDoc.endereco || buildEnderecoCompleto(unidadeDoc) || '',
      telefone: unidadeDoc.telefoneFixo || unidadeDoc.telefoneCelular || '',
      logo: unidadeDoc.logo || ''
    } : null;

    const natureza = naturezaDoc ? {
      _id: String(naturezaDoc._id),
      nome: naturezaDoc.nome || '',
      tipo: naturezaDoc.tipo || ''
    } : null;

    const areaPublic = areaDoc ? {
      _id: String(areaDoc._id),
      nome: areaDoc.nome || '',
      capacidade: areaDoc.capacidade != null ? Number(areaDoc.capacidade) : null
    } : null;
    const areaRotulo = areaPublic ? [unidadePublic && unidadePublic.codigo, areaPublic.nome].filter(Boolean).join(' - ') : '';

    const materialPublic = {
      _id: String(materialDoc._id),
      unidadeId,
      natureza,
      nome: natureza && natureza.nome ? natureza.nome : (materialDoc.descricao || 'Material'),
      tipo: materialDoc.tipo || (natureza && natureza.tipo) || '',
      serie: materialDoc.serie || '',
      marca: materialDoc.marca || '',
      modelo: materialDoc.modelo || '',
      cor: materialDoc.cor || '',
      descricao: materialDoc.descricao || '',
      foto: materialDoc.foto || '',
      area: areaPublic,
      areaRotulo,
      lotacao: areaPublic && areaPublic.capacidade != null ? String(areaPublic.capacidade) : (areaRotulo || ''),
      createdAt: materialDoc.createdAt || null,
      updatedAt: materialDoc.updatedAt || null
    };

    return res.json({ ok:true, success:true, material: materialPublic, unidade: unidadePublic });
  }catch(err){
    console.error('[api/public/materiais/:id] GET erro', err);
    return res.status(500).json({ ok:false, error:'Falha ao obter material' });
  }
});

// CRUD Habitação básico
// Backfill: garantir caixas vinculadas para habitações já existentes.
// Uso (admin/master): POST /api/habitacoes/backfill-caixa-publica?limit=200&skip=0&unidade_id=<opcional>
app.post('/api/habitacoes/backfill-caixa-publica', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const ctxUser = req.user || (req.session && req.session.user) || null;
    if (!ctxUser) return res.status(401).json({ ok: false, error: 'Não autenticado' });
    if (!userCanScopeAll(ctxUser)) return res.status(403).json({ ok: false, error: 'Acesso negado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ ok: false, error: 'DB indisponível' });
      }
    }

    const limitRaw = Number(req.query.limit ?? req.body?.limit ?? 200);
    const skipRaw = Number(req.query.skip ?? req.body?.skip ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200;
    const skip = Number.isFinite(skipRaw) ? Math.max(0, Math.trunc(skipRaw)) : 0;

    const unidadeFilter = String(req.query.unidade_id || req.body?.unidade_id || req.query.unidade || '').trim();
    const habFilter = {};
    if (unidadeFilter) {
      if (!mongoose.isValidObjectId(unidadeFilter)) return res.status(400).json({ ok: false, error: 'unidade_id inválido' });
      habFilter.unidade_id = unidadeFilter;
    }

    const habs = await CondHabitacao.find(habFilter)
      .select('_id unidade_id bloco_id andar_id tipo numero proprietario_id alugado contrato_locacao')
      .sort({ _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const hab of habs || []) {
      const habId = String(hab?._id || '').trim();
      const unidadeId = String(hab?.unidade_id || '').trim();
      if (!habId || !unidadeId) {
        skipped++;
        continue;
      }

      try {
        const existed = await CondMsgMailbox.exists({
          ativo: { $ne: false },
          unidade_id: unidadeId,
          link_type: 'habitacao',
          link_id: habId
        });

        await ensureHabPublicMailboxForHabitacao(hab, { strict: false }, unidadesReadRepoFromReq(req));

        if (existed) updated++; else created++;
      } catch (e) {
        failed++;
        console.warn('[backfill-caixa-publica] falha', { habId }, e?.message || e);
      }
    }

    return res.json({
      ok: true,
      paging: { skip, limit, returned: (habs || []).length },
      result: { created, updated, skipped, failed }
    });
  } catch (e) {
    console.error('[api/habitacoes/backfill-caixa-publica] erro', e);
    return res.status(500).json({ ok: false, error: 'Falha ao executar backfill' });
  }
});

app.post('/api/habitacoes', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { unidade_id, bloco_id, andar_id, numero, tipo, area_m2, fracao_ideal, vencimento_contribuicao_dia, descricao, foto } = req.body || {};
    if (!unidade_id || !numero) return res.status(400).json({ error: 'unidade_id e numero são obrigatórios' });
    // Validação de fração ideal (0..100)
    let fr = null;
    if (fracao_ideal !== undefined && fracao_ideal !== null && fracao_ideal !== '') {
      const fnum = Number(fracao_ideal);
      if (Number.isNaN(fnum)) return res.status(400).json({ error: 'fracao_ideal inválida' });
      if (fnum < 0 || fnum > 100) return res.status(400).json({ error: 'fracao_ideal deve estar entre 0 e 100' });
      fr = fnum;
    }
    let vencimentoDia = null;
    if (vencimento_contribuicao_dia !== undefined && vencimento_contribuicao_dia !== null && vencimento_contribuicao_dia !== '') {
      const diaNum = Number(vencimento_contribuicao_dia);
      if (Number.isNaN(diaNum)) return res.status(400).json({ error: 'vencimento_contribuicao_dia inválido' });
      if (diaNum < 1 || diaNum > 31) return res.status(400).json({ error: 'vencimento_contribuicao_dia deve estar entre 1 e 31' });
      vencimentoDia = Math.trunc(diaNum);
    }
    let fotoUrl = '';
    let blobFailed = false;
    let blobTried = false;
    let blobMissingToken = false;
    if (typeof foto === 'string' && foto.startsWith('data:')) {
      if (foto.length > 2_000_000) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });
      blobTried = true;
      try {
        const match = /^data:(.+?);base64,(.+)$/.exec(foto);
        if (!match) return res.status(400).json({ error: 'Formato de imagem inválido (esperado data URL base64)' });
        const mime = match[1];
        const b64 = match[2];
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
        const buf = Buffer.from(b64, 'base64');
        const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
        const ext = extMap[mime] || 'bin';
        const fileName = `habitacoes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN
          || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
          || process.env.VERCEL_BLOB_RW_TOKEN
          || '';
        const uploaded = await put(fileName, buf, {
          access: 'public',
          contentType: mime,
          cacheControl: 'public, max-age=31536000, immutable',
          ...(blobToken ? { token: blobToken } : {})
        });
        fotoUrl = uploaded.url;
      } catch (e) {
        console.error('[api/habitacoes] erro upload blob (prosseguindo sem foto)', e);
        blobFailed = true;
        fotoUrl = '';
        if(e && /No token found/i.test(e.message||'')) blobMissingToken = true;
      }
    }
    const doc = await CondHabitacao.create({
      unidade_id,
      bloco_id: bloco_id || null,
      andar_id: andar_id || null,
      numero: String(numero).trim(),
      tipo: (tipo || '').toString(),
      area_m2: area_m2 != null ? Number(area_m2) : null,
      fracao_ideal: fr,
      vencimento_contribuicao_dia: vencimentoDia,
      descricao: (descricao || '').toString(),
      foto: fotoUrl
    });

    // Regra: toda habitação deve ter sua caixa vinculada.
    try {
      await syncHabPublicMailboxForHabitacaoId(doc._id, { strict: true });
    } catch (mailErr) {
      try { await CondHabitacao.deleteOne({ _id: doc._id }); } catch {}
      console.error('[api/habitacoes] falha ao criar caixa pública da habitação (rollback)', mailErr);
      return res.status(mailErr?.status || 500).json({ error: 'Falha ao criar caixa pública da habitação' });
    }

    try { console.info('[api/habitacoes] criado', { id: String(doc._id), unidade_id: String(doc.unidade_id), tipo: doc.tipo, temFoto: !!doc.foto }); } catch {}
    // Resposta enriquecida para o front detectar falha silenciosa no upload
    const plain = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
    res.status(201).json({
      ...plain,
      foto_saved: !!plain.foto,
      blob_enabled: typeof put === 'function',
      blob_tried: blobTried,
      blob_failed: blobFailed,
      blob_missing_token: blobMissingToken
    });
  } catch (e) { console.error('[api/habitacoes] POST erro', e); res.status(500).json({ error: 'Falha ao criar habitação', detail: e.message }); }
});

app.get('/api/habitacoes', async (req, res) => {
  const { unidade } = req.query || {};
  try{
    const filtro = {};
    if(unidade) filtro.unidade_id = unidade;
    const list = await CondHabitacao.find(filtro).lean();
    res.json(list || []);
  }catch(e){ res.status(200).json([]); }
});

// Obter uma habitação por ID (forma enxuta, mas mantendo campos necessários ao modal)
app.get('/api/habitacoes/:id', async (req, res) => {
  try{
    const id = req.params.id;
    if(!id) return res.status(400).json({ error:'ID inválido' });
    const h = await CondHabitacao.findById(id).lean();
    if(!h) return res.status(404).json({ error:'Habitação não encontrada' });
    // Enriquecer rótulos mínimos e carregar moradores
    const [unidade, bloco, andar, proprietario, moradores] = await Promise.all([
      h.unidade_id ? unidadesReadRepoFromReq(req).findById(h.unidade_id, { select: '_id codigo nome' }) : null,
      h.bloco_id ? CondBloco.findById(h.bloco_id).select('_id nome').lean() : null,
      h.andar_id ? CondAndar.findById(h.andar_id).select('_id nome').lean() : null,
      h.proprietario_id ? CondProprietario.findById(h.proprietario_id).select('_id nome tipo cpf cnpj').lean() : null,
  CondMorador.find({ habitacao_id: id, ativo: { $ne: false } }).select('_id nome data_nascimento inquilino habitacao_id').lean()
    ]);
    return res.json({
      _id: h._id,
      unidade: unidade || { _id: h.unidade_id },
      bloco: bloco || (h.bloco_id ? { _id: h.bloco_id } : null),
      andar: andar || (h.andar_id ? { _id: h.andar_id } : null),
      tipo: h.tipo || '',
      numero: h.numero,
      proprietario: proprietario || (h.proprietario_id ? { _id: h.proprietario_id } : null),
      alugado: !!h.alugado,
      contrato_locacao: h.contrato_locacao || null,
      contratos_locacao: Array.isArray(h.contratos_locacao) ? h.contratos_locacao : [],
      moradores: Array.isArray(moradores) ? moradores : [],
      veiculos: h.veiculos || [],
      pets: h.pets || [],
      area_m2: h.area_m2 != null ? h.area_m2 : null,
      fracao_ideal: h.fracao_ideal != null ? h.fracao_ideal : null,
      vencimento_contribuicao_dia: h.vencimento_contribuicao_dia != null ? h.vencimento_contribuicao_dia : null,
      descricao: h.descricao || '',
      foto: h.foto || ''
    });
  }catch(e){
    console.error('[api/habitacoes/:id] GET erro', e);
    res.status(500).json({ error:'Falha ao obter habitação' });
  }
});

app.put('/api/habitacoes/:id', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const id = req.params.id;
    const { unidade_id, bloco_id, andar_id, numero, tipo, area_m2, fracao_ideal, vencimento_contribuicao_dia, descricao, alugado, contrato_locacao, foto } = req.body || {};
    // Normaliza período vindo como BR (DD/MM/AAAA) ou ISO para objetos Date
    const normPeriodo = (per) => {
      if(!per || typeof per !== 'object') return null;
      const parse = (s) => {
        if(!s) return null;
        try{
          const str = String(s).trim();
          const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
          if(m) return new Date(+m[3], +m[2]-1, +m[1]);
          const d = new Date(str);
          return isNaN(d) ? null : d;
        }catch{ return null; }
      };
      return { inicio: parse(per.inicio||per.start||per.inicio_vigencia||per.vigencia_inicio), fim: parse(per.fim||per.end||per.fim_vigencia||per.vigencia_fim) };
    };
    const allowedContratoMimes = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';
    const allowedVeiculoDocMimes = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
    const maxVeiculoDocSize = 5 * 1024 * 1024;
    const allowedVeiculoFotoMimes = ['image/png','image/jpeg','image/jpg','image/webp'];
    const maxVeiculoFotoSize = 5 * 1024 * 1024;
    const maxVeiculoFotosCount = 3;
    const allowedPetFotoMimes = ['image/png','image/jpeg','image/jpg','image/webp'];
    const maxPetFotoSize = 4 * 1024 * 1024;
    const failVeiculoUpload = (message, status = 500, options = {}) => {
      const err = new Error(message);
      err.status = status;
      err.code = options.code || 'veiculo_upload_failed';
      err.detail = options.detail || '';
      err.publicMessage = message;
      err.blob_missing_token = !!options.blob_missing_token;
      return err;
    };
    const failPetUpload = (message, status = 500, options = {}) => {
      const err = new Error(message);
      err.status = status;
      err.code = options.code || 'pet_upload_failed';
      err.detail = options.detail || '';
      err.publicMessage = message;
      err.blob_missing_token = !!options.blob_missing_token;
      return err;
    };
    const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
    const parseDateLoose = (value) => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      const str = String(value).trim();
      if (!str) return null;
      const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) {
        const dt = new Date(+br[3], +br[2] - 1, +br[1]);
        return Number.isNaN(dt.getTime()) ? null : dt;
      }
      const iso = new Date(str);
      return Number.isNaN(iso.getTime()) ? null : iso;
    };
    const normalizeObjectId = (value) => {
      if (!value) return null;
      try {
        const str = String(value).trim();
        if (!str) return null;
        if (!mongoose.Types.ObjectId.isValid(str)) return null;
        return new mongoose.Types.ObjectId(str);
      } catch { return null; }
    };
    const uploadVeiculoFile = async (orig, { defaultName, folder, label, allowedMimes = allowedVeiculoDocMimes, maxSize = maxVeiculoDocSize }) => {
      if (!orig || typeof orig !== 'object') {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      const result = {
        url: typeof orig.url === 'string' ? orig.url.trim() : '',
        nome: typeof orig.nome === 'string' ? orig.nome.trim() : '',
        mime: typeof orig.mime === 'string' ? orig.mime.trim() : '',
        tamanho: (() => {
          const parsed = Number(orig.tamanho);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        })()
      };
      const fileData = typeof orig.file === 'string' ? orig.file.trim() : '';
      if (fileData) {
        const match = /^data:(.+?);base64,(.+)$/.exec(fileData);
        if (!match) {
          throw failVeiculoUpload(`Formato inválido do arquivo ${label}.`, 400, { code: 'veiculo_doc_formato_invalido' });
        }
        const mime = match[1];
        const b64 = match[2];
        if (!allowedMimes.includes(mime)) {
          throw failVeiculoUpload(`Tipo de arquivo do ${label} não suportado.`, 400, { code: 'veiculo_doc_tipo_invalido' });
        }
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > maxSize) {
          const limitMb = Math.max(1, Math.round(maxSize / 1048576));
          throw failVeiculoUpload(`Arquivo do ${label} excede o limite de ${limitMb}MB.`, 413, { code: 'veiculo_doc_tamanho_excedido' });
        }
        const extMap = {
          'application/pdf': 'pdf',
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/webp': 'webp'
        };
        const ext = extMap[mime] || 'bin';
        const fileName = `habitacoes/${id}/veiculos/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        try {
          const uploaded = await put(fileName, buf, {
            access: 'public',
            contentType: mime,
            cacheControl: 'private, max-age=0, must-revalidate',
            ...(blobToken ? { token: blobToken } : {})
          });
          result.url = uploaded.url;
          result.nome = result.nome || defaultName;
          result.mime = mime;
          result.tamanho = buf.length;
        } catch (err) {
          const missingToken = err && /No token found/i.test(err.message || '');
          throw failVeiculoUpload(`Falha ao enviar arquivo do ${label}.`, missingToken ? 503 : 500, {
            code: 'veiculo_doc_upload_failed',
            detail: err && err.message ? err.message : '',
            blob_missing_token: missingToken
          });
        }
      } else if (orig.file !== undefined) {
        throw failVeiculoUpload(`Formato inválido do arquivo ${label}.`, 400, { code: 'veiculo_doc_formato_invalido' });
      }
      if (!result.url) {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      return {
        url: result.url,
        nome: result.nome || defaultName,
        mime: result.mime,
        tamanho: result.tamanho
      };
    };
    const uploadPetFoto = async (orig, { defaultName }) => {
      if (!orig || typeof orig !== 'object') {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      if (orig === null) {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      const result = {
        url: typeof orig.url === 'string' ? orig.url.trim() : '',
        nome: typeof orig.nome === 'string' ? orig.nome.trim() : '',
        mime: typeof orig.mime === 'string' ? orig.mime.trim() : '',
        tamanho: (() => {
          const parsed = Number(orig.tamanho);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        })()
      };
      if (orig.remove === true) {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      const fileData = typeof orig.file === 'string' ? orig.file.trim() : '';
      if (fileData) {
        const match = /^data:(.+?);base64,(.+)$/.exec(fileData);
        if (!match) {
          throw failPetUpload('Formato de imagem do pet inválido.', 400, { code: 'pet_foto_formato_invalido' });
        }
        const mime = match[1];
        const b64 = match[2];
        if (!allowedPetFotoMimes.includes(mime)) {
          throw failPetUpload('Tipo de imagem do pet não suportado.', 400, { code: 'pet_foto_tipo_invalido' });
        }
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > maxPetFotoSize) {
          throw failPetUpload('Imagem do pet excede o limite de 4MB.', 413, { code: 'pet_foto_tamanho_excedido' });
        }
        const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
        const ext = extMap[mime] || 'bin';
        const fileName = `habitacoes/${id}/pets/fotos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        try {
          const uploaded = await put(fileName, buf, {
            access: 'public',
            contentType: mime,
            cacheControl: 'private, max-age=0, must-revalidate',
            ...(blobToken ? { token: blobToken } : {})
          });
          result.url = uploaded.url;
          result.nome = result.nome || defaultName;
          result.mime = mime;
          result.tamanho = buf.length;
        } catch (err) {
          const missingToken = err && /No token found/i.test(err.message || '');
          throw failPetUpload('Falha ao enviar imagem do pet.', missingToken ? 503 : 500, {
            code: 'pet_foto_upload_failed',
            detail: err && err.message ? err.message : '',
            blob_missing_token: missingToken
          });
        }
      } else if (orig.file !== undefined) {
        throw failPetUpload('Formato inválido da imagem do pet.', 400, { code: 'pet_foto_formato_invalido' });
      }
      if (!result.url) {
        return { url: '', nome: '', mime: '', tamanho: null };
      }
      return {
        url: result.url,
        nome: result.nome || defaultName,
        mime: result.mime,
        tamanho: result.tamanho
      };
    };
    const normalizeVeiculoEntrada = async (orig, index) => {
      if (!orig || typeof orig !== 'object') {
        throw failVeiculoUpload(`Veículo ${index + 1} inválido.`, 400, { code: 'veiculo_dados_invalidos' });
      }
      const placaRaw = String(orig.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
      if (placaRaw.length !== 7) {
        throw failVeiculoUpload(`Veículo ${index + 1}: placa inválida.`, 400, { code: 'veiculo_placa_invalida', detail: `index:${index}` });
      }
      const placaFormatada = placaRaw.slice(0, 3) + '-' + placaRaw.slice(3);
      const tipo = String(orig.tipo || '').trim();
      if (!tipo) {
        throw failVeiculoUpload(`Veículo ${index + 1}: tipo não informado.`, 400, { code: 'veiculo_tipo_obrigatorio', detail: `index:${index}` });
      }
      const marca = String(orig.marca || '').trim();
      if (!marca) {
        throw failVeiculoUpload(`Veículo ${index + 1}: marca não informada.`, 400, { code: 'veiculo_marca_obrigatoria', detail: `index:${index}` });
      }
      const marcaExtra = (orig.marca_extra || orig.marcaExtra || '').toString().trim();
      if (marca.toLowerCase() === 'outro' && !marcaExtra) {
        throw failVeiculoUpload(`Veículo ${index + 1}: informe a marca do veículo.`, 400, { code: 'veiculo_marca_extra_obrigatoria', detail: `index:${index}` });
      }
      const modelo = String(orig.modelo || '').trim();
      if (!modelo) {
        throw failVeiculoUpload(`Veículo ${index + 1}: modelo não informado.`, 400, { code: 'veiculo_modelo_obrigatorio', detail: `index:${index}` });
      }
      const cor = String(orig.cor || '').trim();
      if (!cor) {
        throw failVeiculoUpload(`Veículo ${index + 1}: cor não informada.`, 400, { code: 'veiculo_cor_obrigatoria', detail: `index:${index}` });
      }
      const estado = String(orig.estado || '').trim().toUpperCase();
      if (estado && !/^[A-Z]{2}$/.test(estado)) {
        throw failVeiculoUpload(`Veículo ${index + 1}: estado inválido.`, 400, { code: 'veiculo_estado_invalido', detail: `index:${index}` });
      }
      const municipio = String(orig.municipio || '').trim();
      if (!municipio) {
        throw failVeiculoUpload(`Veículo ${index + 1}: município não informado.`, 400, { code: 'veiculo_municipio_obrigatorio', detail: `index:${index}` });
      }
      const ano = orig.ano != null ? Number(orig.ano) : null;
      const anoModelo = orig.ano_modelo != null ? Number(orig.ano_modelo) : null;
      if (ano != null && (Number.isNaN(ano) || ano < 1900 || ano > 2100)) {
        throw failVeiculoUpload(`Veículo ${index + 1}: ano inválido.`, 400, { code: 'veiculo_ano_invalido', detail: `index:${index}` });
      }
      if (anoModelo != null && (Number.isNaN(anoModelo) || ano == null || anoModelo < ano || anoModelo > ano + 1)) {
        throw failVeiculoUpload(`Veículo ${index + 1}: ano/modelo inválido.`, 400, { code: 'veiculo_ano_modelo_invalido', detail: `index:${index}` });
      }
      const proprietarioTipo = (orig.proprietario_tipo || '').toLowerCase() === 'externo' ? 'externo' : 'morador';
      const proprietarioNome = String(orig.proprietario_nome || '').trim();
      if (!proprietarioNome) {
        throw failVeiculoUpload(`Veículo ${index + 1}: informe o proprietário.`, 400, { code: 'veiculo_proprietario_obrigatorio', detail: `index:${index}` });
      }
      const proprietarioCpf = onlyDigits(orig.proprietario_cpf || '');
      if (proprietarioCpf && proprietarioCpf.length !== 11) {
        throw failVeiculoUpload(`Veículo ${index + 1}: CPF do proprietário deve ter 11 dígitos.`, 400, { code: 'veiculo_cpf_invalido', detail: `index:${index}` });
      }
      const proprietarioEmail = String(orig.proprietario_email || '').trim().toLowerCase();
      const nascimentoValor = orig.proprietario_data_nascimento;
      const nascimentoTemValor = nascimentoValor !== undefined && nascimentoValor !== null && String(nascimentoValor).trim() !== '';
      const proprietarioNascimento = nascimentoTemValor ? parseDateLoose(nascimentoValor) : null;
      if (nascimentoTemValor && !proprietarioNascimento) {
        throw failVeiculoUpload(`Veículo ${index + 1}: data de nascimento inválida.`, 400, { code: 'veiculo_nascimento_invalido', detail: `index:${index}` });
      }
      const proprietarioCnhNumero = onlyDigits(orig.proprietario_cnh_numero || '');
      if (proprietarioCnhNumero && proprietarioCnhNumero.length !== 11) {
        throw failVeiculoUpload(`Veículo ${index + 1}: CNH deve conter 11 dígitos.`, 400, { code: 'veiculo_cnh_invalida', detail: `index:${index}` });
      }
      const proprietarioCnhCategoria = String(orig.proprietario_cnh_categoria || '').trim().toUpperCase();
      const garagemId = normalizeObjectId(orig.garagem_id || orig.garagem || null);
      const proprietarioCondUsuarioId = normalizeObjectId(orig.proprietario_cond_usuario_id || null);
      const proprietarioMoradorId = normalizeObjectId(orig.proprietario_morador_id || null);
      const renavam = onlyDigits(orig.renavam || '').slice(0, 11);
      const chassi = String(orig.chassi || '').trim().toUpperCase();
      const veiculo = {
        placa: placaFormatada,
        tipo,
        marca,
        marca_extra: marcaExtra ? marcaExtra.toUpperCase() : '',
        modelo: modelo.toUpperCase(),
        cor: cor.toUpperCase(),
        ano: ano != null ? ano : null,
        ano_modelo: anoModelo != null ? anoModelo : null,
        renavam,
        chassi,
        estado,
        municipio,
        proprietario_tipo: proprietarioTipo,
        proprietario_nome: proprietarioNome,
        proprietario_email: proprietarioEmail,
        proprietario_cpf: proprietarioCpf,
        proprietario_data_nascimento: proprietarioNascimento,
        proprietario_cnh_numero: proprietarioCnhNumero,
        proprietario_cnh_categoria: proprietarioCnhCategoria,
        proprietario_cond_usuario_id: proprietarioCondUsuarioId,
        proprietario_morador_id: proprietarioMoradorId,
        garagem_id: garagemId,
        garagem_nome: String(orig.garagem_nome || '').trim(),
        garagem_codigo: String(orig.garagem_codigo || '').trim(),
        ativo: orig.ativo === false ? false : true
      };
      if (orig._id && mongoose.Types.ObjectId.isValid(orig._id)) {
        veiculo._id = new mongoose.Types.ObjectId(String(orig._id));
      }
      veiculo.crlv = await uploadVeiculoFile(orig.crlv, { defaultName: `CRLV ${placaFormatada}`, folder: 'crlv', label: 'CRLV' });
      veiculo.proprietario_cnh = await uploadVeiculoFile(orig.proprietario_cnh, { defaultName: `CNH ${proprietarioNome}`, folder: 'cnh', label: 'CNH' });
      const fotosEntrada = Array.isArray(orig.fotos) ? orig.fotos : [];
      const fotosNormalizadas = [];
      for (let fotoIdx = 0; fotoIdx < fotosEntrada.length && fotoIdx < maxVeiculoFotosCount; fotoIdx++) {
        const entrada = fotosEntrada[fotoIdx];
        try {
          const foto = await uploadVeiculoFile(entrada, {
            defaultName: `Foto ${fotoIdx + 1} ${placaFormatada}`,
            folder: 'fotos',
            label: 'foto do veículo',
            allowedMimes: allowedVeiculoFotoMimes,
            maxSize: maxVeiculoFotoSize
          });
          if (foto && foto.url) {
            if (entrada && entrada._id && mongoose.Types.ObjectId.isValid(entrada._id)) {
              foto._id = new mongoose.Types.ObjectId(String(entrada._id));
            }
            fotosNormalizadas.push(foto);
          }
        } catch (err) {
          throw failVeiculoUpload(`Veículo ${index + 1}: ${err.publicMessage || 'Falha ao processar foto'}`, err.status || 500, {
            code: err.code || 'veiculo_foto_upload_failed',
            detail: err.detail || '',
            blob_missing_token: err.blob_missing_token
          });
        }
      }
      veiculo.fotos = fotosNormalizadas;
      return veiculo;
    };
    const normalizePetEntrada = async (orig, index) => {
      if (!orig || typeof orig !== 'object') {
        throw failPetUpload(`Pet ${index + 1} inválido.`, 400, { code: 'pet_dados_invalidos', detail: `index:${index}` });
      }
      const especieRaw = String(orig.especie || '').trim();
      if (!especieRaw) {
        throw failPetUpload(`Pet ${index + 1}: informe a espécie.`, 400, { code: 'pet_especie_obrigatoria', detail: `index:${index}` });
      }
      const isOutro = especieRaw === '__outros__' || especieRaw.toLowerCase() === 'outro';
      const especieOutro = String(orig.especie_outro || orig.especieExtra || '').trim();
      if (isOutro && !especieOutro) {
        throw failPetUpload(`Pet ${index + 1}: especifique a espécie.`, 400, { code: 'pet_especie_extra_obrigatoria', detail: `index:${index}` });
      }
      const nome = String(orig.nome || '').trim();
      if (!nome) {
        throw failPetUpload(`Pet ${index + 1}: informe o nome.`, 400, { code: 'pet_nome_obrigatorio', detail: `index:${index}` });
      }
      const raca = String(orig.raca || '').trim();
      const peso = String(orig.peso || '').trim();
      const cor = String(orig.cor || '').trim();
      const auxNeeds = !!orig.aux_needs;
      let foto = { url: '', nome: '', mime: '', tamanho: null };
      try {
        if (orig.foto !== undefined) {
          foto = await uploadPetFoto(orig.foto, { defaultName: `Foto ${nome}` });
        }
      } catch (err) {
        throw failPetUpload(`Pet ${index + 1}: ${err.publicMessage || 'Falha ao processar imagem.'}`, err.status || 500, {
          code: err.code || 'pet_foto_upload_failed',
          detail: err.detail || '',
          blob_missing_token: err.blob_missing_token
        });
      }
      const pet = {
        especie: isOutro ? 'Outro' : especieRaw,
        especie_outro: isOutro ? especieOutro : '',
        nome,
        raca,
        peso,
        cor,
        aux_needs: auxNeeds,
        foto
      };
      if (orig._id && mongoose.Types.ObjectId.isValid(orig._id)) {
        pet._id = new mongoose.Types.ObjectId(String(orig._id));
      }
      return pet;
    };
    const buildContratoObject = (orig, overrides = {}) => {
      if(!orig || typeof orig !== 'object') return null;
      const base = { ...orig };
      delete base.file;
      const out = { ...base, ...overrides };
      out.nome = String(out.nome || 'contrato');
      out.url = typeof out.url === 'string' ? out.url : '';
      out.mime = typeof out.mime === 'string' ? out.mime : '';
      out.periodo = normPeriodo(out.periodo) || null;
      out.responsavel_morador_id = out.responsavel_morador_id || null;
      return out;
    };
    const failContratoUpload = (message, status = 500, options = {}) => {
      const err = new Error(message);
      err.status = status;
      err.code = options.code || 'contrato_upload_failed';
      err.detail = options.detail || '';
      err.blob_missing_token = !!options.blob_missing_token;
      err.publicMessage = message;
      return err;
    };
    const uploadContratoDataUrl = async (orig) => {
      if(!orig || typeof orig !== 'object' || typeof orig.file !== 'string') {
        return buildContratoObject(orig);
      }
      const match = /^data:(.+?);base64,(.+)$/.exec(orig.file);
      if (!match) {
        throw failContratoUpload('Formato de contrato inválido', 400, { code: 'contrato_formato_invalido' });
      }
      const mime = match[1];
      const b64 = match[2];
      if (!allowedContratoMimes.includes(mime)) {
        throw failContratoUpload('Tipo de arquivo de contrato não suportado', 400, { code: 'contrato_tipo_unsupported' });
      }
      const buf = Buffer.from(b64,'base64');
      const extMap = { 'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' };
      const ext = extMap[mime] || 'bin';
      const fileName = `contratos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      try {
        const uploaded = await put(fileName, buf, {
          access: 'public',
          contentType: mime,
          cacheControl: 'public, max-age=31536000, immutable',
          ...(blobToken ? { token: blobToken } : {})
        });
        return buildContratoObject(orig, { url: uploaded.url, mime });
      } catch (e) {
        const missingToken = /No token found/i.test(e?.message || '');
        const detail = e?.message || '';
        throw failContratoUpload(
          missingToken ? 'Falha ao enviar arquivo do contrato (Blob não configurado)' : 'Falha ao enviar arquivo do contrato',
          missingToken ? 503 : 500,
          { detail, blob_missing_token: missingToken }
        );
      }
    };
    const upd = {};
    if (unidade_id != null) upd.unidade_id = unidade_id;
    if (bloco_id !== undefined) upd.bloco_id = bloco_id || null;
    if (andar_id !== undefined) upd.andar_id = andar_id || null;
    if (numero != null) upd.numero = String(numero).trim();
    if (tipo != null) upd.tipo = String(tipo);
    if (area_m2 !== undefined) upd.area_m2 = area_m2 != null ? Number(area_m2) : null;
    if (fracao_ideal !== undefined) {
      if (fracao_ideal === null) { upd.fracao_ideal = null; }
      else {
        const fnum = Number(fracao_ideal);
        if (Number.isNaN(fnum)) return res.status(400).json({ error: 'fracao_ideal inválida' });
        if (fnum < 0 || fnum > 100) return res.status(400).json({ error: 'fracao_ideal deve estar entre 0 e 100' });
        upd.fracao_ideal = fnum;
      }
    }
    if (vencimento_contribuicao_dia !== undefined) {
      if (vencimento_contribuicao_dia === null || vencimento_contribuicao_dia === '') {
        upd.vencimento_contribuicao_dia = null;
      } else {
        const diaNum = Number(vencimento_contribuicao_dia);
        if (Number.isNaN(diaNum)) return res.status(400).json({ error: 'vencimento_contribuicao_dia inválido' });
        if (diaNum < 1 || diaNum > 31) return res.status(400).json({ error: 'vencimento_contribuicao_dia deve estar entre 1 e 31' });
        upd.vencimento_contribuicao_dia = Math.trunc(diaNum);
      }
    }
    if (descricao != null) upd.descricao = String(descricao);
    if (alugado !== undefined) upd.alugado = !!alugado;
    let pushContract = null;
    if (contrato_locacao !== undefined) {
      try {
        const contratoNormalizado = await uploadContratoDataUrl(contrato_locacao || null);
        upd.contrato_locacao = contratoNormalizado;
        pushContract = contratoNormalizado || null;
      } catch (err) {
        console.error('[api/habitacoes] upload contrato falhou', err);
        return res.status(err.status || 500).json({
          error: err.publicMessage || 'Falha ao enviar arquivo do contrato',
          code: err.code || 'contrato_upload_failed',
          detail: err.detail || '',
          blob_missing_token: !!err.blob_missing_token
        });
      }
    }
    // Sobrescrever lista completa (edições/remoções)
    if (Array.isArray(req.body && req.body.contratos_locacao)) {
      const lista = req.body.contratos_locacao;
      const listaTratada = [];
      for (const c of lista) {
        try {
          const itemNormalizado = await uploadContratoDataUrl(c || null);
          listaTratada.push(itemNormalizado);
        } catch (err) {
          console.error('[api/habitacoes] upload contrato item falhou', err);
          return res.status(err.status || 500).json({
            error: err.publicMessage || 'Falha ao enviar arquivo do contrato',
            code: err.code || 'contrato_upload_failed',
            detail: err.detail || '',
            blob_missing_token: !!err.blob_missing_token
          });
        }
      }
      upd.contratos_locacao = listaTratada;
      // Mantém compat com campo singular apontando para o último
      upd.contrato_locacao = (listaTratada && listaTratada.length) ? listaTratada[listaTratada.length-1] : null;
      // Não fazer push adicional neste caso
      pushContract = null;
    }
    if (Array.isArray(req.body && req.body.veiculos)) {
      const listaVeiculos = req.body.veiculos;
      try {
        const normalizados = [];
        const placasSet = new Set();
        for (let i = 0; i < listaVeiculos.length; i++) {
          const normalizado = await normalizeVeiculoEntrada(listaVeiculos[i], i);
          const placaKey = normalizado.placa ? normalizado.placa.replace(/[^A-Z0-9]/g, '') : '';
          if (placaKey) {
            if (placasSet.has(placaKey)) {
              throw failVeiculoUpload('Existem placas duplicadas na lista de veículos.', 400, { code: 'veiculo_placa_duplicada', detail: `index:${i}` });
            }
            placasSet.add(placaKey);
          }
          normalizados.push(normalizado);
        }
        upd.veiculos = normalizados;
      } catch (err) {
        console.error('[api/habitacoes] processamento veículos falhou', err);
        return res.status(err.status || 500).json({
          error: err.publicMessage || 'Falha ao salvar veículos da habitação',
          code: err.code || 'veiculo_process_failed',
          detail: err.detail || '',
          blob_missing_token: !!err.blob_missing_token
        });
      }
    }
    if (Array.isArray(req.body && req.body.pets)) {
      const listaPets = req.body.pets;
      try {
        const normalizados = [];
        for (let i = 0; i < listaPets.length; i++) {
          const pet = await normalizePetEntrada(listaPets[i], i);
          normalizados.push(pet);
        }
        upd.pets = normalizados;
      } catch (err) {
        console.error('[api/habitacoes] processamento pets falhou', err);
        return res.status(err.status || 500).json({
          error: err.publicMessage || 'Falha ao salvar pets da habitação',
          code: err.code || 'pet_process_failed',
          detail: err.detail || '',
          blob_missing_token: !!err.blob_missing_token
        });
      }
    }
    let blobFailed = false;
    let blobTried = false;
    let blobMissingToken = false;
    if (foto !== undefined) {
      if (foto === '' || foto === null) {
        upd.foto = '';
      } else if (typeof foto === 'string' && foto.startsWith('data:')) {
        if (foto.length > 2_000_000) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });
        blobTried = true;
        try {
          const atual = await CondHabitacao.findById(id).select('foto').lean();
          const match = /^data:(.+?);base64,(.+)$/.exec(foto);
          if (!match) return res.status(400).json({ error: 'Formato de imagem inválido (esperado data URL base64)' });
          const mime = match[1];
          const b64 = match[2];
          const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
          if (!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
          const buf = Buffer.from(b64, 'base64');
          const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
          const ext = extMap[mime] || 'bin';
          const fileName = `habitacoes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const blobToken = process.env.BLOB_READ_WRITE_TOKEN
            || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
            || process.env.VERCEL_BLOB_RW_TOKEN
            || '';
          const uploaded = await put(fileName, buf, {
            access: 'public',
            contentType: mime,
            cacheControl: 'public, max-age=31536000, immutable',
            ...(blobToken ? { token: blobToken } : {})
          });
          upd.foto = uploaded.url;
          if (process.env.ENABLE_DELETE_OLD_BLOB === '1' && atual && atual.foto && /vercel-storage\.com/.test(atual.foto)) {
            try {
              const blobToken = process.env.BLOB_READ_WRITE_TOKEN
                || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
                || process.env.VERCEL_BLOB_RW_TOKEN
                || '';
              await del(atual.foto, blobToken ? { token: blobToken } : undefined);
            } catch (_e) { /* silencioso */ }
          }
        } catch (e) {
          console.error('[api/habitacoes] erro upload blob PUT (ignorando nova foto)', e);
          blobFailed = true;
          if(e && /No token found/i.test(e.message||'')) blobMissingToken = true;
        }
      } else {
        if (/^https?:\/\//.test(foto)) upd.foto = foto; else return res.status(400).json({ error: 'Foto deve ser data URL ou URL http(s)' });
      }
    }
    const updateOps = { $set: upd };
    if (pushContract) {
      updateOps.$push = { contratos_locacao: pushContract };
    }
    const doc = await CondHabitacao.findByIdAndUpdate(id, updateOps, { new: true }).lean();
    try {
      if(doc){
        const collectRespTo = (targetSet, contrato) => {
          if(contrato && contrato.responsavel_morador_id){
            targetSet.add(String(contrato.responsavel_morador_id));
          }
        };
        const responsavelMoradores = new Set();
        collectRespTo(responsavelMoradores, doc.contrato_locacao);
        if(Array.isArray(doc.contratos_locacao)) doc.contratos_locacao.forEach(ct => collectRespTo(responsavelMoradores, ct));
        if(responsavelMoradores.size){
          const moradoresDocs = await CondMorador.find({ habitacao_id: id, ativo: { $ne: false } }).select('_id cond_usuario_id').lean();
          const condRespIds = new Set();
          const morIdsByCondUser = new Map();
          moradoresDocs.forEach(m => {
            const morId = String(m._id);
            const userId = m.cond_usuario_id ? String(m.cond_usuario_id) : null;
            if(userId){
              if(!morIdsByCondUser.has(userId)) morIdsByCondUser.set(userId, []);
              morIdsByCondUser.get(userId).push(morId);
              if(responsavelMoradores.has(morId)) condRespIds.add(userId);
            }
          });
          if(condRespIds.size){
            await CondUsuario.updateMany({ _id: { $in: Array.from(condRespIds) } }, { $addToSet: { permissoes: 'resp' } });
          }
          const removalCandidates = Array.from(morIdsByCondUser.keys()).filter(uid => !condRespIds.has(uid));
          if(removalCandidates.length){
            const morAll = await CondMorador.find({ cond_usuario_id: { $in: removalCandidates } }).select('_id cond_usuario_id').lean();
            const morIdsGlobal = new Set();
            const morListByUser = new Map();
            morAll.forEach(m => {
              const morId = String(m._id);
              const userId = String(m.cond_usuario_id);
              if(!morListByUser.has(userId)) morListByUser.set(userId, []);
              morListByUser.get(userId).push(morId);
              morIdsGlobal.add(morId);
            });
            let stillRespMorIds = new Set();
            if(morIdsGlobal.size){
              const morIdsArray = Array.from(morIdsGlobal);
              const otherHabs = await CondHabitacao.find({
                $or: [
                  { 'contrato_locacao.responsavel_morador_id': { $in: morIdsArray } },
                  { 'contratos_locacao.responsavel_morador_id': { $in: morIdsArray } }
                ]
              }).select('contrato_locacao contratos_locacao').lean();
              otherHabs.forEach(h => {
                collectRespTo(stillRespMorIds, h?.contrato_locacao);
                (h?.contratos_locacao||[]).forEach(ct => collectRespTo(stillRespMorIds, ct));
              });
            }
            const removableUsers = removalCandidates.filter(uid => {
              const morIds = morListByUser.get(uid) || [];
              return morIds.every(mid => !stillRespMorIds.has(mid));
            });
            if(removableUsers.length){
              await CondUsuario.updateMany({ _id: { $in: removableUsers } }, { $pull: { permissoes: 'resp' } });
            }
          }
        } else {
          // Sem responsável atual, remover permissão dos usuários desta habitação se não forem responsáveis em outras
          const moradoresDocs = await CondMorador.find({ habitacao_id: id, ativo: { $ne: false }, cond_usuario_id: { $ne: null } }).select('_id cond_usuario_id').lean();
          const condIds = Array.from(new Set(moradoresDocs.map(m => String(m.cond_usuario_id))));
          if(condIds.length){
            const morAll = await CondMorador.find({ cond_usuario_id: { $in: condIds } }).select('_id cond_usuario_id').lean();
            const morIdsGlobal = new Set(morAll.map(m => String(m._id)));
            const morListByUser = new Map();
            morAll.forEach(m => {
              const uid = String(m.cond_usuario_id);
              if(!morListByUser.has(uid)) morListByUser.set(uid, []);
              morListByUser.get(uid).push(String(m._id));
            });
            const stillRespMorIds = new Set();
            if(morIdsGlobal.size){
              const morIdsArray = Array.from(morIdsGlobal);
              const otherHabs = await CondHabitacao.find({
                $or: [
                  { 'contrato_locacao.responsavel_morador_id': { $in: morIdsArray } },
                  { 'contratos_locacao.responsavel_morador_id': { $in: morIdsArray } }
                ]
              }).select('contrato_locacao contratos_locacao').lean();
              otherHabs.forEach(h => {
                collectRespTo(stillRespMorIds, h?.contrato_locacao);
                (h?.contratos_locacao||[]).forEach(ct => collectRespTo(stillRespMorIds, ct));
              });
            }
            const removable = condIds.filter(uid => {
              const morIds = morListByUser.get(uid) || [];
              return morIds.every(mid => !stillRespMorIds.has(mid));
            });
            if(removable.length){
              await CondUsuario.updateMany({ _id: { $in: removable } }, { $pull: { permissoes: 'resp' } });
            }
          }
        }
      }
    } catch(_syncRespErr) {
      console.warn('[api/habitacoes] falha ao sincronizar permissão resp', _syncRespErr);
    }
    try { console.info('[api/habitacoes] atualizado', { id: String(id), tipo: upd.tipo || (doc && doc.tipo), alterouFoto: Object.prototype.hasOwnProperty.call(upd,'foto'), temFoto: !!(doc && doc.foto) }); } catch {}

    // Best-effort: manter caixa vinculada sincronizada.
    try { await syncHabPublicMailboxForHabitacaoId(id); } catch (syncErr) {
      console.warn('[api/habitacoes] aviso ao sincronizar caixa pública da habitação', syncErr?.message || syncErr);
    }

    res.json({
      ...doc,
      foto_saved: !!(doc && doc.foto),
      blob_enabled: typeof put === 'function',
      blob_tried: blobTried,
      blob_failed: blobFailed,
      blob_missing_token: blobMissingToken
    });
  } catch (e) { console.error('[api/habitacoes] PUT erro', e); res.status(500).json({ error: 'Falha ao atualizar habitação', detail: e.message }); }
});

// Adicionar um contrato de locação à habitação (append)
app.post('/api/habitacoes/:id/contratos', express.json({ limit: '6mb' }), async (req, res) => {
  try {
    const id = req.params.id;
    const { nome, file, url, mime, periodo, responsavel_morador_id } = req.body || {};
    const normPeriodo = (per) => {
      if(!per || typeof per !== 'object') return null;
      const parse = (s) => {
        if(!s) return null;
        try{
          const str = String(s).trim();
          const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(str);
          if(m) return new Date(+m[3], +m[2]-1, +m[1]);
          const d = new Date(str);
          return isNaN(d) ? null : d;
        }catch{ return null; }
      };
      return { inicio: parse(per.inicio||per.start||per.inicio_vigencia||per.vigencia_inicio), fim: parse(per.fim||per.end||per.fim_vigencia||per.vigencia_fim) };
    };
    let contrato = { url: '', nome: String(nome||'contrato'), mime: String(mime||''), periodo: normPeriodo(periodo), responsavel_morador_id: responsavel_morador_id || null };
    // Upload se veio data URL
    if(typeof file === 'string' && file.startsWith('data:')){
      const match = /^data:(.+?);base64,(.+)$/.exec(file);
      if(!match) return res.status(400).json({ error:'Formato de arquivo inválido' });
      const _mime = match[1]; const b64 = match[2];
      const allowed = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp'];
      if(!allowed.includes(_mime)) return res.status(400).json({ error:'Tipo de arquivo não suportado' });
      const buf = Buffer.from(b64,'base64');
      const extMap = { 'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp' };
      const ext = extMap[_mime] || 'bin';
      const fileName = `contratos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_RW_TOKEN || '';
      const uploaded = await put(fileName, buf, { access:'public', contentType:_mime, cacheControl:'public, max-age=31536000, immutable', ...(blobToken?{token:blobToken}:{}) });
      contrato.url = uploaded.url; contrato.mime = _mime;
    } else if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      contrato.url = url; // usa URL direta
    }
    const doc = await CondHabitacao.findByIdAndUpdate(id, { $push: { contratos_locacao: contrato }, $set: { contrato_locacao: contrato } }, { new: true }).lean();

    // Contrato pode redefinir admin (responsável financeiro) da caixa.
    try { await syncHabPublicMailboxForHabitacaoId(id); } catch (syncErr) {
      console.warn('[api/habitacoes/:id/contratos] aviso ao sincronizar caixa pública', syncErr?.message || syncErr);
    }

    return res.status(201).json({ ok:true, habitacao: doc, contrato_added: contrato });
  } catch(e) {
    console.error('[api/habitacoes/:id/contratos] POST erro', e);
    return res.status(500).json({ ok:false, error:'Falha ao adicionar contrato', detail: e.message });
  }
});

app.delete('/api/habitacoes/:id', async (req, res) => {
  try{
    if (mongoose.connection.readyState !== 1) {
      try { res.set('Retry-After','5'); } catch {}
      return res.status(503).json({ ok:false, error:'Serviço indisponível' });
    }
    const id = String(req.params.id || '').trim();
    if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, error:'ID inválido' });

    const deleted = await CondHabitacao.findByIdAndDelete(id).lean();

    // Importante: evitar que caixas vinculadas a habitação removida permaneçam ativas e apareçam como destinatário.
    try {
      await CondMsgMailbox.updateMany(
        { ativo: { $ne: false }, link_type: 'habitacao', link_id: id },
        { $set: { ativo: false } }
      );
    } catch (mailErr) {
      console.warn('[api/habitacoes/:id] aviso ao desativar caixa vinculada', mailErr?.message || mailErr);
    }

    return res.json({ ok:true, deleted: !!deleted, missing: !deleted });
  }
  catch(e){
    console.error('[api/habitacoes/:id] erro DELETE', e);
    return res.status(500).json({ ok:false, error: 'Falha ao excluir habitação' });
  }
});

// Dashboard inicial
function requireCondominiosPageLogin(req, res, next) {
  const ctxUser = getCtxUser(req);

  if (ctxUser) {
    req.user = req.user || ctxUser;
    res.locals.user = res.locals.user || ctxUser;
    return next();
  }

  const basePath = req.baseUrl || '/condominios';
  const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || `${basePath}/dashboard`));
  return res.redirect(`${basePath}/login?next=${nextUrl}`);
}

app.get('/', requireCondominiosPageLogin, (req, res) => {
  return res.redirect((req.baseUrl || '/condominios') + '/dashboard');
});

app.get('/dashboard', requireCondominiosPageLogin, (req, res) => {
  return res.render('dashboard', { moduleLabel: 'Gestão de Condomínios' });
});

// Configurações > Geral (Governança da Caixa de Mensagem)
app.get('/configuracoes/geral', async (req, res) => {
  const ctxUser = getCtxUser(req);
  if (!ctxUser) {
    const nextUrl = encodeURIComponent('/mensagens/dashboard?view=cfg_geral');
    return res.redirect(`/gestor/login?next=${nextUrl}`);
  }
  if (!userCanScopeAll(ctxUser)) {
    return res.status(403).render('placeholder', {
      moduleLabel: 'Gestão de Condomínios',
      title: 'Acesso restrito',
      description: 'Esta página é exclusiva para administradores.'
    });
  }

  return res.redirect('/mensagens/dashboard?view=cfg_geral');
});

// Página cadastrar habitação (estrutura inicial do módulo)
app.get('/estruturar/habitacoes', async (req, res) => {
  const unidadesOptions = await listarUnidadesParaUsuario(req.user || (req.session && req.session.user) || null);
  return res.render('cadastrar_habitacao', { moduleLabel: 'Gestão de Condomínios', unidadesOptions });
});

app.get('/estruturar/garagem', async (req, res) => {
  const unidadesOptions = await listarUnidadesParaUsuario(req.user || (req.session && req.session.user) || null);
  return res.render('cadastrar_garagem', { moduleLabel: 'Gestão de Condomínios', unidadesOptions });
});

app.get('/estruturar/areas-comuns', async (req, res) => {
  const unidadesOptions = await listarUnidadesParaUsuario(req.user || (req.session && req.session.user) || null);
  return res.render('cadastrar_areas_comuns', { moduleLabel: 'Gestão de Condomínios', unidadesOptions });
});

// Páginas placeholder básicas para os itens de menu
const renderPlaceholder = (req, res, title, description) => {
  res.render('placeholder', {
    moduleLabel: 'Gestão de Condomínios',
    title,
    description: description || 'Selecione uma opção no menu acima.'
  });
};

// Helpers
async function listarUnidadesParaUsuario(user){
  try{
    const isAll = userCanScopeAll(user);
    let unitScope = { type: 'global', unidadeId: null };

    if (!isAll) {
      const ref = user?.matriz_unidade_id || user?.unidade_principal_id || user?.unidade_id || null;
      const raw = (ref && typeof ref === 'object') ? (ref._id || ref.id || '') : ref;
      const unidadeId = String(raw || '').trim();
      if (unidadeId && mongoose.isValidObjectId(unidadeId)) {
        unitScope = createUnitScope({ unidadeId });
      }
    }

    const repo = new UnidadesReadRepository({ unitScope });
    const unidadeSelectFields = '_id codigo nome razaoSocial cnpj cpf pessoaTipo inscricaoEstadual inscricaoMunicipal cnaePrincipal cnaeSecundarios regimeTributario naturezaJuridica tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal diretor_usuario_id pixChave tipoPix banco agencia contaCorrente is_principal subunidade unidade_principal_id dataAbertura';
    if(isAll){
      return await repo.find({ ativa: { $ne: false } }, { select: unidadeSelectFields });
    }
    if(user && (user.matriz_unidade_id || user.unidade_principal_id || user.unidade_id)){
      const matrizRef = user.matriz_unidade_id || user.unidade_principal_id || user.unidade_id;
      const matrizId = (matrizRef && typeof matrizRef === 'object') ? (matrizRef._id || matrizRef.id || matrizRef) : matrizRef;
      return await repo.find({ $or: [ { _id: matrizId }, { unidade_principal_id: matrizId } ] }, { select: unidadeSelectFields });
    }
    // fallback: lista vazia
    return [];
  } catch { return []; }
}

// Rotas do módulo resetadas: manter apenas dashboard e usuários mod condomínio + placeholders genéricos
async function carregarExistingUsers(user){
  const unidadesOptions = await listarUnidadesParaUsuario(user);
  const unitIds = (unidadesOptions||[]).map(u => u._id);
  let existingUsers = [];
  try{
    if(User && unitIds && unitIds.length){
      existingUsers = await User.find({ unidade_id: { $in: unitIds } })
        .select('nome email role unidade_id foto')
        .lean();

      // Enriquecer com função (via funcionário vinculado)
      try {
        if(Funcionario && existingUsers.length){
          const userIds = existingUsers.map(u => u._id).filter(Boolean);
          if(userIds.length){
            const funcionarios = await Funcionario.find({ usuario_id: { $in: userIds } })
              .select('usuario_id funcao_id rg cpf data_nascimento sexo nome_pai nome_mae telefone foto')
              .populate('funcao_id','nome descricao')
              .lean();
            const funcMap = new Map(); // usuario_id -> { funcao_nome, rg, cpf }
            funcionarios.forEach(f => {
              if(f && f.usuario_id){
                const nomeFuncao = (f.funcao_id && (f.funcao_id.nome || f.funcao_id.descricao)) || '';
                // Converter data_nascimento para BR (dd/mm/aaaa)
                let data_nascimento_br = '';
                try{
                  if(f.data_nascimento){
                    const d = new Date(f.data_nascimento);
                    const dd = String(d.getDate()).padStart(2,'0');
                    const mm = String(d.getMonth()+1).padStart(2,'0');
                    const yyyy = d.getFullYear();
                    data_nascimento_br = `${dd}/${mm}/${yyyy}`;
                  }
                } catch(_e){ data_nascimento_br = ''; }
                funcMap.set(String(f.usuario_id), {
                  isFuncionario: true,
                  funcao_nome: nomeFuncao,
                  rg: f.rg || '',
                  cpf: f.cpf || '',
                  foto: f.foto || '',
                  data_nascimento: f.data_nascimento || null,
                  data_nascimento_br,
                  sexo: f.sexo || '',
                  nome_pai: f.nome_pai || '',
                  nome_mae: f.nome_mae || '',
                  // telefone já vem formatado no schema
                  telefone: f.telefone || ''
                });
              }
            });
            existingUsers = existingUsers.map(u => {
              const extra = funcMap.get(String(u._id)) || {};
              return {
                ...u,
                // fallback para foto do funcionário (quando o usuário não tem foto própria)
                foto: u.foto || extra.foto || '',
                // marca que é funcionário vinculado
                isFuncionario: !!extra.isFuncionario,
                funcao_nome: extra.funcao_nome || '',
                rg: extra.rg || '',
                cpf: extra.cpf || '',
                // dados pessoais adicionais para hidratação nos cadastros do módulo
                data_nascimento: extra.data_nascimento || null,
                data_nascimento_br: extra.data_nascimento_br || '',
                sexo: extra.sexo || '',
                // duplicar com chaves esperadas no front (pai/mae) mantendo originais
                nome_pai: extra.nome_pai || '',
                nome_mae: extra.nome_mae || '',
                pai: extra.nome_pai || '',
                mae: extra.nome_mae || '',
                telefone: extra.telefone || ''
              };
            });
          }
        }
      } catch(_e){ /* silencioso: não bloquear página se der erro */ }
    }
  } catch(_){ existingUsers = []; }
  return { existingUsers, unidadesOptions };
}

app.get('/usuarios', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const { existingUsers, unidadesOptions } = await carregarExistingUsers(ctxUser);
  return res.render('users_mod_condominio', {
    moduleLabel: 'Gestão de Condomínios',
    unidadesOptions,
    existingUsers
  });
});

// Cadastros > Proprietários
app.get('/cadastros/proprietarios', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const { existingUsers, unidadesOptions } = await carregarExistingUsers(ctxUser);
  // Por ora, não há fonte server-side de habitações livres; o JS faz fallback ao localStorage
  const habitacoesLivres = [];
  return res.render('cadastrar_proprietario', {
    moduleLabel: 'Gestão de Condomínios',
    existingUsers,
    unidadesOptions,
    habitacoesLivres
  });
});

// Cadastros > Moradores
app.get('/cadastros/moradores', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const { existingUsers, unidadesOptions } = await carregarExistingUsers(ctxUser);
  const habitacoesLivres = [];
  return res.render('cadastrar_morador', {
    moduleLabel: 'Gestão de Condomínios',
    existingUsers,
    unidadesOptions,
    habitacoesLivres
  });
});

// Cadastros > Materiais
app.get('/cadastros/materiais', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  // Para materiais só precisamos das unidades para preencher selects
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  return res.render('cadastrar_materiais', {
    moduleLabel: 'Gestão de Condomínios',
    unidadesOptions
  });
});

// Editar > Habitações (renderiza a nova página)
app.get('/editar/habitacoes', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  return res.render('editar_habitacao', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser,
    unidadesOptions
  });
});

// Editar > Áreas Comuns
app.get('/editar/areas-comuns', async (req, res) => {
  const ctxUser = req.user || (req.session && req.session.user) || null;
  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  return res.render('editar_area_comum', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser,
    unidadesOptions
  });
});

// Operação > Painel de Habitações
app.get('/operacao/painel-habitacoes', (req, res, next) => {
  try {
    const ctxUser = req.user || (req.session && req.session.user) || null;
    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios'));
      return res.redirect(`/gestor/login?next=${nextUrl}`);
    }
    return res.render('painel_habitacao', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser
    });
  } catch (e) {
    return next(e);
  }
});

// Operação > Painel de Áreas Comuns
app.get('/operacao/painel-areas-comuns', (req, res, next) => {
  try {
    const ctxUser = req.user || (req.session && req.session.user) || null;
    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios'));
      return res.redirect(`/gestor/login?next=${nextUrl}`);
    }
    return res.render('painel_area_comum', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser
    });
  } catch (e) {
    return next(e);
  }
});

// Serviços > Central de Serviços
app.get('/servicos/servicos', async (req, res) => {
  const ctxUser = getCtxUser(req);
  return res.render('servicos', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser
  });
});

// Administração > Assembleia (módulo novo)
const ASSEMBLEIA_TABS = ['dados', 'convocacao', 'pauta', 'revisao', 'publicacao'];
const ASSEMBLEIA_BODY_PARSERS = [
  express.urlencoded({ extended: true, limit: '12mb' }),
  express.json({ limit: '12mb' })
];
function normalizeAssembleiaTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  return ASSEMBLEIA_TABS.includes(t) ? t : 'dados';
}

function getAuditUser(ctxUser) {
  try {
    if (!ctxUser) return { userId: null, nome: '', email: '' };
    const id = ctxUser?._id || ctxUser?.id || ctxUser?.userId || null;
    const userId = (id && mongoose.isValidObjectId(String(id))) ? new mongoose.Types.ObjectId(String(id)) : null;
    return {
      userId,
      nome: String(ctxUser?.nome || '').trim(),
      email: String(ctxUser?.email || '').trim().toLowerCase()
    };
  } catch {
    return { userId: null, nome: '', email: '' };
  }
}

function generateAssembleiaNumero() {
  const year = new Date().getFullYear();
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `ASM-${year}-${rnd}`;
}

async function generateUniqueAssembleiaNumero({ unidadeId, canQueryDb } = {}) {
  const canDb = !!canQueryDb && mongoose.connection.readyState === 1;
  const unit = (unidadeId && mongoose.isValidObjectId(String(unidadeId))) ? String(unidadeId) : '';

  // Tenta algumas vezes com o formato padrão.
  for (let i = 0; i < 25; i += 1) {
    const candidate = generateAssembleiaNumero();
    if (!canDb || !CondAssembleia) return candidate;
    const q = { numero: candidate };
    if (unit) q.unidade_id = new mongoose.Types.ObjectId(unit);
    // eslint-disable-next-line no-await-in-loop
    const exists = await CondAssembleia.exists(q);
    if (!exists) return candidate;
  }

  // Fallback: inclui timestamp para reduzir colisão
  const year = new Date().getFullYear();
  const tail = String(Date.now()).slice(-6);
  return `ASM-${year}-${tail}`;
}

function parsePautaFromBody(body = {}) {
  const count = Math.max(0, Math.min(80, Number(body.pauta_count || 0) || 0));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const tipo = String(body[`pauta_tipo_${i}`] || '').trim();
    const descricao = String(body[`pauta_descricao_${i}`] || '').trim();
    const observacoesInternas = String(body[`pauta_obs_${i}`] || '').trim();
    if (!tipo && !descricao && !observacoesInternas) continue;
    items.push({
      tipo,
      descricao,
      observacoesInternas,
      anexos: []
    });
  }
  return items;
}

function applyBodyToAssembleiaDoc(doc, body = {}) {
  doc.natureza = String(body.natureza || doc.natureza || '').trim();
  doc.titulo = String(body.titulo || doc.titulo || '').trim();
  doc.numero = String(body.numero || doc.numero || '').trim();
  doc.modalidade = String(body.modalidade || doc.modalidade || '').trim();
  doc.local = String(body.local || doc.local || '').trim();
  doc.link = String(body.link || doc.link || '').trim();
  doc.responsavel = String(body.responsavel || doc.responsavel || '').trim();
  doc.observacoes = String(body.observacoes || doc.observacoes || '').trim();

  doc.regraConvocacao = String(body.regraConvocacao || doc.regraConvocacao || '').trim();
  doc.hora1 = String(body.hora1 || doc.hora1 || '').trim();
  doc.hora2 = String(body.hora2 || doc.hora2 || '').trim();
  doc.horaUnica = String(body.horaUnica || doc.horaUnica || '').trim();
  doc.overrideMotivo = String(body.overrideMotivo || doc.overrideMotivo || '').trim();

  // Datas
  const dataStr = String(body.data || '').trim();
  if (dataStr) {
    const d = new Date(dataStr);
    if (!Number.isNaN(d.getTime())) doc.data = d;
  }
  const dataPubStr = String(body.dataPublicacao || '').trim();
  if (dataPubStr) {
    const dp = new Date(dataPubStr);
    if (!Number.isNaN(dp.getTime())) doc.dataPublicacao = dp;
  }

  // Publicação toggles
  if (body.publicarPortal !== undefined) doc.publicarPortal = body.publicarPortal === '1' || body.publicarPortal === 'on' || body.publicarPortal === true;
  if (body.enviarEmail !== undefined) doc.enviarEmail = body.enviarEmail === '1' || body.enviarEmail === 'on' || body.enviarEmail === true;
  if (body.assinaturaDigital !== undefined) doc.assinaturaDigital = body.assinaturaDigital === '1' || body.assinaturaDigital === 'on' || body.assinaturaDigital === true;

  // Pauta
  if (String(body.hasPauta || '') === '1' || body.pauta_count !== undefined) {
    doc.pauta = parsePautaFromBody(body);
  }

  // Defaults
  if (!doc.numero) doc.numero = generateAssembleiaNumero();
  if (!doc.status) doc.status = 'rascunho';
}

function validateAssembleiaForPublish(doc) {
  const errors = {};
  const reqField = (key, label, cond = true) => {
    if (!cond) return;
    const v = String(doc?.[key] ?? '').trim();
    if (!v) errors[key] = `${label} é obrigatório.`;
  };

  reqField('natureza', 'Natureza');
  reqField('titulo', 'Título');
  reqField('numero', 'Número');
  if (!doc?.data) errors.data = 'Data é obrigatória.';
  reqField('modalidade', 'Modalidade');
  reqField('responsavel', 'Responsável');
  reqField('regraConvocacao', 'Regra de convocação');
  if (!doc?.dataPublicacao) errors.dataPublicacao = 'Data de emissão é obrigatória para convocar.';

  const mod = String(doc?.modalidade || '').toLowerCase();
  if (mod === 'presencial' || mod === 'hibrida') {
    if (!String(doc?.local || '').trim()) errors.local = 'Local é obrigatório para presencial/híbrida.';
  }
  if (mod === 'virtual' || mod === 'hibrida') {
    if (!String(doc?.link || '').trim()) errors.link = 'Link é obrigatório para virtual/híbrida.';
  }

  const regra = String(doc?.regraConvocacao || '').toLowerCase();
  if (regra === 'dupla') {
    if (!String(doc?.hora1 || '').trim()) errors.hora1 = 'Horário (1ª chamada) é obrigatório.';
    if (!String(doc?.hora2 || '').trim()) errors.hora2 = 'Horário (2ª chamada) é obrigatório.';
  }
  if (regra === 'unica') {
    if (!String(doc?.horaUnica || '').trim()) errors.horaUnica = 'Horário é obrigatório.';
  }

  const pauta = Array.isArray(doc?.pauta) ? doc.pauta : [];
  if (!pauta.length) errors.pauta = 'Informe ao menos 1 item de pauta.';
  pauta.forEach((it, idx) => {
    if (!String(it?.tipo || '').trim()) errors[`pauta_tipo_${idx}`] = 'Tipo do item é obrigatório.';
    if (!String(it?.descricao || '').trim()) errors[`pauta_descricao_${idx}`] = 'Descrição do item é obrigatória.';
  });

  // Regra: o edital publicado/convocado deve ser o PDF assinado CERTIFICADO (token global verificável).
  // Assinatura acontece fora do sistema; aqui apenas certificamos e verificamos.
  {
    const tok = String(doc?.editalDocumentoToken || '').trim();
    if (!tok) errors.editalDocumentoToken = 'Envie o edital assinado antes de convocar.';
  }

  return errors;
}

function getUserUnidadeId(ctxUser) {
  try {
    const ref = (
      ctxUser?.unidade_id ||
      ctxUser?.unidadeId ||
      ctxUser?.unidadeID ||
      ctxUser?.unidade ||
      ctxUser?.unidade_id_str ||
      ctxUser?.matriz_unidade_id ||
      ctxUser?.unidade_principal_id ||
      ctxUser?.unidadePrincipalId ||
      null
    );
    const id = (ref && typeof ref === 'object') ? (ref._id || ref.id || ref) : ref;
    return String(id || '').trim();
  } catch {
    return '';
  }
}

function normalizeObjectIdString(id) {
  const s = String(id || '').trim();
  return (s && mongoose.isValidObjectId(s)) ? s : '';
}

function getCtxUserIdString(ctxUser) {
  try {
    const ref = ctxUser?._id || ctxUser?.id || ctxUser?.userId || ctxUser?.userid || null;
    const id = (ref && typeof ref === 'object') ? (ref._id || ref.id || ref) : ref;
    return String(id || '').trim();
  } catch {
    return '';
  }
}

async function resolveUnidadeIdForNonScopedUser({ ctxUser, canQueryDb }) {
  try {
    if (!canQueryDb) return '';
    const current = normalizeObjectIdString(getUserUnidadeId(ctxUser));
    if (current) return current;

    // 1) Via funcionário vinculado (mais confiável em alguns payloads de sessão)
    const funcRef = ctxUser?.funcionario_id || ctxUser?.funcionarioId || null;
    const funcId = normalizeObjectIdString((funcRef && typeof funcRef === 'object') ? (funcRef._id || funcRef.id || funcRef) : funcRef);
    if (funcId && Funcionario) {
      const f = await Funcionario.findById(funcId).select('unidade_id').lean();
      const u = normalizeObjectIdString(f?.unidade_id?._id || f?.unidade_id);
      if (u) return u;
    }

    // 2) Via próprio User
    const ctxUserId = normalizeObjectIdString(getCtxUserIdString(ctxUser));
    if (ctxUserId && User) {
      const uDoc = await User.findById(ctxUserId).select('unidade_id').lean();
      const u = normalizeObjectIdString(uDoc?.unidade_id?._id || uDoc?.unidade_id);
      if (u) return u;
    }

    return '';
  } catch {
    return '';
  }
}

async function buildAssembleiaAvailableRecipients({ selectedUnidadeId, canQueryDb }) {
  const available = { dirigentes: [], colaboradores: [], condominos: [] };
  const unitId = normalizeObjectIdString(selectedUnidadeId);
  if (!canQueryDb || !unitId) return available;

  const unitObjId = new mongoose.Types.ObjectId(unitId);

  const normalizeEmail = (value) => {
    const s = String(value || '').trim().toLowerCase();
    return s && s.includes('@') ? s : '';
  };

  const toPublicFotoUrl = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.length > 800) return '';
    if (/^data:/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/')) return s;
    const rel = s.replace(/\\/g, '/').replace(/^\/+/, '');
    // Alguns campos legados já vêm com "uploads/..." ou "public/uploads/..."
    if (rel.startsWith('public/uploads/')) return `/${rel.replace(/^public\//, '')}`;
    if (rel.startsWith('uploads/')) return `/${rel}`;
    // Padrão do sistema: salva em `uploads/<rel>` e referencia por `users/<file>`
    return `/condominios/uploads/${rel}`;
  };

  const condoCandidates = [];

  const habLinesByEmail = new Map();

  // 1) Dirigentes: vem do organograma/dirigência (mandatos ativos), não do nível de acesso.
  try {
    if (CondDirigenciaMandato && CondUsuario) {
      const mandatos = await CondDirigenciaMandato.find({ unidadeId: unitObjId, ativo: true })
        .select('usuarioId cargoId')
        .limit(200)
        .lean()
        .catch(() => []);

      const usuarioIds = Array.from(new Set((mandatos || []).map(m => String(m?.usuarioId || '').trim()).filter(Boolean)));
      const cargoIds = Array.from(new Set((mandatos || []).map(m => String(m?.cargoId || '').trim()).filter(Boolean)));

      const cargos = cargoIds.length && CondDirigenciaCargo
        ? await CondDirigenciaCargo.find({ _id: { $in: cargoIds } }).select('_id nome').lean().catch(() => [])
        : [];
      const cargoNameById = new Map((cargos || []).map(c => [String(c?._id || '').trim(), String(c?.nome || '').trim()]));

      const condUsers = usuarioIds.length
        ? await CondUsuario.find({ _id: { $in: usuarioIds.map(id => new mongoose.Types.ObjectId(id)) }, ativo: { $ne: false } })
          .select('_id nome email foto')
          .lean()
          .catch(() => [])
        : [];
      const condUserById = new Map((condUsers || []).map(u => [String(u?._id || '').trim(), u]));

      const seen = new Set();
      (mandatos || []).forEach((m) => {
        const uid = String(m?.usuarioId || '').trim();
        if (!uid) return;
        const cu = condUserById.get(uid);
        if (!cu) return;
        const rawEmail = String(cu?.email || '').trim();
        const emailNorm = normalizeEmail(rawEmail);
        const key = emailNorm ? `em:${emailNorm}` : `cu:${uid}`;
        if (seen.has(key)) return;
        seen.add(key);
        const cargoNome = cargoNameById.get(String(m?.cargoId || '').trim()) || '';
        available.dirigentes.push({
          id: key,
          nome: String(cu?.nome || cu?.email || '').trim() || '-',
          subtitulo: cargoNome || 'Dirigência',
          email: rawEmail,
          foto: toPublicFotoUrl(cu?.foto),
          aliases: [`cu:${uid}`]
        });
      });
    }
  } catch {
    /* noop */
  }

  // 2) Colaboradores/usuários internos (Gestor): por unidade direta OU por vínculo com `Funcionario`.
  if (User) {
    const or = [{ unidade_id: unitId }];
    try {
      if (Funcionario) {
        const funcDocs = await Funcionario.find({ unidade_id: unitId, ativo: { $ne: false } })
          .select('_id usuario_id')
          .lean();

        const funcionarioIds = (funcDocs || []).map(f => f?._id).filter(Boolean);
        const usuarioIds = (funcDocs || []).map(f => f?.usuario_id).filter(Boolean);
        if (usuarioIds.length) or.push({ _id: { $in: usuarioIds } });
        if (funcionarioIds.length) or.push({ funcionario_id: { $in: funcionarioIds } });
      }
    } catch {
      /* noop */
    }

    const users = await User.find({ $or: or, ativo: { $ne: false } })
      .select('_id nome email role funcionario_id unidade_id foto')
      .lean();
    const toUserPerson = (u, subtitulo) => {
      const rawEmail = String(u?.email || '').trim();
      const emailNorm = normalizeEmail(rawEmail);
      const id = emailNorm ? `em:${emailNorm}` : String(u._id);
      return {
        id,
        nome: String(u?.nome || u?.email || '').trim() || '-',
        subtitulo: String(subtitulo || '').trim(),
        email: rawEmail,
        foto: toPublicFotoUrl(u?.foto),
        aliases: [String(u._id)]
      };
    };

    (users || []).forEach((u) => {
      const role = String(u?.role || '').toLowerCase();
      const isFuncionario = !!u?.funcionario_id;
      if (isFuncionario) {
        available.colaboradores.push(toUserPerson(u, 'Colaborador'));
        return;
      }
      if (role === 'master' || role === 'admin') {
        available.colaboradores.push(toUserPerson(u, role === 'admin' ? 'Admin' : 'Master'));
        return;
      }

      // Condôminos (lista para publicação de assembleia): consolidar por e-mail.
      const rawEmail = String(u?.email || '').trim();
      const emailNorm = normalizeEmail(rawEmail);
      const id = emailNorm ? `em:${emailNorm}` : String(u._id);
      condoCandidates.push({
        id,
        aliases: [String(u._id)],
        nome: String(u?.nome || rawEmail || '').trim() || '-',
        email: rawEmail,
        foto: toPublicFotoUrl(u?.foto)
      });
    });
  }

  // 3) Condôminos (Portal do Morador): CondMorador por unidade.
  // Consolidar por e-mail e trocar o subtítulo por habitações vinculadas.
  const habIdsByEmail = new Map();
  const aliasesByEmail = new Map();
  const portalCandidateByEmail = new Map();

  try {
    if (CondMorador) {
      const moradores = await CondMorador.find({ unidade_id: unitObjId, ativo: { $ne: false } })
        .select('_id nome email responsavel_email usuario_id cond_usuario_id habitacao_id')
        .limit(5000)
        .lean()
        .catch(() => []);

      const userIds = Array.from(new Set((moradores || []).map(m => String(m?.usuario_id || '').trim()).filter(Boolean)));
      const condUserIds = Array.from(new Set((moradores || []).map(m => String(m?.cond_usuario_id || '').trim()).filter(Boolean)));

      const userDocs = (User && userIds.length)
        ? await User.find({ _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) } }).select('_id foto').lean().catch(() => [])
        : [];
      const userFotoById = new Map((userDocs || []).map(u => [String(u?._id || '').trim(), toPublicFotoUrl(u?.foto)]));

      const condDocs = (CondUsuario && condUserIds.length)
        ? await CondUsuario.find({ _id: { $in: condUserIds.map(id => new mongoose.Types.ObjectId(id)) } }).select('_id foto').lean().catch(() => [])
        : [];
      const condFotoById = new Map((condDocs || []).map(u => [String(u?._id || '').trim(), toPublicFotoUrl(u?.foto)]));

      (moradores || []).forEach((m) => {
        const mid = String(m?._id || '').trim();
        const rawEmail = String(m?.email || m?.responsavel_email || '').trim();
        const emailNorm = normalizeEmail(rawEmail);
        if (!emailNorm) return;

        const aliasId = mid ? `m:${mid}` : '';
        if (aliasId) {
          const prev = aliasesByEmail.get(emailNorm) || new Set();
          prev.add(aliasId);
          aliasesByEmail.set(emailNorm, prev);
        }

        const habId = String(m?.habitacao_id || '').trim();
        if (habId) {
          const prev = habIdsByEmail.get(emailNorm) || new Set();
          prev.add(habId);
          habIdsByEmail.set(emailNorm, prev);
        }

        let foto = '';
        const uid = String(m?.usuario_id || '').trim();
        const cuid = String(m?.cond_usuario_id || '').trim();
        if (uid && userFotoById.has(uid)) foto = userFotoById.get(uid) || '';
        else if (cuid && condFotoById.has(cuid)) foto = condFotoById.get(cuid) || '';

        const prevC = portalCandidateByEmail.get(emailNorm) || null;
        if (!prevC) {
          portalCandidateByEmail.set(emailNorm, {
            id: `em:${emailNorm}`,
            aliases: [],
            nome: String(m?.nome || rawEmail || '').trim() || '-',
            email: rawEmail,
            foto
          });
        } else if (!prevC.foto && foto) {
          prevC.foto = foto;
        }
      });

      // Resolver labels de habitação por e-mail (Bloco/Andar/Tipo/Número)
      const buildHabitacaoLine = (habDoc, blocoNome, andarNome) => {
        const parts = [];
        const bn = String(blocoNome || '').trim();
        const an = String(andarNome || '').trim();
        if (bn) parts.push(`Bloco ${bn}`);
        if (an) parts.push(an);
        const tipoRaw = String(habDoc?.tipo || '').trim();
        const numeroRaw = String(habDoc?.numero || '').trim();
        const tipo = tipoRaw ? tipoRaw.toLowerCase() : '';
        if (tipo && numeroRaw) parts.push(`${tipo} ${numeroRaw}`);
        else if (numeroRaw) parts.push(`apartamento ${numeroRaw}`);
        else if (tipo) parts.push(tipo);
        const descr = String(habDoc?.descricao || '').trim();
        return parts.join(' - ') || descr || '';
      };

      const allHabIds = Array.from(new Set(Array.from(habIdsByEmail.values()).flatMap(set => Array.from(set.values()))))
        .filter(mongoose.isValidObjectId);

      const habDocs = (CondHabitacao && allHabIds.length)
        ? await CondHabitacao.find({ _id: { $in: allHabIds.map(id => new mongoose.Types.ObjectId(id)) } })
            .select('_id bloco_id andar_id numero tipo descricao')
            .lean()
            .catch(() => [])
        : [];

      const blocoIds = Array.from(new Set((habDocs || []).map(h => String(h?.bloco_id || '').trim()).filter(Boolean)))
        .filter(mongoose.isValidObjectId);
      const andarIds = Array.from(new Set((habDocs || []).map(h => String(h?.andar_id || '').trim()).filter(Boolean)))
        .filter(mongoose.isValidObjectId);

      const [blocos, andares] = await Promise.all([
        (CondBloco && blocoIds.length)
          ? CondBloco.find({ _id: { $in: blocoIds.map(id => new mongoose.Types.ObjectId(id)) } }).select('_id nome').lean().catch(() => [])
          : [],
        (CondAndar && andarIds.length)
          ? CondAndar.find({ _id: { $in: andarIds.map(id => new mongoose.Types.ObjectId(id)) } }).select('_id nome').lean().catch(() => [])
          : []
      ]);
      const blocoNomeById = new Map((blocos || []).map(b => [String(b?._id || '').trim(), String(b?.nome || '').trim()]));
      const andarNomeById = new Map((andares || []).map(a => [String(a?._id || '').trim(), String(a?.nome || '').trim()]));

      const habById = new Map((habDocs || []).map(h => [String(h?._id || '').trim(), h]));
      habIdsByEmail.forEach((set, emailNorm) => {
        const lines = [];
        Array.from(set.values()).forEach((hid) => {
          const hab = habById.get(String(hid || '').trim());
          if (!hab) return;
          const blocoNome = blocoNomeById.get(String(hab?.bloco_id || '').trim()) || '';
          const andarNome = andarNomeById.get(String(hab?.andar_id || '').trim()) || '';
          const line = buildHabitacaoLine(hab, blocoNome, andarNome);
          if (line) lines.push(line);
        });
        const uniq = Array.from(new Set(lines.map(s => String(s || '').trim()).filter(Boolean)));
        uniq.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        habLinesByEmail.set(emailNorm, uniq);
      });
    }
  } catch {
    /* noop */
  }

  // Se a pessoa aparece também como dirigente/colaborador, adiciona as habitações no subtítulo.
  try {
    const appendHabitacoes = (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const rawEmail = String(entry?.email || '').trim();
      const emailNorm = normalizeEmail(rawEmail);
      if (!emailNorm) return;
      const habs = habLinesByEmail.get(emailNorm) || [];
      if (!Array.isArray(habs) || !habs.length) return;
      const roleLine = String(entry?.subtitulo || '').trim();
      entry.subtitulo = '';
      entry.subtitulos = [roleLine].filter(Boolean).concat(habs);
    };
    (available.dirigentes || []).forEach(appendHabitacoes);
    (available.colaboradores || []).forEach(appendHabitacoes);
  } catch {
    /* noop */
  }

  // Mescla candidatos (interno + portal) por e-mail
  const mergedByEmail = new Map();
  const upsertCandidate = (cand) => {
    if (!cand) return;
    const rawEmail = String(cand.email || '').trim();
    const emailNorm = normalizeEmail(rawEmail);
    const key = emailNorm || String(cand.id || '').trim();
    if (!key) return;
    const prev = mergedByEmail.get(key) || {
      id: emailNorm ? `em:${emailNorm}` : String(cand.id || '').trim(),
      nome: String(cand.nome || rawEmail || '').trim() || '-',
      email: rawEmail,
      foto: String(cand.foto || '').trim(),
      aliases: new Set()
    };
    (Array.isArray(cand.aliases) ? cand.aliases : []).forEach(a => { const v = String(a || '').trim(); if (v) prev.aliases.add(v); });
    if (!prev.foto && cand.foto) prev.foto = String(cand.foto || '').trim();
    if ((!prev.nome || prev.nome === '-') && cand.nome) prev.nome = String(cand.nome || '').trim() || prev.nome;
    if (!prev.email && rawEmail) prev.email = rawEmail;
    mergedByEmail.set(key, prev);
  };

  condoCandidates.forEach(upsertCandidate);
  portalCandidateByEmail.forEach((cand, emailNorm) => {
    const aliasSet = aliasesByEmail.get(emailNorm) || new Set();
    cand.aliases = Array.from(aliasSet.values());
    upsertCandidate(cand);
  });

  // Monta lista final de condôminos com linhas de habitação.
  available.condominos = Array.from(mergedByEmail.values()).map((c) => {
    const emailNorm = normalizeEmail(c.email);
    const habLines = (emailNorm && habLinesByEmail.has(emailNorm)) ? (habLinesByEmail.get(emailNorm) || []) : [];
    const subtitulos = habLines.length ? habLines : ['Sem habitação vinculada'];
    return {
      id: String(c.id || '').trim(),
      nome: String(c.nome || '').trim() || '-',
      subtitulo: '',
      subtitulos,
      email: String(c.email || '').trim(),
      foto: String(c.foto || '').trim(),
      aliases: Array.from((c.aliases || new Set()).values()).filter(Boolean)
    };
  });

  // Nota: a seção de condôminos já é montada acima (consolidada por e-mail).

  const byName = (a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' });
  available.dirigentes.sort(byName);
  available.colaboradores.sort(byName);
  available.condominos.sort(byName);

  return available;
}

// Fallback: alguns fluxos/erros de UI podem submeter um POST para a listagem.
// A listagem é GET; então aqui evitamos 404 no deploy e direcionamos para a rota correta.
app.post('/assembleias', (req, res) => {
  try {
    const bp = String(res?.locals?._bp || '/condominios').trim() || '/condominios';
    const accept = String(req.get('accept') || '').toLowerCase();
    const isAjax = String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest'
      || String(req.get('x-wdg-ajax') || '').trim() === '1'
      || accept.includes('application/json');

    if (isAjax) {
      return res.status(404).json({
        ok: false,
        error: `Rota inválida para POST. Use ${bp}/assembleias/nova/salvar ou ${bp}/assembleias/nova/publicar.`
      });
    }

    return res.redirect(303, `${bp}/assembleias`);
  } catch {
    return res.redirect(303, '/condominios/assembleias');
  }
});

app.get('/assembleias', async (req, res, next) => {
  let ctxUser = getCtxUser(req);
  try {
    // IMPORTANTE (Vercel/CDN): não cachear HTML desta lista (varia por querystring unidade_id).
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('X-WDG-Asset-Version', String(res?.locals?.assetVersion || 'dev'));
    } catch { /* noop */ }

    const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
    const canScopeAll = !!userCanScopeAll(ctxUser);
    const requestedUnitId = String(req.query.unidade_id || req.query.unidade || req.query.unidadeId || '').trim();
    let fixedUserUnitId = String(getUserUnidadeId(ctxUser) || '').trim();

    // Se for usuário sem escopo total e ctxUser vier "magro" (sem unidade), tenta resolver.
    if (!canScopeAll && !fixedUserUnitId) {
      try {
        const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser, canQueryDb });
        if (resolved) {
          fixedUserUnitId = String(resolved || '').trim();
          if (fixedUserUnitId) ctxUser = { ...(ctxUser || {}), unidade_id: fixedUserUnitId };
        }
      } catch {
        /* noop */
      }
    }

    const filtro = {
      unidade_id: String((canScopeAll ? requestedUnitId : fixedUserUnitId) || '').trim(),
      status: String(req.query.status || '').trim(),
      natureza: String(req.query.natureza || '').trim(),
      de: String(req.query.de || '').trim(),
      ate: String(req.query.ate || '').trim(),
      q: String(req.query.q || '').trim()
    };

    const allowedPageSizes = [5, 10, 15, 20, 25, 50];
    let perPage = 10;
    try {
      const rawSize = String(req.query.perPage || req.query.pageSize || req.query.pagesize || '').trim();
      const n = parseInt(rawSize, 10);
      if (Number.isFinite(n) && allowedPageSizes.includes(n)) perPage = n;
    } catch { /* noop */ }
    let page = 1;
    try {
      const rawPage = String(req.query.page || req.query.p || '').trim();
      const n = parseInt(rawPage, 10);
      if (Number.isFinite(n) && n > 0) page = n;
    } catch { /* noop */ }

    // Regra de UX: se não há condomínio selecionado, não listar itens.
    // (Master/Admin podem enxergar todas, mas aqui exigimos a seleção explícita.)
    if (canScopeAll && !filtro.unidade_id) {
      return res.render('condominios/assembleias/assembleias', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        filtro,
        assembleias: [],
        pagination: { page: 1, perPage, total: 0, totalPages: 1 }
      });
    }

    const query = {};
    if (filtro.unidade_id) {
      let unitIdForQuery = String(filtro.unidade_id || '').trim();

      // Compat: algumas telas antigas/fluxos podem passar o código (ex: M0005) no lugar do ObjectId.
      // Se não for ObjectId, tenta resolver por codigo da unidade.
      if (unitIdForQuery && !mongoose.isValidObjectId(unitIdForQuery)) {
        try {
          if (canQueryDb && Unidade) {
            const rx = new RegExp(`^${escapeRegExp(unitIdForQuery)}$`, 'i');
            const u = await unidadesReadRepoFromReq(req).findOne({ codigo: rx }, { select: '_id' });
            if (u && u._id) unitIdForQuery = String(u._id);
          }
        } catch {
          /* noop */
        }
      }

      if (!unitIdForQuery || !mongoose.isValidObjectId(unitIdForQuery)) {
        return res.status(400).type('text/plain; charset=utf-8').send('unidade_id inválido.');
      }

      query.unidade_id = unitIdForQuery;
      filtro.unidade_id = unitIdForQuery;
    } else if (!canScopeAll) {
      // Usuário sem unidade vinculada: não listar dados de outras unidades.
      return res.render('condominios/assembleias/assembleias', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        filtro,
        assembleias: [],
        pagination: { page: 1, perPage, total: 0, totalPages: 1 }
      });
    }
    if (filtro.status) query.status = filtro.status;
    if (filtro.natureza) query.natureza = filtro.natureza;
    if (filtro.de || filtro.ate) {
      query.data = {};
      if (filtro.de) {
        const d = new Date(filtro.de);
        if (!Number.isNaN(d.getTime())) query.data.$gte = d;
      }
      if (filtro.ate) {
        const d = new Date(filtro.ate);
        if (!Number.isNaN(d.getTime())) query.data.$lte = d;
      }
      if (!Object.keys(query.data).length) delete query.data;
    }
    if (filtro.q) {
      const rx = new RegExp(escapeRegExp(filtro.q), 'i');
      query.$or = [{ titulo: rx }, { numero: rx }];
    }

    let assembleias = [];
    let total = 0;
    let totalPages = 1;
    if (canQueryDb) {
      try {
        total = await CondAssembleia.countDocuments(query);
        totalPages = Math.max(1, Math.ceil((total || 0) / perPage));
        if (page > totalPages) page = totalPages;
        const skip = (page - 1) * perPage;
        assembleias = await CondAssembleia.find(query)
          .sort({ data: -1, createdAt: -1 })
          .skip(skip)
          .limit(perPage)
          .lean();

        // Fallback defensivo: se a página retornou itens mas o count veio 0,
        // garante que o pager não mostre “—”.
        if (!total && Array.isArray(assembleias) && assembleias.length) {
          total = assembleias.length;
          totalPages = 1;
          page = 1;
        }
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }

    // Debug opcional (inspecionar no Network sem alterar a UX)
    try {
      if (String(process.env.DEBUG_ASSEMBLEIAS_UNIDADE || '').trim() === '1') {
        res.setHeader('X-WDG-Assembleias-CanScopeAll', canScopeAll ? '1' : '0');
        res.setHeader('X-WDG-Assembleias-RequestedUnidade', requestedUnitId || '');
        res.setHeader('X-WDG-Assembleias-FiltroUnidade', String(filtro.unidade_id || ''));
      }
    } catch { /* noop */ }

    return res.render('condominios/assembleias/assembleias', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser,
      filtro,
      assembleias,
      pagination: { page, perPage, total, totalPages }
    });
  } catch (e) {
    return next(e);
  }
});

function getDefaultRegrasAssembleiaRecommended() {
  return {
    voteMode: 'POR_FRACAO',
    delinquencyPolicy: 'BLOQUEIA_VOTO',
    eligibility: {
      allowOwner: true,
      allowProxyWithPoA: true,
      allowTenantWithAuthorization: false,
      allowThirdPartyWithPoA: true
    },
    requirePoAIfNotOwner: true,
    presence: {
      allowRemotePresence: true,
      requireModeratorApprovalForRemote: true
    },
    quorum: {
      installationBase: 'PRESENTES',
      metric: 'FRACAO'
    },
    audit: {
      requireReasonOnOverride: true
    }
  };
}

function normalizeRegrasAssembleia(input) {
  const d = getDefaultRegrasAssembleiaRecommended();
  const r = (input && typeof input === 'object') ? input : {};

  const voteMode = (r.voteMode === 'POR_UNIDADE' || r.voteMode === 'POR_FRACAO') ? r.voteMode : d.voteMode;
  const delinquencyPolicy = (r.delinquencyPolicy === 'BLOQUEIA_VOTO' || r.delinquencyPolicy === 'APENAS_AVISO' || r.delinquencyPolicy === 'BLOQUEIA_PRESENCA_E_VOTO')
    ? r.delinquencyPolicy
    : d.delinquencyPolicy;

  const eligibilityIn = (r.eligibility && typeof r.eligibility === 'object') ? r.eligibility : {};
  const eligibility = {
    allowOwner: !!eligibilityIn.allowOwner,
    allowProxyWithPoA: !!eligibilityIn.allowProxyWithPoA,
    allowTenantWithAuthorization: !!eligibilityIn.allowTenantWithAuthorization,
    allowThirdPartyWithPoA: !!eligibilityIn.allowThirdPartyWithPoA
  };

  let requirePoAIfNotOwner = !!r.requirePoAIfNotOwner;
  if (!eligibility.allowProxyWithPoA && requirePoAIfNotOwner) {
    // Coerência: se não aceita procurador, não faz sentido exigir procuração.
    requirePoAIfNotOwner = false;
  }

  const presenceIn = (r.presence && typeof r.presence === 'object') ? r.presence : {};
  const presence = {
    allowRemotePresence: !!presenceIn.allowRemotePresence,
    requireModeratorApprovalForRemote: !!presenceIn.requireModeratorApprovalForRemote
  };
  if (!presence.allowRemotePresence) presence.requireModeratorApprovalForRemote = false;

  const quorumIn = (r.quorum && typeof r.quorum === 'object') ? r.quorum : {};
  const installationBase = (quorumIn.installationBase === 'TOTAL' || quorumIn.installationBase === 'ADIMPLENTES' || quorumIn.installationBase === 'PRESENTES')
    ? quorumIn.installationBase
    : d.quorum.installationBase;
  let metric = (quorumIn.metric === 'UNIDADES' || quorumIn.metric === 'FRACAO')
    ? quorumIn.metric
    : (voteMode === 'POR_FRACAO' ? 'FRACAO' : 'UNIDADES');
  if (voteMode === 'POR_FRACAO') metric = 'FRACAO';
  if (voteMode === 'POR_UNIDADE' && metric === 'FRACAO') metric = 'UNIDADES';

  const auditIn = (r.audit && typeof r.audit === 'object') ? r.audit : {};
  const audit = { requireReasonOnOverride: (auditIn.requireReasonOnOverride === false) ? false : true };

  return {
    voteMode,
    delinquencyPolicy,
    eligibility,
    requirePoAIfNotOwner,
    presence,
    quorum: { installationBase, metric },
    audit
  };
}

async function getAssembleiaSettingsUnidadeContext({ req, ctxUser }) {
  const canScopeAllUnits = userCanScopeAll(ctxUser);
  const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;

  // Alguns fluxos de login/sessão trazem ctxUser "magro" (sem unidade_id).
  let ctxUserForUnits = ctxUser;
  let userUnitId = normalizeObjectIdString(getUserUnidadeId(ctxUserForUnits));
  if (!canScopeAllUnits && !userUnitId) {
    try {
      const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser: ctxUserForUnits, canQueryDb });
      if (resolved) {
        ctxUserForUnits = { ...(ctxUserForUnits || {}), unidade_id: resolved };
        userUnitId = normalizeObjectIdString(resolved);
      }
    } catch { /* noop */ }
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUserForUnits);
  const allowed = new Set((unidadesOptions || []).map(u => normalizeObjectIdString(u?._id)).filter(Boolean));

  const qUnidadeIdRaw = String(req.query.unidade_id || req.query.unidade || req.query.unidadeId || '').trim();
  let selectedUnidadeId = '';
  if (canScopeAllUnits) {
    const qId = normalizeObjectIdString(qUnidadeIdRaw);
    if (qId && allowed.has(qId)) selectedUnidadeId = qId;
  } else {
    selectedUnidadeId = userUnitId || normalizeObjectIdString(unidadesOptions?.[0]?._id);
  }
  if (!canScopeAllUnits) selectedUnidadeId = selectedUnidadeId || userUnitId || normalizeObjectIdString(unidadesOptions?.[0]?._id);

  return { canScopeAllUnits, canQueryDb, unidadesOptions, allowed, userUnitId, selectedUnidadeId };
}

app.get('/assembleias/configuracoes', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }

    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    const { canScopeAllUnits, canQueryDb, selectedUnidadeId } = await getAssembleiaSettingsUnidadeContext({ req, ctxUser });

    let regras = getDefaultRegrasAssembleiaRecommended();
    if (selectedUnidadeId && canQueryDb) {
      try {
        const doc = await CondAssembleiaSettings.findOne({ unidade_id: selectedUnidadeId }).select('regras').lean();
        if (doc && doc.regras) regras = normalizeRegrasAssembleia(doc.regras);
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }

    const saved = String(req.query.saved || '').trim() === '1';
    const bp = req.baseUrl || '';
    return res.render('condominios/assembleias/assembleias_configuracoes', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser,
      _bp: bp,
      selectedUnidadeId: selectedUnidadeId || '',
      canScopeAllUnits: !!canScopeAllUnits,
      regras,
      saved
    });
  } catch (e) {
    return next(e);
  }
});

app.get('/assembleias/configuracoes/json', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }

    const ok = await ensureMongoReady();
    if (!ok) return res.status(503).json({ success: false, error: 'DB indisponível.' });

    const { canScopeAllUnits, canQueryDb, allowed, userUnitId } = await getAssembleiaSettingsUnidadeContext({ req, ctxUser });

    const qIdRaw = String(req.query.unidade_id || req.query.unidade || req.query.unidadeId || '').trim();
    let unidadeId = normalizeObjectIdString(qIdRaw);
    if (!canScopeAllUnits) unidadeId = normalizeObjectIdString(userUnitId);
    if (canScopeAllUnits && unidadeId && allowed && !allowed.has(unidadeId)) {
      return res.status(403).json({ success: false, error: 'unidade_id não permitida.' });
    }

    let regras = getDefaultRegrasAssembleiaRecommended();
    if (unidadeId && canQueryDb) {
      try {
        const doc = await CondAssembleiaSettings.findOne({ unidade_id: unidadeId }).select('regras').lean();
        if (doc && doc.regras) regras = normalizeRegrasAssembleia(doc.regras);
      } catch {
        // fallback para default
      }
    }

    return res.json({ success: true, regras });
  } catch (e) {
    return next(e);
  }
});

app.post('/assembleias/configuracoes/salvar', express.urlencoded({ extended: true }), async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }

    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    const { canScopeAllUnits, canQueryDb, allowed, userUnitId } = await getAssembleiaSettingsUnidadeContext({ req, ctxUser });

    let unidadeId = normalizeObjectIdString(String(req.body?.unidade_id || '').trim());
    if (!canScopeAllUnits) unidadeId = normalizeObjectIdString(userUnitId);
    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      return res.status(400).type('text/plain; charset=utf-8').send('unidade_id inválido.');
    }
    if (canScopeAllUnits && allowed && !allowed.has(unidadeId)) {
      return res.status(403).type('text/plain; charset=utf-8').send('unidade_id não permitida.');
    }

    let parsed = null;
    try {
      const raw = String(req.body?.regrasJson || '').trim();
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const regras = normalizeRegrasAssembleia(parsed || getDefaultRegrasAssembleiaRecommended());

    if (!canQueryDb) return res.status(503).type('text/plain; charset=utf-8').send('DB indisponível.');

    let doc = null;
    try {
      doc = await CondAssembleiaSettings.findOne({ unidade_id: unidadeId });
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }
    if (!doc) doc = new CondAssembleiaSettings({ unidade_id: new mongoose.Types.ObjectId(unidadeId) });
    doc.regras = regras;
    doc.schemaVersion = 1;
    doc.updatedBy = String(getUserIdentityKey(ctxUser) || '').trim();

    try {
      await doc.save();
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }

    const bp = req.baseUrl || '';
    return res.redirect(303, `${bp}/assembleias/configuracoes?unidade_id=${encodeURIComponent(unidadeId)}&saved=1`);
  } catch (e) {
    return next(e);
  }
});

// Exclusão definitiva de assembleia (somente Master).
// Remove:
// - registro CondAssembleia
// - DocumentoValidado vinculados (referencia entidade=assembleia, entidadeId=<id>)
// - arquivos gerados em uploads/documentos-validos/<token>.pdf e <token>.original.pdf
app.post('/assembleias/:id/excluir-definitivo', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }

    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios/assembleias'));
      return res.redirect(`/gestor/login?next=${nextUrl}`);
    }

    const isMaster = !!(ctxUser?.isMaster || String(ctxUser?.role || '').trim().toLowerCase() === 'master');
    if (!isMaster) return res.status(403).type('text/plain; charset=utf-8').send('Apenas Master pode excluir assembleias.');

    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    const id = String(req.params?.id || '').trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).type('text/plain; charset=utf-8').send('ID inválido.');
    }

    const assembleia = await CondAssembleia.findById(id).lean();
    if (!assembleia) return res.status(404).type('text/plain; charset=utf-8').send('Assembleia não encontrada.');

    const tokens = new Set();
    try {
      const t0 = String(assembleia?.editalDocumentoToken || '').trim().toLowerCase();
      if (t0) tokens.add(t0);
    } catch { /* noop */ }

    const vdocs = await DocumentoValidado
      .find({ modulo: 'condominios', 'referencia.entidade': 'assembleia', 'referencia.entidadeId': id })
      .select('token arquivo.url meta.originalArquivoUrl meta.substituidoPorToken')
      .lean();

    for (const d of (vdocs || [])) {
      const tk = String(d?.token || '').trim().toLowerCase();
      if (tk) tokens.add(tk);
      const sub = String(d?.meta?.substituidoPorToken || '').trim().toLowerCase();
      if (sub) tokens.add(sub);
    }

    // Best-effort: remover PDFs do Vercel Blob (quando armazenados como URL https)
    try {
      const blobToken = String(
        process.env.BLOB_READ_WRITE_TOKEN
        || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
        || process.env.VERCEL_BLOB_RW_TOKEN
        || ''
      ).trim();

      const urls = [];
      for (const d of (vdocs || [])) {
        const u1 = String(d?.arquivo?.url || '').trim();
        const u2 = String(d?.meta?.originalArquivoUrl || '').trim();
        if (u1) urls.push(u1);
        if (u2) urls.push(u2);
      }

      const isBlobUrl = (u) => /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(String(u || ''));
      for (const u of urls) {
        if (!isBlobUrl(u)) continue;
        // eslint-disable-next-line no-await-in-loop
        try { await del(u, blobToken ? { token: blobToken } : undefined); } catch { /* noop */ }
      }
    } catch { /* noop */ }

    const DOCS_DIR = path.resolve(process.cwd(), 'uploads', 'documentos-validos');
    const absInDocsDir = (absPath) => {
      try {
        const abs = path.resolve(absPath);
        return abs === DOCS_DIR || abs.startsWith(DOCS_DIR + path.sep);
      } catch {
        return false;
      }
    };

    const unlinkIfExists = async (absPath) => {
      try {
        if (!absPath) return false;
        if (!absInDocsDir(absPath)) return false;
        await fs.promises.unlink(absPath);
        return true;
      } catch {
        return false;
      }
    };

    const deleteByToken = async (token) => {
      const t = String(token || '').trim().toLowerCase();
      if (!t) return { token: t, deleted: 0 };
      const absCertified = path.join(DOCS_DIR, `${t}.pdf`);
      const absOriginal = path.join(DOCS_DIR, `${t}.original.pdf`);
      let deleted = 0;
      if (await unlinkIfExists(absCertified)) deleted++;
      if (await unlinkIfExists(absOriginal)) deleted++;
      return { token: t, deleted };
    };

    // Best-effort: anexos na pauta que apontem para /uploads/...
    try {
      const anexos = [];
      for (const it of (assembleia?.pauta || [])) {
        if (Array.isArray(it?.anexos)) anexos.push(...it.anexos);
      }
      for (const u of anexos) {
        const url = String(u || '').trim();
        if (!url || !url.startsWith('/uploads/')) continue;
        const abs = path.resolve(process.cwd(), url.replace(/^\/+/, ''));
        // Só apaga se estiver dentro de uploads/
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        if (abs === uploadsDir || abs.startsWith(uploadsDir + path.sep)) {
          try { await fs.promises.unlink(abs); } catch { /* noop */ }
        }
      }
    } catch { /* noop */ }

    // Apagar arquivos certificados/originais por token.
    const tokenList = Array.from(tokens.values()).filter(Boolean);
    const fileResults = [];
    for (const t of tokenList) {
      // eslint-disable-next-line no-await-in-loop
      fileResults.push(await deleteByToken(t));
    }

    // Remover documentos validados vinculados.
    if (tokenList.length) {
      await DocumentoValidado.deleteMany({ token: { $in: tokenList } });
    }
    await DocumentoValidado.deleteMany({ modulo: 'condominios', 'referencia.entidade': 'assembleia', 'referencia.entidadeId': id });

    // Remover a assembleia.
    await CondAssembleia.deleteOne({ _id: id });

    try {
      console.info('[assembleias][purge]', {
        assembleiaId: id,
        numero: String(assembleia?.numero || '').trim(),
        titulo: String(assembleia?.titulo || '').trim(),
        tokens: tokenList,
        filesDeleted: fileResults,
        by: String(getUserIdentityKey(ctxUser) || '').trim().toLowerCase()
      });
    } catch { /* noop */ }

    return res.redirect('/condominios/assembleias');
  } catch (e) {
    return next(e);
  }
});

app.get('/assembleias/nova', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    // IMPORTANTE (Vercel/CDN): não cachear HTML desta tela (injeta URLs com querystring de versão).
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('X-WDG-Asset-Version', String(res?.locals?.assetVersion || 'dev'));
    } catch { /* noop */ }

    const tab = normalizeAssembleiaTab(req.query.tab);
    const id = String(req.query.id || '').trim();
    const qUnidadeIdRaw = String(req.query.unidade_id || req.query.unidade || '').trim();
    const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
    let doc = null;
    if (id && canQueryDb && mongoose.isValidObjectId(id)) {
      try {
        doc = await CondAssembleia.findById(id).lean();
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }

    const canScopeAllUnits = userCanScopeAll(ctxUser);

    // Alguns fluxos de login/sessão trazem ctxUser "magro" (sem unidade_id).
    // Para Diretor/User, tentamos resolver a unidade pelo cadastro no Mongo.
    let ctxUserForUnits = ctxUser;
    let userUnitId = normalizeObjectIdString(getUserUnidadeId(ctxUserForUnits));
    if (!canScopeAllUnits && !userUnitId) {
      try {
        const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser: ctxUserForUnits, canQueryDb });
        if (resolved) {
          ctxUserForUnits = { ...(ctxUserForUnits || {}), unidade_id: resolved };
          userUnitId = resolved;
        }
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }

    const unidadesOptions = await listarUnidadesParaUsuario(ctxUserForUnits);
    const docUnitId = normalizeObjectIdString(doc?.unidade_id?._id || doc?.unidade_id);
    let selectedUnidadeId = docUnitId;
    if (!selectedUnidadeId) {
      if (!canScopeAllUnits) selectedUnidadeId = userUnitId || normalizeObjectIdString(unidadesOptions?.[0]?._id);
      else selectedUnidadeId = userUnitId || normalizeObjectIdString(unidadesOptions?.[0]?._id);
    }
    if (!canScopeAllUnits) selectedUnidadeId = selectedUnidadeId || userUnitId || normalizeObjectIdString(unidadesOptions?.[0]?._id);

    // Master/Admin pode escolher via querystring (antes do primeiro save)
    try {
      if (canScopeAllUnits && qUnidadeIdRaw) {
        const qId = normalizeObjectIdString(qUnidadeIdRaw);
        const allowed = new Set((unidadesOptions || []).map(u => normalizeObjectIdString(u?._id)).filter(Boolean));
        if (qId && allowed.has(qId)) selectedUnidadeId = qId;
      }
    } catch { /* noop */ }

    let available = { dirigentes: [], colaboradores: [], condominos: [] };
    try {
      available = await buildAssembleiaAvailableRecipients({ selectedUnidadeId, canQueryDb });
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }

    const errors = {};

    // UX: na aba Publicação, se a data não estiver salva ainda, assumimos hoje como padrão.
    // Isso evita “pendência” exibida mesmo quando a UI já preenche a data automaticamente.
    const docForView = doc ? { ...(doc || {}) } : null;
    try {
      if (tab === 'publicacao' && docForView && !docForView.dataPublicacao) {
        const now = new Date();
        docForView.dataPublicacao = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
    } catch { /* noop */ }

    let publishErrors = docForView ? validateAssembleiaForPublish(docForView) : { _global: 'Salve o rascunho antes de publicar.' };

    // Hardening: token do edital precisa existir e estar VALIDO no DB (anti-bypass; sem depender do front).
    try {
      const tok = String(doc?.editalDocumentoToken || '').trim().toLowerCase();
      if (tok && canQueryDb) {
        const vdoc = await DocumentosPort.obterPorToken(tok);
        const st = String(vdoc?.status || '').trim().toUpperCase();
        if (!vdoc) publishErrors.editalDocumentoToken = 'Não foi possível validar o edital. Envie novamente o edital assinado.';
        else if (st !== 'VALIDO') {
          publishErrors.editalDocumentoToken = (st === 'REVOGADO')
            ? 'O edital enviado não pode ser usado. Envie novamente o edital assinado.'
            : (st === 'SUBSTITUIDO')
              ? 'Existe uma versão mais recente do edital. Envie a versão atual assinada.'
              : 'Não foi possível validar o edital. Envie novamente o edital assinado.';
        }
      }
    } catch { /* best-effort */ }

    const canPublish = docForView && Object.keys(publishErrors).length === 0;

    return res.render('condominios/assembleias/nova_assembleia_index', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser,
      tab,
      id: docForView ? String(docForView._id) : '',
      form: docForView || {},
      unidadesOptions,
      selectedUnidadeId: selectedUnidadeId || '',
      available,
      errors,
      publishErrors,
      canPublish,
      showPublishErrors: false
    });
  } catch (e) {
    return next(e);
  }
});

// API: listar possíveis responsáveis (Dirigentes/Colaboradores/Condôminos)
app.get('/assembleias/api/responsaveis', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }

    const ok = await ensureMongoReady();
    if (!ok) return res.json([]);

    const canScopeAllUnits = userCanScopeAll(ctxUser);
    const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;

    const tipoRaw = String(req.query.tipo || '').trim().toLowerCase();
    const tipo = (tipoRaw === 'colaboradores' || tipoRaw === 'condominos' || tipoRaw === 'dirigentes') ? tipoRaw : 'dirigentes';

    let unidadeId = normalizeObjectIdString(String(req.query.unidade_id || req.query.unidade || '').trim());
    if (!canScopeAllUnits) {
      unidadeId = normalizeObjectIdString(getUserUnidadeId(ctxUser));
      if (!unidadeId) {
        try {
          const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser, canQueryDb });
          if (resolved) unidadeId = normalizeObjectIdString(resolved);
        } catch { /* noop */ }
      }
    } else if (unidadeId) {
      // Master/Admin: valida se a unidade está na lista acessível
      try {
        const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
        const allowed = new Set((unidadesOptions || []).map(u => normalizeObjectIdString(u?._id)).filter(Boolean));
        if (!allowed.has(unidadeId)) return res.status(403).json({ error: 'unidade_id não permitida' });
      } catch {
        return res.status(403).json({ error: 'unidade_id não permitida' });
      }
    }

    if (!unidadeId) return res.status(400).json({ error: 'unidade_id é obrigatório' });

    const qRaw = String(req.query.q || '').trim();
    const qNorm = qRaw
      ? (qRaw.normalize ? qRaw.normalize('NFD').replace(/\p{Diacritic}/gu, '') : qRaw)
          .toLowerCase()
          .trim()
      : '';

    let limit = parseInt(String(req.query.limit || '120'), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 120;
    limit = Math.min(limit, 400);

    const available = await buildAssembleiaAvailableRecipients({ selectedUnidadeId: unidadeId, canQueryDb });
    let items = Array.isArray(available?.[tipo]) ? available[tipo] : [];

    if (qNorm) {
      const norm = (v) => {
        const s = String(v || '').trim();
        if (!s) return '';
        try { return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(); } catch { return s.toLowerCase(); }
      };
      items = items.filter((p) => {
        const nome = norm(p?.nome);
        const email = norm(p?.email);
        const sub = norm(p?.subtitulo);
        const subs = Array.isArray(p?.subtitulos) ? p.subtitulos.map(norm).join(' ') : '';
        return (
          (nome && nome.includes(qNorm)) ||
          (email && email.includes(qNorm)) ||
          (sub && sub.includes(qNorm)) ||
          (subs && subs.includes(qNorm))
        );
      });
    }

    items = items.slice(0, limit);
    return res.json(items);
  } catch (e) {
    return next(e);
  }
});

// API: gerar número manual (sem repetição) para o campo Número
app.get('/assembleias/api/numero/gerar', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    const ok = await ensureMongoReady();
    if (!ok) {
      const numero = generateAssembleiaNumero();
      return res.json({ numero, offline: true });
    }

    const canScopeAllUnits = userCanScopeAll(ctxUser);
    const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;

    let unidadeId = normalizeObjectIdString(String(req.query.unidade_id || req.query.unidade || '').trim());
    if (!canScopeAllUnits) {
      unidadeId = normalizeObjectIdString(getUserUnidadeId(ctxUser));
    } else if (unidadeId) {
      // Master/Admin: valida se a unidade está na lista acessível
      try {
        const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
        const allowed = new Set((unidadesOptions || []).map(u => normalizeObjectIdString(u?._id)).filter(Boolean));
        if (!allowed.has(unidadeId)) unidadeId = '';
      } catch { /* noop */ }
    }

    const numero = await generateUniqueAssembleiaNumero({ unidadeId, canQueryDb });
    return res.json({ numero });
  } catch (e) {
    return next(e);
  }
});

app.post('/assembleias/nova/salvar', ...ASSEMBLEIA_BODY_PARSERS, async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    const body = req.body || {};
    const tab = normalizeAssembleiaTab(body.tab || req.query.tab);
    const nav = String(body.nav || 'stay'); // stay|prev|next
    const id = String(body.id || req.query.id || '').trim();
    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    let doc = null;
    if (id && mongoose.isValidObjectId(id)) {
      try {
        doc = await CondAssembleia.findById(id);
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }
    if (!doc) {
      doc = new CondAssembleia({ status: 'rascunho' });
      doc.audit = doc.audit || {};
      doc.audit.createdBy = getAuditUser(ctxUser);
    }

    applyBodyToAssembleiaDoc(doc, body);

    // Unidade (aba Dados): Master/Admin escolhe; Diretor/User força unidade do usuário
    try {
      const canScopeAllUnits = userCanScopeAll(ctxUser);
      let userUnitId = normalizeObjectIdString(getUserUnidadeId(ctxUser));
      if (!canScopeAllUnits) {
        const submittedId = normalizeObjectIdString(body.unidade_id);

        // Se ctxUser não tem unidade_id, tenta resolver pelo cadastro.
        let ctxUserForUnits = ctxUser;
        if (!userUnitId) {
          const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser: ctxUserForUnits, canQueryDb: mongoose.connection.readyState === 1 });
          if (resolved) {
            ctxUserForUnits = { ...(ctxUserForUnits || {}), unidade_id: resolved };
            userUnitId = resolved;
          }
        }

        const unidadesOptions = await listarUnidadesParaUsuario(ctxUserForUnits);
        const allowedIds = new Set((unidadesOptions || []).map(u => normalizeObjectIdString(u?._id)).filter(Boolean));
        const forcedId =
          userUnitId ||
          (submittedId && allowedIds.has(submittedId) ? submittedId : '') ||
          Array.from(allowedIds.values())[0] ||
          '';
        if (forcedId) doc.unidade_id = new mongoose.Types.ObjectId(forcedId);
      } else {
        const bodyUnitId = normalizeObjectIdString(body.unidade_id);
        if (body.unidade_id !== undefined) {
          doc.unidade_id = bodyUnitId ? new mongoose.Types.ObjectId(bodyUnitId) : null;
        } else if (!doc.unidade_id && userUnitId) {
          doc.unidade_id = new mongoose.Types.ObjectId(userUnitId);
        }
      }
    } catch { /* noop */ }

    // Destinatários (aba Publicação): CSV -> array
    try {
      const csv = String(body.selectedPersonIds || '').trim();
      const arr = csv
        ? csv.split(',').map(s => String(s || '').trim()).filter(Boolean).slice(0, 500)
        : [];
      // Persistir mesmo que o schema não declare explicitamente (mudança mínima sem refatorar model)
      if (typeof doc.set === 'function') doc.set('selectedPersonIds', arr, { strict: false });
      else doc.selectedPersonIds = arr;
      try { if (typeof doc.markModified === 'function') doc.markModified('selectedPersonIds'); } catch { /* noop */ }
    } catch { /* noop */ }

    // Regras da assembleia (snapshot para auditoria)
    try {
      const rawOrigem = String(body.regrasOrigem || '').trim().toUpperCase();
      const origem = (rawOrigem === 'PERSONALIZADA') ? 'PERSONALIZADA' : ((rawOrigem === 'PADRAO_CONDOMINIO') ? 'PADRAO_CONDOMINIO' : '');
      const rawJson = String(body.regrasSnapshotJson || '').trim();

      // Só mexe se o front enviou algum sinal de regras (evita sobrescrever em saves de outras abas/fluxos)
      const shouldHandle = !!origem || !!rawJson;

      if (shouldHandle) {
        let snapshot = null;
        if (rawJson) {
          try { snapshot = JSON.parse(rawJson); } catch { snapshot = null; }
        }

        // Se está usando padrão e não veio snapshot, tenta buscar o atual do condomínio.
        if (!snapshot && origem === 'PADRAO_CONDOMINIO') {
          try {
            const unidadeId = normalizeObjectIdString(doc?.unidade_id?._id || doc?.unidade_id || body.unidade_id);
            const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
            if (unidadeId && canQueryDb) {
              const s = await CondAssembleiaSettings.findOne({ unidade_id: unidadeId }).select('regras').lean();
              if (s && s.regras) snapshot = s.regras;
            }
          } catch { /* fallback para default */ }
        }

        const regras = normalizeRegrasAssembleia(snapshot || getDefaultRegrasAssembleiaRecommended());

        if (typeof doc.set === 'function') {
          doc.set('regras', regras, { strict: false });
          doc.set('regrasOrigem', origem || 'PADRAO_CONDOMINIO', { strict: false });
        } else {
          doc.regras = regras;
          doc.regrasOrigem = origem || 'PADRAO_CONDOMINIO';
        }
        try { if (typeof doc.markModified === 'function') { doc.markModified('regras'); doc.markModified('regrasOrigem'); } } catch { /* noop */ }
      }
    } catch { /* noop */ }

    doc.audit = doc.audit || {};
    doc.audit.updatedBy = getAuditUser(ctxUser);

    try {
      await doc.save();
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }

    const idx = ASSEMBLEIA_TABS.indexOf(tab);
    let targetTab = tab;
    if (nav === 'prev') targetTab = ASSEMBLEIA_TABS[Math.max(0, idx - 1)] || 'dados';
    if (nav === 'next') targetTab = ASSEMBLEIA_TABS[Math.min(ASSEMBLEIA_TABS.length - 1, idx + 1)] || 'publicacao';

    const bp = req.baseUrl || '';
    // 303 força o client a seguir com GET (evita re-POST em alguns ambientes/proxies)
    return res.redirect(303, `${bp}/assembleias/nova?id=${String(doc._id)}&tab=${encodeURIComponent(targetTab)}`);
  } catch (e) {
    return next(e);
  }
});

// Hardening: caso algum client/proxy repita o POST para a tela /assembleias/nova (que é GET),
// convertemos para GET preservando querystring para evitar 404 no fluxo de "Avançar".
app.post('/assembleias/nova', (req, res) => {
  try {
    const bp = req.baseUrl || '';
    const raw = String(req.originalUrl || req.url || '');
    const qIndex = raw.indexOf('?');
    const qs = qIndex >= 0 ? raw.slice(qIndex) : '';
    return res.redirect(303, `${bp}/assembleias/nova${qs}`);
  } catch {
    return res.redirect(303, '/condominios/assembleias/nova');
  }
});

app.post('/assembleias/nova/publicar', ...ASSEMBLEIA_BODY_PARSERS, async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  const wantsJson = String(req.headers['x-wdg-ajax'] || '').trim() === '1'
    || String(req.headers.accept || '').toLowerCase().includes('application/json');
  try {
    const tab = 'publicacao';
    const body = req.body || {};
    const id = String(body.id || req.query.id || '').trim();
    const ok = await ensureMongoReady();
    if (!ok) {
      if (wantsJson) return res.status(503).json({ ok: false, error: 'DB indisponível. Tente novamente.' });
      return respondDbOffline(res, req);
    }

    const bp = req.baseUrl || '';
    if (!id || !mongoose.isValidObjectId(id)) {
      if (wantsJson) return res.status(400).json({ ok: false, error: 'Assembleia inválida.' });
      return res.redirect(`${bp}/assembleias`);
    }
    let doc = null;
    try {
      doc = await CondAssembleia.findById(id);
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }
    if (!doc) {
      if (wantsJson) return res.status(404).json({ ok: false, error: 'Assembleia não encontrada.' });
      return res.redirect(`${bp}/assembleias`);
    }

    applyBodyToAssembleiaDoc(doc, body);

    // Destinatários: aplica/atualiza no ato de convocar (sem exigir que o usuário tenha clicado em "Salvar" antes).
    try {
      let arr = [];
      if (Array.isArray(body.selectedPersonIds)) {
        arr = body.selectedPersonIds.map(s => String(s || '').trim()).filter(Boolean);
      } else {
        const csv = String(body.selectedPersonIds || '').trim();
        arr = csv ? csv.split(',').map(s => String(s || '').trim()).filter(Boolean) : [];
      }
      arr = arr.slice(0, 500);
      if (typeof doc.set === 'function') doc.set('selectedPersonIds', arr, { strict: false });
      else doc.selectedPersonIds = arr;
      try { if (typeof doc.markModified === 'function') doc.markModified('selectedPersonIds'); } catch { /* noop */ }
    } catch { /* noop */ }

    // Entrega interna (apenas Caixa de Mensagens) + data de emissão
    const parseDateYmdOrNow = (raw) => {
      const s = String(raw || '').trim();
      const now = new Date();
      if (!s) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T00:00:00`);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    };
    const dataEmissao = parseDateYmdOrNow(body.dataEmissao ?? body.dataPublicacao);

    const entregaMensagem = true;
    const publicarComunicado = false;

    try {
      if (typeof doc.set === 'function') {
        doc.set('entrega', { mensagem: entregaMensagem, comunicado: publicarComunicado }, { strict: false });
        doc.set('dataEmissao', dataEmissao, { strict: false });

        // Compatibilidade com o template atual (publicacao.ejs)
        doc.set('enviarEmail', entregaMensagem, { strict: false });
        doc.set('publicarPortal', publicarComunicado, { strict: false });
        doc.set('dataPublicacao', dataEmissao, { strict: false });
      } else {
        doc.entrega = { mensagem: entregaMensagem, comunicado: publicarComunicado };
        doc.dataEmissao = dataEmissao;
        doc.enviarEmail = entregaMensagem;
        doc.publicarPortal = publicarComunicado;
        doc.dataPublicacao = dataEmissao;
      }
      try {
        if (typeof doc.markModified === 'function') {
          doc.markModified('entrega');
          doc.markModified('dataEmissao');
          doc.markModified('dataPublicacao');
        }
      } catch { /* noop */ }
    } catch { /* noop */ }

    doc.audit = doc.audit || {};
    doc.audit.updatedBy = getAuditUser(ctxUser);

    const errors = validateAssembleiaForPublish(doc);

    // Convocação exige destinatários selecionados.
    try {
      const raw = (doc && typeof doc.get === 'function') ? doc.get('selectedPersonIds') : doc?.selectedPersonIds;
      const ids = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string'
          ? String(raw || '').split(',').map(s => String(s || '').trim()).filter(Boolean)
          : []);
      if (!ids.length) errors.selectedPersonIds = 'Selecione ao menos um destinatário antes de convocar.';
    } catch { /* noop */ }

    // Hardening: valida token no DB e status do documento (anti-bypass via POST manual).
    let vdocForAttach = null;
    try {
      const tok = String(doc?.editalDocumentoToken || '').trim().toLowerCase();
      if (tok) {
        const vdoc = await DocumentosPort.obterPorToken(tok);
        vdocForAttach = vdoc || null;
        const st = String(vdoc?.status || '').trim().toUpperCase();
        if (!vdoc) errors.editalDocumentoToken = 'Certificação não encontrada. Envie o PDF assinado novamente.';
        else if (st !== 'VALIDO') {
          errors.editalDocumentoToken = (st === 'REVOGADO')
            ? 'Certificação revogada. Envie o PDF assinado novamente.'
            : (st === 'SUBSTITUIDO')
              ? 'Certificação substituída. Envie a versão atual do PDF assinado.'
              : 'Certificação inválida. Envie o PDF assinado novamente.';
        }
      }
    } catch { /* best-effort */ }

    const canPublish = Object.keys(errors).length === 0;
    if (!canPublish) {
      // Persistir opções da aba Publicação mesmo com erro de validação
      try {
        await doc.save();
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }

      if (wantsJson) {
        return res.status(400).json({
          ok: false,
          error: 'Há pendências para convocar.',
          publishErrors: errors,
          debug: {
            contentType: String(req.headers['content-type'] || ''),
            receivedSelectedPersonIds: body.selectedPersonIds,
            receivedSelectedPersonIdsType: Array.isArray(body.selectedPersonIds) ? 'array' : typeof body.selectedPersonIds,
            docSelectedPersonIdsCount: (() => {
              try {
                const raw = (doc && typeof doc.get === 'function') ? doc.get('selectedPersonIds') : doc?.selectedPersonIds;
                if (Array.isArray(raw)) return raw.length;
                if (typeof raw === 'string') {
                  const arr = String(raw || '').split(',').map(s => String(s || '').trim()).filter(Boolean);
                  return arr.length;
                }
                return null;
              } catch {
                return null;
              }
            })()
          }
        });
      }

      const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
      const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
      const selectedUnidadeId = normalizeObjectIdString(doc?.unidade_id?._id || doc?.unidade_id) || normalizeObjectIdString(getUserUnidadeId(ctxUser));
      let available = { dirigentes: [], colaboradores: [], condominos: [] };
      try {
        available = await buildAssembleiaAvailableRecipients({ selectedUnidadeId, canQueryDb });
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
      // Renderiza a aba de publicação com os erros
      return res.status(400).render('condominios/assembleias/nova_assembleia_index', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        tab,
        id: String(doc._id),
        form: doc.toObject ? doc.toObject() : doc,
        unidadesOptions,
        selectedUnidadeId: selectedUnidadeId || '',
        available,
        errors: {},
        publishErrors: errors,
        canPublish: false,
        showPublishErrors: true
      });
    }

    // Envia mensagem formal na Caixa de Mensagens (remetente: Sistema).
    // IMPORTANTE: respostas para essa "caixa" não são monitoradas.
    try {
      const unidadeId = normalizeObjectIdString(doc?.unidade_id?._id || doc?.unidade_id);
      const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;

      const available = await buildAssembleiaAvailableRecipients({ selectedUnidadeId: unidadeId, canQueryDb });
      const all = [...(available?.dirigentes || []), ...(available?.colaboradores || []), ...(available?.condominos || [])];
      const byId = new Map(all.map(p => [String(p?.id || '').trim(), p]).filter(([k]) => !!k));
      const aliasToId = new Map();
      all.forEach((p) => {
        const pid = String(p?.id || '').trim();
        const aliases = Array.isArray(p?.aliases) ? p.aliases : [];
        aliases.forEach((a) => {
          const key = String(a || '').trim();
          if (key) aliasToId.set(key, pid);
        });
      });
      const resolveId = (raw) => {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (byId.has(s)) return s;
        const mapped = aliasToId.get(s);
        return mapped || s;
      };

      const selectedIds = (() => {
        const raw = (doc && typeof doc.get === 'function') ? doc.get('selectedPersonIds') : doc?.selectedPersonIds;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') return String(raw || '').split(',').map(s => String(s || '').trim()).filter(Boolean);
        return [];
      })();
      const to = [];
      const seen = new Set();
      for (const sid of selectedIds) {
        const rid = resolveId(sid);
        const p = byId.get(rid) || null;

        // Fallback: ids no formato em:<email>
        const rawEmail = p
          ? String(p?.email || '').trim()
          : (String(rid || '').startsWith('em:') ? String(rid).slice(3).trim() : '');
        const email = String(rawEmail || '').trim().toLowerCase();
        if (!isEmailish(email)) continue;
        if (seen.has(email)) continue;
        seen.add(email);

        const nome = p ? String(p?.nome || '').trim() : '';
        to.push({ type: 'user', email, nome });
      }

      if (!to.length) {
        // Segurança: se não conseguimos resolver e-mails válidos, não convoca.
        const err = new Error('Nenhum destinatário válido para envio pela Caixa de Mensagens.');
        err.status = 400;
        throw err;
      }

      const fromMailboxId = 'pessoal';
      const fromMailboxName = 'Sistema';
      const fromOwner = 'sistema@wdgestor.local';
      const clientNonce = `assembleia:${String(doc._id)}:convocacao`;

      const fmtDate = (d) => {
        try { return (d instanceof Date ? d : new Date(d)).toLocaleDateString('pt-BR'); } catch { return ''; }
      };
      const fmtTime = (s) => String(s || '').trim();

      const numero = String(doc?.numero || '').trim();
      const titulo = String(doc?.titulo || '').trim();
      const modalidade = String(doc?.modalidade || '').trim();
      const dataAssembleia = doc?.data ? fmtDate(doc.data) : '';
      const dataEm = doc?.dataPublicacao ? fmtDate(doc.dataPublicacao) : (doc?.dataEmissao ? fmtDate(doc.dataEmissao) : '');
      const regra = String(doc?.regraConvocacao || '').trim();
      const local = String(doc?.local || '').trim();
      const link = String(doc?.link || '').trim();

      const assunto = `Convocação de Assembleia${numero ? ' — ' + numero : ''}${titulo ? ' — ' + titulo : ''}`.slice(0, 140);

      const linhas = [];
      linhas.push('Prezados(as),');
      linhas.push('');
      linhas.push('Por meio desta, comunicamos a CONVOCAÇÃO de assembleia, conforme edital assinado e certificado em anexo.');
      linhas.push('');
      if (titulo) linhas.push(`Título: ${titulo}`);
      if (numero) linhas.push(`Número: ${numero}`);
      if (dataAssembleia) linhas.push(`Data: ${dataAssembleia}`);
      if (modalidade) linhas.push(`Modalidade: ${modalidade}`);
      if (regra) linhas.push(`Regra de convocação: ${regra}`);
      if (String(doc?.hora1 || '').trim()) linhas.push(`Horário (1ª chamada): ${fmtTime(doc.hora1)}`);
      if (String(doc?.hora2 || '').trim()) linhas.push(`Horário (2ª chamada): ${fmtTime(doc.hora2)}`);
      if (String(doc?.horaUnica || '').trim()) linhas.push(`Horário: ${fmtTime(doc.horaUnica)}`);
      if (local) linhas.push(`Local: ${local}`);
      if (link) linhas.push(`Link: ${link}`);
      if (dataEm) linhas.push(`Data de emissão: ${dataEm}`);
      linhas.push('');
      linhas.push('Solicitamos a gentileza de ler integralmente o edital e, se necessário, preparar-se para as deliberações pautadas.');
      linhas.push('');
      linhas.push('Atenciosamente,');
      linhas.push('Sistema');
      linhas.push('');
      linhas.push('Observação: esta é uma mensagem automática. Respostas para este remetente não são monitoradas.');

      const bodyText = linhas.join('\n').trim();

      const escapeHtml = (value) => {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      // A UI renderiza preferencialmente body_html; então geramos HTML simples a partir
      // das mesmas linhas, evitando depender de body_text.
      const bodyHtml = `
        <div class="wdg-msg-text">${linhas.map(l => escapeHtml(l)).join('<br>')}</div>
      `.trim();

      const anexos = [];
      try {
        const url = String(vdocForAttach?.arquivo?.url || '').trim();
        const filename = String(vdocForAttach?.arquivo?.filename || '').trim();
        const mime = String(vdocForAttach?.arquivo?.mime || 'application/pdf').trim();
        const size = Number(vdocForAttach?.arquivo?.size || 0) || 0;
        if (url) {
          anexos.push({
            nome: filename || `Edital de Convocação${numero ? ' - ' + numero : ''}.pdf`,
            mime,
            tamanho: size,
            url,
            caminho: ''
          });
        }
      } catch { /* noop */ }

      // Estados por destinatário (Caixa Pessoal)
      const scopes = new Map();
      pushMsgStateScope(scopes, { mailboxId: fromMailboxId, owner: fromOwner }, { requireOwner: true });
      to.forEach(m => {
        pushMsgStateScope(
          scopes,
          { mailboxId: 'pessoal', owner: String(m?.email || '').trim().toLowerCase() },
          { requireOwner: true }
        );
      });

      const initialStates = buildMsgInitialStates({ scopes, fromMailboxId, fromOwner });

      // Idempotência (anti duplo clique)
      try {
        const existing = await CondMsgMessage.findOne({ from_owner: String(fromOwner).toLowerCase(), from_mailbox_id: fromMailboxId, client_nonce: clientNonce })
          .select('_id')
          .lean();

        const fillBodyIfEmptyById = async (id) => {
          try {
            const _id = String(id || '').trim();
            if (!_id || !mongoose.isValidObjectId(_id)) return;
            await CondMsgMessage.updateOne(
              {
                _id,
                $and: [
                  { $or: [{ body_text: { $exists: false } }, { body_text: '' }] },
                  { $or: [{ body_html: { $exists: false } }, { body_html: '' }] }
                ]
              },
              { $set: { body_text: bodyText, body_html: bodyHtml } }
            );
          } catch { /* noop */ }
        };

        // Se já existir (ex.: reenvio), garante que o corpo não esteja vazio.
        if (existing?._id) {
          await fillBodyIfEmptyById(existing._id);
        }
        if (!existing?._id) {
          let created = null;
          for (let i = 0; i < 7; i++) {
            const protocolo = generateMsgProtocolo();
            try {
              created = await CondMsgMessage.create({
                protocolo,
                ano: Number(String(protocolo).slice(0, 4)) || new Date().getFullYear(),
                from_mailbox_id: fromMailboxId,
                from_mailbox_name: fromMailboxName,
                from_owner: String(fromOwner).trim().toLowerCase(),
                client_nonce: clientNonce,
                to,
                cc: [],
                assunto,
                body_html: bodyHtml,
                body_text: bodyText,
                assinatura_ativa: false,
                assinatura_texto: '',
                anexos,
                thread_root_id: null,
                in_reply_to: null,
                forwarded_from_id: null,
                acessos: [],
                states: initialStates,
                unidade_id: unidadeId ? new mongoose.Types.ObjectId(unidadeId) : null,
                createdBy: 'Sistema',
                ativo: true
              });
              break;
            } catch (e) {
              const isDup = e && (e.code === 11000 || String(e.message || '').includes('duplicate key'));
              if (isDup) {
                // corrida do client_nonce: retorna existente no próximo check
                created = null;
                continue;
              }
              throw e;
            }
          }

          // Defesa: caso algum fluxo/legado crie sem corpo, corrige.
          try { await fillBodyIfEmptyById(created?._id); } catch { /* noop */ }

          if (!created) {
            // best-effort: se caiu aqui por corrida, ok; caso contrário, falha.
            const ex2 = await CondMsgMessage.findOne({ from_owner: String(fromOwner).toLowerCase(), from_mailbox_id: fromMailboxId, client_nonce: clientNonce })
              .select('_id')
              .lean();
            if (ex2?._id) {
              await fillBodyIfEmptyById(ex2._id);
            }
            if (!ex2?._id) throw new Error('Falha ao gerar protocolo para mensagem do sistema.');
          }
        }
      } catch (e) {
        const msg = String(e?.message || '').trim() || 'Falha ao enviar mensagem.';
        const err = new Error(msg);
        err.status = 500;
        throw err;
      }
    } catch (e) {
      // Não marca como convocada se não conseguir enviar a mensagem.
      const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
      const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
      const selectedUnidadeId = normalizeObjectIdString(doc?.unidade_id?._id || doc?.unidade_id) || normalizeObjectIdString(getUserUnidadeId(ctxUser));
      let available = { dirigentes: [], colaboradores: [], condominos: [] };
      try {
        available = await buildAssembleiaAvailableRecipients({ selectedUnidadeId, canQueryDb });
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }

      const st = e && e.status ? Number(e.status) : 500;
      const msg = (st && st < 500)
        ? (String(e?.message || '').trim() || 'Não foi possível enviar a convocação. Verifique e tente novamente.')
        : 'Falha ao enviar a convocação via Caixa de Mensagens. Tente novamente.';

      const publishErrors = { _global: msg };
      if (wantsJson) {
        const status = (st && st >= 400 && st < 600) ? st : 500;
        return res.status(status).json({ ok: false, error: msg });
      }

      return res.status(500).render('condominios/assembleias/nova_assembleia_index', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        tab,
        id: String(doc._id),
        form: doc.toObject ? doc.toObject() : doc,
        unidadesOptions,
        selectedUnidadeId: selectedUnidadeId || '',
        available,
        errors: {},
        publishErrors,
        canPublish: false,
        showPublishErrors: true
      });
    }

    doc.status = 'convocada';
    try {
      await doc.save();
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }

    if (wantsJson) {
      return res.json({ ok: true, redirect: `${bp}/assembleias` });
    }
    return res.redirect(`${bp}/assembleias`);
  } catch (e) {
    if (wantsJson) {
      const st = e && e.status ? Number(e.status) : 500;
      const status = (st && st >= 400 && st < 600) ? st : 500;
      const msg = (status && status < 500)
        ? (String(e?.message || '').trim() || 'Não foi possível enviar a convocação. Verifique e tente novamente.')
        : 'Falha ao enviar a convocação. Tente novamente.';
      return res.status(status).json({ ok: false, error: msg });
    }
    return next(e);
  }
});

// Preview do edital de convocação
app.get('/assembleias/:id/edital', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } catch { /* noop */ }

    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    const id = String(req.params?.id || '').trim();
    const bp = req.baseUrl || '';
    if (!id || !mongoose.isValidObjectId(id)) return res.redirect(`${bp}/assembleias`);

    const printMode = (() => {
      const v = String(req.query?.print || '').trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })();

    let obj = null;
    try {
      obj = await CondAssembleia.findById(id).lean();
    } catch (err) {
      if (isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }
    if (!obj) return res.redirect(`${bp}/assembleias`);

    const unidadeId = (() => {
      try {
        const raw = obj?.unidade_id?._id || obj?.unidade_id || obj?.unidadeId || '';
        const v = String(raw || '').trim();
        return v && mongoose.isValidObjectId(v) ? v : '';
      } catch {
        return '';
      }
    })();

    const unidadeLogoUrl = unidadeId ? `${String(bp || '').replace(/\/+$/, '')}/api/unidades/${encodeURIComponent(unidadeId)}/logo` : '';

    const parsePessoaFromResponsavel = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return { nome: '', email: '', cargo: '' };

      let email = '';
      const mEmail = text.match(/<([^>]+)>/);
      if (mEmail) email = String(mEmail[1] || '').trim();

      const beforeEmail = text.split('<')[0].trim();
      const beforeCpf = beforeEmail.replace(/\(\s*cpf\s*[^)]+\)/i, '').trim();

      let nome = beforeCpf;
      let cargo = '';
      const idx = beforeCpf.indexOf(' - ');
      if (idx >= 0) {
        nome = beforeCpf.slice(0, idx).trim();
        cargo = beforeCpf.slice(idx + 3).trim();
      }

      return { nome: nome || text, email, cargo };
    };

    const organizador = parsePessoaFromResponsavel(obj?.responsavel);

    const buildEnderecoLinha = (u) => {
      const parts = [];
      const push = (v) => {
        const s = String(v || '').trim();
        if (s) parts.push(s);
      };
      push(u?.tipoLogradouro);
      push(u?.logradouro);
      if (u?.numero) push(String(u.numero).trim());
      if (u?.complemento) push(String(u.complemento).trim());
      if (u?.bairro) push(String(u.bairro).trim());
      const cidadeUf = [String(u?.cidade || '').trim(), String(u?.estado || '').trim()].filter(Boolean).join(' - ');
      if (cidadeUf) parts.push(cidadeUf);
      if (u?.cep) parts.push(String(u.cep).trim());
      return parts.join(', ');
    };

    let condominio = { nome: '', cnpj: '', endereco: '' };
    if (unidadeId) {
      try {
        const u = await unidadesReadRepoFromReq(req).findById(
          unidadeId,
          { select: 'nome cnpj endereco tipoLogradouro logradouro numero complemento bairro cep cidade estado' }
        );
        if (u) {
          const enderecoLinha = String(u?.endereco || '').trim() || buildEnderecoLinha(u);
          condominio = {
            nome: String(u?.nome || '').trim(),
            cnpj: String(u?.cnpj || '').trim(),
            endereco: String(enderecoLinha || '').trim()
          };
        }
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }
    if (!condominio?.nome) {
      condominio.nome = String(obj?.unidade_nome || obj?.unidadeNome || obj?.unidade?.nome || obj?.unidade_id?.nome || '').trim();
    }

    let convocante = null;
    let convocanteAviso = '';
    if (unidadeId) {
      try {
        let cargoSindico = await CondDirigenciaCargo.findOne({ unidadeId, tipo: 'sindico' }).lean();
        if (!cargoSindico) {
          cargoSindico = await CondDirigenciaCargo.findOne({ unidadeId, nome: /s[ií]ndico/i }).lean();
        }

        const cargoId = String(cargoSindico?._id || '').trim();
        if (cargoId) {
          const mandato = await CondDirigenciaMandato.findOne({ unidadeId, cargoId, ativo: true })
            .populate('usuarioId', 'nome email')
            .lean();
          const u = mandato?.usuarioId;
          const nome = String(u?.nome || '').trim();
          const email = String(u?.email || '').trim();
          if (nome || email) {
            convocante = {
              nome: nome || email || 'Síndico',
              email,
              cargo: String(cargoSindico?.nome || 'Síndico').trim() || 'Síndico'
            };
          }
        }
      } catch (err) {
        if (isMongoOfflineError(err)) return respondDbOffline(res, req);
        throw err;
      }
    }

    if (!convocante || !String(convocante?.nome || '').trim()) {
      if (String(organizador?.nome || '').trim() || String(organizador?.email || '').trim()) {
        convocante = {
          nome: String(organizador?.nome || '').trim() || String(organizador?.email || '').trim(),
          email: String(organizador?.email || '').trim(),
          cargo: 'Convocante'
        };
      } else {
        convocante = { nome: 'Convocante', email: '', cargo: 'Convocante' };
      }
      convocanteAviso = 'Síndico não definido na Dirigência; usando o organizador como convocante.';
    }

    return res.render('condominios/assembleias/edital_preview', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser,
      basePath: bp,
      assembleia: obj,
      condominio,
      convocante,
      organizador,
      convocanteAviso,
      unidadeLogoUrl,
      printMode
    });
  } catch (e) {
    try {
      const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
      if (!isProd && !res.headersSent) {
        console.error('[condominios][assembleias][edital] erro ao renderizar', e);
        return res.status(500).send(`Falha ao gerar o edital. ${String(e?.message || e || 'Erro interno')}`);
      }
    } catch { /* noop */ }
    return next(e);
  }
});

// Upload do edital assinado externamente (PDF) + emissão de token global verificável
const editalAssinadoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.DOCS_MAX_PDF_BYTES || (15 * 1024 * 1024)),
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    try {
      const mime = String(file?.mimetype || '').toLowerCase();
      const name = String(file?.originalname || 'documento.pdf');
      if (mime && mime !== 'application/pdf') return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'pdf'));
      if (name && !/\.pdf$/i.test(name)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'pdf'));
      return cb(null, true);
    } catch {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'pdf'));
    }
  }
});

app.post('/assembleias/:id/edital/upload-assinado', async (req, res, next) => {
  const ctxUser = getCtxUser(req);
  try {
    const ok = await ensureMongoReady();
    if (!ok) return respondDbOffline(res, req);

    return editalAssinadoUpload.single('pdf')(req, res, async (err) => {
      try {
        if (err) {
          const msg = (err?.code === 'LIMIT_FILE_SIZE')
            ? 'Arquivo muito grande. Envie um PDF menor.'
            : 'Upload inválido. Envie um arquivo PDF.';
          return res.status(400).json({ success: false, message: msg });
        }

        const id = String(req.params?.id || '').trim();
        if (!id || !mongoose.isValidObjectId(id)) {
          return res.status(400).json({ success: false, message: 'ID inválido.' });
        }

        const file = req.file;
        if (!file || !file.buffer) {
          return res.status(400).json({ success: false, message: 'Envie o PDF no campo "pdf".' });
        }

        const doc = await CondAssembleia.findById(id);
        if (!doc) return res.status(404).json({ success: false, message: 'Assembleia não encontrada.' });

        const unidadeId = (() => {
          try {
            const raw = doc?.unidade_id?._id || doc?.unidade_id || '';
            const v = String(raw || '').trim();
            return v && mongoose.isValidObjectId(v) ? v : '';
          } catch { return ''; }
        })();

        const prevToken = String(doc?.editalDocumentoToken || '').trim();

        const emitido = await DocumentosPort.emitirDocumentoAssinadoExterno({
          modulo: 'condominios',
          tipo: 'EDITAL',
          organizacaoId: unidadeId || null,
          referencia: {
            entidade: 'assembleia',
            entidadeId: id,
            numero: String(doc?.numero || '').trim() || undefined
          },
          titulo: String(doc?.titulo || '').trim() ? `Edital de Convocação — ${String(doc.titulo).trim()}` : 'Edital de Convocação',
          emitidoEm: new Date(),
          emitidoPorUserId: (ctxUser?._id || ctxUser?.id || ctxUser?.userId || null),
          emitidoPorNomeSnapshot: String(ctxUser?.nome || ctxUser?.email || '').trim(),
          file,
          meta: {
            versaoLayout: 'edital_preview',
            ip: String(req.ip || '').trim(),
            userAgent: String(req.get('user-agent') || '').trim()
          }
        });

        // Preserva histórico do token anterior
        if (prevToken && prevToken !== emitido.token) {
          try { await DocumentosPort.substituir(prevToken, emitido.token); } catch { /* best-effort */ }
        }

        doc.editalDocumentoToken = emitido.token;
        await doc.save();

        return res.json({
          success: true,
          token: emitido.token,
          verificarUrl: `/verificar/${encodeURIComponent(String(emitido.token || ''))}`,
          status: String(emitido.status || 'VALIDO'),
          hashSha256Pdf: String(emitido.hashSha256Pdf || '')
        });
      } catch (e) {
        return next(e);
      }
    });
  } catch (e) {
    return next(e);
  }
});

// Administração > Assembleia (rota removida; manter por compatibilidade)
app.get('/administracao/assembleias', async (req, res) => {
  return res.redirect('/administracao/atas');
});

// Administração > Assembleia (singular)
app.get('/administracao/assembleia', async (req, res) => {
  return res.redirect('/administracao/atas');
});

// Execução de Assembleia (ambiente operacional)
// URL canônica (menu): /condominios/administracao/assembleia/execucao?id=<assembleiaId>
app.get('/administracao/assembleia/execucao', async (req, res) => {
  let ctxUser = getCtxUser(req);
  try {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('X-WDG-Asset-Version', String(res?.locals?.assetVersion || 'dev'));
    } catch { /* noop */ }

    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios/administracao/assembleia/execucao'));
      return res.redirect(`/gestor/login?next=${nextUrl}`);
    }

    const id = String(
      req.query.id
      || req.query.numero
      || req.query.assembleia_id
      || req.query.assembleiaId
      || ''
    ).trim();
    if (!id) {
      return res.render('condominios/assembleias/execution', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        assembleia: null,
        unidadeId: '',
        habitacoesDirectory: []
      });
    }

    // Aceita também o número (ex: ASM-2026-9964). Se vier algo que não é ObjectId,
    // tentamos resolver por CondAssembleia.numero e redirecionar para o _id.
    if (!mongoose.isValidObjectId(id)) {
      let resolved = null;
      try {
        const ok = await ensureMongoReady();
        if (ok) {
          const esc = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          resolved = await CondAssembleia.findOne({ numero: new RegExp(`^${esc(id)}$`, 'i') })
            .select('_id')
            .lean();
        }
      } catch { /* noop */ }

      if (resolved && resolved._id) {
        return res.redirect(`/condominios/administracao/assembleia/execucao?id=${encodeURIComponent(String(resolved._id))}`);
      }

      return res.render('condominios/assembleias/execution', {
        moduleLabel: 'Gestão de Condomínios',
        user: ctxUser,
        assembleia: null,
        unidadeId: '',
        habitacoesDirectory: [],
        resolveError: `Assembleia não encontrada para o identificador "${id}". Informe o ID (ObjectId) ou o número (ex: ASM-2026-XXXX).`
      });
    }

    // Best-effort: carregar dados mínimos da assembleia (para título/modalidade/link)
    let assembleia = null;
    try {
      const ok = await ensureMongoReady();
      // Observação: há legados usando campos diferentes para vínculo com condomínio (ex.: unidadeId).
      if (ok) assembleia = await CondAssembleia.findById(id).select('titulo modalidade local link data status hora1 hora2 horaUnica unidade_id unidadeId unidade').lean();
    } catch { /* noop */ }
    if (!assembleia) {
      // Não bloqueia a UI (página ainda pode carregar e a API pode responder depois)
      assembleia = { _id: id, titulo: '', modalidade: '', local: '', link: '', data: null, status: '' };
    }

    let resolvedUnidadeId = '';
    let habitacoesDirectory = [];

    // Nome do condomínio (Unidade) para exibição em "Dados da assembleia"
    try {
      const __normalizeId = (raw) => {
        try {
          if (!raw) return '';
          if (typeof raw === 'string') return raw.trim();
          if (typeof raw === 'object') {
            const inner = raw._id || raw.id || raw;
            return String(inner || '').trim();
          }
          return String(raw || '').trim();
        } catch {
          return '';
        }
      };

      let unidadeId = (() => {
        const a = assembleia || {};
        const u = a.unidade;
        const raw = (a.unidade_id && typeof a.unidade_id === 'object') ? (a.unidade_id._id || a.unidade_id.id || a.unidade_id) : a.unidade_id;
        const rawAlt = (a.unidadeId && typeof a.unidadeId === 'object') ? (a.unidadeId._id || a.unidadeId.id || a.unidadeId) : a.unidadeId;
        const direct = __normalizeId(raw || rawAlt || '');
        if (direct) return direct;
        if (u && typeof u === 'object') return __normalizeId(u._id || u.id || '');
        if (u) return __normalizeId(u);
        return '';
      })();

      // fallback: quando a assembleia não tem unidade_id, tenta pegar do documento de execução
      if (!unidadeId) {
        const execDoc = await CondAssembleiaExecution.findOne({ assembleia_id: id }).select('unidade_id').lean();
        const fromExec = __normalizeId(execDoc?.unidade_id?._id || execDoc?.unidade_id || '');
        if (fromExec) unidadeId = fromExec;
      }

      // fallback seguro: se o usuário não tem escopo global, o contexto dele é o condomínio corrente
      if (!unidadeId) {
        try {
          if (ctxUser && !userCanScopeAll(ctxUser)) {
            const fromCtx = __normalizeId(ctxUser?.unidade_id?._id || ctxUser?.unidade_id || ctxUser?.unidadeId?._id || ctxUser?.unidadeId || '');
            if (fromCtx) unidadeId = fromCtx;
          }
        } catch { /* noop */ }
      }

      resolvedUnidadeId = unidadeId;

      if (unidadeId && mongoose.isValidObjectId(unidadeId)) {
        const u = await unidadesReadRepoFromReq(req).findById(unidadeId, { select: 'nome razaoSocial codigo' });
        const nome = String(u?.nome || u?.razaoSocial || u?.codigo || '').trim();
        if (nome) assembleia = { ...assembleia, condominioNome: nome };
      }
    } catch { /* noop */ }

    // Diretório de habitações: SEM fetch no front. A lista vem da view, filtrada pelo condomínio.
    // Importante: se não conseguirmos montar a lista, enviamos [] para desativar mock/fallback.
    try {
      const ok = await ensureMongoReady();
      const unidadeId = String(resolvedUnidadeId || '').trim();
      if (ok && unidadeId && mongoose.isValidObjectId(unidadeId)) {
        const unitObjId = new mongoose.Types.ObjectId(unidadeId);
        const habDocs = await CondHabitacao.find({ unidade_id: unitObjId, ativa: { $ne: false } })
          .select('_id unidade_id bloco_id andar_id numero tipo fracao_ideal descricao proprietario_id')
          .populate({ path: 'bloco_id', select: 'nome', options: { lean: true } })
          .populate({ path: 'andar_id', select: 'nome', options: { lean: true } })
          .limit(6000)
          .lean();

        const habIds = (habDocs || []).map(h => h?._id).filter(Boolean);

        const moradoresDocs = habIds.length
          ? await CondMorador.find({ habitacao_id: { $in: habIds }, ativo: { $ne: false } })
            .select('_id nome habitacao_id email responsavel_email usuario_id cond_usuario_id')
            .limit(20000)
            .lean()
          : [];

        const moradoresByHab = new Map();
        (moradoresDocs || []).forEach((m) => {
          const hid = m?.habitacao_id ? String(m.habitacao_id) : '';
          if (!hid) return;
          if (!moradoresByHab.has(hid)) moradoresByHab.set(hid, []);
          const nome = String(m?.nome || '').trim();
          if (!nome) return;

          const email = String(m?.email || m?.responsavel_email || '').trim();
          const uid = (() => {
            try {
              const v = m?.usuario_id;
              if (!v) return '';
              if (typeof v === 'object') return String(v._id || v.id || v || '').trim();
              return String(v || '').trim();
            } catch { return ''; }
          })();
          const cuid = (() => {
            try {
              const v = m?.cond_usuario_id;
              if (!v) return '';
              if (typeof v === 'object') return String(v._id || v.id || v || '').trim();
              return String(v || '').trim();
            } catch { return ''; }
          })();

          // Importante: URL RELATIVA (sem slash inicial) para o front prefixar com /condominios.
          // O JS também tem fallback por e-mail (alt-src) se a foto falhar.
          const foto = cuid
            ? `api/usuarios/foto?id=${encodeURIComponent(cuid)}`
            : (uid
              ? `api/usuarios/foto?id=${encodeURIComponent(uid)}`
              : (email
                ? `api/usuarios/foto?email=${encodeURIComponent(String(email).toLowerCase().trim())}`
                : ''));

          moradoresByHab.get(hid).push({ id: String(m?._id || ''), nome, email, foto });
        });

        const propIds = Array.from(new Set((habDocs || [])
          .map(h => h?.proprietario_id)
          .filter(Boolean)
          .map(v => String(v))
          .filter(Boolean)));

        const propDocs = propIds.length
          ? await CondProprietario.find({ _id: { $in: propIds }, ativo: { $ne: false } })
            .select('_id nome')
            .limit(6000)
            .lean()
          : [];

        const propById = new Map((propDocs || []).map((p) => [String(p?._id || ''), p]));

        const condNome = String(assembleia?.condominioNome || '').trim();
        const buildLabel = ({ blocoNome, andarNome, tipo, numero, descricao }) => {
          const parts = [];
          const b = String(blocoNome || '').trim();
          const a = String(andarNome || '').trim();
          const t = String(tipo || '').trim();
          const n = String(numero || '').trim();
          const d = String(descricao || '').trim();
          if (b) parts.push(/^bloco\b/i.test(b) ? b : `Bloco ${b}`);
          if (a) parts.push(a);
          if (t) parts.push(n ? `${t} ${n}` : t);
          else if (n) parts.push(n);
          if (!parts.length && d) parts.push(d);
          return parts.join(' - ').trim();
        };

        habitacoesDirectory = (habDocs || [])
          .map((h) => {
            const id = h?._id ? String(h._id) : '';
            if (!id) return null;

            const blocoNome = String(h?.bloco_id?.nome || '').trim();
            const andarNome = String(h?.andar_id?.nome || '').trim();
            const tipo = String(h?.tipo || '').trim();
            const numero = String(h?.numero || '').trim();
            const descricao = String(h?.descricao || '').trim();

            let fr = h?.fracao_ideal;
            fr = (fr == null || fr === '') ? null : Number(fr);
            // `fracao_ideal` na Habitação é armazenada como percentual (0..100).
            // Mantemos também o percentual original para exibição (sem “cálculo” no campo).
            const fr01 = Number.isFinite(fr) ? (fr / 100) : null;

            const label = buildLabel({ blocoNome, andarNome, tipo, numero, descricao }) || `Habitação ${id}`;

            const propId = h?.proprietario_id ? String(h.proprietario_id) : '';
            const propDoc = propId ? propById.get(propId) : null;
            const proprietarios = (propDoc && String(propDoc?.nome || '').trim())
              ? [{ id: String(propDoc._id), nome: String(propDoc.nome).trim() }]
              : [];

            const moradores = moradoresByHab.get(id) || [];

            return {
              id,
              label,
              // Para cálculos internos (quórum etc.)
              fracaoIdeal: fr01,
              // Para exibição fiel ao cadastro (ex.: 0,5% / 0,2%)
              fracaoIdealPercent: Number.isFinite(fr) ? fr : null,
              // Campos para o formatter do picker (assembleia-execution.js)
              blocoNome,
              andarNome,
              tipo,
              numero,
              descricao,
              unidade_id: unidadeId,
              condominioNome: condNome,
              proprietarios,
              moradores
            };
          })
          .filter(Boolean);
      }
    } catch { /* noop */ }

    return res.render('condominios/assembleias/execution', {
      moduleLabel: 'Gestão de Condomínios',
      user: ctxUser,
      assembleia,
      habitacoesDirectory,
      unidadeId: String(resolvedUnidadeId || '').trim()
    });
  } catch (e) {
    console.error('[condominios][ui][assembleia-execucao] erro:', e);
    return res.status(500).type('text/plain; charset=utf-8').send('Falha ao carregar Execução da Assembleia.');
  }
});

// Atalho: /condominios/assembleias/:id/execucao -> canônica
app.get('/assembleias/:id/execucao', async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    return res.redirect(`/condominios/administracao/assembleia/execucao?id=${encodeURIComponent(id)}`);
  } catch {
    return res.redirect('/condominios/assembleias');
  }
});

// Administração > Dirigência
app.get('/administracao/dirigencia', async (req, res) => {
  const ctxUser = getCtxUser(req);
  // IMPORTANTE (Vercel/CDN): esta página injeta URLs versionadas de JS/CSS.
  // Se o HTML for cacheado, o cliente pode continuar referenciando assets antigos
  // e/ou flags de permissão desatualizadas (ex.: data-can-edit).
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('X-WDG-Asset-Version', String(res?.locals?.assetVersion || 'dev'));
  } catch { /* noop */ }
  const isDiretorByUnit = await (async () => {
    try {
      if (!ctxUser) return false;
      if (userCanScopeAll(ctxUser)) return true;
      const userId = (() => {
        const v = ctxUser?._id || ctxUser?.id || ctxUser?.userId || '';
        if (!v) return '';
        if (typeof v === 'object') return String(v._id || v.id || '').trim();
        return String(v).trim();
      })();
      if (!userId || !mongoose.isValidObjectId(userId)) return false;
      const existsDoc = await unidadesReadRepoFromReq(req).findOne(
        { diretor_usuario_id: new mongoose.Types.ObjectId(userId) },
        { select: '_id' }
      );
      return !!existsDoc;
    } catch {
      return false;
    }
  })();

  return res.render('dirigencia', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser,
    canEditDirigencia: !!(userCanScopeAll(ctxUser) || userIsDiretor(ctxUser) || isDiretorByUnit)
  });
});

// Administração > Atas
app.get('/administracao/atas', async (req, res) => {
  const ctxUser = getCtxUser(req);
  return res.render('atas', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser
  });
});

// Administração > Financeiro
app.get('/administracao/financeiro', async (req, res) => {
  const ctxUser = getCtxUser(req);
  return res.render('financeiro', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser
  });
});

// Administração > Enquetes
app.get('/administracao/enquetes', async (req, res) => {
  const ctxUser = getCtxUser(req);
  if (!ctxUser) {
    const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios'));
    return res.redirect(`/gestor/login?next=${nextUrl}`);
  }
  return res.render('enquetes', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser
  });
});

// Administração > Comunicados
app.get('/administracao/comunicados', async (req, res) => {
  const ctxUser = getCtxUser(req);
  if (!ctxUser) {
    const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/condominios'));
    return res.redirect(`/gestor/login?next=${nextUrl}`);
  }
  return res.render('comunicados', {
    moduleLabel: 'Gestão de Condomínios',
    user: ctxUser
  });
});

// Administração > Caixa de Mensagem
app.get('/administracao/caixa-de-mensagem', async (req, res) => {
  const ctxUser = getCtxUser(req);

  if (!ctxUser) {
    const nextUrl = encodeURIComponent('/mensagens/dashboard');
    return res.redirect(`/gestor/login?next=${nextUrl}`);
  }

  return res.redirect(302, '/mensagens/dashboard');
});

function getCtxUser(req) {
  function isPortalRequestLocal(reqRef) {
    try {
      const hdr = (k) => {
        try {
          return reqRef?.headers?.[k] || reqRef?.headers?.[String(k || '').toLowerCase()] || null;
        } catch {
          return null;
        }
      };

      // Header explícito (proxy/cliente do Portal)
      if (String(hdr('x-wdg-portal') || '').trim() === '1') return true;

      // Heurística segura: chamadas iniciadas em páginas do Portal devem ter Referer COM PATH apontando para /portal-morador.
      // (Evita falso positivo quando "/portal-morador" aparece apenas em querystring.)
      const refRaw = String(hdr('referer') || '').trim();
      if (refRaw) {
        try {
          const u = new URL(refRaw);
          const p = String(u?.pathname || '').toLowerCase();
          if (p === '/portal-morador' || p.startsWith('/portal-morador/')) return true;
        } catch {
          // Fallback: procurar o path após o host, não na query
          const safe = /(^|:\/\/[^\/]+)\/portal-morador(\/|$)/i;
          if (safe.test(refRaw)) return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  try {
    const hdr = (k) => {
      try {
        return req?.headers?.[k] || req?.headers?.[String(k || '').toLowerCase()] || null;
      } catch {
        return null;
      }
    };

    const url = String(req?.originalUrl || req?.url || '');
    const isMsgApi = url.includes('/api/msg');
    const isPortalSharedApi = (
      isMsgApi ||
      url.includes('/api/unidades') ||
      url.includes('/api/usuarios/busca') ||
      url.includes('/api/usuarios/foto')
    );
    const fromPortal = isPortalRequestLocal(req);

    // Se a chamada veio do Portal, não podemos confiar em req.user/session.user
    // (pode estar preenchido com usuário do Gestor no mesmo navegador/sessão).
    // Também não podemos depender 100% do session store (em serverless pode ser MemoryStore e perder estado).
    // Segurança: se parece Portal e é uma API compartilhada, nunca use fallback de sessão do Gestor.
    if (fromPortal && isPortalSharedApi) {
      // Se o middleware do Portal já anexou usuário, prefira isso.
      // (Em alguns cenários o proxy interno reexecuta middlewares e a sessão pode ser re-hidratada sem portalUser.)
      const directPortalUser = req?.portalUser || null;
      if (directPortalUser) return directPortalUser;
      const sessionUser = req?.session?.portalUser || null;
      if (sessionUser) return sessionUser;
      // Fallback seguro: o proxy do Portal encaminha o cookie assinado wdg_portal.
      // Se existir payload válido, usamos a sessão embutida.
      try {
        const payload = readPortalSessionCookie(req);
        try {
          if (payload?.userId) req.__wdgPortalCookieUserId = String(payload.userId);
        } catch {
          /* noop */
        }
        const cookieSession = payload?.session || null;
        if (cookieSession && cookieSession.portal_acesso_ativo !== false) {
          return cookieSession;
        }
      } catch {
        /* noop */
      }

      // Último fallback (seguro): se req.user aparenta ser do Portal, aceite.
      // Evita "vazar" sessão do Gestor porque só entra aqui quando `x-wdg-portal=1`.
      try {
        const u = req?.user || null;
        const hasPortalMarkers = !!(
          u && (
            u.portal_acesso_ativo != null ||
            u.portal_needs_selection != null ||
            Array.isArray(u.portal_roles) ||
            Array.isArray(u.vinculos)
          )
        );
        if (hasPortalMarkers) return u;
      } catch { /* noop */ }
      return null;
    }

    if (req && req.user) return req.user;
  } catch {
    /* noop */
  }
  try {
    const hdr = (k) => {
      try {
        return req?.headers?.[k] || req?.headers?.[String(k || '').toLowerCase()] || null;
      } catch {
        return null;
      }
    };

    const url = String(req?.originalUrl || req?.url || '');
    const isMsgApi = url.includes('/api/msg');
    const fromPortal = isPortalRequestLocal(req);

    // REGRA DE SEGURANÇA: nunca misturar identidades entre Portal e Gestor.
    // Se a request parece Portal e é API de mensagens, NÃO caia em session.user.
    if (fromPortal && isMsgApi) {
      if (req?.session?.portalUser) return req.session.portalUser;
      try {
        const payload = readPortalSessionCookie(req);
        try {
          if (payload?.userId) req.__wdgPortalCookieUserId = String(payload.userId);
        } catch { /* noop */ }
        const cookieSession = payload?.session || null;
        if (cookieSession && cookieSession.portal_acesso_ativo !== false) return cookieSession;
      } catch { /* noop */ }
      return null;
    }

    if (req && req.session && req.session.user) return req.session.user;
    return null;
  } catch {
    return null;
  }
}

function userCanScopeAll(user) {
  try {
    const role = String(user?.role || '').trim().toLowerCase();
    return !!(user && (user.isMaster || role === 'master' || role === 'admin'));
  } catch {
    return false;
  }
}

function userIsDiretor(user) {
  try {
    const candidates = [];
    const push = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (s) candidates.push(s);
    };

    // Campos comuns
    push(user?.role);
    push(user?.perfil);
    push(user?.nivel);
    push(user?.nivel_acesso);
    push(user?.nivelAcesso);
    push(user?.nivel_de_acesso);
    push(user?.nivelDeAcesso);
    push(user?.acesso);
    push(user?.acesso_nivel);
    push(user?.acessoNivel);
    push(user?.tipo_acesso);
    push(user?.tipoAcesso);
    push(user?.tipo);
    push(user?.roleName);
    push(user?.perfilNome);
    push(user?.perfil_nome);

    // Arrays comuns
    const arrs = [user?.perfis, user?.permissoes, user?.perms, user?.roles];
    for (const a of arrs) {
      if (!Array.isArray(a)) continue;
      for (const it of a) push(it);
    }

    // Alguns contextos trazem perms como objeto
    if (user?.perms && typeof user.perms === 'object' && !Array.isArray(user.perms)) {
      for (const [k, v] of Object.entries(user.perms)) {
        if (v === true) push(k);
      }
    }

    // Fallback ultra-robusto: varrer strings/arrays de nível 1 do ctxUser.
    // (Evita depender de um nome de campo específico para "nível de acesso".)
    try {
      if (user && typeof user === 'object') {
        for (const v of Object.values(user)) {
          if (typeof v === 'string') push(v);
          else if (Array.isArray(v)) v.forEach(it => push(it));
        }
      }
    } catch { /* noop */ }

    return candidates.some(s => s === 'diretor' || s === 'director' || s.includes('diretor') || s.includes('director'));
  } catch {
    return false;
  }
}

// Diagnóstico (sem PII) para validar permissões em runtime.
app.get('/api/dirigencia/_debug/me', async (req, res) => {
  try {
    try { res.setHeader('Cache-Control', 'no-store'); } catch { /* noop */ }
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ success: false, error: 'Não autenticado' });

    const unitId = String(getUserUnidadeId(ctxUser) || '').trim();
    const targetUnitId = String(req.query?.unidade_id || req.query?.unidadeId || req.query?.unidade || unitId || '').trim();
    const canEditForTarget = targetUnitId && mongoose.isValidObjectId(targetUnitId)
      ? await userCanEditDirigenciaForUnidade(ctxUser, targetUnitId, unidadesReadRepoFromReq(req))
      : false;
    const snapshot = {
      role: String(ctxUser?.role || ''),
      perfil: String(ctxUser?.perfil || ''),
      nivel: String(ctxUser?.nivel || ''),
      nivel_acesso: String(ctxUser?.nivel_acesso || ''),
      nivelAcesso: String(ctxUser?.nivelAcesso || ''),
      unidadeId: unitId,
      targetUnidadeId: targetUnitId,
      isScopeAll: userCanScopeAll(ctxUser),
      isDiretor: userIsDiretor(ctxUser),
      canEditDirigenciaForUnidade: !!canEditForTarget
    };
    return res.json({ success: true, data: snapshot });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Falha no diagnóstico' });
  }
});

function userCanMsgAdminForUnidade(user, unidadeId) {
  try {
    if (!user) return false;
    if (userCanScopeAll(user)) return true;
    if (!userIsDiretor(user)) return false;
    const uid = String(getUserUnidadeId(user) || '').trim();
    const target = String(unidadeId || '').trim();
    if (!uid || !target) return false;
    // Defesa: diretor só pode operar na própria unidade.
    return uid === target;
  } catch {
    return false;
  }
}

function normalizeArrayStrings(list, max = 200) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const it of list) {
    if (out.length >= max) break;
    const v = String(it || '').trim();
    if (!v) continue;
    out.push(v);
  }
  return out;
}

function normalizeEmailList(list, max = 500) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  for (const it of raw) {
    if (out.length >= max) break;
    const em = String(it || '').trim().toLowerCase();
    if (!em) continue;
    if (!isEmailish(em)) continue;
    if (out.includes(em)) continue;
    out.push(em);
  }
  return out;
}

function ownerKeyBaseEmailLower(value) {
  try {
    let s = String(value || '').trim().toLowerCase();
    if (!s) return '';

    // Compat: alguns legados prefixavam a chave do usuário.
    // Ex.: "userkey:email@dominio.com" / "user:email@dominio.com".
    s = s
      .replace(/^userkey:\s*/i, '')
      .replace(/^user:\s*/i, '')
      .replace(/^email:\s*/i, '');

    const base = s.includes('::') ? (s.split('::')[0] || '') : s;
    return isEmailish(base) ? base : '';
  } catch {
    return '';
  }
}

function normalizeOwnerKeyList(list, max = 500) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  for (const it of raw) {
    if (out.length >= max) break;
    const v = String(it || '').trim().toLowerCase();
    if (!v) continue;
    const base = ownerKeyBaseEmailLower(v);
    if (!base) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

function sanitizeMsgSettingsPayload(body) {
  const b = body && typeof body === 'object' ? body : {};

  const rawPerms = (b.portal_user_perms ?? b.portalUserPerms ?? b.portalUserPermissions ?? b.permissoes_portal_usuarios ?? b.permissoesPortalUsuarios);
  const portal_user_perms = (() => {
    const list = Array.isArray(rawPerms) ? rawPerms : [];
    const out = [];
    const seen = new Set();
    for (const it of list) {
      if (out.length >= 3000) break;
      const o = (it && typeof it === 'object') ? it : {};
      const email = String(o.email || o.user || o.usuario || '').trim().toLowerCase();
      if (!isEmailish(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);

      // Defaults permissivos (true) quando não informado.
      const p2p = (o.permitir_pessoal_para_pessoal ?? o.p2p ?? o.pessoalParaPessoal);
      const toHab = (o.permitir_pessoal_para_habitacao ?? o.toHab ?? o.pessoalParaHabitacao);
      const toCol = (o.permitir_pessoal_para_colaborador ?? o.toColaborador ?? o.pessoalParaColaborador);

      out.push({
        email,
        permitir_pessoal_para_pessoal: (p2p === undefined || p2p === null) ? true : !!p2p,
        permitir_pessoal_para_habitacao: (toHab === undefined || toHab === null) ? true : !!toHab,
        permitir_pessoal_para_colaborador: (toCol === undefined || toCol === null) ? true : !!toCol
      });
    }
    return out;
  })();

  return {
    suspender_caixas_pessoais: !!(b.suspender_caixas_pessoais ?? b.suspenderCaixasPessoais ?? b.suspender_pessoais),
    suspender_caixas_grupo: !!(b.suspender_caixas_grupo ?? b.suspenderCaixasGrupo ?? b.suspender_grupos),
    permitir_pessoal_para_pessoal: (b.permitir_pessoal_para_pessoal ?? b.permitirPessoalParaPessoal ?? b.permitir_p2p ?? b.allowP2P),
    // Legado: lista única (Portal + Colaborador)
    pessoais_suspensas: normalizeOwnerKeyList(b.pessoais_suspensas ?? b.pessoaisSuspensas ?? b.suspensas ?? []),
    // Novo: listas separadas
    pessoais_suspensas_portal: normalizeOwnerKeyList(b.pessoais_suspensas_portal ?? b.pessoaisSuspensasPortal ?? b.suspensasPortal ?? []),
    pessoais_suspensas_colaborador: normalizeOwnerKeyList(b.pessoais_suspensas_colaborador ?? b.pessoaisSuspensasColaborador ?? b.suspensasColaborador ?? []),
    portal_user_perms
  };
}

function toSettingsClient(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const legacy = Array.isArray(d.pessoais_suspensas) ? d.pessoais_suspensas.slice() : [];
  const portal = Array.isArray(d.pessoais_suspensas_portal) ? d.pessoais_suspensas_portal.slice() : [];
  const colab = Array.isArray(d.pessoais_suspensas_colaborador) ? d.pessoais_suspensas_colaborador.slice() : [];
  const hasNew = (portal.length + colab.length) > 0;
  const effectivePortal = hasNew ? portal : legacy;
  const effectiveColab = hasNew ? colab : legacy;
  return {
    unidade_id: d.unidade_id ? String(d.unidade_id) : '',
    suspender_caixas_pessoais: !!d.suspender_caixas_pessoais,
    suspender_caixas_grupo: !!d.suspender_caixas_grupo,
    permitir_pessoal_para_pessoal: (d.permitir_pessoal_para_pessoal !== false),
    // Legado ainda é enviado para compatibilidade
    pessoais_suspensas: legacy,
    // Novo: listas separadas (UI nova usa isso)
    pessoais_suspensas_portal: effectivePortal,
    pessoais_suspensas_colaborador: effectiveColab,
    portal_user_perms: Array.isArray(d.portal_user_perms)
      ? d.portal_user_perms
        .map(p => ({
          email: String(p?.email || '').trim().toLowerCase(),
          permitir_pessoal_para_pessoal: (p?.permitir_pessoal_para_pessoal !== false),
          permitir_pessoal_para_habitacao: (p?.permitir_pessoal_para_habitacao !== false),
          permitir_pessoal_para_colaborador: (p?.permitir_pessoal_para_colaborador !== false)
        }))
        .filter(p => isEmailish(p.email))
      : []
  };
}

async function getOrInitMsgSettingsForUnidade(unidadeId) {
  const uid = String(unidadeId || '').trim();
  if (!uid || !mongoose.isValidObjectId(uid)) return null;
  const unitObjectId = new mongoose.Types.ObjectId(uid);

  const existing = await CondMsgSettings.findOne({ unidade_id: unitObjectId }).lean();
  if (existing) return existing;

  try {
    const created = await CondMsgSettings.create({ unidade_id: unitObjectId, permitir_pessoal_para_pessoal: true });
    return created?.toObject ? created.toObject() : created;
  } catch {
    return await CondMsgSettings.findOne({ unidade_id: unitObjectId }).lean();
  }
}

function bytesToHuman(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const digits = (i === 0) ? 0 : (v >= 100 ? 0 : (v >= 10 ? 1 : 2));
  return `${v.toFixed(digits)} ${units[i]}`;
}

function parseDateRange(query) {
  const q = query && typeof query === 'object' ? query : {};
  const now = new Date();
  const fromRaw = String(q.from || q.de || '').trim();
  const toRaw = String(q.to || q.ate || '').trim();
  let to = toRaw ? new Date(toRaw) : now;
  if (!isFinite(to.getTime())) to = now;
  let from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (!isFinite(from.getTime())) from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from > to) {
    const tmp = from; from = to; to = tmp;
  }
  const maxSpan = 365 * 24 * 60 * 60 * 1000;
  if ((to.getTime() - from.getTime()) > maxSpan) {
    from = new Date(to.getTime() - maxSpan);
  }
  return { from, to };
}

function parseRestricoes(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    excluirHabitacaoIds: normalizeArrayStrings(r.excluirHabitacaoIds, 200),
    excluirMoradorIds: normalizeArrayStrings(r.excluirMoradorIds, 200),
    excluirMoradorCpfs: normalizeArrayStrings(r.excluirMoradorCpfs, 200).map(s => s.replace(/\D/g, '')).filter(s => s.length >= 5),
    excluirMoradorEmails: normalizeArrayStrings(r.excluirMoradorEmails, 200).map(s => s.toLowerCase()),
    naoExibirHabDesabitadas: !!r.naoExibirHabDesabitadas,
    apenasResponsavelHabitacao: !!r.apenasResponsavelHabitacao,
    apenasProprietario: !!r.apenasProprietario
  };
}

function normalizeFotoUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > 800) return '';
  return s;
}

function parseOpcoes(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const tmp = [];
  for (const it of list) {
    if (tmp.length >= 12) break;
    if (!it) continue;
    if (typeof it === 'string') {
      const t = String(it || '').trim();
      if (!t) continue;
      tmp.push({ texto: t });
      continue;
    }
    if (typeof it === 'object') {
      const t = String(it.texto || it.value || '').trim();
      if (!t) continue;
      const foto = normalizeFotoUrl(it.foto);
      tmp.push({ texto: t, foto: foto || '' });
    }
  }

  // de-dup case-insensitive (mantém primeira)
  const seen = new Set();
  const out = [];
  for (const o of tmp) {
    const k = String(o?.texto || '').trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ texto: String(o.texto || '').trim(), foto: normalizeFotoUrl(o.foto) || '' });
  }
  return out;
}

function calcStatus(enq, now = new Date()) {
  try {
    if (!enq) return '';
    if (enq.finalizadaEm) return 'finalizada';
    const ini = enq.vigencia_inicio ? new Date(enq.vigencia_inicio) : null;
    const fim = enq.vigencia_fim ? new Date(enq.vigencia_fim) : null;
    if (ini && now < ini) return 'agendada';
    if (fim && now > fim) return 'encerrada';
    return 'ativa';
  } catch {
    return '';
  }
}

function calcComunicadoStatus(c, now = new Date()) {
  try {
    if (!c) return '';
    const ini = c.vigencia_inicio ? new Date(c.vigencia_inicio) : null;
    const fim = c.vigencia_fim ? new Date(c.vigencia_fim) : null;
    if (ini && now < ini) return 'agendada';
    if (fim && now > fim) return 'encerrada';
    return 'ativa';
  } catch {
    return '';
  }
}

// Upload de imagens (data URL base64) para uso nas enquetes
// Observação: data URL base64 expande o tamanho do payload; o limite do JSON precisa ser maior,
// mas o tamanho efetivo do arquivo (bytes) continua limitado em ~2MB.
app.post('/api/enquetes/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const user = getCtxUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    const scopeAll = userCanScopeAll(user);
    const userUnidadeId = getUserUnidadeId(user);
    const unidadeIdBody = String(req.body?.unidade_id || '').trim();
    const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
    if (!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    const foto = String(req.body?.foto || req.body?.dataUrl || '').trim();
    if (!foto || !foto.startsWith('data:')) return res.status(400).json({ error: 'Imagem inválida (envie data URL base64)' });
    // guarda adicional para evitar payloads gigantes; o limite real é pelo tamanho do Buffer (bytes)
    if (foto.length > 12_000_000) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });

    const match = /^data:(.+?);base64,(.+)$/.exec(foto);
    if (!match) return res.status(400).json({ error: 'Formato de imagem inválido (esperado data URL base64)' });
    const mime = match[1];
    const b64 = match[2];
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
    const buf = Buffer.from(b64, 'base64');
    const maxBytes = 2 * 1024 * 1024;
    if (!buf || !buf.length) return res.status(400).json({ error: 'Imagem inválida' });
    if (buf.length > maxBytes) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });

    const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
    const ext = extMap[mime] || 'bin';
    const fileName = `enquetes/${String(unidadeId)}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';

    const inVercel = !!process.env.VERCEL;
    if (inVercel || blobToken) {
      const uploaded = await put(fileName, buf, {
        access: 'public',
        contentType: mime,
        cacheControl: 'public, max-age=31536000, immutable',
        ...(blobToken ? { token: blobToken } : {})
      });
      return res.json({ ok: true, url: uploaded.url });
    }

    // Fallback local (dev): salva em public/uploads e serve via /uploads
    const rel = fileName.replace(/^enquetes\//, 'enquetes/');
    const absDir = path.join(ROOT, 'public', 'uploads', path.dirname(rel));
    await fs.promises.mkdir(absDir, { recursive: true });
    const abs = path.join(ROOT, 'public', 'uploads', rel);
    await fs.promises.writeFile(abs, buf);
    return res.json({ ok: true, url: `/uploads/${rel.replace(/\\/g, '/')}` });
  } catch (err) {
    console.error('[condominios][api/enquetes/upload] erro:', err);
    return res.status(500).json({ error: 'Falha ao enviar imagem' });
  }
});

// Upload de imagens (data URL base64) para uso nos comunicados
app.post('/api/comunicados/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const user = getCtxUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    const scopeAll = userCanScopeAll(user);
    const userUnidadeId = getUserUnidadeId(user);
    const unidadeIdBody = String(req.body?.unidade_id || '').trim();
    const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
    if (!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    const foto = String(req.body?.foto || req.body?.dataUrl || '').trim();
    if (!foto || !foto.startsWith('data:')) return res.status(400).json({ error: 'Imagem inválida (envie data URL base64)' });
    if (foto.length > 12_000_000) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });

    const match = /^data:(.+?);base64,(.+)$/.exec(foto);
    if (!match) return res.status(400).json({ error: 'Formato de imagem inválido (esperado data URL base64)' });
    const mime = match[1];
    const b64 = match[2];
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Tipo de imagem não suportado' });
    const buf = Buffer.from(b64, 'base64');
    const maxBytes = 2 * 1024 * 1024;
    if (!buf || !buf.length) return res.status(400).json({ error: 'Imagem inválida' });
    if (buf.length > maxBytes) return res.status(413).json({ error: 'Imagem muito grande (limite ~2MB)' });

    const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
    const ext = extMap[mime] || 'bin';
    const fileName = `comunicados/${String(unidadeId)}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';

    const inVercel = !!process.env.VERCEL;
    if (inVercel || blobToken) {
      const uploaded = await put(fileName, buf, {
        access: 'public',
        contentType: mime,
        cacheControl: 'public, max-age=31536000, immutable',
        ...(blobToken ? { token: blobToken } : {})
      });
      return res.json({ ok: true, url: uploaded.url });
    }

    const rel = fileName.replace(/^comunicados\//, 'comunicados/');
    const absDir = path.join(ROOT, 'public', 'uploads', path.dirname(rel));
    await fs.promises.mkdir(absDir, { recursive: true });
    const abs = path.join(ROOT, 'public', 'uploads', rel);
    await fs.promises.writeFile(abs, buf);
    return res.json({ ok: true, url: `/uploads/${rel.replace(/\\/g, '/')}` });
  } catch (err) {
    console.error('[condominios][api/comunicados/upload] erro:', err);
    return res.status(500).json({ error: 'Falha ao enviar imagem' });
  }
});

function resolveComunicadoRestricaoHabitacoesScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, unidadeId };
}

async function readComunicadoRestricaoHabitacoesMainList({ unidadeId }) {
  return CondHabitacao.find({ unidade_id: unidadeId })
    .select('_id bloco_id andar_id numero tipo')
    .sort({ numero: 1 })
    .limit(5000)
    .lean();
}

async function readComunicadoRestricaoHabitacoesSupportData({ req, unidadeId, habs }) {
  const unidadeDocPromise = unidadesReadRepoFromReq(req).findById(unidadeId, { select: 'nome' });
  const blocoIds = [...new Set((habs || []).map(h => h?.bloco_id).filter(Boolean))];
  const andarIds = [...new Set((habs || []).map(h => h?.andar_id).filter(Boolean))];

  const [unidadeDoc, blocos, andares] = await Promise.all([
    unidadeDocPromise,
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
  ]);

  return {
    condominioNome: String(unidadeDoc?.nome || '').trim(),
    blocoMap: new Map((blocos || []).map(b => [String(b._id), String(b.nome || '').trim()])),
    andarMap: new Map((andares || []).map(a => [String(a._id), String(a.nome || '').trim()]))
  };
}

function buildComunicadoRestricaoHabitacoesResponse({ habs, condominioNome, blocoMap, andarMap }) {
  const formatBloco = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return /^bloco\b/i.test(s) ? s : `Bloco ${s}`;
  };
  const formatTipo = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const data = (Array.isArray(habs) ? habs : []).map(h => {
    const blocoNome = h?.bloco_id ? (blocoMap.get(String(h.bloco_id)) || '') : '';
    const andarNome = h?.andar_id ? (andarMap.get(String(h.andar_id)) || '') : '';
    const num = String(h?.numero || '').trim();
    const tipo = formatTipo(h?.tipo);
    const blocoPart = formatBloco(blocoNome);
    const tipoNum = (tipo && num) ? `${tipo} ${num}` : (tipo || (num ? `Hab ${num}` : ''));
    const parts = [blocoPart, andarNome, tipoNum].filter(Boolean);
    const label = parts.join(' - ') || (num ? `Hab ${num}` : 'Habitação');
    return {
      value: String(h._id),
      label,
      condominioNome,
      habitacao: {
        bloco: blocoPart,
        andar: andarNome,
        tipo,
        numero: num
      }
    };
  });

  return { ok: true, data };
}

function resolveComunicadoRestricaoMoradoresScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, unidadeId };
}

async function readComunicadoRestricaoMoradoresMainList({ unidadeId }) {
  return CondMorador.find({ unidade_id: unidadeId, ativo: { $ne: false } })
    .select('_id nome cpf email habitacao_id usuario_id cond_usuario_id')
    .sort({ nome: 1 })
    .limit(5000)
    .lean();
}

async function readComunicadoRestricaoMoradoresSupportData({ moradores }) {
  const habIds = [...new Set((moradores || []).map(m => m?.habitacao_id).filter(Boolean))];
  const habs = habIds.length
    ? await CondHabitacao.find({ _id: { $in: habIds } }).select('_id numero tipo bloco_id andar_id').lean()
    : [];

  const blocoIds = [...new Set((habs || []).map(h => h?.bloco_id).filter(Boolean))];
  const andarIds = [...new Set((habs || []).map(h => h?.andar_id).filter(Boolean))];
  const [blocos, andares] = await Promise.all([
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
  ]);

  return {
    habMap: new Map((habs || []).map(h => [String(h._id), h])),
    blocoMap: new Map((blocos || []).map(b => [String(b._id), String(b.nome || '').trim()])),
    andarMap: new Map((andares || []).map(a => [String(a._id), String(a.nome || '').trim()]))
  };
}

function buildComunicadoRestricaoMoradoresResponse({ moradores, habMap, blocoMap, andarMap }) {
  const formatBloco = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return /^bloco\b/i.test(s) ? s : `Bloco ${s}`;
  };
  const formatTipo = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const data = (Array.isArray(moradores) ? moradores : []).map(m => {
    const nome = String(m?.nome || '').trim() || 'Morador';
    const cpf = String(m?.cpf || '').trim();
    const email = String(m?.email || '').trim();
    const habDoc = m?.habitacao_id ? (habMap.get(String(m.habitacao_id)) || null) : null;
    const blocoNome = habDoc?.bloco_id ? (blocoMap.get(String(habDoc.bloco_id)) || '') : '';
    const andarNome = habDoc?.andar_id ? (andarMap.get(String(habDoc.andar_id)) || '') : '';
    const num = String(habDoc?.numero || '').trim();
    const tipo = formatTipo(habDoc?.tipo);
    const blocoPart = formatBloco(blocoNome);
    const tipoNum = (tipo && num) ? `${tipo} ${num}` : (tipo || (num ? `Hab ${num}` : ''));
    const habLbl = [blocoPart, andarNome, tipoNum].filter(Boolean).join(' - ');
    const label = [nome, habLbl].filter(Boolean).join(' - ');

    let fotoUrl = '';
    const uid = (m?.usuario_id && String(m.usuario_id).trim()) ? String(m.usuario_id).trim() : '';
    const cuid = (m?.cond_usuario_id && String(m.cond_usuario_id).trim()) ? String(m.cond_usuario_id).trim() : '';
    if (email) fotoUrl = `/api/usuarios/foto?email=${encodeURIComponent(String(email).toLowerCase().trim())}`;
    else if (cuid) fotoUrl = `/api/usuarios/foto?id=${encodeURIComponent(cuid)}`;
    else if (uid) fotoUrl = `/api/usuarios/foto?id=${encodeURIComponent(uid)}`;

    const value = email ? String(email).toLowerCase().trim() : (cpf ? String(cpf).replace(/\D/g, '') : String(m._id));
    return {
      value,
      label,
      fotoUrl,
      habitacao: {
        bloco: blocoPart,
        andar: andarNome,
        tipo,
        numero: num
      }
    };
  });

  return { ok: true, data };
}

// API: listas para restrições (UI de comunicados)
app.get('/api/comunicados/restricoes/habitacoes', async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoRestricaoHabitacoesScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const habs = await readComunicadoRestricaoHabitacoesMainList({ unidadeId: scopeResolution.unidadeId });
    const supportData = await readComunicadoRestricaoHabitacoesSupportData({
      req,
      unidadeId: scopeResolution.unidadeId,
      habs
    });

    return res.json(buildComunicadoRestricaoHabitacoesResponse({
      habs,
      condominioNome: supportData.condominioNome,
      blocoMap: supportData.blocoMap,
      andarMap: supportData.andarMap
    }));
  } catch (err) {
    console.error('[condominios][api/comunicados/restricoes/habitacoes] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar habitações' });
  }
});

app.get('/api/comunicados/restricoes/moradores', async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoRestricaoMoradoresScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const moradores = await readComunicadoRestricaoMoradoresMainList({ unidadeId: scopeResolution.unidadeId });
    const supportData = await readComunicadoRestricaoMoradoresSupportData({ moradores });

    return res.json(buildComunicadoRestricaoMoradoresResponse({
      moradores,
      habMap: supportData.habMap,
      blocoMap: supportData.blocoMap,
      andarMap: supportData.andarMap
    }));
  } catch (err) {
    console.error('[condominios][api/comunicados/restricoes/moradores] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar moradores' });
  }
});

// API: listar comunicados
function resolveComunicadoListScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  const pageRaw = String(req.query?.page || '1').trim();
  const limitRaw = String(req.query?.limit || req.query?.pageSize || '9').trim();
  let page = parseInt(pageRaw, 10);
  let pageSize = parseInt(limitRaw, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 9;
  if (pageSize > 9) pageSize = 9;

  return { unidadeId, page, pageSize };
}

async function readComunicadoListPage({ unidadeId, page, pageSize }) {
  const q = { unidade_id: unidadeId };
  const total = await CondComunicado.countDocuments(q);
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  const resolvedPage = totalPages && page > totalPages ? totalPages : page;
  const skip = totalPages ? ((resolvedPage - 1) * pageSize) : 0;
  const data = await CondComunicado.find(q)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean();

  return { data, page: resolvedPage, pageSize, total, totalPages };
}

function buildComunicadoListResponse({ data, page, pageSize, total, totalPages }) {
  const now = new Date();
  const out = (Array.isArray(data) ? data : []).map(d => ({
    ...d,
    statusCalc: calcComunicadoStatus(d, now)
  }));

  return { ok: true, data: out, page, pageSize, total, totalPages };
}

app.get('/api/comunicados', async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoListScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const listData = await readComunicadoListPage({
      unidadeId: scopeResolution.unidadeId,
      page: scopeResolution.page,
      pageSize: scopeResolution.pageSize
    });

    return res.json(buildComunicadoListResponse(listData));
  } catch (err) {
    console.error('[condominios][api/comunicados GET] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar comunicados' });
  }
});

// API: obter comunicado
function resolveComunicadoByIdScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function readComunicadoByIdMainDoc({ id, unidadeId }) {
  return CondComunicado.findOne({ _id: id, unidade_id: unidadeId }).lean();
}

function buildComunicadoByIdResponse({ doc }) {
  return { ok: true, data: { ...doc, statusCalc: calcComunicadoStatus(doc) } };
}

app.get('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoByIdScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const doc = await readComunicadoByIdMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!doc) return res.status(404).json({ error: 'Comunicado não encontrado' });
    return res.json(buildComunicadoByIdResponse({ doc }));
  } catch (err) {
    console.error('[condominios][api/comunicados/:id GET] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar comunicado' });
  }
});

// API: criar comunicado
app.post('/api/comunicados', express.json({ limit: '220kb' }), async (req, res) => {
  try {
    const user = getCtxUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const scopeAll = userCanScopeAll(user);
    const userUnidadeId = getUserUnidadeId(user);
    const unidadeIdBody = String(req.body?.unidade_id || '').trim();
    const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
    if (!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    const ini = new Date(String(req.body?.vigencia_inicio || ''));
    const fim = new Date(String(req.body?.vigencia_fim || ''));
    if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) return res.status(400).json({ error: 'Vigência inválida' });
    if (fim <= ini) return res.status(400).json({ error: 'A data final deve ser maior que a inicial' });
    const maxEnd = new Date(ini.getTime() + (10 * 24 * 60 * 60 * 1000) + (24 * 60 * 60 * 1000 - 1));
    if (fim.getTime() > maxEnd.getTime()) return res.status(400).json({ error: 'A vigência máxima do comunicado é de 10 dias' });

    const expiresAt = new Date(fim.getTime() + (30 * 24 * 60 * 60 * 1000));

    const mensagem = String(req.body?.mensagem || '').trim();
    if (!mensagem) return res.status(400).json({ error: 'Mensagem é obrigatória' });

    const assunto = String(req.body?.assunto || '').trim();
    if (assunto && assunto.length > 140) return res.status(400).json({ error: 'Assunto muito longo' });

    const foto = normalizeFotoUrl(req.body?.foto);
    const restricoes = parseRestricoes(req.body?.restricoes);

    const criadaPor = {
      userId: user?.id || user?._id || user?.cond_usuario_id || null,
      nome: String(user?.nome || '').trim()
    };

    const doc = await CondComunicado.create({
      unidade_id: unidadeId,
      vigencia_inicio: ini,
      vigencia_fim: fim,
      expiresAt,
      assunto,
      mensagem,
      foto,
      restricoes,
      criadaPor
    });

    let notified = null;
    try {
      const timeoutMs = Math.max(500, Number(process.env.PORTAL_PUSH_TIMEOUT_MS || 2500));
      const emails = await resolveEmailsUsuariosPortalDaUnidadeParaEnquete({ unidadeId, restricoes });
      const pushPromise = notifyComunicadoNovoPush({ emails, comunicadoId: String(doc._id), unidadeId });
      notified = await Promise.race([
        pushPromise,
        new Promise((resolve) => {
          const t = setTimeout(() => resolve({ ok: false, queued: true, reason: 'timeout' }), timeoutMs);
          if (typeof t?.unref === 'function') t.unref();
        })
      ]);
    } catch (err) {
      console.warn('[condominios][api/comunicados POST] falha ao enviar push (comunicado-novo):', err?.message || err);
      notified = { ok: false, reason: 'push-error' };
    }

    return res.json({ ok: true, data: { _id: String(doc._id) }, notified });
  } catch (err) {
    console.error('[condominios][api/comunicados POST] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao criar comunicado' });
  }
});

// API: editar comunicado
function resolveComunicadoUpdateScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeIdBody = String(req.body?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function readComunicadoUpdateMainDoc({ id, unidadeId }) {
  return CondComunicado.findOne({ _id: id, unidade_id: unidadeId });
}

function validateAndNormalizeComunicadoUpdatePayload({ body }) {
  const ini = new Date(String(body?.vigencia_inicio || ''));
  const fim = new Date(String(body?.vigencia_fim || ''));
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) {
    return { error: { status: 400, body: { error: 'Vigência inválida' } } };
  }
  if (fim <= ini) {
    return { error: { status: 400, body: { error: 'A data final deve ser maior que a inicial' } } };
  }
  const maxEnd = new Date(ini.getTime() + (10 * 24 * 60 * 60 * 1000) + (24 * 60 * 60 * 1000 - 1));
  if (fim.getTime() > maxEnd.getTime()) {
    return { error: { status: 400, body: { error: 'A vigência máxima do comunicado é de 10 dias' } } };
  }

  const mensagem = String(body?.mensagem || '').trim();
  if (!mensagem) {
    return { error: { status: 400, body: { error: 'Mensagem é obrigatória' } } };
  }

  const assunto = String(body?.assunto || '').trim();
  if (assunto && assunto.length > 140) {
    return { error: { status: 400, body: { error: 'Assunto muito longo' } } };
  }

  return {
    ini,
    fim,
    expiresAt: new Date(fim.getTime() + (30 * 24 * 60 * 60 * 1000)),
    assunto,
    mensagem,
    foto: normalizeFotoUrl(body?.foto),
    restricoes: parseRestricoes(body?.restricoes)
  };
}

function buildComunicadoUpdateResponse() {
  return { ok: true };
}

app.put('/api/comunicados/:id([0-9a-fA-F]{24})', express.json({ limit: '220kb' }), async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoUpdateScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const doc = await readComunicadoUpdateMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!doc) return res.status(404).json({ error: 'Comunicado não encontrado' });

    const payload = validateAndNormalizeComunicadoUpdatePayload({ body: req.body });
    if (payload.error) {
      return res.status(payload.error.status).json(payload.error.body);
    }

    doc.vigencia_inicio = payload.ini;
    doc.vigencia_fim = payload.fim;
    doc.expiresAt = payload.expiresAt;
    doc.assunto = payload.assunto;
    doc.mensagem = payload.mensagem;
    doc.foto = payload.foto;
    doc.restricoes = payload.restricoes;
    await doc.save();

    return res.json(buildComunicadoUpdateResponse());
  } catch (err) {
    console.error('[condominios][api/comunicados PUT] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao editar comunicado' });
  }
});

// API: excluir comunicado
function resolveComunicadoDeleteScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function deleteComunicadoMainDoc({ id, unidadeId }) {
  return CondComunicado.deleteOne({ _id: id, unidade_id: unidadeId });
}

function buildComunicadoDeleteNotFoundResponse() {
  return { error: 'Comunicado não encontrado' };
}

function buildComunicadoDeleteResponse() {
  return { ok: true };
}

app.delete('/api/comunicados/:id([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const scopeResolution = resolveComunicadoDeleteScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const deletionResult = await deleteComunicadoMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!deletionResult?.deletedCount) {
      return res.status(404).json(buildComunicadoDeleteNotFoundResponse());
    }
    return res.json(buildComunicadoDeleteResponse());
  } catch (err) {
    console.error('[condominios][api/comunicados DELETE] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao excluir comunicado' });
  }
});

// API: listas para restrições (UI de enquetes)
function resolveEnqueteRestricaoHabitacoesScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, unidadeId };
}

async function readEnqueteRestricaoHabitacoesMainList({ unidadeId }) {
  return CondHabitacao.find({ unidade_id: unidadeId })
    .select('_id bloco_id andar_id numero tipo')
    .sort({ numero: 1 })
    .limit(5000)
    .lean();
}

async function readEnqueteRestricaoHabitacoesSupportData({ req, unidadeId, habs }) {
  const unidadeDocPromise = unidadesReadRepoFromReq(req).findById(unidadeId, { select: 'nome' });
  const blocoIds = [...new Set((habs || []).map(h => h?.bloco_id).filter(Boolean))];
  const andarIds = [...new Set((habs || []).map(h => h?.andar_id).filter(Boolean))];

  const [unidadeDoc, blocos, andares] = await Promise.all([
    unidadeDocPromise,
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
  ]);

  return {
    condominioNome: String(unidadeDoc?.nome || '').trim(),
    blocoMap: new Map((blocos || []).map(b => [String(b._id), String(b.nome || '').trim()])),
    andarMap: new Map((andares || []).map(a => [String(a._id), String(a.nome || '').trim()]))
  };
}

function buildEnqueteRestricaoHabitacoesResponse({ habs, condominioNome, blocoMap, andarMap }) {
  const formatBloco = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return /^bloco\b/i.test(s) ? s : `Bloco ${s}`;
  };
  const formatTipo = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const data = (Array.isArray(habs) ? habs : []).map(h => {
    const blocoNome = h?.bloco_id ? (blocoMap.get(String(h.bloco_id)) || '') : '';
    const andarNome = h?.andar_id ? (andarMap.get(String(h.andar_id)) || '') : '';
    const num = String(h?.numero || '').trim();
    const tipo = formatTipo(h?.tipo);
    const blocoPart = formatBloco(blocoNome);
    const tipoNum = (tipo && num) ? `${tipo} ${num}` : (tipo || (num ? `Hab ${num}` : ''));
    const parts = [blocoPart, andarNome, tipoNum].filter(Boolean);
    const label = parts.join(' - ') || (num ? `Hab ${num}` : 'Habitação');
    return {
      value: String(h._id),
      label,
      condominioNome,
      habitacao: {
        bloco: blocoPart,
        andar: andarNome,
        tipo,
        numero: num
      }
    };
  });

  return { ok: true, data };
}

function resolveEnqueteRestricaoMoradoresScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, unidadeId };
}

async function readEnqueteRestricaoMoradoresMainList({ unidadeId }) {
  return CondMorador.find({ unidade_id: unidadeId, ativo: { $ne: false } })
    .select('_id nome cpf email habitacao_id usuario_id cond_usuario_id')
    .sort({ nome: 1 })
    .limit(5000)
    .lean();
}

async function readEnqueteRestricaoMoradoresSupportData({ moradores }) {
  const habIds = [...new Set((moradores || []).map(m => m?.habitacao_id).filter(Boolean))];
  const habs = habIds.length
    ? await CondHabitacao.find({ _id: { $in: habIds } }).select('_id numero tipo bloco_id andar_id').lean()
    : [];

  const blocoIds = [...new Set((habs || []).map(h => h?.bloco_id).filter(Boolean))];
  const andarIds = [...new Set((habs || []).map(h => h?.andar_id).filter(Boolean))];
  const [blocos, andares] = await Promise.all([
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean() : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean() : []
  ]);

  return {
    habMap: new Map((habs || []).map(h => [String(h._id), h])),
    blocoMap: new Map((blocos || []).map(b => [String(b._id), String(b.nome || '').trim()])),
    andarMap: new Map((andares || []).map(a => [String(a._id), String(a.nome || '').trim()]))
  };
}

function buildEnqueteRestricaoMoradoresResponse({ moradores, habMap, blocoMap, andarMap }) {
  const formatBloco = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return /^bloco\b/i.test(s) ? s : `Bloco ${s}`;
  };
  const formatTipo = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const data = (Array.isArray(moradores) ? moradores : []).map(m => {
    const nome = String(m?.nome || '').trim() || 'Morador';
    const cpf = String(m?.cpf || '').trim();
    const email = String(m?.email || '').trim();
    const habDoc = m?.habitacao_id ? (habMap.get(String(m.habitacao_id)) || null) : null;
    const blocoNome = habDoc?.bloco_id ? (blocoMap.get(String(habDoc.bloco_id)) || '') : '';
    const andarNome = habDoc?.andar_id ? (andarMap.get(String(habDoc.andar_id)) || '') : '';
    const num = String(habDoc?.numero || '').trim();
    const tipo = formatTipo(habDoc?.tipo);
    const blocoPart = formatBloco(blocoNome);
    const tipoNum = (tipo && num) ? `${tipo} ${num}` : (tipo || (num ? `Hab ${num}` : ''));
    const habLbl = [blocoPart, andarNome, tipoNum].filter(Boolean).join(' - ');
    const label = [nome, habLbl].filter(Boolean).join(' - ');

    let fotoUrl = '';
    const uid = (m?.usuario_id && String(m.usuario_id).trim()) ? String(m.usuario_id).trim() : '';
    const cuid = (m?.cond_usuario_id && String(m.cond_usuario_id).trim()) ? String(m.cond_usuario_id).trim() : '';
    if (email) fotoUrl = `/api/usuarios/foto?email=${encodeURIComponent(String(email).toLowerCase().trim())}`;
    else if (cuid) fotoUrl = `/api/usuarios/foto?id=${encodeURIComponent(cuid)}`;
    else if (uid) fotoUrl = `/api/usuarios/foto?id=${encodeURIComponent(uid)}`;

    const value = email ? String(email).toLowerCase().trim() : (cpf ? String(cpf).replace(/\D/g, '') : String(m._id));
    return {
      value,
      label,
      fotoUrl,
      habitacao: {
        bloco: blocoPart,
        andar: andarNome,
        tipo,
        numero: num
      }
    };
  });

  return { ok: true, data };
}

app.get('/api/enquetes/restricoes/habitacoes', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteRestricaoHabitacoesScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const habs = await readEnqueteRestricaoHabitacoesMainList({ unidadeId: scopeResolution.unidadeId });
    const supportData = await readEnqueteRestricaoHabitacoesSupportData({
      req,
      unidadeId: scopeResolution.unidadeId,
      habs
    });

    return res.json(buildEnqueteRestricaoHabitacoesResponse({
      habs,
      condominioNome: supportData.condominioNome,
      blocoMap: supportData.blocoMap,
      andarMap: supportData.andarMap
    }));
  } catch (err) {
    console.error('[condominios][api/enquetes/restricoes/habitacoes] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar habitações' });
  }
});

app.get('/api/enquetes/restricoes/moradores', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteRestricaoMoradoresScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }
    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const moradores = await readEnqueteRestricaoMoradoresMainList({ unidadeId: scopeResolution.unidadeId });
    const supportData = await readEnqueteRestricaoMoradoresSupportData({ moradores });

    return res.json(buildEnqueteRestricaoMoradoresResponse({
      moradores,
      habMap: supportData.habMap,
      blocoMap: supportData.blocoMap,
      andarMap: supportData.andarMap
    }));
  } catch (err) {
    console.error('[condominios][api/enquetes/restricoes/moradores] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar moradores' });
  }
});

// API: listar enquetes
function resolveEnqueteListScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const unidadeQ = String(req.query?.unidade_id || req.query?.unidade || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  const pageRaw = String(req.query?.page || '1').trim();
  const limitRaw = String(req.query?.limit || req.query?.pageSize || '9').trim();
  let page = parseInt(pageRaw, 10);
  let pageSize = parseInt(limitRaw, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 9;
  if (pageSize > 9) pageSize = 9;

  return { user, unidadeId, page, pageSize };
}

async function readEnqueteListPage({ unidadeId, page, pageSize }) {
  const q = { unidade_id: unidadeId };
  const total = await CondEnquete.countDocuments(q);
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  const safePage = totalPages && page > totalPages ? totalPages : page;
  const skip = totalPages ? ((safePage - 1) * pageSize) : 0;
  const data = await CondEnquete.find(q)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean();

  return { data, total, totalPages, page: safePage, pageSize };
}

function buildEnqueteListResponse({ data, page, pageSize, total, totalPages }) {
  const now = new Date();
  const out = (Array.isArray(data) ? data : []).map(d => ({
    ...d,
    statusCalc: calcStatus(d, now)
  }));

  return { ok: true, data: out, page, pageSize, total, totalPages };
}

app.get('/api/enquetes', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteListScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const listData = await readEnqueteListPage({
      unidadeId: scopeResolution.unidadeId,
      page: scopeResolution.page,
      pageSize: scopeResolution.pageSize
    });

    return res.json(buildEnqueteListResponse(listData));
  } catch (err) {
    console.error('[condominios][api/enquetes GET] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar enquetes' });
  }
});

// API: obter enquete
function resolveEnqueteByIdScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function readEnqueteByIdMainDoc({ id, unidadeId }) {
  return CondEnquete.findOne({ _id: id, unidade_id: unidadeId }).lean();
}

function buildEnqueteByIdResponse({ doc }) {
  return { ok: true, data: { ...doc, statusCalc: calcStatus(doc) } };
}

app.get('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteByIdScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const doc = await readEnqueteByIdMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!doc) return res.status(404).json({ error: 'Enquete não encontrada' });
    return res.json(buildEnqueteByIdResponse({ doc }));
  } catch (err) {
    console.error('[condominios][api/enquetes/:id GET] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar enquete' });
  }
});

// API: criar enquete
app.post('/api/enquetes', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const user = getCtxUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const scopeAll = userCanScopeAll(user);
    const userUnidadeId = getUserUnidadeId(user);
    const unidadeIdBody = String(req.body?.unidade_id || '').trim();
    const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
    if (!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    const ini = new Date(String(req.body?.vigencia_inicio || ''));
    const fim = new Date(String(req.body?.vigencia_fim || ''));
    if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) return res.status(400).json({ error: 'Vigência inválida' });
    if (fim <= ini) return res.status(400).json({ error: 'A data final deve ser maior que a inicial' });

    const pergunta = String(req.body?.pergunta || '').trim();
    if (!pergunta) return res.status(400).json({ error: 'Pergunta é obrigatória' });

    const foto_pergunta = normalizeFotoUrl(req.body?.foto_pergunta || req.body?.fotoPergunta);

    const opcoesIn = Array.isArray(req.body?.opcoes) ? req.body.opcoes : [];
    const opcoes = parseOpcoes(opcoesIn);
    if (opcoes.length < 2) return res.status(400).json({ error: 'Informe pelo menos 2 opções' });

    const restricoes = parseRestricoes(req.body?.restricoes);

    const criadaPor = {
      userId: user?.id || user?._id || user?.cond_usuario_id || null,
      nome: String(user?.nome || '').trim()
    };

    const doc = await CondEnquete.create({
      unidade_id: unidadeId,
      vigencia_inicio: ini,
      vigencia_fim: fim,
      pergunta,
      foto_pergunta,
      opcoes,
      restricoes,
      criadaPor
    });

    let notified = null;
    try{
      const timeoutMs = Math.max(500, Number(process.env.PORTAL_PUSH_TIMEOUT_MS || 2500));
      const emails = await resolveEmailsUsuariosPortalDaUnidadeParaEnquete({ unidadeId, restricoes });
      const pushPromise = notifyEnqueteNovaPush({ emails, enqueteId: String(doc._id), unidadeId });
      notified = await Promise.race([
        pushPromise,
        new Promise((resolve) => {
          const t = setTimeout(() => resolve({ ok: false, queued: true, reason: 'timeout' }), timeoutMs);
          if (typeof t?.unref === 'function') t.unref();
        })
      ]);
    } catch(err){
      console.warn('[condominios][api/enquetes POST] falha ao enviar push (enquete-nova):', err?.message || err);
      notified = { ok: false, reason: 'push-error' };
    }

    return res.json({ ok: true, data: { _id: String(doc._id) }, notified });
  } catch (err) {
    console.error('[condominios][api/enquetes POST] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao criar enquete' });
  }
});

// API: editar enquete (antes de encerrar/finalizar)
function resolveEnqueteUpdateScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeIdBody = String(req.body?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeIdBody || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function readEnqueteUpdateMainDoc({ id, unidadeId }) {
  return CondEnquete.findOne({ _id: id, unidade_id: unidadeId });
}

function validateAndNormalizeEnqueteUpdatePayload({ body }) {
  const ini = new Date(String(body?.vigencia_inicio || ''));
  const fim = new Date(String(body?.vigencia_fim || ''));
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) {
    return { error: { status: 400, body: { error: 'Vigência inválida' } } };
  }
  if (fim <= ini) {
    return { error: { status: 400, body: { error: 'A data final deve ser maior que a inicial' } } };
  }

  const pergunta = String(body?.pergunta || '').trim();
  if (!pergunta) {
    return { error: { status: 400, body: { error: 'Pergunta é obrigatória' } } };
  }

  const opcoesIn = Array.isArray(body?.opcoes) ? body.opcoes : [];
  const opcoes = parseOpcoes(opcoesIn);
  if (opcoes.length < 2) {
    return { error: { status: 400, body: { error: 'Informe pelo menos 2 opções' } } };
  }

  return {
    ini,
    fim,
    pergunta,
    foto_pergunta: normalizeFotoUrl(body?.foto_pergunta || body?.fotoPergunta),
    opcoes,
    restricoes: parseRestricoes(body?.restricoes)
  };
}

function buildEnqueteUpdateResponse() {
  return { ok: true };
}

app.put('/api/enquetes/:id([0-9a-fA-F]{24})', express.json({ limit: '200kb' }), async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteUpdateScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const doc = await readEnqueteUpdateMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!doc) return res.status(404).json({ error: 'Enquete não encontrada' });
    if (doc.finalizadaEm) return res.status(400).json({ error: 'Enquete já finalizada' });

    const now = new Date();
    const st = calcStatus(doc, now);
    if (st === 'encerrada') return res.status(400).json({ error: 'Enquete já encerrada (vigência expirada)' });

    const payload = validateAndNormalizeEnqueteUpdatePayload({ body: req.body });
    if (payload.error) {
      return res.status(payload.error.status).json(payload.error.body);
    }

    doc.vigencia_inicio = payload.ini;
    doc.vigencia_fim = payload.fim;
    doc.pergunta = payload.pergunta;
    doc.foto_pergunta = payload.foto_pergunta;
    doc.opcoes = payload.opcoes;
    doc.restricoes = payload.restricoes;

    await doc.save();
    return res.json(buildEnqueteUpdateResponse());
  } catch (err) {
    console.error('[condominios][api/enquetes PUT] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao editar enquete' });
  }
});

// API: finalizar enquete antecipadamente
function resolveEnqueteFinalizeScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, id, unidadeId };
}

async function readEnqueteFinalizeMainDoc({ id, unidadeId }) {
  return CondEnquete.findOne({ _id: id, unidade_id: unidadeId });
}

function applyEnqueteFinalizeMutation({ doc, user }) {
  if (doc.finalizadaEm) {
    return;
  }

  doc.finalizadaEm = new Date();
  doc.finalizadaPor = {
    userId: user?.id || user?._id || user?.cond_usuario_id || null,
    nome: String(user?.nome || '').trim()
  };
}

function buildEnqueteFinalizeResponse() {
  return { ok: true };
}

app.post('/api/enquetes/:id([0-9a-fA-F]{24})/finalizar', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteFinalizeScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const doc = await readEnqueteFinalizeMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!doc) return res.status(404).json({ error: 'Enquete não encontrada' });
    if (doc.finalizadaEm) return res.json(buildEnqueteFinalizeResponse());

    applyEnqueteFinalizeMutation({ doc, user: scopeResolution.user });
    await doc.save();
    return res.json(buildEnqueteFinalizeResponse());
  } catch (err) {
    console.error('[condominios][api/enquetes finalizar] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao finalizar enquete' });
  }
});

// API: excluir enquete (remove também votos)
function resolveEnqueteDeleteScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { id, unidadeId };
}

async function deleteEnqueteDependentVotes({ id, unidadeId }) {
  return CondEnqueteVoto.deleteMany({ enquete_id: id, unidade_id: unidadeId });
}

async function deleteEnqueteMainDoc({ id, unidadeId }) {
  return CondEnquete.deleteOne({ _id: id, unidade_id: unidadeId });
}

function buildEnqueteDeleteResponse() {
  return { ok: true };
}

app.delete('/api/enquetes/:id([0-9a-fA-F]{24})', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteDeleteScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    await deleteEnqueteDependentVotes({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    await deleteEnqueteMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    return res.json(buildEnqueteDeleteResponse());
  } catch (err) {
    console.error('[condominios][api/enquetes DELETE] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao excluir enquete' });
  }
});

// API: detalhes + estatísticas e votantes por alternativa
function resolveEnqueteDetalhesScope({ req }) {
  const user = getCtxUser(req);
  if (!user) {
    return { error: { status: 401, body: { error: 'Não autenticado' } } };
  }

  const scopeAll = userCanScopeAll(user);
  const userUnidadeId = getUserUnidadeId(user);
  const id = String(req.params.id || '').trim();
  if (!id) {
    return { error: { status: 400, body: { error: 'ID inválido' } } };
  }

  const unidadeQ = String(req.query?.unidade_id || '').trim();
  const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
  if (!unidadeId) {
    return { error: { status: 400, body: { error: 'Unidade inválida' } } };
  }

  return { user, id, unidadeId };
}

async function readEnqueteDetalhesMainDoc({ id, unidadeId }) {
  return CondEnquete.findOne({ _id: id, unidade_id: unidadeId }).lean();
}

async function readEnqueteDetalhesVotes({ id, unidadeId }) {
  return CondEnqueteVoto.find({ enquete_id: id, unidade_id: unidadeId })
    .sort({ createdAt: 1 })
    .lean();
}

function buildEnqueteDetalhesResponse({ enq, votos }) {
  const totalVotos = Array.isArray(votos) ? votos.length : 0;
  const opcoes = Array.isArray(enq?.opcoes) ? enq.opcoes : [];

  const byOpt = new Map();
  for (const o of opcoes) {
    byOpt.set(String(o._id), {
      opcaoId: String(o._id),
      texto: String(o.texto || ''),
      foto: normalizeFotoUrl(o.foto),
      votos: 0,
      percent: 0,
      votantes: []
    });
  }

  for (const v of (Array.isArray(votos) ? votos : [])) {
    const oid = String(v.opcao_id || '');
    if (!oid) continue;
    if (!byOpt.has(oid)) {
      byOpt.set(oid, { opcaoId: oid, texto: 'Opção', foto: '', votos: 0, percent: 0, votantes: [] });
    }
    const row = byOpt.get(oid);
    row.votos += 1;
    row.votantes.push({
      morador_nome: String(v.morador_nome || '').trim(),
      morador_email: String(v.morador_email || '').trim(),
      habitacao_label: String(v.habitacao_label || '').trim(),
      createdAt: v.createdAt
    });
  }

  const out = Array.from(byOpt.values()).map(o => ({
    ...o,
    percent: totalVotos ? (o.votos * 100) / totalVotos : 0
  }));

  return {
    ok: true,
    enquete: { ...enq, statusCalc: calcStatus(enq) },
    statusCalc: calcStatus(enq),
    totalVotos,
    opcoes: out
  };
}

app.get('/api/enquetes/:id([0-9a-fA-F]{24})/detalhes', async (req, res) => {
  try {
    const scopeResolution = resolveEnqueteDetalhesScope({ req });
    if (scopeResolution.error) {
      return res.status(scopeResolution.error.status).json(scopeResolution.error.body);
    }

    if (!(await ensureCondominiosMongoOnline(req, res))) return;

    const enq = await readEnqueteDetalhesMainDoc({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });
    if (!enq) return res.status(404).json({ error: 'Enquete não encontrada' });

    const votos = await readEnqueteDetalhesVotes({
      id: scopeResolution.id,
      unidadeId: scopeResolution.unidadeId
    });

    return res.json(buildEnqueteDetalhesResponse({ enq, votos }));
  } catch (err) {
    console.error('[condominios][api/enquetes detalhes] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar detalhes' });
  }
});

// API: relatório em PDF (apenas após vigência ou finalização)
app.get('/api/enquetes/:id([0-9a-fA-F]{24})/relatorio.pdf', async (req, res) => {
  try {
    const user = getCtxUser(req);
    if (!user) return res.status(401).end('Não autenticado');

    if (!(await ensureCondominiosMongoOnline(req, res))) return;
    const scopeAll = userCanScopeAll(user);
    const userUnidadeId = getUserUnidadeId(user);
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).end('ID inválido');

    const unidadeQ = String(req.query?.unidade_id || '').trim();
    const unidadeId = scopeAll ? (unidadeQ || userUnidadeId) : userUnidadeId;
    if (!unidadeId) return res.status(400).end('Unidade inválida');

    const enq = await CondEnquete.findOne({ _id: id, unidade_id: unidadeId }).lean();
    if (!enq) return res.status(404).end('Enquete não encontrada');

    const masterHeaderUnidadeDoc = scopeAll
      ? await unidadesReadRepoFromReq(req).findOne(
        { codigo: 'M0001' },
        { select: 'codigo nome cnpj logo tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal' }
      )
      : null;

    const unidadeDoc = masterHeaderUnidadeDoc || (await unidadesReadRepoFromReq(req).findById(
      unidadeId,
      { select: 'codigo nome cnpj logo tipoLogradouro logradouro numero complemento bairro cep cidade estado endereco telefoneFixo telefoneCelular emailPrincipal emailFiscal' }
    ));

    const now = new Date();
    const st = calcStatus(enq, now);
    if (!(st === 'encerrada' || st === 'finalizada')) {
      return res.status(400).end('Relatório disponível apenas após encerramento/finalização.');
    }

    const votos = await CondEnqueteVoto.find({ enquete_id: id, unidade_id: unidadeId })
      .sort({ createdAt: 1 })
      .lean();

    const totalVotos = Array.isArray(votos) ? votos.length : 0;
    const opcoes = Array.isArray(enq.opcoes) ? enq.opcoes : [];

    const countByOpt = new Map();
    for (const o of opcoes) countByOpt.set(String(o._id), 0);
    for (const v of (Array.isArray(votos) ? votos : [])) {
      const key = String(v.opcao_id || '');
      if (!key) continue;
      countByOpt.set(key, (countByOpt.get(key) || 0) + 1);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-enquete-' + String(id) + '.pdf"');

    const stripLeadingCodigo = (rawName, rawCode) => {
      let s = String(rawName || '').trim();
      if (!s) return '';
      const codigo = String(rawCode || '').trim();
      if (codigo) {
        try {
          const escCode = codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          s = s.replace(new RegExp('^' + escCode + '\\s*[-–—:]\\s*', 'i'), '');
        } catch { /* noop */ }
      }
      s = s.replace(/^M\d{5,8}\s*[-–—:]\s*/i, '');
      s = s.replace(/^M\d{5,8}\s+/i, '');
      return s.trim();
    };

    const formatCepRel = value => {
      const digits = String(value || '').replace(/\D/g, '');
      if (digits.length === 8) return digits.slice(0, 5) + '-' + digits.slice(5);
      return digits || '';
    };

    const formatTelefoneRel = value => {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      if (!digits) return '';
      if (digits.length < 3) return `(${digits}`;
      const ddd = digits.slice(0, 2);
      const local = digits.slice(2);
      if (!local) return `(${ddd}`;
      if (local.length <= 5) return `(${ddd}) ${local}`;
      if (local.length <= 8) return `(${ddd}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
      return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
    };

    const formatCnpjRel = value => {
      const raw = String(value || '').trim();
      const digits = raw.replace(/\D/g, '').slice(0, 14);
      if (digits.length === 14) {
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
      }
      return raw;
    };

    const sanitizeEnderecoLivre = value => {
      let s = String(value || '').trim();
      if (!s) return '';
      s = s.replace(/^\s*(?:\d{6,7})\s*[-–—]\s*/g, '');
      s = s.replace(/\bIBGE\b\s*[:\-]?\s*\d{6,7}\b/ig, '');
      s = s.replace(/\bC[oó]digo\b\s*[:\-]?\s*\d{6,7}\b/ig, '');
      s = s.replace(/\s*[,\-–—]\s*\bC[oó]digo\b\s*$/i, '');
      s = s.replace(/\s{2,}/g, ' ').trim();
      return s;
    };

    const buildEnderecoHeader = unit => {
      if (!unit) return '';
      const logradouro = sanitizeEnderecoLivre([unit.tipoLogradouro, unit.logradouro].filter(Boolean).join(' ').trim());
      const numero = sanitizeEnderecoLivre(String(unit.numero || '').trim());
      const complemento = sanitizeEnderecoLivre(String(unit.complemento || '').trim());
      const bairro = sanitizeEnderecoLivre(String(unit.bairro || '').trim());
      const cidade = sanitizeEnderecoLivre(String(unit.cidade || '').trim());
      const estado = sanitizeEnderecoLivre(String(unit.estado || '').trim());
      const cep = formatCepRel(unit.cep);

      const head = [logradouro, numero].filter(Boolean).join(', ').trim();
      const mid = [complemento].filter(Boolean).join(', ').trim();
      const cidadeUf = [cidade, estado].filter(Boolean).join('/').trim();

      let out = head;
      if (mid) out = out ? (out + ', ' + mid) : mid;
      if (bairro) out = out ? (out + ', ' + bairro) : bairro;
      if (cidadeUf) out = out ? (out + ' - ' + cidadeUf) : cidadeUf;
      if (cep) out = out ? (out + ' - CEP: ' + cep) : ('CEP: ' + cep);

      if (!out) out = sanitizeEnderecoLivre(unit.endereco);
      return sanitizeEnderecoLivre(out);
    };

    const padN = (n, size) => String(n).padStart(size, '0');
    const formatDateBr = dt => {
      const d = dt instanceof Date ? dt : new Date(dt);
      if (!isFinite(d.getTime())) return '';
      return `${padN(d.getDate(), 2)}/${padN(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
    };
    const formatTimeBr = dt => {
      const d = dt instanceof Date ? dt : new Date(dt);
      if (!isFinite(d.getTime())) return '';
      return `${padN(d.getHours(), 2)}:${padN(d.getMinutes(), 2)}`;
    };

    const unidadeNome = stripLeadingCodigo(unidadeDoc?.nome, unidadeDoc?.codigo) || 'Condomínio';
    const unidadeEndereco = buildEnderecoHeader(unidadeDoc) || '—';
    const tels = [unidadeDoc?.telefoneCelular, unidadeDoc?.telefoneFixo]
      .map(formatTelefoneRel)
      .filter(Boolean);
    const telLine = tels.length ? Array.from(new Set(tels)).join(' / ') : '—';
    const emails = [unidadeDoc?.emailPrincipal, unidadeDoc?.emailFiscal]
      .map(v => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    const emailLine = emails.length ? Array.from(new Set(emails)).join(' / ') : '—';
    const cnpjLine = formatCnpjRel(unidadeDoc?.cnpj) || '—';

    const logoValue = String(unidadeDoc?.logo || '').trim();
    const loadLogoBuffer = async (value) => {
      const s = String(value || '').trim();
      if (!s) return null;
      if (/^data:image\/(png|jpe?g|webp);base64,/i.test(s)) {
        try {
          const base64 = s.split(',', 2)[1] || '';
          if (!base64) return null;
          const buf = Buffer.from(base64, 'base64');
          // se for webp, tenta converter para png
          if (/^data:image\/webp;base64,/i.test(s)) {
            try {
              const sharpMod = (await import('sharp')).default;
              return await sharpMod(buf).png().toBuffer();
            } catch { return null; }
          }
          return buf;
        } catch { return null; }
      }
      const fetchToImageBuffer = async (url) => {
        try {
          const fetchImpl = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default;
          const resp = await fetchImpl(url);
          if (!resp.ok) return null;
          const ct = String(resp.headers.get('content-type') || '').toLowerCase();
          const arr = await resp.arrayBuffer();
          let buf = Buffer.from(arr);
          const looksWebp = ct.includes('image/webp') || /\.webp($|\?)/i.test(url);
          const looksSvg = ct.includes('image/svg') || /\.svg($|\?)/i.test(url);
          if (looksWebp || looksSvg) {
            try {
              const sharpMod = (await import('sharp')).default;
              buf = await sharpMod(buf).png().toBuffer();
            } catch { return null; }
          }
          return buf;
        } catch { return null; }
      };

      if (/^https?:\/\//i.test(s)) {
        const buf = await fetchToImageBuffer(s);
        if (buf) return buf;
        return null;
      }

      const cleaned = s.replace(/^\//, '');
      const candidates = [];
      try {
        if (path.isAbsolute(cleaned)) candidates.push(cleaned);
        candidates.push(path.resolve(process.cwd(), cleaned));
        candidates.push(path.resolve(process.cwd(), 'public', cleaned));
        candidates.push(path.resolve(process.cwd(), 'uploads', cleaned));
        candidates.push(path.resolve(process.cwd(), 'public', 'uploads', cleaned));
        candidates.push(path.resolve(process.cwd(), 'images', cleaned));
      } catch { /* noop */ }

      let foundPath = null;
      for (const p of candidates) {
        try {
          if (p && fs.existsSync(p)) { foundPath = p; break; }
        } catch { /* noop */ }
      }
      if (!foundPath) return null;

      const ext = String(path.extname(foundPath) || '').toLowerCase();
      if (ext === '.webp') {
        try {
          const sharpMod = (await import('sharp')).default;
          return await sharpMod(foundPath).png().toBuffer();
        } catch { return null; }
      }
      try { return await fs.promises.readFile(foundPath); } catch { return null; }
    };

    const logoBuffer = await loadLogoBuffer(logoValue);
    const perguntaFotoBuffer = await loadLogoBuffer(enq?.foto_pergunta);
    const opcaoFotoBuffers = await Promise.all((Array.isArray(opcoes) ? opcoes : []).map(o => loadLogoBuffer(o?.foto)));

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 175, left: 50, right: 50, bottom: 80 },
      bufferPages: true
    });
    doc.pipe(res);

    const drawHeaderFooter = (pageNumber, totalPages) => {
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const left = doc.page.margins.left;
      const right = doc.page.margins.right;
      const width = pageW - left - right;

      const prevY = doc.y;
      const prevX = doc.x;

      const prevMargins = { ...doc.page.margins };
      // Importante: desenhar header/footer fora da área útil sem criar páginas extras
      // (PDFKit pode adicionar páginas se escrever abaixo do maxY considerando margem bottom)
      try {
        doc.page.margins.top = 0;
        doc.page.margins.bottom = 0;
      } catch { /* noop */ }

      doc.save();

      // Header
      const headerTop = 18;
      let y = headerTop;

      if (logoBuffer) {
        try {
          const img = doc.openImage(logoBuffer);
          const maxW = 140;
          const maxH = 52;
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = img.width * ratio;
          const h = img.height * ratio;
          const x = (pageW - w) / 2;
          doc.image(img, x, y, { width: w, height: h });
          y += h + 8;
        } catch { /* noop */ }
      }

      doc.fillColor('#0f172a');
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(unidadeNome || 'Condomínio', left, y, { width, align: 'center' });
      y += 16;

      doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
      doc.text(unidadeEndereco || '—', left, y, { width, align: 'center' });
      y += 13;

      doc.text(`Tel.: ${telLine} - e-mail: ${emailLine}`, left, y, { width, align: 'center' });
      y += 13;

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
      doc.text(`CNPJ ${cnpjLine}`, left, y, { width, align: 'center' });

      // linha separadora
      const sepY = 160;
      doc.moveTo(left, sepY).lineTo(pageW - right, sepY).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

      // Footer
      const padSize = Math.max(2, String(totalPages || 0).length);
      const pageLabel = `Página ${padN(pageNumber, padSize)}/${padN(totalPages, padSize)}`;
      const emitente = String(user?.nome || user?.name || user?.email || 'Usuário').trim();
      const emitLabel = `Emitido por: ${emitente} em ${formatDateBr(now)} às ${formatTimeBr(now)}`;

      const footerY = pageH - 42;
      doc.moveTo(left, footerY - 8).lineTo(pageW - right, footerY - 8).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(emitLabel, left, footerY, { width, align: 'left', lineBreak: false, ellipsis: true });
      doc.text(pageLabel, left, footerY, { width, align: 'right', lineBreak: false });

      doc.restore();

      try { doc.page.margins = prevMargins; } catch { /* noop */ }
      doc.x = prevX;
      doc.y = prevY;
    };

    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const contentW = doc.page.width - left - right;

    const ensureSpace = (minHeight = 0) => {
      try {
        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        if ((doc.y + minHeight) > bottomLimit) doc.addPage();
      } catch { /* noop */ }
    };

    const drawBlock = (y, height) => {
      try {
        doc.save();
        doc.roundedRect(left, y, contentW, height, 10)
          .lineWidth(0.6)
          .strokeColor('#e2e8f0')
          .stroke();
        doc.restore();
      } catch { /* noop */ }
    };

    const statusLabel = (s) => {
      const v = String(s || '').trim().toLowerCase();
      if (!v) return '';
      return v.charAt(0).toUpperCase() + v.slice(1);
    };

    const fmtDtShort = (v) => {
      try {
        const d = v instanceof Date ? v : new Date(v);
        if (!isFinite(d.getTime())) return '—';
        const dd = padN(d.getDate(), 2);
        const mm = padN(d.getMonth() + 1, 2);
        const yyyy = d.getFullYear();
        const hh = padN(d.getHours(), 2);
        const mi = padN(d.getMinutes(), 2);
        return `${dd}/${mm}/${yyyy}, ${hh}:${mi}`;
      } catch {
        return '—';
      }
    };

    const title = 'Relatório de Enquete';
    doc.lineGap(0);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a')
      .text(title, left, doc.y, { width: contentW, align: 'center' });
    doc.moveDown(0.6);

    // Bloco centralizado com informações principais
    const vigIniTxt = fmtDtShort(enq.vigencia_inicio);
    const vigFimTxt = fmtDtShort(enq.vigencia_fim);
    const vigLine = `Vigência da enquete: ${vigIniTxt} a ${vigFimTxt}`;
    const statusLine = `Status: ${statusLabel(st)}`;
    const totalLine = `Total de votantes: ${padN(totalVotos, 2)}`;

    doc.fontSize(11).font('Helvetica').fillColor('#0f172a');
    doc.text(vigLine, left, doc.y, { width: contentW, align: 'center' });
    doc.text(statusLine, left, doc.y + 2, { width: contentW, align: 'center' });
    doc.text(totalLine, left, doc.y + 2, { width: contentW, align: 'center' });
    doc.moveDown(1);

    // Pergunta (com imagem, se houver)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Pergunta');
    doc.moveDown(0.35);

    {
      const qText = String(enq.pergunta || '').trim();
      const pad = 10;
      const imgMaxH = 210;

      // altura estimada do bloco: imagem (se existir) + texto
      const textH = doc.heightOfString(qText || '—', { width: contentW - (pad * 2), align: 'left' });
      const imgH = perguntaFotoBuffer ? (imgMaxH + 10) : 0;
      const blockH = Math.max(48, pad + imgH + textH + pad);
      ensureSpace(blockH + 8);

      const y0 = doc.y;
      drawBlock(y0, blockH);
      let cursorY = y0 + pad;

      if (perguntaFotoBuffer) {
        try {
          doc.image(perguntaFotoBuffer, left + pad, cursorY, { fit: [contentW - (pad * 2), imgMaxH], align: 'center', valign: 'center' });
          cursorY += imgMaxH + 10;
        } catch { /* noop */ }
      }

      doc.fontSize(12).font('Helvetica').fillColor('#0f172a');
      doc.text(qText || '—', left + pad, cursorY, { width: contentW - (pad * 2), align: 'left' });
      doc.y = y0 + blockH + 10;
    }

    // Resultados (blocos por alternativa, com imagem se houver)
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Resultados por alternativa:', left, doc.y, { width: contentW, align: 'left' });
    doc.moveDown(0.4);

    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const sortedOpcoes = Array.isArray(opcoes) ? opcoes : [];
    const thumb = 58;
    const pad = 10;
    const gap = 12;
    const textWWithThumb = contentW - (pad * 2) - thumb - gap;
    const textWNoThumb = contentW - (pad * 2);

    for (let i = 0; i < sortedOpcoes.length; i++) {
      const o = sortedOpcoes[i];
      const oid = String(o && o._id ? o._id : '');
      const c = countByOpt.get(oid) || 0;
      const pct = totalVotos ? Math.round((c * 100) / totalVotos) : 0;
      const label = letters[i] ? (letters[i] + ')') : ((i + 1) + ')');
      const optTxt = String(o && o.texto ? o.texto : '').trim() || 'Opção';

      const imgBuf = Array.isArray(opcaoFotoBuffers) ? (opcaoFotoBuffers[i] || null) : null;
      const hasImg = !!imgBuf;
      const textW = hasImg ? textWWithThumb : textWNoThumb;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
      const line1 = `${label} ${optTxt}`;
      const line1H = doc.heightOfString(line1, { width: textW, align: 'left' });
      doc.fontSize(11).font('Helvetica').fillColor('#0f172a');
      const line2 = `${padN(c, 2)} votos (${pct}%)`;
      const line2H = doc.heightOfString(line2, { width: textW, align: 'left' });

      const contentH = line1H + 3 + line2H;
      const minH = hasImg ? Math.max(thumb, contentH) : contentH;
      const blockH = Math.max(44, pad + minH + pad);
      ensureSpace(blockH + 6);

      const y0 = doc.y;
      drawBlock(y0, blockH);

      const xText = left + pad + (hasImg ? (thumb + gap) : 0);
      const yText = y0 + pad;

      if (hasImg) {
        try {
          doc.roundedRect(left + pad, y0 + pad, thumb, thumb, 8)
            .lineWidth(0.6)
            .strokeColor('#e2e8f0')
            .stroke();
          doc.image(imgBuf, left + pad + 2, y0 + pad + 2, { fit: [thumb - 4, thumb - 4], align: 'center', valign: 'center' });
        } catch { /* noop */ }
      }

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(line1, xText, yText, { width: textW, align: 'left' });
      doc.fontSize(11).font('Helvetica').fillColor('#0f172a');
      doc.text(line2, xText, yText + line1H + 3, { width: textW, align: 'left' });

      doc.y = y0 + blockH + 6;
    }

    const optionLabel = new Map(opcoes.map(o => [String(o._id), String(o.texto || '').trim()]));

    // Relação de votantes (evita título órfão no fim da página)
    {
      const titleTxt = 'Relação de votantes';
      doc.fontSize(12).font('Helvetica-Bold');
      const titleH = doc.heightOfString(titleTxt, { width: contentW, align: 'center' });

      let firstH = 0;
      if (!totalVotos) {
        doc.fontSize(11).font('Helvetica');
        firstH = doc.heightOfString('Nenhum voto registrado.', { width: contentW, align: 'center' });
      } else {
        const v0 = (Array.isArray(votos) && votos.length) ? votos[0] : null;
        const nome0 = String(v0?.morador_nome || '').trim() || 'Morador';
        const email0 = String(v0?.morador_email || '').trim();
        const cpf0 = String(v0?.morador_cpf || '').trim();
        const hab0 = String(v0?.habitacao_label || '').trim();
        const when0 = v0?.createdAt ? fmtDtShort(v0.createdAt) : '';
        const opt0 = optionLabel.get(String(v0?.opcao_id || '')) || 'Opção';
        const line1_0 = '• ' + nome0 + (hab0 ? (' — ' + hab0) : '');
        const contact0 = email0 ? email0 : (cpf0 ? ('CPF ' + cpf0) : '');
        const line2_0 = (contact0 ? (contact0 + ' — ') : '') + 'Voto: ' + opt0 + (when0 ? (' — ' + when0) : '');

        doc.fontSize(10.5).font('Helvetica-Bold');
        const h1 = doc.heightOfString(line1_0, { width: contentW, align: 'center' });
        doc.fontSize(10).font('Helvetica');
        const h2 = doc.heightOfString(line2_0, { width: contentW, align: 'center' });
        firstH = h1 + 2 + h2 + 10;
      }

      // Espaço mínimo: margem + título + espaçamento + primeiro item
      ensureSpace(18 + titleH + 14 + firstH);
    }

    doc.moveDown(0.8);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a')
      .text('Relação de votantes', left, doc.y, { width: contentW, align: 'center' });
    doc.moveDown(0.5);

    if (!totalVotos) {
      doc.fontSize(11).font('Helvetica').fillColor('#334155')
        .text('Nenhum voto registrado.', left, doc.y, { width: contentW, align: 'center' });
    } else {
      for (const v of votos) {
        const nome = String(v.morador_nome || '').trim() || 'Morador';
        const email = String(v.morador_email || '').trim();
        const cpf = String(v.morador_cpf || '').trim();
        const hab = String(v.habitacao_label || '').trim();
        const when = v.createdAt ? fmtDtShort(v.createdAt) : '';
        const optTxt = optionLabel.get(String(v.opcao_id || '')) || 'Opção';

        const line1 = '• ' + nome + (hab ? (' — ' + hab) : '');
        const contact = email ? email : (cpf ? ('CPF ' + cpf) : '');
        const line2 = (contact ? (contact + ' — ') : '') + 'Voto: ' + optTxt + (when ? (' — ' + when) : '');

        doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#0f172a')
          .text(line1, left, doc.y, { width: contentW, align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#0f172a')
          .text(line2, left, doc.y + 1, { width: contentW, align: 'center' });
        doc.moveDown(0.55);
      }
    }

    // Aplica cabeçalho + rodapé em todas as páginas (com paginação total)
    try {
      const range = doc.bufferedPageRange();
      const totalPages = range && range.count ? range.count : 1;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(range.start + i);
        drawHeaderFooter(i + 1, totalPages);
      }
      doc.flushPages();
    } catch { /* noop */ }

    doc.end();
  } catch (err) {
    console.error('[condominios][api/enquetes relatorio] erro:', err);
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    try { res.status(500).end('Falha ao gerar relatório'); } catch { /* noop */ }
  }
});

// Placeholder rotas para novo menu (todas redirecionam enquanto não implementadas)
const placeholderPaths = [
  '/estruturar/habitacoes','/estruturar/garagem','/estruturar/areas-comuns',
  '/cadastros/proprietarios','/cadastros/moradores', // materiais removido daqui (tem rota própria)
  '/administracao/configuracoes',
  '/servicos/solicitar',
  '/configuracoes/usuarios'
];
placeholderPaths.forEach(p => {
  app.get(p, (req,res) => {
    if(p === '/configuracoes/usuarios') return res.redirect((req.baseUrl||'/condominios') + '/usuarios');
    res.status(200).send('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Em construção</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head><body class="p-4"><div class="container"><h4 class="mb-3">Página em construção</h4><p>Rota: '+p+'</p><p>Este item do menu ainda não foi implementado.</p><a class="btn btn-primary" href="'+(req.baseUrl||'/condominios')+'/dashboard">Voltar ao Dashboard</a></div></body></html>');
  });
});

export default app;
