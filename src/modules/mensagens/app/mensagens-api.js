import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';

import CondMsgGroup from '#models/cond_msg_group.js';
import CondMsgMailbox from '#models/cond_msg_mailbox.js';
import CondMsgMessage from '#models/cond_msg_message.js';
import CondMsgSignaturePref from '#models/cond_msg_signature_pref.js';

import {
  getMsgOwnerKey,
  getUserIdentityKeyCandidates,
  getUserUnidadeId,
  mailboxGetUserPerms,
  ownerKeyBaseEmailLower,
  resolveMsgRecipientPermsFromSettings,
  sanitizeMailboxPerms,
  userCanScopeAll
} from './mensagens-api-helpers.js';

import {
  ensureMongoReady,
  getOrInitMsgSettingsForUnidade,
  mongoose
} from './mensagens-settings.js';

const router = express.Router();

const mensagensUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 15,
    fileSize: 10 * 1024 * 1024,
    fields: 20,
    fieldSize: 2 * 1024 * 1024
  }
});

function safeUploadName(name) {
  const raw = String(name || 'arquivo').trim() || 'arquivo';

  const cleaned = raw
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  return cleaned || 'arquivo';
}

async function cleanupMsgBlobAttachments(anexos, token = '') {
  if (!Array.isArray(anexos) || !anexos.length) return;

  const targets = [];

  for (const a of anexos) {
    const caminho = String(a?.caminho || '').trim();
    const url = String(a?.url || '').trim();

    if (caminho) targets.push(caminho);
    else if (url) targets.push(url);
  }

  const uniqueTargets = Array.from(new Set(targets.filter(Boolean)));
  if (!uniqueTargets.length) return;

  for (const target of uniqueTargets) {
    try {
      await del(target, {
        ...(token ? { token } : {})
      });
    } catch (e) {
      console.warn('[mensagens][blob cleanup] falha ao remover anexo:', {
        target,
        error: e?.message || String(e)
      });
    }
  }
}

function getCtxUser(req) {
  try {
    const directUser = req?.user && typeof req.user === 'object' ? req.user : null;
    const sessionUser = req?.session?.user && typeof req.session.user === 'object' ? req.session.user : null;

    if (directUser && sessionUser) {
      return {
        ...directUser,
        ...sessionUser,
        id: sessionUser.id || sessionUser._id || directUser.id || directUser._id,
        _id: sessionUser._id || sessionUser.id || directUser._id || directUser.id,
        email: sessionUser.email || directUser.email,
        foto: directUser.foto || sessionUser.foto
      };
    }

    if (sessionUser) return sessionUser;
    if (directUser) return directUser;

    return null;
  } catch {
    return null;
  }
}

async function preparePortalRecipientPermsContext({ ctxUser, req }) {
  const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();

  const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
    || refLower.includes('/portal-morador');

  const admin = userCanScopeAll(ctxUser);

  const nextCtxUser = ctxUser;

  let unidadeId = String(getUserUnidadeId(nextCtxUser) || '').trim();

  if (!unidadeId && admin) {
    unidadeId = String(
      req?.query?.unidade_id ||
      req?.query?.unidadeId ||
      req?.session?.unidade_id ||
      req?.session?.unidadeId ||
      req?.session?.activeUnidadeId ||
      req?.session?.unidadeAtivaId ||
      req?.session?.selectedUnidadeId ||
      ''
    ).trim();
  }

  const ownerKey = String(getMsgOwnerKey(nextCtxUser, req) || nextCtxUser?.email || '').trim().toLowerCase();
  const baseEmail = ownerKeyBaseEmailLower(ownerKey);
  const emailLower = String(baseEmail || ownerKey || '').trim().toLowerCase();

  return {
    ctxUser: nextCtxUser,
    fromPortal,
    admin,
    unidadeId,
    ownerKey,
    baseEmail,
    emailLower
  };
}

function preparePersonalSignatureContext({ ctxUser, req, mailboxId = '' }) {
  const normalizedMailboxId = String(mailboxId || '').trim() || 'pessoal';

  const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
  const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
    || refLower.includes('/portal-morador');

  const owner = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();
  const baseEmail = ownerKeyBaseEmailLower(owner);
  const canonicalOwner = normalizedMailboxId === 'pessoal' && baseEmail ? baseEmail : owner;

  const cleanupOwnerKeys = [];

  if (normalizedMailboxId === 'pessoal') {
    const addCleanupOwnerKey = (value) => {
      const key = String(value || '').trim().toLowerCase();
      if (!key || key === canonicalOwner) return;
      if (cleanupOwnerKeys.includes(key)) return;
      cleanupOwnerKeys.push(key);
    };

    addCleanupOwnerKey(owner);
    addCleanupOwnerKey(req?.__wdgPortalCookieUserId);
    addCleanupOwnerKey(ctxUser?.cond_usuario_id);
    addCleanupOwnerKey(ctxUser?.condUsuarioId);
    addCleanupOwnerKey(ctxUser?._id);
    addCleanupOwnerKey(ctxUser?.id);
  }

  return {
    ctxUser,
    fromPortal,
    mailboxId: normalizedMailboxId,
    owner,
    baseEmail,
    canonicalOwner,
    cleanupOwnerKeys
  };
}

function normalizeSignaturePrefText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  // Limite defensivo: UI já limita, mas evita payloads absurdos.
  return text.slice(0, 3000);
}

function isEmailish(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeGroupMembers(members) {
  const arr = Array.isArray(members) ? members : [];
  const out = [];

  for (const m of arr) {
    if (!m) continue;

    const type = String(m.type || '').trim().toLowerCase();

    if (type === 'mailbox' || m.mailboxId) {
      const mailboxId = String(m.mailboxId || m.id || '').trim();
      const name = String(m.name || m.nome || '').trim();

      if (!mailboxId || !name) continue;

      out.push({
        type: 'mailbox',
        mailboxId,
        name
      });

      continue;
    }

    const email = String(m.email || '').trim().toLowerCase();
    const nome = String(m.nome || m.name || '').trim();

    if (!email && !nome) continue;

    out.push({
      type: 'user',
      email,
      nome,
      fotoUrl: String(m.fotoUrl || m.foto || m.photo || m.avatar || '').trim()
    });
  }

  return out.slice(0, 500);
}

function toGroupClient(doc) {
  if (!doc) return null;

  return {
    id: String(doc._id || doc.id || ''),
    mailboxId: String(doc.mailbox_id || ''),
    name: doc.name || '',
    members: Array.isArray(doc.members) ? doc.members : []
  };
}

function buildPersonalGroupOwnerCompat(ctxUser, req) {
  const ownerKey = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();
  const baseEmail = ownerKeyBaseEmailLower(ownerKey);
  const basePrefixRx = baseEmail && isEmailish(baseEmail)
    ? new RegExp('^' + escapeRegExp(baseEmail) + '::')
    : null;

  return {
    ownerKey,
    baseEmail,
    basePrefixRx,
    buildFilter() {
      return basePrefixRx
        ? {
            mailbox_id: 'pessoal',
            ativo: { $ne: false },
            $or: [
              { owner: { $in: [ownerKey, baseEmail] } },
              { owner: basePrefixRx }
            ]
          }
        : {
            mailbox_id: 'pessoal',
            owner: baseEmail ? { $in: [ownerKey, baseEmail] } : ownerKey,
            ativo: { $ne: false }
          };
    },
    matchesDocOwner(docOwnerRaw) {
      const docOwner = String(docOwnerRaw || '').trim().toLowerCase();
      if (!docOwner) return false;
      if (docOwner === ownerKey) return true;
      if (baseEmail && docOwner === baseEmail) return true;
      return !!(basePrefixRx && basePrefixRx.test(docOwner));
    }
  };
}

function mailboxIsPublic(mailboxDoc) {
  if (!mailboxDoc) return false;

  const linkType = String(mailboxDoc.link_type || '').trim().toLowerCase();
  if (linkType === 'habitacao') return false;

  return !!(
    mailboxDoc.public ||
    mailboxDoc.publica ||
    mailboxDoc.isPublic ||
    mailboxDoc.visivel_publico ||
    mailboxDoc.visivelPublico
  );
}

function mailboxIsHabitacao(mailboxDoc) {
  try {
    const linkType = String(mailboxDoc?.link_type || '').trim().toLowerCase();
    return linkType === 'habitacao';
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
    const u = typeof op === 'string'
      ? op
      : (op && typeof op === 'object' ? op.user : '');

    const k = String(u || '').trim().toLowerCase();
    if (!k) return false;

    return meList.includes(k);
  });
}

function toMailboxClient(doc) {
  if (!doc) return null;

  return {
    id: String(doc._id || doc.id || ''),
    name: doc.name || '',
    type: doc.type || 'grupo',
    unitId: doc.unidade_id ? String(doc.unidade_id) : '',
    unitName: doc.unidade_nome || '',
    createdBy: doc.createdBy || '',
    operators: Array.isArray(doc.operators) ? doc.operators : [],
    isPublic: mailboxIsPublic(doc),
    linkType: doc.link_type || '',
    linkId: doc.link_id ? String(doc.link_id) : ''
  };
}

function buildMailboxesDebugMeta(ctxUser, req, extra = {}) {
  try {
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1';
    const admin = userCanScopeAll(ctxUser);
    const email = String(ctxUser?.email || ctxUser?.userEmail || '').trim().toLowerCase();
    const idRaw = String(ctxUser?.cond_usuario_id || ctxUser?.id || '').trim();

    return {
      fromPortal,
      admin,
      mongoReadyState: mongoose.connection.readyState,
      ctx: {
        hasEmail: !!email,
        emailMasked: email ? email.replace(/^(.{2}).*(@.*)$/, '$1***$2') : '',
        hasCondUsuarioId: !!idRaw
      },
      ...extra
    };
  } catch {
    return { ...extra };
  }
}

function normalizeEmailKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const cleaned = raw
    .replace(/^userkey:\s*/i, '')
    .replace(/^user:\s*/i, '')
    .replace(/^email:\s*/i, '');

  const base = ownerKeyBaseEmailLower(cleaned) || cleaned;

  return base && base.includes('@') ? base : '';
}

function normalizeMarkerName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.replace(/\s+/g, ' ').slice(0, 60);
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

function resolvePersonalMessageScope(ctxUser, req) {
  const owner = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();
  return {
    mailboxId: 'pessoal',
    owner
  };
}

function buildPersonalOwnerCandidates(ctxUser, req, scope) {
  const out = [];

  const add = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return;
    if (!out.includes(normalized)) out.push(normalized);
  };

  const owner = String(scope?.owner || '').trim().toLowerCase();
  const baseEmail = ownerKeyBaseEmailLower(owner) || normalizeEmailKey(owner);

  add(owner);
  add(baseEmail);
  add(ctxUser?.email);
  add(ctxUser?.userEmail);
  add(ctxUser?.contato_email);
  add(ctxUser?.contatoEmail);
  add(ctxUser?.cond_usuario_id);
  add(ctxUser?.condUsuarioId);
  add(ctxUser?._id);
  add(ctxUser?.id);
  add(req?.__wdgPortalCookieUserId);

  if (baseEmail && isEmailish(baseEmail)) {
    add(`${baseEmail}::portal`);
    add(`${baseEmail}::colab`);
  }

  return out;
}

function toMessageListItem(doc, scope, folder) {
  if (!doc) return null;

  const mb = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();
  const states = Array.isArray(doc.states) ? doc.states : [];
  const baseEmail = mb === 'pessoal' ? (ownerKeyBaseEmailLower(owner) || '') : '';

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

  const sentFromThisScope = String(doc.from_mailbox_id || '').trim() === mb
    && (mb !== 'pessoal' || ownerMatches(doc.from_owner));

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

  let treatAsSent = folder === 'saida' || ((folder === 'lixeira' || folder === 'arquivo') && sentFromThisScope);
  if (sentToSelf && folder !== 'saida') treatAsSent = false;

  let receivedAsCopy = false;

  if (!treatAsSent) {
    const listTo = Array.isArray(doc.to) ? doc.to : [];
    const listCc = Array.isArray(doc.cc) ? doc.cc : [];
    const isTo = listTo.some(m => ownerMatches(String(m?.email || '').trim().toLowerCase()));
    const isCc = listCc.some(m => ownerMatches(String(m?.email || '').trim().toLowerCase()));

    receivedAsCopy = !!(isCc && !isTo);
  }

  const isRead = treatAsSent ? true : !!(st && st.lida_em);
  const isPinned = !!(st && st.fixada_em);
  const hasAttachment = Array.isArray(doc.anexos) && doc.anexos.length > 0;

  let remetente = String(doc.from_mailbox_name || doc.from_mailbox_id || '').trim();

  if (treatAsSent) {
    const list = [...(doc.to || []), ...(doc.cc || [])].filter(Boolean);
    const first = list[0];

    if (first) {
      const t = String(first?.type || '').trim().toLowerCase();

      if (t === 'mailbox') {
        remetente = String(first?.name || '').trim() || remetente;
      } else {
        remetente = String(first?.nome || '').trim() || String(first?.email || '').trim() || remetente;
      }
    }

    try {
      const v = String(doc.__destinatario_display || '').trim();
      if (v) remetente = v;
    } catch {
      /* noop */
    }
  }

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

function generateMsgProtocolo() {
  const year = new Date().getFullYear();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';

  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }

  return `${year}-${out}`;
}

function sanitizeMessageRecipients(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;

    const type = String(raw.type || '').trim().toLowerCase();

    if (type === 'mailbox') {
      const mailboxId = String(raw.mailboxId || raw.mailbox_id || '').trim();
      const name = String(raw.name || raw.nome || raw.mailboxName || '').trim();

      if (!mailboxId) continue;

      out.push({
        type: 'mailbox',
        mailboxId,
        name
      });

      continue;
    }

    const email = String(raw.email || '').trim().toLowerCase();
    const nome = String(raw.nome || raw.name || raw.display || '').trim();
    const fotoUrl = String(raw.fotoUrl || raw.foto_url || raw.photoUrl || '').trim();

    if (!email) continue;

    out.push({
      type: 'user',
      email,
      nome,
      fotoUrl
    });
  }

  return out;
}

function messageRecipientToStateScope(member) {
  const type = String(member?.type || '').trim().toLowerCase();

  if (type === 'mailbox') {
    const mailboxId = String(member?.mailboxId || '').trim();
    if (!mailboxId) return null;

    return {
      mailboxId,
      owner: ''
    };
  }

  const email = String(member?.email || '').trim().toLowerCase();
  if (!email) return null;

  return {
    mailboxId: 'pessoal',
    owner: email
  };
}

function buildInitialMessageStates({ fromMailboxId, fromOwner, to, cc }) {
  const now = new Date();
  const map = new Map();

  const push = ({ mailboxId, owner, isSender = false, isRecipient = false }) => {
    const mb = String(mailboxId || '').trim();
    const own = String(owner || '').trim().toLowerCase();

    if (!mb) return;

    const key = `${mb}::${own}`;
    const existing = map.get(key) || {
      mailbox_id: mb,
      owner: own,
      lida_em: null,
      arquivada_em: null,
      arquivada_de: '',
      lixeira_em: null,
      lixeira_de: '',
      excluida_em: null,
      fixada_em: null,
      marcadores: []
    };

    if (isSender && !isRecipient) {
      existing.lida_em = now;
    }

    if (isRecipient) {
      existing.lida_em = null;
    }

    map.set(key, existing);
  };

  const senderScope = {
    mailboxId: String(fromMailboxId || '').trim() || 'pessoal',
    owner: String(fromOwner || '').trim().toLowerCase()
  };

  const recipientScopes = [];

  for (const member of [...(to || []), ...(cc || [])]) {
    const scope = messageRecipientToStateScope(member);
    if (scope) recipientScopes.push(scope);
  }

  const senderAlsoRecipient = recipientScopes.some(s =>
    String(s.mailboxId || '').trim() === senderScope.mailboxId &&
    String(s.owner || '').trim().toLowerCase() === senderScope.owner
  );

  push({
    ...senderScope,
    isSender: true,
    isRecipient: senderAlsoRecipient
  });

  for (const scope of recipientScopes) {
    push({
      ...scope,
      isRecipient: true
    });
  }

  return Array.from(map.values());
}

async function loadMsgMailboxForSend(mailboxId) {
  const id = String(mailboxId || '').trim();

  if (!id || !mongoose.isValidObjectId(id)) {
    const err = new Error('Caixa remetente inválida.');
    err.status = 400;
    throw err;
  }

  const doc = await CondMsgMailbox.findOne({
    _id: id,
    ativo: { $ne: false }
  }).lean();

  if (!doc) {
    const err = new Error('Caixa remetente não encontrada.');
    err.status = 404;
    throw err;
  }

  return doc;
}

function userCanSendFromMailbox(mailboxDoc, ctxUser) {
  if (userCanScopeAll(ctxUser)) return true;
  if (mailboxIsMember(mailboxDoc, ctxUser)) return true;

  const perms = mailboxGetUserPerms(mailboxDoc, ctxUser);

  return !!(
    perms?.administrar ||
    perms?.criarMensagem
  );
}

async function loadMsgMailboxForSignature(mailboxId, ctxUser) {
  const id = String(mailboxId || '').trim();

  if (!id || !mongoose.isValidObjectId(id)) {
    const err = new Error('Caixa inválida.');
    err.status = 400;
    throw err;
  }

  const mailbox = await CondMsgMailbox.findOne({
    _id: id,
    ativo: { $ne: false }
  });

  if (!mailbox) {
    const err = new Error('Caixa não encontrada.');
    err.status = 404;
    throw err;
  }

  if (userCanScopeAll(ctxUser)) return mailbox;

  const perms = mailboxGetUserPerms(mailbox, ctxUser);

  const allowed = !!(
    perms?.administrar ||
    perms?.criarMensagem ||
    mailboxIsMember(mailbox, ctxUser)
  );

  if (!allowed) {
    const err = new Error('Sem permissão para configurar assinatura desta caixa.');
    err.status = 403;
    throw err;
  }

  return mailbox;
}

function buildPersonalOwnerMatcher(scope, ownerCandidatesLower = []) {
  const candidates = [];

  const add = (value) => {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return;
    if (!candidates.includes(s)) candidates.push(s);
  };

  add(scope?.owner);
  (ownerCandidatesLower || []).forEach(add);

  const baseEmail = (() => {
    for (const c of candidates) {
      const base = ownerKeyBaseEmailLower(c) || normalizeEmailKey(c);
      if (isEmailish(base)) return base;
    }

    return '';
  })();

  return {
    candidates,
    baseEmail,
    matches(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return false;
      if (candidates.includes(raw)) return true;

      const base = ownerKeyBaseEmailLower(raw) || normalizeEmailKey(raw);
      return !!(baseEmail && base && base === baseEmail);
    }
  };
}

function findPersonalMessageState(doc, ownerMatcher, { includeDeleted = false } = {}) {
  const states = Array.isArray(doc?.states) ? doc.states : [];

  const list = states.filter(s =>
    String(s?.mailbox_id || '').trim() === 'pessoal'
    && ownerMatcher.matches(s?.owner)
  );

  if (!includeDeleted) {
    const active = list.filter(s => !s?.excluida_em);
    const readOne = active.find(s => !!s?.lida_em);
    return readOne || active[0] || null;
  }

  const readOne = list.find(s => !!s?.lida_em);
  return readOne || list[0] || null;
}

function personalMessageDeletedForScope(doc, ownerMatcher) {
  const states = Array.isArray(doc?.states) ? doc.states : [];

  const scoped = states.filter(s =>
    String(s?.mailbox_id || '').trim() === 'pessoal'
    && ownerMatcher.matches(s?.owner)
  );

  return scoped.length > 0 && scoped.every(s => !!s?.excluida_em);
}

function allMessageStatesDeleted(doc) {
  const states = Array.isArray(doc?.states) ? doc.states : [];
  if (!states.length) return false;

  return states.every(s => !!s?.excluida_em);
}

function isPersonalScopeSender(doc, ownerMatcher) {
  try {
    const fromMailboxId = String(doc?.from_mailbox_id || '').trim();
    if (fromMailboxId !== 'pessoal') return false;

    const fromOwner = String(doc?.from_owner || '').trim().toLowerCase();
    if (fromOwner && ownerMatcher.matches(fromOwner)) return true;

    const createdBy = String(doc?.createdBy || '').trim().toLowerCase();
    return !!(createdBy && ownerMatcher.matches(createdBy));
  } catch {
    return false;
  }
}

function hasPersonalScopeAsRecipient(doc, ownerMatcher) {
  try {
    const list = [
      ...(Array.isArray(doc?.to) ? doc.to : []),
      ...(Array.isArray(doc?.cc) ? doc.cc : [])
    ];

    return list.some(m => {
      const type = String(m?.type || '').trim().toLowerCase();
      if (type === 'mailbox') return false;

      const email = String(m?.email || '').trim().toLowerCase();
      return !!(email && ownerMatcher.matches(email));
    });
  } catch {
    return false;
  }
}

function hasPersonalStateAccess(doc, ownerMatcher) {
  try {
    const st = findPersonalMessageState(doc, ownerMatcher, { includeDeleted: false });
    return !!st;
  } catch {
    return false;
  }
}

function canAccessPersonalMessage(doc, ctxUser, scope, ownerMatcher) {
  if (!doc) return false;
  if (userCanScopeAll(ctxUser)) return true;
  if (isPersonalScopeSender(doc, ownerMatcher)) return true;
  if (hasPersonalScopeAsRecipient(doc, ownerMatcher)) return true;
  if (hasPersonalStateAccess(doc, ownerMatcher)) return true;
  return false;
}

function ensurePersonalMessageState(doc, scope, ownerMatcher) {
  const existing = findPersonalMessageState(doc, ownerMatcher, { includeDeleted: true });
  if (existing) return existing;

  const owner = String(scope?.owner || '').trim().toLowerCase();

  const st = {
    mailbox_id: 'pessoal',
    owner,
    lida_em: null,
    arquivada_em: null,
    arquivada_de: '',
    lixeira_em: null,
    lixeira_de: '',
    excluida_em: null,
    fixada_em: null,
    marcadores: []
  };

  if (!Array.isArray(doc.states)) doc.states = [];

  try {
    if (typeof doc.states.push === 'function') {
      doc.states.push(st);
      if (typeof doc.markModified === 'function') doc.markModified('states');
      return doc.states[doc.states.length - 1];
    }
  } catch {
    /* noop */
  }

  doc.states = [...doc.states, st];
  try { if (typeof doc.markModified === 'function') doc.markModified('states'); } catch {}

  return st;
}

function toMessageDetailItemPersonal(doc, scope, ownerMatcher, extra = {}) {
  if (!doc) return null;

  const st = findPersonalMessageState(doc, ownerMatcher, { includeDeleted: false });

  const createdAt = inferDocCreatedAt(doc);

  const listTo = Array.isArray(doc.to) ? doc.to : [];
  const listCc = Array.isArray(doc.cc) ? doc.cc : [];

  const isTo = listTo.some(m => {
    const email = String(m?.email || '').trim().toLowerCase();
    return !!(email && ownerMatcher.matches(email));
  });

  const isCc = listCc.some(m => {
    const email = String(m?.email || '').trim().toLowerCase();
    return !!(email && ownerMatcher.matches(email));
  });

  const fromMailboxId = String(doc.from_mailbox_id || '').trim();
  const fromMailboxName = String(doc.from_mailbox_name || '').trim() || fromMailboxId;
  const fromOwnerRaw = String(doc.from_owner || '').trim();
  const fromOwner = fromOwnerRaw ? fromOwnerRaw.trim().toLowerCase() : '';

  const baseFromOwnerEmail = ownerKeyBaseEmailLower(fromOwner) || '';
  const fromOwnerEmail = baseFromOwnerEmail || (isEmailish(fromOwnerRaw) ? fromOwnerRaw.trim().toLowerCase() : '');

  const createdByRaw = String(doc.createdBy || '').trim();
  const createdByEmail = isEmailish(createdByRaw) ? createdByRaw.trim().toLowerCase() : '';

  const extraEmail = isEmailish(extra?.senderEmail)
    ? String(extra.senderEmail || '').trim().toLowerCase()
    : '';

  const fromEmail = fromOwnerEmail || createdByEmail || extraEmail;

  const fromDisplay = fromMailboxId === 'pessoal'
    ? (String(extra?.senderName || '').trim() || createdByRaw || fromOwnerRaw || 'Pessoal')
    : fromMailboxName;

  return {
    id: String(doc._id || ''),
    protocolo: String(doc.protocolo || '').trim(),
    assunto: String(doc.assunto || '').trim(),
    bodyHtml: String(doc.body_html || ''),
    bodyText: String(doc.body_text || ''),
    createdAt: createdAt || null,
    copia: !!(isCc && !isTo),
    from: {
      mailboxId: fromMailboxId,
      mailboxName: fromMailboxName,
      owner: fromOwner,
      email: fromEmail,
      createdBy: createdByRaw,
      display: fromDisplay
    },
    to: listTo.map(m => ({
      type: String(m?.type || 'user').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || m?.name || '').trim(),
      name: String(m?.name || m?.nome || '').trim(),
      display: String(m?.display || m?.nome || m?.name || m?.email || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      mailboxName: String(m?.mailboxName || m?.name || m?.nome || '').trim()
    })),
    cc: listCc.map(m => ({
      type: String(m?.type || 'user').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || m?.name || '').trim(),
      name: String(m?.name || m?.nome || '').trim(),
      display: String(m?.display || m?.nome || m?.name || m?.email || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      mailboxName: String(m?.mailboxName || m?.name || m?.nome || '').trim()
    })),
    anexos: Array.isArray(doc.anexos) ? doc.anexos.map(a => ({
      nome: String(a?.nome || '').trim(),
      mime: String(a?.mime || '').trim(),
      tamanho: Number(a?.tamanho) || 0,
      url: String(a?.url || '').trim(),
      caminho: String(a?.caminho || '').trim()
    })) : [],
    lida: !!st?.lida_em,
    fixada: !!st?.fixada_em,
    marcadores: Array.isArray(st?.marcadores) ? st.marcadores : [],
    threadRootId: doc.thread_root_id ? String(doc.thread_root_id) : '',
    inReplyToId: doc.in_reply_to ? String(doc.in_reply_to) : '',
    forwardedFromId: doc.forwarded_from_id ? String(doc.forwarded_from_id) : ''
  };
}

function findMessageStateForScope(doc, scope, ownerMatcher, { includeDeleted = false } = {}) {
  const states = Array.isArray(doc?.states) ? doc.states : [];
  const mailboxId = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();

  const list = states.filter(s => {
    const stateMailboxId = String(s?.mailbox_id || '').trim();
    const stateOwner = String(s?.owner || '').trim().toLowerCase();

    if (stateMailboxId !== mailboxId) return false;

    if (mailboxId === 'pessoal') {
      return ownerMatcher && ownerMatcher.matches(stateOwner);
    }

    return stateOwner === owner;
  });

  if (!includeDeleted) {
    const active = list.filter(s => !s?.excluida_em);
    const readOne = active.find(s => !!s?.lida_em);
    return readOne || active[0] || null;
  }

  const readOne = list.find(s => !!s?.lida_em);
  return readOne || list[0] || null;
}

function messageDeletedForScope(doc, scope, ownerMatcher) {
  const states = Array.isArray(doc?.states) ? doc.states : [];
  const mailboxId = String(scope?.mailboxId || '').trim() || 'pessoal';
  const owner = String(scope?.owner || '').trim().toLowerCase();

  const scoped = states.filter(s => {
    const stateMailboxId = String(s?.mailbox_id || '').trim();
    const stateOwner = String(s?.owner || '').trim().toLowerCase();

    if (stateMailboxId !== mailboxId) return false;

    if (mailboxId === 'pessoal') {
      return ownerMatcher && ownerMatcher.matches(stateOwner);
    }

    return stateOwner === owner;
  });

  return scoped.length > 0 && scoped.every(s => !!s?.excluida_em);
}

function isMessageSenderForScope(doc, scope, ownerMatcher) {
  try {
    const mailboxId = String(scope?.mailboxId || '').trim() || 'pessoal';
    const fromMailboxId = String(doc?.from_mailbox_id || '').trim();

    if (fromMailboxId !== mailboxId) return false;

    if (mailboxId !== 'pessoal') return true;

    const fromOwner = String(doc?.from_owner || '').trim().toLowerCase();
    if (fromOwner && ownerMatcher && ownerMatcher.matches(fromOwner)) return true;

    const createdBy = String(doc?.createdBy || '').trim().toLowerCase();
    return !!(createdBy && ownerMatcher && ownerMatcher.matches(createdBy));
  } catch {
    return false;
  }
}

function hasMessageRecipientForScope(doc, scope, ownerMatcher) {
  try {
    const mailboxId = String(scope?.mailboxId || '').trim() || 'pessoal';

    const list = [
      ...(Array.isArray(doc?.to) ? doc.to : []),
      ...(Array.isArray(doc?.cc) ? doc.cc : [])
    ];

    return list.some(m => {
      const type = String(m?.type || '').trim().toLowerCase();

      if (mailboxId !== 'pessoal') {
        const mb = String(m?.mailboxId || m?.mailbox_id || '').trim();
        return type === 'mailbox' && mb === mailboxId;
      }

      if (type === 'mailbox') return false;

      const email = String(m?.email || '').trim().toLowerCase();
      return !!(email && ownerMatcher && ownerMatcher.matches(email));
    });
  } catch {
    return false;
  }
}

function canAccessMessageForScope(doc, ctxUser, scope, ownerMatcher) {
  if (!doc) return false;
  if (userCanScopeAll(ctxUser)) return true;
  if (isMessageSenderForScope(doc, scope, ownerMatcher)) return true;
  if (hasMessageRecipientForScope(doc, scope, ownerMatcher)) return true;

  const st = findMessageStateForScope(doc, scope, ownerMatcher, { includeDeleted: false });
  if (st) return true;

  return false;
}

function toMessageDetailItemScoped(doc, scope, ownerMatcher, extra = {}) {
  const mailboxId = String(scope?.mailboxId || '').trim() || 'pessoal';

  if (mailboxId === 'pessoal') {
    return toMessageDetailItemPersonal(doc, scope, ownerMatcher, extra);
  }

  if (!doc) return null;

  const st = findMessageStateForScope(doc, scope, ownerMatcher, { includeDeleted: false });
  const createdAt = inferDocCreatedAt(doc);

  const listTo = Array.isArray(doc.to) ? doc.to : [];
  const listCc = Array.isArray(doc.cc) ? doc.cc : [];

  const fromMailboxId = String(doc.from_mailbox_id || '').trim();
  const fromMailboxName = String(doc.from_mailbox_name || '').trim() || fromMailboxId;
  const fromOwnerRaw = String(doc.from_owner || '').trim();
  const fromOwner = fromOwnerRaw ? fromOwnerRaw.trim().toLowerCase() : '';

  const fromDisplay = fromMailboxId === 'pessoal'
    ? (String(extra?.senderName || '').trim() || String(doc.createdBy || '').trim() || fromOwnerRaw || 'Pessoal')
    : fromMailboxName;

  const mailboxRecipientMatches = (m) => {
    const type = String(m?.type || '').trim().toLowerCase();
    const mb = String(m?.mailboxId || m?.mailbox_id || '').trim();
    return type === 'mailbox' && mb === mailboxId;
  };

  const isTo = listTo.some(mailboxRecipientMatches);
  const isCc = listCc.some(mailboxRecipientMatches);

  return {
    id: String(doc._id || ''),
    protocolo: String(doc.protocolo || '').trim(),
    assunto: String(doc.assunto || '').trim(),
    bodyHtml: String(doc.body_html || ''),
    bodyText: String(doc.body_text || ''),
    createdAt: createdAt || null,
    copia: !!(isCc && !isTo),
    from: {
      mailboxId: fromMailboxId,
      mailboxName: fromMailboxName,
      owner: fromOwner,
      email: String(extra?.senderEmail || '').trim().toLowerCase(),
      createdBy: String(doc.createdBy || '').trim(),
      display: fromDisplay
    },
    to: listTo.map(m => ({
      type: String(m?.type || 'user').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || m?.name || '').trim(),
      name: String(m?.name || m?.nome || '').trim(),
      display: String(m?.display || m?.nome || m?.name || m?.email || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      mailboxName: String(m?.mailboxName || m?.name || m?.nome || '').trim()
    })),
    cc: listCc.map(m => ({
      type: String(m?.type || 'user').trim() || 'user',
      email: String(m?.email || '').trim().toLowerCase(),
      nome: String(m?.nome || m?.name || '').trim(),
      name: String(m?.name || m?.nome || '').trim(),
      display: String(m?.display || m?.nome || m?.name || m?.email || '').trim(),
      mailboxId: String(m?.mailboxId || '').trim(),
      mailboxName: String(m?.mailboxName || m?.name || m?.nome || '').trim()
    })),
    anexos: Array.isArray(doc.anexos) ? doc.anexos.map(a => ({
      nome: String(a?.nome || '').trim(),
      mime: String(a?.mime || '').trim(),
      tamanho: Number(a?.tamanho) || 0,
      url: String(a?.url || '').trim(),
      caminho: String(a?.caminho || '').trim()
    })) : [],
    lida: !!st?.lida_em,
    fixada: !!st?.fixada_em,
    marcadores: Array.isArray(st?.marcadores) ? st.marcadores : [],
    threadRootId: doc.thread_root_id ? String(doc.thread_root_id) : '',
    inReplyToId: doc.in_reply_to ? String(doc.in_reply_to) : '',
    forwardedFromId: doc.forwarded_from_id ? String(doc.forwarded_from_id) : ''
  };
}

function rootIdForMessageAction(doc) {
  const raw = String(doc?.thread_root_id || doc?._id || '').trim();
  return raw && mongoose.isValidObjectId(raw) ? raw : '';
}

function isPersonalMessageInTrashForScope(doc, ownerMatcher) {
  const st = findPersonalMessageState(doc, ownerMatcher, { includeDeleted: false });
  return !!st?.lixeira_em;
}

function isPersonalMessageArchivedForScope(doc, ownerMatcher) {
  const st = findPersonalMessageState(doc, ownerMatcher, { includeDeleted: false });
  return !!(st?.arquivada_em && !st?.lixeira_em);
}

function applyPersonalMessageStateAction(doc, scope, ownerMatcher, action, opts = {}) {
  const st = ensurePersonalMessageState(doc, scope, ownerMatcher);
  const now = opts?.now instanceof Date ? opts.now : new Date();

  if (action === 'archive') {
    st.arquivada_em = now;
    st.arquivada_de = String(opts?.fromFolder || '').trim() || 'entrada';
    st.lixeira_em = null;
    st.lixeira_de = '';
    st.fixada_em = null;
    return true;
  }

  if (action === 'unarchive') {
    st.arquivada_em = null;
    st.arquivada_de = '';
    return true;
  }

  if (action === 'trash') {
    st.lixeira_em = now;
    st.lixeira_de = String(opts?.fromFolder || '').trim() || 'entrada';
    st.arquivada_em = null;
    st.arquivada_de = '';
    st.fixada_em = null;
    return true;
  }

  if (action === 'restore') {
    st.lixeira_em = null;
    st.lixeira_de = '';
    return true;
  }

  if (action === 'delete') {
    st.excluida_em = now;
    st.fixada_em = null;
    return true;
  }

  if (action === 'pin') {
    st.fixada_em = st.fixada_em ? null : now;
    return true;
  }

  if (action === 'unread') {
    st.lida_em = null;
    return true;
  }

  if (action === 'read') {
    st.lida_em = st.lida_em || now;
    return true;
  }

  if (action === 'marker') {
    const marker = normalizeMarkerName(opts?.marker);
    if (!marker) return false;

    const current = Array.isArray(st.marcadores)
      ? st.marcadores.map(x => normalizeMarkerName(x)).filter(Boolean)
      : [];

    const markerLower = marker.toLowerCase();
    const hasMarker = current.some(x => String(x || '').trim().toLowerCase() === markerLower);

    if (hasMarker) {
      st.marcadores = current.filter(x => String(x || '').trim().toLowerCase() !== markerLower);
      return true;
    }

    st.marcadores = [...current, marker];
    return true;
  }

  return false;
}

router.get('/health', (req, res) => {
  return res.json({
    ok: true,
    module: 'mensagens',
    api: 'msg'
  });
});

router.get('/signature', async (req, res, next) => {
  try {
    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const mailboxIdRaw = String(req.query.mailboxId || req.query.mailbox_id || '').trim();
    const mailboxId = mailboxIdRaw || 'pessoal';

    let doc = null;

    if (mailboxId === 'pessoal') {
      const signatureContext = preparePersonalSignatureContext({
        ctxUser,
        req,
        mailboxId
      });

      const { owner, baseEmail } = signatureContext;
      if (!owner) return res.status(400).json({ error: 'Usuário inválido' });

      doc = await CondMsgSignaturePref.findOne({
        owner,
        mailbox_id: 'pessoal'
      }).lean();

      if (!doc && baseEmail && baseEmail !== owner) {
        doc = await CondMsgSignaturePref.findOne({
          owner: baseEmail,
          mailbox_id: 'pessoal'
        }).lean();
      }
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);
      const sharedMailboxId = String(mailbox?._id || mailboxId);

      doc = await CondMsgSignaturePref.findOne({
        owner: sharedMailboxId,
        mailbox_id: sharedMailboxId
      }).lean();
    }

    if (!doc) return res.json({ enabled: false, text: '' });

    return res.json({
      enabled: !!doc.enabled,
      text: String(doc.text || '')
    });
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][GET /api/msg/signature] erro:', e);
    return res.status(500).json({ error: 'Falha ao carregar assinatura' });
  }
});

router.put('/signature', express.json({ limit: '64kb' }), async (req, res, next) => {
  try {
    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const mailboxIdRaw = String(
      req.query.mailboxId ||
      req.query.mailbox_id ||
      req.body?.mailboxId ||
      req.body?.mailbox_id ||
      ''
    ).trim();

    const mailboxId = mailboxIdRaw || 'pessoal';

    const enabled = !!(req.body?.enabled ?? req.body?.assinaturaAtiva ?? req.body?.signatureEnabled);
    const text = normalizeSignaturePrefText(
      req.body?.text ??
      req.body?.assinaturaTexto ??
      req.body?.signatureText
    );

    let updated = null;

    if (mailboxId === 'pessoal') {
      const signatureContext = preparePersonalSignatureContext({
        ctxUser,
        req,
        mailboxId
      });

      const {
        owner,
        canonicalOwner,
        cleanupOwnerKeys
      } = signatureContext;

      if (!owner) return res.status(400).json({ error: 'Usuário inválido' });

      updated = await CondMsgSignaturePref.findOneAndUpdate(
        {
          owner: String(canonicalOwner).toLowerCase(),
          mailbox_id: 'pessoal'
        },
        {
          $set: {
            enabled,
            text
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      ).lean();

      const duplicateOwners = Array.from(new Set([
        ...(Array.isArray(cleanupOwnerKeys) ? cleanupOwnerKeys : []),
        ...(canonicalOwner && canonicalOwner !== owner ? [owner] : [])
      ].filter(Boolean)));

      if (duplicateOwners.length) {
        try {
          await CondMsgSignaturePref.deleteMany({
            mailbox_id: 'pessoal',
            owner: { $in: duplicateOwners },
            _id: { $ne: updated?._id }
          });
        } catch {
          /* noop */
        }
      }
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);
      const sharedMailboxId = String(mailbox?._id || mailboxId);

      updated = await CondMsgSignaturePref.findOneAndUpdate(
        {
          owner: sharedMailboxId,
          mailbox_id: sharedMailboxId
        },
        {
          $set: {
            enabled,
            text
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      ).lean();
    }

    return res.json({
      enabled: !!updated?.enabled,
      text: String(updated?.text || '')
    });
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][PUT /api/msg/signature] erro:', e);
    return res.status(500).json({ error: 'Falha ao salvar assinatura' });
  }
});

router.get('/groups', async (req, res, next) => {
  try {
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const mailboxId = String(req.query.mailboxId || req.query.mailbox_id || '').trim();
    if (!mailboxId) return res.status(400).json({ error: 'mailboxId é obrigatório' });

    let filter = null;

    if (mailboxId === 'pessoal') {
      const compat = buildPersonalGroupOwnerCompat(ctxUser, req);
      filter = compat.buildFilter();
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);
      const sharedMailboxId = String(mailbox?._id || mailboxId);

      filter = {
        mailbox_id: sharedMailboxId,
        owner: '',
        ativo: { $ne: false }
      };
    }

    const docs = await CondMsgGroup.find(filter)
      .sort({ name: 1, createdAt: -1 })
      .lean();

    return res.json((docs || []).map(toGroupClient).filter(Boolean));
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][GET /api/msg/groups] erro:', e);
    return res.status(500).json({ error: 'Falha ao carregar grupos' });
  }
});

router.post('/groups', express.json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const mailboxId = String(req.body?.mailboxId || req.body?.mailbox_id || '').trim();
    const name = String(req.body?.name || req.body?.nome || '').trim();

    if (!mailboxId) return res.status(400).json({ error: 'mailboxId é obrigatório' });
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });

    let targetMailboxId = 'pessoal';
    let owner = '';
    let unidadeId = null;

    if (mailboxId === 'pessoal') {
      owner = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();

      if (!owner) {
        return res.status(400).json({
          error: 'Usuário inválido'
        });
      }

      const uid = getUserUnidadeId(ctxUser);
      if (uid && mongoose.isValidObjectId(uid)) unidadeId = uid;
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);

      targetMailboxId = String(mailbox?._id || mailboxId);
      owner = '';
      unidadeId = mailbox?.unidade_id || null;
    }

    const createdBy = getMsgOwnerKey(ctxUser, req) || String(ctxUser?.nome || ctxUser?.name || '').trim();
    const members = sanitizeGroupMembers(req.body?.members);

    const doc = await CondMsgGroup.create({
      mailbox_id: targetMailboxId,
      owner,
      name,
      members,
      unidade_id: unidadeId,
      createdBy,
      ativo: true
    });

    return res.status(201).json(toGroupClient(doc));
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][POST /api/msg/groups] erro:', e);
    return res.status(500).json({ error: 'Falha ao criar grupo' });
  }
});

router.patch('/groups/:id', express.json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const id = String(req.params.id || '').trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const doc = await CondMsgGroup.findById(id);
    if (!doc || doc.ativo === false) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    const mailboxId = String(doc.mailbox_id || '').trim();

    if (mailboxId === 'pessoal') {
      const admin = userCanScopeAll(ctxUser);
      const compat = buildPersonalGroupOwnerCompat(ctxUser, req);
      const ok = compat.matchesDocOwner(doc.owner);

      if (!admin && !ok) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    } else {
      await loadMsgMailboxForSignature(mailboxId, ctxUser);
    }

    if (req.body && (req.body.name != null || req.body.nome != null)) {
      const name = String(req.body.name || req.body.nome || '').trim();
      if (!name) return res.status(400).json({ error: 'name inválido' });
      doc.name = name;
    }

    if (req.body && req.body.members != null) {
      doc.members = sanitizeGroupMembers(req.body.members);
    }

    await doc.save();

    return res.json(toGroupClient(doc));
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][PATCH /api/msg/groups/:id] erro:', e);
    return res.status(500).json({ error: 'Falha ao atualizar grupo' });
  }
});

router.delete('/groups/:id', async (req, res, next) => {
  try {
    const ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const id = String(req.params.id || '').trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const doc = await CondMsgGroup.findById(id);
    if (!doc || doc.ativo === false) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    const mailboxId = String(doc.mailbox_id || '').trim();

    if (mailboxId === 'pessoal') {
      const admin = userCanScopeAll(ctxUser);
      const compat = buildPersonalGroupOwnerCompat(ctxUser, req);
      const ok = compat.matchesDocOwner(doc.owner);

      if (!admin && !ok) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    } else {
      await loadMsgMailboxForSignature(mailboxId, ctxUser);
    }

    doc.ativo = false;
    await doc.save();

    return res.json({ ok: true, id });
  } catch (e) {
    const st = e && e.status ? Number(e.status) : 500;
    if (st !== 500) return res.status(st).json({ error: String(e.message || 'Erro') });

    console.error('[mensagens][DELETE /api/msg/groups/:id] erro:', e);
    return res.status(500).json({ error: 'Falha ao excluir grupo' });
  }
});

router.post('/messages', (req, res, next) => {
  const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
  const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
    || refLower.includes('/portal-morador');

  // Importante: para Portal, cair na façade ANTES de ler o body.
  if (fromPortal) return next();

  return mensagensUpload.array('anexos', 15)(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({
        error: uploadErr?.message || 'Falha ao processar anexos.'
      });
    }

    try {
      let ctxUser = getCtxUser(req);
      if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

      if (mongoose.connection.readyState !== 1) {
        const ok = await ensureMongoReady();

        if (!ok) {
          try { res.set('Retry-After', '5'); } catch {}
          return res.status(503).json({ error: 'DB indisponível' });
        }
      }

      const ct = String(req.headers['content-type'] || '').toLowerCase();
      const rawPayload = ct.includes('multipart/form-data') ? String(req.body?.payload || '') : '';
      const payload = rawPayload ? JSON.parse(rawPayload || '{}') : (req.body || {});

      const files = Array.isArray(req.files) ? req.files : [];

      const fromMailboxId = String(payload?.fromMailboxId || payload?.from_mailbox_id || '').trim() || 'pessoal';
      const assunto = String(payload?.assunto || payload?.subject || '').trim();
      const bodyHtml = String(payload?.bodyHtml || payload?.body_html || '').trim();
      const bodyText = String(payload?.bodyText || payload?.body_text || '').trim();
      const assinaturaAtiva = !!(payload?.assinaturaAtiva ?? payload?.signatureEnabled);
      const assinaturaTexto = String(payload?.assinaturaTexto || payload?.signatureText || '').trim();
      const clientNonceRaw = String(payload?.clientNonce || payload?.client_nonce || '').trim();
      const clientNonce = clientNonceRaw ? clientNonceRaw.slice(0, 120) : '';

      const to = sanitizeMessageRecipients(payload?.to);
      const cc = sanitizeMessageRecipients(payload?.cc);

      const threadRootIdRaw = String(payload?.threadRootId || payload?.thread_root_id || '').trim();
      const inReplyToIdRaw = String(payload?.inReplyToId || payload?.in_reply_to || '').trim();
      const forwardedFromIdRaw = String(payload?.forwardedFromId || payload?.forwarded_from_id || '').trim();

      const threadRootId = threadRootIdRaw && mongoose.isValidObjectId(threadRootIdRaw)
        ? new mongoose.Types.ObjectId(threadRootIdRaw)
        : null;

      const inReplyToId = inReplyToIdRaw && mongoose.isValidObjectId(inReplyToIdRaw)
        ? new mongoose.Types.ObjectId(inReplyToIdRaw)
        : null;

      const forwardedFromId = forwardedFromIdRaw && mongoose.isValidObjectId(forwardedFromIdRaw)
        ? new mongoose.Types.ObjectId(forwardedFromIdRaw)
        : null;

      if (!to.length) return res.status(400).json({ error: 'Informe ao menos um destinatário em Para.' });
      if (!assunto) return res.status(400).json({ error: 'Assunto é obrigatório.' });
      if (!bodyText) return res.status(400).json({ error: 'Mensagem é obrigatória.' });

      for (const member of [...to, ...cc]) {
        const type = String(member?.type || '').trim().toLowerCase();

        if (type === 'mailbox') {
          const mailboxId = String(member?.mailboxId || '').trim();

          if (!mailboxId || !mongoose.isValidObjectId(mailboxId)) {
            return res.status(400).json({ error: 'Caixa destinatária inválida.' });
          }

          const exists = await CondMsgMailbox.exists({
            _id: mailboxId,
            ativo: { $ne: false }
          });

          if (!exists) {
            return res.status(400).json({ error: 'Caixa destinatária não encontrada.' });
          }

          continue;
        }

        const email = String(member?.email || '').trim().toLowerCase();

        if (!isEmailish(email)) {
          return res.status(400).json({ error: 'Destinatário pessoal inválido.' });
        }
      }

      let unidadeId = null;
      let fromMailboxName = '';
      let fromOwner = '';

      if (fromMailboxId === 'pessoal') {
        fromOwner = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();

        if (!isEmailish(fromOwner)) {
          return res.status(400).json({
            error: 'Não foi possível determinar o e-mail do remetente para enviar pela caixa pessoal.'
          });
        }

        const uid = getUserUnidadeId(ctxUser);
        if (uid && mongoose.isValidObjectId(uid)) unidadeId = uid;

        fromMailboxName = String(payload?.fromMailboxName || 'Pessoal').trim() || 'Pessoal';
      } else {
        const mailbox = await loadMsgMailboxForSend(fromMailboxId);

        if (!userCanSendFromMailbox(mailbox, ctxUser)) {
          return res.status(403).json({ error: 'Sem permissão para enviar pela caixa.' });
        }

        unidadeId = mailbox.unidade_id || null;
        fromMailboxName = String(mailbox.name || '').trim();
        fromOwner = '';
      }

      if (clientNonce) {
        const existing = await CondMsgMessage.findOne({
          client_nonce: clientNonce,
          from_mailbox_id: fromMailboxId,
          ativo: { $ne: false }
        }).select('_id protocolo').lean().catch(() => null);

        if (existing && existing._id) {
          return res.status(201).json({
            ok: true,
            id: String(existing._id),
            protocolo: String(existing.protocolo || '').trim(),
            deduped: true
          });
        }
      }

      const createdBy = String(ctxUser?.nome || ctxUser?.name || '').trim()
        || String(ctxUser?.email || ctxUser?.userEmail || '').trim()
        || String(getMsgOwnerKey(ctxUser, req) || '').trim();

      const initialStates = buildInitialMessageStates({
        fromMailboxId,
        fromOwner,
        to,
        cc
      });

      let doc = null;
      let protocolo = '';

      for (let i = 0; i < 7; i++) {
        protocolo = generateMsgProtocolo();

        try {
          let finalThreadRoot = threadRootId;

          if (!finalThreadRoot && (inReplyToId || forwardedFromId)) {
            finalThreadRoot = inReplyToId || forwardedFromId;
          }

          doc = await CondMsgMessage.create({
            protocolo,
            ano: new Date().getFullYear(),
            from_mailbox_id: fromMailboxId,
            from_mailbox_name: fromMailboxName,
            from_owner: String(fromOwner || '').trim().toLowerCase(),
            client_nonce: clientNonce || '',
            to,
            cc,
            assunto,
            body_html: bodyHtml,
            body_text: bodyText,
            assinatura_ativa: assinaturaAtiva,
            assinatura_texto: assinaturaTexto,
            anexos: [],
            thread_root_id: finalThreadRoot,
            in_reply_to: inReplyToId,
            forwarded_from_id: forwardedFromId,
            acessos: [],
            states: initialStates,
            unidade_id: unidadeId,
            createdBy,
            ativo: true
          });

          break;
        } catch (e) {
          const isDup = e && (e.code === 11000 || String(e?.message || '').includes('duplicate key'));

          if (isDup) {
            if (clientNonce) {
              const existing = await CondMsgMessage.findOne({
                client_nonce: clientNonce,
                from_mailbox_id: fromMailboxId,
                ativo: { $ne: false }
              }).select('_id protocolo').lean().catch(() => null);

              if (existing && existing._id) {
                return res.status(201).json({
                  ok: true,
                  id: String(existing._id),
                  protocolo: String(existing.protocolo || '').trim(),
                  deduped: true
                });
              }
            }

            doc = null;
            continue;
          }

          throw e;
        }
      }

      if (!doc) {
        return res.status(500).json({
          error: 'Não foi possível gerar protocolo único para a mensagem.'
        });
      }

      if (files.length) {
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN
          || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
          || process.env.VERCEL_BLOB_RW_TOKEN
          || '';

        const inVercel = !!process.env.VERCEL;

        if (!(inVercel || blobToken)) {
          return res.status(400).json({
            error: 'Anexos exigem Vercel Blob. Configure BLOB_READ_WRITE_TOKEN (ou VERCEL_BLOB_RW_TOKEN) no ambiente.'
          });
        }

        const saved = [];

        try {
          for (const f of files.slice(0, 15)) {
            const original = String(f?.originalname || 'arquivo');
            const safeName = safeUploadName(original);
            const mime = String(f?.mimetype || 'application/octet-stream');
            const size = Number(f?.size) || 0;
            const buf = f?.buffer;

            if (!buf || !buf.length) continue;

            const key = `msg/${String(unidadeId || 'pessoal')}/${protocolo}/${Date.now()}_${safeName}`;

            const uploaded = await put(key, buf, {
              access: 'public',
              contentType: mime,
              cacheControl: 'public, max-age=31536000, immutable',
              ...(blobToken ? { token: blobToken } : {})
            });

            const caminho = String(uploaded?.pathname || uploaded?.path || key || '').trim();

            saved.push({
              nome: original,
              mime,
              tamanho: size,
              url: String(uploaded?.url || '').trim(),
              caminho
            });
          }
        } catch (e) {
          console.error('[mensagens][POST /api/msg/messages] upload anexos erro:', e);

          return res.status(500).json({
            error: 'Falha ao salvar anexos da mensagem.'
          });
        }

        if (saved.length) {
          doc.anexos = saved;

          try {
            if (typeof doc.markModified === 'function') doc.markModified('anexos');
          } catch {}

          await doc.save();
        }
      }

      return res.status(201).json({
        ok: true,
        id: String(doc._id || ''),
        protocolo
      });
    } catch (e) {
      const st = e && e.status ? Number(e.status) : 500;

      if (st !== 500) {
        return res.status(st).json({
          error: e?.message || 'Falha ao enviar mensagem.'
        });
      }

      console.error('[mensagens][POST /api/msg/messages] erro:', e);

      return res.status(500).json({
        error: 'Falha ao enviar mensagem.'
      });
    }
  });
});

router.post('/messages/actions', express.json({ limit: '128kb' }), async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Portal continua na façade.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    const mailboxId = String(req.body?.mailboxId || req.body?.mailbox_id || '').trim() || 'pessoal';

    // Neste microcorte, só caixa pessoal.
    if (mailboxId !== 'pessoal') return next();

    const action = String(req.body?.action || '').trim().toLowerCase();

    const allowedActions = new Set([
      'archive',
      'unarchive',
      'trash',
      'restore',
      'delete',
      'pin',
      'unread',
      'read',
      'marker'
    ]);

    if (!action) return res.status(400).json({ error: 'action é obrigatório' });
    if (!allowedActions.has(action)) return res.status(400).json({ error: 'Ação inválida.' });

    const marker = action === 'marker'
      ? normalizeMarkerName(req.body?.marker)
      : '';

    if (action === 'marker' && !marker) {
      return res.status(400).json({ error: 'Marcador inválido.' });
    }

    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean)
      : [];

    if (!ids.length) return res.status(400).json({ error: 'ids é obrigatório' });

    const validIds = ids.filter(id => mongoose.isValidObjectId(id));
    if (!validIds.length) return res.status(400).json({ error: 'ids inválidos' });

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();

      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const scope = resolvePersonalMessageScope(ctxUser, req);

    if (!scope.owner) {
      return res.status(400).json({ error: 'Usuário inválido para aplicar ação.' });
    }

    const ownerCandidatesLower = buildPersonalOwnerCandidates(ctxUser, req, scope);
    const ownerMatcher = buildPersonalOwnerMatcher(scope, ownerCandidatesLower);

    const fromFolderRaw = String(
      req.body?.fromFolder ||
      req.body?.from_folder ||
      req.body?.folder ||
      ''
    ).trim().toLowerCase();

    const fromFolder = ['entrada', 'saida', 'arquivo', 'lixeira'].includes(fromFolderRaw)
      ? fromFolderRaw
      : '';

    const seedDocs = await CondMsgMessage.find({
      _id: { $in: validIds },
      ativo: { $ne: false }
    })
      .select('_id thread_root_id')
      .lean();

    if (!seedDocs.length) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const actionsByThread = new Set([
      'trash',
      'delete',
      'archive',
      'unarchive',
      'restore',
      'pin'
    ]);

    let idsToAct = validIds;

    if (actionsByThread.has(action)) {
      const rootIds = Array.from(new Set(
        (seedDocs || [])
          .map(rootIdForMessageAction)
          .filter(id => id && mongoose.isValidObjectId(id))
      ));

      const rootObjIds = rootIds.map(id => new mongoose.Types.ObjectId(id));

      if (rootObjIds.length) {
        const related = await CondMsgMessage.find({
          ativo: { $ne: false },
          $or: [
            { _id: { $in: rootObjIds } },
            { thread_root_id: { $in: rootObjIds } }
          ]
        })
          .select('_id')
          .lean();

        const expanded = Array.from(new Set(
          (related || [])
            .map(d => String(d?._id || '').trim())
            .filter(id => id && mongoose.isValidObjectId(id))
        ));

        if (expanded.length) idsToAct = expanded;
      }
    }

    let docs = await CondMsgMessage.find({
      _id: { $in: idsToAct },
      ativo: { $ne: false }
    });

    docs = (docs || []).filter(d => {
      if (personalMessageDeletedForScope(d, ownerMatcher)) return false;
      return canAccessPersonalMessage(d, ctxUser, scope, ownerMatcher);
    });

    if (!docs.length) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (action === 'delete') {
      docs = docs.filter(d => isPersonalMessageInTrashForScope(d, ownerMatcher));

      if (!docs.length) {
        return res.status(400).json({
          error: 'A mensagem precisa estar na lixeira para exclusão definitiva.'
        });
      }
    }

    if (action === 'restore') {
      docs = docs.filter(d => isPersonalMessageInTrashForScope(d, ownerMatcher));

      if (!docs.length) {
        return res.status(400).json({
          error: 'A mensagem não está na lixeira.'
        });
      }
    }

    if (action === 'unarchive') {
      docs = docs.filter(d => isPersonalMessageArchivedForScope(d, ownerMatcher));

      if (!docs.length) {
        return res.status(400).json({
          error: 'A mensagem não está no arquivo.'
        });
      }
    }

    if (action === 'pin') {
      const alreadyPinned = await CondMsgMessage.find({
        ativo: { $ne: false },
        states: {
          $elemMatch: {
            mailbox_id: 'pessoal',
            fixada_em: { $ne: null }
          }
        }
      })
        .select('states')
        .lean()
        .catch(() => []);

      const pinnedCount = (alreadyPinned || []).filter(d => {
        const st = findPersonalMessageState(d, ownerMatcher, { includeDeleted: false });
        return !!(st?.fixada_em && !st?.lixeira_em);
      }).length;

      const willPin = docs.some(d => {
        const st = findPersonalMessageState(d, ownerMatcher, { includeDeleted: false });
        return !(st?.fixada_em);
      });

      if (willPin && pinnedCount >= 10) {
        return res.status(400).json({
          error: 'Limite de 10 mensagens fixadas atingido.'
        });
      }
    }

    if (action === 'marker') {
      const markerLower = marker.toLowerCase();

      const wouldExceedMarkerLimit = docs.some(d => {
        const st = findPersonalMessageState(d, ownerMatcher, { includeDeleted: false });

        const current = Array.isArray(st?.marcadores)
          ? st.marcadores.map(x => normalizeMarkerName(x)).filter(Boolean)
          : [];

        const hasMarker = current.some(x => String(x || '').trim().toLowerCase() === markerLower);

        return !hasMarker && current.length >= 3;
      });

      if (wouldExceedMarkerLimit) {
        return res.status(400).json({
          error: 'Limite de 3 marcadores por mensagem.'
        });
      }
    }

    const now = new Date();
    let modified = 0;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';

    for (const doc of docs) {
      const changed = applyPersonalMessageStateAction(doc, scope, ownerMatcher, action, {
        now,
        fromFolder,
        marker
      });

      if (!changed) continue;

      try {
        if (typeof doc.markModified === 'function') doc.markModified('states');
      } catch {}

      await doc.save();

      if (
        action === 'delete'
        && process.env.ENABLE_DELETE_OLD_BLOB === '1'
        && allMessageStatesDeleted(doc)
      ) {
        await cleanupMsgBlobAttachments(doc.anexos, blobToken);
      }

      modified++;
    }

    return res.json({
      ok: true,
      modified,
      action
    });
  } catch (e) {
    console.error('[mensagens][POST /api/msg/messages/actions] erro:', e);
    return res.status(500).json({ error: 'Falha ao aplicar ação em mensagens' });
  }
});

router.get('/messages/:id', async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Portal continua na façade.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    const mailboxId = String(req.query.mailboxId || req.query.mailbox_id || '').trim() || 'pessoal';

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();

      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const id = String(req.params?.id || '').trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

    let scope = null;
    let ownerMatcher = null;

    if (mailboxId === 'pessoal') {
      scope = resolvePersonalMessageScope(ctxUser, req);

      if (!scope.owner) {
        return res.status(400).json({ error: 'Usuário inválido para carregar mensagem.' });
      }

      const ownerCandidatesLower = buildPersonalOwnerCandidates(ctxUser, req, scope);
      ownerMatcher = buildPersonalOwnerMatcher(scope, ownerCandidatesLower);
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);

      scope = {
        mailboxId: String(mailbox?._id || mailboxId),
        owner: ''
      };

      ownerMatcher = null;
    }

    const doc = await CondMsgMessage.findOne({
      _id: id,
      ativo: { $ne: false }
    }).lean();

    if (!doc) return res.status(404).json({ error: 'Mensagem não encontrada' });

    if (messageDeletedForScope(doc, scope, ownerMatcher)) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (!canAccessMessageForScope(doc, ctxUser, scope, ownerMatcher)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const item = toMessageDetailItemScoped(doc, scope, ownerMatcher);

    const rootId = doc.thread_root_id || doc._id;

    const rawThread = await CondMsgMessage.find({
      ativo: { $ne: false },
      $or: [
        { _id: rootId },
        { thread_root_id: rootId }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(220)
      .lean();

    const thread = (rawThread || [])
      .filter(d => {
        if (messageDeletedForScope(d, scope, ownerMatcher)) return false;
        return canAccessMessageForScope(d, ctxUser, scope, ownerMatcher);
      })
      .map(d => toMessageDetailItemScoped(d, scope, ownerMatcher))
      .filter(Boolean);

    return res.json({
      ok: true,
      item,
      thread
    });
  } catch (e) {
    console.error('[mensagens][GET /api/msg/messages/:id] erro:', e);
    return res.status(500).json({ error: 'Falha ao carregar mensagem' });
  }
});

router.post('/messages/:id/read', express.json({ limit: '64kb' }), async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Portal continua na façade.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    const mailboxId = String(
      req.body?.mailboxId ||
      req.body?.mailbox_id ||
      req.query?.mailboxId ||
      req.query?.mailbox_id ||
      ''
    ).trim() || 'pessoal';

    // Neste microcorte, só caixa pessoal.
    if (mailboxId !== 'pessoal') return next();

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();

      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const id = String(req.params?.id || '').trim();

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const scope = resolvePersonalMessageScope(ctxUser, req);

    if (!scope.owner) {
      return res.status(400).json({ error: 'Usuário inválido para marcar mensagem.' });
    }

    const ownerCandidatesLower = buildPersonalOwnerCandidates(ctxUser, req, scope);
    const ownerMatcher = buildPersonalOwnerMatcher(scope, ownerCandidatesLower);

    const doc = await CondMsgMessage.findOne({
      _id: id,
      ativo: { $ne: false }
    });

    if (!doc) return res.status(404).json({ error: 'Mensagem não encontrada' });

    if (personalMessageDeletedForScope(doc, ownerMatcher)) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (!canAccessPersonalMessage(doc, ctxUser, scope, ownerMatcher)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const markThread = !!(
      req.body?.thread ||
      req.body?.markThread ||
      req.body?.threadAll
    );

    const now = new Date();

    const markOne = async (targetDoc) => {
      if (!targetDoc) return false;

      if (personalMessageDeletedForScope(targetDoc, ownerMatcher)) return false;
      if (!canAccessPersonalMessage(targetDoc, ctxUser, scope, ownerMatcher)) return false;

      const st = ensurePersonalMessageState(targetDoc, scope, ownerMatcher);
      st.lida_em = st.lida_em || now;

      try {
        if (typeof targetDoc.markModified === 'function') targetDoc.markModified('states');
      } catch {}

      await targetDoc.save();
      return true;
    };

    let marked = 0;

    if (markThread) {
      const rootId = doc.thread_root_id || doc._id;

      const docs = await CondMsgMessage.find({
        ativo: { $ne: false },
        $or: [
          { _id: rootId },
          { thread_root_id: rootId }
        ]
      }).limit(220);

      for (const d of (docs || [])) {
        if (await markOne(d)) marked++;
      }
    } else {
      if (await markOne(doc)) marked++;
    }

    return res.json({
      ok: true,
      marked
    });
  } catch (e) {
    console.error('[mensagens][POST /api/msg/messages/:id/read] erro:', e);
    return res.status(500).json({ error: 'Falha ao marcar mensagem como lida' });
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Portal continua na façade neste microcorte.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    const mailboxId = String(req.query.mailboxId || req.query.mailbox_id || '').trim() || 'pessoal';

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();

      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    try {
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('CDN-Cache-Control', 'no-store');
    } catch {
      /* noop */
    }

    const folder = String(req.query.folder || req.query.view || 'entrada').trim().toLowerCase();

    let scope = null;
    let ownerCandidatesLower = [];

    if (mailboxId === 'pessoal') {
      scope = resolvePersonalMessageScope(ctxUser, req);

      if (!scope.owner) {
        return res.status(400).json({ error: 'Usuário inválido para carregar mensagens.' });
      }

      ownerCandidatesLower = buildPersonalOwnerCandidates(ctxUser, req, scope);
    } else {
      const mailbox = await loadMsgMailboxForSignature(mailboxId, ctxUser);

      scope = {
        mailboxId: String(mailbox?._id || mailboxId),
        owner: ''
      };

      ownerCandidatesLower = [];
    }

    const ownerSet = new Set(ownerCandidatesLower);
    const isPersonalMailbox = scope.mailboxId === 'pessoal';

    const baseEmailForOwnerMatch = isPersonalMailbox
      ? (() => {
          try {
            const fromOwner = ownerKeyBaseEmailLower(String(scope?.owner || '').trim().toLowerCase());
            if (isEmailish(fromOwner)) return fromOwner;

            const em = String(
              ctxUser?.email ||
              ctxUser?.userEmail ||
              ctxUser?.contato_email ||
              ctxUser?.contatoEmail ||
              ''
            ).trim().toLowerCase();

            return isEmailish(em) ? em : '';
          } catch {
            return '';
          }
        })()
      : '';

    const baseMatches = (ownerVal) => {
      try {
        if (!baseEmailForOwnerMatch) return false;

        const ownerLower = String(ownerVal || '').trim().toLowerCase();
        if (!ownerLower) return false;

        const base = ownerKeyBaseEmailLower(ownerLower) || normalizeEmailKey(ownerLower);

        return !!base && base === baseEmailForOwnerMatch;
      } catch {
        return false;
      }
    };

    const isOwnerMatch = (ownerVal) => {
      const ownerLower = String(ownerVal || '').trim().toLowerCase();
      if (!ownerLower) return false;
      if (ownerSet.size && ownerSet.has(ownerLower)) return true;
      return baseMatches(ownerLower);
    };

    const stateMailboxMatches = (s) =>
      String(s?.mailbox_id || '').trim() === String(scope.mailboxId || '').trim();

    const stateOwnerMatches = (s) => {
      const ownerLower = String(s?.owner || '').trim().toLowerCase();

      if (!isPersonalMailbox) {
        return ownerLower === '';
      }

      return isOwnerMatch(ownerLower);
    };

    const findScopeState = (doc) => {
      const states = Array.isArray(doc?.states) ? doc.states : [];

      if (isPersonalMailbox && scope.owner) {
        const exact = states.find(s =>
          stateMailboxMatches(s)
          && String(s?.owner || '').trim().toLowerCase() === String(scope.owner || '').trim().toLowerCase()
          && !s?.excluida_em
        );

        if (exact) return exact;
      }

      if (isPersonalMailbox && baseEmailForOwnerMatch) {
        const byBase = states.filter(s =>
          stateMailboxMatches(s)
          && baseMatches(s?.owner)
        );

        const readOne = byBase.find(s => !!s?.lida_em && !s?.excluida_em);
        if (readOne) return readOne;

        const firstActive = byBase.find(s => !s?.excluida_em);
        if (firstActive) return firstActive;
      }

      const direct = states.find(s =>
        stateMailboxMatches(s)
        && stateOwnerMatches(s)
        && !s?.excluida_em
      );

      if (direct) return direct;

      return states.find(s =>
        stateMailboxMatches(s)
        && stateOwnerMatches(s)
      );
    };

    const hasOnlyDeletedStateForScope = (doc) => {
      const states = Array.isArray(doc?.states) ? doc.states : [];

      const scoped = states.filter(s =>
        stateMailboxMatches(s)
        && stateOwnerMatches(s)
      );

      return scoped.length > 0 && scoped.every(s => !!s?.excluida_em);
    };

    const qText = String(req.query.q || req.query.texto || '').trim();
    const qProt = String(req.query.protocolo || '').trim();
    const qStatus = String(req.query.status || '').trim().toLowerCase();
    const qComAnexo = String(req.query.comAnexo || req.query.com_anexo || '').trim();
    const qSemMarcador = String(req.query.semMarcador || req.query.sem_marcador || '').trim();
    const qMarker = normalizeMarkerName(req.query.marker || req.query.marcador || req.query.tag || '');
    const qDe = String(req.query.de || '').trim();
    const qPara = String(req.query.para || '').trim();
    const qIni = String(req.query.ini || req.query.inicio || '').trim();
    const qFim = String(req.query.fim || '').trim();

    const pageSizeRaw = Number(
      req.query.pageSize ||
      req.query.page_size ||
      req.query.perPage ||
      req.query.per_page ||
      req.query.limit ||
      25
    ) || 25;

    const pageSize = [10, 25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;
    const pageRaw = Number(req.query.page || 1) || 1;
    const pageReq = Math.max(1, Math.floor(pageRaw));
    const scanLimit = Math.min(5000, Math.max(pageReq * pageSize, 250));

    const filter = { ativo: { $ne: false } };

    if (!isPersonalMailbox) {
      if (folder === 'saida') {
        filter.from_mailbox_id = scope.mailboxId;
      } else {
        const includeSent = folder === 'lixeira' || folder === 'arquivo';

        const ors = [
          {
            to: {
              $elemMatch: {
                type: 'mailbox',
                mailboxId: scope.mailboxId
              }
            }
          },
          {
            cc: {
              $elemMatch: {
                type: 'mailbox',
                mailboxId: scope.mailboxId
              }
            }
          },
          {
            states: {
              $elemMatch: {
                mailbox_id: scope.mailboxId,
                owner: ''
              }
            }
          }
        ];

        if (includeSent) {
          ors.push({
            from_mailbox_id: scope.mailboxId
          });
        }

        filter.$or = ors;
      }
    } else if (folder === 'saida') {
      const ownerExact = String(scope.owner || '').trim().toLowerCase();
      const baseEmail = ownerKeyBaseEmailLower(ownerExact);
      const basePrefixRx = isEmailish(baseEmail)
        ? new RegExp('^' + escapeRegExp(baseEmail) + '::')
        : null;

      const cands = ownerCandidatesLower.length ? ownerCandidatesLower : [ownerExact].filter(Boolean);

      filter.from_mailbox_id = 'pessoal';
      filter.$or = [
        { from_owner: cands.length > 1 ? { $in: cands } : cands[0] },
        ...(basePrefixRx ? [{ from_owner: basePrefixRx }] : []),
        { createdBy: { $in: cands } }
      ];
    } else {
      const includeSent = folder === 'lixeira' || folder === 'arquivo';

      const recipientKeyCandidatesLower = [];

      const addRecipientCandidate = (v) => {
        const s = String(v || '').trim().toLowerCase();
        if (!s) return;
        if (!recipientKeyCandidatesLower.includes(s)) recipientKeyCandidatesLower.push(s);
      };

      addRecipientCandidate(scope.owner);
      ownerCandidatesLower.forEach(addRecipientCandidate);

      const baseEmail = (() => {
        try {
          const fromOwner = ownerKeyBaseEmailLower(String(scope?.owner || '').trim().toLowerCase());
          if (isEmailish(fromOwner)) return fromOwner;

          const em = String(
            ctxUser?.email ||
            ctxUser?.userEmail ||
            ctxUser?.contato_email ||
            ctxUser?.contatoEmail ||
            ''
          ).trim().toLowerCase();

          return isEmailish(em) ? em : '';
        } catch {
          return '';
        }
      })();

      const basePrefixRx = isEmailish(baseEmail)
        ? new RegExp('^' + escapeRegExp(baseEmail) + '::')
        : null;

      if (isEmailish(baseEmail)) {
        addRecipientCandidate(baseEmail);
        addRecipientCandidate(`${baseEmail}::portal`);
        addRecipientCandidate(`${baseEmail}::colab`);
      }

      const recipientKeyRxs = recipientKeyCandidatesLower.map(k =>
        new RegExp('^\\s*' + escapeRegExp(k) + '\\s*$', 'i')
      );

      const ors = [];

      if (recipientKeyRxs.length) {
        ors.push(
          { 'to.email': { $in: recipientKeyRxs } },
          { 'cc.email': { $in: recipientKeyRxs } }
        );
      }

      if (ownerCandidatesLower.length) {
        ors.push({
          states: {
            $elemMatch: {
              mailbox_id: 'pessoal',
              owner: { $in: ownerCandidatesLower }
            }
          }
        });
      }

      if (basePrefixRx) {
        ors.push({
          states: {
            $elemMatch: {
              mailbox_id: 'pessoal',
              owner: basePrefixRx
            }
          }
        });
      }

      if (includeSent) {
        ors.push({
          from_mailbox_id: 'pessoal',
          from_owner: ownerCandidatesLower.length > 1
            ? { $in: ownerCandidatesLower }
            : String(scope.owner || '').trim().toLowerCase()
        });

        if (basePrefixRx) {
          ors.push({
            from_mailbox_id: 'pessoal',
            from_owner: basePrefixRx
          });
        }
      }

      filter.$or = ors;
    }

    const dateFilter = {};

    if (qIni) {
      const di = new Date(`${qIni}-01T00:00:00.000Z`);
      if (!isNaN(di)) dateFilter.$gte = di;
    }

    if (qFim) {
      const df = new Date(`${qFim}-01T00:00:00.000Z`);

      if (!isNaN(df)) {
        const nextDate = new Date(df);
        nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
        dateFilter.$lt = nextDate;
      }
    }

    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
    if (qProt) filter.protocolo = new RegExp(escapeRegExp(qProt), 'i');
    if (qText) filter.assunto = new RegExp(escapeRegExp(qText), 'i');
    if (qComAnexo === '1' || qComAnexo === 'true') filter['anexos.0'] = { $exists: true };

    let docs = await CondMsgMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(scanLimit)
      .lean();

    docs = (docs || []).filter(d => !hasOnlyDeletedStateForScope(d));

    docs = (docs || []).map(d => {
      const fake = { ...d, states: Array.isArray(d.states) ? d.states : [] };
      const st = findScopeState(fake);

      if (!st) {
        fake.__wdg_state_injected = true;

        const canonicalOwner = isPersonalMailbox
          ? (scope.owner || ownerCandidatesLower[0] || '')
          : '';

        fake.states = [
          ...fake.states,
          {
            mailbox_id: scope.mailboxId,
            owner: canonicalOwner,
            lida_em: null,
            arquivada_em: null,
            arquivada_de: '',
            lixeira_em: null,
            lixeira_de: '',
            excluida_em: null,
            fixada_em: null,
            marcadores: []
          }
        ];
      }

      return fake;
    });

    docs = docs.filter(d => {
      const st = findScopeState(d);
      const arquivada = !!st?.arquivada_em;
      const lixeira = !!st?.lixeira_em;

      if (folder === 'arquivo') return arquivada && !lixeira;
      if (folder === 'lixeira') return lixeira;

      return !arquivada && !lixeira;
    });

    if (folder === 'saida') {
      docs = (docs || []).filter(d => {
        try {
          const fromMailboxId = String(d?.from_mailbox_id || '').trim();

          if (!isPersonalMailbox) {
            return fromMailboxId === scope.mailboxId;
          }

          if (fromMailboxId !== 'pessoal') return false;

          const fromOwnerLower = String(d?.from_owner || '').trim().toLowerCase();
          if (fromOwnerLower && isOwnerMatch(fromOwnerLower)) return true;

          const createdByLower = String(d?.createdBy || '').trim().toLowerCase();

          return !!(
            createdByLower &&
            Array.isArray(ownerCandidatesLower) &&
            ownerCandidatesLower.includes(createdByLower)
          );
        } catch {
          return false;
        }
      });
    }

    if (folder === 'entrada') {
      docs = docs.filter(d => {
        try {
          const fromMailboxId = String(d?.from_mailbox_id || '').trim();

          const sentFromThisScope = isPersonalMailbox
            ? (
                fromMailboxId === 'pessoal'
                && isOwnerMatch(String(d?.from_owner || '').trim().toLowerCase())
              )
            : fromMailboxId === scope.mailboxId;

          if (!sentFromThisScope) return true;

          const listTo = Array.isArray(d?.to) ? d.to : [];
          const listCc = Array.isArray(d?.cc) ? d.cc : [];

          if (!isPersonalMailbox) {
            const mailboxMatchesScope = (m) => {
              const type = String(m?.type || '').trim().toLowerCase();
              const mb = String(m?.mailboxId || m?.mailbox_id || '').trim();

              return type === 'mailbox' && mb === scope.mailboxId;
            };

            return listTo.some(mailboxMatchesScope) || listCc.some(mailboxMatchesScope);
          }

          const emailMatchesOwner = (m) => {
            const em = String(m?.email || '').trim().toLowerCase();
            if (!em) return false;
            if (isOwnerMatch(em)) return true;

            if (baseEmailForOwnerMatch) {
              const base = ownerKeyBaseEmailLower(em) || normalizeEmailKey(em) || '';
              if (base && base === baseEmailForOwnerMatch) return true;
            }

            return false;
          };

          const sentToSelf = listTo.some(emailMatchesOwner) || listCc.some(emailMatchesOwner);

          return sentToSelf;
        } catch {
          return true;
        }
      });
    }

    if (qStatus === 'lidas' || qStatus === 'nao_lidas' || qStatus === 'não_lidas') {
      const wantRead = qStatus === 'lidas';

      const isReadForScope = (doc) => {
        try {
          const st = findScopeState(doc);
          if (st?.lida_em) return true;

          if (baseEmailForOwnerMatch) {
            const states = Array.isArray(doc?.states) ? doc.states : [];

            return states.some(s =>
              String(s?.mailbox_id || '').trim() === 'pessoal'
              && !s?.excluida_em
              && baseMatches(s?.owner)
              && !!s?.lida_em
            );
          }

          return false;
        } catch {
          return false;
        }
      };

      docs = docs.filter(d => {
        if (d && d.__wdg_state_injected) return false;

        const read = isReadForScope(d);
        return wantRead ? read : !read;
      });
    }

    if (qMarker) {
      docs = docs.filter(d => {
        const st = findScopeState(d);
        const markers = Array.isArray(st?.marcadores) ? st.marcadores : [];

        return markers.some(m => String(m || '').trim().toLowerCase() === qMarker.toLowerCase());
      });
    }

    if (qSemMarcador === '1' || qSemMarcador === 'true') {
      docs = docs.filter(d => {
        const st = findScopeState(d);
        const markers = Array.isArray(st?.marcadores) ? st.marcadores : [];

        return markers.length === 0;
      });
    }

    if (qDe) {
      const needle = qDe.toLowerCase();

      docs = docs.filter(d => {
        const values = [
          d.from_mailbox_name,
          d.from_mailbox_id,
          d.from_owner,
          d.createdBy,
          d.__remetente_display
        ].map(v => String(v || '').toLowerCase());

        return values.some(v => v.includes(needle));
      });
    }

    if (qPara) {
      const needle = qPara.toLowerCase();

      docs = docs.filter(d => {
        const list = [...(d.to || []), ...(d.cc || [])];

        return list.some(m => {
          const values = [
            m?.name,
            m?.nome,
            m?.email,
            m?.mailboxId
          ].map(v => String(v || '').toLowerCase());

          return values.some(v => v.includes(needle));
        });
      });
    }

    const total = docs.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pageReq, pages);
    const start = (page - 1) * pageSize;
    const paged = docs.slice(start, start + pageSize);

    const items = paged
      .map(d => toMessageListItem(d, scope, folder))
      .filter(Boolean);

    return res.json({
      ok: true,
      items,
      total,
      page,
      pageSize,
      pages
    });
  } catch (e) {
    console.error('[mensagens][GET /api/msg/messages] erro:', e);
    return res.status(500).json({ error: 'Falha ao listar mensagens' });
  }
});

router.get('/mailboxes/recipients', async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Neste microcorte, só migramos o contexto Gestor/Mensagens.
    // Portal continua caindo na façade do Condomínios.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    const wantDebug = String(req.query?.debug || req.query?.__debug || '').trim() === '1';
    const includeHabitacoes = String(
      req.query?.includeHabitacoes ||
      req.query?.include_habitacoes ||
      req.query?.habitacoes ||
      ''
    ).trim() === '1';

    try {
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('CDN-Cache-Control', 'no-store');
    } catch {}

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const admin = userCanScopeAll(ctxUser);
    const qUnidade = String(req.query.unidade_id || req.query.unidade || '').trim();
    const unidadeId = admin ? qUnidade : getUserUnidadeId(ctxUser);

    let groupSuspendedForUnit = false;

    try {
      const unitKey = String(unidadeId || '').trim();

      if (unitKey && mongoose.isValidObjectId(unitKey)) {
        const settings = await getOrInitMsgSettingsForUnidade(unitKey);
        groupSuspendedForUnit = !!(settings && settings.suspender_caixas_grupo);
      }
    } catch {
      /* noop */
    }

    const filter = { ativo: { $ne: false } };

    if (unidadeId) {
      if (!mongoose.isValidObjectId(unidadeId)) {
        return res.status(400).json({ error: 'unidade_id inválido' });
      }

      filter.unidade_id = unidadeId;
    }

    const docs = await CondMsgMailbox.find(filter)
      .sort({ unidade_nome: 1, name: 1, createdAt: -1 })
      .lean();

    let visible = docs || [];

    // Regra histórica: caixas de habitação não aparecem no Gestor por padrão.
    // Para seleção de destinatários, podem ser habilitadas por query.
    if (!includeHabitacoes) {
      visible = (visible || []).filter(d => !mailboxIsHabitacao(d));
    }

    const out = (visible || [])
      .map(d => ({
        id: String(d._id || d.id || ''),
        name: d.name || '',
        type: d.type || 'grupo',
        unitId: d.unidade_id ? String(d.unidade_id) : '',
        unitName: d.unidade_nome || '',
        isPublic: mailboxIsPublic(d),
        linkType: d.link_type || '',
        linkId: d.link_id ? String(d.link_id) : ''
      }))
      .filter(x => x && x.id && x.name);

    if (groupSuspendedForUnit) {
      if (wantDebug) {
        const meta = buildMailboxesDebugMeta(ctxUser, req, {
          unidadeId: unidadeId || '',
          counts: {
            total: Array.isArray(docs) ? docs.length : 0,
            visible: 0
          },
          recipientsMode: true,
          rules: { groupSuspendedForUnit: true }
        });

        return res.json({ ok: true, data: [], debug: meta });
      }

      return res.json([]);
    }

    if (wantDebug) {
      const meta = buildMailboxesDebugMeta(ctxUser, req, {
        unidadeId: unidadeId || '',
        counts: {
          total: Array.isArray(docs) ? docs.length : 0,
          visible: Array.isArray(out) ? out.length : 0
        },
        recipientsMode: true
      });

      return res.json({ ok: true, data: out, debug: meta });
    }

    return res.json(out);
  } catch (e) {
    console.error('[mensagens][GET /api/msg/mailboxes/recipients] erro:', e);
    return res.status(500).json({ error: 'Falha ao listar caixas' });
  }
});

router.get('/mailboxes', async (req, res, next) => {
  try {
    const refLower = String(req?.headers?.referer || req?.headers?.Referer || '').toLowerCase();
    const fromPortal = String(req?.headers?.['x-wdg-portal'] || '').trim() === '1'
      || refLower.includes('/portal-morador');

    // Neste microcorte, só migramos o contexto Gestor/Mensagens.
    // Portal continua caindo na façade do Condomínios.
    if (fromPortal) return next();

    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    try {
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('CDN-Cache-Control', 'no-store');
    } catch {}

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const admin = userCanScopeAll(ctxUser);
    const qUnidade = String(req.query.unidade_id || req.query.unidade || '').trim();
    const unidadeId = admin ? qUnidade : getUserUnidadeId(ctxUser);

    const filter = { ativo: { $ne: false } };

    if (unidadeId) {
      if (!mongoose.isValidObjectId(unidadeId)) {
        return res.status(400).json({ error: 'unidade_id inválido' });
      }

      filter.unidade_id = unidadeId;
    }

    const docs = await CondMsgMailbox.find(filter)
      .sort({ unidade_nome: 1, name: 1, createdAt: -1 })
      .lean();

    // No Gestor/Mensagens, não listamos caixas de habitação.
    const docsFiltered = (docs || []).filter(d => !mailboxIsHabitacao(d));

    const visible = admin
      ? docsFiltered
      : (docsFiltered || []).filter(d => mailboxIsMember(d, ctxUser));

    const light = String(req.query.light || req.query.lightNavbar || '').trim() === '1';

    if (light) {
      const outLight = (visible || [])
        .map(d => ({
          id: String(d?._id || d?.id || ''),
          name: String(d?.name || ''),
          type: String(d?.type || 'grupo')
        }))
        .filter(d => d.id);

      return res.json(outLight);
    }

    const out = (visible || [])
      .map(d => {
        const mb = toMailboxClient(d);
        if (!mb) return null;

        let isMember = false;

        try {
          isMember = !!(admin || mailboxIsMember(d, ctxUser));
        } catch {
          isMember = !!admin;
        }

        mb.isMember = isMember;

        try {
          const perms = mailboxGetUserPerms(d, ctxUser);
          mb.canAdmin = !!(admin || (perms && typeof perms === 'object' && perms.administrar));

          try {
            mb.userPerms = sanitizeMailboxPerms(perms);
          } catch {
            mb.userPerms = sanitizeMailboxPerms({});
          }
        } catch {
          mb.canAdmin = !!admin;
          mb.userPerms = sanitizeMailboxPerms({});
        }

        try {
          const rawOps = Array.isArray(d?.operators) ? d.operators : [];

          mb.operators = rawOps
            .map(op => {
              if (typeof op === 'string') {
                const user = String(op || '').trim();
                if (!user) return null;
                return { user, perms: {}, displayName: '' };
              }

              if (op && typeof op === 'object') {
                const user = String(op.user || '').trim();
                if (!user) return null;

                const perms = op.perms && typeof op.perms === 'object'
                  ? op.perms
                  : {};

                const displayName = String(op.displayName || op.nome || op.name || '').trim();

                return { user, perms, displayName };
              }

              return null;
            })
            .filter(Boolean);
        } catch {
          mb.operators = [];
        }

        return mb;
      })
      .filter(Boolean);

    return res.json(out);
  } catch (e) {
    console.error('[mensagens][GET /api/msg/mailboxes] erro:', e);
    return res.status(500).json({ error: 'Falha ao listar caixas' });
  }
});

router.get('/recipients/perms', async (req, res) => {
  try {
    let ctxUser = getCtxUser(req);
    if (!ctxUser) return res.status(401).json({ error: 'Não autenticado' });

    try {
      res.set('Cache-Control', 'no-store');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      res.set('CDN-Cache-Control', 'no-store');
    } catch {
      /* noop */
    }

    if (mongoose.connection.readyState !== 1) {
      const ok = await ensureMongoReady();
      if (!ok) {
        try { res.set('Retry-After', '5'); } catch {}
        return res.status(503).json({ error: 'DB indisponível' });
      }
    }

    const recipientPermsContext = await preparePortalRecipientPermsContext({ ctxUser, req });
    ctxUser = recipientPermsContext.ctxUser;

    const { fromPortal, unidadeId, emailLower } = recipientPermsContext;

    if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
      if (userCanScopeAll(ctxUser)) {
        const perms = {
          permitir_pessoal_para_pessoal: true,
          permitir_pessoal_para_habitacao: true,
          permitir_pessoal_para_colaborador: true
        };

        return res.json({
          ok: true,
          unidadeId: null,
          email: emailLower,
          fromPortal: !!fromPortal,
          perms,
          allowP2PGlobal: true,
          effectiveAllowP2P: true,
          restrictNewMessageRecipients: false
        });
      }

      return res.status(403).json({
        error: 'Não foi possível determinar a unidade do usuário.'
      });
    }

    const settings = await getOrInitMsgSettingsForUnidade(unidadeId);

    const perms = resolveMsgRecipientPermsFromSettings(settings, emailLower);
    const allowP2PGlobal = !(settings && settings.permitir_pessoal_para_pessoal === false);
    const effectiveAllowP2P = !!(allowP2PGlobal && perms.permitir_pessoal_para_pessoal);
    const restricted = !(perms.permitir_pessoal_para_pessoal && perms.permitir_pessoal_para_habitacao && perms.permitir_pessoal_para_colaborador);

    return res.json({
      ok: true,
      unidadeId,
      email: emailLower,
      fromPortal: !!fromPortal,
      perms,
      allowP2PGlobal,
      effectiveAllowP2P,
      restrictNewMessageRecipients: restricted
    });
  } catch (e) {
    console.error('[mensagens][GET /api/msg/recipients/perms] erro:', e);
    return res.status(500).json({ error: 'Falha ao carregar permissões' });
  }
});

export default router;
