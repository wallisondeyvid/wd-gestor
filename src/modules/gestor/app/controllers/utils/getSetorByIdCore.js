export async function getSetorByIdCore({
  id,
  canonicalUnitId,
  findSetorByIdPopulateUnidade,
}) {
  const setor = await findSetorByIdPopulateUnidade(id, canonicalUnitId || null);
  if (!setor) return null;

  return {
    _id: setor._id,
    nome: setor.nome,
    descricao: setor.descricao || '',
    unidade_id: setor.unidade_id ? setor.unidade_id._id : null,
  };
}

export default getSetorByIdCore;