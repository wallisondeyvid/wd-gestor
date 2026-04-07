import {
  findUserByEmail,
  findUserMembershipsByUserIdsLean,
  findUnidadesByIdsNomeCodigoLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeEntityId(value) {
  return String(value || '').trim();
}

function buildUnidadeSummaryLabel(unidade) {
  const codigo = String(unidade?.codigo || '').trim();
  const nome = String(unidade?.nome || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return nome || codigo || null;
}

export async function checkUsuarioEmailOwnerService({ email } = {}) {
  const user = await findUserByEmail(email);
  if (!user) {
    return {
      kind: 'ok',
      email,
      exists: false,
      user: null,
      membershipsCount: 0,
      membershipsSummary: [],
      linkedUnidadeIds: [],
      blockedUnidadeIds: [],
    };
  }

  const normalizedUserId = normalizeEntityId(user._id);
  const memberships = await findUserMembershipsByUserIdsLean([normalizedUserId]);
  const unidadeIds = [...new Set((Array.isArray(memberships) ? memberships : []).map((membership) => normalizeEntityId(membership?.unidade_id)).filter(Boolean))];
  const unidades = unidadeIds.length > 0
    ? await findUnidadesByIdsNomeCodigoLean(unidadeIds)
    : [];
  const unidadesById = new Map(
    (Array.isArray(unidades) ? unidades : []).map((unidade) => [normalizeEntityId(unidade?._id), unidade])
  );
  const membershipsSummary = (Array.isArray(memberships) ? memberships : []).map((membership) => {
    const unidadeId = normalizeEntityId(membership?.unidade_id);
    const unidade = unidadesById.get(unidadeId) || null;
    return {
      unidade_id: unidadeId,
      unidade_nome: buildUnidadeSummaryLabel(unidade) || unidadeId,
      papel_contextual: String(membership?.papel_contextual || '').trim() || null,
      status: String(membership?.status || '').trim() || null,
      funcionario_id: normalizeEntityId(membership?.funcionario_id) || null,
    };
  });
  const linkedUnidadeIds = [...new Set(membershipsSummary.map((membership) => membership.unidade_id).filter(Boolean))];

  return {
    kind: 'ok',
    email,
    exists: true,
    user: {
      id: String(user._id),
      nome: String(user.nome || '').trim() || null,
      cpf: String(user.cpf || '').trim() || null,
      role: String(user.role || '').trim() || null,
      global_role: String(user.global_role || '').trim() || null,
      unidade_id: normalizeEntityId(user.unidade_id) || null,
      funcionario_id: normalizeEntityId(user.funcionario_id) || null,
      ativo: user.ativo !== false,
    },
    membershipsCount: membershipsSummary.length,
    membershipsSummary,
    linkedUnidadeIds,
    blockedUnidadeIds: linkedUnidadeIds,
  };
}

export default checkUsuarioEmailOwnerService;