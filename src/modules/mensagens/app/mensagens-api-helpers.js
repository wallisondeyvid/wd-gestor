export function userCanScopeAll(user) {
  try {
    const role = String(user?.role || '').trim().toLowerCase();
    return !!(user && (user.isMaster || role === 'master' || role === 'admin'));
  } catch {
    return false;
  }
}

export function getUserIdentityKeyCandidates(user) {
  try {
    const out = [];
    const add = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (!s) return;
      if (out.includes(s)) return;
      out.push(s);
    };

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

export function getMsgIdentityKey(user, req) {
  const email = String(
    user?.email ||
    user?.userEmail ||
    user?.contato_email ||
    user?.contatoEmail ||
    ''
  ).trim().toLowerCase();

  if (email) return email;

  const id = String(
    req?.__wdgPortalCookieUserId ||
    user?.cond_usuario_id ||
    user?.condUsuarioId ||
    user?._id ||
    user?.id ||
    ''
  ).trim().toLowerCase();

  return id || '';
}

export function getMsgOwnerKey(user, req) {
  return getMsgIdentityKey(user, req);
}

export function getUserUnidadeId(ctxUser) {
  try {
    const ref = (
      ctxUser?.unidade_id ||
      ctxUser?.unidadeId ||
      ctxUser?.unidadeID ||
      ctxUser?.unidade ||
      ctxUser?.unidade_id_str ||
      ctxUser?.matriz_unidade_id ||
      ''
    );

    const raw = (ref && typeof ref === 'object')
      ? (ref._id || ref.id || ref)
      : ref;

    const s = String(raw || '').trim();
    return s;
  } catch {
    return '';
  }
}

export function ownerKeyBaseEmailLower(value) {
  try {
    let s = String(value || '').trim().toLowerCase();
    if (!s) return '';

    s = s
      .replace(/^userkey:\s*/i, '')
      .replace(/^user:\s*/i, '')
      .trim();

    const idx = s.indexOf('::');
    if (idx > 0) s = s.slice(0, idx).trim();

    return s.includes('@') ? s : '';
  } catch {
    return '';
  }
}

export function defaultCreatorPermsServer() {
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

export const MAILBOX_PERM_KEYS = [
  'administrar',
  'gerenciarMarcador',
  'lerMensagem',
  'criarMensagem',
  'gerenciarGrupos',
  'mensagemGeral',
  'excluirMensagem'
];

export function sanitizeMailboxPerms(raw) {
  const inPerms = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const k of MAILBOX_PERM_KEYS) {
    out[k] = !!inPerms[k];
  }
  return out;
}

export function mailboxGetUserPerms(mailboxDoc, user) {
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

    const perms = found && typeof found === 'object' && found.perms && typeof found.perms === 'object'
      ? found.perms
      : null;

    if (perms && typeof perms === 'object') return perms;

    const createdBy = String(mailboxDoc.createdBy || '').trim().toLowerCase();
    if (createdBy && meList.includes(createdBy)) return defaultCreatorPermsServer();

    return {};
  } catch {
    return {};
  }
}

export function resolveMsgRecipientPermsFromSettings(settings, emailKey) {
  const em = String(emailKey || '').trim().toLowerCase();

  const fallback = {
    permitir_pessoal_para_pessoal: true,
    permitir_pessoal_para_habitacao: true,
    permitir_pessoal_para_colaborador: true
  };

  if (!em || !em.includes('@')) return fallback;

  const list = Array.isArray(settings?.portal_user_perms)
    ? settings.portal_user_perms
    : [];

  const found = list.find(item => {
    const itemEmail = String(item?.email || item?.user || '').trim().toLowerCase();
    return itemEmail && itemEmail === em;
  });

  if (!found) return fallback;

  return {
    permitir_pessoal_para_pessoal: found.permitir_pessoal_para_pessoal !== false,
    permitir_pessoal_para_habitacao: found.permitir_pessoal_para_habitacao !== false,
    permitir_pessoal_para_colaborador: found.permitir_pessoal_para_colaborador !== false
  };
}
