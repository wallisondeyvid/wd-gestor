function buildLegacyReqUser({ user, sessionUser, unidadeId, unidadePrincipalId }) {
  return {
    _id: user._id,
    id: user._id,
    nome: user.nome || sessionUser?.nome || 'Usuário',
    email: user.email,
    role: user.role,
    isMaster: user.role === 'master',
    foto: user.foto || null,
    funcionario_id: user.funcionario_id || null,
    unidade_id: unidadeId,
    unidade_principal_id: unidadePrincipalId,
    funcao: sessionUser?.funcao || null,
  };
}

export async function resolveRequireLoginLegacyHydration({
  user,
  sessionUser,
  maxTimeMS,
  loadUnidadePrincipalLean,
  loadUnidadeLeanById,
} = {}) {
  let unidadeId = user?.unidade_id || null;
  let unidadePrincipalId = null;

  if (user?.role === 'master' && !unidadeId) {
    try {
      const unidadePrincipal = await loadUnidadePrincipalLean({ maxTimeMS });
      if (unidadePrincipal) {
        unidadeId = unidadePrincipal._id;
        unidadePrincipalId = unidadePrincipal._id;
      }
    } catch {}
  } else if (unidadeId) {
    try {
      const unidadeDoc = await loadUnidadeLeanById({ id: unidadeId, maxTimeMS });
      if (unidadeDoc) {
        unidadePrincipalId = unidadeDoc.is_principal ? unidadeDoc._id : (unidadeDoc.unidade_principal_id || null);
      }
    } catch {}
  }

  return {
    kind: 'authenticated',
    reqUser: buildLegacyReqUser({ user, sessionUser, unidadeId, unidadePrincipalId }),
    sessionUserPatch: user?.foto ? { foto: user.foto } : null,
  };
}