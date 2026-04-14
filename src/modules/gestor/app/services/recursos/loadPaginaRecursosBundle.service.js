import {
  findAllUnidadesLeanForRecursosPageData,
  findUnidadesPrincipaisLeanForRecursosPageData,
} from '#modules/gestor/app/data/recursos/recursosPageBundleDataFacade.js';

export async function loadPaginaRecursosBundle({
  req,
  privilegedUser,
  loadScopedUnidadeForPage,
}) {
  const unidadeContextual = await loadScopedUnidadeForPage(req);
  let unidadesFiltradas = unidadeContextual ? [unidadeContextual] : [];

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
    // Fallback legado isolado: sessão privilegiada ainda sem unitScope contextual ativo.
    unidadesFiltradas = await findAllUnidadesLeanForRecursosPageData();
  }

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
    const matrizes = await findUnidadesPrincipaisLeanForRecursosPageData();
    if (matrizes?.length) unidadesFiltradas = matrizes;
  }

  return {
    unidadesFiltradas,
    user: req.user || { nome: 'Usuário Desconhecido', id: null },
  };
}
