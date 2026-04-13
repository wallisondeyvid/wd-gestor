import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { put } from '@vercel/blob';

async function normalizeFaceUploadImageCore({ dataUrl }) {
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;

  const b64 = m[3];
  const buf = Buffer.from(b64, 'base64');

  try {
    const image = sharp(buf);
    const metadata = await image.metadata();
    const width = Math.min(metadata.width || 640, 1024);
    const height = Math.min(metadata.height || 640, 1024);
    const webpBuf = await image
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .toFormat('webp', { quality: 92 })
      .toBuffer();
    return webpBuf;
  } catch {
    return null;
  }
}

async function persistFaceUploadBlobCore({ webpBuf, index, blobToken }) {
  const id = uuid();
  const key = `faces/${id}-${index + 1}.webp`;
  const putOptions = {
    access: 'public',
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    ...(blobToken ? { token: blobToken } : {}),
  };
  const { url } = await put(key, webpBuf, putOptions);
  return { url, file: url, mime: 'image/webp' };
}

export async function processFaceUploadCaptureCore({ dataUrl, index, blobToken }) {
  const webpBuf = await normalizeFaceUploadImageCore({ dataUrl });
  if (!webpBuf) return null;

  const savedItem = await persistFaceUploadBlobCore({ webpBuf, index, blobToken });
  return savedItem;
}