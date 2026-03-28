import { resolveGestorAuthContext } from '#modules/gestor/app/services/authContextResolver.js';

function buildUsuarioAuthContextExtras(authContext) {
  if (!authContext || authContext.source !== 'auth-context-v1') {
    return null;
  }

  return {
    authenticated: !!authContext.authenticated,
    source: authContext.source,
    globalRole: authContext.globalRole || null,
    effectiveRole: authContext.effectiveRole || null,
    needsUnitSelection: !!authContext.needsUnitSelection,
    membershipCount: Number(authContext.membershipCount || 0),
    activeContext: authContext.activeContext
      ? {
          membershipId: authContext.activeContext.membershipId,
          unidadeId: authContext.activeContext.unidadeId,
          unidadePrincipalId: authContext.activeContext.unidadePrincipalId || null,
          papelContextual: authContext.activeContext.papelContextual || null,
          funcionarioId: authContext.activeContext.funcionarioId || null,
          legacyRole: authContext.activeContext.legacyRole || null,
        }
      : null,
    membershipsSummary: Array.isArray(authContext.memberships)
      ? authContext.memberships.map((membership) => ({
          membershipId: membership.membershipId,
          unidadeId: membership.unidadeId,
          unidadePrincipalId: membership.unidadePrincipalId || null,
          unidadeNome: membership.unidadeNome || null,
          unidadeCodigo: membership.unidadeCodigo || null,
          papelContextual: membership.papelContextual || null,
          legacyRole: membership.legacyRole || null,
        }))
      : [],
  };
}

export async function resolveUsuarioAtualAuthContextExtras({
  baseUser = null,
  sessionUser = null,
  existingAuthContext = null,
  featureFlags = null,
  resolverDeps = undefined,
  maxTimeMS = undefined,
  deps = {},
} = {}) {
  const resolveAuthContext = deps.resolveAuthContext || resolveGestorAuthContext;

  const authContext = await resolveAuthContext({
    authenticatedUser: baseUser,
    sessionUser,
    existingAuthContext,
    featureFlags,
    deps: resolverDeps,
    maxTimeMS,
  });

  return buildUsuarioAuthContextExtras(authContext);
}

export default resolveUsuarioAtualAuthContextExtras;