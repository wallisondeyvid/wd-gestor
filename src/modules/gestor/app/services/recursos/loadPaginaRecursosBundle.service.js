import {
  findAllUnidadesLean,
  findUnidadesPrincipaisLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function loadPaginaRecursosBundle({
  req,
  privilegedUser,
  loadScopedUnidadeForPage,
}) {
  const unidadeContextual = await loadScopedUnidadeForPage(req);
  let unidadesFiltradas = unidadeContextual ? [unidadeContextual] : [];

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
    // Fallback legado isolado: sessão privilegiada ainda sem unitScope contextual ativo.
    unidadesFiltradas = await findAllUnidadesLean();
  }

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
    const matrizes = await findUnidadesPrincipaisLean();
    if (matrizes?.length) unidadesFiltradas = matrizes;
  }

  return {
    unidadesFiltradas,
    user: req.user || { nome: 'Usuário Desconhecido', id: null },
  };
}
