export async function listarUnidadesService({
  req,
  mongoose,
  getCtxUser,
  userCanScopeAll,
  normalizeObjectIdString,
  getUserUnidadeId,
  resolveUnidadeIdForNonScopedUser,
  listarUnidadesParaUsuario,
  buildUnidadePayload
}) {
  const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
  let ctxUser = getCtxUser(req);
  const canScopeAllUnits = userCanScopeAll(ctxUser);

  if (!canScopeAllUnits) {
    const current = normalizeObjectIdString(getUserUnidadeId(ctxUser));
    if (!current) {
      try {
        const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser, canQueryDb });
        if (resolved) ctxUser = { ...(ctxUser || {}), unidade_id: resolved };
      } catch {
      }
    }
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const payload = (unidadesOptions || []).map(unit => {
    const enriched = buildUnidadePayload(unit);
    if(enriched) return enriched;
    return {
      _id: unit && unit._id ? unit._id : null,
      codigo: unit && unit.codigo || '',
      nome: unit && unit.nome || ''
    };
  });

  return payload;
}