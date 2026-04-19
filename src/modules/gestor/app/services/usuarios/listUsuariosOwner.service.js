import {
  findUsersByQueryLean,
  findAllUnidadesSelectIdCodigoNomeLean,
  findAllFuncionariosSelectIdNomeCpfLean,
  findFuncionariosByUnidadeIdsSelectIdNomeCpfLean,
  findUserMembershipsByUserIdsLean,
  findUserMembershipUserIdsByUnidadeIdsLean,
  findUsersByIdsExcludingMasterLean,
  findUsersByUnidadeIdsExcludingMasterLean,
  findUnidadesByIdsNomeCodigoLean,
  findUnidadeByIdLean,
  findUnidadesByMatrizOuPrincipal,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeId(value) {
  return String(value || '').trim();
}

function buildUnidadeMembershipLabel(unidade) {
  const codigo = String(unidade?.codigo || '').trim();
  const nome = String(unidade?.nome || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return nome || codigo || null;
}

function isGlobalGestorUser(user) {
  return !!(user?.isMaster || user?.role === 'master' || user?.role === 'admin');
}

function getScopedUnitId(req) {
  return normalizeId(req?.unitScope?.unidadeId);
}

async function resolveAllowedUnitIds(req) {
  const scopedUnitId = getScopedUnitId(req);
  if (!scopedUnitId) return [];

  const scopedUnit = await findUnidadeByIdLean(scopedUnitId);
  if (!scopedUnit) return [];

  const principalUnitId = normalizeId(
    scopedUnit?.is_principal
      ? scopedUnit?._id
      : scopedUnit?.unidade_principal_id || scopedUnit?.matriz_id || scopedUnit?._id,
  );

  let allowedUnits = principalUnitId
    ? await findUnidadesByMatrizOuPrincipal(principalUnitId)
    : [];

  if ((!allowedUnits || allowedUnits.length === 0) && scopedUnitId) {
    allowedUnits = [scopedUnit];
  }

  return [...new Set((allowedUnits || []).map((unidade) => normalizeId(unidade?._id)).filter(Boolean))];
}

async function listUsuariosContextuaisService({ allowedUnitIds }) {
  const normalizedUnitIds = [...new Set((allowedUnitIds || []).map((unitId) => normalizeId(unitId)).filter(Boolean))];
  if (normalizedUnitIds.length === 0) return [];

  const [legacyUsers, memberships] = await Promise.all([
    findUsersByUnidadeIdsExcludingMasterLean(normalizedUnitIds),
    findUserMembershipUserIdsByUnidadeIdsLean(normalizedUnitIds),
  ]);

  const membershipUserIds = [...new Set((memberships || []).map((membership) => normalizeId(membership?.user_id)).filter(Boolean))];
  const legacyUserIds = [...new Set((legacyUsers || []).map((user) => normalizeId(user?._id)).filter(Boolean))];
  const userIds = [...new Set([...legacyUserIds, ...membershipUserIds])];

  if (userIds.length === 0) return [];
  return findUsersByIdsExcludingMasterLean(userIds);
}

export async function enrichUsuariosMembershipsSummary(usuarios) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) return usuarios || [];

  const userIds = [...new Set(usuarios.map((usuario) => normalizeId(usuario?._id)).filter(Boolean))];
  if (userIds.length === 0) {
    return usuarios.map((usuario) => ({ ...usuario, membershipsSummary: [], membershipsCount: 0 }));
  }

  const memberships = await findUserMembershipsByUserIdsLean(userIds);
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return usuarios.map((usuario) => ({ ...usuario, membershipsSummary: [], membershipsCount: 0 }));
  }

  const unidadeIds = [...new Set(memberships.map((membership) => normalizeId(membership?.unidade_id)).filter(Boolean))];
  const unidades = unidadeIds.length > 0 ? await findUnidadesByIdsNomeCodigoLean(unidadeIds) : [];
  const unidadesById = new Map(
    (Array.isArray(unidades) ? unidades : []).map((unidade) => [normalizeId(unidade?._id), unidade])
  );
  const membershipsByUserId = new Map();

  memberships.forEach((membership) => {
    const userId = normalizeId(membership?.user_id);
    if (!userId) return;

    const unidadeId = normalizeId(membership?.unidade_id);
    const unidade = unidadesById.get(unidadeId) || null;
    const currentSummary = membershipsByUserId.get(userId) || [];

    currentSummary.push({
      unidade_id: unidadeId,
      unidade_nome: buildUnidadeMembershipLabel(unidade) || unidadeId,
      papel_contextual: String(membership?.papel_contextual || '').trim() || null,
      status: String(membership?.status || '').trim() || null,
      funcionario_id: normalizeId(membership?.funcionario_id) || null,
    });

    membershipsByUserId.set(userId, currentSummary);
  });

  return usuarios.map((usuario) => {
    const membershipsSummary = membershipsByUserId.get(normalizeId(usuario?._id)) || [];
    return {
      ...usuario,
      membershipsSummary,
      membershipsCount: membershipsSummary.length,
    };
  });
}

export async function listUsuariosEnrichedService({ isMaster } = {}) {
  const query = isMaster ? {} : { role: { $ne: 'master' } };
  const usuarios = await findUsersByQueryLean(query);
  return enrichUsuariosMembershipsSummary(usuarios);
}

export async function listUsuariosUnidadesFiltradasService({ isGlobalScope = true, allowedUnitIds = [] } = {}) {
  if (!isGlobalScope) {
    const normalizedUnitIds = [...new Set((allowedUnitIds || []).map((unitId) => normalizeId(unitId)).filter(Boolean))];
    if (normalizedUnitIds.length === 0) return [];
    return findUnidadesByIdsNomeCodigoLean(normalizedUnitIds);
  }

  return findAllUnidadesSelectIdCodigoNomeLean();
}

export async function listUsuariosFuncionariosFiltradosService({ isGlobalScope = true, allowedUnitIds = [] } = {}) {
  if (!isGlobalScope) {
    const normalizedUnitIds = [...new Set((allowedUnitIds || []).map((unitId) => normalizeId(unitId)).filter(Boolean))];
    if (normalizedUnitIds.length === 0) return [];
    return findFuncionariosByUnidadeIdsSelectIdNomeCpfLean(normalizedUnitIds);
  }

  return findAllFuncionariosSelectIdNomeCpfLean();
}

export async function listUsuariosOwnerService({ req = null, isMaster = false, isGlobalScope } = {}) {
  const globalScope = typeof isGlobalScope === 'boolean'
    ? isGlobalScope
    : isGlobalGestorUser(req?.user);
  const allowedUnitIds = globalScope ? [] : await resolveAllowedUnitIds(req);
  const usuariosPromise = globalScope
    ? listUsuariosEnrichedService({ isMaster })
    : listUsuariosContextuaisService({ allowedUnitIds }).then(enrichUsuariosMembershipsSummary);
  const [usuarios, unidadesFiltradas, funcionarios] = await Promise.all([
    usuariosPromise,
    listUsuariosUnidadesFiltradasService({ isGlobalScope: globalScope, allowedUnitIds }),
    listUsuariosFuncionariosFiltradosService({ isGlobalScope: globalScope, allowedUnitIds }),
  ]);

  return {
    kind: 'ok',
    usuarios,
    unidadesFiltradas,
    funcionarios,
  };
}

export function buildUsuariosViewRenderPayload({ user, result } = {}) {
  return {
    usuarios: result?.usuarios || [],
    user: user ?? null,
    unidadesFiltradas: result?.unidadesFiltradas || [],
    funcionarios: result?.funcionarios || [],
  };
}

export default listUsuariosOwnerService;