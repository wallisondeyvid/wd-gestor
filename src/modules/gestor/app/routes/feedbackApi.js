import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import {
  createFeedback,
  findFeedbackById,
  saveFeedbackDoc,
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
  findFeedbackByIdLean,
  findFeedbackByFilterSortCreatedAtDescLimit500Lean,
  findFeedbackByIdAndUpdateSetNewLean,
  findFeedbackByIdAndDeleteLean,
} from '#modules/gestor/app/db/api.db.js';

const router = express.Router();

function isAdminLike(user){
  return !!(user && (user.isMaster || user.role === 'admin' || user.role === 'master'));
}

function apiOk(res, data = null, extra = {}){
  return res.json({ ok: true, success: true, data, ...extra });
}
function apiFail(res, status, message, extra = {}){
  return res.status(status).json({ ok: false, success: false, error: message, message, ...extra });
}

function normalizeTipo(v){
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 'outro';
  if (['sugestao','erro','elogio','outro'].includes(s)) return s;
  return s.slice(0, 32);
}
function normalizeStatus(v){
  const s = String(v || '').trim().toLowerCase().replaceAll(' ', '_');
  if (!s) return 'novo';
  if (['novo','respondido','aberto','em_andamento','resolvido','cancelado'].includes(s)) return s;
  return s.slice(0, 32);
}

// Upload: 1 imagem até 5MB (compatível com o widget)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png','image/jpeg','image/jpg','image/webp']);
    if (!allowed.has(file.mimetype)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    return cb(null, true);
  }
});

function pickFile(req){
  if (req.file) return req.file;
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return null;
  // tenta priorizar campos usados pelo widget
  const preferred = ['anexo', 'file', 'attachment'];
  for (const name of preferred){
    const f = files.find(x => x && x.fieldname === name);
    if (f) return f;
  }
  return files[0] || null;
}

function safeFileName(name){
  const base = String(name || '').trim() || 'anexo';
  return base.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
}

function getBlobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN
    || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || process.env.VERCEL_BLOB_RW_TOKEN
    || ''
  );
}

function shouldUseBlobStorage() {
  // Em produção (Vercel), filesystem é efêmero/readonly. Preferir Blob sempre que possível.
  return !!(process.env.VERCEL || getBlobToken());
}

function isBlobNotConfiguredError(err) {
  try {
    const msg = String(err?.message || '').toLowerCase();
    // Mensagens comuns do SDK quando não há token nem store conectada
    if (msg.includes('no token found')) return true;
    if (msg.includes('blob_read_write_token')) return true;
    if (msg.includes('vercel blob') && msg.includes('token')) return true;
    return false;
  } catch {
    return false;
  }
}

function safeExtFromFile({ originalName, mimeType }) {
  const original = safeFileName(originalName);
  const m = original.match(/\.[A-Za-z0-9]+$/);
  if (m) return m[0].toLowerCase();
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

async function storeFeedbackAnexo({ req, feedbackId, file }) {
  const original = safeFileName(file?.originalname);
  const ext = safeExtFromFile({ originalName: original, mimeType: file?.mimetype });
  const stamped = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`;

  // Produção (Vercel): salva no Blob quando possível
  if (shouldUseBlobStorage()) {
    const blobToken = getBlobToken();
    const key = `feedback/${String(feedbackId)}/${stamped}`;
    const putOptions = {
      access: 'public',
      contentType: String(file?.mimetype || 'application/octet-stream'),
      cacheControl: 'public, max-age=31536000, immutable',
      ...(blobToken ? { token: blobToken } : {})
    };
    try {
      const { url } = await put(key, file.buffer, putOptions);
      if (url) {
        return { url: String(url), storedIn: 'blob', originalName: original, stampedName: stamped };
      }
    } catch (err) {
      // Em dev, se o Blob falhar, cai para FS.
      // Em produção (Vercel), não faz sentido tentar FS: preferimos erro claro.
      if (process.env.VERCEL) {
        const e = new Error('BLOB_UPLOAD_FAILED');
        e.code = isBlobNotConfiguredError(err) ? 'BLOB_NOT_CONFIGURED' : 'BLOB_UPLOAD_FAILED';
        e.cause = err;
        throw e;
      }
    }
  }

  // Fallback local (dev): salva em disco e serve via /uploads
  const ROOT = path.join(process.cwd());
  const relDir = path.join('public', 'uploads', 'feedback', String(feedbackId));
  const absDir = path.join(ROOT, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const absFile = path.join(absDir, stamped);
  fs.writeFileSync(absFile, file.buffer);

  // URL pública (lembre que o app está montado em /gestor)
  const bp = req.baseUrl || '';
  const url = `${bp}/uploads/feedback/${encodeURIComponent(String(feedbackId))}/${encodeURIComponent(stamped)}`;
  return { url: String(url), storedIn: 'fs', originalName: original, stampedName: stamped };
}

function inferModuloFromUrl(url){
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = raw.startsWith('http') ? new URL(raw) : null;
    const pathname = u ? String(u.pathname || '') : raw;
    const seg = pathname.replace(/^\/+/, '').split('/')[0] || '';
    return seg.slice(0, 64);
  } catch {
    const seg = raw.replace(/^\/+/, '').split('/')[0] || '';
    return seg.slice(0, 64);
  }
}

function sanitizeRespostaValue(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const maybe = v.texto || v.resposta || v.message || v.mensagem || v.body || v.value || v.content;
    if (typeof maybe === 'string') return maybe;
    return '';
  }
  return String(v);
}

function sanitizeFeedback(fb){
  if (!fb || typeof fb !== 'object') return fb;
  if ('resposta' in fb) fb.resposta = sanitizeRespostaValue(fb.resposta);
  return fb;
}

// =============== Widget (usuário) ===============

// Criar feedback
router.post('/api/feedback', requireLogin, async (req, res) => {
  try {
    const mensagem = String(req.body?.mensagem || req.body?.message || '').trim();
    if (!mensagem) return apiFail(res, 400, 'Mensagem é obrigatória.');

    const tipo = normalizeTipo(req.body?.tipo || req.body?.type);

    // Compat com o widget: { contexto: { url, timezone, user_agent, page_label, viewport } }
    const ctx = (req.body && typeof req.body === 'object' && req.body.contexto && typeof req.body.contexto === 'object') ? req.body.contexto : null;
    const ctxUrl = String((ctx && (ctx.url || ctx.path)) || req.body?.url || '').trim();
    const ctxTz = String((ctx && (ctx.timezone || ctx.tz)) || req.body?.timezone || '').trim();
    const ctxUa = String((ctx && (ctx.user_agent || ctx.userAgent)) || req.body?.userAgent || '').trim();
    const inferredModulo = String(req.body?.module || req.body?.modulo || '')?.trim() || inferModuloFromUrl(ctxUrl) || inferModuloFromUrl(req.get('referer'));
    const uaFromHeader = String(req.get('user-agent') || '').trim();

    const fb = await createFeedback({
      tipo,
      status: 'novo',
      mensagem,
      criadoPor: {
        userId: req.user?._id || req.user?.id || null,
        email: req.user?.email || '',
        nome: req.user?.nome || '',
        role: req.user?.role || ''
      },
      origem: {
        modulo: String(inferredModulo || '').trim(),
        path: String(ctxUrl || '').trim(),
        userAgent: String(ctxUa || uaFromHeader || '').trim(),
        timezone: String(ctxTz || '').trim(),
      }
    });

    return apiOk(res, fb.toObject(), { id: fb._id, created: true });
  } catch (e) {
    console.error('[feedbackApi] POST /api/feedback erro:', e);
    return apiFail(res, 500, 'Erro ao criar feedback.');
  }
});

// Upload de anexo para um feedback
router.post('/api/feedback/:feedbackId/anexo', requireLogin, upload.any(), async (req, res) => {
  try {
    const feedbackId = String(req.params.feedbackId || '').trim();
    if (!feedbackId) return apiFail(res, 400, 'ID inválido.');

    const fb = await findFeedbackById(feedbackId);
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

    // Segurança: só o criador pode anexar
    const creator = fb?.criadoPor?.userId ? String(fb.criadoPor.userId) : '';
    const me = req.user?._id || req.user?.id;
    if (creator && me && String(me) !== creator) {
      return apiFail(res, 403, 'Acesso negado.');
    }

    const file = pickFile(req);
    if (!file || !file.buffer) return apiFail(res, 400, 'Arquivo ausente.');

    const stored = await storeFeedbackAnexo({ req, feedbackId: String(fb._id), file });

    fb.anexos = Array.isArray(fb.anexos) ? fb.anexos : [];
    fb.anexos.push({
      nome: stored.originalName,
      url: stored.url,
      mime: file.mimetype,
      size: file.size || (file.buffer ? file.buffer.length : 0)
    });
    await saveFeedbackDoc(fb);

    return apiOk(res, fb.toObject(), { id: fb._id });
  } catch (e) {
    if (e?.code === 'BLOB_NOT_CONFIGURED') {
      return apiFail(
        res,
        503,
        'Upload de anexo indisponível: configure o Vercel Blob (Store) ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN.',
        { code: 'BLOB_NOT_CONFIGURED' }
      );
    }
    if (e?.code === 'BLOB_UPLOAD_FAILED') {
      return apiFail(res, 503, 'Falha ao enviar anexo para a nuvem. Tente novamente em instantes.', { code: 'BLOB_UPLOAD_FAILED' });
    }
    console.error('[feedbackApi] POST /api/feedback/:id/anexo erro:', e);
    return apiFail(res, 500, 'Erro ao anexar arquivo.');
  }
});

// Meus feedbacks
router.get('/api/feedback/meus', requireLogin, async (req, res) => {
  try {
    const me = req.user?._id || req.user?.id || null;
    const filter = me ? { 'criadoPor.userId': me } : { 'criadoPor.email': req.user?.email || '' };

    const items = await findFeedbackByFilterSortCreatedAtDescLimit200Lean(filter);

    return apiOk(res, items);
  } catch (e) {
    console.error('[feedbackApi] GET /api/feedback/meus erro:', e);
    return apiFail(res, 500, 'Erro ao listar.');
  }
});

// Detalhar meu feedback
router.get('/api/feedback/meus/:feedbackId', requireLogin, async (req, res) => {
  try {
    const id = String(req.params.feedbackId || '').trim();
    const fb = await findFeedbackByIdLean(id);
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

    const creator = fb?.criadoPor?.userId ? String(fb.criadoPor.userId) : '';
    const me = req.user?._id || req.user?.id;
    if (creator && me && String(me) !== creator) return apiFail(res, 403, 'Acesso negado.');

    return apiOk(res, fb);
  } catch (e) {
    console.error('[feedbackApi] GET /api/feedback/meus/:id erro:', e);
    return apiFail(res, 500, 'Erro ao detalhar.');
  }
});

// =============== Admin (Gestor) ===============

// Listar feedbacks (admin)
router.get('/api/gestor/feedback', requireLogin, async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');

    const q = String(req.query?.q || '').trim();
    const status = String(req.query?.status || '').trim();
    const tipo = String(req.query?.tipo || '').trim();

    const filter = {};
    if (status) filter.status = normalizeStatus(status);
    if (tipo) filter.tipo = normalizeTipo(tipo);

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { mensagem: rx },
        { resposta: rx },
        { 'criadoPor.email': rx },
        { 'criadoPor.nome': rx },
      ];
    }

    const items = await findFeedbackByFilterSortCreatedAtDescLimit500Lean(filter);

    return apiOk(res, items.map(sanitizeFeedback));
  } catch (e) {
    console.error('[feedbackApi] GET /api/gestor/feedback erro:', e);
    return apiFail(res, 500, 'Erro ao listar feedbacks.');
  }
});

// Detalhar (admin)
router.get('/api/gestor/feedback/:feedbackId', requireLogin, async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
    const id = String(req.params.feedbackId || '').trim();
    const fb = await findFeedbackByIdLean(id);
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
    return apiOk(res, sanitizeFeedback(fb));
  } catch (e) {
    console.error('[feedbackApi] GET /api/gestor/feedback/:id erro:', e);
    return apiFail(res, 500, 'Erro ao detalhar.');
  }
});

// Atualizar status (admin)
async function updateStatus(req, res){
  try {
    if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
    const id = String(req.params.feedbackId || '').trim();
    const status = normalizeStatus(req.body?.status);
    const fb = await findFeedbackByIdAndUpdateSetNewLean(id, { status });
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
    return apiOk(res, fb);
  } catch (e) {
    console.error('[feedbackApi] status update erro:', e);
    return apiFail(res, 500, 'Erro ao salvar status.');
  }
}
router.patch('/api/gestor/feedback/:feedbackId/status', requireLogin, updateStatus);
router.post('/api/gestor/feedback/:feedbackId/status', requireLogin, updateStatus);

// Atualizar resposta (admin)
async function updateResposta(req, res){
  try {
    if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
    const id = String(req.params.feedbackId || '').trim();
    const resposta = String(req.body?.resposta || req.body?.reply || '').trim();
    const set = { resposta };
    if (resposta) set.status = 'respondido';
    const fb = await findFeedbackByIdAndUpdateSetNewLean(id, set);
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');
    return apiOk(res, fb);
  } catch (e) {
    console.error('[feedbackApi] resposta update erro:', e);
    return apiFail(res, 500, 'Erro ao salvar resposta.');
  }
}
router.patch('/api/gestor/feedback/:feedbackId/resposta', requireLogin, updateResposta);
router.post('/api/gestor/feedback/:feedbackId/resposta', requireLogin, updateResposta);

// Excluir feedback (admin)
async function deleteFeedback(req, res){
  try {
    if (!isAdminLike(req.user)) return apiFail(res, 403, 'Acesso negado.');
    const id = String(req.params.feedbackId || '').trim();
    if (!id) return apiFail(res, 400, 'ID inválido.');

    const fb = await findFeedbackByIdAndDeleteLean(id);
    if (!fb) return apiFail(res, 404, 'Feedback não encontrado.');

    // Best-effort: remover anexos em nuvem (Blob) e pasta local (dev)
    try {
      const blobToken = getBlobToken();
      const anexos = Array.isArray(fb?.anexos) ? fb.anexos : [];
      const urls = anexos.map(a => a && a.url).filter(Boolean).map(String);
      for (const u of urls) {
        try {
          await del(u, blobToken ? { token: blobToken } : undefined);
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      console.warn('[feedbackApi] aviso: falha ao remover anexos do feedback (blob):', id, e?.message || e);
    }

    try {
      const ROOT = path.join(process.cwd());
      const absDir = path.join(ROOT, 'public', 'uploads', 'feedback', String(id));
      if (fs.existsSync(absDir)) fs.rmSync(absDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[feedbackApi] aviso: falha ao remover anexos do feedback (fs):', id, e?.message || e);
    }

    return apiOk(res, { id, deleted: true });
  } catch (e) {
    console.error('[feedbackApi] delete erro:', e);
    return apiFail(res, 500, 'Erro ao excluir feedback.');
  }
}
router.delete('/api/gestor/feedback/:feedbackId', requireLogin, deleteFeedback);
router.post('/api/gestor/feedback/:feedbackId', requireLogin, deleteFeedback);

export default router;
