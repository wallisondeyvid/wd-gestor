export function createFuncaoContextPolicyCore({ findUnidadeUserBaseLean } = {}) {
  function normalizeUnitId(value) {
    return String(value || '').trim();
  }

  async function resolvePrincipalUnitId(unidadeId) {
    const unidadeIdNorm = normalizeUnitId(unidadeId);
    if (!unidadeIdNorm) return '';

    const unidade = await findUnidadeUserBaseLean(unidadeIdNorm);
    if (!unidade) return unidadeIdNorm;

    return normalizeUnitId(
      unidade.is_principal
        ? unidade._id
        : unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm,
    );
  }

  async function resolveCanonicalContextPrincipalUnitId({ scopedUnitId } = {}) {
    const scopedUnitIdNorm = normalizeUnitId(scopedUnitId);
    if (!scopedUnitIdNorm) return '';

    return resolvePrincipalUnitId(scopedUnitIdNorm);
  }

  async function ensureRequestedUnitWithinContextCluster({ scopedUnitId, requestedUnitId } = {}) {
    const requestedUnitIdNorm = normalizeUnitId(requestedUnitId);
    if (!requestedUnitIdNorm) {
      return { allowed: true, contextPrincipalUnitId: await resolveCanonicalContextPrincipalUnitId({ scopedUnitId }) };
    }

    const contextPrincipalUnitId = await resolveCanonicalContextPrincipalUnitId({ scopedUnitId });
    if (!contextPrincipalUnitId) {
      return {
        allowed: true,
        contextPrincipalUnitId: '',
        requestedPrincipalUnitId: await resolvePrincipalUnitId(requestedUnitIdNorm),
      };
    }

    const requestedPrincipalUnitId = await resolvePrincipalUnitId(requestedUnitIdNorm);
    return {
      allowed: !!requestedPrincipalUnitId && requestedPrincipalUnitId === contextPrincipalUnitId,
      contextPrincipalUnitId,
      requestedPrincipalUnitId,
    };
  }

  async function buildListScope({ scopedUnitId, unidadeCluster, unidadeIdRaw } = {}) {
    const unidadeClusterNorm = normalizeUnitId(unidadeCluster);
    const unidadeIdRawNorm = normalizeUnitId(unidadeIdRaw);

    if (unidadeClusterNorm) {
      const access = await ensureRequestedUnitWithinContextCluster({
        scopedUnitId,
        requestedUnitId: unidadeClusterNorm,
      });
      if (!access.allowed) {
        return { empty: true, filter: null, mode: 'cluster' };
      }

      const principalUnitId = await resolvePrincipalUnitId(unidadeClusterNorm);
      return {
        empty: !principalUnitId,
        filter: principalUnitId ? { unidade_principal_id: principalUnitId } : null,
        mode: 'cluster',
      };
    }

    if (unidadeIdRawNorm) {
      const resolvedIds = [];

      for (const candidateId of unidadeIdRawNorm.split(',').map((value) => value.trim()).filter(Boolean)) {
        const access = await ensureRequestedUnitWithinContextCluster({
          scopedUnitId,
          requestedUnitId: candidateId,
        });
        if (!access.allowed) continue;

        const principalUnitId = await resolvePrincipalUnitId(candidateId);
        if (principalUnitId) resolvedIds.push(principalUnitId);
      }

      const ids = [...new Set(resolvedIds)];
      if (ids.length === 0) {
        return { empty: true, filter: null, mode: 'unit-list' };
      }

      return {
        empty: false,
        filter: ids.length === 1
          ? { unidade_principal_id: ids[0] }
          : { unidade_principal_id: { $in: ids } },
        mode: 'unit-list',
      };
    }

    return { empty: true, filter: null, mode: 'none' };
  }

  return {
    resolvePrincipalUnitId,
    resolveCanonicalContextPrincipalUnitId,
    ensureRequestedUnitWithinContextCluster,
    buildListScope,
  };
}

export default createFuncaoContextPolicyCore;