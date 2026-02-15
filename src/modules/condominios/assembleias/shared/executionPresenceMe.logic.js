export async function executionPresenceMeLogic({ req, res, shadow = false, deps }) {
  const {
    isPortalRequest,
    mustAuth,
    mongoose,
    getOrCreateExecution,
    getPortalPresenceKey,
    getPortalHabitacaoId,
    normalizePresenceKey,
    serializePresence
  } = deps;

  try {
    const fromPortal = isPortalRequest(req);
    if (!fromPortal) return { status: 403, body: { ok: false, error: 'Apenas Portal' } };
    const ctxUser = mustAuth(req, res);
    if (!ctxUser && !req?.skipAuth) return { handled: true };

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) return { status: 400, body: { ok: false, error: 'ID inválido' } };

    const execDoc = await getOrCreateExecution(id);
    if (!execDoc) return { status: 404, body: { ok: false, error: 'Execução não encontrada' } };

    const key = getPortalPresenceKey(ctxUser, req);
    const habitacaoId = getPortalHabitacaoId(ctxUser, req);
    const pres = Array.isArray(execDoc.presences) ? execDoc.presences : [];
    const p = pres.find((x) => {
      const sameKey = normalizePresenceKey(x?.key) === key;
      const sameHab = habitacaoId && String(x?.habitacao_id || '') === habitacaoId;
      return sameKey || sameHab;
    }) || null;

    return {
      status: 200,
      body: {
        ok: true,
        data: p ? serializePresence(p) : null
      }
    };
  } catch (e) {
    console.error('[assembleia-execution][presence/me] erro:', e);
    return { status: 500, body: { ok: false, error: 'Falha ao carregar presença' } };
  }
}