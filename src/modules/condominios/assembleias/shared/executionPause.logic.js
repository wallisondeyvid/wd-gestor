export async function executionPauseLogic({ req, res, shadow = false, deps }) {
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
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    if (String(execDoc.sessionStatus) !== 'aberta' && String(execDoc.sessionStatus) !== 'em_votacao') {
      return { status: 409, body: { ok: false, error: 'Sessão não está aberta' } };
    }
    if (!execDoc.openedAt) {
      return { status: 409, body: { ok: false, error: 'Sessão ainda não foi aberta' } };
    }

    if (!execDoc.isPaused) {
      execDoc.isPaused = true;
      execDoc.pausedAt = new Date();
      pushEvent(execDoc, { type: 'session_paused', message: 'Sessão pausada', actorEmail: safeStr(ctxUser?.email || '') });
    } else {
      const pausedAt = execDoc.pausedAt ? new Date(execDoc.pausedAt).getTime() : null;
      if (pausedAt) execDoc.pausedMs = (Number(execDoc.pausedMs || 0) || 0) + Math.max(0, Date.now() - pausedAt);
      execDoc.isPaused = false;
      execDoc.pausedAt = null;
      pushEvent(execDoc, { type: 'session_resumed', message: 'Sessão retomada', actorEmail: safeStr(ctxUser?.email || '') });
    }

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
        action: execDoc.isPaused ? 'execution.pause' : 'execution.resume',
        payload: { isPaused: !!execDoc.isPaused }
      });
    }

    return { status: 200, body: { ok: true, data: { isPaused: !!execDoc.isPaused } } };
  } catch (e) {
    console.error('[assembleia-execution][pause] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao pausar/retomar sessão' } };
  }
}
