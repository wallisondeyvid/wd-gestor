export async function listSetoresCore({
  filtro,
  findSetoresByFiltroPopulateUnidadeLean,
  findUnidadesByIdsNomeCodigoLean,
}) {
  const setores = await findSetoresByFiltroPopulateUnidadeLean(filtro);

  let needsLookup = setores.some((setor) => setor.unidade_id && typeof setor.unidade_id === 'string');
  const unidadeIdsRaw = new Set();
  if (needsLookup) {
    setores.forEach((setor) => {
      if (setor.unidade_id && typeof setor.unidade_id === 'string') {
        unidadeIdsRaw.add(setor.unidade_id);
      }
    });
  }

  let unidadesMap = {};
  if (unidadeIdsRaw.size) {
    const unidadesDB = await findUnidadesByIdsNomeCodigoLean(Array.from(unidadeIdsRaw));
    unidadesDB.forEach((unidade) => {
      unidadesMap[String(unidade._id)] = unidade;
    });
  }

  return setores.map((setor) => {
    let unidade_nome = '';
    let unidade_label = '';
    let unidade_id_raw = null;

    if (setor.unidade_id) {
      if (typeof setor.unidade_id === 'object' && setor.unidade_id !== null) {
        const codigo = setor.unidade_id.codigo || '';
        const nome = setor.unidade_id.nome || '';
        unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
        unidade_nome = unidade_label;
        unidade_id_raw = setor.unidade_id._id || null;
      } else if (typeof setor.unidade_id === 'string') {
        unidade_id_raw = setor.unidade_id;
        const unidade = unidadesMap[setor.unidade_id];
        if (unidade) {
          const codigo = unidade.codigo || '';
          const nome = unidade.nome || '';
          unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
          unidade_nome = unidade_label;
        }
      }
    }

    return { ...setor, unidade_nome, unidade_label, unidade_id_raw };
  });
}

export default listSetoresCore;