import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { put, del } from '@vercel/blob';
import requireLogin from '#modules/gestor/app/middlewares/requireLogin.js';
import {
  findUserByEmailCond,
  saveUserDoc,
  findUserByEmailCondLean,
} from '#modules/gestor/app/db/api.db.js';

const router = express.Router();

// Armazenamento temporário em memória (processaremos com sharp antes de salvar)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware simples de auth: requer req.user preenchido por sessão
function requireApiAuth(req, res, next) {
  if (!req.user && !(req.session && req.session.user)) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  // Se só há sessão, tente preencher req.user mínimo
  if (!req.user && req.session && req.session.user) {
    req.user = { email: req.session.user.email };
  }
  next();
}

router.post('/api/usuario/foto', requireLogin, requireApiAuth, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    // Suporte a execução serverless: usar Vercel Blob (Store conectada ou token via env)
    const inVercel = !!process.env.VERCEL;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
      || process.env.VERCEL_BLOB_RW_TOKEN
      || '';
    if (!inVercel && !blobToken) {
      return res.status(503).json({ error: 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)' });
    }

    // Carregar usuário por email da sessão/req.user
    const email = (req.user?.email || '').toLowerCase();
    const user = await findUserByEmailCond({ email });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Processar imagem com sharp -> WebP em memória
    let webpBuf;
    try {
      webpBuf = await sharp(req.file.buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'center', withoutEnlargement: true })
        .toFormat('webp', { quality: 90 })
        .toBuffer();
    } catch {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }

    // Chave única para evitar cache
    const key = `users/${user._id}-${uuid()}.webp`;
    const putOptions = {
      access: 'public',
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      ...(blobToken ? { token: blobToken } : {})
    };
    const { url } = await put(key, webpBuf, putOptions);

    // Remover anterior se era Blob
    const prev = user.foto;
    if (prev && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(prev)) {
      try { await del(prev, blobToken ? { token: blobToken } : undefined); } catch { /* ignore */ }
    }

    // Persistir URL pública
    user.foto = url;
    await saveUserDoc(user);

    // Atualiza sessão para refletir nova foto
    try { if (req.session && req.session.user) { req.session.user.foto = user.foto; } } catch(_) {}

    return res.json({ ok: true, foto: user.foto });
  } catch (err) {
    console.error('[userPhotoApi] upload foto erro:', err);
    return res.status(500).json({ error: 'Falha ao processar foto' });
  }
});

// GET binário da foto do usuário; suporta fotos salvas como Data URL ou caminho em disco
async function getUserFoto(req, res) {
  const redirectPlaceholder = () => {
    try {
      const phUrl = (req.baseUrl || '') + '/img/user-placeholder.svg';
      res.set('Cache-Control', 'public, max-age=600');
      return res.redirect(302, phUrl);
    } catch {
      return res.status(204).end();
    }
  };
  try {
    const email = (req.user?.email || '').toLowerCase();
    if (!email) return redirectPlaceholder();
    const user = await findUserByEmailCondLean({ email });
    if (!user) return redirectPlaceholder();

    const foto = user.foto || '';
    // 1) Data URL
    if (/^data:/i.test(foto)) {
      const parsed = _parseDataUrl(foto);
      if (!parsed) return res.status(204).end();
      res.set('Content-Type', parsed.contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(parsed.buffer);
    }

    // 2) URL pública (Blob/S3/etc.)
    if (/^https?:\/\//i.test(foto)) {
      res.set('Cache-Control', 'private, max-age=300');
      return res.redirect(foto);
    }

    // 3) Caminho em disco legado
    try {
      if (typeof foto === 'string' && foto) {
        const rel = foto.replace(/^\/*/, '');
        const root = process.cwd();
        const candidates = [
          path.join(root, 'public', rel),
          path.join(root, rel),
          path.join(root, 'public/uploads', rel),
        ];
        for (const p of candidates) {
          try {
            const st = await fs.stat(p).catch(()=>null);
            if (st && st.isFile()) {
              const ext = path.extname(p).toLowerCase();
              const type = ext === '.svg' ? 'image/svg+xml'
                        : ext === '.png' ? 'image/png'
                        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                        : ext === '.webp' ? 'image/webp'
                        : 'application/octet-stream';
              res.set('Content-Type', type);
              res.set('Cache-Control', 'private, max-age=300');
              return res.sendFile(p);
            }
          } catch {}
        }
      }
    } catch {}

    // 4) Placeholder
    return redirectPlaceholder();
  } catch (e) {
    console.error('[userPhotoApi] get foto erro:', e);
    return redirectPlaceholder();
  }
}

// Helper para parse Data URL
function _parseDataUrl(dataUrl) {
  try {
    if (!/^data:/i.test(dataUrl)) return null;
    const [header, base64] = dataUrl.split(',');
    if (!base64) return null;
    const contentType = header.split(';')[0].split(':')[1] || 'application/octet-stream';
    const buffer = Buffer.from(base64, 'base64');
    return { contentType, buffer };
  } catch {
    return null;
  }
}

router.get('/api/usuario/foto', requireLogin, requireApiAuth, getUserFoto);

export default router;
