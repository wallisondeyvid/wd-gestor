export function createAuthContextOrchestrationCore({
  resolveLoginPostAuthContext,
  resolveAuthContext,
  mutateAuthUnitContextService,
} = {}) {
  async function resolveLoginAuthContext({
    authenticatedUser,
    session,
    resolverEnabled,
    featureFlags,
    resolverDeps,
    maxTimeMS,
  } = {}) {
    return resolveLoginPostAuthContext({
      authenticatedUser,
      session,
      resolverEnabled,
      featureFlags,
      deps: resolverDeps,
      maxTimeMS,
    });
  }

  async function resolveCurrentAuthContext({ resolverOptions } = {}) {
    return resolveAuthContext(resolverOptions);
  }

  async function mutateActiveUnitContext({
    authenticated,
    unidadeId,
    session,
    resolverOptions,
    requirePendingSelection,
    mutationDeps,
  } = {}) {
    return mutateAuthUnitContextService({
      authenticated,
      unidadeId,
      session,
      resolverOptions,
      requirePendingSelection,
      deps: mutationDeps,
    });
  }

  return {
    resolveLoginAuthContext,
    resolveCurrentAuthContext,
    mutateActiveUnitContext,
  };
}

export default createAuthContextOrchestrationCore;