export async function processCreateFuncaoCore({
  nome,
  descricao,
  canonicalPrincipalUnitId,
  modulosHabilitados,
  findFuncaoByNome,
  findUnidadeByIdWithModulosAcessiveis,
  normalizarListaModulos,
  createFuncaoDb,
}) {
  const dup = await findFuncaoByNome(nome, canonicalPrincipalUnitId);
  if (dup) {
    return { error: 'Função já cadastrada' };
  }

  const unidade = await findUnidadeByIdWithModulosAcessiveis(canonicalPrincipalUnitId);
  if (!unidade) {
    return { error: 'Unidade inválida' };
  }

  const lista = normalizarListaModulos(modulosHabilitados);
  const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
  const modsFiltrados = lista.filter((id) => permitidos.has(String(id)));

  return createFuncaoDb({
    nome,
    descricao,
    unidade_principal_id: canonicalPrincipalUnitId,
    modulos_habilitados: modsFiltrados,
  });
}

export default processCreateFuncaoCore;