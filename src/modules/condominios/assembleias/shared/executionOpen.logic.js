export async function executionOpenLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    CondAssembleia,
    parseConvocacaoDateTime,
    getOrCreateExecution,
    pushEvent,
    safeStr,
    writeAuditLog,
    getActorSource
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const assembleia = await CondAssembleia.findById(id);
    if (!assembleia) return { status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

    const convocacaoAt = parseConvocacaoDateTime(assembleia);
    if (convocacaoAt && Date.now() < convocacaoAt.getTime()) {
      return { status: 409, body: { ok: false, error: 'Sessão não pode ser aberta antes da data/hora de convocação', data: { convocacaoAt } } };
    }

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    if (String(execDoc.sessionStatus) === 'encerrada') {
      return { status: 409, body: { ok: false, error: 'Sessão já encerrada' } };
    }
    if (String(execDoc.sessionStatus) !== 'aguardando') {
      return { status: 409, body: { ok: false, error: 'Sessão já está aberta' } };
    }

    execDoc.sessionStatus = 'aberta';
    execDoc.isPaused = false;
    execDoc.openedAt = new Date();
    execDoc.pausedAt = null;
    execDoc.pausedMs = 0;
    execDoc.closedAt = null;

    pushEvent(execDoc, {
      type: 'session_opened',
      message: 'Sessão aberta',
      actorEmail: safeStr(ctxUser?.email || '')
    });

    if (!shadow) {
      await execDoc.save();

      await writeAuditLog({
        req,
        ctxUser,
        source: getActorSource(req),
        unidadeId: assembleia.unidade_id,
        assembleiaId: assembleia._id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.open',
        payload: { at: execDoc.openedAt }
      });
    }

    return { status: 200, body: { ok: true, data: { sessionStatus: execDoc.sessionStatus, openedAt: execDoc.openedAt } } };
  } catch (e) {
    console.error('[assembleia-execution][open] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao abrir sessão' } };
  }
}