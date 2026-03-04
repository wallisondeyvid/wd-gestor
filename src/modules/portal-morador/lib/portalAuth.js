import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import CondUsuario from '#models/cond_usuario.js';
import CondHabitacao from '#models/cond_habitacao.js';
import CondMorador from '#models/cond_morador.js';
import CondProprietario from '#models/cond_proprietario.js';
import CondBloco from '#models/cond_bloco.js';
import CondAndar from '#models/cond_andar.js';
import Unidade from '#models/unidade.js';
import { sendMail } from '#core/mail/mailer.js';
import { portalFirstAccessEmail } from '#mail/templates/portalFirstAccess.js';

const DEFAULT_INVITE_HOURS = Number(process.env.PORTAL_PRIMEIRO_ACESSO_EXPIRA_HORAS || 120);
const LOGIN_MAX_ATTEMPTS = Math.max(3, Number(process.env.PORTAL_LOGIN_MAX_TENTATIVAS || 5));
const LOGIN_BLOCK_MINUTES = Math.max(5, Number(process.env.PORTAL_LOGIN_BLOQUEIO_MINUTOS || 15));

export const PORTAL_LOGIN_MAX_ATTEMPTS = LOGIN_MAX_ATTEMPTS;

export function sanitizePortalEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function resolvePrimaryBaseUrl() {
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_BRANCH_URL
    || process.env.VERCEL_URL
    || '';
  const isVercel = !!process.env.VERCEL || !!vercelDomain;
  let raw = process.env.APP_URL || process.env.APP_BASE_URL || '';
  if (isVercel && /localhost/i.test(raw)) raw = '';
  if (!raw && vercelDomain) raw = vercelDomain;
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  return raw.replace(/\/$/, '');
}

export function resolvePortalBaseUrl() {
  const explicit = process.env.PORTAL_MORADOR_URL || process.env.PORTAL_MORADOR_BASE_URL || '';
  let base = explicit || resolvePrimaryBaseUrl();
  if (!base) {
    const port = process.env.PORT || 3000;
    base = `http://localhost:${port}`;
  }
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/$/, '');
  if (!/\/portal-morador$/i.test(base)) {
    base = `${base}/portal-morador`;
  }
  return base;
}

function extractLogoSource(unidade) {
  if (!unidade) return '';
  const candidates = [
    unidade.logo,
    unidade.logo_url,
    unidade.logoUrl,
    unidade.logo_cliente,
    unidade.logoCliente,
    unidade.logo_unidade,
    unidade.logoUnidade,
    unidade.logoUnidadeUrl,
    unidade.logo_portal,
    unidade.logoPortal,
    unidade.logoArquivo,
    unidade.logoArquivoUrl,
    unidade.logoArmazenado,
    unidade.logoArmazenadoUrl,
    unidade.headerLogo,
    unidade.header_logo
  ];
  if (unidade.assets && typeof unidade.assets.logo === 'string') {
    candidates.push(unidade.assets.logo);
  }
  if (unidade.branding && typeof unidade.branding.logo === 'string') {
    candidates.push(unidade.branding.logo);
  }
  const found = candidates.find((val) => typeof val === 'string' && val.trim().length);
  return found ? found.trim() : '';
}

export function resolveUnidadeLogoUrl(unidade) {
  const logo = extractLogoSource(unidade);
  if (!logo) return '';
  if (/^https?:\/\//i.test(logo) || logo.startsWith('data:')) return logo;
  const root = resolvePrimaryBaseUrl();
  if (!root) return logo.startsWith('/') ? logo : `/${logo}`;
  return `${root.replace(/\/$/, '')}/${logo.replace(/^\/+/, '')}`;
}

export function generatePortalPassword(length = 10) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const alphabet = upper + lower + digits;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx];
  }
  return out;
}

export function generatePortalToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function formatExpirationDescription(expires) {
  if (!expires) return '';
  try {
    const locale = process.env.TZ && /sao_paulo|brazil/i.test(process.env.TZ) ? 'pt-BR' : undefined;
    return new Date(expires).toLocaleString(locale || 'pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return new Date(expires).toISOString();
  }
}

async function loadUnidade(unidadeId) {
  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) return null;
  try {
    return await Unidade.findById(unidadeId).lean();
  } catch {
    return null;
  }
}

async function ensureCondUsuario(docOrId) {
  if (!docOrId) return null;
  if (typeof docOrId === 'object' && docOrId._id) return docOrId;
  try {
    return await CondUsuario.findById(docOrId);
  } catch {
    return null;
  }
}

export async function issuePortalInvite({ condUsuario, unidadeId = null, sendEmail = true, validadeHoras } = {}) {
  const doc = await ensureCondUsuario(condUsuario);
  if (!doc || !doc.email) {
    throw new Error('CondUsuario inválido para convite do portal.');
  }
  const senhaProvisoria = generatePortalPassword();
  const token = generatePortalToken();
  const hash = await bcrypt.hash(senhaProvisoria, 12);
  const ttlHours = Number(validadeHoras || DEFAULT_INVITE_HOURS);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  doc.portal_password_hash = hash;
  doc.portal_primeiro_acesso_token = token;
  doc.portal_primeiro_acesso_expires = expiresAt;
  doc.portal_primeiro_acesso_em = new Date();
  doc.portal_primeiro_acesso_obrigatorio = true;
  doc.portal_convite_unidade_id = unidadeId || doc.unidade_id || null;
  doc.portal_convite_enviado_em = new Date();
  doc.portal_login_tentativas = 0;
  doc.portal_bloqueado_ate = null;
  doc.portal_reset_token = '';
  doc.portal_reset_expires = null;
  doc.portal_acesso_ativo = true;
  await doc.save();

  let unidade = null;
  if (doc.portal_convite_unidade_id) {
    unidade = await loadUnidade(doc.portal_convite_unidade_id);
  } else if (doc.unidade_id) {
    unidade = await loadUnidade(doc.unidade_id);
  }

  const portalBaseUrl = resolvePortalBaseUrl();
  const firstAccessUrl = `${portalBaseUrl}/primeiroacesso?token=${encodeURIComponent(token)}&email=${encodeURIComponent(doc.email)}`;
  const validadeDescricao = ttlHours ? `pelas próximas ${ttlHours} hora${ttlHours === 1 ? '' : 's'}` : 'por tempo limitado';

  if (sendEmail) {
    try {
      const { html, text } = portalFirstAccessEmail({
        nome: doc.nome,
        email: doc.email,
        senhaProvisoria,
        portalBaseUrl,
        firstAccessUrl,
        unidadeNome: unidade?.nome,
        unidadeCodigo: unidade?.codigo,
        unidadeCnpj: unidade?.cnpj,
        unidadeLogoUrl: resolveUnidadeLogoUrl(unidade),
        validadeDescricao
      });
      await sendMail({
        to: `${doc.nome || doc.email} <${doc.email}>`,
        subject: 'Portal do Morador - Primeiro acesso',
        html,
        text
      });
    } catch (err) {
      console.error('[portalAuth][issuePortalInvite] falha ao enviar e-mail:', err?.message || err);
    }
  }

  return { senhaProvisoria, token, expiresAt, condUsuario: doc, portalBaseUrl };
}

export async function findPortalUserByEmail(email) {
  const normalized = sanitizePortalEmail(email);
  if (!normalized) return null;
  return CondUsuario.findOne({ email: normalized });
}

export function isPortalAccessBlocked(user) {
  if (!user || !user.portal_bloqueado_ate) return { blocked: false };
  const now = Date.now();
  const blockedUntil = new Date(user.portal_bloqueado_ate).getTime();
  if (Number.isNaN(blockedUntil)) return { blocked: false };
  if (blockedUntil <= now) return { blocked: false };
  const minutes = Math.ceil((blockedUntil - now) / 60000);
  return { blocked: true, minutesRemaining: minutes };
}

export async function registerPortalFailedAttempt(user) {
  if (!user) return;
  user.portal_login_tentativas = (user.portal_login_tentativas || 0) + 1;
  if (user.portal_login_tentativas >= LOGIN_MAX_ATTEMPTS) {
    user.portal_bloqueado_ate = new Date(Date.now() + LOGIN_BLOCK_MINUTES * 60 * 1000);
    user.portal_login_tentativas = 0;
  }
  try {
    await user.save();
  } catch (err) {
    console.warn('[portalAuth][registerPortalFailedAttempt] não foi possível salvar contador:', err?.message || err);
  }
}

export async function markPortalLoginSuccess(user) {
  if (!user) return;
  user.portal_login_tentativas = 0;
  user.portal_bloqueado_ate = null;
  user.portal_ultimo_login_em = new Date();
  try {
    await user.save();
  } catch (err) {
    console.warn('[portalAuth][markPortalLoginSuccess] falha ao salvar:', err?.message || err);
  }
}

export async function verifyPortalPassword(user, senha) {
  if (!user || !senha || !user.portal_password_hash) return false;
  try {
    return await bcrypt.compare(senha, user.portal_password_hash);
  } catch (err) {
    console.warn('[portalAuth][verifyPortalPassword] erro ao comparar hash:', err?.message || err);
    return false;
  }
}

export function mustForcePortalFirstAccess(user) {
  return !!(user && user.portal_primeiro_acesso_obrigatorio !== false);
}

export async function setPortalPassword(user, novaSenha, { clearToken = true } = {}) {
  if (!user || !novaSenha) throw new Error('Usuário ou senha ausentes.');
  user.portal_password_hash = await bcrypt.hash(novaSenha, 12);
  user.portal_senha_atualizada_em = new Date();
  user.portal_acesso_ativo = true;
  if (clearToken) {
    user.portal_primeiro_acesso_token = '';
    user.portal_primeiro_acesso_expires = null;
    user.portal_primeiro_acesso_obrigatorio = false;
  }
  await user.save();
}

function buildHabitacaoLabel(h, blocoMap, andarMap) {
  if (!h) return 'Habitação';
  const parts = [];
  const blocoNome = h.bloco_id ? (blocoMap.get(String(h.bloco_id)) || '') : '';
  const andarNome = h.andar_id ? (andarMap.get(String(h.andar_id)) || '') : '';
  if (blocoNome) parts.push(blocoNome);
  if (andarNome) parts.push(andarNome);
  if (h.tipo) parts.push(h.tipo);
  if (h.numero) parts.push(h.numero);
  if (!parts.length && h.descricao) parts.push(h.descricao);
  return parts.join(' - ') || h.descricao || 'Habitação';
}

export async function buildPortalSessionPayload(condUser) {
  if (!condUser) throw new Error('Usuário inválido.');
  const user = condUser.toObject ? condUser.toObject() : condUser;
  const condUsuarioId = user._id?.toString();
  if (!condUsuarioId) throw new Error('Usuário sem identificador.');
  const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
  const [moradores, proprietarios] = await Promise.all([
    CondMorador.find({ cond_usuario_id: condUsuarioId, ativo: { $ne: false } }).lean().maxTimeMS(queryTimeout),
    CondProprietario.find({ cond_usuario_id: condUsuarioId, ativo: { $ne: false } }).lean().maxTimeMS(queryTimeout)
  ]);

  const ownerIds = proprietarios.map(p => p._id).filter(Boolean);
  const habIdsFromMoradores = moradores.map(m => m.habitacao_id).filter(Boolean);
  const habIdsFromOwners = ownerIds.length
    ? await CondHabitacao.find({ proprietario_id: { $in: ownerIds } }).select('_id').lean().maxTimeMS(queryTimeout)
    : [];
  const habOwnerIds = habIdsFromOwners.map(h => h._id);
  const allHabIds = [...new Set([...habIdsFromMoradores, ...habOwnerIds].map(id => String(id)))];

  const habitacoes = allHabIds.length
    ? await CondHabitacao.find({ _id: { $in: allHabIds } })
        .select('_id unidade_id bloco_id andar_id numero tipo descricao proprietario_id')
        .lean()
        .maxTimeMS(queryTimeout)
    : [];

  const blocoIds = [...new Set(habitacoes.map(h => h.bloco_id).filter(Boolean).map(String))];
  const andarIds = [...new Set(habitacoes.map(h => h.andar_id).filter(Boolean).map(String))];
  const [blocos, andares] = await Promise.all([
    blocoIds.length ? CondBloco.find({ _id: { $in: blocoIds } }).select('_id nome').lean().maxTimeMS(queryTimeout) : [],
    andarIds.length ? CondAndar.find({ _id: { $in: andarIds } }).select('_id nome').lean().maxTimeMS(queryTimeout) : []
  ]);
  const blocoMap = new Map((blocos || []).map(b => [String(b._id), b.nome || '']));
  const andarMap = new Map((andares || []).map(a => [String(a._id), a.nome || '']));

  const habMap = new Map(habitacoes.map(h => [String(h._id), h]));
  const unidadeIds = new Set();
  habitacoes.forEach(h => { if (h.unidade_id) unidadeIds.add(String(h.unidade_id)); });
  if (user.unidade_id) unidadeIds.add(String(user.unidade_id));
  if (proprietarios.length) {
    proprietarios.forEach(p => { if (p.unidade_id) unidadeIds.add(String(p.unidade_id)); });
  }
  const unidades = unidadeIds.size
    ? await Unidade.find({ _id: { $in: Array.from(unidadeIds) } }).lean().maxTimeMS(queryTimeout)
    : [];
  const unidadeMap = new Map(unidades.map(u => [String(u._id), u]));

  const vinculosMap = new Map();
  moradores.forEach(m => {
    const habId = String(m.habitacao_id || '');
    if (!habId) return;
    const hab = habMap.get(habId);
    const unidadeId = hab?.unidade_id ? String(hab.unidade_id) : (m.unidade_id ? String(m.unidade_id) : null);
    const unidade = unidadeId ? unidadeMap.get(unidadeId) : null;
    const key = `${unidadeId || 'sem'}::${habId}`;
    const entry = vinculosMap.get(key) || {
      unidade_id: unidadeId,
      unidade_nome: unidade?.nome || '',
      unidade_codigo: unidade?.codigo || '',
      unidade_logo: resolveUnidadeLogoUrl(unidade),
      unidade_cnpj: unidade?.cnpj || '',
      habitacao_id: habId,
      habitacao_label: buildHabitacaoLabel(hab, blocoMap, andarMap),
      papeis: new Set(),
      inquilino: false
    };
    entry.papeis.add('morador');
    entry.inquilino = entry.inquilino || !!m.inquilino;
    vinculosMap.set(key, entry);
  });

  ownerIds.forEach((ownerId, idx) => {
    const ownerHabDocs = habitacoes.filter(h => h.proprietario_id && String(h.proprietario_id) === String(ownerId));
    ownerHabDocs.forEach(hab => {
      const habId = String(hab._id);
      const unidadeId = hab.unidade_id ? String(hab.unidade_id) : null;
      const unidade = unidadeId ? unidadeMap.get(unidadeId) : null;
      const key = `${unidadeId || 'sem'}::${habId}`;
      const entry = vinculosMap.get(key) || {
        unidade_id: unidadeId,
        unidade_nome: unidade?.nome || '',
        unidade_codigo: unidade?.codigo || '',
        unidade_logo: resolveUnidadeLogoUrl(unidade),
        unidade_cnpj: unidade?.cnpj || '',
        habitacao_id: habId,
        habitacao_label: buildHabitacaoLabel(hab, blocoMap, andarMap),
        papeis: new Set(),
        inquilino: false
      };
      entry.papeis.add('proprietario');
      vinculosMap.set(key, entry);
    });
  });

  const vinculos = Array.from(vinculosMap.values()).map(v => ({
    ...v,
    papeis: Array.from(v.papeis)
  }));

  if (!vinculos.length && unidades.length) {
    // fallback: vincular apenas à unidade principal
    const unidade = unidades[0];
    vinculos.push({
      unidade_id: String(unidade._id),
      unidade_nome: unidade.nome || '',
      unidade_codigo: unidade.codigo || '',
      unidade_logo: resolveUnidadeLogoUrl(unidade),
      unidade_cnpj: unidade.cnpj || '',
      habitacao_id: null,
      habitacao_label: 'Unidade administrativa',
      papeis: ['proprietario']
    });
  }

  const defaultUnidadeId = (() => {
    if (user.unidade_id && unidadeMap.has(String(user.unidade_id))) return String(user.unidade_id);
    if (vinculos.length && vinculos[0].unidade_id) return vinculos[0].unidade_id;
    return null;
  })();
  const defaultUnidade = defaultUnidadeId ? unidadeMap.get(defaultUnidadeId) : null;

  return {
    id: condUsuarioId,
    cond_usuario_id: condUsuarioId,
    nome: user.nome || 'Morador',
    email: user.email,
    telefone: user.telefone || '',
    foto_url: (user.foto || '').trim(),
    unidade_id: defaultUnidadeId,
    unidade_nome: defaultUnidade?.nome || '',
    unidade_codigo: defaultUnidade?.codigo || '',
    unidade_logo: resolveUnidadeLogoUrl(defaultUnidade),
    unidade_cnpj: defaultUnidade?.cnpj || '',
    vinculos,
    portal_roles: Array.from(new Set(vinculos.flatMap(v => v.papeis))).filter(Boolean),
    portal_primeiro_acesso: mustForcePortalFirstAccess(user),
    portal_acesso_ativo: user.portal_acesso_ativo !== false,
    favoritos: user.favoritos || {}
  };
}
