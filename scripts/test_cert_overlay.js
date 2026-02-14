import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, degrees } from 'pdf-lib';
import { applyOverlayStamp, sha256Hex as sha256HexHelper, getVerificationUrl } from '../services/applyCertificationStamp.js';

function safeTrim(v) {
  return String(v || '').trim();
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function makeSamplePdfBytes() {
  const doc = await PDFDocument.create();
  const page1 = doc.addPage([595.28, 841.89]); // A4 pt
  page1.drawText('PDF DE TESTE - PAGINA 1', { x: 50, y: 780, size: 18 });
  const page2 = doc.addPage([595.28, 841.89]);
  page2.drawText('PDF DE TESTE - PAGINA 2 (ULTIMA)', { x: 50, y: 780, size: 18 });

  const rotEnv = String(process.env.ROTATE_TEST || '').trim();
  const rot = Number(rotEnv || 0) || 0;
  if ([90, 180, 270].includes(rot)) {
    page2.setRotation(degrees(rot));
    page2.drawText(`ROTATE_TEST=${rot}`, { x: 50, y: 740, size: 14 });
  }

  return doc.save();
}

async function main() {
  const inPathArg = safeTrim(process.argv[2]);
  const outPathArg = safeTrim(process.argv[3]);

  let inputBytes;
  let inPathResolved = '';
  if (inPathArg) {
    inPathResolved = path.resolve(process.cwd(), inPathArg);
    inputBytes = await fs.promises.readFile(inPathResolved);
  } else {
    inputBytes = await makeSamplePdfBytes();
    inputBytes = Buffer.isBuffer(inputBytes) ? inputBytes : Buffer.from(inputBytes);
  }

  const token = crypto.randomBytes(24).toString('hex');
  const originalSha = sha256Hex(inputBytes);
  const verifyUrl = getVerificationUrl(token);

  let info = { pageCount: 0, stampedPagesCount: 0, verificationUrl: '' };
  const outBytes = await applyOverlayStamp(inputBytes, {
    token,
    sha256: originalSha,
    verifyUrl,
    onInfo: (i) => { info = { ...info, ...(i || {}) }; }
  });
  const outBuf = Buffer.isBuffer(outBytes) ? outBytes : Buffer.from(outBytes);

  const outSha = sha256HexHelper(outBuf);

  const outPath = outPathArg
    ? path.resolve(process.cwd(), outPathArg)
    : path.resolve(process.cwd(), 'tmp', `cert_overlay_test.${token}.pdf`);

  await ensureDir(path.dirname(outPath));
  await fs.promises.writeFile(outPath, outBuf);

  const inBytesLen = Number(inputBytes?.length || 0) || 0;
  const outBytesLen = Number(outBuf?.length || 0) || 0;

  console.log('[test]', `inPath=${inPathResolved || '(generated)'}`);
  console.log('[test]', `outPath=${outPath}`);
  console.log('[test]', `token=${token}`);
  console.log('[test]', `verifyUrl=${verifyUrl}`);
  console.log('[test]', `pages=${info.pageCount || '?'} stamped=${info.stampedPagesCount || '?'}`);
  console.log('[test]', `inBytes=${inBytesLen} outBytes=${outBytesLen}`);
  console.log('[test]', `originalSha=${originalSha}`);
  console.log('[test]', `outSha=${outSha}`);
  if (originalSha === outSha) {
    console.error('[test][BUG]', 'SHA igual: overlay nao alterou o PDF');
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[test][error]', e);
  process.exit(1);
});
