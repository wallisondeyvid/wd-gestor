import express from 'express';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import requireApiAuth from '#modules/gestor/app/middlewares/requireApiAuth.js';

const router = express.Router();

// Aceita até 3 imagens em dataURL base64 (capturas do modal). Placeholder simples.
// Entrada esperada:
// {
//   capturas: [ 'data:image/png;base64,...', ... ],
//   meta: { orientacoes: ['frente','direita','esquerda'] }
// }
router.post('/api/biometria/face/upload', requireLogin, requireApiAuth, async (req, res) => {
  try {
    const data = req.body || {};
    const capturas = Array.isArray(data.capturas) ? data.capturas.slice(0, 3) : [];
    if (!capturas.length) return res.status(400).json({ ok: false, error: 'Nenhuma captura enviada' });

    // Requer Vercel Blob (Store conectada no projeto) ou token via env
    const inVercel = !!process.env.VERCEL;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';
    if (!inVercel && !blobToken) {
      return res.status(503).json({ ok: false, error: 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' });
    }

    const saved = [];
    for (let i = 0; i < capturas.length; i++) {
      const dataUrl = capturas[i] || '';
      const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);
      if (!m) continue; // ignora entradas inválidas
      const mime = m[1].toLowerCase();
      const b64 = m[3];
      const buf = Buffer.from(b64, 'base64');
      const id = uuid();
      // Normaliza com sharp para WEBP e tamanho controlado
      let webpBuf;
      try {
        const image = sharp(buf);
        const metadata = await image.metadata();
        const width = Math.min(metadata.width || 640, 1024);
        const height = Math.min(metadata.height || 640, 1024);
        webpBuf = await image
          .resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .toFormat('webp', { quality: 92 })
          .toBuffer();
      } catch {
        continue;
      }
      const key = `faces/${id}-${i + 1}.webp`;
      const putOptions = {
        access: 'public',
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        ...(blobToken ? { token: blobToken } : {})
      };
  const { url } = await put(key, webpBuf, putOptions);
  saved.push({ url, file: url, mime: 'image/webp' });
    }

    if (!saved.length) return res.status(400).json({ ok: false, error: 'Falha ao processar capturas' });

    return res.json({ ok: true, arquivos: saved });
  } catch (err) {
    console.error('[face-upload] erro:', err);
    return res.status(500).json({ ok: false, error: 'Falha interna no upload facial' });
  }
});

export default router;
