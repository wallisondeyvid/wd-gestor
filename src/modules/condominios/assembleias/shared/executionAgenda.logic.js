export async function executionAgendaLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    getOrCreateExecution,
    safeStr,
    pushEvent,
    writeAuditLog,
    getActorSource
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    if (String(execDoc.sessionStatus) === 'encerrada') {
      return { status: 409, body: { ok: false, error: 'Assembleia encerrada' } };
    }
    if (String(execDoc.sessionStatus) === 'aguardando') {
      return { status: 409, body: { ok: false, error: 'Sessão ainda não foi aberta' } };
    }

    const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
    if (!agenda.length) return { status: 409, body: { ok: false, error: 'Assembleia não possui pauta' } };

    const action = safeStr(req.body?.action || 'set', 40);
    const prevIdx = Number(execDoc.currentAgendaIdx || 0) || 0;
    let idx = prevIdx;
    if (action === 'set') idx = Number(req.body?.idx || 0) || 0;
    if (action === 'next') idx = Math.min(agenda.length - 1, idx + 1);
    if (action === 'prev') idx = Math.max(0, idx - 1);

    const now = new Date();
    const finalizeItemIfDiscussing = (item) => {
      try {
        if (!item) return;
        if (String(item.state) !== 'discutindo') return;
        if (!item.discussionStartedAt) return;
        const started = new Date(item.discussionStartedAt).getTime();
        const delta = Math.max(0, Date.now() - started);
        item.timeMs = (Number(item.timeMs || 0) || 0) + delta;
        item.discussionEndedAt = now;
        item.state = 'concluido';
        item.discussionStartedAt = null;
      } catch { /* noop */ }
    };

    if (action !== 'start_discussion' && idx !== prevIdx) {
      const prevItem = agenda.find(a => Number(a?.idx) === prevIdx) || agenda[prevIdx];
      finalizeItemIfDiscussing(prevItem);
    }

    execDoc.currentAgendaIdx = idx;

    if (action === 'start_discussion') {
      try {
        const anyDiscussing = agenda.find(a => String(a?.state) === 'discutindo' && Number(a?.idx) !== idx);
        if (anyDiscussing) finalizeItemIfDiscussing(anyDiscussing);
      } catch { /* noop */ }

      const item = agenda.find(a => Number(a?.idx) === idx) || agenda[idx];
      if (item && item.state !== 'concluido') {
        item.state = 'discutindo';
        if (!item.discussionStartedAt) item.discussionStartedAt = now;
      }
      pushEvent(execDoc, { type: 'agenda_discussion_started', message: `Discussão iniciada (item ${idx + 1})`, actorEmail: safeStr(ctxUser?.email || '') });
    } else {
      pushEvent(execDoc, { type: 'agenda_changed', message: `Item atual definido: ${idx + 1}`, actorEmail: safeStr(ctxUser?.email || '') });
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
        action: 'execution.agenda',
        payload: { action, idx }
      });
    }

    return { status: 200, body: { ok: true, data: { currentAgendaIdx: idx } } };
  } catch (e) {
    console.error('[assembleia-execution][agenda] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao atualizar pauta' } };
  }
}