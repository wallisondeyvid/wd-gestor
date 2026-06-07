export async function mutateAuthUnitContextService({
  authenticated = false,
  unidadeId = '',
  session = null,
  resolverOptions = {},
  requirePendingSelection = false,
  deps = {},
} = {}) {
  const {
    resolveAuthContext,
    isValidObjectId,
    findMembershipByUnidadeId,
    loadUnidadeById,
    persistActiveMembershipInSession,
    saveSession,
  } = deps;

  const tryResolvePrivilegedGlobalMembership = async (authContext) => {
    if (!authContext || (authContext?.globalRole !== 'master' && authContext?.globalRole !== 'admin')) {
      return null;
    }

    const unidade = typeof loadUnidadeById === 'function'
      ? await loadUnidadeById({ unidadeId, maxTimeMS: resolverOptions?.maxTimeMS })
      : null;

    if (!unidade) return null;

    const unidadePrincipalId = String(
      unidade.is_principal ? unidade._id : unidade.unidade_principal_id || unidadeId,
    ).trim() || unidadeId;

    return {
      membershipId: `global:${unidadeId}`,
      unidadeId,
      unidadePrincipalId,
      papelContextual: 'gestor',
      funcionarioId: null,
      legacyRole: authContext.globalRole,
    };
  };

  if (!authenticated) {
    const authContext = await resolveAuthContext(resolverOptions);
    return { kind: 'unauthorized', authContext };
  }

  if (!unidadeId || !isValidObjectId(unidadeId)) {
    return { kind: 'invalid-unidade-id', authContext: null };
  }

  const authContext = await resolveAuthContext(resolverOptions);

  if (authContext?.source !== 'auth-context-v1') {
    const selectedPrivilegedMembership = requirePendingSelection
      ? null
      : await tryResolvePrivilegedGlobalMembership(authContext);

    if (!selectedPrivilegedMembership) {
      return { kind: 'resolver-disabled', authContext };
    }

    persistActiveMembershipInSession(session, selectedPrivilegedMembership);
    const resolvedAfterMutation = await resolveAuthContext({
      ...resolverOptions,
      sessionUser: session?.user || resolverOptions?.sessionUser || null,
      existingAuthContext: session?.gestorAuthContext || null,
    });

    persistActiveMembershipInSession(session, selectedPrivilegedMembership, resolvedAfterMutation);
    await saveSession(session);

    return { kind: 'success', authContext: resolvedAfterMutation };
  }

  if (requirePendingSelection && !authContext?.needsUnitSelection) {
    return { kind: 'selection-not-required', authContext };
  }

  let selectedMembership = findMembershipByUnidadeId(authContext, unidadeId);
  if (!selectedMembership) {
    selectedMembership = await tryResolvePrivilegedGlobalMembership(authContext);
  }

  if (!selectedMembership) {
    return { kind: 'unit-not-allowed', authContext };
  }

  persistActiveMembershipInSession(session, selectedMembership);
  const resolvedAfterMutation = await resolveAuthContext({
    ...resolverOptions,
    sessionUser: session?.user || resolverOptions?.sessionUser || null,
    existingAuthContext: session?.gestorAuthContext || null,
  });

  persistActiveMembershipInSession(session, selectedMembership, resolvedAfterMutation);
  await saveSession(session);

  return { kind: 'success', authContext: resolvedAfterMutation };
}