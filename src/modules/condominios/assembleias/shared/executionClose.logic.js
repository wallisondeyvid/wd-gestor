export async function executionCloseLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    getOrCreateExecution,
    pushEvent,
    safeStr,
    getActorSource,
    writeAuditLog
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return { status: 400, body: { ok: false, error: 'ID inválido' } };
    }

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) {
      return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };
    }

    if (String(execDoc.sessionStatus) === 'encerrada') {
      return { status: 409, body: { ok: false, error: 'Sessão já encerrada' } };
    }

    try {
      const idx = Number(execDoc.currentAgendaIdx || 0) || 0;
      const openVote = (execDoc.votes || []).find(v => Number(v?.agendaIdx) === idx && v?.openedAt && !v?.closedAt);
      if (openVote) openVote.closedAt = new Date();
    } catch { /* noop */ }

    try {
      if (execDoc.isPaused && execDoc.pausedAt) {
        const pausedAt = new Date(execDoc.pausedAt).getTime();
        execDoc.pausedMs = (Number(execDoc.pausedMs || 0) || 0) + Math.max(0, Date.now() - pausedAt);
      }
    } catch { /* noop */ }

    execDoc.isPaused = false;
    execDoc.pausedAt = null;
    execDoc.sessionStatus = 'encerrada';
    execDoc.closedAt = new Date();

    if (!shadow) {
      pushEvent(execDoc, { type: 'session_closed', message: 'Sessão encerrada', actorEmail: safeStr(ctxUser?.email || '') });

      await execDoc.save();
      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.close',
        payload: { at: execDoc.closedAt }
      });
    }

    return { status: 200, body: { ok: true, data: { sessionStatus: execDoc.sessionStatus, closedAt: execDoc.closedAt } } };
  } catch (e) {
    console.error('[assembleia-execution][close] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao encerrar sessão' } };
  }
}
