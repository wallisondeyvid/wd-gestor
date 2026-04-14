import { findClusterUnidadesByAnchorLeanData } from '#modules/gestor/app/data/unidades/unidadesClusterDataFacade.js';

export async function findClusterUnidadesByAnchorService(anchorRaw) {
  return findClusterUnidadesByAnchorLeanData(anchorRaw);
}

export default findClusterUnidadesByAnchorService;