import webpush from 'web-push';
import PortalPushSubscription from '#core/models/portal_push_subscription.js';
import Unidade from '#core/models/unidade.js';
import User from '#core/models/user.js';

const VAPID_PUBLIC_KEY = process.env.PORTAL_PUSH_VAPID_PUBLIC_KEY
  || process.env.WDGESTOR_PORTAL_VAPID_PUBLIC_KEY
  || process.env.VAPID_PUBLIC_KEY
  || '';

const VAPID_PRIVATE_KEY = process.env.PORTAL_PUSH_VAPID_PRIVATE_KEY
  || process.env.WDGESTOR_PORTAL_VAPID_PRIVATE_KEY
  || process.env.VAPID_PRIVATE_KEY
  || '';

const hasVapid = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (hasVapid) {
  try {
    webpush.setVapidDetails('mailto:suporte@wdgestor.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err) {
    console.error('[portal-push] falha ao configurar VAPID:', err?.message || err);
  }
}

export function getPortalVapidPublicKey() {
  return VAPID_PUBLIC_KEY || '';
}

function normalizeLogoUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  if (u.startsWith('/')) return u;
  return '/' + u.replace(/^\/+/, '');
}

async function resolvePortalPushIcon({ email, unidadeId }) {
  const wd = '/images/logoWDGestor.png';

  try {
    const emailLc = String(email || '').trim().toLowerCase();
    if (emailLc) {
      const u = await User.findOne({ email: emailLc }).select('role').lean().catch(() => null);
      const role = String(u?.role || '').trim().toLowerCase();
      if (role === 'master' || role === 'admin') return wd;
    }
  } catch {
    /* noop */
  }

  try {
    const uid = String(unidadeId || '').trim();
    if (uid) {
      const unit = await Unidade.findById(uid).select('logo').lean().catch(() => null);
      const icon = normalizeLogoUrl(unit?.logo);
      if (icon) return icon;
    }
  } catch {
    /* noop */
  }

  return wd;
}

export async function savePortalPushSubscription({ subscription, userId, email, userAgent }) {
  try {
    if (!subscription || !subscription.endpoint) return { ok: false, reason: 'invalid-subscription' };

    const endpoint = String(subscription.endpoint || '').trim();
    if (!endpoint) return { ok: false, reason: 'invalid-endpoint' };

    const emailLc = String(email || '').toLowerCase();
    const payload = {
      endpoint,
      keys: subscription.keys || {},
      user_agent: userAgent || '',
      updatedAt: new Date()
    };

    if (userId) payload.cond_usuario_id = userId;
    if (emailLc) payload.email = emailLc;

    await PortalPushSubscription.updateOne(
      { endpoint },
      {
        $set: payload,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    return { ok: true };
  } catch (err) {
    console.error('[portal-push] erro ao salvar subscription:', err?.message || err);
    return { ok: false, reason: 'save-error', detail: err?.message || err };
  }
}

async function sendPortalPushToSubscribers(subs, payload) {
  if (!hasVapid) return { ok: false, reason: 'missing-vapid' };
  if (!subs || !subs.length) return { ok: false, reason: 'no-subscribers' };

  const body = JSON.stringify(payload || {});
  const results = await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, body);
      return { ok: true, endpoint: sub.endpoint };
    } catch (err) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        try { await PortalPushSubscription.deleteOne({ endpoint: sub.endpoint }); } catch { /* noop */ }
      }
      return { ok: false, endpoint: sub.endpoint, error: err?.message || String(err) };
    }
  }));

  const delivered = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
  return { ok: delivered > 0, delivered, total: subs.length, results };
}

export async function sendPortalPush({ email, title, body, tag, data, icon, badge }) {
  try {
    const emailLc = String(email || '').toLowerCase();
    if (!emailLc) return { ok: false, reason: 'missing-email' };

    const subs = await PortalPushSubscription.find({ email: emailLc }).lean();
    if (!subs || !subs.length) return { ok: false, reason: 'no-subscribers' };

    const unidadeId = data && (data.unidadeId || data.unidade_id) ? String(data.unidadeId || data.unidade_id) : '';
    const resolvedIcon = icon || (unidadeId ? await resolvePortalPushIcon({ email: emailLc, unidadeId }) : '');

    const payload = {
      title: title || 'Portal do Morador',
      body: body || '',
      tag: tag || 'portal',
      data: data || {},
      ...(resolvedIcon ? { icon: resolvedIcon, badge: (badge || resolvedIcon) } : {})
    };

    return await sendPortalPushToSubscribers(subs, payload);
  } catch (err) {
    console.error('[portal-push] erro ao enviar:', err?.message || err);
    return { ok: false, reason: 'send-error', detail: err?.message || err };
  }
}

export async function notifyServicoStatusPush({ email, protocolo, status, motivo, unidadeId, servicoId, assunto }) {
  const proto = String(protocolo || servicoId || '').trim();
  if (!email) return { ok: false, reason: 'missing-email' };

  const normStatus = String(status || '').toLowerCase();
  const isAccepted = normStatus.includes('aceita');
  const isRejected = normStatus.includes('rejeit');

  let msg = 'Status atualizado.';
  if (isAccepted) msg = 'Foi aceita pelo condomínio.';
  if (isRejected) msg = motivo ? `Foi rejeitada: ${motivo}` : 'Foi rejeitada pelo condomínio.';

  const title = proto ? `Solicitação ${proto}` : 'Solicitação de serviço';
  const data = {
    tipo: 'servico-status',
    status: isAccepted ? 'aceita' : (isRejected ? 'rejeitada' : normStatus || 'atualizada'),
    protocolo: proto,
    assunto: assunto || null,
    unidadeId: unidadeId || null,
    servicoId: servicoId || null,
    url: '/portal-morador/solicitacoes/servico'
  };

  return sendPortalPush({
    email,
    title,
    body: msg,
    tag: proto ? `servico-${proto}` : 'servico-status',
    data
  });
}

export function isPortalPushConfigured() {
  return hasVapid;
}

export async function notifyVisitaChegadaPush({ emails, habitacaoNome, visitaId, visitantes, criadoEm }) {
  const list = Array.isArray(emails) ? emails : (emails ? [emails] : []);
  const uniq = [...new Set(list.map(e => String(e || '').toLowerCase().trim()).filter(Boolean))];
  if(!uniq.length) return { ok: false, reason: 'missing-emails' };

  const nomes = Array.isArray(visitantes) ? visitantes.map(v => String(v?.nome || '').trim()).filter(Boolean) : [];
  const title = 'Chegada de visitante';
  const hab = String(habitacaoNome || '').trim();
  const body = nomes.length
    ? (nomes.length === 1 ? `${nomes[0]} chegou.` : `${nomes[0]} e mais ${nomes.length - 1} chegaram.`)
    : 'Um visitante chegou.';

  const data = {
    tipo: 'visita-chegada',
    assunto: hab ? `Habitação: ${hab}` : null,
    habitacaoNome: hab || null,
    visitaId: visitaId || null,
    visitantes: nomes,
    criadoEm: criadoEm || null,
    url: '/portal-morador/home'
  };

  const tag = visitaId ? `visita-chegada:${String(visitaId)}` : 'visita-chegada';
  const results = await Promise.allSettled(uniq.map(email => sendPortalPush({ email, title, body, tag, data })));
  const delivered = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  return { ok: delivered > 0, delivered, total: uniq.length, results };
}

export async function notifyEnqueteNovaPush({ emails, enqueteId, unidadeId }) {
  const list = Array.isArray(emails) ? emails : (emails ? [emails] : []);
  const uniq = [...new Set(list.map(e => String(e || '').toLowerCase().trim()).filter(Boolean))];
  if (!uniq.length) return { ok: false, reason: 'missing-emails' };

  const title = 'Nova enquete disponível para votação';
  const body = 'Uma nova enquete está disponível. Toque para votar.';
  const data = {
    tipo: 'enquete-nova',
    enqueteId: enqueteId || null,
    unidadeId: unidadeId || null,
    url: '/portal-morador/enquetes'
  };

  const tag = enqueteId ? `enquete-nova:${String(enqueteId)}` : 'enquete-nova';
  const results = await Promise.allSettled(uniq.map(email => sendPortalPush({ email, title, body, tag, data })));
  const delivered = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  return { ok: delivered > 0, delivered, total: uniq.length, results };
}

export async function notifyComunicadoNovoPush({ emails, comunicadoId, unidadeId }) {
  const list = Array.isArray(emails) ? emails : (emails ? [emails] : []);
  const uniq = [...new Set(list.map(e => String(e || '').toLowerCase().trim()).filter(Boolean))];
  if (!uniq.length) return { ok: false, reason: 'missing-emails' };

  const title = 'Comunicados';
  const body = 'Novo comunicado adicionado, acesse o mural.';
  const data = {
    tipo: 'comunicado-novo',
    comunicadoId: comunicadoId || null,
    unidadeId: unidadeId || null,
    url: '/portal-morador/comunicados'
  };

  const tag = comunicadoId ? `comunicado-novo:${String(comunicadoId)}` : 'comunicado-novo';
  const results = await Promise.allSettled(uniq.map(email => sendPortalPush({ email, title, body, tag, data })));
  const delivered = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  return { ok: delivered > 0, delivered, total: uniq.length, results };
}