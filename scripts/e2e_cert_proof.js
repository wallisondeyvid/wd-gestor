import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { PDFDocument, degrees } from 'pdf-lib';
// Script E2E: prova que o endpoint público está servindo exatamente o arquivo
// uploads/documentos-validos/<token>.pdf (comparando SHA do download vs SHA do disco).

function safeTrim(v) {
  return String(v || '').trim();
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

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function makePdfBytes({ rotateLast = 0 } = {}) {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([595.28, 841.89]);
  p1.drawText('E2E PDF TEST - PAGE 1', { x: 50, y: 780, size: 18 });
  const p2 = doc.addPage([595.28, 841.89]);
  p2.drawText('E2E PDF TEST - PAGE 2 (LAST)', { x: 50, y: 780, size: 18 });
  if ([90, 180, 270].includes(Number(rotateLast) || 0)) {
    p2.setRotation(degrees(Number(rotateLast)));
    p2.drawText(`ROTATE_LAST=${rotateLast}`, { x: 50, y: 740, size: 14 });
  }
  return doc.save();
}

async function main() {
  const baseUrl = safeTrim(process.env.BASE_URL) || 'http://localhost:3000';
  const tokenEnv = safeTrim(process.env.TOKEN);
  let token = tokenEnv;

  if (!token) {
    console.error('[e2e][error] Defina TOKEN=<token> (token real emitido pelo upload).');
    process.exit(2);
  }

  const url = `${baseUrl.replace(/\/$/, '')}/verificar/${encodeURIComponent(token)}/pdf`;
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  const downloaded = Buffer.from(arr);

  const tmpDir = path.resolve(process.cwd(), 'tmp');
  await ensureDir(tmpDir);
  const outPath = path.join(tmpDir, `e2e_${token}.pdf`);
  await fs.promises.writeFile(outPath, downloaded);

  const downloadedSha = sha256Hex(downloaded);
  const downloadedBytes = downloaded.length;

  console.log('[e2e]', `url=${url} status=${res.status} redirected=${res.redirected} finalUrl=${res.url}`);
  console.log('[e2e]', `saved=${outPath}`);
  console.log('[e2e]', `downloadedBytes=${downloadedBytes} downloadedSha=${downloadedSha}`);

  // Prova extra: compara com SHA do arquivo salvo em uploads (se existir no disco local)
  const uploadsPath = path.resolve(process.cwd(), 'uploads', 'documentos-validos', `${token}.pdf`);
  const exists = await fs.promises
    .access(uploadsPath, fs.constants.R_OK)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    const diskSha = await sha256HexFile(uploadsPath);
    const diskBytes = Number((await fs.promises.stat(uploadsPath))?.size || 0) || 0;
    console.log('[e2e]', `diskPath=${uploadsPath} diskBytes=${diskBytes} diskSha=${diskSha}`);
    console.log('[e2e]', `matchDisk=${diskSha === downloadedSha}`);
  } else {
    console.log('[e2e]', `diskPath=${uploadsPath} exists=false`);
  }
}

main().catch((e) => {
  console.error('[e2e][error]', e?.stack || e?.message || String(e));
  process.exit(1);
});
