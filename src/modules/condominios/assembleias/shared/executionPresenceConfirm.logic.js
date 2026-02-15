export async function executionPresenceConfirmLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    safeStr,
    normalizePresenceKey,
    getOrCreateExecution,
    toObjectOrPlain,
    normalizePresenceRole,
    PRESENCE_ROLE,
    parsePortalUserIdFromPresenceKey,
    CondMorador,
    CondHabitacao,
    CondProprietario,
    CondUsuario,
    verifyPortalPassword,
    finalizePresenceStatus,
    PRESENCE_STATUS,
    hasOtherConfirmedRepresentative,
    pushEvent,
    writeAuditLog,
    getActorSource,
    computeQuorum,
    serializePresence
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const presenceId = safeStr(req.body?.presenceId || '', 80);
    const presenceKey = normalizePresenceKey(req.body?.presenceKey || req.body?.key || '');
    if (!presenceId && !presenceKey) return { status: 400, body: { ok: false, error: 'presenceId ou presenceKey é obrigatório' } };

    const senha = String(req.body?.senha || req.body?.password || '').trim();
    if (!senha) return { status: 400, body: { ok: false, error: 'Senha é obrigatória' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };
    if (String(execDoc.sessionStatus) === 'encerrada') return { status: 409, body: { ok: false, error: 'Assembleia encerrada' } };

    const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
    const idx = pres.findIndex((p) => (presenceId && String(p?.presenceId || '') === presenceId) || (presenceKey && normalizePresenceKey(p?.key) === presenceKey));
    if (idx < 0) return { status: 404, body: { ok: false, error: 'Presença não encontrada' } };

    const prevObj = toObjectOrPlain(pres[idx]);
    const role = normalizePresenceRole(prevObj?.presence_role || 'REPRESENTANTE');
    if (role !== PRESENCE_ROLE.REPRESENTANTE) return { status: 409, body: { ok: false, error: 'Confirmação por PIN só é permitida para representante' } };

    let portalUserId = safeStr(prevObj?.pessoa_id || '', 80);
    if (!portalUserId) portalUserId = parsePortalUserIdFromPresenceKey(prevObj?.key || '');

    const candidateUserIds = [];
    const addCandidateUserId = (v) => {
      const idStr = safeStr(v || '', 80);
      if (!idStr || !mongoose.isValidObjectId(idStr)) return;
      if (!candidateUserIds.includes(idStr)) candidateUserIds.push(idStr);
    };

    addCandidateUserId(portalUserId);

    const habitacaoId = safeStr(prevObj?.habitacao_id || '', 80);
    if (habitacaoId && mongoose.isValidObjectId(habitacaoId)) {
      try {
        const moradores = await CondMorador.find({ habitacao_id: habitacaoId, ativo: { $ne: false } })
          .select('cond_usuario_id')
          .lean()
          .catch(() => []);
        for (const m of (Array.isArray(moradores) ? moradores : [])) {
          addCandidateUserId(m?.cond_usuario_id);
        }

        const habDoc = await CondHabitacao.findById(habitacaoId)
          .select('proprietario_id contrato_locacao.responsavel_morador_id contratos_locacao.responsavel_morador_id')
          .lean()
          .catch(() => null);

        const respMoradorId = safeStr(
          habDoc?.contrato_locacao?.responsavel_morador_id
          || (Array.isArray(habDoc?.contratos_locacao)
            ? (habDoc.contratos_locacao.find((c) => c?.responsavel_morador_id)?.responsavel_morador_id || '')
            : ''),
          80
        );

        if (respMoradorId && mongoose.isValidObjectId(respMoradorId)) {
          const respMorador = await CondMorador.findById(respMoradorId)
            .select('cond_usuario_id')
            .lean()
            .catch(() => null);
          addCandidateUserId(respMorador?.cond_usuario_id);
        }

        if (habDoc?.proprietario_id) {
          const propId = safeStr(habDoc.proprietario_id, 80);
          if (propId && mongoose.isValidObjectId(propId)) {
            const prop = await CondProprietario.findById(propId)
              .select('cond_usuario_id')
              .lean()
              .catch(() => null);
            addCandidateUserId(prop?.cond_usuario_id);
          }
        }
      } catch {
        /* noop */
      }
    }

    if (!candidateUserIds.length) {
      return { status: 400, body: { ok: false, error: 'Usuário do participante não identificado para validação de PIN/senha' } };
    }

    let condUser = null;
    let foundAnyCondUser = false;
    for (const candidateId of candidateUserIds) {
      const user = await CondUsuario.findById(candidateId);
      if (!user) continue;
      foundAnyCondUser = true;
      const okPassCandidate = await verifyPortalPassword(user, senha);
      if (okPassCandidate) {
        condUser = user;
        portalUserId = candidateId;
        break;
      }
    }

    if (!foundAnyCondUser) return { status: 404, body: { ok: false, error: 'Usuário do portal não encontrado' } };
    if (!condUser) return { status: 400, body: { ok: false, error: 'PIN/Senha incorreto' } };

    const now = new Date();
    const participantSnapshot = {
      id: String(condUser?._id || portalUserId),
      nome: safeStr(condUser?.nome || condUser?.name || '', 140) || null,
      email: safeStr(condUser?.email || '', 140) || null,
      source: 'LOCAL_PIN',
      at: now
    };

    const moderatorAt = prevObj?.confirmed_by_moderator_at || null;
    const participantAt = now;
    const status = finalizePresenceStatus({ role, participantAt, moderatorAt });

    if (status === PRESENCE_STATUS.CONFIRMED && hasOtherConfirmedRepresentative(execDoc, {
      habitacaoId: prevObj?.habitacao_id ? String(prevObj.habitacao_id) : '',
      excludePresenceId: safeStr(prevObj?.presenceId || '', 80)
    })) {
      return { status: 409, body: { ok: false, error: 'Já existe representante confirmado para esta habitação nesta assembleia' } };
    }

    const updated = {
      ...prevObj,
      pessoa_id: portalUserId,
      status,
      confirmedAt: status === PRESENCE_STATUS.CONFIRMED ? now : (prevObj?.confirmedAt || null),
      confirmedBy: participantSnapshot,
      confirmed_by_participant_at: participantAt,
      confirm_method: 'LOCAL_PIN',
      updatedAt: now
    };
    pres[idx] = updated;
    execDoc.presences = pres;

    pushEvent(execDoc, {
      type: 'presence_confirmed_participant',
      message: `Presença confirmada por PIN/senha: ${safeStr(prevObj?.nome || '')}`,
      actorEmail: safeStr(ctxUser?.email || '')
    });

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
        action: 'presence_confirmed_participant',
        payload: {
          assemblyId: String(execDoc.assembleia_id),
          presenceId: safeStr(updated?.presenceId || '', 80),
          habitacaoId: updated?.habitacao_id ? String(updated.habitacao_id) : null,
          pessoaId: updated?.pessoa_id ? String(updated.pessoa_id) : null,
          method: 'LOCAL_PIN'
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
            presenceId: safeStr(updated?.presenceId || '', 80),
            habitacaoId: updated?.habitacao_id ? String(updated.habitacao_id) : null,
            pessoaId: updated?.pessoa_id ? String(updated.pessoa_id) : null
          }
        });
      }
    }

    const quorum = computeQuorum(execDoc);
    return { status: 200, body: { ok: true, data: { quorum, presence: serializePresence(updated), presences: execDoc.presences.slice(-200).map((p) => serializePresence(p)) } } };
  } catch (e) {
    console.error('[assembleia-execution][presence/confirm] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao confirmar presença' } };
  }
}