export async function executionPresenceLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    isPortalRequest,
    mustAuth,
    mustControl,
    getOrCreateExecution,
    PRESENCE_ROLE,
    normalizePresenceRole,
    safeStr,
    getPortalHabitacaoId,
    pickUserId,
    getPortalPresenceKey,
    normalizePresenceKey,
    getPortalPresenceNome,
    toObjectOrPlain,
    finalizePresenceStatus,
    newPresenceId,
    PRESENCE_STATUS,
    hasOtherConfirmedRepresentative,
    buildActorSnapshot,
    isPresenceConfirmed,
    pushEvent,
    writeAuditLog,
    getActorSource,
    computeQuorum,
    serializePresence
  } = deps;

  try {
    const fromPortal = isPortalRequest(req);
    const ctxUser = fromPortal ? mustAuth(req, res) : mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };
    if (String(execDoc.sessionStatus) === 'encerrada') return { status: 409, body: { ok: false, error: 'Assembleia encerrada' } };

    const now = new Date();
    const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];

    const roleRaw = fromPortal ? PRESENCE_ROLE.REPRESENTANTE : normalizePresenceRole(req.body?.presence_role || req.body?.role || req.body?.presenceRole || PRESENCE_ROLE.REPRESENTANTE);
    const role = normalizePresenceRole(roleRaw);

    let habitacaoId = safeStr(req.body?.habitacaoId || req.body?.habitacao_id || (fromPortal ? getPortalHabitacaoId(ctxUser, req) : ''), 80);
    const requestedPortalUserId = safeStr(req.body?.portalUserId || req.body?.condUsuarioId || req.body?.userId || '', 80);
    const portalUserId = fromPortal
      ? safeStr(pickUserId(ctxUser, req), 80)
      : (requestedPortalUserId && mongoose.isValidObjectId(requestedPortalUserId) ? requestedPortalUserId : '');

    const key = fromPortal
      ? getPortalPresenceKey(ctxUser, req)
      : normalizePresenceKey(req.body?.presenceKey || req.body?.key || (portalUserId ? `portal:${portalUserId}` : '') || req.body?.nome || req.body?.unidade);
    const nome = fromPortal ? getPortalPresenceNome(ctxUser) : safeStr(req.body?.nome || '', 140);
    const unidadeLabel = safeStr(req.body?.unidadeLabel || req.body?.habitacaoLabel || '', 160);
    const fracaoIdeal = Number(req.body?.fracaoIdeal || 0) || 0;
    const procuracaoPara = safeStr(req.body?.procuracaoPara || '', 140);

    if (!nome) return { status: 400, body: { ok: false, error: 'Nome é obrigatório' } };
    if (role === PRESENCE_ROLE.REPRESENTANTE && !habitacaoId && req?.skipAuth) {
      habitacaoId = safeStr(req.body?.key || req.body?.presenceKey || req.body?.unidade || '', 80);
    }
    if (role === PRESENCE_ROLE.REPRESENTANTE && !habitacaoId) return { status: 400, body: { ok: false, error: 'habitacaoId é obrigatório para representante' } };

    const findIdx = () => {
      if (role === PRESENCE_ROLE.REPRESENTANTE && habitacaoId) {
        const byHab = pres.findIndex((p) => String(p?.habitacao_id || '') === habitacaoId && normalizePresenceRole(p?.presence_role || 'REPRESENTANTE') === PRESENCE_ROLE.REPRESENTANTE);
        if (byHab >= 0) return byHab;
      }
      if (key) {
        const byKey = pres.findIndex((p) => normalizePresenceKey(p?.key) === key);
        if (byKey >= 0) return byKey;
      }
      return -1;
    };

    const idx = findIdx();
    const prevObj = idx >= 0 ? toObjectOrPlain(pres[idx]) : {};

    let participantAt = prevObj?.confirmed_by_participant_at || null;
    let moderatorAt = prevObj?.confirmed_by_moderator_at || null;
    let requestedBy = safeStr(prevObj?.requested_by || '', 40);
    let confirmMethod = safeStr(prevObj?.confirm_method || '', 40);
    let action = '';

    if (role === PRESENCE_ROLE.NAO_REPRESENTANTE) {
      moderatorAt = now;
      participantAt = null;
      requestedBy = 'MODERATOR';
      confirmMethod = 'MODERATOR_CLICK';
      action = 'presence_created_nonrep';
    } else if (fromPortal) {
      participantAt = now;
      requestedBy = 'PARTICIPANT';
      confirmMethod = 'PORTAL';
      action = idx >= 0 ? 'presence_confirmed_participant' : 'presence_requested_participant';
    } else {
      moderatorAt = now;
      requestedBy = 'MODERATOR';
      confirmMethod = 'MODERATOR_CLICK';
      action = 'presence_created_moderator';
    }

    if (req?.skipAuth && role === PRESENCE_ROLE.REPRESENTANTE) {
      participantAt = participantAt || now;
    }

    const status = finalizePresenceStatus({ role, participantAt, moderatorAt });
    const presenceId = safeStr(prevObj?.presenceId || '', 80) || newPresenceId();

    if (role === PRESENCE_ROLE.REPRESENTANTE && status === PRESENCE_STATUS.CONFIRMED) {
      if (hasOtherConfirmedRepresentative(execDoc, { habitacaoId, excludePresenceId: presenceId })) {
        return { status: 409, body: { ok: false, error: 'Já existe representante confirmado para esta habitação nesta assembleia' } };
      }
    }

    const createdBy = prevObj?.createdBy || buildActorSnapshot(ctxUser, req);
    const createdAt = prevObj?.createdAt || now;

    const nextPresence = {
      ...prevObj,
      presenceId,
      key: key || safeStr(prevObj?.key || '', 90) || normalizePresenceKey(`hab:${habitacaoId || presenceId}`),
      nome: nome || safeStr(prevObj?.nome || '', 140),
      unidadeLabel: unidadeLabel || safeStr(prevObj?.unidadeLabel || '', 160),
      source: fromPortal ? 'portal' : safeStr(req.body?.source || prevObj?.source || 'manual', 30),
      status,
      presence_role: role,
      requested_by: requestedBy || (fromPortal ? 'PARTICIPANT' : 'MODERATOR'),
      confirm_method: confirmMethod,
      habitacao_id: habitacaoId && mongoose.isValidObjectId(habitacaoId) ? habitacaoId : (prevObj?.habitacao_id || null),
      pessoa_id: portalUserId && mongoose.isValidObjectId(portalUserId) ? portalUserId : (prevObj?.pessoa_id || null),
      fracaoIdeal: fromPortal ? (Number(prevObj?.fracaoIdeal || 0) || fracaoIdeal) : fracaoIdeal,
      procuracaoPara: fromPortal ? (safeStr(prevObj?.procuracaoPara || '', 140) || procuracaoPara) : procuracaoPara,
      createdAt,
      createdBy,
      confirmedBy: isPresenceConfirmed({ status, presence_role: role }) ? buildActorSnapshot(ctxUser, req) : (prevObj?.confirmedBy || null),
      confirmed_by_participant_at: participantAt,
      confirmed_by_moderator_at: moderatorAt,
      confirmedAt: status === PRESENCE_STATUS.CONFIRMED ? now : (prevObj?.confirmedAt || null),
      updatedAt: now
    };

    if (idx >= 0) pres[idx] = nextPresence;
    else pres.push(nextPresence);
    execDoc.presences = pres;

    if (status === PRESENCE_STATUS.CONFIRMED && action !== 'presence_created_nonrep') {
      pushEvent(execDoc, { type: 'presence_confirmed_final', message: `Presença confirmada: ${nextPresence.nome}`, actorEmail: safeStr(ctxUser?.email || '') });
    } else {
      pushEvent(execDoc, { type: 'presence_updated', message: `Presença atualizada: ${nextPresence.nome} (${status})`, actorEmail: safeStr(ctxUser?.email || '') });
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
        action,
        payload: {
          assemblyId: String(execDoc.assembleia_id),
          presenceId,
          habitacaoId: nextPresence.habitacao_id ? String(nextPresence.habitacao_id) : null,
          pessoaId: nextPresence.pessoa_id ? String(nextPresence.pessoa_id) : null,
          role,
          status,
          requestedBy: requestedBy || null
        }
      });

      if (status === PRESENCE_STATUS.CONFIRMED) {
        await writeAuditLog({
          req,
          ctxUser,
          source: getActorSource(req),
          unidadeId: execDoc.unidade_id,
          assembleiaId: execDoc.assembleia_id,
          entityType: 'assembleia_execution',
          entityId: execDoc._id,
          action: 'presence_confirmed_final',
          payload: {
            assemblyId: String(execDoc.assembleia_id),
            presenceId,
            habitacaoId: nextPresence.habitacao_id ? String(nextPresence.habitacao_id) : null,
            pessoaId: nextPresence.pessoa_id ? String(nextPresence.pessoa_id) : null,
            role
          }
        });
      }
    }

    const quorum = computeQuorum(execDoc);
    return { status: 200, body: { ok: true, data: { quorum, presence: serializePresence(nextPresence), presences: execDoc.presences.slice(-200).map((p) => serializePresence(p)) } } };
  } catch (e) {
    console.error('[assembleia-execution][presence] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao registrar presença' } };
  }
}