export async function executionPresenceConfirmModeratorLogic({ req, res, shadow = false, deps }) {
  const {
    mongoose,
    mustControl,
    getOrCreateExecution,
    toObjectOrPlain,
    normalizePresenceRole,
    PRESENCE_ROLE,
    finalizePresenceStatus,
    PRESENCE_STATUS,
    hasOtherConfirmedRepresentative,
    safeStr,
    buildActorSnapshot,
    pushEvent,
    writeAuditLog,
    getActorSource,
    computeQuorum,
    serializePresence
  } = deps;

  try {
    const ctxUser = mustControl(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id, presenceId } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };
    if (!presenceId) return { status: 400, body: { ok: false, error: 'presenceId é obrigatório' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };
    if (String(execDoc.sessionStatus) === 'encerrada') return { status: 409, body: { ok: false, error: 'Assembleia encerrada' } };

    const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
    const idx = pres.findIndex((p) => String(p?.presenceId || '') === String(presenceId));
    if (idx < 0) return { status: 404, body: { ok: false, error: 'Presença não encontrada' } };

    const prevObj = toObjectOrPlain(pres[idx]);
    const role = normalizePresenceRole(prevObj?.presence_role || 'REPRESENTANTE');
    if (role !== PRESENCE_ROLE.REPRESENTANTE) return { status: 409, body: { ok: false, error: 'Ação permitida apenas para representante' } };

    const now = new Date();
    const participantAt = prevObj?.confirmed_by_participant_at || null;
    const moderatorAt = now;
    const status = finalizePresenceStatus({ role, participantAt, moderatorAt });

    if (status === PRESENCE_STATUS.CONFIRMED && hasOtherConfirmedRepresentative(execDoc, {
      habitacaoId: prevObj?.habitacao_id ? String(prevObj.habitacao_id) : '',
      excludePresenceId: safeStr(prevObj?.presenceId || '', 80)
    })) {
      return { status: 409, body: { ok: false, error: 'Já existe representante confirmado para esta habitação nesta assembleia' } };
    }

    const updated = {
      ...prevObj,
      status,
      requested_by: prevObj?.requested_by || 'PARTICIPANT',
      confirm_method: 'MODERATOR_CLICK',
      confirmed_by_moderator_at: moderatorAt,
      confirmedAt: status === PRESENCE_STATUS.CONFIRMED ? now : (prevObj?.confirmedAt || null),
      confirmedBy: buildActorSnapshot(ctxUser, req),
      updatedAt: now
    };
    pres[idx] = updated;
    execDoc.presences = pres;

    pushEvent(execDoc, {
      type: 'presence_confirmed_moderator',
      message: `Presença validada pelo moderador: ${safeStr(updated?.nome || '')}`,
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
        action: 'presence_confirmed_moderator',
        payload: {
          assemblyId: String(execDoc.assembleia_id),
          presenceId: safeStr(updated?.presenceId || '', 80),
          habitacaoId: updated?.habitacao_id ? String(updated.habitacao_id) : null,
          pessoaId: updated?.pessoa_id ? String(updated.pessoa_id) : null
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
    console.error('[assembleia-execution][confirmar-moderador] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao confirmar presença pelo moderador' } };
  }
}