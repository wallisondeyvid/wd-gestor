import express from 'express';
import CondMsgGroup from '#models/cond_msg_group.js';
import CondMsgSignaturePref from '#models/cond_msg_signature_pref.js';

import {
  getMsgOwnerKey,
  getUserUnidadeId,
  ownerKeyBaseEmailLower,
  resolveMsgRecipientPermsFromSettings,
  userCanScopeAll
} from './mensagens-api-helpers.js';

import {
  ensureMongoReady,
  getOrInitMsgSettingsForUnidade,
  mongoose
} from './mensagens-settings.js';

const router = express.Router();

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

    // Neste microcorte, só migramos a assinatura da caixa pessoal.
    // As assinaturas de caixas compartilhadas ainda caem na façade do Condomínios.
    if (mailboxId !== 'pessoal') return next();

    const signatureContext = preparePersonalSignatureContext({
      ctxUser,
      req,
      mailboxId
    });

    const { owner, baseEmail } = signatureContext;
    if (!owner) return res.status(400).json({ error: 'Usuário inválido' });

    let doc = await CondMsgSignaturePref.findOne({
      owner,
      mailbox_id: 'pessoal'
    }).lean();

    if (!doc && baseEmail && baseEmail !== owner) {
      doc = await CondMsgSignaturePref.findOne({
        owner: baseEmail,
        mailbox_id: 'pessoal'
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

    // Neste microcorte, só migramos a assinatura da caixa pessoal.
    // Assinaturas de caixas compartilhadas continuam caindo na façade do Condomínios.
    if (mailboxId !== 'pessoal') return next();

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

    const enabled = !!(req.body?.enabled ?? req.body?.assinaturaAtiva ?? req.body?.signatureEnabled);
    const text = normalizeSignaturePrefText(
      req.body?.text ??
      req.body?.assinaturaTexto ??
      req.body?.signatureText
    );

    const updated = await CondMsgSignaturePref.findOneAndUpdate(
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

    // Neste microcorte, só migramos grupos da caixa pessoal.
    // Grupos de caixas compartilhadas continuam caindo na façade do Condomínios.
    if (mailboxId !== 'pessoal') return next();

    const compat = buildPersonalGroupOwnerCompat(ctxUser, req);
    const filter = compat.buildFilter();

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

    // Neste microcorte, só migramos criação de grupos da caixa pessoal.
    // Grupos de caixas compartilhadas continuam caindo na façade do Condomínios.
    if (mailboxId !== 'pessoal') return next();

    const owner = String(getMsgOwnerKey(ctxUser, req) || '').trim().toLowerCase();

    if (!owner) {
      return res.status(400).json({
        error: 'Usuário inválido'
      });
    }

    let unidadeId = null;
    const uid = getUserUnidadeId(ctxUser);
    if (uid && mongoose.isValidObjectId(uid)) unidadeId = uid;

    const createdBy = getMsgOwnerKey(ctxUser, req) || String(ctxUser?.nome || ctxUser?.name || '').trim();
    const members = sanitizeGroupMembers(req.body?.members);

    const doc = await CondMsgGroup.create({
      mailbox_id: 'pessoal',
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

    // Neste microcorte, só migramos edição de grupos da caixa pessoal.
    // Grupos de caixas compartilhadas continuam caindo na façade do Condomínios.
    if (mailboxId !== 'pessoal') return next();

    const admin = userCanScopeAll(ctxUser);
    const compat = buildPersonalGroupOwnerCompat(ctxUser, req);
    const ok = compat.matchesDocOwner(doc.owner);

    if (!admin && !ok) {
      return res.status(403).json({ error: 'Acesso negado' });
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
