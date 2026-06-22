import express from 'express';

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

router.get('/health', (req, res) => {
  return res.json({
    ok: true,
    module: 'mensagens',
    api: 'msg'
  });
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
