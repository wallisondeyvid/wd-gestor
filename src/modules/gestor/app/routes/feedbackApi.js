import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import { createAdminFeedbackDetailHandler } from '#modules/gestor/app/controllers/feedbackDetailApiController.js';
import { createCreateFeedbackHandler } from '#modules/gestor/app/controllers/feedbackCreateApiController.js';
import { createUploadFeedbackAnexoHandler } from '#modules/gestor/app/controllers/feedbackUploadApiController.js';
import { createAdminFeedbackListHandler } from '#modules/gestor/app/controllers/feedbackListApiController.js';
import { createMyFeedbackDetailHandler } from '#modules/gestor/app/controllers/feedbackMyDetailApiController.js';
import { createMyFeedbackListHandler } from '#modules/gestor/app/controllers/feedbackMyListApiController.js';
import { createDeleteFeedbackHandler } from '#modules/gestor/app/controllers/feedbackDeleteApiController.js';
import { createUpdateFeedbackRespostaHandler } from '#modules/gestor/app/controllers/feedbackRespostaApiController.js';
import { createUpdateFeedbackStatusHandler } from '#modules/gestor/app/controllers/feedbackStatusApiController.js';
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
const createFeedbackHandler = createCreateFeedbackHandler({
  apiOk,
  apiFail,
  normalizeTipo,
  inferModuloFromUrl,
  createFeedback,
});
router.post('/api/feedback', requireLogin, createFeedbackHandler);

// Upload de anexo para um feedback
const uploadFeedbackAnexoHandler = createUploadFeedbackAnexoHandler({
  apiOk,
  apiFail,
  findFeedbackById,
  saveFeedbackDoc,
  pickFile,
  storeFeedbackAnexo,
});
router.post('/api/feedback/:feedbackId/anexo', requireLogin, upload.any(), uploadFeedbackAnexoHandler);

// Meus feedbacks
const listMyFeedback = createMyFeedbackListHandler({
  apiOk,
  apiFail,
  findFeedbackByFilterSortCreatedAtDescLimit200Lean,
});
router.get('/api/feedback/meus', requireLogin, listMyFeedback);

// Detalhar meu feedback
const detailMyFeedback = createMyFeedbackDetailHandler({
  apiOk,
  apiFail,
  findFeedbackByIdLean,
});
router.get('/api/feedback/meus/:feedbackId', requireLogin, detailMyFeedback);

// =============== Admin (Gestor) ===============

// Listar feedbacks (admin)
const listFeedbackAdmin = createAdminFeedbackListHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  normalizeTipo,
  findFeedbackByFilterSortCreatedAtDescLimit500Lean,
  sanitizeFeedback,
});
router.get('/api/gestor/feedback', requireLogin, listFeedbackAdmin);

// Detalhar (admin)
const detailFeedbackAdmin = createAdminFeedbackDetailHandler({
  isAdminLike,
  apiOk,
  apiFail,
  findFeedbackByIdLean,
  sanitizeFeedback,
});
router.get('/api/gestor/feedback/:feedbackId', requireLogin, detailFeedbackAdmin);

// Atualizar status (admin)
const updateStatus = createUpdateFeedbackStatusHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  findFeedbackByIdAndUpdateSetNewLean,
});
router.patch('/api/gestor/feedback/:feedbackId/status', requireLogin, updateStatus);
router.post('/api/gestor/feedback/:feedbackId/status', requireLogin, updateStatus);

// Atualizar resposta (admin)
const updateResposta = createUpdateFeedbackRespostaHandler({
  isAdminLike,
  apiOk,
  apiFail,
  findFeedbackByIdAndUpdateSetNewLean,
});
router.patch('/api/gestor/feedback/:feedbackId/resposta', requireLogin, updateResposta);
router.post('/api/gestor/feedback/:feedbackId/resposta', requireLogin, updateResposta);

// Excluir feedback (admin)
const deleteFeedback = createDeleteFeedbackHandler({
  isAdminLike,
  apiOk,
  apiFail,
  findFeedbackByIdAndDeleteLean,
  getBlobToken,
  delBlob: del,
  fsModule: fs,
  pathModule: path,
});
router.delete('/api/gestor/feedback/:feedbackId', requireLogin, deleteFeedback);
router.post('/api/gestor/feedback/:feedbackId', requireLogin, deleteFeedback);

export default router;
