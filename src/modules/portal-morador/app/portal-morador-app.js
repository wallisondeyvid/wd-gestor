import path from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import requirePortalLogin from './middlewares/requirePortalLogin.js';
import mongoose from 'mongoose';
import CondUsuario from '#models/cond_usuario.js';
import Unidade from '#models/unidade.js';
import Modulo from '#models/modulo.js';
import CondMorador from '#models/cond_morador.js';
import CondSolicitacaoServico from '#models/cond_solicitacao_servico.js';
import CondVisitante from '#models/cond_visitante.js';
import CondAcessoMorador from '#models/cond_acesso_morador.js';
import CondHabitacao from '#models/cond_habitacao.js';
import CondEnquete from '#models/cond_enquete.js';
import CondEnqueteVoto from '#models/cond_enquete_voto.js';
import CondComunicado from '#models/cond_comunicado.js';
import CondAssembleia from '#models/cond_assembleia.js';
import CondAssembleiaExecution from '#models/cond_assembleia_execution.js';
import { connectMongo } from '#core/db/connect.js';
import { buildPortalSessionPayload, verifyPortalPassword, setPortalPassword } from '#modules/portal-morador/lib/portalAuth.js';
import { setPortalSessionCookie } from './lib/portalSessionCookie.js';
import { portalLoginPost, portalLogout, portalAuthContextGet, portalSelectVinculoPost } from './controllers/authController.js';
import { getPortalVapidPublicKey, savePortalPushSubscription, sendPortalPush } from '#modules/portal-morador/lib/pushNotifications.js';
import fetch from 'node-fetch';

let sharpPromise = null;
async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((m) => m.default || m)
      .catch(() => null);
  }
  return sharpPromise;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const app = express();

function wrapAsync(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function withTimeout(promise, timeoutMs, label = 'op') {
  const ms = Math.max(0, Number(timeoutMs) || 0);
  if (!ms) return Promise.resolve(promise);

  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => {
      const err = new Error(`Timeout em ${label} após ${ms}ms`);
      err.code = 'OP_TIMEOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => clearTimeout(t));
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

function respondDbOffline(res, req) {
  try {
    // Não sobrescrever se já foi setado por um handler específico.
    if (!res.get('X-Portal-Db-Mode')) {
      res.set('X-Portal-Db-Mode', 'offline');
    }
    res.set('X-Portal-Effective-SkipDb', String(!!getEffectiveSkipDb(req)));
    res.set('X-Portal-SubApp-SkipDb', String(!!req?.app?.locals?.skipDb));
    res.set('X-Portal-Parent-SkipDb', String(!!req?.app?.parent?.locals?.skipDb));
    res.set('X-Portal-Mongo-State', String(mongoose.connection.readyState));
    res.set('X-Portal-Mongo-Uri-Present', String(!!(process.env.MONGO_URI || process.env.MONGODB_URI)));
  } catch {
    /* noop */
  }

  return res.status(503).json({
    error: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
    code: 'DB_OFFLINE',
    meta: {
      mongoReadyState: mongoose.connection.readyState,
      mongoUriPresent: !!(process.env.MONGO_URI || process.env.MONGODB_URI),
      effectiveSkipDb: !!getEffectiveSkipDb(req),
      subAppSkipDb: !!req?.app?.locals?.skipDb,
      parentSkipDb: !!req?.app?.parent?.locals?.skipDb,
    }
  });
}

function allowPortalMemoryFallback() {
  // O store em memória é útil em dev/testes, mas em produção/serverless ele é inconsistente
  // (cada instância tem memória diferente) e gera sintomas confusos (lista vazia/404).
  const flag = String(process.env.PORTAL_ALLOW_MEMORY_STORE || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') return true;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  return process.env.NODE_ENV !== 'production';
}

function isServerlessRuntime() {
  return !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function getMongoQueryTimeoutMs() {
  const raw = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 0);
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
    try {
      await connectMongo(uri);
    } catch {
      /* noop */
    }
    // Em serverless, o connect pode retornar antes do driver sinalizar "connected".
    // Aguarde um pouco para evitar 503 durante cold start.
    await waitForMongoReady(getMongoQueryTimeoutMs());
    return mongoose.connection.readyState === 1;
  } catch {
    return false;
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function generateServicoProtocolo() {
  const now = String(Date.now());
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const raw = (now + rand).slice(-10);
  return raw.padStart(10, '0');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBlobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN
    || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || process.env.VERCEL_BLOB_RW_TOKEN
    || ''
  );
}

function maybeUploadFotos(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('multipart/form-data')) return next();

  return upload.array('fotos', 5)(req, res, (err) => {
    if (!err) return next();
    const msg = String(err?.message || '').toLowerCase();
    if (String(err?.code || '') === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Cada foto deve ter no máximo 5MB.' });
    }
    if (msg.includes('unexpected field')) {
      return res.status(400).json({ error: 'Campo de foto inválido.' });
    }
    return res.status(400).json({ error: 'Falha ao processar fotos.' });
  });
}

async function storeServicoFotos({ req, servicoId, files }) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];

  const sharp = await getSharp();

  const inVercel = !!process.env.VERCEL;
  const blobToken = getBlobToken();
  const base = req.baseUrl || '/portal-morador';

  const out = [];
  for (const f of list.slice(0, 5)) {
    if (!f?.buffer) continue;

    let webpBuf;
    try {
      if (!sharp) continue;
      webpBuf = await sharp(f.buffer)
        .rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .toFormat('webp', { quality: 82 })
        .toBuffer();
    } catch {
      continue;
    }

    // Produção (Vercel): salva no Blob quando possível
    if (inVercel || blobToken) {
      try {
        const key = `portal-servicos/${String(servicoId)}/${randomUUID()}.webp`;
        const putOptions = {
          access: 'public',
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
          ...(blobToken ? { token: blobToken } : {})
        };
        const { url } = await put(key, webpBuf, putOptions);
        if (url) {
          out.push(String(url));
          continue;
        }
      } catch {
        // fallback local abaixo
      }
    }

    // Fallback local (dev): salva em disco e serve via /uploads
    const relDir = path.join('portal-morador', 'servicos', String(servicoId));
    const absDir = path.join(ROOT, 'uploads', relDir);
    await fs.mkdir(absDir, { recursive: true });
    const fileName = `${randomUUID()}.webp`;
    await fs.writeFile(path.join(absDir, fileName), webpBuf);
    out.push(`${base}/uploads/${relDir.replace(/\\/g, '/')}/${fileName}`);
  }

  return out.slice(0, 5);
}

// Header de diagnóstico para confirmar versão/deploy do portal em produção.
app.use((req, res, next) => {
  try {
    res.set('X-WDG-Portal', 'portal-morador');
    res.set('X-WDG-Portal-Build', 'portal-auth-2025-12-20');
    const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '';
    if (sha) res.set('X-WDG-Commit', String(sha).slice(0, 12));
    const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
    if (ref) res.set('X-WDG-Branch', String(ref).slice(0, 64));
  } catch {
    /* noop */
  }
  next();
});

function buildPortalContext(req) {
  const sessionUser = (req && req.session && req.session.portalUser) || null;
  const user = (req && (req.portalUser || sessionUser)) || null;
  const unidadeInfo = user && (user.unidade || user.unidade_nome || user.unidadeNome);
  const unidadeObjeto = user && (user.unidade_id || user.unidadeId);
  const unidadeCodigo = (user && (user.unidade_codigo || user.unidadeCodigo)) || (unidadeObjeto && (unidadeObjeto.codigo || unidadeObjeto.codigo_unidade));
  const avatarUrl = user && (user.avatar_url || user.avatarUrl || user.foto_url || user.fotoUrl || null);
  const roleRaw = (user && (user.role || user.perfil || user.tipo_acesso)) || '';
  const role = typeof roleRaw === 'string' ? roleRaw.toLowerCase() : '';
  const habitacaoRef = user && (user.habitacao_id || user.habitacaoId);
  const habitacaoId = habitacaoRef
    ? String((habitacaoRef && typeof habitacaoRef === 'object') ? (habitacaoRef._id || habitacaoRef.id || habitacaoRef) : habitacaoRef)
    : '';
  const habitacaoLabel = user && (user.habitacao_label || user.habitacaoLabel) ? String(user.habitacao_label || user.habitacaoLabel).trim() : '';
  const unidadeRef = user && (user.unidade_id || user.unidadeId || user.unidade_principal_id || user.unidadePrincipalId);
  const unidadeId = unidadeRef
    ? String((unidadeRef && typeof unidadeRef === 'object') ? (unidadeRef._id || unidadeRef.id || unidadeRef) : unidadeRef).trim()
    : '';

  // Logo do condomínio: tenta várias fontes (root, nested, e fallback via vinculos).
  const unidadeLogoDirect = user && (user.unidade_logo || user.unidadeLogo || user.logo_unidade || user.logoUnidade || user.logo_cliente || user.logoCliente || user.logoUnidadeUrl || user.unidadeLogoUrl);
  const unidadeLogoNested = unidadeObjeto && (unidadeObjeto.logo || unidadeObjeto.logo_url || unidadeObjeto.logoUrl || unidadeObjeto.logo_unidade || unidadeObjeto.logoUnidade);
  const vinculos = Array.isArray(user?.vinculos) ? user.vinculos : [];
  const vinculoMatch = unidadeId
    ? vinculos.find(v => String(v?.unidade_id || v?.unidadeId || v?.unidade || '').trim() === String(unidadeId).trim())
    : null;
  const unidadeLogoFromVinculo = vinculoMatch && (vinculoMatch.unidade_logo || vinculoMatch.unidadeLogo || vinculoMatch.unidadeLogoUrl || vinculoMatch.logo_unidade || vinculoMatch.logoUnidade || vinculoMatch.logoUrl || vinculoMatch.logo);
  const headerLogoUrl = (unidadeLogoDirect || unidadeLogoNested || unidadeLogoFromVinculo) || null;

  return {
    moduleLabel: 'Portal do Morador',
    userName: (user && (user.nome || user.name)) || 'Morador',
    unidadeNome: (typeof unidadeInfo === 'string') ? unidadeInfo : (unidadeObjeto && (unidadeObjeto.nome || unidadeObjeto.descricao)) || 'Seu Condomínio',
    unidadeCodigo: unidadeCodigo || '',
    avatarUrl,
    headerLogoUrl,
    userRole: role,
    habitacaoId,
    habitacaoLabel,
    unidadeId,
  };
}

const PORTAL_UI_REV = 'pm-msg-ui-2026-01-12-01';

app.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '/portal-morador';
  try {
    const sessionUser = (req && req.session && req.session.portalUser) || null;
    res.locals.user = req.portalUser || sessionUser || null;
  } catch {
    res.locals.user = null;
  }
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

  // Diagnóstico de deploy/cache: fica visível no DevTools > Network mesmo em rotas HTML.
  try {
    res.set('X-WDG-Portal-UI-Rev', PORTAL_UI_REV);
    res.set('X-WDG-Portal-Asset-Version', String(res.locals.assetVersion || 'dev'));
  } catch {
    /* noop */
  }
  next();
});

app.set('views', [
  path.join(ROOT, 'views/portal-morador'),
  path.join(ROOT, 'views')
]);
app.set('view engine', 'ejs');

function fixPortalMojibakeText(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (!/[ÃÂ]/.test(value)) return value;

  // Corrige casos típicos de texto UTF-8 previamente "quebrado" e salvo como mojibake
  // (ex.: "InÃ­cio", "ConfiguraÃ§Ã£o", "Portal do Morador Â· WD Gestor").
  const replacements = [
    ['Â·', '·'],
    ['Âº', 'º'],
    ['Âª', 'ª'],
    ['Â°', '°'],
    ['Â«', '«'],
    ['Â»', '»'],
    ['Ã—', '×'],

    ['Ã€', 'À'],
    ['Ã‚', 'Â'],
    ['Ãƒ', 'Ã'],
    ['Ã‡', 'Ç'],
    ['Ã‰', 'É'],
    ['ÃŠ', 'Ê'],
    ['Ã“', 'Ó'],
    ['Ã”', 'Ô'],
    ['Ã•', 'Õ'],
    ['Ãš', 'Ú'],
    ['Ãœ', 'Ü'],

    ['Ã ', 'à'],
    ['Ã¡', 'á'],
    ['Ã¢', 'â'],
    ['Ã£', 'ã'],
    ['Ã¤', 'ä'],
    ['Ã§', 'ç'],
    ['Ã¨', 'è'],
    ['Ã©', 'é'],
    ['Ãª', 'ê'],
    ['Ã¬', 'ì'],
    ['Ã­', 'í'],
    ['Ã²', 'ò'],
    ['Ã³', 'ó'],
    ['Ã´', 'ô'],
    ['Ãµ', 'õ'],
    ['Ã¹', 'ù'],
    ['Ãº', 'ú'],
  ];

  let out = value;
  for (const [from, to] of replacements) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

// Correção centralizada: garante acentuação correta mesmo se algum template EJS
// tiver strings já salvas com mojibake (ex.: "InÃ­cio").
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = (view, options, callback) => {
    let locals = options;
    let cb = callback;
    if (typeof locals === 'function') {
      cb = locals;
      locals = undefined;
    }

    return originalRender(view, locals, (err, html) => {
      if (err) {
        if (typeof cb === 'function') return cb(err);
        return next(err);
      }

      const fixed = fixPortalMojibakeText(html);
      if (typeof cb === 'function') return cb(null, fixed);
      return res.send(fixed);
    });
  };

  next();
});

app.use('/css', express.static(path.join(ROOT, 'public/css')));
// JS crítico: não cachear (evita Portal continuar com versões antigas após deploy)
app.get('/js/condominios/caixa_de_mensagem.js', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('CDN-Cache-Control', 'no-store');
    res.set('X-WDG-Asset-Version', String(res.locals.assetVersion || 'dev'));
  } catch {
    /* noop */
  }
  // Garante que nunca responda 304 para esse JS crítico (evita continuar rodando versão antiga).
  try {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  } catch {
    /* noop */
  }
  return res.sendFile(path.join(ROOT, 'public/js/condominios/caixa_de_mensagem.js'));
});
app.use('/js', express.static(path.join(ROOT, 'public/js')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use('/img', express.static(path.join(ROOT, 'public/img')));
app.use('/uploads', express.static(path.join(ROOT, 'uploads')));
// Assets específicos do Portal (PWA / service worker, etc.)
app.use('/', express.static(path.join(ROOT, 'public/portal-morador')));

// APIs do Portal: nunca cachear (evita 304 sem body que quebra fetch JSON)
app.use('/api', (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    // Instruções adicionais para proxies/CDN
    res.set('Surrogate-Control', 'no-store');
    res.set('CDN-Cache-Control', 'no-store');
    // Evita 304 removendo validação condicional do request
    try {
      delete _req.headers['if-none-match'];
      delete _req.headers['if-modified-since'];
    } catch {
      /* noop */
    }

    // Headers de diagnóstico (isola discrepâncias entre app pai e sub-app)
    try {
      res.set('X-Portal-SkipDb', String(!!_req?.app?.locals?.skipDb));
      res.set('X-Portal-Parent-SkipDb', String(!!_req?.app?.parent?.locals?.skipDb));
    } catch {
      /* noop */
    }
  } catch {
    /* noop */
  }
  next();
});

app.get('/', (req, res) => res.redirect((req.baseUrl || '/portal-morador') + '/login'));
app.get('/dashboard', (req, res) => {
  return res.redirect((req.baseUrl || '/portal-morador') + '/home');
});

// Login do Portal: trate POST aqui para evitar qualquer roteamento genérico/compat no app pai.
app.post('/login', (req, res, next) => Promise.resolve(portalLoginPost(req, res)).catch(next));

// Novo fluxo de login em etapas (AJAX)
app.get('/api/auth/context', requirePortalLogin, (req, res, next) => Promise.resolve(portalAuthContextGet(req, res)).catch(next));
app.post('/api/auth/selecionar', requirePortalLogin, (req, res, next) => Promise.resolve(portalSelectVinculoPost(req, res)).catch(next));

app.get('/home', requirePortalLogin, (req, res) => {
  return res.render('home', buildPortalContext(req));
});

// Caixa de Mensagens (Portal do Morador)
// Tela e rotas permanecem no Portal do Morador (não muda de módulo no navegador).
// As APIs são expostas em /portal-morador/api/* e proxyadas internamente para o módulo Condomínios
// para reaproveitar o backend já existente sem trocar a URL do usuário.

function getLocalOrigin(req) {
  try {
    const port = req?.socket?.localPort;
    if (port) return `http://127.0.0.1:${port}`;
  } catch {
    /* noop */
  }
  try {
    const host = String(req.get('host') || '').trim();
    const proto = String(req.protocol || 'http').trim();
    if (host) return `${proto}://${host}`;
  } catch {
    /* noop */
  }
  return 'http://127.0.0.1:3000';
}

function buildProxyHeaders(req, hasBody) {
  const headers = {};
  try {
    const src = req.headers || {};
    for (const [kRaw, v] of Object.entries(src)) {
      const k = String(kRaw || '').toLowerCase();
      if (!k) continue;
      if (k === 'host' || k === 'connection') continue;
      if (k === 'content-length') continue;
      if (!hasBody && k.startsWith('content-')) continue;
      headers[k] = v;
    }
  } catch {
    /* noop */
  }

  // Para rotas de API, força JSON. Em ambientes com middlewares de UI,
  // um Accept "text/html" pode resultar em HTML com status 200 (login/fallback).
  // O client da Caixa depende de JSON para não cair em "HTTP 200" como erro.
  try {
    const original = String(req?.originalUrl || req?.url || '');
    if (original.includes('/api/')) {
      if (!headers.accept) headers.accept = 'application/json';
      if (!headers['x-requested-with']) headers['x-requested-with'] = 'fetch';
    }
  } catch { /* noop */ }

  // Sinaliza para o módulo Condomínios que esta chamada veio do Portal do Morador.
  // Isso evita vazamento de contexto quando o navegador também tem sessão do Gestor.
  headers['x-wdg-portal'] = '1';
  return headers;
}

async function proxyToCondominios(req, res, next, targetPath) {
  try {
    const target = String(targetPath || '');

    const proxyViaHttp = async () => {
      // Fallback: proxy via HTTP para o próprio servidor (mantido por compat).
      const origin = getLocalOrigin(req);
      const url = origin + target;

      const method = String(req.method || 'GET').toUpperCase();
      const hasBody = !(method === 'GET' || method === 'HEAD');

      let body;
      if (hasBody) {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/json')) {
          body = JSON.stringify(req.body ?? {});
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          try {
            body = new URLSearchParams(req.body || {}).toString();
          } catch {
            body = '';
          }
        } else if (Buffer.isBuffer(req.body)) {
          body = req.body;
        } else if (typeof req.body === 'string') {
          body = req.body;
        } else {
          // Sem body parseado (ex.: multipart): deixe vazio aqui.
          // Obs: esse proxy não pretende suportar streaming completo;
          // a Caixa de Mensagens normalmente usa JSON para a maioria das operações.
          body = undefined;
        }
      }

      const headers = buildProxyHeaders(req, hasBody);
      const resp = await fetch(url, {
        method,
        headers,
        redirect: 'manual',
        body
      });

      try {
        res.status(resp.status);
        resp.headers.forEach((value, key) => {
          const k = String(key || '').toLowerCase();
          if (!k) return;
          if (k === 'transfer-encoding') return;
          if (k === 'content-encoding') return;
          try { res.setHeader(key, value); } catch { /* noop */ }
        });
      } catch {
        /* noop */
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      return res.send(buf);
    };

    // Preferir encaminhamento interno (sem HTTP/fetch) quando houver app pai.
    // Isso evita 503 por falhas de rede ao chamar o próprio host (comum em serverless/reverse proxy).
    const parent = req?.app?.parent;
    if (parent && typeof parent.handle === 'function' && target.startsWith('/condominios')) {
      const prevUrl = req.url;
      const prevOriginalUrl = req.originalUrl;
      const prevPortalHdr = req.headers ? req.headers['x-wdg-portal'] : undefined;
      const prevAcceptHdr = req.headers ? req.headers['accept'] : undefined;
      const prevXrwHdr = req.headers ? req.headers['x-requested-with'] : undefined;

      try {
        if (req.headers) {
          req.headers['x-wdg-portal'] = '1';
          // Força JSON para evitar HTML 200 em endpoints /api/*.
          // Obs: alguns browsers/clients enviam Accept: */*; aqui sobrescrevemos explicitamente.
          if (String(target || '').includes('/api/')) {
            req.headers['accept'] = 'application/json';
            req.headers['x-requested-with'] = 'fetch';
          } else {
            if (!req.headers['accept']) req.headers['accept'] = 'application/json';
            if (!req.headers['x-requested-with']) req.headers['x-requested-with'] = 'fetch';
          }
        }
      } catch { /* noop */ }

      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        try { req.url = prevUrl; } catch { /* noop */ }
        try { req.originalUrl = prevOriginalUrl; } catch { /* noop */ }
        try {
          if (req.headers) {
            if (typeof prevPortalHdr === 'undefined') delete req.headers['x-wdg-portal'];
            else req.headers['x-wdg-portal'] = prevPortalHdr;

            if (typeof prevAcceptHdr === 'undefined') delete req.headers['accept'];
            else req.headers['accept'] = prevAcceptHdr;

            if (typeof prevXrwHdr === 'undefined') delete req.headers['x-requested-with'];
            else req.headers['x-requested-with'] = prevXrwHdr;
          }
        } catch { /* noop */ }
      };

      try {
        res.once('finish', restore);
        res.once('close', restore);
      } catch { /* noop */ }

      try {
        req.url = target;
        req.originalUrl = target;
      } catch {
        restore();
        throw new Error('Falha ao reescrever URL para proxy interno');
      }

      return parent.handle(req, res, (err) => {
        restore();
        if (err) return next(err);
        // Se ninguém respondeu (rota não casou), faz fallback via HTTP.
        if (!res.headersSent && !res.writableEnded) {
          return proxyViaHttp().catch(next);
        }
      });
    }

    return proxyViaHttp();
  } catch (e) {
    return next(e);
  }
}

// APIs necessárias para a UI (msg + auxiliares)
// Nota: o app já usa express.json/urlencoded globalmente. Para evitar ler o stream 2x,
// só aplicamos raw quando ainda não existe body parseado.
const _proxyRawAny = express.raw({ type: '*/*', limit: '25mb' });
function proxyMaybeRaw(req, res, next) {
  try {
    if (req && typeof req.body !== 'undefined' && req.body !== null && !Buffer.isBuffer(req.body)) {
      return next();
    }
  } catch {
    /* noop */
  }
  return _proxyRawAny(req, res, next);
}
app.all(['/api/msg', '/api/msg/*'], requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const localPath = String(req.originalUrl || req.url || '');
  const idx = localPath.indexOf('/api/');
  const pathOnly = idx >= 0 ? localPath.slice(idx) : String(req.url || '');
  return proxyToCondominios(req, res, next, '/condominios' + pathOnly);
});

app.all(['/api/unidades'], requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const localPath = String(req.originalUrl || req.url || '');
  const idx = localPath.indexOf('/api/');
  const pathOnly = idx >= 0 ? localPath.slice(idx) : String(req.url || '');
  return proxyToCondominios(req, res, next, '/condominios' + pathOnly);
});

app.all(['/api/usuarios/busca', '/api/usuarios/busca.v2', '/api/usuarios/foto'], requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const localPath = String(req.originalUrl || req.url || '');
  const idx = localPath.indexOf('/api/');
  const pathOnly = idx >= 0 ? localPath.slice(idx) : String(req.url || '');
  return proxyToCondominios(req, res, next, '/condominios' + pathOnly);
});

app.get('/mensagens', requirePortalLogin, (req, res) => {
  const bp = res.locals.basePath || req.baseUrl || '/portal-morador';
  return res.redirect(302, `${bp}/mensagens/entrada`);
});

app.get('/mensagens/:view', requirePortalLogin, (req, res) => {
  const ctxUser = req.portalUser || (req.session && req.session.portalUser) || null;
  if (!ctxUser) {
    const bp = res.locals.basePath || req.baseUrl || '/portal-morador';
    return res.redirect(302, `${bp}/login`);
  }

  const view = String(req.params.view || 'entrada').trim().toLowerCase();
  const allowed = new Set(['nova', 'entrada', 'saida', 'arquivo', 'lixeira', 'grupos', 'configuracao', 'caixas', 'cfg_caixas']);
  let safeView = allowed.has(view) ? view : 'entrada';
  if (safeView === 'caixas') safeView = 'cfg_caixas';

  return res.render('caixa_de_mensagem', {
    ...buildPortalContext(req),
    basePath: res.locals.basePath || req.baseUrl || '/portal-morador',
    msgInitialView: safeView,
    user: ctxUser
  });
});

// Alguns navegadores podem reenviar o POST anterior ao recarregar a página; normalize para GET
app.post('/home', (req, res) => {
  const base = req.baseUrl || '/portal-morador';
  return res.redirect(303, base + '/home');
});

app.get('/solicitacoes/servico', requirePortalLogin, (req, res) => {
  return res.render('portal_morador_servico', buildPortalContext(req));
});

app.get('/financeiro/boletos', requirePortalLogin, (req, res) => {
  return res.render('portal_morador_boletos', buildPortalContext(req));
});

app.get('/visitante/comunicar', requirePortalLogin, (req, res) => {
  return res.render('comunicar_visita', buildPortalContext(req));
});

app.get('/visitante/historico', requirePortalLogin, (req, res) => {
  return res.render('historico_visitas', buildPortalContext(req));
});

app.get('/enquetes', requirePortalLogin, (req, res) => {
  return res.render('enquetes', buildPortalContext(req));
});

app.get('/comunicados', requirePortalLogin, (req, res) => {
  return res.render('comunicados', buildPortalContext(req));
});

app.get('/assembleias', requirePortalLogin, (req, res) => {
  return res.render('portal_morador_assembleias', buildPortalContext(req));
});

app.get('/assembleias/:id/presenca', requirePortalLogin, (req, res) => {
  const ctx = buildPortalContext(req);
  return res.render('portal_morador_assembleia_presenca', {
    ...ctx,
    assembleiaId: String(req.params?.id || '').trim()
  });
});

app.get('/assembleias/:id/status', requirePortalLogin, (req, res) => {
  const ctx = buildPortalContext(req);
  return res.render('portal_morador_assembleia_status', {
    ...ctx,
    assembleiaId: String(req.params?.id || '').trim()
  });
});

app.get('/api/assembleias', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('CDN-Cache-Control', 'no-store');
  } catch {
    /* noop */
  }

  const ctx = buildPortalContext(req);
  const queryTimeout = getMongoQueryTimeoutMs();
  const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];

  let unidadeId = String(ctx?.unidadeId || req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || req.user?.unidadePrincipalId || '').trim();

  const userIdCandidates = new Set();
  [
    req.user?.id,
    req.user?.cond_usuario_id,
    req.user?._id,
    req.session?.portalUser?.id,
    req.session?.portalUser?.cond_usuario_id,
    req.session?.portalUser?._id
  ].forEach((v) => {
    const id = String(v || '').trim();
    if (id) userIdCandidates.add(id);
  });

  const habitacaoCandidates = new Set();
  const addHabCandidate = (val) => {
    const id = String(val || '').trim();
    if (id && /^[0-9a-fA-F]{24}$/.test(id)) habitacaoCandidates.add(id);
  };

  addHabCandidate(req.query?.hab);
  addHabCandidate(req.user?.habitacao_id);
  addHabCandidate(req.user?.habitacaoId);
  addHabCandidate(ctx?.habitacaoId);

  const activeUnit = String(unidadeId || '').trim();
  for (const v of vinculos) {
    const vUnit = String(v?.unidade_id || v?.unidadeId || '').trim();
    const vHab = String(v?.habitacao_id || v?.habitacaoId || '').trim();
    if (!activeUnit || !vUnit || vUnit === activeUnit) addHabCandidate(vHab);
  }

  if ((!unidadeId || !mongoose.isValidObjectId(unidadeId)) && habitacaoCandidates.size) {
    const firstHab = Array.from(habitacaoCandidates)[0] || '';
    unidadeId = await resolveUnidadeIdFromHabitacao(firstHab, unidadeId, queryTimeout);
  }

  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
    for (const v of vinculos) {
      const vUnit = String(v?.unidade_id || v?.unidadeId || '').trim();
      if (vUnit && mongoose.isValidObjectId(vUnit)) {
        unidadeId = vUnit;
        break;
      }
    }
  }

  const wantedKeys = new Set(Array.from(userIdCandidates).map((id) => `portal:${String(id).toLowerCase()}`));
  const debug = String(req.query?.debug || '').trim() === '1';

  // Evita ficar pendurado quando o Mongo está oscilando.
  try {
    if (mongoose.connection.readyState !== 1) {
      await withTimeout(tryReconnectMongo(), getMongoQueryTimeoutMs(), 'mongo-reconnect');
    }
  } catch {
    // ignore: trata abaixo
  }

  // Diagnóstico: ajuda a confirmar se o Portal está com unidadeId válido
  // (em alguns fluxos o user.unidade_id vem populado como objeto).
  try {
    res.set('X-Portal-Unidade-Id', unidadeId || '');
    res.set('X-Portal-Unidade-Id-Valid', String(!!(unidadeId && mongoose.isValidObjectId(unidadeId))));
  } catch {
    /* noop */
  }

  const unidadeIdValid = !!(unidadeId && mongoose.isValidObjectId(unidadeId));
  if (!unidadeIdValid && !userIdCandidates.size && !habitacaoCandidates.size) {
    return res.json({
      ok: true,
      assembleias: [],
      ...(debug ? { meta: { unidadeId, unidadeIdValid: false, reason: 'no-unidade-and-no-identity' } } : {})
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return respondDbOffline(res, req);
  }

  const query = {
    ...(unidadeIdValid ? { unidade_id: unidadeId } : {}),
    status: { $ne: 'rascunho' }
  };

  const presenceMatchesUser = (presence) => {
    try {
      if (!presence || typeof presence !== 'object') return false;
      const pUser = String(presence?.pessoa_id || '').trim();
      const pKey = String(presence?.key || '').trim().toLowerCase();
      const pHab = String(presence?.habitacao_id || '').trim();
      const isRemoved = !!presence?.isRemoved;
      const pStatus = String(presence?.status || '').trim().toUpperCase();
      if (isRemoved) return false;
      if (pStatus === 'REJECTED' || pStatus === 'CANCELED') return false;
      if (pUser && userIdCandidates.has(pUser)) return true;
      if (pKey && wantedKeys.has(pKey)) return true;
      if (pHab && habitacaoCandidates.has(pHab)) return true;
      return false;
    } catch {
      return false;
    }
  };

  let assembleias = [];
  try {
    let meta;
    if (debug) {
      try {
        const timeoutMs = getMongoQueryTimeoutMs();
        const totalUnidade = await withTimeout(
          CondAssembleia.countDocuments(unidadeIdValid ? { unidade_id: unidadeId } : {}),
          timeoutMs,
          'assembleias-count-total'
        );
        const totalElegiveis = await withTimeout(
          CondAssembleia.countDocuments(query),
          timeoutMs,
          'assembleias-count-elegiveis'
        );
        meta = {
          unidadeId,
          unidadeIdValid,
          mongoReadyState: mongoose.connection.readyState,
          totalUnidade,
          totalElegiveis,
          userIdsCount: userIdCandidates.size,
          habitacaoIdsCount: habitacaoCandidates.size,
          filtro: {
            statusNotRascunho: true,
          }
        };
      } catch {
        meta = { unidadeId, unidadeIdValid, mongoReadyState: mongoose.connection.readyState };
      }
    }

    const publishedAssembleias = await withTimeout(
      CondAssembleia.find(query)
        .sort({ data: -1, createdAt: -1 })
        .select('data hora1 hora2 horaUnica numero titulo natureza status')
        .lean(),
      getMongoQueryTimeoutMs(),
      'assembleias-find'
    );

    let assembleiasByPresence = [];
    if (userIdCandidates.size || habitacaoCandidates.size) {
      const elemOr = [];
      if (userIdCandidates.size) {
        elemOr.push({ pessoa_id: { $in: Array.from(userIdCandidates.values()) } });
      }
      if (wantedKeys.size) {
        elemOr.push({ key: { $in: Array.from(wantedKeys.values()) } });
      }
      if (habitacaoCandidates.size) {
        elemOr.push({ habitacao_id: { $in: Array.from(habitacaoCandidates.values()) } });
      }

      const execPresenceQuery = {
        ...(unidadeIdValid ? { unidade_id: unidadeId } : {}),
        ...(elemOr.length ? { presences: { $elemMatch: { $or: elemOr } } } : {})
      };

      const execDocs = await withTimeout(
        CondAssembleiaExecution.find(execPresenceQuery)
          .select('assembleia_id unidade_id presences')
          .lean(),
        queryTimeout,
        'assembleias-find-by-presence-execution'
      );

      const idsFromPresence = (Array.isArray(execDocs) ? execDocs : [])
        .filter((execDoc) => {
          const presences = Array.isArray(execDoc?.presences) ? execDoc.presences : [];
          return presences.some((p) => presenceMatchesUser(p));
        })
        .map((execDoc) => String(execDoc?.assembleia_id || '').trim())
        .filter((id) => id && mongoose.isValidObjectId(id));

      if (idsFromPresence.length) {
        const uniquePresenceIds = [...new Set(idsFromPresence)];
        assembleiasByPresence = await withTimeout(
          CondAssembleia.find({ _id: { $in: uniquePresenceIds }, ...(unidadeIdValid ? { unidade_id: unidadeId } : {}) })
            .select('data hora1 hora2 horaUnica numero titulo natureza status')
            .lean(),
          queryTimeout,
          'assembleias-find-by-presence-assembleia'
        );

        if (debug && meta) {
          meta.totalViaPresence = uniquePresenceIds.length;
          meta.execPresenceQuery = {
            unidadeScoped: !!unidadeIdValid,
            userIdsCount: userIdCandidates.size,
            habitacaoIdsCount: habitacaoCandidates.size,
            keysCount: wantedKeys.size
          };
        }
      } else if (debug && meta) {
        meta.totalViaPresence = 0;
      }
    }

    const mergedMap = new Map();
    for (const a of (Array.isArray(publishedAssembleias) ? publishedAssembleias : [])) {
      const id = String(a?._id || a?.id || '').trim();
      if (!id) continue;
      mergedMap.set(id, a);
    }
    for (const a of (Array.isArray(assembleiasByPresence) ? assembleiasByPresence : [])) {
      const id = String(a?._id || a?.id || '').trim();
      if (!id) continue;
      if (!mergedMap.has(id)) mergedMap.set(id, a);
    }

    assembleias = Array.from(mergedMap.values()).sort((a, b) => {
      const ad = a?.data ? new Date(a.data).getTime() : 0;
      const bd = b?.data ? new Date(b.data).getTime() : 0;
      if (bd !== ad) return bd - ad;
      const ac = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bc = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bc - ac;
    });

    if (debug && meta) {
      return res.json({ ok: true, assembleias, meta });
    }
  } catch (err) {
    if (isMongoOfflineError(err)) return respondDbOffline(res, req);
    throw err;
  }

  return res.json({ ok: true, assembleias });
}));

app.get('/api/assembleias/:id', requirePortalLogin, wrapAsync(async (req, res) => {
  const ctx = buildPortalContext(req);
  const unidadeId = String(ctx?.unidadeId || '').trim();
  const id = String(req.params?.id || '').trim();

  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) return res.status(400).json({ ok: false, error: 'Unidade inválida' });
  if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

  // Evita ficar pendurado quando o Mongo está oscilando.
  try {
    if (mongoose.connection.readyState !== 1) {
      await withTimeout(tryReconnectMongo(), getMongoQueryTimeoutMs(), 'mongo-reconnect');
    }
  } catch {
    /* noop */
  }

  if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

  const queryTimeout = getMongoQueryTimeoutMs();
  const query = {
    _id: id,
    unidade_id: unidadeId,
    publicarPortal: { $ne: false },
    status: { $ne: 'rascunho' }
  };

  const doc = await CondAssembleia.findOne(query)
    .select('data hora1 hora2 horaUnica numero titulo natureza status unidade_id')
    .lean()
    .maxTimeMS(queryTimeout);

  if (!doc) return res.status(404).json({ ok: false, error: 'Assembleia não encontrada' });
  return res.json({ ok: true, data: { ...doc, _id: String(doc._id) } });
}));

// Presença (Portal) — usa o backend do módulo Condomínios via proxy interno
app.get('/api/assembleias/:id/presenca', requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  return proxyToCondominios(req, res, next, `/condominios/api/assembleias/${encodeURIComponent(id)}/execution/presence/me`);
});

app.post('/api/assembleias/:id/presenca/solicitar', requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  return proxyToCondominios(req, res, next, `/condominios/api/assembleias/${encodeURIComponent(id)}/execution/presence`);
});

app.post('/api/assembleias/:id/presenca/confirmar', requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  // Confirma presença do usuário logado via /execution/presence (Portal)
  return proxyToCondominios(req, res, next, `/condominios/api/assembleias/${encodeURIComponent(id)}/execution/presence`);
});

app.post('/assembleias/:id/presenca/solicitar', requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  return proxyToCondominios(req, res, next, `/condominios/api/assembleias/${encodeURIComponent(id)}/execution/presence`);
});

app.post('/assembleias/:id/presenca/confirmar', requirePortalLogin, proxyMaybeRaw, (req, res, next) => {
  const id = String(req.params?.id || '').trim();
  return proxyToCondominios(req, res, next, `/condominios/api/assembleias/${encodeURIComponent(id)}/execution/presence`);
});

app.get('/api/assembleias/:id/status', requirePortalLogin, wrapAsync(async (req, res) => {
  const ctx = buildPortalContext(req);
  const id = String(req.params?.id || '').trim();
  const userId = String(req.user?.id || req.user?.cond_usuario_id || req.user?._id || '').trim();
  const habitacaoId = String(req.query?.hab || req.user?.habitacao_id || req.user?.habitacaoId || '').trim();

  if (!id || !mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: 'ID inválido' });

  const execDoc = await CondAssembleiaExecution.findOne({ assembleia_id: id })
    .select('assembleia_id sessionStatus isPaused currentAgendaIdx agenda votes presences closedAt openedAt')
    .lean();

  const mapAssemblyState = (sessionStatus, isPaused) => {
    if (isPaused) return 'PAUSED';
    const s = String(sessionStatus || '').trim().toLowerCase();
    if (s === 'encerrada') return 'CLOSED';
    if (s === 'aberta') return 'OPEN';
    if (s === 'em_votacao') return 'OPEN';
    if (s === 'aguardando') return 'WAITING';
    return 'UNKNOWN';
  };

  const currentIdx = Number(execDoc?.currentAgendaIdx || 0) || 0;
  const agenda = Array.isArray(execDoc?.agenda) ? execDoc.agenda : [];
  const currentAgendaItem = agenda.find((a) => Number(a?.idx) === currentIdx) || agenda[currentIdx] || null;

  const votes = Array.isArray(execDoc?.votes) ? execDoc.votes : [];
  const openVote = votes.find((v) => Number(v?.agendaIdx) === currentIdx && v?.openedAt && !v?.closedAt) || null;

  const presenceList = Array.isArray(execDoc?.presences) ? execDoc.presences : [];
  const toKey = (uid) => `portal:${String(uid || '').trim().toLowerCase()}`;
  const wantedKey = toKey(userId);
  const myPresence = presenceList.find((p) => {
    const key = String(p?.key || '').trim().toLowerCase();
    const pUser = String(p?.pessoa_id || '').trim();
    const pHab = String(p?.habitacao_id || '').trim();
    return (userId && (pUser === userId || key === wantedKey)) || (habitacaoId && pHab === habitacaoId);
  }) || null;

  const role = String(myPresence?.presence_role || 'REPRESENTANTE').trim().toUpperCase();
  const status = String(myPresence?.status || '').trim().toUpperCase();
  const canVote = role === 'REPRESENTANTE' && status === 'CONFIRMED';

  return res.json({
    ok: true,
    data: {
      assembleiaId: id,
      assemblyState: mapAssemblyState(execDoc?.sessionStatus, !!execDoc?.isPaused),
      status: mapAssemblyState(execDoc?.sessionStatus, !!execDoc?.isPaused),
      currentAgendaItem: currentAgendaItem
        ? {
          idx: Number(currentAgendaItem?.idx || 0) || 0,
          tipo: String(currentAgendaItem?.tipo || '').trim(),
          descricao: String(currentAgendaItem?.descricao || '').trim(),
          state: String(currentAgendaItem?.state || '').trim()
        }
        : null,
      voting: {
        isOpen: !!openVote,
        tipo: openVote ? String(openVote?.voteType || '').trim() : null
      },
      presence: myPresence
        ? {
          presenceId: String(myPresence?.presenceId || '').trim() || null,
          status,
          role,
          canVote
        }
        : null,
      session: {
        openedAt: execDoc?.openedAt || null,
        closedAt: execDoc?.closedAt || null
      },
      unidadeId: String(ctx?.unidadeId || '').trim() || null
    }
  });
}));

function normalizeDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

function calcEnqueteStatus(enq, now = new Date()) {
  try {
    if (!enq) return 'inativo';
    if (enq.finalizadaEm) return 'inativo';
    const ini = enq.vigencia_inicio ? new Date(enq.vigencia_inicio) : null;
    const fim = enq.vigencia_fim ? new Date(enq.vigencia_fim) : null;
    if (ini && now < ini) return 'inativo';
    if (fim && now > fim) return 'inativo';
    return 'ativo';
  } catch {
    return 'inativo';
  }
}

function enquetePassaRestricoes(enq, { habitacaoId, userId, email, cpf, moradorIds, habIsDesabitada, isProprietario, isResponsavelHabitacao } = {}) {
  try {
    const r = (enq && enq.restricoes && typeof enq.restricoes === 'object') ? enq.restricoes : {};
    const hab = String(habitacaoId || '').trim();
    const uid = String(userId || '').trim();
    const em = String(email || '').trim().toLowerCase();
    const cpfDigits = normalizeDigits(cpf);

    // Regras (além das listas de exclusão)
    if (r.naoExibirHabDesabitadas && habIsDesabitada === true) return false;
    if (r.apenasProprietario && isProprietario === false) return false;
    if (r.apenasResponsavelHabitacao && isResponsavelHabitacao === false) return false;

    const morIds = Array.isArray(moradorIds)
      ? moradorIds.map(v => String(v || '').trim()).filter(Boolean)
      : [];
    const candidateIds = Array.from(new Set([uid, ...morIds].filter(Boolean)));

    const excHab = Array.isArray(r.excluirHabitacaoIds) ? r.excluirHabitacaoIds.map(String) : [];
    if (hab && excHab.includes(hab)) return false;
    const excMor = Array.isArray(r.excluirMoradorIds) ? r.excluirMoradorIds.map(String) : [];
    if (candidateIds.length && excMor.some(x => candidateIds.includes(String(x)))) return false;
    const excEmails = Array.isArray(r.excluirMoradorEmails) ? r.excluirMoradorEmails.map(s => String(s || '').toLowerCase().trim()).filter(Boolean) : [];
    if (em && excEmails.includes(em)) return false;
    const excCpfs = Array.isArray(r.excluirMoradorCpfs) ? r.excluirMoradorCpfs.map(normalizeDigits).filter(Boolean) : [];
    if (cpfDigits && excCpfs.includes(cpfDigits)) return false;

    return true;
  } catch {
    return true;
  }
}

async function buildRestricoesCtxFromPortalReq(req, { habId, unidadeIdResolved, queryTimeout }) {
  const userId = String(req.user?.id || req.user?.cond_usuario_id || '').trim();
  const email = String(req.user?.email || '').trim().toLowerCase();
  const cpf = String(req.user?.cpf || req.user?.documento || '').trim();
  const habIdStr = String(habId || '').trim();

  // Proprietário via vínculo de sessão (mais confiável que heurística por e-mail)
  let isProprietario = false;
  try {
    const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];
    const v = vinculos.find(v => String(v?.habitacao_id || v?.habitacaoId || '').trim() === habIdStr);
    const papeis = Array.isArray(v?.papeis) ? v.papeis : [];
    isProprietario = papeis.includes('proprietario');
  } catch {
    isProprietario = false;
  }

  // Compat com Admin: restrições usam IDs de CondMorador.
  let moradorIds = [];
  try {
    const or = [];
    const em = String(email || '').trim().toLowerCase();
    if (em) or.push({ email: em });
    const cpfDigits = normalizeDigits(cpf);
    if (cpfDigits) or.push({ cpf: cpfDigits });

    if (or.length) {
      const q = {
        unidade_id: unidadeIdResolved,
        ativo: { $ne: false },
        $or: or
      };
      if (/^[0-9a-fA-F]{24}$/.test(habIdStr)) q.habitacao_id = habIdStr;
      const morDocs = await CondMorador.find(q)
        .select('_id')
        .limit(5)
        .lean()
        .maxTimeMS(queryTimeout);
      moradorIds = (Array.isArray(morDocs) ? morDocs : []).map(m => String(m?._id || '')).filter(Boolean);
    }
  } catch {
    moradorIds = [];
  }

  // Desabitada = sem nenhum morador ativo; também considera hab desativada.
  let habIsDesabitada = false;
  let responsavelMoradorId = '';
  try {
    if (/^[0-9a-fA-F]{24}$/.test(habIdStr)) {
      const habDoc = await CondHabitacao.findById(habIdStr)
        .select('ativa contrato_locacao.responsavel_morador_id contratos_locacao.responsavel_morador_id')
        .lean()
        .maxTimeMS(queryTimeout);

      if (habDoc && habDoc.ativa === false) habIsDesabitada = true;

      const hasMorador = await CondMorador.exists({ habitacao_id: habIdStr, ativo: { $ne: false } })
        .maxTimeMS(queryTimeout);
      if (!hasMorador) habIsDesabitada = true;

      const respA = habDoc?.contrato_locacao?.responsavel_morador_id ? String(habDoc.contrato_locacao.responsavel_morador_id) : '';
      let respB = '';
      try {
        const list = Array.isArray(habDoc?.contratos_locacao) ? habDoc.contratos_locacao : [];
        for (let i = list.length - 1; i >= 0; i--) {
          const cand = list[i]?.responsavel_morador_id ? String(list[i].responsavel_morador_id) : '';
          if (cand) { respB = cand; break; }
        }
      } catch {
        respB = '';
      }
      responsavelMoradorId = respA || respB;
    }
  } catch {
    // Se falhar, mantém defaults conservadores
    habIsDesabitada = false;
    responsavelMoradorId = '';
  }

  // Responsável: preferir o responsável do contrato; se não existir, tratar proprietário como responsável.
  const candidateIds = Array.from(new Set([userId, ...(Array.isArray(moradorIds) ? moradorIds : [])].filter(Boolean)));
  let isResponsavelHabitacao = false;
  if (responsavelMoradorId) {
    isResponsavelHabitacao = candidateIds.includes(String(responsavelMoradorId));
  } else if (isProprietario) {
    isResponsavelHabitacao = true;
  }

  return { habitacaoId: habIdStr, userId, email, cpf, moradorIds, habIsDesabitada, isProprietario, isResponsavelHabitacao };
}

function calcComunicadoStatus(com, now = new Date()) {
  try {
    if (!com) return 'encerrada';
    const ini = com.vigencia_inicio ? new Date(com.vigencia_inicio) : null;
    const fim = com.vigencia_fim ? new Date(com.vigencia_fim) : null;
    if (ini && now < ini) return 'agendada';
    if (fim && now > fim) return 'encerrada';
    return 'ativa';
  } catch {
    return 'encerrada';
  }
}

function comunicadoPassaRestricoes(com, ctx = {}) {
  // Estrutura de restrições é idêntica à de Enquetes.
  return enquetePassaRestricoes({ restricoes: com?.restricoes || {} }, ctx);
}

async function ensurePortalMongoOnline(req, res) {
  const timeout = getMongoQueryTimeoutMs();
  if (mongoose.connection.readyState === 1) return null;

  // Se está conectando, aguarda antes de reconectar.
  if (mongoose.connection.readyState === 2) {
    const ok = await waitForMongoReady(timeout);
    if (ok) return null;
  }

  await tryReconnectMongo();

  if (mongoose.connection.readyState !== 1) {
    const ok = await waitForMongoReady(timeout);
    if (!ok) return respondDbOffline(res, req);
  }

  // Se reconectou depois do boot com skipDb=true, desliga o modo sem DB.
  try {
    if (req?.app?.locals) req.app.locals.skipDb = false;
    if (req?.app?.parent?.locals) req.app.parent.locals.skipDb = false;
  } catch {
    /* noop */
  }

  return null;
}

async function resolveUnidadeIdFromHabitacao(habitacaoId, fallbackUnidadeId, queryTimeout) {
  const habId = String(habitacaoId || '').trim();
  const fallback = String(fallbackUnidadeId || '').trim();
  if (!habId) return fallback;
  // Evita CastError caso venha algum valor inesperado.
  if (!/^[0-9a-fA-F]{24}$/.test(habId)) return fallback;
  try {
    const hab = await CondHabitacao.findById(habId)
      .select('unidade_id')
      .lean()
      .maxTimeMS(queryTimeout);
    const unidadeFromHab = hab?.unidade_id ? String(hab.unidade_id) : '';
    return unidadeFromHab || fallback;
  } catch {
    return fallback;
  }
}

// Enquetes por habitação (para página e Home)
app.get('/api/enquetes', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const userId = String(req.user?.id || req.user?.cond_usuario_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    const cpf = String(req.user?.cpf || req.user?.documento || '').trim();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });
    if (!unidadeId) return res.status(400).json({ ok: false, error: 'Unidade inválida' });

    let habId = String(req.query?.hab || req.user?.habitacao_id || req.user?.habitacaoId || '').trim();
    if (!habId) {
      // Alguns pontos do Portal (ex.: sino do menu) chamam /api/enquetes sem ?hab.
      // Quando o usuário já tem `vinculos` na sessão, use a primeira habitação válida.
      try {
        const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];
        const unidadeAtiva = String(unidadeId || '').trim();
        const pick = (list) => {
          for (const v of list) {
            const cand = String(v?.habitacao_id || v?.habitacaoId || '').trim();
            if (/^[0-9a-fA-F]{24}$/.test(cand)) return cand;
          }
          return '';
        };
        const sameUnit = unidadeAtiva
          ? vinculos.filter(v => String(v?.unidade_id || v?.unidadeId || '').trim() === unidadeAtiva)
          : [];
        habId = pick(sameUnit) || pick(vinculos);
      } catch {
        habId = '';
      }
    }
    // Sem habitação vinculada: não há como filtrar restrições por hab; devolve vazio e evita ruído (400) no console.
    if (!habId) {
      const wantDebug = String(req.query?.debug || '').trim() === '1';
      return res.json(wantDebug
        ? { ok: true, data: [], debug: { reason: 'no-habitacao', unidadeId: unidadeId || null, vinculosCount: Array.isArray(req.user?.vinculos) ? req.user.vinculos.length : 0 } }
        : { ok: true, data: [] }
      );
    }

    const offline = await ensurePortalMongoOnline(req, res);
    if (offline) return offline;

    const queryTimeout = getMongoQueryTimeoutMs();
    const now = new Date();

    const unidadeIdResolved = await resolveUnidadeIdFromHabitacao(habId, unidadeId, queryTimeout);

    const restrCtx = await buildRestricoesCtxFromPortalReq(req, { habId, unidadeIdResolved, queryTimeout });

    const enquetesRaw = await CondEnquete.find({ unidade_id: unidadeIdResolved })
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(queryTimeout);

    const enquetes = (Array.isArray(enquetesRaw) ? enquetesRaw : [])
      .filter(e => enquetePassaRestricoes(e, restrCtx))
      .map(e => ({
        _id: String(e._id),
        createdAt: e.createdAt || null,
        pergunta: String(e.pergunta || '').trim(),
        foto_pergunta: String(e.foto_pergunta || '').trim(),
        vigencia_inicio: e.vigencia_inicio,
        vigencia_fim: e.vigencia_fim,
        status: calcEnqueteStatus(e, now),
        opcoes: Array.isArray(e.opcoes) ? e.opcoes.map(o => ({ _id: String(o._id), texto: String(o.texto || '').trim(), foto: String(o?.foto || '').trim() })) : []
      }));

    const ids = enquetes.map(e => e._id).filter(Boolean);
    let votosUser = [];
    if (ids.length && userId) {
      votosUser = await CondEnqueteVoto.find({ unidade_id: unidadeIdResolved, morador_id: userId, enquete_id: { $in: ids } })
        .select('enquete_id opcao_id createdAt')
        .lean()
        .maxTimeMS(queryTimeout);
    }
    const votedMap = new Map((Array.isArray(votosUser) ? votosUser : []).map(v => [String(v.enquete_id), v]));

    const out = enquetes.map(e => {
      const v = votedMap.get(String(e._id)) || null;
      return {
        ...e,
        jaVotou: !!v,
        userOpcaoId: v?.opcao_id ? String(v.opcao_id) : null
      };
    });

    const wantDebug = String(req.query?.debug || req.query?.__debug || '') === '1';
    if (wantDebug) {
      const isHabObjectId = /^[0-9a-fA-F]{24}$/.test(String(habId || ''));
      const isUnidadeSessaoObjectId = /^[0-9a-fA-F]{24}$/.test(String(unidadeId || ''));
      const isUnidadeResolvedObjectId = /^[0-9a-fA-F]{24}$/.test(String(unidadeIdResolved || ''));

      let habDoc = null;
      try {
        if (isHabObjectId) {
          habDoc = await CondHabitacao.findById(habId)
            .select('_id unidade_id')
            .lean()
            .maxTimeMS(queryTimeout);
        }
      } catch {
        habDoc = null;
      }

      const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];
      const unidadesVinculos = Array.from(new Set(
        vinculos
          .map(v => (v && v.unidade_id ? String(v.unidade_id) : ''))
          .filter(Boolean)
      ));

      let enquetesCountSessao = null;
      try {
        if (unidadeId && unidadeId !== unidadeIdResolved && isUnidadeSessaoObjectId) {
          enquetesCountSessao = await CondEnquete.countDocuments({ unidade_id: unidadeId }).maxTimeMS(queryTimeout);
        }
      } catch {
        enquetesCountSessao = null;
      }

      let enquetesCountByVinculoUnidade = null;
      try {
        const unitsToCount = unidadesVinculos
          .filter(uid => /^[0-9a-fA-F]{24}$/.test(uid))
          .slice(0, 10);
        if (unitsToCount.length) {
          const pairs = await Promise.all(unitsToCount.map(async (uid) => {
            try {
              const c = await CondEnquete.countDocuments({ unidade_id: uid }).maxTimeMS(queryTimeout);
              return [uid, c];
            } catch {
              return [uid, null];
            }
          }));
          enquetesCountByVinculoUnidade = Object.fromEntries(pairs);
        }
      } catch {
        enquetesCountByVinculoUnidade = null;
      }

      return res.json({
        ok: true,
        data: out,
        debug: {
          mongoReadyState: mongoose.connection.readyState,
          habId: habId,
          habIsObjectId: isHabObjectId,
          habFound: !!habDoc,
          habUnidadeId: habDoc?.unidade_id ? String(habDoc.unidade_id) : null,
          unidadeIdSessao: unidadeId || null,
          unidadeIdSessaoIsObjectId: isUnidadeSessaoObjectId,
          unidadeIdResolvida: unidadeIdResolved || null,
          unidadeIdResolvidaIsObjectId: isUnidadeResolvedObjectId,
          userId: userId || null,
          userEmail: email || null,
          vinculosCount: vinculos.length,
          unidadesVinculos: unidadesVinculos,
          enquetesCountResolvida: Array.isArray(enquetesRaw) ? enquetesRaw.length : null,
          enquetesCountSessao: enquetesCountSessao,
          enquetesCountByVinculoUnidade,
          filtradasCount: out.length
        }
      });
    }

    return res.json({ ok: true, data: out });
  } catch (err) {
    console.error('[portal-morador][api/enquetes GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao carregar enquetes' });
  }
}));

// Comunicados por habitação (mural)
app.get('/api/comunicados', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const userId = String(req.user?.id || req.user?.cond_usuario_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    const cpf = String(req.user?.cpf || req.user?.documento || '').trim();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });
    if (!unidadeId) return res.status(400).json({ ok: false, error: 'Unidade inválida' });

    const habId = String(req.query?.hab || req.user?.habitacao_id || req.user?.habitacaoId || '').trim();
    if (!habId) return res.status(400).json({ ok: false, error: 'Habitação inválida' });

    const offline = await ensurePortalMongoOnline(req, res);
    if (offline) return offline;

    const queryTimeout = getMongoQueryTimeoutMs();
    const now = new Date();

    const unidadeIdResolved = await resolveUnidadeIdFromHabitacao(habId, unidadeId, queryTimeout);

    const restrCtx = await buildRestricoesCtxFromPortalReq(req, { habId, unidadeIdResolved, queryTimeout });

    const rawLimit = Number(req.query?.limit || 20);
    const limit = Math.max(1, Math.min(40, Number.isFinite(rawLimit) ? rawLimit : 20));
    const includeAll = String(req.query?.all || '') === '1';

    const q = { unidade_id: unidadeIdResolved };
    if (!includeAll) {
      q.vigencia_inicio = { $lte: now };
      q.vigencia_fim = { $gte: now };
    }

    const docs = await CondComunicado.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .maxTimeMS(queryTimeout);

    const filtered = (Array.isArray(docs) ? docs : []).filter(com => comunicadoPassaRestricoes(com, {
      ...restrCtx
    }));

    const data = filtered.map(com => ({
      _id: com?._id,
      assunto: com?.assunto || '',
      mensagem: com?.mensagem || '',
      foto: com?.foto || '',
      vigencia_inicio: com?.vigencia_inicio,
      vigencia_fim: com?.vigencia_fim,
      createdAt: com?.createdAt,
      statusCalc: calcComunicadoStatus(com, now)
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/comunicados GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao carregar comunicados' });
  }
}));

// Detalhes/resumo de uma enquete (contagem por alternativa)
app.get('/api/enquetes/:id([0-9a-fA-F]{24})/detalhes', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const userId = String(req.user?.id || req.user?.cond_usuario_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    const cpf = String(req.user?.cpf || req.user?.documento || '').trim();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });
    if (!unidadeId) return res.status(400).json({ ok: false, error: 'Unidade inválida' });

    const habId = String(req.query?.hab || req.user?.habitacao_id || req.user?.habitacaoId || '').trim();
    if (!habId) return res.status(400).json({ ok: false, error: 'Habitação inválida' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

    const offline = await ensurePortalMongoOnline(req, res);
    if (offline) return offline;
    const queryTimeout = getMongoQueryTimeoutMs();

    const unidadeIdResolved = await resolveUnidadeIdFromHabitacao(habId, unidadeId, queryTimeout);

    const restrCtx = await buildRestricoesCtxFromPortalReq(req, { habId, unidadeIdResolved, queryTimeout });

    const enq = await CondEnquete.findOne({ _id: id, unidade_id: unidadeIdResolved }).lean().maxTimeMS(queryTimeout);
    if (!enq) return res.status(404).json({ ok: false, error: 'Enquete não encontrada' });
    if (!enquetePassaRestricoes(enq, restrCtx)) {
      return res.status(404).json({ ok: false, error: 'Enquete não encontrada' });
    }

    const votos = await CondEnqueteVoto.find({ unidade_id: unidadeIdResolved, enquete_id: id })
      .select('opcao_id morador_id')
      .lean()
      .maxTimeMS(queryTimeout);

    const totalVotos = Array.isArray(votos) ? votos.length : 0;
    const opcoes = Array.isArray(enq.opcoes) ? enq.opcoes : [];
    const byOpt = new Map(opcoes.map(o => [String(o._id), { opcaoId: String(o._id), texto: String(o.texto || '').trim(), foto: String(o?.foto || '').trim(), votos: 0, percent: 0 }]));

    for (const v of (Array.isArray(votos) ? votos : [])) {
      const key = String(v.opcao_id || '');
      if (!key) continue;
      if (!byOpt.has(key)) byOpt.set(key, { opcaoId: key, texto: 'Opção', foto: '', votos: 0, percent: 0 });
      byOpt.get(key).votos += 1;
    }

    const outOpts = Array.from(byOpt.values()).map(o => ({
      ...o,
      percent: totalVotos ? (o.votos * 100) / totalVotos : 0
    }));

    let userVote = null;
    if (userId) {
      userVote = await CondEnqueteVoto.findOne({ unidade_id: unidadeIdResolved, enquete_id: id, morador_id: userId })
        .select('opcao_id createdAt')
        .lean()
        .maxTimeMS(queryTimeout);
    }

    const status = calcEnqueteStatus(enq);
    return res.json({
      ok: true,
      enquete: {
        _id: String(enq._id),
        pergunta: String(enq.pergunta || '').trim(),
        foto_pergunta: String(enq.foto_pergunta || '').trim(),
        vigencia_inicio: enq.vigencia_inicio,
        vigencia_fim: enq.vigencia_fim,
        status
      },
      status,
      totalVotos,
      opcoes: outOpts,
      jaVotou: !!userVote,
      userOpcaoId: userVote?.opcao_id ? String(userVote.opcao_id) : null,
      podeVotar: status === 'ativo' && !userVote
    });
  } catch (err) {
    console.error('[portal-morador][api/enquetes detalhes] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao carregar detalhes da enquete' });
  }
}));

// Votar (apenas 1 voto por usuário)
app.post('/api/enquetes/:id([0-9a-fA-F]{24})/votar', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const userId = String(req.user?.id || req.user?.cond_usuario_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    const nome = String(req.user?.nome || req.user?.name || '').trim();
    const cpf = String(req.user?.cpf || req.user?.documento || '').trim();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });
    if (!unidadeId) return res.status(400).json({ ok: false, error: 'Unidade inválida' });
    if (!userId) return res.status(400).json({ ok: false, error: 'Usuário inválido' });

    const habId = String(req.body?.hab || req.query?.hab || req.user?.habitacao_id || req.user?.habitacaoId || '').trim();
    const habLabel = String(req.user?.habitacao_label || req.user?.habitacaoLabel || '').trim();
    if (!habId) return res.status(400).json({ ok: false, error: 'Habitação inválida' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });
    const opcaoId = String(req.body?.opcao_id || req.body?.opcaoId || '').trim();
    if (!opcaoId) return res.status(400).json({ ok: false, error: 'Selecione uma alternativa' });

    const offline = await ensurePortalMongoOnline(req, res);
    if (offline) return offline;
    const queryTimeout = getMongoQueryTimeoutMs();

    const unidadeIdResolved = await resolveUnidadeIdFromHabitacao(habId, unidadeId, queryTimeout);

    const restrCtx = await buildRestricoesCtxFromPortalReq(req, { habId, unidadeIdResolved, queryTimeout });

    const enq = await CondEnquete.findOne({ _id: id, unidade_id: unidadeIdResolved }).lean().maxTimeMS(queryTimeout);
    if (!enq) return res.status(404).json({ ok: false, error: 'Enquete não encontrada' });
    if (!enquetePassaRestricoes(enq, restrCtx)) {
      return res.status(404).json({ ok: false, error: 'Enquete não encontrada' });
    }
    const status = calcEnqueteStatus(enq);
    if (status !== 'ativo') return res.status(400).json({ ok: false, error: 'Esta enquete está inativa.' });

    const opcoes = Array.isArray(enq.opcoes) ? enq.opcoes : [];
    const opcaoOk = opcoes.some(o => String(o?._id || '') === opcaoId);
    if (!opcaoOk) return res.status(400).json({ ok: false, error: 'Alternativa inválida' });

    const already = await CondEnqueteVoto.findOne({ unidade_id: unidadeIdResolved, enquete_id: id, morador_id: userId })
      .select('_id opcao_id')
      .lean()
      .maxTimeMS(queryTimeout);
    if (already) {
      return res.status(400).json({ ok: false, error: 'Você já votou nesta enquete.' });
    }

    try {
      await CondEnqueteVoto.create({
        unidade_id: unidadeIdResolved,
        enquete_id: id,
        habitacao_id: habId,
        habitacao_label: habLabel || null,
        morador_id: userId,
        morador_nome: nome || null,
        morador_email: email || null,
        morador_cpf: normalizeDigits(cpf) || null,
        opcao_id: opcaoId
      });
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (e?.code === 11000 || msg.includes('duplicate key')) {
        return res.status(400).json({ ok: false, error: 'Você já votou nesta enquete.' });
      }
      throw e;
    }

    // devolve resumo atualizado
    const votos = await CondEnqueteVoto.find({ unidade_id: unidadeIdResolved, enquete_id: id })
      .select('opcao_id')
      .lean()
      .maxTimeMS(queryTimeout);
    const totalVotos = Array.isArray(votos) ? votos.length : 0;
    const byOpt = new Map(opcoes.map(o => [String(o._id), { opcaoId: String(o._id), texto: String(o.texto || '').trim(), foto: String(o?.foto || '').trim(), votos: 0, percent: 0 }]));
    for (const v of (Array.isArray(votos) ? votos : [])) {
      const key = String(v.opcao_id || '');
      if (!key) continue;
      if (!byOpt.has(key)) byOpt.set(key, { opcaoId: key, texto: 'Opção', foto: '', votos: 0, percent: 0 });
      byOpt.get(key).votos += 1;
    }
    const outOpts = Array.from(byOpt.values()).map(o => ({
      ...o,
      percent: totalVotos ? (o.votos * 100) / totalVotos : 0
    }));

    return res.json({
      ok: true,
      status,
      totalVotos,
      opcoes: outOpts,
      jaVotou: true,
      userOpcaoId: opcaoId
    });
  } catch (err) {
    console.error('[portal-morador][api/enquetes votar] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao registrar voto' });
  }
}));

function getServicoMemoryStore(appRef) {
  if (!appRef.locals.portalMoradorServicosMemory) {
    appRef.locals.portalMoradorServicosMemory = [];
  }
  return appRef.locals.portalMoradorServicosMemory;
}

function getBoletosMemoryStore(appRef) {
  if (!appRef.locals.portalMoradorBoletosMemory) {
    appRef.locals.portalMoradorBoletosMemory = {
      habitacoes: [
        { id: 'hab-1', nome: 'Bloco A - Apto 101' },
        { id: 'hab-2', nome: 'Bloco B - Apto 202' }
      ],
      boletos: {
        'hab-1': {
          avencer: [
            { id: 'bx1', descricao: 'Condomínio Dez/2025', valor: 450.00, vencimento: new Date().toISOString(), status: 'avencer' }
          ],
          pagos: [
            { id: 'bx0', descricao: 'Condomínio Nov/2025', valor: 450.00, vencimento: new Date(Date.now()-86400000*30).toISOString(), data_pagamento: new Date(Date.now()-86400000*15).toISOString(), status: 'pago' }
          ]
        },
        'hab-2': { avencer: [], pagos: [] }
      }
    };
  }
  return appRef.locals.portalMoradorBoletosMemory;
}

function getVisitantesMemoryStore(appRef) {
  if (!appRef.locals.portalMoradorVisitantesMemory) {
    appRef.locals.portalMoradorVisitantesMemory = [];
  }
  return appRef.locals.portalMoradorVisitantesMemory;
}

function getEffectiveSkipDb(req) {
  try {
    const appRef = req?.app;
    const parent = appRef?.parent;
    // Preferir o app pai (createServer) quando estiver montado.
    if (parent && Object.prototype.hasOwnProperty.call(parent.locals || {}, 'skipDb')) {
      return !!parent.locals.skipDb;
    }
    if (appRef && Object.prototype.hasOwnProperty.call(appRef.locals || {}, 'skipDb')) {
      return !!appRef.locals.skipDb;
    }
    return false;
  } catch {
    return false;
  }
}

function shouldUseMemoryDb(req) {
  // Portal deve operar 100% com Mongo (nuvem). Não trate skipDb como fonte de "offline".
  return mongoose.connection.readyState !== 1;
}

// Endpoint público (sem auth) usado pela tela de login para listar condomínios disponíveis
// para o e-mail informado. Retorna uma lista de unidades (condomínios) baseadas nos vínculos.
app.get('/api/auth/condominios', wrapAsync(async (req, res) => {
  try {
    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email) return res.json({ data: [] });
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const condUser = await CondUsuario.findOne({ email }).maxTimeMS(queryTimeout);
    if (!condUser) return res.json({ data: [] });

    const portalSession = await buildPortalSessionPayload(condUser);
    const vinculos = Array.isArray(portalSession?.vinculos) ? portalSession.vinculos : [];
    const byUnidade = new Map();
    for (const v of vinculos) {
      const unidadeId = v?.unidade_id ? String(v.unidade_id) : '';
      if (!unidadeId) continue;
      if (!byUnidade.has(unidadeId)) {
        const nome = String(v?.unidade_nome || '').trim();
        const codigo = String(v?.unidade_codigo || '').trim();
        const label = (nome && codigo) ? `${nome} (${codigo})` : (nome || codigo || 'Condomínio');
        byUnidade.set(unidadeId, {
          id: unidadeId,
          nome: nome || 'Condomínio',
          codigo,
          label
        });
      }
    }
    const data = Array.from(byUnidade.values());
    data.sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));
    return res.json({ data });
  } catch (err) {
    console.error('[portal-morador][api/auth/condominios GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar condomínios' });
  }
}));

// =========================
// Perfil do usuário (Portal)
// =========================

app.get('/api/user', requirePortalLogin, (req, res) => {
  try {
    const user = req.portalUser || req.session?.portalUser || null;
    const avatarUrl = user && (user.avatar_url || user.avatarUrl || user.foto_url || user.fotoUrl || null);
    return res.json({
      ok: true,
      userName: (user && (user.nome || user.name)) || 'Morador',
      avatarUrl: avatarUrl || null,
      unidadeNome: (user && (user.unidade_nome || user.unidadeNome)) || null
    });
  } catch {
    return res.json({ ok: true, userName: 'Morador', avatarUrl: null, unidadeNome: null });
  }
});

// GET /api/modulos — retorna lista simples de módulos acessíveis (para badges do perfil)
app.get('/api/modulos', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const portalUser = req.portalUser || req.session?.portalUser || null;

    // Usuário com contexto de unidade: usar modulosAcessiveis da unidade
    const unidadeId = portalUser?.unidade_id || portalUser?.unidadeId || null;
    if (unidadeId && mongoose.isValidObjectId(String(unidadeId))) {
      const unidade = await Unidade.findById(unidadeId).populate('modulosAcessiveis').lean();
      if (unidade?.modulosAcessiveis?.length) {
        const mods = unidade.modulosAcessiveis.map(m => ({
          _id: m._id,
          nome: m.nome,
          descricao: m.descricao,
          status: m.status,
          url_base: m.url_base,
        }));
        return res.json({ data: mods });
      }
    }

    // Fallback mínimo: exibir ao menos o Portal como ativo
    return res.json({ data: [{ nome: 'Portal do Morador', status: 'ativo' }] });
  } catch (err) {
    console.error('[portal-morador][api/modulos] erro:', err?.message || err);
    return res.json({ data: [{ nome: 'Portal do Morador', status: 'ativo' }] });
  }
}));

app.post('/api/user/password', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const userId = String(req.user?.cond_usuario_id || req.user?.id || '').trim();
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ ok: false, error: 'Usuário inválido.' });
    }
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Preencha a senha atual e a nova senha.' });
    }

    const condUser = await CondUsuario.findById(userId);
    if (!condUser) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });

    const ok = await verifyPortalPassword(condUser, String(currentPassword));
    if (!ok) return res.status(400).json({ ok: false, error: 'Senha atual incorreta.' });

    const nova = String(newPassword);
    if (nova.length < 6) return res.status(400).json({ ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    await setPortalPassword(condUser, nova, { clearToken: true });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-morador][api/user/password] erro:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Falha ao atualizar senha.' });
  }
}));

app.post('/api/user/avatar', requirePortalLogin, upload.single('foto'), wrapAsync(async (req, res) => {
  try {
    const userId = String(req.user?.cond_usuario_id || req.user?.id || '').trim();
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ ok: false, error: 'Usuário inválido.' });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Arquivo não enviado.' });

    const sharp = await getSharp();
    if (!sharp) {
      return res.status(503).json({ ok: false, error: 'Processamento de imagem indisponível no servidor.' });
    }

    const inVercel = !!process.env.VERCEL;
    const blobToken = getBlobToken();
    if (!inVercel && !blobToken) return res.status(503).json({ ok: false, error: 'Blob não configurado.' });

    const condUser = await CondUsuario.findById(userId);
    if (!condUser) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });

    let webpBuf;
    try {
      webpBuf = await sharp(req.file.buffer)
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'center', withoutEnlargement: true })
        .toFormat('webp', { quality: 90 })
        .toBuffer();
    } catch {
      return res.status(400).json({ ok: false, error: 'Arquivo inválido.' });
    }

    const key = `portal-users/${userId}-${randomUUID()}.webp`;
    const putOptions = {
      access: 'public',
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      ...(blobToken ? { token: blobToken } : {})
    };
    const { url } = await put(key, webpBuf, putOptions);

    const prev = String(condUser.foto || '').trim();
    condUser.foto = url;
    await condUser.save();

    // best-effort: remove foto anterior se for Blob
    if (prev && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(prev)) {
      try {
        await del(prev, blobToken ? { token: blobToken } : undefined);
      } catch {
        /* noop */
      }
    }

    // Atualiza snapshot/cookie do portal para refletir novo avatar.
    try {
      const portalSession = await buildPortalSessionPayload(condUser);
      if (req.session) req.session.portalUser = portalSession;
      setPortalSessionCookie(res, { userId, session: portalSession });
    } catch {
      /* noop */
    }

    return res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    console.error('[portal-morador][api/user/avatar] erro:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Falha ao atualizar foto.' });
  }
}));

app.get('/api/servicos', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    // Portal 100% nuvem: se não estiver conectado, tenta reconectar e, se falhar, retorna 503.
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) {
      try { res.set('X-Portal-Db-Mode', 'offline'); } catch {}
      return respondDbOffline(res, req);
    }

    // Exibe todos os chamados por padrão; filtros opcionais podem vir via query (ex.: ?status=aberto).
    const statusQuery = String(req.query?.status || '').trim();
    const filter = { unidade_id: unidadeId, morador_email: email };
    if (statusQuery) {
      filter.status = statusQuery;
    }
    const queryTimeout = getMongoQueryTimeoutMs();
    const runQuery = () => CondSolicitacaoServico.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(queryTimeout);

    try {
      const p = runQuery();
      const data = await withTimeout(p, queryTimeout, 'listar-servicos');
      try { res.set('X-Portal-Db-Mode', 'mongo'); } catch {}
      return res.json({ data });
    } catch (err) {
      // Em serverless pode ocorrer erro transitório de seleção de servidor mesmo com readyState=1.
      // Faz um retry curto (1x) após tentar reconectar.
      if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) {
        // Se o timeout veio do nosso Promise.race, evita rejeição tardia virar unhandled.
        try { Promise.resolve(runQuery()).catch(() => null); } catch { /* noop */ }
        const reconnected = await tryReconnectMongo();
        if (reconnected) {
          try {
            const p2 = runQuery();
            const data = await withTimeout(p2, queryTimeout, 'listar-servicos-retry');
            try { res.set('X-Portal-Db-Mode', 'mongo-retry'); } catch {}
            return res.json({ data });
          } catch (err2) {
            console.error('[portal-morador][api/servicos GET] erro após retry:', err2);
          }
        }
        try { res.set('X-Portal-Db-Mode', reconnected ? 'mongo-retry-failed' : 'mongo-reconnect-failed'); } catch {}
        return respondDbOffline(res, req);
      }
      throw err;
    }
  } catch (err) {
    console.error('[portal-morador][api/servicos GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar solicitações' });
  }
}));

app.get('/api/servicos/:id([0-9a-fA-F]{24})', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const isObjectId = mongoose.isValidObjectId(id);
    if (!isObjectId) return res.status(400).json({ error: 'ID inválido' });
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const doc = await CondSolicitacaoServico.findOne({ _id: id, unidade_id: unidadeId, morador_email: email })
      .lean()
      .maxTimeMS(queryTimeout);
    if (!doc) return res.status(404).json({ error: 'Chamado não encontrado' });
    return res.json({ data: doc });
  } catch (err) {
    console.error('[portal-morador][api/servicos/:id GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar solicitação' });
  }
}));

// Últimas solicitações (serviços) da habitação para exibir na Home do Portal.
app.get('/api/servicos/ultimos', requirePortalLogin, async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    if (!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    const habId = String(req.query?.hab || '').trim();
    if (!habId) return res.status(400).json({ error: 'Habitação inválida' });

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = getMongoQueryTimeoutMs();
    const filter = { unidade_id: unidadeId, morador_email: email, habitacao_id: habId };

    const data = await CondSolicitacaoServico.find(filter)
      .select('_id protocolo titulo status createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(12)
      .lean()
      .maxTimeMS(queryTimeout);

    return res.json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error('[portal-morador][api/servicos/ultimos GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar solicitações' });
  }
});

app.get('/api/push/public-key', requirePortalLogin, (req, res) => {
  try {
    const key = getPortalVapidPublicKey();
    return res.json({ key: key || '' });
  } catch (err) {
    console.error('[portal-morador][api/push/public-key] erro:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao carregar chave pública' });
  }
});

app.post('/api/push/subscription', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: 'Subscrição inválida' });
    }

    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const userId = req.user?.cond_usuario_id || req.user?.id || null;
    const result = await savePortalPushSubscription({
      subscription,
      userId,
      email,
      userAgent: String(req.headers?.['user-agent'] || '')
    });

    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason || 'Falha ao salvar' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-morador][api/push/subscription] erro:', err?.message || err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao salvar assinatura' });
  }
}));

app.post('/api/push/test', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'Usuário inválido' });

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const result = await sendPortalPush({
      email,
      title: 'Teste de push',
      body: 'Se você recebeu esta notificação, o push está funcionando.',
      tag: 'portal-push-test',
      data: { tipo: 'teste', url: '/portal-morador/solicitacoes/servico' }
    });

    return res.json({ ok: !!result?.ok, result });
  } catch (err) {
    console.error('[portal-morador][api/push/test] erro:', err?.message || err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ ok: false, error: 'Falha ao enviar push de teste' });
  }
}));

app.get('/api/boletos/habitacoes', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    const unidadeAtiva = String(req.user?.unidade_id || '').trim();
    const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];
    if (vinculos.length) {
      const seen = new Set();
      const data = vinculos
        .filter((v) => {
          if (!unidadeAtiva) return true;
          const unidadeId = v?.unidade_id ? String(v.unidade_id) : '';
          return unidadeId && unidadeId === unidadeAtiva;
        })
        .map((v) => ({
          id: v?.habitacao_id ? String(v.habitacao_id) : '',
          nome: String(v?.habitacao_label || '').trim()
        }))
        .filter((v) => !!v.id)
        .filter((v) => {
          if (seen.has(v.id)) return false;
          seen.add(v.id);
          return true;
        })
        .map((v) => ({ id: v.id, nome: v.nome || 'Habitação' }));
      return res.json({ data });
    }

    if (shouldUseMemoryDb(req)) {
      const store = getBoletosMemoryStore(req.app);
      return res.json({ data: store.habitacoes });
    }

    // Fallback para sessões/cookies antigas (sem `vinculos`): recalcula a sessão a partir do CondUsuario.
    const userId = String(req.user?.cond_usuario_id || req.user?.id || '').trim();
    if (!mongoose.isValidObjectId(userId)) {
      return res.json({ data: [] });
    }
    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const condUser = await CondUsuario.findById(userId).maxTimeMS(queryTimeout);
    if (!condUser) {
      return res.json({ data: [] });
    }
    const portalSession = await buildPortalSessionPayload(condUser);
    if (req.session) {
      req.session.portalUser = portalSession;
    }
    const fresh = Array.isArray(portalSession?.vinculos) ? portalSession.vinculos : [];
    const seen = new Set();
    const data = fresh
      .map((v) => ({
        id: v?.habitacao_id ? String(v.habitacao_id) : '',
        nome: String(v?.habitacao_label || '').trim()
      }))
      .filter((v) => !!v.id)
      .filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      })
      .map((v) => ({ id: v.id, nome: v.nome || 'Habitação' }));
    return res.json({ data });
  } catch (err) {
    console.error('[portal-morador][api/boletos/habitacoes GET] erro:', err);
    return res.status(500).json({ error: 'Falha ao listar habitações' });
  }
});

app.get('/api/boletos', requirePortalLogin, async (req, res) => {
  try {
    const habId = String(req.query?.hab || '').trim();
    const startParam = String(req.query?.start || '').trim();
    const endParam = String(req.query?.end || '').trim();

    function parseMonth(mStr){
      if(!mStr || !/^\d{4}-\d{2}$/.test(mStr)) return null;
      const [y, m] = mStr.split('-').map(Number);
      if(!y || !m || m < 1 || m > 12) return null;
      const start = new Date(y, m-1, 1, 0, 0, 0, 0);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      return { start, end };
    }

    function getRange(){
      const now = new Date();
      const defEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const defStart = new Date(defEnd);
      defStart.setMonth(defStart.getMonth()-5);

      const parsedStart = parseMonth(startParam);
      const parsedEnd = parseMonth(endParam);
      const startDate = parsedStart?.start || defStart;
      const endDate = parsedEnd?.end || new Date(defEnd.getFullYear(), defEnd.getMonth()+1, 0, 23, 59, 59, 999);
      return { startDate, endDate };
    }

    const { startDate, endDate } = getRange();

    const withinRange = (dt) => {
      if(!dt) return false;
      const d = new Date(dt);
      if(Number.isNaN(d.getTime())) return false;
      return d >= startDate && d <= endDate;
    };

    if (shouldUseMemoryDb(req)) {
      const store = getBoletosMemoryStore(req.app);
      const data = store.boletos[habId] || { avencer: [], pagos: [] };
      const filtered = {
        avencer: (data.avencer || []).filter(b => withinRange(b.vencimento)),
        pagos: (data.pagos || []).filter(b => withinRange(b.vencimento))
      };
      return res.json(filtered);
    }
    // Placeholder quando o backend financeiro não estiver disponível
    return res.json({ avencer: [], pagos: [] });
  } catch (err) {
    console.error('[portal-morador][api/boletos GET] erro:', err);
    return res.status(500).json({ error: 'Falha ao listar boletos' });
  }
});

app.get('/api/boletos/:id/codigo', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    return res.json({ codigo: `8364.12345 12345.678901 23456.789012 3 12340000012345 (demo ${id})` });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao gerar código de barras' });
  }
});

app.get('/api/boletos/:id/pdf', requirePortalLogin, async (req, res) => {
  try {
    const pdfBase64 = 'JVBERi0xLjQKJeLjz9MKNCAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDEgMCBSIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyA1IDAgUiAvUmVzb3VyY2VzIDIgMCBSID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjYgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgovVDAgNTAgVGYKMTAwIDcwMCBUZAooQm9sZXRvIGRlIGRlbW8pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNiAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL05hbWUgL0YxIC9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nID4+CmVuZG9iagoyIDAgb2JqCjw8IC9Qcm9jU2V0IFsvUERGL1RleHRdIC9Gb250IDw8IC9GMSA2IDAgUiA+PiA+PgplbmRvYmoKMSAwIG9iago8PCAvVHlwZSAvUGFnZXMgL0tpZHMgWyA0IDAgUiBdIC9Db3VudCAxID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAxIDAgUiA+PgplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDEgMCBSIC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyA1IDAgUiAvUmVzb3VyY2VzIDIgMCBSID4+CmVuZG9iagp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgIAowMDAwMDAwMDEwIDAwMDAwIG4gIAowMDAwMDAwMDEwIDAwMDAwIG4gIAowMDAwMDAwMDkwIDAwMDAwIG4gIAowMDAwMDAwMDY2IDAwMDAwIG4gIAowMDAwMDAwMTg2IDAwMDAwIG4gIAowMDAwMDAwMjYyIDAwMDAwIG4gIAp0cmFpbGVyCjw8IC9TaXplIDcgL1Jvb3QgMiAwIFIgL0luZm8gMyAwIFIgL0lEIFs8Mzc2MjYyNzdlZGJiNzc1ZjI2NTE1NmVhZGJlZDQyMzI+PDM3NjI2Mjc3ZWRiYjc3NWYyNjUxNTZlYWRiZWQ0MjMyPl0+PgpzdGFydHhyZWYKNDM0CiUlRU9G';
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    res.set('Content-Type', 'application/pdf');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).send('Falha ao gerar PDF');
  }
});

app.get('/api/boletos/:id/pix', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    return res.json({ payload: `00020126360014BR.GOV.BCB.PIX0114+55619999999952040000530398654061.005802BR5925CONDOMINIO EXEMPLO LTDA6009SAO PAULO62150511PIXDEMOBLT${id}6304ABCD` });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao gerar Pix' });
  }
});

app.post('/api/servicos', requirePortalLogin, maybeUploadFotos, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    const condUsuarioId = String(req.user?.cond_usuario_id || req.user?.condUsuarioId || req.user?.id || '').trim();

    const vinculos = Array.isArray(req.user?.vinculos) ? req.user.vinculos : [];
    const vinculoDaUnidade = vinculos.find((v) => String(v?.unidade_id || '').trim() === unidadeId) || vinculos[0] || null;
    const extractIdString = (value) => {
      if (value == null) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value);
      if (typeof value === 'object') {
        const candidate = value._id ?? value.id ?? value.value ?? null;
        if (candidate != null) return String(candidate).trim();
        // Evita gravar "[object Object]" em bases legadas
        return '';
      }
      return String(value).trim();
    };
    let habitacaoId = extractIdString(vinculoDaUnidade?.habitacao_id);
    let habitacaoLabel = String(vinculoDaUnidade?.habitacao_label || '').trim();
    const protocolo = generateServicoProtocolo();

    const titulo = String(req.body?.titulo || '').trim();
    const descricao = String(req.body?.descricao || '').trim();
    if (!titulo || !descricao) return res.status(400).json({ error: 'Preencha assunto e descrição' });
    if (titulo.length > 120) return res.status(400).json({ error: 'Assunto muito longo' });
    if (descricao.length > 2000) return res.status(400).json({ error: 'Descrição muito longa' });

    // Portal 100% nuvem: se não estiver conectado ao Mongo, tenta reconectar e, se falhar, retorna 503.
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    // Fallback: alguns usuários antigos/vínculos podem vir sem habitacao_id.
    // Tenta resolver pelo cadastro de morador.
    if (!habitacaoId) {
      try {
        const emailRegex = new RegExp(`^${escapeRegex(email)}$`, 'i');
        const or = [];

        // Preferência: vínculo direto do CondUsuario (mais confiável)
        if (mongoose.isValidObjectId(condUsuarioId)) {
          or.push({ cond_usuario_id: condUsuarioId });
        }

        // Fallback por e-mail (compatível com cadastros legados)
        or.push({ email: emailRegex });

        const where = {
          ativo: { $ne: false },
          $or: or
        };

        // Quando possível, filtra por unidade; mas tolera `unidade_id` null em bases antigas.
        if (mongoose.isValidObjectId(unidadeId)) {
          where.$and = [
            {
              $or: [
                { unidade_id: new mongoose.Types.ObjectId(unidadeId) },
                { unidade_id: null },
                { unidade_id: { $exists: false } }
              ]
            }
          ];
        }

        const morador = await CondMorador.findOne(where)
          .sort({ updatedAt: -1, createdAt: -1 })
          .select('habitacao_id')
          .lean();
        if (morador?.habitacao_id) {
          habitacaoId = String(morador.habitacao_id).trim();
        }
      } catch (lookupErr) {
        console.warn('[portal-morador][api/servicos POST] falha ao resolver habitacao_id por morador', lookupErr?.message || lookupErr);
      }
    }

    // Se resolveu o ID mas faltou label, tenta derivar do vínculo existente.
    if (habitacaoId && !habitacaoLabel && Array.isArray(vinculos) && vinculos.length) {
      const v = vinculos.find((it) => String(it?.habitacao_id || '').trim() === habitacaoId);
      if (v && v.habitacao_label) {
        habitacaoLabel = String(v.habitacao_label).trim();
      }
    }

    if (!habitacaoId) {
      return res.status(409).json({
        error: 'Não foi possível identificar sua moradia para vincular a solicitação. Peça ao administrador para vincular seu acesso a uma habitação.'
      });
    }

    const writeTimeout = getMongoQueryTimeoutMs();
    const createPromise = CondSolicitacaoServico.create({
      unidade_id: unidadeId,
      habitacao_id: habitacaoId,
      habitacao_label: habitacaoLabel,
      morador_email: email,
      protocolo,
      titulo,
      descricao,
      fotos: [],
      status: 'aberto',
      nova: true,
    });

    let doc;
    try {
      doc = await withTimeout(createPromise, writeTimeout, 'criar-servico');
    } catch (err) {
      // Evita rejeição tardia virar unhandled.
      Promise.resolve(createPromise).catch(() => null);
      if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
      throw err;
    }

    const uploadedFotos = await storeServicoFotos({ req, servicoId: String(doc._id), files: req.files });
    if (uploadedFotos.length) {
      doc.fotos = uploadedFotos;
      await doc.save();
    }
    const data = await CondSolicitacaoServico.findById(doc._id).lean();
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/servicos POST] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao abrir solicitação' });
  }
}));

app.put('/api/servicos/:id', requirePortalLogin, maybeUploadFotos, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const isObjectId = mongoose.isValidObjectId(id);

    const titulo = String(req.body?.titulo || '').trim();
    const descricao = String(req.body?.descricao || '').trim();
    if (!titulo || !descricao) return res.status(400).json({ error: 'Preencha assunto e descrição' });
    if (titulo.length > 120) return res.status(400).json({ error: 'Assunto muito longo' });
    if (descricao.length > 2000) return res.status(400).json({ error: 'Descrição muito longa' });

    if (!isObjectId) return res.status(400).json({ error: 'ID inválido' });
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const doc = await CondSolicitacaoServico.findOne({ _id: id, unidade_id: unidadeId, morador_email: email }).maxTimeMS(queryTimeout);
    if (!doc) return res.status(404).json({ error: 'Chamado não encontrado' });

    const currentFotos = Array.isArray(doc.fotos) ? doc.fotos : [];
    const room = Math.max(0, 5 - currentFotos.length);
    const add = room ? await storeServicoFotos({ req, servicoId: id, files: Array.isArray(req.files) ? req.files.slice(0, room) : [] }) : [];

    doc.titulo = titulo;
    doc.descricao = descricao;
    doc.fotos = currentFotos.concat(add).slice(0, 5);
    await doc.save();

    const data = await CondSolicitacaoServico.findById(doc._id).lean();
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/servicos PUT] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao editar solicitação' });
  }
}));

app.delete('/api/servicos/:id', requirePortalLogin, wrapAsync(async (req, res) => {
  try {
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const isObjectId = mongoose.isValidObjectId(id);

    const inVercel = !!process.env.VERCEL;
    const blobToken = getBlobToken();

    if (!isObjectId) return res.status(400).json({ error: 'ID inválido' });
    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const doc = await CondSolicitacaoServico.findOne({ _id: id, unidade_id: unidadeId, morador_email: email }).maxTimeMS(queryTimeout);
    if (!doc) return res.status(404).json({ error: 'Chamado não encontrado' });
    const fotos = Array.isArray(doc.fotos) ? doc.fotos : [];
    await CondSolicitacaoServico.deleteOne({ _id: doc._id });

    // best-effort: remove do Blob
    if (inVercel || blobToken) {
      for (const u of fotos) {
        if (u && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(String(u))) {
          try { await del(String(u), blobToken ? { token: blobToken } : undefined); } catch { /* noop */ }
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-morador][api/servicos DELETE] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao excluir solicitação' });
  }
}));

app.get('/api/visitantes', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();
    const habFilter = String(req.query?.hab || '').trim();

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const query = {
      unidade_id: unidadeId,
      morador_email: email,
      ...(habFilter ? { habitacaoId: habFilter } : {})
    };
    const data = await CondVisitante.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .maxTimeMS(queryTimeout);
    const normalized = Array.isArray(data)
      ? data.map((doc) => ({ ...doc, _id: String(doc?._id || '') }))
      : [];
    return res.json({ data: normalized });
  } catch (err) {
    console.error('[portal-morador][api/visitantes GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar visitas' });
  }
});

app.get('/api/visitantes/:id', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const doc = await CondVisitante.findOne({ _id: id, unidade_id: unidadeId, morador_email: email })
      .lean()
      .maxTimeMS(queryTimeout);
    if (!doc) return res.status(404).json({ error: 'Visita não encontrada' });
    return res.json({ data: { ...doc, _id: String(doc?._id || '') } });
  } catch (err) {
    console.error('[portal-morador][api/visitantes/:id GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar visita' });
  }
});

app.post('/api/visitantes', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();
    const habId = String(req.body?.habitacaoId || '').trim();
    if (!habId) return res.status(400).json({ error: 'Habitação obrigatória' });

    const payload = {
      habitacaoId: habId,
      habitacaoNome: String(req.body?.habitacaoNome || req.body?.habitacaoLabel || '').trim(),
      finalidade: String(req.body?.finalidade || '').trim(),
      visitanteNome: String(req.body?.visitanteNome || '').trim(),
      visitanteRg: String(req.body?.visitanteRg || '').trim(),
      visitanteCpf: String(req.body?.visitanteCpf || '').trim(),
      visitanteTel: String(req.body?.visitanteTel || '').trim(),
      observacoes: String(req.body?.observacoes || '').trim(),
      periodoInicio: req.body?.periodoInicio ? new Date(req.body.periodoInicio).toISOString() : null,
      periodoFim: req.body?.periodoFim ? new Date(req.body.periodoFim).toISOString() : null,
      veiculo: req.body?.veiculo && typeof req.body.veiculo === 'object'
        ? {
            tipo: String(req.body.veiculo.tipo || '').trim(),
            placa: String(req.body.veiculo.placa || '').trim(),
            marca: String(req.body.veiculo.marca || '').trim(),
            modelo: String(req.body.veiculo.modelo || '').trim(),
            cor: String(req.body.veiculo.cor || '').trim(),
            ano: String(req.body.veiculo.ano || '').trim()
          }
        : null
    };

    if (!payload.visitanteNome) return res.status(400).json({ error: 'Nome do visitante obrigatório' });
    if (!payload.finalidade) return res.status(400).json({ error: 'Finalidade obrigatória' });
    if (!payload.periodoInicio || !payload.periodoFim) return res.status(400).json({ error: 'Período obrigatório' });
    if (new Date(payload.periodoFim) < new Date(payload.periodoInicio)) {
      return res.status(400).json({ error: 'Data final inválida' });
    }

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const createTimeout = Number(process.env.MONGO_CREATE_TIMEOUT_MS || 5000);
    const doc = await withTimeout(
      CondVisitante.create({
        unidade_id: unidadeId,
        morador_email: email,
        ...payload,
        finalidadeLabel: payload.finalidade,
      }),
      createTimeout,
      'create visita'
    );
    const data = doc?.toObject ? doc.toObject() : doc;
    if (data && data._id) data._id = String(data._id);
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/visitantes POST] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao comunicar visita' });
  }
});

app.put('/api/visitantes/:id', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();

    const habId = String(req.body?.habitacaoId || '').trim();
    if (!habId) return res.status(400).json({ error: 'Habitação obrigatória' });

    const payload = {
      habitacaoId: habId,
      habitacaoNome: String(req.body?.habitacaoNome || req.body?.habitacaoLabel || '').trim(),
      finalidade: String(req.body?.finalidade || '').trim(),
      visitanteNome: String(req.body?.visitanteNome || '').trim(),
      visitanteRg: String(req.body?.visitanteRg || '').trim(),
      visitanteCpf: String(req.body?.visitanteCpf || '').trim(),
      visitanteTel: String(req.body?.visitanteTel || '').trim(),
      observacoes: String(req.body?.observacoes || '').trim(),
      periodoInicio: req.body?.periodoInicio ? new Date(req.body.periodoInicio).toISOString() : null,
      periodoFim: req.body?.periodoFim ? new Date(req.body.periodoFim).toISOString() : null,
      veiculo: req.body?.veiculo && typeof req.body.veiculo === 'object'
        ? {
            tipo: String(req.body.veiculo.tipo || '').trim(),
            placa: String(req.body.veiculo.placa || '').trim(),
            marca: String(req.body.veiculo.marca || '').trim(),
            modelo: String(req.body.veiculo.modelo || '').trim(),
            cor: String(req.body.veiculo.cor || '').trim(),
            ano: String(req.body.veiculo.ano || '').trim()
          }
        : null
    };

    if (!payload.visitanteNome) return res.status(400).json({ error: 'Nome do visitante obrigatório' });
    if (!payload.finalidade) return res.status(400).json({ error: 'Finalidade obrigatória' });
    if (!payload.periodoInicio || !payload.periodoFim) return res.status(400).json({ error: 'Período obrigatório' });
    if (new Date(payload.periodoFim) < new Date(payload.periodoInicio)) {
      return res.status(400).json({ error: 'Data final inválida' });
    }

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const updateTimeout = Number(process.env.MONGO_CREATE_TIMEOUT_MS || 5000);
    const doc = await withTimeout(
      CondVisitante.findOneAndUpdate(
        { _id: id, unidade_id: unidadeId, morador_email: email },
        {
          $set: {
            ...payload,
            finalidadeLabel: payload.finalidade,
          }
        },
        { new: true }
      ),
      updateTimeout,
      'update visita'
    );

    if (!doc) return res.status(404).json({ error: 'Visita não encontrada' });
    const data = doc?.toObject ? doc.toObject() : doc;
    if (data && data._id) data._id = String(data._id);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/visitantes/:id PUT] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao atualizar visita' });
  }
});

app.delete('/api/visitantes/:id', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000);
    const result = await CondVisitante.deleteOne({ _id: id, unidade_id: unidadeId, morador_email: email }).maxTimeMS(queryTimeout);
    if (!result?.deletedCount) return res.status(404).json({ error: 'Visita não encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-morador][api/visitantes/:id DELETE] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao excluir visita' });
  }
});

app.get('/api/visitas/chegadas', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();
    const habFilter = String(req.query?.hab || '').trim();

    let since = null;
    try {
      if (req.query?.since) {
        const d = new Date(String(req.query.since));
        if (!Number.isNaN(d.getTime())) since = d;
      }
    } catch {
      since = null;
    }
    if (!since) since = new Date(Date.now() - 48 * 60 * 60 * 1000);

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = getMongoQueryTimeoutMs();
    const query = {
      unidade_id: unidadeId,
      morador_email: email,
      chegadaEm: { $ne: null, $gte: since },
      ...(habFilter ? { habitacaoId: habFilter } : {})
    };

    const data = await CondVisitante.find(query)
      .select('chegadaEm chegadaVisitantes habitacaoNome habitacaoId visitanteNome')
      .sort({ chegadaEm: -1 })
      .limit(30)
      .lean()
      .maxTimeMS(queryTimeout);

    const normalized = Array.isArray(data)
      ? data.map((doc) => {
          const visitaId = String(doc?._id || '');
          const chegadaEm = doc?.chegadaEm ? new Date(doc.chegadaEm) : null;
          const hab = String(doc?.habitacaoNome || '').trim();
          const visitantesRaw = Array.isArray(doc?.chegadaVisitantes) ? doc.chegadaVisitantes : [];
          const nomes = visitantesRaw
            .map((v) => String(v?.nome || '').trim())
            .filter(Boolean);
          const fallbackPrincipal = String(doc?.visitanteNome || '').trim();
          const visitantes = nomes.length ? nomes : (fallbackPrincipal ? [fallbackPrincipal] : []);

          let visitanteKey = '';
          try{
            const principal = visitantesRaw.find(v => v && v.principal === true) || visitantesRaw[0] || null;
            if(principal){
              visitanteKey = buildVisitorKey(principal?.nome, principal?.rg, principal?.cpf);
            } else if(fallbackPrincipal){
              visitanteKey = buildVisitorKey(fallbackPrincipal, doc?.visitanteRg, doc?.visitanteCpf);
            }
          } catch { visitanteKey = ''; }

          return {
            _id: visitaId,
            chegadaEm: chegadaEm && !Number.isNaN(chegadaEm.getTime()) ? chegadaEm.toISOString() : null,
            habitacaoNome: hab || null,
            habitacaoId: String(doc?.habitacaoId || '').trim() || null,
            visitantes,
            visitanteKey: String(visitanteKey || '').trim() || null
          };
        })
      : [];

    return res.json({ data: normalized, since: since.toISOString() });
  } catch (err) {
    console.error('[portal-morador][api/visitas/chegadas GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao listar chegadas' });
  }
});

// Últimos acessos (visitantes + moradores) para exibir na Home do Portal.
app.get('/api/acessos/ultimos', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || req.user?.unidade_principal_id || '').trim();
    if(!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });
    const habFilter = String(req.query?.hab || '').trim();
    if(!habFilter) return res.status(400).json({ error: 'Habitação inválida' });

    const daysRaw = Number(req.query?.days);
    const windowDays = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? Math.floor(daysRaw) : 7;

    let since = null;
    try {
      if (req.query?.since) {
        const d = new Date(String(req.query.since));
        if (!Number.isNaN(d.getTime())) since = d;
      }
    } catch { since = null; }
    if (!since) since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = getMongoQueryTimeoutMs();

    const visitasQuery = {
      unidade_id: unidadeId,
      morador_email: email,
      habitacaoId: habFilter,
      'comunicacoesAcesso.em': { $gte: since }
    };
    const visitas = await CondVisitante.find(visitasQuery)
      .select('habitacaoId comunicacoesAcesso')
      .sort({ createdAt: -1 })
      .limit(120)
      .lean()
      .maxTimeMS(queryTimeout);

    const moradorQuery = {
      unidade_id: unidadeId,
      habitacaoId: habFilter,
      $or: [
        { ocorridoEm: { $gte: since } },
        { registradoEm: { $gte: since } },
        { createdAt: { $gte: since } }
      ],
      tipo: { $in: ['MORADOR_ENTRADA', 'MORADOR_SAIDA'] }
    };
    const moradores = await CondAcessoMorador.find(moradorQuery)
      .select('moradorNome tipo ocorridoEm registradoEm createdAt')
      .sort({ registradoEm: -1, ocorridoEm: -1, createdAt: -1 })
      .limit(120)
      .lean()
      .maxTimeMS(queryTimeout);

    const items = [];

    // Visitantes: pega eventos comunicados (entrada/saída) e usa nome do visitante do evento
    const allowed = new Set(['ENTRADA_AUTORIZADA', 'SAIDA_COMUNICADA']);
    for (const doc of (Array.isArray(visitas) ? visitas : [])) {
      const list = Array.isArray(doc?.comunicacoesAcesso) ? doc.comunicacoesAcesso : [];
      for (const ev of list) {
        if (!ev) continue;
        const tipo = String(ev?.tipo || '').trim();
        if (!allowed.has(tipo)) continue;
        const acao = tipo === 'ENTRADA_AUTORIZADA' ? 'ENTRADA' : (tipo === 'SAIDA_COMUNICADA' ? 'SAIDA' : '');
        const em = ev?.ocorridoEm || ev?.registradoEm || ev?.em || null;
        const d = em ? new Date(em) : null;
        if (!d || !Number.isFinite(d.getTime())) continue;
        if (d < since) continue;
        const nome = String(ev?.visitante?.nome || '').trim();
        if (!nome) continue;
        items.push({
          nome,
          ocorridoEm: d.toISOString(),
          pessoaTipo: 'VISITANTE',
          acao
        });
      }
    }

    // Moradores
    for (const acc of (Array.isArray(moradores) ? moradores : [])) {
      const em = acc?.ocorridoEm || acc?.registradoEm || acc?.createdAt || null;
      const d = em ? new Date(em) : null;
      if (!d || !Number.isFinite(d.getTime())) continue;
      if (d < since) continue;
      const nome = String(acc?.moradorNome || '').trim();
      if (!nome) continue;
      const tipo = String(acc?.tipo || '').trim();
      const acao = tipo === 'MORADOR_ENTRADA' ? 'ENTRADA' : (tipo === 'MORADOR_SAIDA' ? 'SAIDA' : '');
      items.push({
        nome,
        ocorridoEm: d.toISOString(),
        pessoaTipo: 'MORADOR',
        acao
      });
    }

    items.sort((a, b) => {
      const ta = a?.ocorridoEm ? new Date(a.ocorridoEm).getTime() : 0;
      const tb = b?.ocorridoEm ? new Date(b.ocorridoEm).getTime() : 0;
      return tb - ta;
    });

    return res.json({ ok: true, since: since.toISOString(), windowDays, data: items.slice(0, 15) });
  } catch (err) {
    console.error('[portal-morador][api/acessos/ultimos GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar últimos acessos' });
  }
});

function localDayKey(value){
  try{
    const d = new Date(value);
    if(!Number.isFinite(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

function normalizeEventTimes(ev){
  const occurred = ev?.ocorridoEm || ev?.ocorrido_em || ev?.when || null;
  const registered = ev?.registradoEm || ev?.registrado_em || null;
  const occurredAt = occurred ? new Date(occurred) : null;
  const registeredAt = registered ? new Date(registered) : null;
  const emAt = ev?.em ? new Date(ev.em) : null;
  const occurredOk = occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : null;
  const registeredOk = registeredAt && Number.isFinite(registeredAt.getTime()) ? registeredAt : null;
  const emOk = emAt && Number.isFinite(emAt.getTime()) ? emAt : null;
  return {
    ocorridoEm: occurredOk || emOk,
    registradoEm: registeredOk || emOk,
    em: emOk
  };
}

function resolveVisitorSnapshotFromDoc(doc, visitanteKey){
  const vk = String(visitanteKey || '').trim();
  if(!vk) return null;
  try{
    const vv = Array.isArray(doc?.chegadaVisitantes) ? doc.chegadaVisitantes : [];
    const hit = vv.find(v => v && buildVisitorKey(v?.nome, v?.rg, v?.cpf) === vk) || null;
    if(hit){
      return {
        nome: String(hit?.nome || '').trim() || null,
        rg: String(hit?.rg || '').trim() || null,
        cpf: String(hit?.cpf || '').trim() || null,
        tel: String(hit?.tel || '').trim() || null,
        principal: hit?.principal === true
      };
    }
  } catch { /* noop */ }
  // fallback legado (visita principal)
  try{
    const nome = String(doc?.visitanteNome || '').trim();
    const rg = String(doc?.visitanteRg || '').trim();
    const cpf = String(doc?.visitanteCpf || '').trim();
    const tel = String(doc?.visitanteTel || '').trim();
    const k = buildVisitorKey(nome, rg, cpf);
    if(k === vk){
      return {
        nome: nome || null,
        rg: rg || null,
        cpf: cpf || null,
        tel: tel || null,
        principal: true
      };
    }
  } catch { /* noop */ }
  return null;
}

app.get('/api/visitas/historico-acessos', requirePortalLogin, async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();
    if(!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });
    const habFilter = String(req.query?.hab || '').trim();

    let since = null;
    try {
      if (req.query?.since) {
        const d = new Date(String(req.query.since));
        if (!Number.isNaN(d.getTime())) since = d;
      }
    } catch { since = null; }
    if (!since) since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = getMongoQueryTimeoutMs();
    const query = {
      unidade_id: unidadeId,
      morador_email: email,
      ...(habFilter ? { habitacaoId: habFilter } : {}),
      $or: [
        { createdAt: { $gte: since } },
        { chegadaEm: { $gte: since } },
        { 'comunicacoesAcesso.em': { $gte: since } }
      ]
    };

    const docs = await CondVisitante.find(query)
      .select('habitacaoId habitacaoNome veiculo chegadaEm chegadaVisitantes visitanteNome visitanteRg visitanteCpf visitanteTel comunicacoesAcesso createdAt')
      .sort({ createdAt: -1 })
      .limit(120)
      .lean()
      .maxTimeMS(queryTimeout);

    const accessQuery = {
      unidade_id: unidadeId,
      ...(habFilter ? { habitacaoId: habFilter } : {}),
      $or: [
        { createdAt: { $gte: since } },
        { ocorridoEm: { $gte: since } },
        { registradoEm: { $gte: since } }
      ]
    };
    const moradorAcessos = await CondAcessoMorador.find(accessQuery)
      .select('habitacaoId habitacaoNome moradorId moradorNome tipo ocorridoEm registradoEm por createdAt')
      .sort({ registradoEm: -1, ocorridoEm: -1, createdAt: -1 })
      .limit(500)
      .lean()
      .maxTimeMS(queryTimeout);

    const allowedTypes = new Set(['CHEGADA_COMUNICADA', 'ENTRADA_AUTORIZADA', 'SAIDA_COMUNICADA', 'MORADOR_ENTRADA', 'MORADOR_SAIDA']);
    const map = new Map(); // key: origem|id|day => group

    for (const doc of (Array.isArray(docs) ? docs : [])) {
      const docId = String(doc?._id || '').trim();
      const habId = String(doc?.habitacaoId || '').trim() || null;
      const habNome = String(doc?.habitacaoNome || '').trim() || null;
      const veiculo = doc?.veiculo && typeof doc.veiculo === 'object' ? doc.veiculo : null;
      const list = Array.isArray(doc?.comunicacoesAcesso) ? doc.comunicacoesAcesso : [];

      for (const ev of list) {
        if (!ev) continue;
        const tipo = String(ev.tipo || '').trim();
        if (!allowedTypes.has(tipo)) continue;

        const times = normalizeEventTimes(ev);
        const em = times.em;
        if (!em || !Number.isFinite(em.getTime())) continue;
        if (em < since) continue;

        let visitanteKey = String(ev.visitanteKey || '').trim();
        if(!visitanteKey){
          try{
            visitanteKey = buildVisitorKey(ev?.visitante?.nome, ev?.visitante?.rg, ev?.visitante?.cpf);
          } catch { visitanteKey = ''; }
        }
        if(!visitanteKey){
          try{
            const nome = String(doc?.visitanteNome || '').trim();
            const rg = String(doc?.visitanteRg || '').trim();
            const cpf = String(doc?.visitanteCpf || '').trim();
            visitanteKey = buildVisitorKey(nome, rg, cpf);
          } catch { visitanteKey = ''; }
        }
        visitanteKey = String(visitanteKey || '').trim();
        if(!visitanteKey) continue;

        const day = localDayKey(em);
        if(!day) continue;
        const k = `VISITA|${docId}|${visitanteKey}|${day}`;

        if(!map.has(k)){
          const visitorSnap = (ev.visitante && typeof ev.visitante === 'object') ? ev.visitante : resolveVisitorSnapshotFromDoc(doc, visitanteKey);
          map.set(k, {
            key: k,
            visitaId: docId,
            habitacaoId: habId,
            habitacaoNome: habNome,
            veiculo,
            visitanteKey,
            visitante: visitorSnap,
            pessoaTipo: 'VISITANTE',
            moradorId: null,
            dia: day,
            eventos: []
          });
        }

        const g = map.get(k);
        if(!g.visitante && ev.visitante && typeof ev.visitante === 'object') g.visitante = ev.visitante;
        g.eventos.push({
          tipo,
          status: String(ev.status || '').trim() || null,
          em: times.em ? times.em.toISOString() : null,
          ocorridoEm: times.ocorridoEm ? times.ocorridoEm.toISOString() : null,
          registradoEm: times.registradoEm ? times.registradoEm.toISOString() : null,
          por: ev.por && typeof ev.por === 'object' ? ev.por : null,
          justificativa: String(ev.justificativa || '').trim() || null
        });
      }
    }

    for (const acc of (Array.isArray(moradorAcessos) ? moradorAcessos : [])) {
      if (!acc) continue;
      const tipo = String(acc?.tipo || '').trim();
      if (!allowedTypes.has(tipo)) continue;

      const moradorId = String(acc?.moradorId || '').trim();
      if (!moradorId) continue;

      const em = acc?.ocorridoEm || acc?.registradoEm || acc?.createdAt || null;
      const emDate = em ? new Date(em) : null;
      if (!emDate || !Number.isFinite(emDate.getTime())) continue;
      if (emDate < since) continue;

      const day = localDayKey(emDate);
      if (!day) continue;

      const habId = String(acc?.habitacaoId || '').trim() || null;
      const habNome = String(acc?.habitacaoNome || '').trim() || null;
      const visitanteKey = `morador:${moradorId}`;
      const k = `MORADOR|${moradorId}|${day}`;

      if (!map.has(k)) {
        map.set(k, {
          key: k,
          visitaId: null,
          habitacaoId: habId,
          habitacaoNome: habNome,
          veiculo: null,
          visitanteKey,
          visitante: {
            nome: String(acc?.moradorNome || '').trim() || null,
            rg: null,
            cpf: null,
            tel: null,
            principal: true
          },
          pessoaTipo: 'MORADOR',
          moradorId,
          dia: day,
          eventos: []
        });
      }

      const g = map.get(k);
      g.eventos.push({
        tipo,
        status: null,
        em: emDate.toISOString(),
        ocorridoEm: acc?.ocorridoEm ? new Date(acc.ocorridoEm).toISOString() : null,
        registradoEm: acc?.registradoEm ? new Date(acc.registradoEm).toISOString() : null,
        por: acc?.por && typeof acc.por === 'object' ? acc.por : null,
        justificativa: null
      });
    }

    const groups = Array.from(map.values());
    groups.forEach((g) => {
      const tipoOrder = (tipo) => {
        const t = String(tipo || '').trim();
        if(t === 'CHEGADA_COMUNICADA') return 1;
        if(t === 'ENTRADA_AUTORIZADA' || t === 'MORADOR_ENTRADA') return 2;
        if(t === 'SAIDA_COMUNICADA' || t === 'MORADOR_SAIDA') return 3;
        return 99;
      };
      g.eventos.sort((a, b) => {
        const oa = tipoOrder(a.tipo);
        const ob = tipoOrder(b.tipo);
        if(oa !== ob) return oa - ob;
        const ta = new Date(a.registradoEm || a.ocorridoEm || a.em || 0).getTime();
        const tb = new Date(b.registradoEm || b.ocorridoEm || b.em || 0).getTime();
        return ta - tb;
      });
      const last = g.eventos[g.eventos.length - 1];
      const sortKey = last ? new Date(last.registradoEm || last.ocorridoEm || last.em || 0).getTime() : 0;
      g._sortKey = sortKey;
    });
    groups.sort((a, b) => (b._sortKey || 0) - (a._sortKey || 0));

    const normalized = groups.map((g) => {
      const v = (g.visitante && typeof g.visitante === 'object') ? g.visitante : null;
      return {
        visitaId: g.visitaId,
        habitacaoId: g.habitacaoId,
        habitacaoNome: g.habitacaoNome,
        veiculo: g.veiculo,
        visitanteKey: g.visitanteKey,
        pessoaTipo: g.pessoaTipo || 'VISITANTE',
        moradorId: g.moradorId || null,
        dia: g.dia,
        visitante: v ? {
          nome: String(v?.nome || '').trim() || null,
          rg: String(v?.rg || '').trim() || null,
          cpf: String(v?.cpf || '').trim() || null,
          tel: String(v?.tel || '').trim() || null,
          principal: v?.principal === true
        } : null,
        eventos: Array.isArray(g.eventos) ? g.eventos : []
      };
    });

    return res.json({ data: normalized, since: since.toISOString() });
  } catch (err) {
    console.error('[portal-morador][api/visitas/historico-acessos GET] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao carregar histórico de acessos' });
  }
});

function isSameLocalDay(a, b){
  if(!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if(!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function hasEventSameDay(list, tipo, day){
  if(!Array.isArray(list) || !tipo || !day) return false;
  for(const ev of list){
    if(!ev) continue;
    if(String(ev.tipo || '').trim() !== String(tipo)) continue;
    if(!ev.em) continue;
    if(isSameLocalDay(ev.em, day)) return true;
  }
  return false;
}

function buildVisitorKey(nome, rg, cpf){
  const n = String(nome || '').trim();
  const r = String(rg || '').trim();
  const c = String(cpf || '').trim();
  return `${n ? n.toLowerCase() : ''}|${r}|${c}`;
}

function resolveDefaultVisitorKeyForDay(doc, day){
  // 1) Preferir visitante principal/primeiro da chegada do dia
  try{
    const vv = Array.isArray(doc?.chegadaVisitantes) ? doc.chegadaVisitantes : [];
    if(vv.length){
      const principal = vv.find(v => v && v.principal === true) || vv[0];
      const k = buildVisitorKey(principal?.nome, principal?.rg, principal?.cpf);
      if(String(k).trim()) return String(k).trim();
    }
  } catch { /* noop */ }

  // 2) Se houver evento de chegada no histórico do dia, usa o visitanteKey dele
  try{
    const list = Array.isArray(doc?.comunicacoesAcesso) ? doc.comunicacoesAcesso : [];
    for(const ev of list){
      if(!ev) continue;
      if(String(ev.tipo || '').trim() !== 'CHEGADA_COMUNICADA') continue;
      if(!ev.em) continue;
      if(!isSameLocalDay(ev.em, day)) continue;
      const k = String(ev.visitanteKey || '').trim();
      if(k) return k;
    }
  } catch { /* noop */ }

  // 3) Fallback legado
  try{
    const nomeP = String(doc?.visitanteNome || '').trim();
    const rgP = String(doc?.visitanteRg || '').trim();
    const cpfP = String(doc?.visitanteCpf || '').trim();
    const k = buildVisitorKey(nomeP, rgP, cpfP);
    return String(k || '').trim();
  } catch {
    return '';
  }
}

function hasEventSameDayByVisitor(list, tipo, day, visitanteKey){
  const vk = String(visitanteKey || '').trim();
  if(!vk) return false;
  if(!Array.isArray(list) || !tipo || !day) return false;
  for(const ev of list){
    if(!ev) continue;
    if(String(ev.tipo || '').trim() !== String(tipo)) continue;
    if(!ev.em) continue;
    if(String(ev.visitanteKey || '').trim() !== vk) continue;
    if(isSameLocalDay(ev.em, day)) return true;
  }
  return false;
}

app.post('/api/visitas/:id/confirmar-entrada', requirePortalLogin, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });

    const email = String(req.user?.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Usuário inválido' });
    const unidadeId = String(req.user?.unidade_id || req.user?.unidadeId || '').trim();
    if(!unidadeId) return res.status(400).json({ error: 'Unidade inválida' });

    if (mongoose.connection.readyState !== 1) {
      await tryReconnectMongo();
    }
    if (mongoose.connection.readyState !== 1) return respondDbOffline(res, req);

    const queryTimeout = getMongoQueryTimeoutMs();
    const doc = await CondVisitante.findOne({ _id: id, unidade_id: unidadeId, morador_email: email })
      .maxTimeMS(queryTimeout);
    if (!doc) return res.status(404).json({ error: 'Visita não encontrada' });

    const day = doc?.chegadaEm ? new Date(doc.chegadaEm) : null;
    if(!day || !Number.isFinite(day.getTime())){
      return res.status(409).json({ error: 'Chegada ainda não foi comunicada' });
    }

    doc.comunicacoesAcesso = Array.isArray(doc.comunicacoesAcesso) ? doc.comunicacoesAcesso : [];
    const visitanteKeyBody = req.body && typeof req.body === 'object' ? String(req.body.visitanteKey || '').trim() : '';
    let visitanteKey = visitanteKeyBody;
    if(!visitanteKey){
      visitanteKey = resolveDefaultVisitorKeyForDay(doc, day);
    }
    if(!visitanteKey) return res.status(400).json({ error: 'visitanteKey é obrigatório' });

    let hasChegadaHoje = hasEventSameDayByVisitor(doc.comunicacoesAcesso, 'CHEGADA_COMUNICADA', day, visitanteKey);
    if(!hasChegadaHoje && visitanteKeyBody){
      // Se veio visitanteKey mas não bateu, tenta resolver pelo dia (principal/primeiro/evento).
      const fallbackKey = resolveDefaultVisitorKeyForDay(doc, day);
      if(fallbackKey && fallbackKey !== visitanteKey){
        visitanteKey = fallbackKey;
        hasChegadaHoje = hasEventSameDayByVisitor(doc.comunicacoesAcesso, 'CHEGADA_COMUNICADA', day, visitanteKey);
      }
    }
    if(!hasChegadaHoje){
      return res.status(409).json({ error: 'Chegada ainda não foi comunicada para este visitante' });
    }

    const alreadyExit = hasEventSameDayByVisitor(doc.comunicacoesAcesso, 'SAIDA_COMUNICADA', day, visitanteKey);
    if(alreadyExit){
      return res.status(409).json({ error: 'Saída já foi comunicada para este visitante' });
    }

    const alreadyAuthorized = hasEventSameDayByVisitor(doc.comunicacoesAcesso, 'ENTRADA_AUTORIZADA', day, visitanteKey);
    if(alreadyAuthorized){
      const data = doc?.toObject ? doc.toObject() : doc;
      if (data && data._id) data._id = String(data._id);
      return res.json({ ok: true, data, already: true });
    }

    const now = new Date();
    const nome = String(req.user?.nome || req.user?.name || '').trim();

    // tenta snapshot do visitante a partir do evento de chegada do dia
    let visitanteSnap = null;
    try {
      const evSame = doc.comunicacoesAcesso.find(ev => ev && ev.em && String(ev.visitanteKey || '').trim() === String(visitanteKey).trim() && isSameLocalDay(ev.em, day) && ev.visitante);
      if(evSame && evSame.visitante) visitanteSnap = evSame.visitante;
    } catch {
      visitanteSnap = null;
    }

    const anchor = day && Number.isFinite(day.getTime())
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), now.getHours(), now.getMinutes(), 0, 0)
      : now;

    doc.comunicacoesAcesso.push({
      tipo: 'ENTRADA_AUTORIZADA',
      status: 'AUTORIZADA_PELO_MORADOR',
      em: anchor,
      ocorridoEm: now,
      registradoEm: now,
      visitanteKey: String(visitanteKey).trim(),
      visitante: visitanteSnap,
      por: {
        tipo: 'MORADOR',
        id: String(req.user?.cond_usuario_id || req.user?.id || '').trim() || null,
        nome: (nome || email) ? String(nome || email) : null,
        email: email || null
      }
    });

    await doc.save();
    const data = doc?.toObject ? doc.toObject() : doc;
    if (data && data._id) data._id = String(data._id);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[portal-morador][api/visitas/:id/confirmar-entrada POST] erro:', err);
    if (err?.code === 'OP_TIMEOUT' || isMongoOfflineError(err)) return respondDbOffline(res, req);
    return res.status(500).json({ error: 'Falha ao confirmar entrada' });
  }
});

app.get('/logout', portalLogout);

export default app;
