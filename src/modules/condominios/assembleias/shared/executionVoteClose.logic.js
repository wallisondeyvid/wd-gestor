export async function executionVoteCloseLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    getOrCreateExecution,
    pushEvent,
    safeStr,
    writeAuditLog,
    getActorSource,
    voteSummary
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    const idx = Number(execDoc.currentAgendaIdx || 0) || 0;
    const vote = (execDoc.votes || []).find(v => Number(v?.agendaIdx) === idx && v?.openedAt && !v?.closedAt);
    if (!vote) return { status: 409, body: { ok: false, error: 'Nenhuma votação aberta para o item atual' } };

    vote.closedAt = new Date();
    execDoc.sessionStatus = 'aberta';

    pushEvent(execDoc, { type: 'vote_closed', message: `Votação encerrada (item ${idx + 1})`, actorEmail: safeStr(ctxUser?.email || '') });

    if (!shadow) {
      await execDoc.save();
      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.vote.close',
        payload: { agendaIdx: idx, closedAt: vote.closedAt }
      });
    }

    return { status: 200, body: { ok: true, data: voteSummary(vote, execDoc) } };
  } catch (e) {
    console.error('[assembleia-execution][vote/close] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao encerrar votação' } };
  }
}