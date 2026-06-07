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

  if (!authenticated) {
    const authContext = await resolveAuthContext(resolverOptions);
    return { kind: 'unauthorized', authContext };
  }

  if (!unidadeId || !isValidObjectId(unidadeId)) {
    return { kind: 'invalid-unidade-id', authContext: null };
  }

  const authContext = await resolveAuthContext(resolverOptions);

  if (authContext?.source !== 'auth-context-v1') {
    return { kind: 'resolver-disabled', authContext };
  }

  if (requirePendingSelection && !authContext?.needsUnitSelection) {
    return { kind: 'selection-not-required', authContext };
  }

  let selectedMembership = findMembershipByUnidadeId(authContext, unidadeId);
  if (!selectedMembership && (authContext?.globalRole === 'master' || authContext?.globalRole === 'admin')) {
    const unidade = typeof loadUnidadeById === 'function'
      ? await loadUnidadeById({ unidadeId, maxTimeMS: resolverOptions?.maxTimeMS })
      : null;

    if (unidade) {
      const unidadePrincipalId = String(
        unidade.is_principal ? unidade._id : unidade.unidade_principal_id || unidadeId,
      ).trim() || unidadeId;

      selectedMembership = {
        membershipId: `global:${unidadeId}`,
        unidadeId,
        unidadePrincipalId,
        papelContextual: 'gestor',
        funcionarioId: null,
        legacyRole: authContext.globalRole,
      };
    }
  }

  if (!selectedMembership) {
    return { kind: 'unit-not-allowed', authContext };
  }

  persistActiveMembershipInSession(session, selectedMembership);
  const resolvedAfterMutation = await resolveAuthContext({
    ...resolverOptions,
    existingAuthContext: session?.gestorAuthContext || null,
  });

  persistActiveMembershipInSession(session, selectedMembership, resolvedAfterMutation);
  await saveSession(session);

  return { kind: 'success', authContext: resolvedAfterMutation };
}