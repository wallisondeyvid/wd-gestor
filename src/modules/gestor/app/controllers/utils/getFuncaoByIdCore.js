export async function getFuncaoByIdCore({
  id,
  contextPrincipalUnitId,
  findFuncaoByIdPopulated,
}) {
  const funcao = await findFuncaoByIdPopulated(id, contextPrincipalUnitId || null);
  if (!funcao) {
    return null;
  }

  return {
    _id: funcao._id,
    nome: funcao.nome,
    descricao: funcao.descricao || '',
    unidade_principal_id: funcao.unidade_principal_id ? funcao.unidade_principal_id._id : null,
    modulos_habilitados: (funcao.modulos_habilitados || []).map((modulo) => ({
      _id: modulo._id,
      nome: modulo.nome,
    })),
  };
}

export default getFuncaoByIdCore;