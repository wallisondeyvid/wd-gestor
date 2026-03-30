export async function getFuncoesByUnitCore({
  effectiveUnitId,
  findFuncoesByPrincipalUnitIdLean,
}) {
  const funcoes = await findFuncoesByPrincipalUnitIdLean(effectiveUnitId);

  return funcoes.map((funcao) => {
    const nome = funcao.nome || '';
    const rawDesc = (funcao.descricao && funcao.descricao.trim()) ? funcao.descricao.trim() : '';
    const codigo = funcao.codigo || '';
    const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
    const descricaoFinal = rawDesc || nome || codigo;

    return {
      _id: funcao._id,
      nome,
      codigo,
      descricao: rawDesc,
      descricao_display: descricaoDisplay,
      descricao_final: descricaoFinal,
      hasDescricaoReal: !!rawDesc,
    };
  });
}

export default getFuncoesByUnitCore;