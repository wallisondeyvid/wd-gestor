// Migração: backfill-habitacao-mailboxes
// Data: 2026-01-09
// Objetivo: Garantir 1 caixa (mailbox) por habitação existente.
// Regras:
// - Caixa vinculada: link_type='habitacao' e link_id=<habitacao._id>
// - Membros: moradores ativos (CondMorador) + proprietário (CondProprietario)
// - Admin: se alugado=true, usa contrato_locacao.responsavel_morador_id (email do morador); caso contrário, usa contato_email do proprietário
// - A caixa vinculada à habitação NÃO é "pública" no escopo da unidade (public=false)

import 'dotenv/config';
import mongoose from 'mongoose';
import CondHabitacao from '../../src/core/models/cond_habitacao.js';
import CondMorador from '../../src/core/models/cond_morador.js';
import CondProprietario from '../../src/core/models/cond_proprietario.js';
import CondMsgMailbox from '../../src/core/models/cond_msg_mailbox.js';
import CondBloco from '../../src/core/models/cond_bloco.js';
import CondAndar from '../../src/core/models/cond_andar.js';
import { fileURLToPath } from 'url';

function parseArgs(argv) {
  const args = new Set();
  const kv = new Map();
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) kv.set(a.slice(2, eq), a.slice(eq + 1));
      else args.add(a);
    } else if (a.startsWith('-')) {
      args.add(a);
    }
  }
  return { args, kv };
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
  const s = String(value || '').trim().toLowerCase();
  return s && s.includes('@') ? s : '';
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

async function buildHabPublicMailboxName(hab, caches = {}) {
  const blocoId = String(hab?.bloco_id || '').trim();
  const andarId = String(hab?.andar_id || '').trim();
  const tipo = formatTipoLabel(hab?.tipo);
  const numero = String(hab?.numero || '').trim();

  const blocoCache = caches.blocoCache || (caches.blocoCache = new Map());
  const andarCache = caches.andarCache || (caches.andarCache = new Map());

  let blocoNome = '';
  let andarNome = '';

  if (blocoId && mongoose.isValidObjectId(blocoId)) {
    if (blocoCache.has(blocoId)) blocoNome = blocoCache.get(blocoId) || '';
    else {
      try {
        const doc = await CondBloco.findById(blocoId).select('nome').lean();
        blocoNome = String(doc?.nome || '').trim();
      } catch { blocoNome = ''; }
      blocoCache.set(blocoId, blocoNome);
    }
  }

  if (andarId && mongoose.isValidObjectId(andarId)) {
    if (andarCache.has(andarId)) andarNome = andarCache.get(andarId) || '';
    else {
      try {
        const doc = await CondAndar.findById(andarId).select('nome').lean();
        andarNome = String(doc?.nome || '').trim();
      } catch { andarNome = ''; }
      andarCache.set(andarId, andarNome);
    }
  }

  const parts = [];
  const blocoLabel = formatBlocoLabel(blocoNome);
  if (blocoLabel) parts.push(blocoLabel);
  if (andarNome) parts.push(andarNome);

  const tipoNumero = [tipo, numero].filter(Boolean).join(' ').trim();
  if (tipoNumero) parts.push(tipoNumero);

  return clampMailboxName(parts.join(', ') || (numero ? `Habitação ${numero}` : 'Habitação'));
}

async function resolveAdminEmail(hab) {
  const isAlugada = !!hab?.alugado;
  const respMoradorId = hab?.contrato_locacao?.responsavel_morador_id
    ? String(hab.contrato_locacao.responsavel_morador_id)
    : '';

  if (isAlugada && respMoradorId && mongoose.isValidObjectId(respMoradorId)) {
    try {
      const mor = await CondMorador.findById(respMoradorId).select('email ativo').lean();
      const email = normalizeEmailKey(mor?.email);
      if (email) return email;
    } catch {}
  }

  const propId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
  if (propId && mongoose.isValidObjectId(propId)) {
    try {
      const prop = await CondProprietario.findById(propId).select('contato_email ativo').lean();
      const email = normalizeEmailKey(prop?.contato_email);
      if (email) return email;
    } catch {}
  }

  return '';
}

async function resolveMemberEmails(hab) {
  const habId = String(hab?._id || '').trim();
  const members = new Set();

  if (habId) {
    try {
      const moradores = await CondMorador.find({ habitacao_id: habId, ativo: { $ne: false } }).select('email').lean();
      (moradores || []).forEach(m => {
        const email = normalizeEmailKey(m?.email);
        if (email) members.add(email);
      });
    } catch {}
  }

  const propId = hab?.proprietario_id ? String(hab.proprietario_id) : '';
  if (propId && mongoose.isValidObjectId(propId)) {
    try {
      const prop = await CondProprietario.findById(propId).select('contato_email').lean();
      const email = normalizeEmailKey(prop?.contato_email);
      if (email) members.add(email);
    } catch {}
  }

  return Array.from(members);
}

async function ensureMailboxForHab(hab, { dryRun = false, caches = {} } = {}) {
  const habId = String(hab?._id || '').trim();
  const unidadeId = String(hab?.unidade_id || '').trim();
  if (!habId || !unidadeId) return { action: 'skipped', reason: 'missing_ids' };

  const filter = {
    ativo: { $ne: false },
    unidade_id: unidadeId,
    link_type: 'habitacao',
    link_id: habId
  };

  const desiredName = await buildHabPublicMailboxName(hab, caches);
  const adminKey = await resolveAdminEmail(hab);
  const memberKeys = await resolveMemberEmails(hab);

  let mailbox = await CondMsgMailbox.findOne(filter);
  const existed = !!mailbox;

  if (!mailbox) {
    mailbox = new CondMsgMailbox({
      name: desiredName,
      type: 'grupo',
      unidade_id: unidadeId,
      unidade_nome: '',
      link_type: 'habitacao',
      link_id: habId,
      public: false,
      createdBy: adminKey || '',
      operators: adminKey ? [{ user: adminKey, perms: defaultCreatorPermsServer() }] : [],
      ativo: true
    });
  }

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
  mailbox.operators = Array.from(nextOpsMap.values());
  if (adminKey) mailbox.createdBy = adminKey;

  if (!dryRun) await mailbox.save();

  return { action: existed ? 'updated' : 'created', mailboxId: String(mailbox._id || '') };
}

async function backfillHabitacaoMailboxes({ dryRun = false, onlyUnitId = null } = {}) {
  console.log('🔄 Iniciando backfill de caixas por habitação...');
  if (dryRun) console.log('🧪 Modo DRY-RUN: nenhuma alteração será gravada.');
  if (onlyUnitId) console.log(`🎯 Limitado à unidade: ${onlyUnitId}`);

  const filter = {};
  if (onlyUnitId) filter.unidade_id = new mongoose.Types.ObjectId(onlyUnitId);

  const habs = await CondHabitacao.find(filter)
    .select('_id unidade_id bloco_id andar_id tipo numero proprietario_id alugado contrato_locacao')
    .lean();

  console.log(`Encontradas ${habs.length} habitação(ões).`);

  const caches = { blocoCache: new Map(), andarCache: new Map() };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const hab of habs || []) {
    try {
      const r = await ensureMailboxForHab(hab, { dryRun, caches });
      if (r.action === 'created') created++;
      else if (r.action === 'updated') updated++;
      else skipped++;
    } catch (e) {
      failed++;
      console.warn('❌ Falha ao processar habitação', String(hab?._id || ''), e?.message || e);
    }
  }

  console.log('📊 Resumo backfill:');
  console.log(` - Criadas: ${created}${dryRun ? ' (simulado)' : ''}`);
  console.log(` - Atualizadas: ${updated}${dryRun ? ' (simulado)' : ''}`);
  console.log(` - Ignoradas: ${skipped}`);
  console.log(` - Falhas: ${failed}`);
  console.log('🎉 Backfill concluído.');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1] === __filename) {
  (async () => {
    const { args, kv } = parseArgs(process.argv.slice(2));
    const dryRun = args.has('--dry-run') || args.has('-n');
    const onlyUnitId = kv.get('unit') || kv.get('unidade') || null;

    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wdgestor';

    try {
      await mongoose.connect(mongoURI);
      await backfillHabitacaoMailboxes({ dryRun, onlyUnitId });
      await mongoose.disconnect();
      process.exit(0);
    } catch (e) {
      console.error(e);
      try { await mongoose.disconnect(); } catch {}
      process.exit(1);
    }
  })();
}

export default backfillHabitacaoMailboxes;
