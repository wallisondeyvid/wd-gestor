export async function executeUpdateFuncaoCore({
  id,
  nome,
  descricao,
  unidade_principal_id,
  modulos_habilitados,
  contextPrincipalUnitId,
  existente,
  normalizeUnitId,
  requestedUnitWithinContextCluster,
  findOutraFuncaoByNomeExcludingId,
  findUnidadeByIdWithModulosAcessiveis,
  normalizarListaModulos,
  updateFuncaoById,
  findFuncaoByIdLean,
}) {
  const unidadePrincipalExistenteId = normalizeUnitId(existente.unidade_principal_id);
  const targetPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id || unidadePrincipalExistenteId);

  if (nome && nome !== existente.nome) {
    const dup = await findOutraFuncaoByNomeExcludingId(
      id,
      nome,
      targetPrincipalUnitId || unidadePrincipalExistenteId || null,
    );
    if (dup) return { error: 'Já existe uma função com este nome' };
  }

  const updates = {};
  if (nome) updates.nome = nome;
  if (descricao !== undefined) updates.descricao = descricao;

  if (unidade_principal_id && !(await requestedUnitWithinContextCluster(unidade_principal_id))) {
    return { error: 'Unidade principal não encontrada' };
  }

  if (targetPrincipalUnitId) {
    const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
    if (!unidade) return { error: 'Unidade inválida' };

    updates.unidade_principal_id = targetPrincipalUnitId;
    if (modulos_habilitados !== undefined) {
      const lista = normalizarListaModulos(modulos_habilitados);
      const permitidos = new Set((unidade.modulosAcessiveis || []).map(m => String(m._id)));
      updates.modulos_habilitados = lista.filter(moduloId => permitidos.has(String(moduloId)));
    }
  } else if (modulos_habilitados !== undefined) {
    const unidade = await findUnidadeByIdWithModulosAcessiveis(unidadePrincipalExistenteId);
    const lista = normalizarListaModulos(modulos_habilitados);
    const permitidos = new Set((unidade.modulosAcessiveis || []).map(m => String(m._id)));
    updates.modulos_habilitados = lista.filter(moduloId => permitidos.has(String(moduloId)));
  }

  await updateFuncaoById(id, updates, targetPrincipalUnitId || unidadePrincipalExistenteId || null);
  const updated = await findFuncaoByIdLean(id, targetPrincipalUnitId || unidadePrincipalExistenteId || null);
  const nomeFinal = updated?.nome || '';
  const rawDesc = (updated?.descricao && updated.descricao.trim()) ? updated.descricao.trim() : '';
  const codigo = updated?.codigo || '';
  const descricaoDisplay = rawDesc || (nomeFinal && nomeFinal !== codigo ? nomeFinal : '');

  return {
    _id: updated._id,
    codigo,
    nome: nomeFinal,
    descricao: rawDesc,
    descricao_display: descricaoDisplay,
    hasDescricaoReal: !!rawDesc,
  };
}