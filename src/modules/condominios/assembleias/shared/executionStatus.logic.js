export async function executionStatusLogic({ req, res, shadow = false, deps }) {
  const {
    mustAuth,
    mongoose,
    getOrCreateExecution,
    computeSessionClockMs,
    computeQuorum,
    voteSummary,
    safeStr,
    serializePresence
  } = deps;

  try {
    const ctxUser = mustAuth(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Assembleia não encontrada' } };

    const clockMs = computeSessionClockMs(execDoc);
    const quorum = computeQuorum(execDoc);

    const currentIdx = Number(execDoc.currentAgendaIdx || 0) || 0;
    const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
    const currentItem = agenda.find(a => Number(a?.idx) === currentIdx) || agenda[currentIdx] || null;

    const vote = (Array.isArray(execDoc.votes) ? execDoc.votes : []).find(v => Number(v?.agendaIdx) === currentIdx && v?.openedAt && !v?.closedAt) || null;
    const voteSum = vote ? voteSummary(vote, execDoc) : null;
    const openVote = voteSum
      ? {
        agendaIdx: voteSum.agendaIdx,
        openedAt: voteSum.openedAt,
        closedAt: voteSum.closedAt,
        sim: Number(voteSum?.totals?.sim || 0) || 0,
        nao: Number(voteSum?.totals?.nao || 0) || 0,
        abstencao: Number(voteSum?.totals?.abstencao || 0) || 0,
        total: Number(voteSum?.totals?.count || 0) || 0
      }
      : null;

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          assembleiaId: String(execDoc.assembleia_id),
          unidadeId: execDoc.unidade_id ? String(execDoc.unidade_id) : null,
          sessionStatus: execDoc.sessionStatus,
          isPaused: !!execDoc.isPaused,
          openedAt: execDoc.openedAt,
          closedAt: execDoc.closedAt,
          virtualLink: safeStr(execDoc.virtualLink || '', 800),
          sessionClockMs: clockMs,
          quorum,
          currentAgendaIdx: currentIdx,
          agenda: agenda.map(it => ({
            idx: it.idx,
            tipo: safeStr(it.tipo, 80),
            descricao: safeStr(it.descricao, 240),
            state: it.state,
            timeMs: Number(it.timeMs || 0) || 0
          })),
          presences: (Array.isArray(execDoc.presences) ? execDoc.presences : []).map((p) => serializePresence(p)),
          currentItem: currentItem ? {
            idx: currentItem.idx,
            tipo: safeStr(currentItem.tipo, 80),
            descricao: safeStr(currentItem.descricao, 4000),
            state: currentItem.state,
            timeMs: Number(currentItem.timeMs || 0) || 0
          } : null,
          currentAgendaItem: currentItem ? {
            idx: currentItem.idx,
            tipo: safeStr(currentItem.tipo, 80),
            descricao: safeStr(currentItem.descricao, 4000),
            state: currentItem.state,
            timeMs: Number(currentItem.timeMs || 0) || 0
          } : null,
          vote: voteSum,
          openVote,
          events: (Array.isArray(execDoc.events) ? execDoc.events : []).slice(-50)
        }
      }
    };
  } catch (e) {
    console.error('[assembleia-execution][status] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao carregar status' } };
  }
}