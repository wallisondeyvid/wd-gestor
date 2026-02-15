import { getExecutionAtaJson, getExecutionAtaPdf } from '#modules/condominios/assembleias/v2/services/executionAta.service.js';

export async function getExecutionAta(req, res) {
  try {
    const result = await getExecutionAtaJson(req, res);
    if (result.kind === 'handled') return;
    if (result.kind === 'error') return res.status(result.status).json(result.body);
    return res.json(result.body);
  } catch (e) {
    console.error('[assembleia-execution][ata] erro:', e);
    return res.status(500).json({ ok: false, error: 'Falha ao gerar ata' });
  }
}

export async function getExecutionAtaPdfController(req, res) {
  try {
    const result = await getExecutionAtaPdf(req, res);
    if (result.kind === 'handled') return;
    if (result.kind === 'error') return res.status(result.status).json(result.body);

    res.setHeader('Content-Type', result.headers['Content-Type']);
    res.setHeader('Cache-Control', result.headers['Cache-Control']);
    res.setHeader('Content-Disposition', result.headers['Content-Disposition']);
    return res.status(result.status).send(result.buffer);
  } catch (e) {
    console.error('[assembleia-execution][ata.pdf] erro:', e);
    return res.status(500).json({ ok: false, error: 'Falha ao exportar ata' });
  }
}
