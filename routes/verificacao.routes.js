import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DocumentosPort } from '#shared/ports/documentos.port.js';

const router = express.Router();

function safeTrim(value) {
  return String(value || '').trim();
}

function isSafeToken(token) {
  const t = safeTrim(token).toLowerCase();
  if (!t) return false;
  if (t.length < 16 || t.length > 160) return false;
  // Token gerado por randomBytes hex (somente [0-9a-f]).
  return /^[0-9a-f]+$/.test(t);
}

function filenameSafePart(value, fallback = 'DOC') {
  const s = safeTrim(value).toUpperCase();
  const cleaned = s.replace(/[^A-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function shortToken(token, size = 8) {
  const t = safeTrim(token).toLowerCase();
  if (!t) return '';
  return t.slice(0, Math.max(4, Math.min(24, Number(size) || 8)));
}

function sanitizeFilename(value) {
  let s = safeTrim(value);
  // Substituir caracteres problemáticos por hífen.
  s = s.replace(/[\/\\:*?"<>|]+/g, '-');
  // Remover chars de controle.
  s = s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  // Normalizar espaços.
  s = s.replace(/\s+/g, ' ').trim();
  // Evitar nomes vazios.
  if (!s) s = 'documento';
  // Limitar tamanho para evitar problemas em alguns clients.
  if (s.length > 180) s = s.slice(0, 180).trim();
  return s;
}

function asciiFallbackFilename(value) {
  const s = safeTrim(value);
  try {
    const ascii = s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]+/g, '-');
    return sanitizeFilename(ascii);
  } catch {
    return sanitizeFilename(s.replace(/[^\x20-\x7E]+/g, '-'));
  }
}

function encodeRFC5987(value) {
  // RFC 5987 para filename*=UTF-8''...
  return encodeURIComponent(String(value || ''))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isEditalLike(doc) {
  const tipo = safeTrim(doc?.tipo);
  const titulo = safeTrim(doc?.titulo);
  return /EDITAL/i.test(tipo)
    || /EDITAL/i.test(titulo)
    || /CONVOCA/i.test(tipo)
    || /CONVOCA/i.test(titulo);
}

function extractNumero(doc) {
  const numeroRef = safeTrim(doc?.referencia?.numero);
  if (numeroRef) return numeroRef;

  const titulo = safeTrim(doc?.titulo);
  if (!titulo) return '';

  // Heurística: padrões comuns do tipo ASM-2026-3507
  const m1 = titulo.match(/\b([A-Z]{2,8}-\d{4}-\d{1,8})\b/i);
  if (m1?.[1]) return safeTrim(m1[1]);

  // Alternativa: 2026-3507 (menos específica)
  const m2 = titulo.match(/\b(\d{4}-\d{1,8})\b/);
  if (m2?.[1]) return safeTrim(m2[1]);

  return '';
}

function buildFriendlyPdfFilename(doc, token) {
  const numero = extractNumero(doc);
  const tokenCurto = shortToken(token, 10);

  if (isEditalLike(doc)) {
    const n = numero || tokenCurto;
    return `Edital de Convocação - ${n}.pdf`;
  }

  const titulo = safeTrim(doc?.titulo) || 'WD Gestor - Documento certificado';
  const suffix = numero || tokenCurto;
  return `${titulo} - ${suffix}.pdf`;
}

function buildViewerTitle(doc, token) {
  const numero = extractNumero(doc);
  const tokenCurto = shortToken(token, 10);
  if (isEditalLike(doc)) {
    return `Edital de Convocação — ${numero || tokenCurto}`;
  }
  return 'WD Gestor — Documento certificado';
}

function isDebugCertEnabled() {
  return String(process.env.DEBUG_CERT || '').trim() === '1'
    || String(process.env.DEBUG_VISUAL_STAMP || '').trim() === '1';
}

async function sha256HexFile(absPath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(absPath);
    s.on('data', (chunk) => hash.update(chunk));
    s.on('error', reject);
    s.on('end', resolve);
  });
  return hash.digest('hex');
}

function sanitizePublic(doc) {
  if (!doc) return null;
  return {
    token: safeTrim(doc.token),
    status: safeTrim(doc.status),
    modulo: safeTrim(doc.modulo),
    tipo: safeTrim(doc.tipo),
    titulo: safeTrim(doc.titulo),
    emitidoEm: doc.emitidoEm || null,
    emitidoPorNomeSnapshot: safeTrim(doc.emitidoPorNomeSnapshot),
    hashSha256Pdf: safeTrim(doc.hashSha256Pdf),
    arquivo: {
      url: safeTrim(doc?.arquivo?.url),
      filename: safeTrim(doc?.arquivo?.filename),
      mime: safeTrim(doc?.arquivo?.mime),
      size: Number(doc?.arquivo?.size || 0) || 0
    },
    referencia: {
      entidade: safeTrim(doc?.referencia?.entidade),
      numero: safeTrim(doc?.referencia?.numero)
    },
    meta: {
      substituidoPorToken: safeTrim(doc?.meta?.substituidoPorToken)
    }
  };
}

router.get('/verificar/:token/status', async (req, res, next) => {
  try {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    } catch { /* noop */ }

    const tokenRaw = safeTrim(req.params?.token);
    const token = tokenRaw.toLowerCase();
    if (!isSafeToken(token)) return res.status(404).json({ found: false });

    const doc = await DocumentosPort.obterPorToken(token);
    if (!doc) return res.status(404).json({ found: false });

    const clean = sanitizePublic(doc);
    return res.json({
      found: true,
      token: safeTrim(clean?.token),
      status: safeTrim(clean?.status),
      hashSha256Pdf: safeTrim(clean?.hashSha256Pdf),
      tipo: safeTrim(clean?.tipo),
      titulo: safeTrim(clean?.titulo),
      referencia: clean?.referencia ? {
        entidade: safeTrim(clean?.referencia?.entidade),
        numero: safeTrim(clean?.referencia?.numero)
      } : { entidade: '', numero: '' },
      substituidoPorToken: safeTrim(clean?.meta?.substituidoPorToken),
      emitidoEm: clean?.emitidoEm || null
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/verificar/:token/pdf', async (req, res, next) => {
  try {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    } catch { /* noop */ }

    const tokenRaw = safeTrim(req.params?.token);
    const token = tokenRaw.toLowerCase();
    if (!isSafeToken(token)) return res.status(404).send('Não encontrado.');

    const doc = await DocumentosPort.obterPorToken(token);
    if (!doc) return res.status(404).send('Não encontrado.');

    const status = safeTrim(doc?.status).toUpperCase();
    if (status === 'REVOGADO') return res.status(403).send('Documento revogado.');

    // Permitidos: VALIDO | SUBSTITUIDO
    if (status !== 'VALIDO' && status !== 'SUBSTITUIDO') return res.status(404).send('Não encontrado.');

    const mime = safeTrim(doc?.arquivo?.mime).toLowerCase();
    if (mime && mime !== 'application/pdf') return res.status(404).send('Não encontrado.');

    // Viewer HTML opcional (não muda o comportamento padrão: PDF direto).
    const wantViewer = safeTrim(req.query?.viewer) === '1';
    const forcePdf = safeTrim(req.query?.raw) === '1';
    if (wantViewer && !forcePdf) {
      const title = buildViewerTitle(doc, token);
      const iframeSrc = `/verificar/${encodeURIComponent(token)}/pdf?raw=1`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(
        `<!doctype html><html lang="pt-br"><head>`
        + `<meta charset="utf-8"/>`
        + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
        + `<title>${escapeHtml(title)}</title>`
        + `</head><body style="margin:0">`
        + `<iframe src="${escapeHtml(iframeSrc)}" style="border:0; width:100vw; height:100vh" title="${escapeHtml(title)}"></iframe>`
        + `</body></html>`
      );
    }

    const friendly = buildFriendlyPdfFilename(doc, token);
    const filenameUtf8 = `${sanitizeFilename(friendly.replace(/\.pdf$/i, ''))}.pdf`;
    const filenameAscii = `${asciiFallbackFilename(friendly.replace(/\.pdf$/i, ''))}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    // filename*= garante UTF-8 (acentos) sem quebrar clients mais antigos.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filenameAscii}"; filename*=UTF-8''${encodeRFC5987(filenameUtf8)}`
    );

    const url = safeTrim(doc?.arquivo?.url);
    if (url) {
      try {
        const u = new URL(url, 'http://localhost');
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          // Preferir redirect seguro (sem cache) para storage externo.
          // Para storage local (ex.: /uploads/...), seguimos no streaming do disco.
          if (/^https?:\/\//i.test(url)) {
            if (isDebugCertEnabled()) {
              try { console.info('[servepdf]', `token=${token} redirect=${url}`); } catch { /* noop */ }
            }
            return res.redirect(302, url);
          }
        }
      } catch { /* ignora URL inválida */ }
    }

    // Storage local padrão (emitirDocumentoAssinadoExterno):
    // - certificado: uploads/documentos-validos/<token>.pdf
    // - original:    uploads/documentos-validos/<token>.original.pdf
    const DOCS_DIR = path.resolve(process.cwd(), 'uploads', 'documentos-validos');
    const servedName = `${token}.pdf`;
    const absCertified = path.resolve(DOCS_DIR, `${token}.pdf`);
    // Sem path traversal: token já validado como hex, e resolve garante confinamento.
    if (!(absCertified === path.join(DOCS_DIR, `${token}.pdf`) || absCertified.startsWith(DOCS_DIR + path.sep))) {
      return res.status(404).send('Não encontrado.');
    }

    const certifiedExists = await fs.promises
      .access(absCertified, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (!certifiedExists) {
      if (isDebugCertEnabled()) {
        try {
          console.info('[servepdf]', `token=${token} file=${servedName} abs=${absCertified} exists=false`);
        } catch { /* noop */ }
      }
      // O token/doc existe, mas o arquivo público certificado não está presente.
      // Requisito: não fazer fallback para o original e responder 409.
      return res.status(409).send('PDF certificado ainda não disponível.');
    }

    // Revalidação rápida do header PDF (anti-mime spoof): lê primeiros bytes.
    try {
      const fh = await fs.promises.open(absCertified, 'r');
      const buf = Buffer.alloc(5);
      await fh.read(buf, 0, 5, 0);
      await fh.close();
      if (buf.toString('utf8') !== '%PDF-') return res.status(404).send('Não encontrado.');
    } catch {
      return res.status(404).send('Não encontrado.');
    }

    const stream = fs.createReadStream(absCertified);

    if (isDebugCertEnabled()) {
      try {
        const st = await fs.promises.stat(absCertified);
        const servedSha = await sha256HexFile(absCertified);
        console.info('[servepdf]', `token=${token} file=${servedName} abs=${absCertified} exists=true bytes=${Number(st?.size || 0) || 0} sha=${servedSha}`);
      } catch (e) {
        try { console.warn('[servepdf][warn]', `token=${token} failedStatOrHash=${String(e?.message || e)}`); } catch { /* noop */ }
      }
    }

    stream.on('error', () => {
      if (!res.headersSent) res.status(404);
      try { res.end('Não encontrado.'); } catch { /* noop */ }
    });
    return stream.pipe(res);
  } catch (err) {
    return next(err);
  }
});

router.get('/verificar/:token', async (req, res, next) => {
  try {
    // Página pública: sem cache
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    } catch { /* noop */ }

    const token = safeTrim(req.params?.token);
    // Heurística simples para evitar lixo na rota
    if (!isSafeToken(token)) {
      return res.status(404).render('shared/verificar_documento', { found: false, token: token || '' });
    }

    const doc = await DocumentosPort.obterPorToken(token);
    if (!doc) {
      return res.status(404).render('shared/verificar_documento', { found: false, token });
    }

    return res.render('shared/verificar_documento', { found: true, token, doc: sanitizePublic(doc) });
  } catch (err) {
    return next(err);
  }
});

export default router;
