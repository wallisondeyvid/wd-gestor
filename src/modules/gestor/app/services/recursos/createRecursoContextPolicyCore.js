export function createRecursoContextPolicyCore({ findUnidadeUserBaseLean, findUnidadesByCondLean } = {}) {
  function normalizeUnitId(value) {
    return String(value || '').trim();
  }

  function isMasterOrAdmin(currentUser) {
    return !!(currentUser?.isMaster || currentUser?.role === 'admin');
  }

  function resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId } = {}) {
      return normalizeUnitId(scopedUnitId);
  }

  function shouldBlockForMissingContext({ currentUser, sessionUser, scopedUnitId } = {}) {
    return !isMasterOrAdmin(currentUser || null) && !resolveCanonicalContextUnitId({
      currentUser,
      sessionUser,
      scopedUnitId,
    });
  }

  function ensureRequestedUnitAccess({ currentUser, sessionUser, scopedUnitId, requestedUnitId } = {}) {
    const requested = normalizeUnitId(requestedUnitId);
    const canonicalContextUnitId = resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId });

    if (!requested) {
      return { allowed: true, canonicalContextUnitId: canonicalContextUnitId || null };
    }

    if (isMasterOrAdmin(currentUser || null)) {
      return {
        allowed: true,
        canonicalContextUnitId: canonicalContextUnitId || null,
        effectiveUnitId: requested,
      };
    }

    if (!canonicalContextUnitId) {
      return {
        allowed: false,
        blocked: true,
        error: 'missing_context',
        canonicalContextUnitId: null,
      };
    }

    if (canonicalContextUnitId !== requested) {
      return {
        allowed: false,
        error: 'out_of_scope',
        canonicalContextUnitId,
      };
    }

    return {
      allowed: true,
      canonicalContextUnitId,
      effectiveUnitId: requested,
    };
  }

  async function buildListScope({ currentUser, sessionUser, scopedUnitId, requestedUnitId } = {}) {
    const requested = normalizeUnitId(requestedUnitId);
    const canonicalContextUnitId = resolveCanonicalContextUnitId({ currentUser, sessionUser, scopedUnitId });

    if (shouldBlockForMissingContext({ currentUser, sessionUser, scopedUnitId })) {
      return { blocked: true, filter: null, canonicalContextUnitId: null };
    }

    if (isMasterOrAdmin(currentUser || null)) {
      return {
        blocked: false,
        filter: requested ? { unidade_id: requested } : {},
        canonicalContextUnitId: canonicalContextUnitId || null,
      };
    }

    const anchorUnitId = canonicalContextUnitId;
    const unidadeAnchor = anchorUnitId ? await findUnidadeUserBaseLean(anchorUnitId) : null;
    const principalId = unidadeAnchor
      ? String(
          unidadeAnchor.is_principal
            ? unidadeAnchor._id
            : (unidadeAnchor.unidade_principal_id || unidadeAnchor.matriz_id || unidadeAnchor._id || anchorUnitId)
        )
      : anchorUnitId;
    const cond = principalId
      ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId }] }
      : { _id: anchorUnitId || null };
    const unidadesAcessiveis = await findUnidadesByCondLean(cond);
    const allowedUnitIds = unidadesAcessiveis.map((unidade) => String(unidade._id));

    if (requested) {
      if (!allowedUnitIds.includes(requested)) {
        return {
          blocked: false,
          empty: true,
          filter: null,
          canonicalContextUnitId: anchorUnitId || null,
          allowedUnitIds,
        };
      }

      return {
        blocked: false,
        filter: { unidade_id: requested },
        canonicalContextUnitId: anchorUnitId || null,
        allowedUnitIds,
      };
    }

    return {
      blocked: false,
      filter: { unidade_id: { $in: allowedUnitIds } },
      canonicalContextUnitId: anchorUnitId || null,
      allowedUnitIds,
    };
  }

  return {
    resolveCanonicalContextUnitId,
    shouldBlockForMissingContext,
    ensureRequestedUnitAccess,
    buildListScope,
  };
}

export default createRecursoContextPolicyCore;