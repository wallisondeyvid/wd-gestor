function normalizeSetorNome(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function processCreateSetorCore({
  nome,
  descricao,
  canonicalUnitId,
  findSetorByUnidadeAndNomeNormalizadoLean,
  createSetorDb,
}) {
  const nomeNormalizado = normalizeSetorNome(nome);
  const existing = await findSetorByUnidadeAndNomeNormalizadoLean(canonicalUnitId, nomeNormalizado);
  if (existing) {
    return { error: 'duplicate_name', duplicateId: existing._id };
  }

  return createSetorDb({
    nome,
    nome_normalizado: nomeNormalizado,
    descricao,
    unidade_id: canonicalUnitId,
  });
}

export default processCreateSetorCore;