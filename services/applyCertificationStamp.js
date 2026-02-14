import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const MM_TO_PT = 72 / 25.4;

function isDebugCertEnabled(opts = {}) {
  if (opts && opts.debug === true) return true;
  return String(process.env.DEBUG_CERT || '').trim() === '1';
}

function isDebugVisualStampEnabled(opts = {}) {
  if (opts && opts.debugVisual === true) return true;
  return String(process.env.DEBUG_VISUAL_STAMP || '').trim() === '1';
}

function clamp(value, min, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function mm(value) {
  return Number(value || 0) * MM_TO_PT;
}

function safeTrim(value) {
  return String(value || '').trim();
}

function shortSha256(hashHex, len = 12) {
  const h = safeTrim(hashHex).toLowerCase();
  if (!h) return '';
  return h.slice(0, Math.max(6, Math.min(64, Number(len) || 12)));
}

function shortToken(token, head = 8, tail = 6) {
  const t = safeTrim(token);
  if (!t) return '';
  const h = Math.max(2, Number(head) || 8);
  const tl = Math.max(2, Number(tail) || 6);
  if (t.length <= h + tl + 1) return t;
  return `${t.slice(0, h)}…${t.slice(-tl)}`;
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveVerificationBaseUrl() {
  // 1) Preferência: configuração explícita.
  const explicit = safeTrim(process.env.WDG_VERIFY_BASE_URL);
  if (explicit) return explicit;

  // 2) Alternativas comuns de base URL (quando já definidas no ambiente).
  //    Se não vier com /verificar, adiciona.
  const rawBase = safeTrim(process.env.APP_URL)
    || safeTrim(process.env.BASE_URL)
    || safeTrim(process.env.PUBLIC_URL);
  if (rawBase && !/localhost|127\.0\.0\.1|::1/i.test(rawBase)) {
    const clean = rawBase.replace(/\/$/, '');
    return /\/verificar\b/i.test(clean) ? clean : `${clean}/verificar`;
  }

  // 3) Vercel: usar domínio do deployment automaticamente.
  //    Observação: VERCEL_* normalmente vem sem protocolo.
  const vercelHost = safeTrim(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    || safeTrim(process.env.VERCEL_URL)
    || safeTrim(process.env.VERCEL_BRANCH_URL);
  if (vercelHost) {
    const hostClean = vercelHost.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return `https://${hostClean}/verificar`;
  }

  // 4) Fallback local conforme especificação.
  return 'http://localhost:3000/verificar';
}

export function getVerificationUrl(token) {
  const base = resolveVerificationBaseUrl();
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${b}/${encodeURIComponent(safeTrim(token))}`;
}

async function buildQrPngBytes(url) {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 0,
    scale: 6
  });
  const m = String(dataUrl).match(/^data:image\/png;base64,(.*)$/i);
  if (!m) throw new Error('Falha ao gerar QR code (data URL inválida).');
  return Buffer.from(m[1], 'base64');
}

function drawCenteredText(page, text, y, { font, size, color, maxWidth }) {
  const t = safeTrim(text);
  if (!t) return;
  const pageWidth = page.getWidth();
  const textWidth = font.widthOfTextAtSize(t, size);
  const w = Math.min(textWidth, maxWidth || pageWidth);
  const x = (pageWidth - w) / 2;
  page.drawText(t, { x, y, size, font, color });
}

/**
 * Aplica um selo institucional em overlay no PDF existente (sem criar página extra).
 *
 * Default: carimbar apenas a última página, no canto inferior direito.
 * Obs.: o PDF final terá bytes diferentes, mas não há reflow/crop/shift do conteúdo;
 * é apenas desenho por cima.
 *
 * Params (compatíveis):
 * - opts.token (obrigatório)
 * - opts.sha256 OU opts.hashSha256Hex (obrigatório)
 * - opts.verifyUrl OU opts.verificationUrl (opcional; default: getVerificationUrl(token))
 */
export async function applyOverlayStamp(pdfBytes, opts = {}) {
  const tokenClean = safeTrim(opts.token);
  if (!tokenClean) throw new Error('opts.token é obrigatório para carimbo.');

  const hashClean = safeTrim(opts.sha256 || opts.hashSha256Hex).toLowerCase();
  if (!hashClean) throw new Error('opts.sha256 (ou opts.hashSha256Hex) é obrigatório para carimbo.');

  const verificationUrl = safeTrim(opts.verifyUrl || opts.verificationUrl) || getVerificationUrl(tokenClean);
  const tokenCurto = shortToken(tokenClean, 8, 6);
  const hashCurto = shortSha256(hashClean, Number(opts.hashShortLen || 12));

  const shouldWriteMetadata = Boolean(String(opts.pdfTitle ?? opts.documentTitle ?? '').trim())
    || Boolean(String(opts.pdfSubject ?? '').trim());
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: shouldWriteMetadata });

  // Ajuda o viewer do navegador a exibir um título legível na aba.
  // Muitos viewers preferem o metadata Title do PDF em vez do filename do header.
  try {
    const pdfTitle = String(opts.pdfTitle ?? opts.documentTitle ?? '').trim();
    if (pdfTitle) {
      doc.setTitle(pdfTitle);
      if (!String(opts.pdfSubject ?? '').trim()) {
        doc.setSubject('Documento certificado');
      } else {
        doc.setSubject(String(opts.pdfSubject).trim());
      }
    }
  } catch { /* noop */ }
  const pages = doc.getPages();
  if (!pages.length) throw new Error('PDF sem páginas.');

  try {
    if (typeof opts.onInfo === 'function') {
      const stampAllPages0 = Boolean(opts.stampAllPages);
      opts.onInfo({
        pageCount: pages.length,
        stampedPagesCount: stampAllPages0 ? pages.length : 1,
        verificationUrl
      });
    }
  } catch { /* noop */ }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const gray = rgb(0.22, 0.26, 0.33);
  const debugCert = isDebugCertEnabled(opts);
  const debugVisual = isDebugVisualStampEnabled(opts);
  const debugAny = debugCert || debugVisual;

  const stampAllPages = Boolean(opts.stampAllPages);
  const targetPages = stampAllPages ? pages : [pages[pages.length - 1]];

  // Rodapé institucional (largura total). Altura alvo ~60–70pt.
  const footerHeightPt = Number(opts.footerHeightPt || opts.sealHeightPt || 64);
  const paddingPt = Number(opts.paddingPt || 12);
  const fontSizeBase = Number(opts.fontSize || 8.2);
  const lineGap = Number(opts.lineGap || 2.0);

  // Fundo do rodapé: branco com alta opacidade (institucional). Em modo prova, usa vermelho claro.
  const backgroundOpacity = debugVisual ? 1 : Number(opts.backgroundOpacity || 0.90);
  const borderWidth = debugVisual ? 2 : Number(opts.borderWidth || 0.5);
  const borderOpacity = debugVisual ? 1 : Number(opts.borderOpacity || 0.55);
  const debugTextColor = rgb(0.75, 0, 0);

  const qrPngBytes = await buildQrPngBytes(verificationUrl);
  const qrImage = await doc.embedPng(qrPngBytes);

  const line1 = 'Documento certificado pelo WD Gestor';
  const line2 = `Verifique: ${verificationUrl}`;
  const line3 = `Token: ${tokenCurto} • SHA-256: ${hashCurto}`;

  for (let pIndex = 0; pIndex < targetPages.length; pIndex++) {
    const page = targetPages[pIndex];

    // CropBox define a área visível em muitos PDFs assinados.
    let crop = null;
    try {
      if (typeof page.getCropBox === 'function') crop = page.getCropBox();
    } catch { /* noop */ }
    try {
      if (!crop && typeof page.getMediaBox === 'function') crop = page.getMediaBox();
    } catch { /* noop */ }

    const baseX = Number(crop?.x || 0) || 0;
    const baseY = Number(crop?.y || 0) || 0;
    const W = Number(crop?.width || page.getWidth()) || page.getWidth();
    const H = Number(crop?.height || page.getHeight()) || page.getHeight();

    let rot = 0;
    try {
      rot = Number(page.getRotation?.()?.angle || 0) || 0;
    } catch { /* noop */ }
    const rotNorm = ((rot % 360) + 360) % 360;

    const viewW = (rotNorm === 90 || rotNorm === 270) ? H : W;
    const viewH = (rotNorm === 90 || rotNorm === 270) ? W : H;

    // Requisito explícito: calcular largura da página via getWidth()
    const pageWidth = page.getWidth();

    // Escala se a área visível for pequena.
    const footerHView = Math.min(Math.max(28, footerHeightPt), Math.max(28, viewH));
    const s = Math.min(1, footerHView / footerHeightPt);
    const pad = Math.max(6, Math.round(paddingPt * s));
    const fontSize = Math.max(6.8, fontSizeBase * s);

    function mapViewRectToUser(xV0, yV0, wV0, hV0) {
      const wUser = (rotNorm === 90 || rotNorm === 270) ? hV0 : wV0;
      const hUser = (rotNorm === 90 || rotNorm === 270) ? wV0 : hV0;

      let xU0 = 0;
      let yU0 = 0;
      if (rotNorm === 0) {
        xU0 = xV0;
        yU0 = yV0;
      } else if (rotNorm === 90) {
        yU0 = xV0;
        xU0 = W - wUser - yV0;
      } else if (rotNorm === 180) {
        xU0 = W - wUser - xV0;
        yU0 = H - hUser - yV0;
      } else if (rotNorm === 270) {
        yU0 = H - hUser - xV0;
        xU0 = yV0;
      } else {
        xU0 = xV0;
        yU0 = yV0;
      }

      xU0 = clamp(xU0, 0, Math.max(0, W - wUser));
      yU0 = clamp(yU0, 0, Math.max(0, H - hUser));

      return {
        x: baseX + xU0,
        y: baseY + yU0,
        w: wUser,
        h: hUser
      };
    }

    function mapViewPointToUser(xV0, yV0) {
      let xU0 = 0;
      let yU0 = 0;
      if (rotNorm === 0) {
        xU0 = xV0;
        yU0 = yV0;
      } else if (rotNorm === 90) {
        xU0 = W - yV0;
        yU0 = xV0;
      } else if (rotNorm === 180) {
        xU0 = W - xV0;
        yU0 = H - yV0;
      } else if (rotNorm === 270) {
        xU0 = yV0;
        yU0 = H - xV0;
      } else {
        xU0 = xV0;
        yU0 = yV0;
      }

      xU0 = clamp(xU0, 0, W);
      yU0 = clamp(yU0, 0, H);
      return { x: baseX + xU0, y: baseY + yU0 };
    }

    // Rodapé em VIEW: x=0, y=0, width=viewW, height=footerHView
    const footer = mapViewRectToUser(0, 0, viewW, footerHView);

    if (debugAny) {
      try {
        const labelPage = stampAllPages ? String(pIndex + 1) : String(pages.length);
        console.info(
          '[stampdbg]',
          `page=${labelPage}/${pages.length} rot=${rotNorm} crop={x:${baseX.toFixed(2)},y:${baseY.toFixed(2)},w:${W.toFixed(2)},h:${H.toFixed(2)}} view={w:${viewW.toFixed(2)},h:${viewH.toFixed(2)}} footer={x:${footer.x.toFixed(2)},y:${footer.y.toFixed(2)},w:${footer.w.toFixed(2)},h:${footer.h.toFixed(2)}} pageWidth=${Number(pageWidth || 0).toFixed(2)}`
        );
      } catch { /* noop */ }
    }

    // Fundo do selo (overlay), sem "reformatar" o documento.
    // Fundo do rodapé (overlay, sem mover conteúdo)
    page.drawRectangle({
      x: footer.x,
      y: footer.y,
      width: footer.w,
      height: footer.h,
      color: debugVisual ? rgb(1, 0.86, 0.86) : rgb(1, 1, 1),
      opacity: backgroundOpacity,
      borderWidth: 0
    });

    // Borda superior leve (linha)
    try {
      const topLine = mapViewRectToUser(0, footerHView - 1, viewW, 1);
      page.drawRectangle({
        x: topLine.x,
        y: topLine.y,
        width: topLine.w,
        height: Math.max(1, topLine.h),
        color: rgb(0.80, 0.84, 0.88),
        opacity: debugVisual ? 1 : 0.75,
        borderWidth: 0
      });
    } catch { /* noop */ }

    // Layout interno em VIEW
    const qr = Math.min(Math.max(14, footerHView - pad * 2), 56);
    const qrRect = mapViewRectToUser(pad, (footerHView - qr) / 2, qr, qr);
    page.drawImage(qrImage, { x: qrRect.x, y: qrRect.y, width: qrRect.w, height: qrRect.h });

    const textXv = pad + qr + pad;
    const textWv = Math.max(0, viewW - pad - textXv);

    let textFontSize = fontSize;
    if (textWv < 220) textFontSize = Math.max(6.8, fontSize * 0.92);
    if (textWv < 160) textFontSize = Math.max(6.4, fontSize * 0.86);

    const lh = textFontSize + lineGap;
    const topYv = footerHView - pad - textFontSize;

    let lines = [line1, line2, line3];
    if (textWv < 220) lines = [line1, line2];
    if (textWv < 160) lines = [line2];

    for (let i = 0; i < lines.length; i++) {
      const t = safeTrim(lines[i]);
      if (!t) continue;
      const yV = topYv - (lh * i);
      if (yV < pad) break;

      // Truncamento simples por largura (em VIEW)
      let out = t;
      while (out.length > 10 && font.widthOfTextAtSize(out, textFontSize) > textWv) {
        out = out.slice(0, -2).trimEnd() + '…';
      }

      const pt = mapViewPointToUser(textXv, yV);
      page.drawText(out, {
        x: pt.x,
        y: pt.y,
        size: textFontSize,
        font,
        color: debugVisual ? debugTextColor : gray
      });
    }

    if (debugVisual) {
      try {
        const pt = mapViewPointToUser(textXv, pad);
        page.drawText('FOOTER STAMP TEST', {
          x: pt.x,
          y: pt.y,
          size: Math.max(12, textFontSize * 1.6),
          font,
          color: debugTextColor
        });
      } catch { /* noop */ }
    }

    if (debugVisual) {
      try {
        // Retângulo de referência no canto inferior direito do CropBox (visível no viewer)
        const refSize = 28;
        const refX = baseX + clamp(W - refSize - 4, 0, Math.max(0, W - refSize));
        const refY = baseY + clamp(4, 0, Math.max(0, H - refSize));
        page.drawRectangle({
          x: refX,
          y: refY,
          width: refSize,
          height: refSize,
          borderColor: debugTextColor,
          borderWidth: 3,
          borderOpacity: 1,
          opacity: 0
        });

        // Texto grande de prova dentro do rodapé
        const pt = mapViewPointToUser(pad, pad);
        page.drawText('TEST STAMP', {
          x: pt.x,
          y: pt.y,
          size: Math.max(16, fontSize * 1.9),
          font,
          color: debugTextColor
        });
      } catch { /* noop */ }
    }
  }

  return doc.save();
}

// Backward-compat: mantém nome antigo usado no service.
export async function applyCertificationStamp(pdfBytes, token, hashSha256Hex, opts = {}) {
  return applyOverlayStamp(pdfBytes, {
    ...opts,
    token,
    // Mantém compatibilidade com nome antigo, mas applyOverlayStamp também aceita opts.sha256.
    hashSha256Hex
  });
}
