import { processFaceUploadCaptureCore } from '#modules/gestor/app/services/biometria/processFaceUploadCaptureCore.js';

export async function handleFaceBiometriaUpload(req, res) {
  try {
    const data = req.body || {};
    const capturas = Array.isArray(data.capturas) ? data.capturas.slice(0, 3) : [];
    if (!capturas.length) return res.status(400).json({ ok: false, error: 'Nenhuma captura enviada' });

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
      const savedItem = await processFaceUploadCaptureCore({ dataUrl: capturas[i] || '', index: i, blobToken });
      if (savedItem) saved.push(savedItem);
    }

    if (!saved.length) return res.status(400).json({ ok: false, error: 'Falha ao processar capturas' });

    return res.json({ ok: true, arquivos: saved });
  } catch (err) {
    console.error('[face-upload] erro:', err);
    return res.status(500).json({ ok: false, error: 'Falha interna no upload facial' });
  }
}