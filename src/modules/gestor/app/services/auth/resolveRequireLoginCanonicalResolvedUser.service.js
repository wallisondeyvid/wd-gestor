import {
  AUTH_CONTEXT_SOURCE_V1,
  projectLegacySessionUserFromAuthContext,
  resolveGestorAuthContext,
} from '#modules/gestor/app/services/authContextResolver.js';

function buildReqUserFromProjectedSessionUser(sessionUser) {
  const role = sessionUser?.role || 'user';

  return {
    _id: sessionUser?.id || null,
    id: sessionUser?.id || null,
    nome: sessionUser?.nome || 'Usuário',
    email: sessionUser?.email || '',
    role,
    global_role: sessionUser?.global_role || null,
    isMaster: role === 'master',
    foto: sessionUser?.foto || null,
    funcionario_id: sessionUser?.funcionario_id || null,
    unidade_id: sessionUser?.unidade_id || null,
    unidade_principal_id: sessionUser?.unidade_principal_id || null,
    funcao: sessionUser?.funcao || null,
  };
}

export async function resolveRequireLoginCanonicalResolvedUser({
  user,
  sessionUser,
  existingAuthContext,
  featureFlags = null,
  deps = {},
  maxTimeMS,
} = {}) {
  const resolvedAuthContext = await resolveGestorAuthContext({
    authenticatedUser: user,
    sessionUser,
    existingAuthContext,
    featureFlags,
    deps,
    maxTimeMS,
  });

  const hasCanonicalProjection = (
    resolvedAuthContext?.source === AUTH_CONTEXT_SOURCE_V1 &&
    resolvedAuthContext?.authenticated === true
  );

  if (!hasCanonicalProjection) {
    return { kind: 'continue' };
  }

  const projectedSessionUser = projectLegacySessionUserFromAuthContext({
    authContext: resolvedAuthContext,
    sessionUser: {
      ...(sessionUser || {}),
      nome: user?.nome || sessionUser?.nome || 'Usuário',
      foto: user?.foto || sessionUser?.foto || null,
      funcao: sessionUser?.funcao || null,
    },
  });

  if (!projectedSessionUser) {
    return { kind: 'continue' };
  }

  return {
    kind: 'authenticated',
    sessionUser: projectedSessionUser,
    reqUser: buildReqUserFromProjectedSessionUser(projectedSessionUser),
  };
}