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

  const selectedMembership = findMembershipByUnidadeId(authContext, unidadeId);
  if (!selectedMembership) {
    return { kind: 'unit-not-allowed', authContext };
  }

  persistActiveMembershipInSession(session, selectedMembership);
  await saveSession(session);

  const resolvedAfterMutation = await resolveAuthContext({
    ...resolverOptions,
    existingAuthContext: session?.gestorAuthContext || null,
  });

  return { kind: 'success', authContext: resolvedAfterMutation };
}