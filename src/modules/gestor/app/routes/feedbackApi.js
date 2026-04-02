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
import { updateFeedbackStatusService } from '#modules/gestor/app/services/feedback/updateFeedbackStatus.service.js';
import { processFeedbackUploadStorageCore } from '#modules/gestor/app/routes/utils/processFeedbackUploadStorageCore.js';
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

function uploadFeedbackAnexoMiddleware(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return apiFail(res, 400, 'Tipo de arquivo inválido.');
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return apiFail(res, 400, 'Arquivo excede o limite de 5 MB.');
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      return apiFail(res, 400, 'Envie no máximo 1 arquivo.');
    }
    return next(err);
  });
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

function createFeedbackUploadStorageInfraCore({
  safeFileName: safeFileNameFn = safeFileName,
  safeExtFromFile: safeExtFromFileFn = safeExtFromFile,
  shouldUseBlobStorage: shouldUseBlobStorageFn = shouldUseBlobStorage,
  getBlobToken: getBlobTokenFn = getBlobToken,
  putBlob = put,
  fsModule = fs,
  pathModule = path,
  cwdProvider = () => process.cwd(),
  isBlobNotConfiguredError: isBlobNotConfiguredErrorFn = isBlobNotConfiguredError,
  isVercel = Boolean(process.env.VERCEL),
  processStorageCore = processFeedbackUploadStorageCore,
} = {}) {
  function pickFileFromRequest({ file, files }) {
    if (file) return file;
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return null;
    const preferred = ['anexo', 'file', 'attachment'];
    for (const fieldName of preferred) {
      const current = list.find((item) => item && item.fieldname === fieldName);
      if (current) return current;
    }
    return list[0] || null;
  }

  async function processUpload({ file, files, baseUrl, feedbackId }) {
    const selectedFile = pickFileFromRequest({ file, files });
    if (!selectedFile || !selectedFile.buffer) {
      return { kind: 'missing_file' };
    }

    const stored = await processStorageCore({
      baseUrl,
      feedbackId,
      file: selectedFile,
      safeFileName: safeFileNameFn,
      safeExtFromFile: safeExtFromFileFn,
      shouldUseBlobStorage: shouldUseBlobStorageFn,
      getBlobToken: getBlobTokenFn,
      putBlob,
      fsModule,
      pathModule,
      cwdProvider,
      isBlobNotConfiguredError: isBlobNotConfiguredErrorFn,
      isVercel,
    });

    return {
      kind: 'stored',
      file: selectedFile,
      stored,
    };
  }

  return {
    processUpload,
  };
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
const uploadStorageInfra = createFeedbackUploadStorageInfraCore();
const uploadFeedbackAnexoHandler = createUploadFeedbackAnexoHandler({
  apiOk,
  apiFail,
  findFeedbackById,
  saveFeedbackDoc,
  uploadStorageInfra,
});
router.post('/api/feedback/:feedbackId/anexo', requireLogin, uploadFeedbackAnexoMiddleware, uploadFeedbackAnexoHandler);

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
const updateStatusPatch = createUpdateFeedbackStatusHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  findFeedbackByIdAndUpdateSetNewLean: updateFeedbackStatusService,
});
const updateStatus = createUpdateFeedbackStatusHandler({
  isAdminLike,
  apiOk,
  apiFail,
  normalizeStatus,
  findFeedbackByIdAndUpdateSetNewLean,
});
router.patch('/api/gestor/feedback/:feedbackId/status', requireLogin, updateStatusPatch);
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
