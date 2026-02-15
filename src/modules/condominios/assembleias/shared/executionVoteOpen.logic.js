export async function executionVoteOpenLogic({ req, res, shadow = false, deps }) {
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
    if (String(execDoc.sessionStatus) !== 'aberta') {
      return { status: 409, body: { ok: false, error: 'Votação só pode ser aberta com sessão em status "aberta"' } };
    }

    try {
      const agenda = Array.isArray(execDoc.agenda) ? execDoc.agenda : [];
      const item = agenda.find(a => Number(a?.idx) === Number(execDoc.currentAgendaIdx || 0)) || agenda[Number(execDoc.currentAgendaIdx || 0) || 0];
      if (!item || String(item?.state || '') !== 'discutindo') {
        return { status: 409, body: { ok: false, error: 'Votação indisponível: item da pauta não está ativo (inicie a discussão)' } };
      }
    } catch { /* noop */ }

    const idx = Number(execDoc.currentAgendaIdx || 0) || 0;
    const openVote = (execDoc.votes || []).find(v => Number(v?.agendaIdx) === idx && v?.openedAt && !v?.closedAt);
    if (openVote) return { status: 409, body: { ok: false, error: 'Já existe votação aberta para o item atual' } };

    const voteType = safeStr(req.body?.voteType || 'sim_nao_abstencao', 40);
    const ruleType = safeStr(req.body?.ruleType || 'maioria_simples', 40);

    execDoc.votes = Array.isArray(execDoc.votes) ? execDoc.votes : [];
    execDoc.votes.push({
      agendaIdx: idx,
      voteType,
      ruleType,
      openedAt: new Date(),
      closedAt: null,
      ballots: []
    });
    execDoc.sessionStatus = 'em_votacao';

    pushEvent(execDoc, { type: 'vote_opened', message: `Votação aberta (item ${idx + 1})`, actorEmail: safeStr(ctxUser?.email || '') });

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
        action: 'execution.vote.open',
        payload: { agendaIdx: idx, voteType, ruleType }
      });
    }

    return { status: 200, body: { ok: true, data: { agendaIdx: idx, voteType, ruleType } } };
  } catch (e) {
    console.error('[assembleia-execution][vote/open] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao abrir votação' } };
  }
}