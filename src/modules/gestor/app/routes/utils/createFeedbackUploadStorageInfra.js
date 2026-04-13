import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

import { processFeedbackUploadStorageCore } from './processFeedbackUploadStorageCore.js';

export function safeFileName(name) {
  const base = String(name || '').trim() || 'anexo';
  return base.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
}

export function getBlobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN
    || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || process.env.VERCEL_BLOB_RW_TOKEN
    || ''
  );
}

export function shouldUseBlobStorage() {
  return !!(process.env.VERCEL || getBlobToken());
}

export function isBlobNotConfiguredError(err) {
  try {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('no token found')) return true;
    if (msg.includes('blob_read_write_token')) return true;
    if (msg.includes('vercel blob') && msg.includes('token')) return true;
    return false;
  } catch {
    return false;
  }
}

export function safeExtFromFile({ originalName, mimeType }) {
  const original = safeFileName(originalName);
  const match = original.match(/\.[A-Za-z0-9]+$/);
  if (match) return match[0].toLowerCase();
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

export function createFeedbackUploadStorageInfraCore({
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

export default createFeedbackUploadStorageInfraCore;