import { isFeatureEnabled, isFlagEnabled } from '#core/config/featureFlags.js';
import {
  loadActiveMembershipsByUserIdData,
  loadUnidadeByIdData,
} from '#modules/gestor/app/data/auth/authContextReadDataFacade.js';

export const GESTOR_AUTH_CONTEXT_RESOLVER_FLAG = 'gestor_auth_context_resolver';
export const AUTH_CONTEXT_SOURCE_LEGACY = 'legacy';
export const AUTH_CONTEXT_SOURCE_V1 = 'auth-context-v1';

/**
 * @typedef {Object} GestorAuthIdentity
 * @property {string|null} id
 * @property {string} email
 * @property {string|null} nome
 * @property {boolean} authenticated
 */

/**
 * @typedef {Object} GestorResolvedMembership
 * @property {string} membershipId
 * @property {string} userId
 * @property {string} unidadeId
 * @property {string|null} unidadePrincipalId
 * @property {string|null} unidadeNome
 * @property {string|null} unidadeCodigo
 * @property {'gestor'|'user'} papelContextual
 * @property {string|null} funcionarioId
 * @property {'active'|'inactive'} status
 * @property {'diretor'|'user'} legacyRole
 */

/**
 * @typedef {Object} GestorActiveContext
 * @property {string} membershipId
 * @property {string} unidadeId
 * @property {string|null} unidadePrincipalId
 * @property {'gestor'|'user'} papelContextual
 * @property {string|null} funcionarioId
 * @property {'diretor'|'user'} legacyRole
 */

/**
 * @typedef {Object} GestorAuthContext
 * @property {boolean} authenticated
 * @property {GestorAuthIdentity} identity
 * @property {'master'|'admin'|null} globalRole
 * @property {GestorResolvedMembership[]} memberships
 * @property {number} membershipCount
 * @property {boolean} needsUnitSelection
 * @property {GestorActiveContext|null} activeContext
 * @property {'master'|'admin'|'diretor'|'user'|null} effectiveRole
 * @property {'legacy'|'auth-context-v1'} source
 */

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }
  if (typeof value === 'object' && value !== null) {
    if (typeof value.toString === 'function') {
      const normalized = String(value).trim();
      return normalized || null;
    }
  }
  return null;
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized;
}

function normalizeGlobalRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'master' || normalized === 'admin') return normalized;
  return null;
}

function normalizeLegacyRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'master' || normalized === 'admin' || normalized === 'diretor' || normalized === 'user') {
    return normalized;
  }
  return null;
}

export function resolveAuthContextUnidadeId(authContext) {
  if (!authContext || typeof authContext !== 'object') return null;

  return normalizeId(
    authContext.active_unidade_id ||
    authContext.activeUnidadeId ||
    authContext.activeContext?.unidadeId
  );
}

export function hasPendingAuthUnitSelection(authContext) {
  if (!authContext || typeof authContext !== 'object') return false;

  const needsSelection = authContext.needs_selection === true || authContext.needsSelection === true;
  const hasActiveContext = Boolean(
    authContext.active_membership_id ||
    authContext.activeMembershipId ||
    authContext.active_unidade_id ||
    authContext.activeUnidadeId ||
    authContext.activeContext
  );
  const hasGlobalRole = Boolean(authContext.global_role || authContext.globalRole);

  return needsSelection && !hasActiveContext && !hasGlobalRole;
}

export function mapPapelContextualToLegacyRole(papelContextual) {
  const normalized = String(papelContextual || '').trim().toLowerCase();
  if (normalized === 'gestor') return 'diretor';
  if (normalized === 'user') return 'user';
  return null;
}

function normalizePapelContextual(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'gestor' || normalized === 'user') return normalized;
  return null;
}

function buildIdentity({ authenticatedUser = null, sessionUser = null } = {}) {
  const id = normalizeId(authenticatedUser?._id || authenticatedUser?.id || sessionUser?.id || sessionUser?._id);
  const email = normalizeEmail(authenticatedUser?.email || sessionUser?.email);
  const nome = String(authenticatedUser?.nome || sessionUser?.nome || '').trim() || null;

  return {
    id,
    email,
    nome,
    authenticated: Boolean(id || email),
  };
}

function createEmptyAuthContext({ source, identity }) {
  return {
    authenticated: false,
    identity,
    globalRole: null,
    memberships: [],
    membershipCount: 0,
    needsUnitSelection: false,
    activeContext: null,
    effectiveRole: null,
    source,
  };
}

function toActiveContext(membership) {
  if (!membership) return null;
  return {
    membershipId: membership.membershipId,
    unidadeId: membership.unidadeId,
    unidadePrincipalId: membership.unidadePrincipalId,
    papelContextual: membership.papelContextual,
    funcionarioId: membership.funcionarioId,
    legacyRole: membership.legacyRole,
  };
}

function resolveSelectedMembership(memberships, existingAuthContext = null) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;

  const selectedMembershipId = normalizeId(
    existingAuthContext?.activeMembershipId || existingAuthContext?.active_membership_id
  );
  const selectedUnidadeId = normalizeId(
    existingAuthContext?.activeUnidadeId || existingAuthContext?.active_unidade_id
  );

  if (selectedMembershipId) {
    const byMembershipId = memberships.find((membership) => membership.membershipId === selectedMembershipId) || null;
    if (byMembershipId) return byMembershipId;
  }

  if (selectedUnidadeId) {
    const byUnidadeId = memberships.find((membership) => membership.unidadeId === selectedUnidadeId) || null;
    if (byUnidadeId) return byUnidadeId;
  }

  if (memberships.length === 1) return memberships[0];
  return null;
}

function buildLegacyAuthContext({ authenticatedUser = null, sessionUser = null, identity }) {
  const globalRole = normalizeGlobalRole(authenticatedUser?.global_role) || normalizeGlobalRole(sessionUser?.global_role);
  const effectiveRole = normalizeLegacyRole(sessionUser?.role || authenticatedUser?.role) || globalRole;
  const unidadeId = normalizeId(sessionUser?.unidade_id || authenticatedUser?.unidade_id);
  const unidadePrincipalId = normalizeId(sessionUser?.unidade_principal_id || authenticatedUser?.unidade_principal_id);
  const funcionarioId = normalizeId(sessionUser?.funcionario_id || authenticatedUser?.funcionario_id);
  const papelContextual = effectiveRole === 'diretor' ? 'gestor' : (effectiveRole === 'user' ? 'user' : null);

  const memberships = papelContextual && unidadeId
    ? [{
        membershipId: 'legacy-active-context',
        userId: identity.id,
        unidadeId,
        unidadePrincipalId,
        unidadeNome: null,
        unidadeCodigo: null,
        papelContextual,
        funcionarioId,
        status: 'active',
        legacyRole: effectiveRole,
      }]
    : [];

  return {
    authenticated: identity.authenticated,
    identity,
    globalRole,
    memberships,
    membershipCount: memberships.length,
    needsUnitSelection: false,
    activeContext: memberships[0] ? toActiveContext(memberships[0]) : null,
    effectiveRole,
    source: AUTH_CONTEXT_SOURCE_LEGACY,
  };
}

function isResolverEnabled(featureFlags = null) {
  if (featureFlags && typeof featureFlags === 'object') {
    return isFeatureEnabled(featureFlags, GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
  }
  return isFlagEnabled(GESTOR_AUTH_CONTEXT_RESOLVER_FLAG, false);
}

async function defaultLoadActiveMembershipsByUserId({ userId, maxTimeMS }) {
  if (!normalizeId(userId)) return [];
  return loadActiveMembershipsByUserIdData({ userId, maxTimeMS });
}

async function defaultLoadUnidadeById({ unidadeId, maxTimeMS }) {
  if (!normalizeId(unidadeId)) return null;
  return loadUnidadeByIdData({ unidadeId, maxTimeMS });
}

async function normalizeMembership(rawMembership, { loadUnidadeById, maxTimeMS }) {
  const membershipId = normalizeId(rawMembership?._id || rawMembership?.membershipId);
  const userId = normalizeId(rawMembership?.user_id || rawMembership?.userId);
  const unidadeId = normalizeId(rawMembership?.unidade_id || rawMembership?.unidadeId);
  const papelContextual = normalizePapelContextual(rawMembership?.papel_contextual || rawMembership?.papelContextual);

  if (!membershipId || !userId || !unidadeId || !papelContextual) return null;

  const unidade = await loadUnidadeById({ unidadeId, maxTimeMS });
  const unidadePrincipalId = unidade
    ? normalizeId(unidade.is_principal ? unidade._id : unidade.unidade_principal_id)
    : null;

  return {
    membershipId,
    userId,
    unidadeId,
    unidadePrincipalId,
    unidadeNome: String(unidade?.nome || '').trim() || null,
    unidadeCodigo: String(unidade?.codigo || '').trim() || null,
    papelContextual,
    funcionarioId: normalizeId(rawMembership?.funcionario_id || rawMembership?.funcionarioId),
    status: 'active',
    legacyRole: mapPapelContextualToLegacyRole(papelContextual),
  };
}

async function normalizeMemberships(rawMemberships, { loadUnidadeById, maxTimeMS }) {
  if (!Array.isArray(rawMemberships) || rawMemberships.length === 0) return [];

  const normalized = [];
  for (const rawMembership of rawMemberships) {
    const membership = await normalizeMembership(rawMembership, { loadUnidadeById, maxTimeMS });
    if (membership) normalized.push(membership);
  }
  return normalized;
}

/**
 * Resolve o estado canônico de AuthContext do Gestor.
 *
 * Quando a feature flag estiver desligada, retorna um snapshot compatível com o legado,
 * sem consultar `user_memberships` e sem alterar comportamento observável do runtime atual.
 *
 * @param {Object} [options]
 * @param {Object|null} [options.authenticatedUser]
 * @param {Object|null} [options.sessionUser]
 * @param {Object|null} [options.existingAuthContext]
 * @param {Object|null} [options.featureFlags]
 * @param {Object} [options.deps]
 * @param {Function} [options.deps.loadActiveMembershipsByUserId]
 * @param {Function} [options.deps.loadUnidadeById]
 * @param {number} [options.maxTimeMS]
 * @returns {Promise<GestorAuthContext>}
 */
export async function resolveGestorAuthContext(options = {}) {
  const {
    authenticatedUser = null,
    sessionUser = null,
    existingAuthContext = null,
    featureFlags = null,
    deps = {},
    maxTimeMS = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 3000),
  } = options;

  const identity = buildIdentity({ authenticatedUser, sessionUser });
  const enabled = isResolverEnabled(featureFlags);
  const source = enabled ? AUTH_CONTEXT_SOURCE_V1 : AUTH_CONTEXT_SOURCE_LEGACY;

  if (!identity.authenticated) {
    return createEmptyAuthContext({ source, identity });
  }

  if (!enabled) {
    return buildLegacyAuthContext({ authenticatedUser, sessionUser, identity });
  }

  const globalRole = normalizeGlobalRole(authenticatedUser?.global_role) || normalizeGlobalRole(sessionUser?.global_role);
  if (globalRole) {
    return {
      authenticated: true,
      identity,
      globalRole,
      memberships: [],
      membershipCount: 0,
      needsUnitSelection: false,
      activeContext: null,
      effectiveRole: globalRole,
      source: AUTH_CONTEXT_SOURCE_V1,
    };
  }

  const loadActiveMembershipsByUserId = deps.loadActiveMembershipsByUserId || defaultLoadActiveMembershipsByUserId;
  const loadUnidadeById = deps.loadUnidadeById || defaultLoadUnidadeById;
  const rawMemberships = identity.id
    ? await loadActiveMembershipsByUserId({ userId: identity.id, maxTimeMS })
    : [];

  const memberships = await normalizeMemberships(rawMemberships, { loadUnidadeById, maxTimeMS });
  const selectedMembership = resolveSelectedMembership(memberships, existingAuthContext);
  const activeContext = toActiveContext(selectedMembership);
  const needsUnitSelection = memberships.length > 1 && !activeContext;

  return {
    authenticated: true,
    identity,
    globalRole: null,
    memberships,
    membershipCount: memberships.length,
    needsUnitSelection,
    activeContext,
    effectiveRole: activeContext?.legacyRole || null,
    source: AUTH_CONTEXT_SOURCE_V1,
  };
}

/**
 * Projeta o contrato legado de `req.session.user` a partir do AuthContext canônico.
 * Esta função não altera sessão; apenas monta o payload derivado para uso futuro.
 *
 * @param {Object} [options]
 * @param {GestorAuthContext|null} [options.authContext]
 * @param {Object|null} [options.sessionUser]
 * @returns {Object|null}
 */
export function projectLegacySessionUserFromAuthContext({ authContext = null, sessionUser = null } = {}) {
  if (!authContext?.authenticated) return null;

  const projected = {
    ...(sessionUser && typeof sessionUser === 'object' ? sessionUser : {}),
    id: authContext.identity.id,
    email: authContext.identity.email,
    role: authContext.effectiveRole,
    unidade_id: authContext.activeContext?.unidadeId || null,
    unidade_principal_id: authContext.activeContext?.unidadePrincipalId || null,
    funcionario_id: authContext.activeContext?.funcionarioId || null,
    global_role: authContext.globalRole,
  };

  if (authContext.source === AUTH_CONTEXT_SOURCE_V1) {
    projected.auth_version = 'phase3';
  }

  return projected;
}

export default resolveGestorAuthContext;