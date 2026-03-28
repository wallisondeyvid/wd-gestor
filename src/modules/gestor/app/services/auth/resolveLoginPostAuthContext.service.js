import {
  AUTH_CONTEXT_SOURCE_V1,
  projectLegacySessionUserFromAuthContext,
  resolveGestorAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';

function clearStoredAuthContext(session) {
  if (!session || !Object.prototype.hasOwnProperty.call(session, 'gestorAuthContext')) {
    return;
  }

  delete session.gestorAuthContext;
}

function buildStoredGestorAuthContext(authContext) {
  if (!authContext?.authenticated || authContext?.source !== AUTH_CONTEXT_SOURCE_V1) {
    return null;
  }

  return {
    user_id: authContext.identity?.id || null,
    user_email: authContext.identity?.email || '',
    global_role: authContext.globalRole || null,
    active_membership_id: authContext.activeContext?.membershipId || null,
    active_unidade_id: authContext.activeContext?.unidadeId || null,
    active_unidade_principal_id: authContext.activeContext?.unidadePrincipalId || null,
    active_papel_contextual: authContext.activeContext?.papelContextual || null,
    active_funcionario_id: authContext.activeContext?.funcionarioId || null,
    legacy_role: authContext.activeContext?.legacyRole || authContext.effectiveRole || null,
    needs_selection: !!authContext.needsUnitSelection,
  };
}

function classifyResolvedAuthContext(authContext) {
  if (authContext?.source !== AUTH_CONTEXT_SOURCE_V1) return 'legacy';
  if (authContext?.globalRole || authContext?.activeContext) return 'ready';
  if (authContext?.needsUnitSelection) return 'needs-selection';
  return 'no-context';
}

function buildEffectiveLoginUser(user, authContext) {
  if (!authContext || authContext.source !== AUTH_CONTEXT_SOURCE_V1) {
    return user;
  }

  const baseUser = user && typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    ...baseUser,
    role: authContext.effectiveRole || authContext.globalRole || null,
    unidade_id: authContext.activeContext?.unidadeId || null,
    unidade_principal_id: authContext.activeContext?.unidadePrincipalId || null,
    funcionario_id: authContext.activeContext?.funcionarioId || null,
    global_role: authContext.globalRole || null,
  };
}

function projectSessionUser({ authenticatedUser, session, authContext }) {
  const fallbackSessionUser = {
    ...(session?.user && typeof session.user === 'object' ? session.user : {}),
    id: authenticatedUser?._id ? String(authenticatedUser._id) : String(authenticatedUser?.id || ''),
    email: String(authenticatedUser?.email || session?.user?.email || '').trim().toLowerCase(),
  };

  return (
    projectLegacySessionUserFromAuthContext({
      authContext,
      sessionUser: fallbackSessionUser,
    }) || fallbackSessionUser
  );
}

function storeResolvedAuthContext({ authenticatedUser, session, authContext }) {
  if (!session) {
    return null;
  }

  clearStoredAuthContext(session);

  const storedAuthContext = buildStoredGestorAuthContext(authContext);
  if (storedAuthContext) {
    session.gestorAuthContext = storedAuthContext;
  }

  session.user = projectSessionUser({ authenticatedUser, session, authContext });
  return session.user;
}

export async function resolveLoginPostAuthContext({
  authenticatedUser,
  session,
  resolverEnabled = false,
  featureFlags = null,
  deps = undefined,
  maxTimeMS,
} = {}) {
  if (!resolverEnabled) {
    return {
      kind: 'continue',
      effectiveLoginUser: authenticatedUser,
      resolvedAuthContext: null,
    };
  }

  const resolvedAuthContext = await resolveGestorAuthContext({
    authenticatedUser,
    sessionUser: session?.user || null,
    existingAuthContext: session?.gestorAuthContext || null,
    featureFlags,
    deps,
    maxTimeMS,
  });

  const kind = classifyResolvedAuthContext(resolvedAuthContext);

  if (kind === 'no-context') {
    clearStoredAuthContext(session);
    if (session && Object.prototype.hasOwnProperty.call(session, 'user')) {
      delete session.user;
    }

    return {
      kind,
      effectiveLoginUser: authenticatedUser,
      resolvedAuthContext,
    };
  }

  storeResolvedAuthContext({ authenticatedUser, session, authContext: resolvedAuthContext });

  return {
    kind: kind === 'needs-selection' ? 'needs-selection' : 'continue',
    effectiveLoginUser: kind === 'ready'
      ? buildEffectiveLoginUser(authenticatedUser, resolvedAuthContext)
      : authenticatedUser,
    resolvedAuthContext,
  };
}