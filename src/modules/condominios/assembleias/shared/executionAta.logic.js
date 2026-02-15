export async function executionAtaLogic({ req, res, shadow = false, deps }) {
  const {
    mustControl,
    mongoose,
    CondAssembleia,
    getOrCreateExecution,
    computeQuorum,
    voteSummary,
    safeStr,
    writeAuditLog,
    getActorSource
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const [assembleia, execDoc] = await Promise.all([
      CondAssembleia.findById(id).lean(),
      getOrCreateExecution(id)
    ]);
    if (!assembleia || !execDoc) return { status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

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

    if (!shadow) {
      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.ata.view',
        payload: { length: ataText.length }
      });
    }

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          assembleia: {
            _id: String(assembleia._id),
            titulo: assembleia.titulo || '',
            data: assembleia.data || null,
            modalidade: assembleia.modalidade || '',
            local: assembleia.local || '',
            link: assembleia.link || ''
          },
          execution: {
            sessionStatus: execDoc.sessionStatus,
            isPaused: !!execDoc.isPaused,
            openedAt: execDoc.openedAt,
            closedAt: execDoc.closedAt,
            quorum,
            agenda: agenda.map(a => ({ idx: a.idx, tipo: a.tipo, descricao: a.descricao, timeMs: a.timeMs, state: a.state })),
            votes: results
          },
          ataText
        }
      }
    };
  } catch (e) {
    console.error('[assembleia-execution][ata] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao gerar ata' } };
  }
}