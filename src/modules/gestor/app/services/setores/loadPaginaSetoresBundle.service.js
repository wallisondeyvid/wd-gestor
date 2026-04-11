import {
  findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean,
  findUnidadesForSetorPageSelectLean,
  findUnidadesForSetorPageByIdsSelectLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function loadPaginaSetoresBundle({
  req,
  scopedUnitId,
  privilegedUser,
  loadScopedUnidadeForPage,
}) {
  if (scopedUnitId) {
    const [unidadeContextual, setoresFiltrados] = await Promise.all([
      loadScopedUnidadeForPage(req),
      findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({ ativo: true, unidade_id: scopedUnitId }),
    ]);

    return {
      setoresFiltrados,
      unidadesFiltradas: unidadeContextual ? [unidadeContextual] : [],
      user: req.user,
    };
  }

  if (!privilegedUser) {
    return {
      setoresFiltrados: [],
      unidadesFiltradas: [],
      user: req.user,
    };
  }

  let unidadesFiltradas = await findUnidadesForSetorPageSelectLean();
  let setoresFiltrados = await findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({ ativo: true });

  if (!setoresFiltrados || setoresFiltrados.length === 0) {
    setoresFiltrados = await findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({});

    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && setoresFiltrados?.length) {
      const uids = [...new Set(setoresFiltrados.map((setor) => String(setor.unidade_id?._id || setor.unidade_id)).filter(Boolean))];
      unidadesFiltradas = await findUnidadesForSetorPageByIdsSelectLean(uids);
    }
  }

  return {
    setoresFiltrados,
    unidadesFiltradas,
    user: req.user,
  };
}
