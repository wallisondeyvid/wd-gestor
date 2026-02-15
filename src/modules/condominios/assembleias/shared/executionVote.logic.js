export async function executionVoteLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    isPortalRequest,
    mustAuth,
    mustControl,
    getOrCreateExecution,
    normalizePresenceKey,
    getPortalPresenceKey,
    safeStr,
    normalizePresenceRole,
    normalizePresenceStatus,
    PRESENCE_ROLE,
    PRESENCE_STATUS,
    pushEvent,
    writeAuditLog,
    voteSummary
  } = deps;

  try {
    const fromPortal = isPortalRequest(req);
    const ctxUser = fromPortal ? mustAuth(req, res) : mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    if (String(execDoc.sessionStatus) !== 'em_votacao') {
      return { status: 409, body: { ok: false, error: 'Votação indisponível: sessão não está em votação' } };
    }

    const idx = Number(execDoc.currentAgendaIdx || 0) || 0;
    const vote = (execDoc.votes || []).find(v => Number(v?.agendaIdx) === idx && v?.openedAt && !v?.closedAt);
    if (!vote) return { status: 409, body: { ok: false, error: 'Nenhuma votação aberta para o item atual' } };

    const presenceKey = fromPortal
      ? (normalizePresenceKey(req.body?.presenceKey || '') || getPortalPresenceKey(ctxUser, req))
      : normalizePresenceKey(req.body?.presenceKey || req.body?.key || '');
    if (!presenceKey) return { status: 400, body: { ok: false, error: 'presenceKey é obrigatório' } };

    const choiceRaw = String(req.body?.choice || '').trim().toLowerCase();
    const choice = (choiceRaw === 'sim' || choiceRaw === 'nao' || choiceRaw === 'abstencao') ? choiceRaw : '';
    if (!choice) return { status: 400, body: { ok: false, error: 'Voto inválido' } };

    const source = fromPortal ? 'portal' : safeStr(req.body?.source || 'mesa', 20);

    const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
    let p = pres.find(x => normalizePresenceKey(x?.key) === presenceKey);

    if (!p) {
      return { status: 409, body: { ok: false, error: 'Voto não permitido: presença não encontrada' } };
    }

    const pRole = normalizePresenceRole(p?.presence_role || p?.role || 'REPRESENTANTE');
    const pStatus = normalizePresenceStatus(p?.status, pRole);
    if (pRole !== PRESENCE_ROLE.REPRESENTANTE || pStatus !== PRESENCE_STATUS.CONFIRMED) {
      return { status: 409, body: { ok: false, error: 'Voto não permitido: apenas representante confirmado pode votar' } };
    }

    vote.ballots = Array.isArray(vote.ballots) ? vote.ballots : [];
    const existingIdx = vote.ballots.findIndex(b => normalizePresenceKey(b?.presenceKey) === presenceKey);
    const ballot = {
      presenceKey,
      choice,
      source,
      fracaoIdeal: Number(p?.fracaoIdeal || 0) || 0,
      castAt: new Date()
    };
    if (existingIdx >= 0) vote.ballots[existingIdx] = ballot;
    else vote.ballots.push(ballot);

    pushEvent(execDoc, { type: 'vote_cast', message: `Voto registrado (item ${idx + 1})`, actorEmail: safeStr(ctxUser?.email || '') });

    if (!shadow) {
      await execDoc.save();
      await writeAuditLog({
        req,
        ctxUser,
        source,
        unidadeId: execDoc.unidade_id,
        assembleiaId: execDoc.assembleia_id,
        entityType: 'assembleia_execution',
        entityId: execDoc._id,
        action: 'execution.vote.cast',
        payload: { agendaIdx: idx, presenceKey, choice, source }
      });
    }

    return { status: 200, body: { ok: true, data: voteSummary(vote, execDoc) } };
  } catch (e) {
    console.error('[assembleia-execution][vote] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao registrar voto' } };
  }
}