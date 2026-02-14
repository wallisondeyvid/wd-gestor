import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import DocumentoValidado from '#models/DocumentoValidado.js';
import { applyOverlayStamp, getVerificationUrl, sha256Hex as sha256Hex2 } from './applyCertificationStamp.js';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DOCS_DIR = path.join(UPLOADS_DIR, 'documentos-validos');

const MAX_PDF_BYTES = Number(process.env.DOCS_MAX_PDF_BYTES || (15 * 1024 * 1024));

function getBlobToken() {
  return String(
    process.env.BLOB_READ_WRITE_TOKEN
    || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || process.env.VERCEL_BLOB_RW_TOKEN
    || ''
  ).trim();
}

function isCloudLikeEnv() {
  return !!(
    process.env.VERCEL
    || process.env.VERCEL_URL
    || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

function safeTrim(value) {
  return String(value || '').trim();
}

function shortToken(token, size = 8) {
  const t = safeTrim(token).toLowerCase();
  if (!t) return '';
  return t.slice(0, Math.max(4, Math.min(24, Number(size) || 8)));
}

function isEditalLike(tipo, titulo) {
  const t1 = safeTrim(tipo);
  const t2 = safeTrim(titulo);
  return /EDITAL/i.test(t1) || /EDITAL/i.test(t2) || /CONVOCA/i.test(t1) || /CONVOCA/i.test(t2);
}

function extractNumeroFromTitulo(titulo) {
  const tt = safeTrim(titulo);
  if (!tt) return '';
  const m1 = tt.match(/\b([A-Z]{2,8}-\d{4}-\d{1,8})\b/i);
  if (m1?.[1]) return safeTrim(m1[1]);
  const m2 = tt.match(/\b(\d{4}-\d{1,8})\b/);
  if (m2?.[1]) return safeTrim(m2[1]);
  return '';
}

function buildPdfTitle({ tipo, titulo, numero, token }) {
  const tokenCurto = shortToken(token, 10);
  const n = safeTrim(numero) || extractNumeroFromTitulo(titulo) || tokenCurto;
  if (isEditalLike(tipo, titulo)) return `Edital de Convocação — ${n}`;
  return 'WD Gestor — Documento certificado';
}

function isProbablyPdf(buffer) {
  try {
    if (!Buffer.isBuffer(buffer)) return false;
    if (buffer.length < 5) return false;
    return buffer.slice(0, 5).toString('utf8') === '%PDF-';
  } catch {
    return false;
  }
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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

function isDebugCertEnabled() {
  return String(process.env.DEBUG_CERT || '').trim() === '1'
    || String(process.env.DEBUG_VISUAL_STAMP || '').trim() === '1';
}

function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

async function ensureDocsDir() {
  await fs.promises.mkdir(DOCS_DIR, { recursive: true });
}

function normalizeReferencia(ref) {
  const entidade = safeTrim(ref?.entidade);
  const entidadeId = safeTrim(ref?.entidadeId);
  const numero = safeTrim(ref?.numero);
  return {
    entidade,
    entidadeId,
    ...(numero ? { numero } : {})
  };
}

function validateUploadPdf(file) {
  if (!file) {
    const err = new Error('Arquivo PDF não enviado.');
    err.code = 'NO_FILE';
    throw err;
  }

  const mimetype = safeTrim(file.mimetype).toLowerCase();
  const originalname = safeTrim(file.originalname);
  const size = Number(file.size || 0);
  const buffer = file.buffer;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('Arquivo inválido (buffer vazio).');
    err.code = 'EMPTY_FILE';
    throw err;
  }

  if (size > MAX_PDF_BYTES || buffer.length > MAX_PDF_BYTES) {
    const err = new Error('Arquivo muito grande.');
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  // Checagens: mimetype, extensão e assinatura PDF
  if (mimetype && mimetype !== 'application/pdf') {
    const err = new Error('Apenas PDF é permitido.');
    err.code = 'INVALID_MIME';
    throw err;
  }

  if (originalname && !/\.pdf$/i.test(originalname)) {
    const err = new Error('Apenas arquivo .pdf é permitido.');
    err.code = 'INVALID_EXT';
    throw err;
  }

  if (!isProbablyPdf(buffer)) {
    const err = new Error('Arquivo não parece ser um PDF válido.');
    err.code = 'INVALID_PDF';
    throw err;
  }

  return {
    originalname,
    mimetype: mimetype || 'application/pdf',
    size: size || buffer.length,
    buffer
  };
}

export async function emitirDocumentoAssinadoExterno(payload = {}) {
  const modulo = safeTrim(payload.modulo);
  const tipo = safeTrim(payload.tipo);
  const organizacaoId = payload.organizacaoId ?? null;
  const referencia = normalizeReferencia(payload.referencia || {});
  const titulo = safeTrim(payload.titulo);
  const emitidoEm = payload.emitidoEm instanceof Date ? payload.emitidoEm : (payload.emitidoEm ? new Date(payload.emitidoEm) : new Date());
  const emitidoPorUserId = payload.emitidoPorUserId ?? null;
  const emitidoPorNomeSnapshot = safeTrim(payload.emitidoPorNomeSnapshot);
  const status = 'VALIDO';
  const meta = {
    versaoLayout: safeTrim(payload.meta?.versaoLayout),
    ip: safeTrim(payload.meta?.ip),
    userAgent: safeTrim(payload.meta?.userAgent)
  };

  if (!modulo) throw new Error('payload.modulo é obrigatório.');
  if (!tipo) throw new Error('payload.tipo é obrigatório.');
  if (!referencia.entidade) throw new Error('payload.referencia.entidade é obrigatório.');
  if (!referencia.entidadeId) throw new Error('payload.referencia.entidadeId é obrigatório.');

  const file = validateUploadPdf(payload.file);
  const hashOriginal = sha256Hex(file.buffer);
  const debugCert = isDebugCertEnabled();

  const blobToken = getBlobToken();
  const cloudEnv = isCloudLikeEnv();
  const canUseBlob = cloudEnv || !!blobToken;

  // Em nuvem (Vercel/Lambda), não podemos depender de filesystem persistente.
  // Mantemos escrita em disco apenas fora da nuvem (dev/on-prem) quando Blob não estiver disponível.
  if (!canUseBlob) {
    await ensureDocsDir();
  }

  // Gera token forte com retry em caso de colisão de índice único.
  let token = '';
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    token = generateToken(24);
    const filenameCertified = `${token}.pdf`;
    const filenameOriginal = `${token}.original.pdf`;
    const absCertified = path.join(DOCS_DIR, filenameCertified);
    const absOriginal = path.join(DOCS_DIR, filenameOriginal);
    let urlCertified = `/uploads/documentos-validos/${filenameCertified}`;
    let urlOriginal = `/uploads/documentos-validos/${filenameOriginal}`;

    try {
      // 1) Gera a versão certificada com carimbo institucional (overlay na última página).
      const verifyUrl = getVerificationUrl(token);
      let pageCount = 0;
      let stampedPagesCount = 0;
      const pdfTitle = buildPdfTitle({ tipo, titulo, numero: referencia?.numero, token });
      const certifiedBytes = await applyOverlayStamp(file.buffer, {
        token,
        sha256: hashOriginal,
        verifyUrl,
        pdfTitle,
        onInfo: (info) => {
          try {
            pageCount = Number(info?.pageCount || 0) || 0;
            stampedPagesCount = Number(info?.stampedPagesCount || 0) || 0;
          } catch { /* noop */ }
        }
      });
      const certifiedBuffer = Buffer.isBuffer(certifiedBytes) ? certifiedBytes : Buffer.from(certifiedBytes);
      const hashCertified = sha256Hex2(certifiedBuffer);

      if (hashCertified === hashOriginal) {
        const e = new Error('Falha ao certificar PDF: SHA do certificado igual ao original.');
        e.code = 'CERT_NO_CHANGE';
        throw e;
      }

      // 2) Persistência: preferir Blob em nuvem; fallback para disco apenas em ambiente não-cloud.
      let diskSha = '';
      let sizeOriginalDisk = 0;
      let sizeCertifiedDisk = 0;

      if (canUseBlob) {
        try {
          const putOptions = {
            access: 'public',
            contentType: 'application/pdf',
            cacheControl: 'public, max-age=31536000, immutable',
            ...(blobToken ? { token: blobToken } : {})
          };
          const keyOriginal = `documentos-validos/${filenameOriginal}`;
          const keyCertified = `documentos-validos/${filenameCertified}`;
          const upOriginal = await put(keyOriginal, file.buffer, putOptions);
          const upCertified = await put(keyCertified, certifiedBuffer, putOptions);
          if (!upOriginal?.url || !upCertified?.url) {
            const e = new Error('Falha ao salvar PDF no Blob.');
            e.code = 'BLOB_UPLOAD_FAILED';
            throw e;
          }
          urlOriginal = String(upOriginal.url);
          urlCertified = String(upCertified.url);
        } catch (e) {
          // Em cloud, não pode cair para disco. Fora de cloud, tentamos fallback abaixo.
          if (cloudEnv) {
            const err = new Error('Falha ao enviar PDF para a nuvem (Blob).');
            err.code = e?.code || 'BLOB_UPLOAD_FAILED';
            err.cause = e;
            throw err;
          }
          // Se não é cloud (ex.: on-prem) e o Blob falhou, segue para fallback em disco.
        }
      }

      if (!canUseBlob || (!cloudEnv && !/^https?:\/\//i.test(urlCertified))) {
        // 3) Fallback local: preserva o PDF original e o certificado no disco.
        await fs.promises.writeFile(absOriginal, file.buffer, { flag: 'wx' });
        await fs.promises.writeFile(absCertified, certifiedBuffer, { flag: 'wx' });

        // Prova/validação: rele o arquivo salvo e garante SHA igual ao buffer certificado.
        diskSha = await sha256HexFile(absCertified);
        if (diskSha !== hashCertified) {
          const e = new Error('Falha ao certificar PDF: SHA no disco difere do buffer certificado.');
          e.code = 'CERT_DISK_MISMATCH';
          e.meta = { token, hashCertified, diskSha, absCertified };
          throw e;
        }

        try { sizeOriginalDisk = Number((await fs.promises.stat(absOriginal))?.size || 0) || 0; } catch { /* noop */ }
        try { sizeCertifiedDisk = Number((await fs.promises.stat(absCertified))?.size || 0) || 0; } catch { /* noop */ }
      }

      const doc = await DocumentoValidado.create({
        token,
        modulo,
        tipo,
        organizacaoId,
        referencia,
        titulo,
        emitidoEm,
        emitidoPorUserId,
        emitidoPorNomeSnapshot,
        status,
        // Hash auditável exibido publicamente: refere-se ao PDF original (assinado externamente),
        // para evitar auto-referência (incluir o próprio hash altera o PDF).
        hashSha256Pdf: hashOriginal,
        arquivo: {
          url: urlCertified,
          filename: safeTrim(file.originalname) || filenameCertified,
          mime: file.mimetype || 'application/pdf',
          size: Number(file.size || 0) || certifiedBuffer.length
        },
        meta: {
          ...meta,
          verifyUrl,
          stampStyle: 'overlay-v1',
          originalHashSha256Pdf: hashOriginal,
          originalArquivoUrl: urlOriginal,
          certifiedHashSha256Pdf: hashCertified
        }
      });

      if (debugCert) {
        try {
          console.info(
            '[cert]',
            `token=${token} originalSha=${hashOriginal} certifiedSha=${hashCertified} pages=${pageCount || '?'} stamped=${stampedPagesCount || '?'} inBytes=${file.buffer?.length || 0} outBytes=${certifiedBuffer?.length || 0} url=${urlCertified}`
          );
          if (diskSha) console.info('[certdisk]', `token=${token} diskBytes=${sizeCertifiedDisk} diskSha=${diskSha} abs=${absCertified}`);
          console.info(
            '[cert]',
            `diskBytesOriginal=${sizeOriginalDisk} diskBytesCertified=${sizeCertifiedDisk} verifyUrl=${verifyUrl}`
          );
          if ((file.buffer?.length || 0) === (certifiedBuffer?.length || 0)) {
            console.warn('[cert][warn]', `token=${token} outBytes==inBytes (${certifiedBuffer?.length || 0})`);
          }
        } catch { /* noop */ }
      } else {
        // Log mínimo em produção.
        try {
          console.info('[cert]', `token=${token} sha256=${hashOriginal} pages=${pageCount || '?'} stored=${/^https?:\/\//i.test(urlCertified) ? 'blob' : 'disk'}`);
        } catch { /* noop */ }
      }

      return {
        token: doc.token,
        status: doc.status,
        hashSha256Pdf: doc.hashSha256Pdf,
        arquivo: doc.arquivo?.url ? { url: doc.arquivo.url } : {},
        emitidoEm: doc.emitidoEm
      };
    } catch (err) {
      lastErr = err;
      // Se gravou arquivo mas falhou no DB, não apaga para preservar evidência.
      // Se falhou por token duplicado, tenta novamente.
      if (String(err?.code) === '11000' || /duplicate key/i.test(String(err?.message || ''))) {
        continue;
      }
      // Colisão de arquivo (token já usado no storage): tenta novo token.
      if (String(err?.code) === 'EEXIST') {
        continue;
      }
      throw err;
    }
  }

  const e = new Error('Não foi possível emitir o documento (colisão de token).');
  e.cause = lastErr;
  throw e;
}

export async function obterPorToken(token) {
  const t = safeTrim(token);
  if (!t) return null;
  return DocumentoValidado.findOne({ token: t }).lean();
}

export async function revogar(token, motivo = '') {
  const t = safeTrim(token);
  if (!t) throw new Error('token é obrigatório.');

  const m = safeTrim(motivo);
  const updated = await DocumentoValidado.findOneAndUpdate(
    { token: t, status: { $ne: 'REVOGADO' } },
    { $set: { status: 'REVOGADO', 'meta.revogadoMotivo': m, 'meta.revogadoEm': new Date() } },
    { new: true }
  ).lean();

  return updated;
}

function isFileLike(value) {
  if (!value || typeof value !== 'object') return false;
  // Multer memoryStorage: { buffer, mimetype, originalname, size }
  return Buffer.isBuffer(value.buffer);
}

/**
 * Substitui um documento por outro.
 *
 * Compatibilidade:
 * - substituir(tokenAntigo, novoToken: string): marca token antigo como SUBSTITUIDO.
 *
 * Novo fluxo (premium):
 * - substituir(tokenAntigo, novoPdf: fileLike, opts?): emite um novo DocumentoValidado (novo token)
 *   com base nos metadados do documento antigo e marca o antigo como SUBSTITUIDO apontando para o novo.
 */
export async function substituir(tokenAntigo, novoTokenOuPdf, opts = {}) {
  const oldT = safeTrim(tokenAntigo);
  if (!oldT) throw new Error('tokenAntigo é obrigatório.');

  // Assinatura antiga: segundo arg é token.
  if (typeof novoTokenOuPdf === 'string') {
    const newT = safeTrim(novoTokenOuPdf);
    if (!newT) throw new Error('novoToken é obrigatório.');

    const updated = await DocumentoValidado.findOneAndUpdate(
      { token: oldT, status: { $ne: 'REVOGADO' } },
      { $set: { status: 'SUBSTITUIDO', 'meta.substituidoPorToken': newT, 'meta.substituidoEm': new Date() } },
      { new: true }
    ).lean();

    return updated;
  }

  const file = isFileLike(novoTokenOuPdf) ? novoTokenOuPdf : (novoTokenOuPdf?.file || null);
  if (!isFileLike(file)) throw new Error('novoPdf (file) é obrigatório.');

  const oldDoc = await DocumentoValidado.findOne({ token: oldT }).lean();
  if (!oldDoc) throw new Error('Documento antigo não encontrado.');

  const statusOld = safeTrim(oldDoc?.status).toUpperCase();
  if (statusOld === 'REVOGADO') throw new Error('Documento antigo está revogado.');

  const emitted = await emitirDocumentoAssinadoExterno({
    modulo: safeTrim(oldDoc?.modulo),
    tipo: safeTrim(oldDoc?.tipo),
    organizacaoId: oldDoc?.organizacaoId ?? null,
    referencia: normalizeReferencia(oldDoc?.referencia || {}),
    titulo: safeTrim(oldDoc?.titulo),
    emitidoEm: new Date(),
    emitidoPorUserId: opts?.emitidoPorUserId ?? oldDoc?.emitidoPorUserId ?? null,
    emitidoPorNomeSnapshot: safeTrim(opts?.emitidoPorNomeSnapshot) || safeTrim(oldDoc?.emitidoPorNomeSnapshot),
    file,
    meta: {
      versaoLayout: safeTrim(opts?.meta?.versaoLayout) || safeTrim(oldDoc?.meta?.versaoLayout),
      ip: safeTrim(opts?.meta?.ip) || safeTrim(oldDoc?.meta?.ip),
      userAgent: safeTrim(opts?.meta?.userAgent) || safeTrim(oldDoc?.meta?.userAgent)
    }
  });

  const updatedOld = await DocumentoValidado.findOneAndUpdate(
    { token: oldT, status: { $ne: 'REVOGADO' } },
    { $set: { status: 'SUBSTITUIDO', 'meta.substituidoPorToken': safeTrim(emitted?.token), 'meta.substituidoEm': new Date() } },
    { new: true }
  ).lean();

  return {
    antigo: updatedOld,
    novo: emitted,
    novoToken: safeTrim(emitted?.token)
  };
}
