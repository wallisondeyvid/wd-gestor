export async function executionAtaPdfLogic({ req, res, shadow = false, deps }) {
  const {
    mustControl,
    mongoose,
    CondAssembleia,
    getOrCreateExecution,
    computeQuorum,
    voteSummary,
    safeStr,
    QRCode,
    PDFDocument,
    writeAuditLog,
    getActorSource
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const ataRes = await (async () => {
      const [assembleia, execDoc] = await Promise.all([
        CondAssembleia.findById(id).lean(),
        getOrCreateExecution(id)
      ]);
      if (!assembleia || !execDoc) return null;
      const quorum = computeQuorum(execDoc);
      const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
      const votes = Array.isArray(execDoc.votes) ? execDoc.votes : [];
      const results = votes.map(v => voteSummary(v, execDoc));
      const ataText = [
        `ATA – ${safeStr(assembleia.titulo || 'Assembleia', 240)}`,
        `Data: ${assembleia.data ? new Date(assembleia.data).toLocaleDateString('pt-BR') : '—'}`,
        `Modalidade: ${safeStr(assembleia.modalidade || '—', 40)}`,
        assembleia.link ? `Link: ${safeStr(assembleia.link, 800)}` : '',
        '',
        `Status da sessão: ${safeStr(execDoc.sessionStatus, 30)}${execDoc.isPaused ? ' (pausada)' : ''}`,
        execDoc.openedAt ? `Abertura: ${new Date(execDoc.openedAt).toLocaleString('pt-BR')}` : '',
        execDoc.closedAt ? `Encerramento: ${new Date(execDoc.closedAt).toLocaleString('pt-BR')}` : '',
        '',
        `Presenças confirmadas: ${quorum.pessoas}`,
        `Fração ideal presente (somatório): ${quorum.fracaoIdeal}`,
        '',
        'Pauta e deliberações:',
        ...agenda.map((it) => `- Item ${Number(it.idx) + 1}: ${safeStr(it.tipo || '', 80)} – ${safeStr(it.descricao || '', 260)}`),
        '',
        'Votações:',
        ...results.map((r) => {
          const t = r?.totals || {};
          return `- Item ${Number(r.agendaIdx) + 1}: SIM=${t.sim || 0}, NÃO=${t.nao || 0}, ABSTENÇÃO=${t.abstencao || 0}`;
        })
      ].filter(Boolean).join('\n');
      return { assembleia, execDoc, ataText };
    })();

    if (!ataRes) return { status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

    const { assembleia, execDoc, ataText } = ataRes;

    const host = String(req.get('host') || '').trim();
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const baseUrl = req.baseUrl || '/condominios';
    const qrUrl = host ? `${proto}://${host}${baseUrl}/administracao/assembleia/execucao?id=${encodeURIComponent(String(id))}` : '';
    const qrPng = qrUrl ? await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 }).catch(() => '') : '';

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', () => { /* noop */ });

    doc.fontSize(16).text('Ata da Assembleia', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#111827').text(`Título: ${safeStr(assembleia.titulo || '', 240)}`);
    doc.text(`Data: ${assembleia.data ? new Date(assembleia.data).toLocaleDateString('pt-BR') : '—'}`);
    doc.text(`Modalidade: ${safeStr(assembleia.modalidade || '—', 40)}`);
    if (assembleia.link) doc.text(`Link: ${safeStr(assembleia.link, 800)}`);
    doc.moveDown(0.75);
    doc.fontSize(10).fillColor('#0f172a').text(ataText, { align: 'left' });

    if (qrPng) {
      try {
        const b64 = String(qrPng).split(',')[1] || '';
        const buf = Buffer.from(b64, 'base64');
        doc.addPage();
        doc.fontSize(14).fillColor('#111827').text('QR de referência', { align: 'center' });
        doc.moveDown(1);
        doc.image(buf, { fit: [240, 240], align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#334155').text(qrUrl, { align: 'center' });
      } catch { /* noop */ }
    }

    doc.end();

    const pdfBuf = await new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      setTimeout(() => resolve(Buffer.concat(chunks)), 2000);
    });

    if (!shadow) {
      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.ata.export_pdf',
        payload: { bytes: pdfBuf.length }
      });
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="ata-assembleia-${String(id).slice(-6)}.pdf"`
      },
      body: pdfBuf
    };
  } catch (e) {
    console.error('[assembleia-execution][ata.pdf] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao exportar ata' } };
  }
}