import {
  findUsersByQueryLean,
  findAllUnidadesSelectIdCodigoNomeLean,
  findAllFuncionariosSelectIdNomeCpfLean,
  findUserMembershipsByUserIdsLean,
  findUnidadesByIdsNomeCodigoLean,
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

export async function listUsuariosOwnerService({ isMaster } = {}) {
  const query = isMaster ? {} : { role: { $ne: 'master' } };

  const [usuarios, unidadesFiltradas, funcionarios] = await Promise.all([
    findUsersByQueryLean(query),
    findAllUnidadesSelectIdCodigoNomeLean(),
    findAllFuncionariosSelectIdNomeCpfLean(),
  ]);

  return {
    kind: 'ok',
    usuarios,
    unidadesFiltradas,
    funcionarios,
  };
}

export default listUsuariosOwnerService;